import { and, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.ts';
import {
  anuncio,
  asistenciaRef,
  curso,
  estudianteRef,
  inscripcionCurso,
  tenantRef,
} from '../../db/schema.ts';
import { requireAuth, requireRole, type AuthRequest } from '../../middleware/auth.ts';
import { requireAllenHmac } from '../../middleware/hmac.ts';
import { calculateAttendanceSummary } from '../services/grading.ts';
import { dispatchOutboxEvent, listOutboxEvents } from '../services/outbox.ts';

export const comunicacionRouter = Router();

// GET /api/anuncios?cursoId=
comunicacionRouter.get(
  '/anuncios',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = typeof req.query.cursoId === 'string' ? req.query.cursoId : '';
      const { tenantId, rol, sub, estudianteId } = req.aulaUser!;
      if (!cursoId) return res.status(400).json({ error: 'Indica cursoId.' });

      if (rol === 'ESTUDIANTE') {
        const [insc] = await db
          .select()
          .from(inscripcionCurso)
          .where(
            and(
              eq(inscripcionCurso.tenantId, tenantId),
              eq(inscripcionCurso.cursoId, cursoId),
              eq(inscripcionCurso.estudianteId, estudianteId || sub),
              eq(inscripcionCurso.estado, 'ACTIVO'),
            ),
          )
          .limit(1);
        if (!insc) return res.status(403).json({ error: 'No estás inscrito en este curso.' });
      }

      const list = await db
        .select()
        .from(anuncio)
        .where(and(eq(anuncio.tenantId, tenantId), eq(anuncio.cursoId, cursoId)))
        .orderBy(desc(anuncio.createdAt));

      return res.json({ anuncios: list });
    } catch (error) {
      console.error('Error listing anuncios:', error);
      return res.status(500).json({ error: 'No se pudieron cargar los anuncios.' });
    }
  },
);

// POST /api/anuncios
comunicacionRouter.post(
  '/anuncios',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, sub, nombre: autorNombre } = req.aulaUser!;
      const cursoId = typeof req.body?.cursoId === 'string' ? req.body.cursoId : '';
      const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
      const mensaje = typeof req.body?.mensaje === 'string' ? req.body.mensaje.trim() : '';
      const esSaludo = Boolean(req.body?.esSaludo);

      if (!cursoId || titulo.length < 3 || mensaje.length < 3) {
        return res.status(400).json({ error: 'Completa el título y mensaje del anuncio.' });
      }

      const [foundCurso] = await db
        .select()
        .from(curso)
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
        .limit(1);
      if (!foundCurso) return res.status(404).json({ error: 'Curso no encontrado.' });

      const [created] = await db
        .insert(anuncio)
        .values({
          tenantId,
          cursoId,
          titulo: titulo.slice(0, 200),
          mensaje,
          esSaludo,
          autorId: sub,
          autorNombre,
        })
        .returning();

      return res.status(201).json({ anuncio: created });
    } catch (error) {
      console.error('Error creating anuncio:', error);
      return res.status(500).json({ error: 'No se pudo publicar el anuncio.' });
    }
  },
);

// GET /api/outbox — cola de eventos hacia ALLEN (ADMIN y PROFESOR)
comunicacionRouter.get(
  '/outbox',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const eventos = await listOutboxEvents(req.aulaUser!.tenantId);
      return res.json({ eventos });
    } catch (error) {
      console.error('Error fetching outbox:', error);
      return res.status(500).json({ error: 'No se pudo cargar la cola Outbox.' });
    }
  },
);

// POST /api/outbox/:id/reintentar
comunicacionRouter.post(
  '/outbox/:id/reintentar',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const updated = await dispatchOutboxEvent(String(req.params.id), req.aulaUser!.tenantId);
      return res.json({ evento: updated });
    } catch (error) {
      console.error('Error retrying outbox event:', error);
      return res.status(500).json({ error: 'No se pudo reintentar el evento.' });
    }
  },
);

// ---- Endpoints consumidos por CRM ALLEN (HMAC-SHA256) ----

comunicacionRouter.get('/integracion/allen/ping', requireAllenHmac, (_req, res) => {
  return res.json({ ok: true, servicio: 'allen-aula', timestamp: new Date().toISOString() });
});

