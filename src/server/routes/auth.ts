import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../../db/index.ts';
import {
  accesoEstudiante,
  estudianteRef,
  invitacionAula,
  tenantRef,
  users,
} from '../../db/schema.ts';
import {
  DEMO_ADMIN_ID,
  DEMO_PROFESSOR_ID,
  DEMO_STUDENT_MATEO_ID,
  ensureSeedData,
} from '../../db/seed.ts';
import { DEFAULT_TENANT_ID } from '../../db/users.ts';
import {
  clearSessionCookie,
  getJwtSecret,
  getSsoTicketSecret,
  requireAuth,
  setSessionCookie,
  signAulaSessionToken,
  verifyAccountActive,
  type AulaRol,
  type AuthRequest,
} from '../../middleware/auth.ts';
import { createRateLimiter } from '../../middleware/rate-limit.ts';
import { enqueueOutboxEvent } from '../services/outbox.ts';

export const authRouter = Router();

const studentAuthLimiter = createRateLimiter(15, 60 * 1000);
const credentialsAuthLimiter = createRateLimiter(15, 60 * 1000);
const usedSsoTickets = new Map<string, number>();

function cleanUsedTickets() {
  const now = Date.now();
  for (const [k, exp] of usedSsoTickets.entries()) {
    if (exp < now) usedSsoTickets.delete(k);
  }
}

