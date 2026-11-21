import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.ts';
import {
  accesoEstudiante,
  curso,
  estudianteRef,
  inscripcionCurso,
  invitacionAula,
  notificacionAula,
  users,
} from '../../db/schema.ts';
import { resetDemoExamTestData } from '../../db/seed.ts';
import { requireAuth, requireRole, type AuthRequest } from '../../middleware/auth.ts';
import { enqueueOutboxEvent } from '../services/outbox.ts';

export const adminRouter = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateTempPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return result;
}

// GET /api/admin/usuarios — Panel de Administración: administradores, docentes, estudiantes, invitaciones y cursos
adminRouter.get(
  '/admin/usuarios',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;

      const [profesoresRows, estudiantesRows, accesosRows, inscripcionesRows, cursosRows, invRows] =
        await Promise.all([
          db
            .select()
            .from(users)
            .where(and(eq(users.tenantId, tenantId), inArray(users.rol, ['ADMIN', 'PROFESOR'])))
            .orderBy(asc(users.rol), desc(users.createdAt)),
          db
            .select()
            .from(estudianteRef)
            .where(eq(estudianteRef.tenantId, tenantId))
            .orderBy(asc(estudianteRef.apellidos), asc(estudianteRef.nombres)),
          db.select().from(accesoEstudiante).where(eq(accesoEstudiante.tenantId, tenantId)),
          db.select().from(inscripcionCurso).where(eq(inscripcionCurso.tenantId, tenantId)),
          db
            .select({
              id: curso.id,
              nombre: curso.nombre,
              nivel: curso.nivel,
              profesorId: curso.profesorId,
              profesorNombre: curso.profesorNombre,
            })
            .from(curso)
            .where(eq(curso.tenantId, tenantId))
            .orderBy(asc(curso.nombre)),
          db
            .select()
            .from(invitacionAula)
            .where(eq(invitacionAula.tenantId, tenantId))
            .orderBy(desc(invitacionAula.createdAt))
            .limit(40),
        ]);

      const cursoMap = new Map(cursosRows.map((c) => [c.id, c]));
      const accesoMap = new Map(accesosRows.map((a) => [a.estudianteId, a]));

      const profesores = profesoresRows.map((p) => ({
        id: p.id,
        uid: p.uid,
        username: p.username || p.email.split('@')[0],
        email: p.email,
        nombre: p.nombre,
        rol: p.rol,
        activo: p.activo,
        etiquetaEstado: p.etiquetaEstado || (p.activo ? 'Activo' : 'Inactivo'),
        hasPassword: Boolean(p.passwordHash),
        cursosAsignados: cursosRows.filter((c) => c.profesorNombre === p.nombre).length,
        createdAt: p.createdAt.toISOString(),
      }));

      const estudiantes = estudiantesRows.map((est) => {
        const acc = accesoMap.get(est.id);
        return {
          ...est,
          etiquetaEstado: est.etiquetaEstado || (est.estado === 'ACTIVO' ? 'Al día' : 'Inactivo'),
          accesoActivo: est.estado === 'ACTIVO' && (acc ? acc.activo : true),
          hasPassword: Boolean(acc?.passwordHash),
          identificadorAcceso: acc?.identificador || est.numeroContrato || null,
          inscripciones: inscripcionesRows
            .filter((i) => i.estudianteId === est.id)
            .map((i) => ({
              inscripcionId: i.id,
              cursoId: i.cursoId,
              cursoNombre: cursoMap.get(i.cursoId)?.nombre || 'Curso',
              estado: i.estado,
            })),
        };
      });

      const invitaciones = invRows.map((inv) => ({
        id: inv.id,
        email: inv.email,
        nombre: inv.nombre,
        rol: inv.rol,
        cursoId: inv.cursoId,
        cursoNombre: inv.cursoId ? cursoMap.get(inv.cursoId)?.nombre || null : null,
        codigoAcceso: inv.codigoAcceso,
        token: inv.token,
        estado: inv.estado,
        createdAt: inv.createdAt.toISOString(),
        aceptadaEn: inv.aceptadaEn ? inv.aceptadaEn.toISOString() : null,
      }));

      return res.json({
        profesores,
        estudiantes,
        invitaciones,
        cursos: cursosRows.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          nivel: c.nivel,
          profesorNombre: c.profesorNombre,
        })),
      });
    } catch (error) {
      console.error('Error loading admin usuarios:', error);
      return res.status(500).json({ error: 'No se pudo cargar la gestión de usuarios.' });
    }
  },
);