comunicacionRouter.post('/integracion/allen/inscripcion', requireAllenHmac, async (req, res) => {
  try {
    const { evento, tenantId, cursoRef, estudiante } = req.body || {};
    if (!tenantId || !cursoRef?.horarioId || !estudiante?.id) {
      return res.status(400).json({ error: 'Payload de inscripción incompleto.' });
    }

    const [foundCurso] = await db
      .select()
      .from(curso)
      .where(and(eq(curso.tenantId, tenantId), eq(curso.horarioId, cursoRef.horarioId)))
      .limit(1);

    if (!foundCurso) {
      return res.status(200).json({ aplicado: false, motivo: 'sin_curso' });
    }

    await db
      .insert(tenantRef)
      .values({ id: tenantId })
      .onConflictDoNothing();

    await db
      .insert(estudianteRef)
      .values({
        id: estudiante.id,
        tenantId,
        nombres: estudiante.nombres || 'Sin nombre',
        apellidos: estudiante.apellidos || '',
        numeroContrato: estudiante.numeroContrato || null,
        email: estudiante.email || null,
        estado: 'ACTIVO',
      })
      .onConflictDoUpdate({
        target: estudianteRef.id,
        set: {
          nombres: estudiante.nombres || 'Sin nombre',
          apellidos: estudiante.apellidos || '',
          numeroContrato: estudiante.numeroContrato || null,
          email: estudiante.email || null,
          actualizadoEn: new Date(),
        },
      });

    if (evento === 'inscripcion.retirada') {
      await db
        .update(inscripcionCurso)
        .set({ estado: 'RETIRADO', fechaBaja: new Date() })
        .where(
          and(
            eq(inscripcionCurso.tenantId, tenantId),
            eq(inscripcionCurso.cursoId, foundCurso.id),
            eq(inscripcionCurso.estudianteId, estudiante.id),
          ),
        );
      return res.json({ aplicado: true, accion: 'retirado' });
    }

    await db
      .insert(inscripcionCurso)
      .values({
        tenantId,
        cursoId: foundCurso.id,
        estudianteId: estudiante.id,
        estado: 'ACTIVO',
        origen: 'ALLEN',
      })
      .onConflictDoUpdate({
        target: [inscripcionCurso.cursoId, inscripcionCurso.estudianteId],
        set: { estado: 'ACTIVO', fechaBaja: null },
      });

    return res.json({ aplicado: true, accion: 'inscrito', cursoId: foundCurso.id });
  } catch (error) {
    console.error('Error processing ALLEN inscripcion webhook:', error);
    return res.status(500).json({ error: 'No se pudo procesar el evento de inscripción.' });
  }
});

comunicacionRouter.post('/integracion/allen/estudiante', requireAllenHmac, async (req, res) => {
  try {
    const { tenantId, estudiante } = req.body || {};
    if (!tenantId || !estudiante?.id) {
      return res.status(400).json({ error: 'Payload de estudiante incompleto.' });
    }

    await db
      .insert(estudianteRef)
      .values({
        id: estudiante.id,
        tenantId,
        nombres: estudiante.nombres || 'Sin nombre',
        apellidos: estudiante.apellidos || '',
        numeroContrato: estudiante.numeroContrato || null,
        email: estudiante.email || null,
        estado: estudiante.estado || 'ACTIVO',
      })
      .onConflictDoUpdate({
        target: estudianteRef.id,
        set: {
          nombres: estudiante.nombres || 'Sin nombre',
          apellidos: estudiante.apellidos || '',
          numeroContrato: estudiante.numeroContrato || null,
          email: estudiante.email || null,
          estado: estudiante.estado || 'ACTIVO',
          actualizadoEn: new Date(),
        },
      });

    return res.json({ aplicado: true });
  } catch (error) {
    console.error('Error syncing estudiante_ref:', error);
    return res.status(500).json({ error: 'No se pudo actualizar el espejo del estudiante.' });
  }
});