// POST /api/auth/login — Acceso unificado con usuario/correo/cédula y contraseña para Admin, Docente y Estudiante
authRouter.post('/auth/login', credentialsAuthLimiter, async (req, res) => {
  try {
    await ensureSeedData();
    const rawIdentifier =
      typeof req.body?.usuario === 'string'
        ? req.body.usuario.trim()
        : typeof req.body?.email === 'string'
          ? req.body.email.trim()
          : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: 'Ingresa tu usuario o correo y tu contraseña.' });
    }

    const normalized = rawIdentifier.toLowerCase();

    // 1. Buscar en personal administrativo y docente (tabla users)
    const [staff] = await db
      .select()
      .from(users)
      .where(
        or(
          sql`lower(${users.email}) = ${normalized}`,
          sql`lower(coalesce(${users.username}, '')) = ${normalized}`,
        ),
      )
      .limit(1);

    if (staff) {
      if (!staff.passwordHash) {
        return res.status(401).json({
          error: 'Tu cuenta aún no tiene contraseña asignada. Solicita restablecimiento al administrador.',
        });
      }

      const validPassword = await bcrypt.compare(password, staff.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      }

      if (!staff.activo) {
        const tag = staff.etiquetaEstado || 'Cuenta desactivada';
        return res.status(403).json({
          error: `Tu cuenta se encuentra inactiva (${tag}). Contacta con administración de All American English.`,
          accountInactive: true,
        });
      }

      const sessionSub =
        staff.uid === 'demo-prof-carolina'
          ? DEMO_PROFESSOR_ID
          : staff.uid || `user-${staff.id}`;

      const sessionUser = {
        sub: sessionSub,
        tenantId: staff.tenantId,
        rol: (staff.rol === 'ADMIN' ? 'ADMIN' : 'PROFESOR') as AulaRol,
        nombre: staff.nombre,
        email: staff.email,
        provider: 'sso' as const,
      };

      const accessToken = signAulaSessionToken(sessionUser);
      setSessionCookie(res, accessToken);
      return res.json({ usuario: sessionUser, accessToken });
    }

    // 2. Buscar en estudiantes (por correo, cédula/identificador o número de contrato)
    const studentMatches = await db
      .select({
        estudiante: estudianteRef,
        acceso: accesoEstudiante,
      })
      .from(estudianteRef)
      .leftJoin(accesoEstudiante, eq(accesoEstudiante.estudianteId, estudianteRef.id))
      .where(
        or(
          sql`lower(coalesce(${estudianteRef.email}, '')) = ${normalized}`,
          sql`lower(coalesce(${estudianteRef.numeroContrato}, '')) = ${normalized}`,
          sql`lower(coalesce(${accesoEstudiante.identificador}, '')) = ${normalized}`,
        ),
      )
      .limit(1);

    const match = studentMatches[0];
    if (!match) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const { estudiante: est, acceso } = match;

    if (acceso?.bloqueadoHasta && acceso.bloqueadoHasta.getTime() > Date.now()) {
      return res.status(423).json({
        error: 'Acceso bloqueado temporalmente por 15 minutos tras varios intentos fallidos.',
      });
    }

    // Verificar contraseña primero contra passwordHash y opcionalmente contra codigoHash
    let validStudentCred = false;
    if (acceso?.passwordHash) {
      validStudentCred = await bcrypt.compare(password, acceso.passwordHash);
    }
    if (!validStudentCred && acceso?.codigoHash) {
      const notExpired = !acceso.codigoExpiraEn || acceso.codigoExpiraEn.getTime() >= Date.now();
      if (notExpired) {
        validStudentCred = await bcrypt.compare(password, acceso.codigoHash);
      }
    }

    if (!validStudentCred) {
      if (acceso) {
        const nextFails = acceso.intentosFallidos + 1;
        const lockedUntil = nextFails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        await db
          .update(accesoEstudiante)
          .set({ intentosFallidos: nextFails, bloqueadoHasta: lockedUntil })
          .where(eq(accesoEstudiante.id, acceso.id));
      }
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    if (est.estado !== 'ACTIVO' || (acceso && !acceso.activo)) {
      const tag = est.etiquetaEstado || 'Pago pendiente / Inactivo';
      return res.status(403).json({
        error: `Tu cuenta se encuentra inactiva (${tag}). Contacta con administración de All American English para reactivar tu acceso.`,
        accountInactive: true,
      });
    }

    if (acceso) {
      await db
        .update(accesoEstudiante)
        .set({
          intentosFallidos: 0,
          bloqueadoHasta: null,
          ultimoAcceso: new Date(),
        })
        .where(eq(accesoEstudiante.id, acceso.id));
    }

    await db
      .update(invitacionAula)
      .set({ estado: 'ACEPTADA', aceptadaEn: new Date() })
      .where(
        and(
          eq(invitacionAula.tenantId, est.tenantId),
          eq(invitacionAula.estudianteId, est.id),
          eq(invitacionAula.estado, 'ENVIADA'),
        ),
      );

    const sessionUser = {
      sub: est.id,
      tenantId: est.tenantId,
      rol: 'ESTUDIANTE' as const,
      nombre: `${est.nombres} ${est.apellidos}`,
      email: est.email || '',
      estudianteId: est.id,
      provider: 'estudiante' as const,
    };

    const accessToken = signAulaSessionToken(sessionUser);
    setSessionCookie(res, accessToken);
    return res.json({ usuario: sessionUser, accessToken });
  } catch (error) {
    console.error('Error en login con credenciales:', error);
    return res.status(500).json({ error: 'No se pudo iniciar sesión en este momento.' });
  }
});