// POST /api/admin/profesores — Agregar docente o administrador con usuario y contraseña
adminRouter.post(
  '/admin/profesores',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, sub } = req.aulaUser!;
      const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
      const rol = req.body?.rol === 'ADMIN' ? 'ADMIN' : 'PROFESOR';
      const rawPassword = typeof req.body?.password === 'string' ? req.body.password.trim() : '';

      if (nombre.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Ingresa un nombre válido y correo institucional.' });
      }
      if (rawPassword && rawPassword.length < 6) {
        return res
          .status(400)
          .json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      }

      const [existing] = await db
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.email, email)))
        .limit(1);
      if (existing) {
        return res.status(409).json({ error: 'Ya existe un usuario registrado con este correo.' });
      }

      const username = (rawUsername || email.split('@')[0]).replace(/[^a-z0-9._-]/g, '').slice(0, 80);
      const passwordTemporal = rawPassword || generateTempPassword(10);
      const passwordHash = await bcrypt.hash(passwordTemporal, 10);

      const [created] = await db
        .insert(users)
        .values({
          uid: `${rol === 'ADMIN' ? 'admin' : 'prof'}-${crypto.randomUUID()}`,
          username: username || null,
          email,
          nombre: nombre.slice(0, 150),
          passwordHash,
          tenantId,
          rol,
          activo: true,
          etiquetaEstado: 'Activo',
        })
        .returning();

      const token = crypto.randomBytes(20).toString('hex');
      const [inv] = await db
        .insert(invitacionAula)
        .values({
          tenantId,
          email,
          nombre: created.nombre,
          rol,
          token,
          estado: 'ENVIADA',
          enviadoPor: sub,
        })
        .returning();

      await enqueueOutboxEvent(tenantId, 'invitacion.docente', {
        tenantId,
        email,
        nombre: created.nombre,
        rol,
        invitacionId: inv.id,
      });

      return res.status(201).json({
        profesor: {
          id: created.id,
          uid: created.uid,
          username: created.username || created.email.split('@')[0],
          email: created.email,
          nombre: created.nombre,
          rol: created.rol,
          activo: created.activo,
          etiquetaEstado: created.etiquetaEstado || 'Activo',
          hasPassword: true,
          cursosAsignados: 0,
          createdAt: created.createdAt.toISOString(),
        },
        passwordTemporal,
        invitacion: inv,
      });
    } catch (error) {
      console.error('Error creating profesor:', error);
      return res.status(500).json({ error: 'No se pudo agregar al usuario.' });
    }
  },
);

// PATCH /api/admin/profesores/:id/estado — Activar o desactivar docente/admin con etiqueta
adminRouter.patch(
  '/admin/profesores/:id/estado',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, sub } = req.aulaUser!;
      const profId = Number(req.params.id);
      if (!Number.isInteger(profId) || profId <= 0) {
        return res.status(400).json({ error: 'Identificador de usuario inválido.' });
      }

      const activo = Boolean(req.body?.activo);
      const etiquetaEstado =
        typeof req.body?.etiquetaEstado === 'string' && req.body.etiquetaEstado.trim()
          ? req.body.etiquetaEstado.trim().slice(0, 80)
          : activo
            ? 'Activo'
            : 'Inactivo';

      const [existing] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, profId), eq(users.tenantId, tenantId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }
      if (!activo && existing.uid === sub) {
        return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta de administrador.' });
      }

      const [updated] = await db
        .update(users)
        .set({ activo, etiquetaEstado })
        .where(and(eq(users.id, profId), eq(users.tenantId, tenantId)))
        .returning();

      return res.json({
        ok: true,
        profesor: {
          id: updated.id,
          activo: updated.activo,
          etiquetaEstado: updated.etiquetaEstado,
        },
      });
    } catch (error) {
      console.error('Error updating profesor status:', error);
      return res.status(500).json({ error: 'No se pudo actualizar el estado del usuario.' });
    }
  },
);

