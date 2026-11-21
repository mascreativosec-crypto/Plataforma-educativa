import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { accesoEstudiante, estudianteRef, users } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DEFAULT_TENANT_ID, getOrCreateUser } from '../db/users.ts';
import { DEMO_PROFESSOR_ID } from '../db/seed.ts';

export type AulaRol = 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE';

export interface AulaSessionUser {
  sub: string;
  tenantId: string;
  rol: AulaRol;
  nombre: string;
  email: string;
  estudianteId?: string;
  provider: 'firebase' | 'sso' | 'estudiante' | 'demo';
}

export interface AuthRequest extends Request {
  aulaUser?: AulaSessionUser;
  rawBody?: Buffer;
}

const RUNTIME_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

export function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET;
  if (configured && configured.length >= 32) {
    return configured;
  }
  return RUNTIME_FALLBACK_SECRET;
}

export function getSsoTicketSecret(): string {
  return process.env.SSO_TICKET_SECRET || getJwtSecret();
}

export function signAulaSessionToken(user: AulaSessionUser): string {
  return jwt.sign(
    {
      sub: user.sub,
      tenantId: user.tenantId,
      rol: user.rol,
      nombre: user.nombre,
      email: user.email,
      estudianteId: user.estudianteId,
      provider: user.provider,
    },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: '2h' },
  );
}

function isHttpsRequest(res: Response): boolean {
  const req = res.req;
  if (!req) return process.env.NODE_ENV === 'production';
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return Boolean(req.secure || proto?.split(',')[0]?.trim() === 'https');
}

export function setSessionCookie(res: Response, token: string): void {
  const secure = isHttpsRequest(res);
  res.cookie('aula_session', token, {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  const secure = isHttpsRequest(res);
  res.clearCookie('aula_session', {
    path: '/',
    sameSite: secure ? 'none' : 'lax',
    secure,
  });
}

export async function verifyAccountActive(
  user: AulaSessionUser,
): Promise<{ active: true } | { active: false; reason: string }> {
  try {
    if (user.rol === 'ESTUDIANTE') {
      const estId = user.estudianteId || user.sub;
      const [est] = await db
        .select({
          estado: estudianteRef.estado,
          etiquetaEstado: estudianteRef.etiquetaEstado,
        })
        .from(estudianteRef)
        .where(and(eq(estudianteRef.id, estId), eq(estudianteRef.tenantId, user.tenantId)))
        .limit(1);

      const [acc] = await db
        .select({ activo: accesoEstudiante.activo })
        .from(accesoEstudiante)
        .where(
          and(
            eq(accesoEstudiante.estudianteId, estId),
            eq(accesoEstudiante.tenantId, user.tenantId),
          ),
        )
        .limit(1);

      if (est && (est.estado !== 'ACTIVO' || (acc && !acc.activo))) {
        const tag = est.etiquetaEstado || 'Cuenta inactiva';
        return {
          active: false,
          reason: `Tu cuenta se encuentra inactiva (${tag}). Contacta con administración de All American English.`,
        };
      }
      return { active: true };
    }

    const uidCandidates = [user.sub];
    if (user.sub === DEMO_PROFESSOR_ID) {
      uidCandidates.push('demo-prof-carolina');
    }

    const [staff] = await db
      .select({ activo: users.activo, etiquetaEstado: users.etiquetaEstado })
      .from(users)
      .where(
        and(
          eq(users.tenantId, user.tenantId),
          or(
            ...uidCandidates.map((uid) => eq(users.uid, uid)),
            ...(user.email ? [eq(users.email, user.email.toLowerCase())] : []),
          ),
        ),
      )
      .limit(1);

    if (staff && !staff.activo) {
      const tag = staff.etiquetaEstado || 'Cuenta desactivada';
      return {
        active: false,
        reason: `Tu acceso se encuentra inactivo (${tag}). Contacta con administración de All American English.`,
      };
    }

    return { active: true };
  } catch (err) {
    console.error('Error checking account active status:', err);
    return { active: true };
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const cookieToken = req.cookies?.aula_session as string | undefined;

  // 1. Try local Aula HS256 JWT (Bearer or HttpOnly cookie) first if valid
  const candidates = [bearerToken, cookieToken].filter((t): t is string => Boolean(t));
  for (const token of candidates) {
    try {
      const decoded = jwt.verify(token, getJwtSecret(), {
        algorithms: ['HS256'],
      }) as Partial<AulaSessionUser>;

      if (decoded.sub && decoded.tenantId && decoded.rol) {
        const sessionUser: AulaSessionUser = {
          sub: decoded.sub,
          tenantId: decoded.tenantId,
          rol: decoded.rol,
          nombre: decoded.nombre || 'Usuario ALLEN',
          email: decoded.email || '',
          estudianteId: decoded.estudianteId,
          provider: decoded.provider || 'sso',
        };
        const status = await verifyAccountActive(sessionUser);
        if (!status.active) {
          clearSessionCookie(res);
          return res.status(403).json({ error: status.reason, accountInactive: true });
        }
        req.aulaUser = sessionUser;
        return next();
      }
    } catch {
      // Not an Aula HS256 token; try Firebase ID token next
    }
  }

  // 2. Verify Firebase Auth ID token from Authorization: Bearer header
  if (bearerToken) {
    try {
      const decodedFirebase = await adminAuth.verifyIdToken(bearerToken);
      const email = decodedFirebase.email || `${decodedFirebase.uid}@allamericanenglish.edu.ec`;
      const nombre = decodedFirebase.name || email.split('@')[0];
      const dbUser = await getOrCreateUser(decodedFirebase.uid, email, nombre);

      if (dbUser && !dbUser.activo) {
        return res.status(403).json({
          error: `Tu acceso se encuentra inactivo (${dbUser.etiquetaEstado || 'Cuenta desactivada'}). Contacta con administración.`,
          accountInactive: true,
        });
      }

      req.aulaUser = {
        sub: DEMO_PROFESSOR_ID,
        tenantId: dbUser?.tenantId || DEFAULT_TENANT_ID,
        rol: (dbUser?.rol as AulaRol) || 'PROFESOR',
        nombre: dbUser?.nombre || nombre,
        email: dbUser?.email || email,
        provider: 'firebase',
      };
      return next();
    } catch (error) {
      console.error('Error verifying Firebase ID token:', error);
      return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' });
    }
  }

  return res.status(401).json({ error: 'No autenticado. Inicia sesión para continuar.' });
};

export const requireRole = (...allowedRoles: AulaRol[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // Regla §7: verificar primero tenantId y después el rol
    if (!req.aulaUser || !req.aulaUser.tenantId) {
      return res.status(401).json({ error: 'Contexto institucional (tenant) no válido.' });
    }
    if (!allowedRoles.includes(req.aulaUser.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
    }
    return next();
  };
};