// Canje de ticket SSO de un solo uso emitido por ALLEN
authRouter.post('/auth/canjear', async (req, res) => {
  try {
    const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket.trim() : '';
    if (!ticket) {
      return res.status(400).json({ error: 'Debes proporcionar un ticket SSO válido.' });
    }

    cleanUsedTickets();
    if (usedSsoTickets.has(ticket)) {
      return res.status(401).json({ error: 'Este ticket ya fue utilizado.' });
    }

    const decoded = jwt.verify(ticket, getSsoTicketSecret(), {
      algorithms: ['HS256'],
      audience: 'aula',
    }) as {
      sub?: string;
      email?: string;
      tenantId?: string;
      rol?: AulaRol;
      nombre?: string;
    };

    if (!decoded.sub || !decoded.tenantId || !decoded.rol) {
      return res.status(401).json({ error: 'Ticket SSO incompleto.' });
    }

    usedSsoTickets.set(ticket, Date.now() + 120 * 1000);

    await ensureSeedData();
    await db
      .insert(tenantRef)
      .values({ id: decoded.tenantId, nombre: 'All American English' })
      .onConflictDoNothing();

    const sessionUser = {
      sub: decoded.sub,
      tenantId: decoded.tenantId,
      rol: decoded.rol,
      nombre: decoded.nombre || decoded.email || 'Usuario ALLEN',
      email: decoded.email || '',
      provider: 'sso' as const,
    };

    const accessToken = signAulaSessionToken(sessionUser);
    setSessionCookie(res, accessToken);
    return res.json({ usuario: sessionUser, accessToken });
  } catch (error) {
    console.error('SSO ticket exchange error:', error);
    return res.status(401).json({ error: 'Ticket SSO inválido o vencido.' });
  }
});

// Solicitud de código de 6 dígitos para estudiante (siempre 202 para evitar enumeración)
authRouter.post('/auth/estudiante/codigo', studentAuthLimiter, async (req, res) => {
  try {
    await ensureSeedData();
    const identificador =
      typeof req.body?.identificador === 'string' ? req.body.identificador.trim() : '';

    if (identificador.length >= 4 && identificador.length <= 40) {
      const [acceso] = await db
        .select()
        .from(accesoEstudiante)
        .where(
          and(
            eq(accesoEstudiante.identificador, identificador),
            eq(accesoEstudiante.activo, true),
          ),
        )
        .limit(1);

      if (acceso) {
        const codigo = String(crypto.randomInt(100000, 1000000));
        const codigoHash = await bcrypt.hash(codigo, 10);
        const expiraEn = new Date(Date.now() + 10 * 60 * 1000);

        await db
          .update(accesoEstudiante)
          .set({
            codigoHash,
            codigoExpiraEn: expiraEn,
            intentosFallidos: 0,
            bloqueadoHasta: null,
          })
          .where(eq(accesoEstudiante.id, acceso.id));

        await enqueueOutboxEvent(acceso.tenantId, 'mensaje.codigo', {
          tenantId: acceso.tenantId,
          estudianteId: acceso.estudianteId,
          canal: 'WHATSAPP',
          plantilla: 'CODIGO_AULA',
          datos: { vigenciaMinutos: 10 },
        });
      }
    }

    return res.status(202).json({ enviado: true });
  } catch (error) {
    console.error('Error generando código estudiante:', error);
    return res.status(202).json({ enviado: true });
  }
});