// POST /api/admin/profesores/:id/reset-password — Restablecer contraseña de docente/admin
adminRouter.post(
  '/admin/profesores/:id/reset-password',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const profId = Number(req.params.id);
      if (!Number.isInteger(profId) || profId <= 0) {
        return res.status(400).json({ error: 'Identificador de usuario inválido.' });
      }

      const rawPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword.trim() : '';
      if (rawPassword && rawPassword.length < 6) {
        return res
          .status(400)
          .json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      }

      const [existing] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, profId), eq(users.tenantId, tenantId)))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      const passwordTemporal = rawPassword || generateTempPassword(10);
      const passwordHash = await bcrypt.hash(passwordTemporal, 10);

      await db
        .update(users)
        .set({ passwordHash })
        .where(and(eq(users.id, profId), eq(users.tenantId, tenantId)));

      return res.json({
        ok: true,
        email: existing.email,
        username: existing.username || existing.email.split('@')[0],
        passwordTemporal,
      });
    } catch (error) {
      console.error('Error resetting profesor password:', error);
      return res.status(500).json({ error: 'No se pudo restablecer la contraseña.' });
    }
  },
);

// DELETE /api/admin/profesores/:id — Eliminar docente o administrador
adminRouter.delete(
  '/admin/profesores/:id',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, sub } = req.aulaUser!;
      const profId = Number(req.params.id);
      if (!Number.isInteger(profId) || profId <= 0) {
        return res.status(400).json({ error: 'Identificador de usuario inválido.' });
      }

      const [existing] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, profId), eq(users.tenantId, tenantId)))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }
      if (existing.uid === sub) {
        return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador.' });
      }

      await db
        .delete(users)
        .where(and(eq(users.id, profId), eq(users.tenantId, tenantId)));

      return res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting profesor:', error);
      return res.status(500).json({ error: 'No se pudo eliminar al usuario.' });
    }
  },
);