// POST /api/integracion/allen/asistencia — ALLEN CRM envía registros de asistencia (solo lectura en Aula)
comunicacionRouter.post('/integracion/allen/asistencia', requireAllenHmac, async (req, res) => {
  try {
    const { tenantId, horarioId, cursoId, registros } = req.body || {};
    if (!tenantId || !Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: 'Payload de asistencia incompleto.' });
    }

    let resolvedCursoId: string | null = typeof cursoId === 'string' ? cursoId : null;
    if (!resolvedCursoId && typeof horarioId === 'string') {
      const [foundCurso] = await db
        .select({ id: curso.id })
        .from(curso)
        .where(and(eq(curso.tenantId, tenantId), eq(curso.horarioId, horarioId)))
        .limit(1);
      resolvedCursoId = foundCurso?.id || null;
    }

    if (!resolvedCursoId) {
      return res.status(200).json({ aplicado: false, motivo: 'sin_curso' });
    }

    let aplicados = 0;
    for (const item of registros) {
      if (!item?.estudianteId || !item?.fecha || !item?.estado) continue;
      const estadoNorm = ['PRESENTE', 'TARDANZA', 'AUSENTE', 'JUSTIFICADA'].includes(
        String(item.estado).toUpperCase(),
      )
        ? String(item.estado).toUpperCase()
        : 'AUSENTE';

      await db
        .insert(asistenciaRef)
        .values({
          tenantId,
          cursoId: resolvedCursoId,
          horarioId: horarioId || null,
          estudianteId: item.estudianteId,
          fecha: String(item.fecha).slice(0, 10),
          tema: typeof item.tema === 'string' ? item.tema.slice(0, 200) : null,
          estado: estadoNorm,
          observacion: typeof item.observacion === 'string' ? item.observacion : null,
          origen: 'ALLEN',
        })
        .onConflictDoUpdate({
          target: [asistenciaRef.cursoId, asistenciaRef.estudianteId, asistenciaRef.fecha],
          set: {
            estado: estadoNorm,
            tema: typeof item.tema === 'string' ? item.tema.slice(0, 200) : null,
            observacion: typeof item.observacion === 'string' ? item.observacion : null,
            actualizadoEn: new Date(),
          },
        });
      aplicados += 1;
    }

    return res.json({ aplicado: true, registrosSincronizados: aplicados });
  } catch (error) {
    console.error('Error syncing ALLEN asistencia:', error);
    return res.status(500).json({ error: 'No se pudo sincronizar la asistencia desde ALLEN.' });
  }
});

// GET /api/cursos/:id/asistencia — Consulta de solo lectura de asistencias recibidas desde ALLEN CRM
comunicacionRouter.get(
  '/cursos/:id/asistencia',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      const { tenantId, rol, sub, estudianteId } = req.aulaUser!;
      const estSelfId = estudianteId || sub;

      if (rol === 'ESTUDIANTE') {
        const [insc] = await db
          .select()
          .from(inscripcionCurso)
          .where(
            and(
              eq(inscripcionCurso.tenantId, tenantId),
              eq(inscripcionCurso.cursoId, cursoId),
              eq(inscripcionCurso.estudianteId, estSelfId),
              eq(inscripcionCurso.estado, 'ACTIVO'),
            ),
          )
          .limit(1);
        if (!insc) return res.status(403).json({ error: 'No estás inscrito en este curso.' });

        const rows = await db
          .select()
          .from(asistenciaRef)
          .where(
            and(
              eq(asistenciaRef.tenantId, tenantId),
              eq(asistenciaRef.cursoId, cursoId),
              eq(asistenciaRef.estudianteId, estSelfId),
            ),
          )
          .orderBy(desc(asistenciaRef.fecha));

        return res.json({
          origen: 'ALLEN CRM',
          resumen: calculateAttendanceSummary(rows),
          registros: rows,
        });
      }

      const rows = await db
        .select({
          registro: asistenciaRef,
          estudiante: estudianteRef,
        })
        .from(asistenciaRef)
        .innerJoin(estudianteRef, eq(asistenciaRef.estudianteId, estudianteRef.id))
        .where(and(eq(asistenciaRef.tenantId, tenantId), eq(asistenciaRef.cursoId, cursoId)))
        .orderBy(desc(asistenciaRef.fecha));

      const byStudent = new Map<
        string,
        {
          estudiante: typeof estudianteRef.$inferSelect;
          registros: Array<typeof asistenciaRef.$inferSelect>;
        }
      >();

      for (const r of rows) {
        const existing = byStudent.get(r.estudiante.id);
        if (existing) {
          existing.registros.push(r.registro);
        } else {
          byStudent.set(r.estudiante.id, {
            estudiante: r.estudiante,
            registros: [r.registro],
          });
        }
      }

      const resumenPorEstudiante = Array.from(byStudent.values()).map((entry) => ({
        estudiante: entry.estudiante,
        resumen: calculateAttendanceSummary(entry.registros),
        ultimoRegistro: entry.registros[0] || null,
      }));

      return res.json({
        origen: 'ALLEN CRM',
        resumenGlobal: calculateAttendanceSummary(rows.map((r) => r.registro)),
        resumenPorEstudiante,
        registros: rows.map((r) => ({
          ...r.registro,
          estudianteNombre: `${r.estudiante.apellidos}, ${r.estudiante.nombres}`,
        })),
      });
    } catch (error) {
      console.error('Error loading asistencia:', error);
      return res.status(500).json({ error: 'No se pudo cargar el registro de asistencia.' });
    }
  },
);