// Login de estudiante con identificador + código de 6 dígitos (bloqueo tras 5 fallos por 15 min)
authRouter.post('/auth/estudiante/entrar', studentAuthLimiter, async (req, res) => {
  try {
    await ensureSeedData();
    const identificador =
      typeof req.body?.identificador === 'string' ? req.body.identificador.trim() : '';
    const codigo = typeof req.body?.codigo === 'string' ? req.body.codigo.trim() : '';

    if (!identificador || !codigo) {
      return res.status(401).json({ error: 'Identificador o código inválido.' });
    }

    const [acceso] = await db
      .select()
      .from(accesoEstudiante)
      .where(eq(accesoEstudiante.identificador, identificador))
      .limit(1);

    if (!acceso) {
      return res.status(401).json({ error: 'Identificador o código inválido.' });
    }

    if (acceso.bloqueadoHasta && acceso.bloqueadoHasta.getTime() > Date.now()) {
      return res.status(423).json({
        error: 'Acceso bloqueado temporalmente por 15 minutos tras 5 intentos fallidos.',
      });
    }

    if (acceso.codigoExpiraEn && acceso.codigoExpiraEn.getTime() < Date.now()) {
      return res.status(401).json({ error: 'El código ha expirado. Solicita uno nuevo.' });
    }

    const valid = await bcrypt.compare(codigo, acceso.codigoHash);
    if (!valid) {
      const nextFails = acceso.intentosFallidos + 1;
      const lockedUntil = nextFails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db
        .update(accesoEstudiante)
        .set({
          intentosFallidos: nextFails,
          bloqueadoHasta: lockedUntil,
        })
        .where(eq(accesoEstudiante.id, acceso.id));

      return res.status(401).json({ error: 'Identificador o código inválido.' });
    }

    const [est] = await db
      .select()
      .from(estudianteRef)
      .where(
        and(eq(estudianteRef.id, acceso.estudianteId), eq(estudianteRef.tenantId, acceso.tenantId)),
      )
      .limit(1);

    if (!est) {
      return res.status(401).json({ error: 'Estudiante no habilitado en el aula.' });
    }

    if (est.estado !== 'ACTIVO' || !acceso.activo) {
      const tag = est.etiquetaEstado || 'Cuenta inactiva';
      return res.status(403).json({
        error: `Tu cuenta se encuentra inactiva (${tag}). Contacta con administración de All American English.`,
        accountInactive: true,
      });
    }

    await db
      .update(accesoEstudiante)
      .set({
        intentosFallidos: 0,
        bloqueadoHasta: null,
        ultimoAcceso: new Date(),
      })
      .where(eq(accesoEstudiante.id, acceso.id));

    await db
      .update(invitacionAula)
      .set({ estado: 'ACEPTADA', aceptadaEn: new Date() })
      .where(
        and(
          eq(invitacionAula.tenantId, acceso.tenantId),
          eq(invitacionAula.estudianteId, est.id),
          eq(invitacionAula.estado, 'ENVIADA'),
        ),
      );

    const sessionUser = {
      sub: est.id,
      tenantId: acceso.tenantId,
      rol: 'ESTUDIANTE' as const,
      nombre: `${est.nombres} ${est.apellidos}`,
      email: est.email || '',
      estudianteId: est.id,
      provider: 'estudiante' as const,
    };

    const accessToken = signAulaSessionToken(sessionUser);
    setSessionCookie(res, accessToken);
    return res.json({ usuario: sessionUser, accessToken });
  } catch (error) {
    console.error('Error en login de estudiante:', error);
    return res.status(500).json({ error: 'No se pudo iniciar sesión en este momento.' });
  }
});

// Acceso rápido de evaluación/vista previa (con respaldo real en PostgreSQL)
authRouter.post('/auth/demo-session', async (req, res) => {
  try {
    await ensureSeedData();
    const rolSolicitado =
      req.body?.rol === 'ADMIN'
        ? 'ADMIN'
        : req.body?.rol === 'ESTUDIANTE'
          ? 'ESTUDIANTE'
          : 'PROFESOR';

    if (rolSolicitado === 'ADMIN') {
      const sessionUser = {
        sub: DEMO_ADMIN_ID,
        tenantId: DEFAULT_TENANT_ID,
        rol: 'ADMIN' as const,
        nombre: 'Administrador All American English',
        email: 'admin@allamericanenglish.edu.ec',
        provider: 'demo' as const,
      };
      const accessToken = signAulaSessionToken(sessionUser);
      setSessionCookie(res, accessToken);
      return res.json({ usuario: sessionUser, accessToken });
    }

    if (rolSolicitado === 'ESTUDIANTE') {
      const [est] = await db
        .select()
        .from(estudianteRef)
        .where(
          and(
            eq(estudianteRef.id, DEMO_STUDENT_MATEO_ID),
            eq(estudianteRef.tenantId, DEFAULT_TENANT_ID),
          ),
        )
        .limit(1);

      if (est && est.estado !== 'ACTIVO') {
        return res.status(403).json({
          error: `Tu cuenta se encuentra inactiva (${est.etiquetaEstado || 'Acceso suspendido'}).`,
          accountInactive: true,
        });
      }

      const sessionUser = {
        sub: DEMO_STUDENT_MATEO_ID,
        tenantId: DEFAULT_TENANT_ID,
        rol: 'ESTUDIANTE' as const,
        nombre: est ? `${est.nombres} ${est.apellidos}` : 'Mateo Alejandro Villa Huanca',
        email: est?.email || 'mateo.villa@estudiantes.allen.edu.ec',
        estudianteId: DEMO_STUDENT_MATEO_ID,
        provider: 'demo' as const,
      };
      const accessToken = signAulaSessionToken(sessionUser);
      setSessionCookie(res, accessToken);
      return res.json({ usuario: sessionUser, accessToken });
    }

    const sessionUser = {
      sub: DEMO_PROFESSOR_ID,
      tenantId: DEFAULT_TENANT_ID,
      rol: 'PROFESOR' as const,
      nombre: 'Lcda. Carolina Andrade',
      email: 'carolina.andrade@allamericanenglish.edu.ec',
      provider: 'demo' as const,
    };
    const accessToken = signAulaSessionToken(sessionUser);
    setSessionCookie(res, accessToken);
    return res.json({ usuario: sessionUser, accessToken });
  } catch (error) {
    console.error('Error iniciando sesión de vista previa:', error);
    return res.status(500).json({ error: 'No se pudo iniciar la sesión.' });
  }
});