// POST /api/admin/estudiantes — Crear estudiante con contraseña inicial, inscribir opcionalmente e invitar
adminRouter.post(
  '/admin/estudiantes',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, sub } = req.aulaUser!;
      const nombres = typeof req.body?.nombres === 'string' ? req.body.nombres.trim() : '';
      const apellidos = typeof req.body?.apellidos === 'string' ? req.body.apellidos.trim() : '';
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const numeroContratoInput =
        typeof req.body?.numeroContrato === 'string' ? req.body.numeroContrato.trim() : '';
      const rawPassword = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
      const cursoId =
        typeof req.body?.cursoId === 'string' && UUID_REGEX.test(req.body.cursoId)
          ? req.body.cursoId
          : null;
      const requiereAprobacionDocente = req.body?.requiereAprobacionDocente !== false;

      if (nombres.length < 2 || apellidos.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res
          .status(400)
          .json({ error: 'Ingresa nombres, apellidos y un correo electrónico válido.' });
      }
      if (rawPassword && rawPassword.length < 6) {
        return res
          .status(400)
          .json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      }

      const numeroContrato =
        numeroContratoInput || `AULA-${crypto.randomInt(10000, 99999)}`;
      const estudianteId = crypto.randomUUID();
      const passwordTemporal = rawPassword || generateTempPassword(8);
      const codigoTemporal = String(crypto.randomInt(100000, 1000000));
      const [passwordHash, codigoHash] = await Promise.all([
        bcrypt.hash(passwordTemporal, 10),
        bcrypt.hash(codigoTemporal, 10),
      ]);

      const [createdEst] = await db
        .insert(estudianteRef)
        .values({
          id: estudianteId,
          tenantId,
          nombres: nombres.slice(0, 150),
          apellidos: apellidos.slice(0, 150),
          numeroContrato: numeroContrato.slice(0, 40),
          email: email.slice(0, 200),
          estado: 'ACTIVO',
          etiquetaEstado: 'Al día',
        })
        .returning();

      await db
        .insert(accesoEstudiante)
        .values({
          tenantId,
          estudianteId: createdEst.id,
          identificador: numeroContrato.slice(0, 40),
          codigoHash,
          passwordHash,
          codigoExpiraEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          activo: true,
          debeCambiar: false,
        })
        .onConflictDoNothing();

      let cursoNombre: string | null = null;
      let estadoInscripcion: 'PENDIENTE' | 'ACTIVO' | null = null;
      if (cursoId) {
        const [foundCurso] = await db
          .select()
          .from(curso)
          .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
          .limit(1);
        if (foundCurso) {
          cursoNombre = foundCurso.nombre;
          estadoInscripcion = requiereAprobacionDocente ? 'PENDIENTE' : 'ACTIVO';
          await db.insert(inscripcionCurso).values({
            tenantId,
            cursoId: foundCurso.id,
            estudianteId: createdEst.id,
            estado: estadoInscripcion,
            origen: 'ADMIN',
          });

          if (requiereAprobacionDocente && foundCurso.profesorId) {
            await db.insert(notificacionAula).values({
              tenantId,
              destinatarioRol: 'DOCENTE',
              destinatarioId: foundCurso.profesorId,
              tipo: 'ACADEMICO',
              titulo: 'Nueva matrícula pendiente de aprobación',
              mensaje: `${createdEst.nombres} ${createdEst.apellidos} fue invitado al curso "${foundCurso.nombre}". Aprueba su acceso en Participantes.`,
              accionNav: 'mis-cursos',
            });
          }
        }
      }

      const token = crypto.randomBytes(20).toString('hex');
      const [inv] = await db
        .insert(invitacionAula)
        .values({
          tenantId,
          email,
          nombre: `${createdEst.nombres} ${createdEst.apellidos}`,
          rol: 'ESTUDIANTE',
          cursoId,
          estudianteId: createdEst.id,
          codigoAcceso: codigoTemporal,
          token,
          estado: 'ENVIADA',
          enviadoPor: sub,
        })
        .returning();

      await enqueueOutboxEvent(tenantId, 'invitacion.estudiante', {
        tenantId,
        estudianteId: createdEst.id,
        email,
        nombre: `${createdEst.nombres} ${createdEst.apellidos}`,
        identificador: numeroContrato,
        cursoId,
        cursoNombre,
        estadoInscripcion,
        invitacionId: inv.id,
      });

      return res.status(201).json({
        estudiante: createdEst,
        identificadorAcceso: numeroContrato,
        passwordTemporal,
        codigoAcceso: codigoTemporal,
        estadoInscripcion,
        invitacion: inv,
      });
    } catch (error) {
      console.error('Error creating estudiante:', error);
      return res.status(500).json({ error: 'No se pudo registrar al estudiante.' });
    }
  },
);

// PATCH /api/admin/estudiantes/:id/estado — Activar o desactivar estudiante con etiqueta de estado/pago
adminRouter.patch(
  '/admin/estudiantes/:id/estado',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const estudianteId = String(req.params.id);
      if (!UUID_REGEX.test(estudianteId)) {
        return res.status(400).json({ error: 'Identificador de estudiante inválido.' });
      }

      const activo = Boolean(req.body?.activo);
      const etiquetaEstado =
        typeof req.body?.etiquetaEstado === 'string' && req.body.etiquetaEstado.trim()
          ? req.body.etiquetaEstado.trim().slice(0, 80)
          : activo
            ? 'Al día'
            : 'Pago pendiente';

      const [updated] = await db
        .update(estudianteRef)
        .set({
          estado: activo ? 'ACTIVO' : 'INACTIVO',
          etiquetaEstado,
          actualizadoEn: new Date(),
        })
        .where(and(eq(estudianteRef.id, estudianteId), eq(estudianteRef.tenantId, tenantId)))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Estudiante no encontrado.' });
      }

      await db
        .update(accesoEstudiante)
        .set({ activo })
        .where(
          and(
            eq(accesoEstudiante.estudianteId, estudianteId),
            eq(accesoEstudiante.tenantId, tenantId),
          ),
        );

      return res.json({
        ok: true,
        estudiante: {
          ...updated,
          accesoActivo: activo,
        },
      });
    } catch (error) {
      console.error('Error updating estudiante status:', error);
      return res.status(500).json({ error: 'No se pudo actualizar el estado del estudiante.' });
    }
  },
);