// Comprobación silenciosa de sesión para arranque SPA (evita 401 en consola al abrir / sin sesión)
authRouter.get('/auth/sesion', async (req, res) => {
  try {
    const cookieToken = req.cookies?.aula_session as string | undefined;
    if (!cookieToken) {
      return res.json({ autenticado: false, usuario: null, tenant: null });
    }
    const decoded = jwt.verify(cookieToken, getJwtSecret(), {
      algorithms: ['HS256'],
    }) as {
      sub?: string;
      tenantId?: string;
      rol?: AulaRol;
      nombre?: string;
      email?: string;
      estudianteId?: string;
      provider?: 'firebase' | 'sso' | 'estudiante' | 'demo';
    };
    if (!decoded.sub || !decoded.tenantId || !decoded.rol) {
      return res.json({ autenticado: false, usuario: null, tenant: null });
    }
    await ensureSeedData();
    const sessionUser = {
      sub: decoded.sub,
      tenantId: decoded.tenantId,
      rol: decoded.rol,
      nombre: decoded.nombre || 'Usuario ALLEN',
      email: decoded.email || '',
      estudianteId: decoded.estudianteId,
      provider: decoded.provider || ('sso' as const),
    };

    const status = await verifyAccountActive(sessionUser);
    if (!status.active) {
      clearSessionCookie(res);
      return res.json({
        autenticado: false,
        usuario: null,
        tenant: null,
        motivoDesactivacion: status.reason,
      });
    }

    const [tenant] = await db
      .select()
      .from(tenantRef)
      .where(eq(tenantRef.id, decoded.tenantId))
      .limit(1);

    return res.json({
      autenticado: true,
      usuario: sessionUser,
      tenant: tenant || { id: decoded.tenantId, nombre: 'All American English' },
    });
  } catch {
    return res.json({ autenticado: false, usuario: null, tenant: null });
  }
});

authRouter.get('/auth/yo', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeedData();
    const user = req.aulaUser!;
    const [tenant] = await db
      .select()
      .from(tenantRef)
      .where(eq(tenantRef.id, user.tenantId))
      .limit(1);

    return res.json({
      usuario: user,
      tenant: tenant || { id: user.tenantId, nombre: 'All American English' },
    });
  } catch (error) {
    console.error('Error fetching /auth/yo:', error);
    return res.status(500).json({ error: 'No se pudo obtener el perfil de sesión.' });
  }
});

authRouter.post('/auth/salir', (_req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});