// POST /api/admin/estudiantes/:id/reset-password — Restablecer contraseña de estudiante
adminRouter.post(
  '/admin/estudiantes/:id/reset-password',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const estudianteId = String(req.params.id);
      if (!UUID_REGEX.test(estudianteId)) {
        return res.status(400).json({ error: 'Identificador de estudiante inválido.' });
      }

      const rawPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword.trim() : '';
      if (rawPassword && rawPassword.length < 6) {
        return res
          .status(400)
          .json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      }

      const [est] = await db
        .select()
        .from(estudianteRef)
        .where(and(eq(estudianteRef.id, estudianteId), eq(estudianteRef.tenantId, tenantId)))
        .limit(1);

      if (!est) {
        return res.status(404).json({ error: 'Estudiante no encontrado.' });
      }

      const passwordTemporal = rawPassword || generateTempPassword(8);
      const passwordHash = await bcrypt.hash(passwordTemporal, 10);

      const [existingAcc] = await db
        .select()
        .from(accesoEstudiante)
        .where(
          and(
            eq(accesoEstudiante.estudianteId, estudianteId),
            eq(accesoEstudiante.tenantId, tenantId),
          ),
        )
        .limit(1);

      let identificadorAcceso = est.numeroContrato || est.email || estudianteId.slice(0, 8);

      if (existingAcc) {
        identificadorAcceso = existingAcc.identificador;
        await db
          .update(accesoEstudiante)
          .set({
            passwordHash,
            intentosFallidos: 0,
            bloqueadoHasta: null,
          })
          .where(eq(accesoEstudiante.id, existingAcc.id));
      } else {
        await db.insert(accesoEstudiante).values({
          tenantId,
          estudianteId,
          identificador: identificadorAcceso.slice(0, 40),
          codigoHash: passwordHash,
          passwordHash,
          activo: est.estado === 'ACTIVO',
          debeCambiar: false,
        });
      }

      return res.json({
        ok: true,
        email: est.email,
        identificadorAcceso,
        passwordTemporal,
      });
    } catch (error) {
      console.error('Error resetting estudiante password:', error);
      return res.status(500).json({ error: 'No se pudo restablecer la contraseña del estudiante.' });
    }
  },
);

// DELETE /api/admin/estudiantes/:id — Eliminar estudiante del aula
adminRouter.delete(
  '/admin/estudiantes/:id',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const estudianteId = String(req.params.id);
      if (!UUID_REGEX.test(estudianteId)) {
        return res.status(400).json({ error: 'Identificador de estudiante inválido.' });
      }

      const deleted = await db
        .delete(estudianteRef)
        .where(and(eq(estudianteRef.id, estudianteId), eq(estudianteRef.tenantId, tenantId)))
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Estudiante no encontrado.' });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting estudiante:', error);
      return res.status(500).json({ error: 'No se pudo eliminar al estudiante.' });
    }
  },
);

// POST /api/admin/demo/reset-examenes — Recarga información demo para probar exámenes, protocolo 48h y aprobaciones
adminRouter.post(
  '/admin/demo/reset-examenes',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (_req: AuthRequest, res) => {
    try {
      const summary = await resetDemoExamTestData();
      return res.json({
        ok: true,
        mensaje: 'Datos de prueba de exámenes, entregas (protocolo 48h) y matrículas recargados correctamente.',
        ...summary,
      });
    } catch (error) {
      console.error('Error resetting demo exam test data:', error);
      return res.status(500).json({ error: 'No se pudieron recargar los datos de prueba.' });
    }
  },
);
