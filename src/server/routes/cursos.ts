import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.ts';
import {
  anuncio,
  curso,
  cursoBackup,
  entrega,
  estudianteRef,
  inscripcionCurso,
  intentoQuiz,
  leccion,
  material,
  notificacionAula,
  pregunta,
  progresoLeccion,
  quiz,
  tarea,
  unidad,
} from '../../db/schema.ts';
import { ensureSeedData } from '../../db/seed.ts';
import { resolveCourseCoverUrl, validateCourseDeletionReason } from '../../lib/course-cover.ts';
import { requireAuth, requireRole, type AuthRequest } from '../../middleware/auth.ts';
import { calculateCourseProgress } from '../services/grading.ts';

export const cursosRouter = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

// GET /api/cursos — ADMIN y PROFESOR (filtrado estricto por tenantId)
cursosRouter.get('/cursos', requireAuth, requireRole('ADMIN', 'PROFESOR'), async (req: AuthRequest, res) => {
  try {
    await ensureSeedData();
    const { tenantId, rol, sub } = req.aulaUser!;
    const estadoParam = typeof req.query.estado === 'string' ? req.query.estado.toUpperCase() : undefined;

    const conditions = [eq(curso.tenantId, tenantId)];
    if (estadoParam === 'BORRADOR' || estadoParam === 'PUBLICADO' || estadoParam === 'ARCHIVADO') {
      conditions.push(eq(curso.estado, estadoParam));
    }
    if (rol === 'PROFESOR') {
      conditions.push(eq(curso.profesorId, sub));
    }

    const cursosList = await db
      .select()
      .from(curso)
      .where(and(...conditions))
      .orderBy(desc(curso.createdAt));

    if (cursosList.length === 0) {
      return res.json({ cursos: [] });
    }

    const cursoIds = cursosList.map((c) => c.id);
    const [inscripciones, unidades, tareas] = await Promise.all([
      db
        .select()
        .from(inscripcionCurso)
        .where(
          and(
            eq(inscripcionCurso.tenantId, tenantId),
            inArray(inscripcionCurso.cursoId, cursoIds),
            eq(inscripcionCurso.estado, 'ACTIVO'),
          ),
        ),
      db
        .select()
        .from(unidad)
        .where(and(eq(unidad.tenantId, tenantId), inArray(unidad.cursoId, cursoIds))),
      db
        .select()
        .from(tarea)
        .where(and(eq(tarea.tenantId, tenantId), inArray(tarea.cursoId, cursoIds))),
    ]);

    const unidadIds = unidades.map((u) => u.id);
    const lecciones =
      unidadIds.length > 0
        ? await db
            .select()
            .from(leccion)
            .where(and(eq(leccion.tenantId, tenantId), inArray(leccion.unidadId, unidadIds)))
        : [];

    const unidadToCurso = new Map(unidades.map((u) => [u.id, u.cursoId]));

    const enriched = cursosList.map((c) => {
      const inscritos = inscripciones.filter((i) => i.cursoId === c.id).length;
      const totalUnidades = unidades.filter((u) => u.cursoId === c.id).length;
      const totalLecciones = lecciones.filter((l) => unidadToCurso.get(l.unidadId) === c.id).length;
      const totalTareas = tareas.filter((t) => t.cursoId === c.id).length;
      return {
        ...c,
        estadisticas: {
          inscritos,
          unidades: totalUnidades,
          lecciones: totalLecciones,
          tareas: totalTareas,
        },
      };
    });

    return res.json({ cursos: enriched });
  } catch (error) {
    console.error('Error listing cursos:', error);
    return res.status(500).json({ error: 'No se pudieron cargar los cursos.' });
  }
});

// GET /api/mis-cursos — ESTUDIANTE (cursos donde está inscrito + progreso real)
cursosRouter.get('/mis-cursos', requireAuth, requireRole('ESTUDIANTE'), async (req: AuthRequest, res) => {
  try {
    await ensureSeedData();
    const { tenantId, estudianteId, sub } = req.aulaUser!;
    const estId = estudianteId || sub;

    const inscripciones = await db
      .select()
      .from(inscripcionCurso)
      .where(
        and(
          eq(inscripcionCurso.tenantId, tenantId),
          eq(inscripcionCurso.estudianteId, estId),
          eq(inscripcionCurso.estado, 'ACTIVO'),
        ),
      );

    if (inscripciones.length === 0) {
      return res.json({ cursos: [] });
    }

    const cursoIds = inscripciones.map((i) => i.cursoId);
    const cursosList = await db
      .select()
      .from(curso)
      .where(
        and(
          eq(curso.tenantId, tenantId),
          inArray(curso.id, cursoIds),
          eq(curso.estado, 'PUBLICADO'),
        ),
      )
      .orderBy(desc(curso.createdAt));

    if (cursosList.length === 0) {
      return res.json({ cursos: [] });
    }

    const activeCursoIds = cursosList.map((c) => c.id);
    const unidades = await db
      .select()
      .from(unidad)
      .where(and(eq(unidad.tenantId, tenantId), inArray(unidad.cursoId, activeCursoIds)));

    const unidadIds = unidades.map((u) => u.id);
    const lecciones =
      unidadIds.length > 0
        ? await db
            .select()
            .from(leccion)
            .where(
              and(
                eq(leccion.tenantId, tenantId),
                inArray(leccion.unidadId, unidadIds),
                eq(leccion.publicada, true),
              ),
            )
        : [];

    const progresos = await db
      .select()
      .from(progresoLeccion)
      .where(
        and(
          eq(progresoLeccion.tenantId, tenantId),
          eq(progresoLeccion.estudianteId, estId),
          eq(progresoLeccion.estado, 'COMPLETADA'),
        ),
      );

    const unidadToCurso = new Map(unidades.map((u) => [u.id, u.cursoId]));
    const completedIds = progresos.map((p) => p.leccionId);

    const enriched = cursosList.map((c) => {
      const courseLessons = lecciones
        .filter((l) => unidadToCurso.get(l.unidadId) === c.id)
        .map((l) => l.id);
      const completadas = courseLessons.filter((id) => completedIds.includes(id)).length;
      const progresoPorcentaje = calculateCourseProgress(courseLessons, completedIds);

      return {
        ...c,
        progresoPorcentaje,
        leccionesPublicadas: courseLessons.length,
        leccionesCompletadas: completadas,
      };
    });

    return res.json({ cursos: enriched });
  } catch (error) {
    console.error('Error loading student mis-cursos:', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus cursos.' });
  }
});

// POST /api/cursos — crea curso nuevo
cursosRouter.post('/cursos', requireAuth, requireRole('ADMIN', 'PROFESOR'), async (req: AuthRequest, res) => {
  try {
    const { tenantId, sub, nombre: autorNombre } = req.aulaUser!;
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
    const descripcion = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : null;
    const nivel = typeof req.body?.nivel === 'string' ? req.body.nivel.trim().toUpperCase() : 'A1';
    const fechaInicio = typeof req.body?.fechaInicio === 'string' && req.body.fechaInicio ? req.body.fechaInicio : null;
    const fechaFin = typeof req.body?.fechaFin === 'string' && req.body.fechaFin ? req.body.fechaFin : null;
    const rawPortada = typeof req.body?.portadaUrl === 'string' ? req.body.portadaUrl.trim() : '';
    let portadaUrl = '/src/assets/images/course_english_a2_1795125510232.jpg';
    if (rawPortada) {
      const resolvedCover = resolveCourseCoverUrl(rawPortada);
      if (!resolvedCover.valid) {
        return res.status(400).json({ error: resolvedCover.error });
      }
      portadaUrl = resolvedCover.normalizedUrl;
    }

    if (nombre.length < 3 || nombre.length > 200) {
      return res.status(400).json({ error: 'El nombre del curso debe tener entre 3 y 200 caracteres.' });
    }

    const [created] = await db
      .insert(curso)
      .values({
        tenantId,
        nombre,
        descripcion,
        nivel,
        portadaUrl,
        estado: 'BORRADOR',
        profesorId: sub,
        profesorNombre: autorNombre,
        fechaInicio,
        fechaFin,
        creadoPorId: sub,
        creadoPorNombre: autorNombre,
      })
      .returning();

    // Crear una unidad inicial vacía de bienvenida estilo Moodle
    await db.insert(unidad).values({
      tenantId,
      cursoId: created.id,
      orden: 1,
      titulo: 'Unidad 1 — Introducción y objetivos',
      descripcion: 'Sección inicial del curso.',
    });

    return res.status(201).json({ curso: created });
  } catch (error) {
    console.error('Error creating curso:', error);
    return res.status(500).json({ error: 'No se pudo crear el curso.' });
  }
});

// GET /api/cursos/backups — Respaldos automáticos de cursos eliminados (DEBE ir antes de /cursos/:id)
cursosRouter.get(
  '/cursos/backups',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, rol, sub } = req.aulaUser!;
      const conditions = [eq(cursoBackup.tenantId, tenantId)];
      if (rol === 'PROFESOR') {
        conditions.push(eq(cursoBackup.eliminadoPorId, sub));
      }

      const rows = await db
        .select()
        .from(cursoBackup)
        .where(and(...conditions))
        .orderBy(desc(cursoBackup.createdAt))
        .limit(50);

      const backups = rows.map((row) => {
        const snap = (row.snapshot || {}) as {
          unidades?: Array<{
            lecciones?: Array<{
              materiales?: unknown[];
              quizzes?: unknown[];
            }>;
          }>;
          tareas?: unknown[];
          anuncios?: unknown[];
        };
        const unidadesCount = Array.isArray(snap.unidades) ? snap.unidades.length : 0;
        const leccionesCount = Array.isArray(snap.unidades)
          ? snap.unidades.reduce((acc, u) => acc + (Array.isArray(u.lecciones) ? u.lecciones.length : 0), 0)
          : 0;
        const quizzesCount = Array.isArray(snap.unidades)
          ? snap.unidades.reduce(
              (acc, u) =>
                acc +
                (Array.isArray(u.lecciones)
                  ? u.lecciones.reduce((la, l) => la + (Array.isArray(l.quizzes) ? l.quizzes.length : 0), 0)
                  : 0),
              0,
            )
          : 0;
        const tareasCount = Array.isArray(snap.tareas) ? snap.tareas.length : 0;

        return {
          id: row.id,
          cursoOriginalId: row.cursoOriginalId,
          cursoNombre: row.cursoNombre,
          cursoNivel: row.cursoNivel,
          motivo: row.motivo,
          eliminadoPorId: row.eliminadoPorId,
          eliminadoPorNombre: row.eliminadoPorNombre,
          restauradoEn: row.restauradoEn ? row.restauradoEn.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
          resumen: {
            unidades: unidadesCount,
            lecciones: leccionesCount,
            tareas: tareasCount,
            examenes: quizzesCount,
          },
          snapshot: row.snapshot,
        };
      });

      return res.json({ backups });
    } catch (error) {
      console.error('Error loading course backups:', error);
      return res.status(500).json({ error: 'No se pudieron cargar los respaldos de cursos.' });
    }
  },
);

// POST /api/cursos/backups/:backupId/restaurar — Restaura completamente un curso desde su respaldo
cursosRouter.post(
  '/cursos/backups/:backupId/restaurar',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const backupId = String(req.params.backupId);
      if (!isValidUuid(backupId)) return res.status(400).json({ error: 'ID de respaldo inválido.' });

      const { tenantId, rol, sub, nombre: actorNombre } = req.aulaUser!;
      const [backup] = await db
        .select()
        .from(cursoBackup)
        .where(and(eq(cursoBackup.id, backupId), eq(cursoBackup.tenantId, tenantId)))
        .limit(1);

      if (!backup) return res.status(404).json({ error: 'Respaldo no encontrado.' });
      if (rol === 'PROFESOR' && backup.eliminadoPorId !== sub) {
        return res.status(403).json({ error: 'No tienes permisos para restaurar este respaldo.' });
      }

      const snap = (backup.snapshot || {}) as {
        curso?: {
          nombre?: string;
          descripcion?: string | null;
          nivel?: string;
          portadaUrl?: string | null;
          fechaInicio?: string | null;
          fechaFin?: string | null;
        };
        unidades?: Array<{
          orden: number;
          titulo: string;
          descripcion?: string | null;
          lecciones?: Array<{
            id?: string;
            orden: number;
            titulo: string;
            contenido?: string | null;
            publicada?: boolean;
            materiales?: Array<{
              tipo: string;
              titulo: string;
              descripcion?: string | null;
              url: string;
              mimeType?: string | null;
              tamanoBytes?: number | null;
              orden: number;
            }>;
            quizzes?: Array<{
              titulo: string;
              descripcion?: string | null;
              intentosMax?: number;
              notaMinima?: number;
              tiempoLimiteMin?: number | null;
              envioAutomatico?: boolean;
              modo?: string;
              mezclarPreguntas?: boolean;
              nivelMcer?: string | null;
              habilidadCambridge?: string | null;
              politicaSalida?: string;
              maxCambiosPestana?: number;
              publicada?: boolean;
              preguntas?: Array<{
                orden: number;
                enunciado: string;
                tipo: string;
                opciones?: unknown;
                respuestaCorrecta: unknown;
                audioUrl?: string | null;
                videoUrl?: string | null;
                retroalimentacion?: string | null;
                minPalabras?: number | null;
                maxPalabras?: number | null;
                puntos?: number;
              }>;
            }>;
          }>;
        }>;
        tareas?: Array<{
          leccionId?: string | null;
          titulo: string;
          instrucciones?: string | null;
          tipoTarea?: string;
          nivelMcer?: string | null;
          minPalabras?: number | null;
          maxPalabras?: number | null;
          notaMaxima?: number;
          permiteTardio?: boolean;
          publicada?: boolean;
        }>;
        anuncios?: Array<{
          titulo: string;
          mensaje: string;
          esSaludo?: boolean;
        }>;
      };

      const baseName = snap.curso?.nombre || backup.cursoNombre;
      const [restoredCurso] = await db
        .insert(curso)
        .values({
          tenantId,
          nombre: `${baseName} (Restaurado)`.slice(0, 200),
          descripcion: snap.curso?.descripcion ?? null,
          nivel: snap.curso?.nivel || backup.cursoNivel || 'A1',
          portadaUrl:
            snap.curso?.portadaUrl || '/src/assets/images/course_english_a2_1795125510232.jpg',
          estado: 'BORRADOR',
          profesorId: sub,
          profesorNombre: actorNombre,
          fechaInicio: snap.curso?.fechaInicio ?? null,
          fechaFin: snap.curso?.fechaFin ?? null,
          creadoPorId: sub,
          creadoPorNombre: actorNombre,
        })
        .returning();

      const oldToNewLessonId = new Map<string, string>();

      for (const u of snap.unidades || []) {
        const [newU] = await db
          .insert(unidad)
          .values({
            tenantId,
            cursoId: restoredCurso.id,
            orden: u.orden,
            titulo: u.titulo,
            descripcion: u.descripcion ?? null,
          })
          .returning();

        for (const l of u.lecciones || []) {
          const [newL] = await db
            .insert(leccion)
            .values({
              tenantId,
              unidadId: newU.id,
              orden: l.orden,
              titulo: l.titulo,
              contenido: l.contenido ?? null,
              publicada: Boolean(l.publicada),
            })
            .returning();

          if (l.id) oldToNewLessonId.set(l.id, newL.id);

          if (l.materiales && l.materiales.length > 0) {
            await db.insert(material).values(
              l.materiales.map((m) => ({
                tenantId,
                leccionId: newL.id,
                tipo: m.tipo as typeof material.$inferInsert.tipo,
                titulo: m.titulo,
                descripcion: m.descripcion ?? null,
                url: m.url,
                mimeType: m.mimeType ?? null,
                tamanoBytes: m.tamanoBytes ?? null,
                orden: m.orden,
              })),
            );
          }

          for (const q of l.quizzes || []) {
            const [newQ] = await db
              .insert(quiz)
              .values({
                tenantId,
                leccionId: newL.id,
                titulo: q.titulo,
                descripcion: q.descripcion ?? null,
                intentosMax: q.intentosMax ?? 1,
                notaMinima: q.notaMinima ?? 70,
                tiempoLimiteMin: q.tiempoLimiteMin ?? null,
                envioAutomatico: q.envioAutomatico !== false,
                modo: q.modo || 'EXAMEN',
                mezclarPreguntas: Boolean(q.mezclarPreguntas),
                nivelMcer: q.nivelMcer ?? null,
                habilidadCambridge: q.habilidadCambridge ?? null,
                politicaSalida: q.politicaSalida || 'ADVERTENCIA_LIMITE',
                maxCambiosPestana: q.maxCambiosPestana ?? 3,
                publicada: Boolean(q.publicada),
              })
              .returning();

            if (q.preguntas && q.preguntas.length > 0) {
              await db.insert(pregunta).values(
                q.preguntas.map((p) => ({
                  quizId: newQ.id,
                  orden: p.orden,
                  enunciado: p.enunciado,
                  tipo: p.tipo as typeof pregunta.$inferInsert.tipo,
                  opciones: (p.opciones ?? null) as typeof pregunta.$inferInsert.opciones,
                  respuestaCorrecta: (p.respuestaCorrecta ?? '') as typeof pregunta.$inferInsert.respuestaCorrecta,
                  audioUrl: p.audioUrl ?? null,
                  videoUrl: p.videoUrl ?? null,
                  retroalimentacion: p.retroalimentacion ?? null,
                  minPalabras: p.minPalabras ?? null,
                  maxPalabras: p.maxPalabras ?? null,
                  puntos: p.puntos ?? 1,
                })),
              );
            }
          }
        }
      }

      if (snap.tareas && snap.tareas.length > 0) {
        await db.insert(tarea).values(
          snap.tareas.map((t) => ({
            tenantId,
            cursoId: restoredCurso.id,
            leccionId: t.leccionId ? oldToNewLessonId.get(t.leccionId) || null : null,
            titulo: t.titulo,
            instrucciones: t.instrucciones ?? null,
            tipoTarea: t.tipoTarea || 'TAREA',
            nivelMcer: t.nivelMcer ?? null,
            minPalabras: t.minPalabras ?? null,
            maxPalabras: t.maxPalabras ?? null,
            notaMaxima: t.notaMaxima ?? 100,
            permiteTardio: Boolean(t.permiteTardio),
            publicada: Boolean(t.publicada),
          })),
        );
      }

      if (snap.anuncios && snap.anuncios.length > 0) {
        await db.insert(anuncio).values(
          snap.anuncios.map((a) => ({
            tenantId,
            cursoId: restoredCurso.id,
            titulo: a.titulo,
            mensaje: a.mensaje,
            esSaludo: Boolean(a.esSaludo),
            autorId: sub,
            autorNombre: actorNombre,
          })),
        );
      }

      await db
        .update(cursoBackup)
        .set({ restauradoEn: new Date() })
        .where(eq(cursoBackup.id, backup.id));

      return res.status(201).json({ curso: restoredCurso });
    } catch (error) {
      console.error('Error restoring course backup:', error);
      return res.status(500).json({ error: 'No se pudo restaurar el curso desde el respaldo.' });
    }
  },
);

// GET /api/cursos/:id — detalle completo del curso con unidades, lecciones, materiales, tareas, quizzes, anuncios y progreso
cursosRouter.get(
  '/cursos/:id',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      await ensureSeedData();
      const cursoId = String(req.params.id);
      if (!isValidUuid(cursoId)) {
        return res.status(400).json({ error: 'Identificador de curso inválido.' });
      }

      const { tenantId, rol, sub, estudianteId } = req.aulaUser!;
      const [foundCurso] = await db
        .select()
        .from(curso)
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
        .limit(1);

      if (!foundCurso) {
        return res.status(404).json({ error: 'Curso no encontrado.' });
      }

      if (rol === 'PROFESOR' && foundCurso.profesorId && foundCurso.profesorId !== sub) {
        return res.status(403).json({ error: 'No eres docente asignado de este curso.' });
      }

      const estId = estudianteId || sub;
      if (rol === 'ESTUDIANTE') {
        const [inscripcion] = await db
          .select()
          .from(inscripcionCurso)
          .where(
            and(
              eq(inscripcionCurso.tenantId, tenantId),
              eq(inscripcionCurso.cursoId, cursoId),
              eq(inscripcionCurso.estudianteId, estId),
              eq(inscripcionCurso.estado, 'ACTIVO'),
            ),
          )
          .limit(1);

        if (!inscripcion || foundCurso.estado !== 'PUBLICADO') {
          return res.status(403).json({ error: 'No estás inscrito en este curso.' });
        }
      }

      const unidadesList = await db
        .select()
        .from(unidad)
        .where(and(eq(unidad.tenantId, tenantId), eq(unidad.cursoId, cursoId)))
        .orderBy(asc(unidad.orden));

      const unidadIds = unidadesList.map((u) => u.id);
      const allLecciones =
        unidadIds.length > 0
          ? await db
              .select()
              .from(leccion)
              .where(and(eq(leccion.tenantId, tenantId), inArray(leccion.unidadId, unidadIds)))
              .orderBy(asc(leccion.orden))
          : [];

      const visibleLecciones =
        rol === 'ESTUDIANTE' ? allLecciones.filter((l) => l.publicada) : allLecciones;
      const leccionIds = visibleLecciones.map((l) => l.id);

      const [materialesList, tareasList, quizzesList, anunciosList, progresosList, entregasEst] =
        await Promise.all([
          leccionIds.length > 0
            ? db
                .select()
                .from(material)
                .where(and(eq(material.tenantId, tenantId), inArray(material.leccionId, leccionIds)))
                .orderBy(asc(material.orden))
            : Promise.resolve([]),
          db
            .select()
            .from(tarea)
            .where(and(eq(tarea.tenantId, tenantId), eq(tarea.cursoId, cursoId)))
            .orderBy(desc(tarea.createdAt)),
          leccionIds.length > 0
            ? db
                .select()
                .from(quiz)
                .where(and(eq(quiz.tenantId, tenantId), inArray(quiz.leccionId, leccionIds)))
            : Promise.resolve([]),
          db
            .select()
            .from(anuncio)
            .where(and(eq(anuncio.tenantId, tenantId), eq(anuncio.cursoId, cursoId)))
            .orderBy(desc(anuncio.createdAt)),
          rol === 'ESTUDIANTE' && leccionIds.length > 0
            ? db
                .select()
                .from(progresoLeccion)
                .where(
                  and(
                    eq(progresoLeccion.tenantId, tenantId),
                    eq(progresoLeccion.estudianteId, estId),
                    inArray(progresoLeccion.leccionId, leccionIds),
                  ),
                )
            : Promise.resolve([]),
          rol === 'ESTUDIANTE'
            ? db
                .select()
                .from(entrega)
                .where(and(eq(entrega.tenantId, tenantId), eq(entrega.estudianteId, estId)))
            : Promise.resolve([]),
        ]);

      const visibleQuizzes =
        rol === 'ESTUDIANTE' ? quizzesList.filter((q) => q.publicada) : quizzesList;
      const quizIds = visibleQuizzes.map((q) => q.id);

      const [preguntasList, intentosEst] = await Promise.all([
        quizIds.length > 0
          ? db
              .select()
              .from(pregunta)
              .where(inArray(pregunta.quizId, quizIds))
              .orderBy(asc(pregunta.orden))
          : Promise.resolve([]),
        rol === 'ESTUDIANTE' && quizIds.length > 0
          ? db
              .select()
              .from(intentoQuiz)
              .where(
                and(
                  eq(intentoQuiz.tenantId, tenantId),
                  eq(intentoQuiz.estudianteId, estId),
                  inArray(intentoQuiz.quizId, quizIds),
                ),
              )
              .orderBy(desc(intentoQuiz.inicioEn))
          : Promise.resolve([]),
      ]);

      const visibleTareas =
        rol === 'ESTUDIANTE' ? tareasList.filter((t) => t.publicada) : tareasList;

      const progresoMap = new Map(progresosList.map((p) => [p.leccionId, p]));
      const entregaMap = new Map(entregasEst.map((e) => [e.tareaId, e]));

      const unidadesDetalladas = unidadesList.map((u) => {
        const lecs = visibleLecciones
          .filter((l) => l.unidadId === u.id)
          .map((l) => {
            const mats = materialesList.filter((m) => m.leccionId === l.id);
            const leccionTareas = visibleTareas
              .filter((t) => t.leccionId === l.id)
              .map((t) => ({
                ...t,
                miEntrega: entregaMap.get(t.id) || null,
              }));
            const leccionQuizzes = visibleQuizzes
              .filter((q) => q.leccionId === l.id)
              .map((q) => {
                const pregs = preguntasList
                  .filter((p) => p.quizId === q.id)
                  .map((p) =>
                    rol === 'ESTUDIANTE'
                      ? {
                          id: p.id,
                          quizId: p.quizId,
                          orden: p.orden,
                          enunciado: p.enunciado,
                          tipo: p.tipo,
                          opciones: p.opciones,
                          audioUrl: p.audioUrl,
                          videoUrl: p.videoUrl,
                          minPalabras: p.minPalabras,
                          maxPalabras: p.maxPalabras,
                          puntos: p.puntos,
                        }
                      : p,
                  );
                const misIntentos = intentosEst.filter((i) => i.quizId === q.id);
                return {
                  ...q,
                  preguntas: pregs,
                  misIntentos,
                };
              });

            return {
              ...l,
              materiales: mats,
              tareas: leccionTareas,
              quizzes: leccionQuizzes,
              progreso: progresoMap.get(l.id) || null,
            };
          });

        return {
          ...u,
          lecciones: lecs,
        };
      });

      const publishedIds = visibleLecciones.filter((l) => l.publicada).map((l) => l.id);
      const completedIds = progresosList
        .filter((p) => p.estado === 'COMPLETADA')
        .map((p) => p.leccionId);
      const progresoCurso = calculateCourseProgress(publishedIds, completedIds);

      return res.json({
        curso: foundCurso,
        unidades: unidadesDetalladas,
        tareas: visibleTareas.map((t) => ({
          ...t,
          miEntrega: entregaMap.get(t.id) || null,
        })),
        anuncios: anunciosList,
        progresoCurso,
      });
    } catch (error) {
      console.error('Error loading curso detail:', error);
      return res.status(500).json({ error: 'No se pudo cargar el detalle del curso.' });
    }
  },
);

// PATCH /api/cursos/:id
cursosRouter.patch('/cursos/:id', requireAuth, requireRole('ADMIN', 'PROFESOR'), async (req: AuthRequest, res) => {
  try {
    const cursoId = String(req.params.id);
    if (!isValidUuid(cursoId)) return res.status(400).json({ error: 'ID inválido.' });

    const { tenantId, rol, sub } = req.aulaUser!;
    const [existing] = await db
      .select()
      .from(curso)
      .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Curso no encontrado.' });
    if (rol === 'PROFESOR' && existing.profesorId !== sub) {
      return res.status(403).json({ error: 'Solo el docente asignado puede editar este curso.' });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof req.body?.nombre === 'string' && req.body.nombre.trim().length >= 3) {
      patch.nombre = req.body.nombre.trim().slice(0, 200);
    }
    if (typeof req.body?.descripcion === 'string') {
      patch.descripcion = req.body.descripcion.trim();
    }
    if (typeof req.body?.nivel === 'string') {
      patch.nivel = req.body.nivel.trim().toUpperCase().slice(0, 20);
    }
    if (
      req.body?.estado === 'BORRADOR' ||
      req.body?.estado === 'PUBLICADO' ||
      req.body?.estado === 'ARCHIVADO'
    ) {
      patch.estado = req.body.estado;
    }
    if (typeof req.body?.portadaUrl === 'string' && req.body.portadaUrl.trim()) {
      const resolved = resolveCourseCoverUrl(req.body.portadaUrl);
      if (!resolved.valid) {
        return res.status(400).json({ error: resolved.error });
      }
      patch.portadaUrl = resolved.normalizedUrl;
    }
    if (typeof req.body?.fechaInicio === 'string') {
      patch.fechaInicio = req.body.fechaInicio || null;
    }
    if (typeof req.body?.fechaFin === 'string') {
      patch.fechaFin = req.body.fechaFin || null;
    }

    const [updated] = await db
      .update(curso)
      .set(patch)
      .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
      .returning();

    return res.json({ curso: updated });
  } catch (error) {
    console.error('Error updating curso:', error);
    return res.status(500).json({ error: 'No se pudo actualizar el curso.' });
  }
});

// POST /api/cursos/:id/duplicar — Clona un curso completo (unidades, lecciones, materiales, tareas, exámenes y preguntas)
cursosRouter.post(
  '/cursos/:id/duplicar',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      if (!isValidUuid(cursoId)) return res.status(400).json({ error: 'ID inválido.' });

      const { tenantId, rol, sub, nombre: actorNombre } = req.aulaUser!;
      const [source] = await db
        .select()
        .from(curso)
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
        .limit(1);

      if (!source) return res.status(404).json({ error: 'Curso no encontrado.' });
      if (rol === 'PROFESOR' && source.profesorId && source.profesorId !== sub) {
        return res.status(403).json({ error: 'Solo puedes duplicar tus propios cursos.' });
      }

      const nuevoNombre =
        typeof req.body?.nombre === 'string' && req.body.nombre.trim().length >= 3
          ? req.body.nombre.trim().slice(0, 200)
          : `${source.nombre} (Copia)`.slice(0, 200);
      const fechaInicio =
        typeof req.body?.fechaInicio === 'string' && req.body.fechaInicio
          ? req.body.fechaInicio
          : source.fechaInicio;
      const fechaFin =
        typeof req.body?.fechaFin === 'string' && req.body.fechaFin
          ? req.body.fechaFin
          : source.fechaFin;
      const estado = req.body?.estado === 'PUBLICADO' ? 'PUBLICADO' : 'BORRADOR';

      const [cloned] = await db
        .insert(curso)
        .values({
          tenantId,
          nombre: nuevoNombre,
          descripcion: source.descripcion,
          nivel: source.nivel,
          portadaUrl: source.portadaUrl,
          estado,
          profesorId: rol === 'PROFESOR' ? sub : source.profesorId || sub,
          profesorNombre: rol === 'PROFESOR' ? actorNombre : source.profesorNombre || actorNombre,
          fechaInicio,
          fechaFin,
          creadoPorId: sub,
          creadoPorNombre: actorNombre,
        })
        .returning();

      const srcUnidades = await db
        .select()
        .from(unidad)
        .where(and(eq(unidad.tenantId, tenantId), eq(unidad.cursoId, cursoId)))
        .orderBy(asc(unidad.orden));

      const oldToNewLessonId = new Map<string, string>();
      let copiedLessons = 0;
      let copiedQuizzes = 0;

      for (const u of srcUnidades) {
        const [newU] = await db
          .insert(unidad)
          .values({
            tenantId,
            cursoId: cloned.id,
            orden: u.orden,
            titulo: u.titulo,
            descripcion: u.descripcion,
          })
          .returning();

        const srcLecciones = await db
          .select()
          .from(leccion)
          .where(and(eq(leccion.tenantId, tenantId), eq(leccion.unidadId, u.id)))
          .orderBy(asc(leccion.orden));

        for (const l of srcLecciones) {
          const [newL] = await db
            .insert(leccion)
            .values({
              tenantId,
              unidadId: newU.id,
              orden: l.orden,
              titulo: l.titulo,
              contenido: l.contenido,
              publicada: l.publicada,
            })
            .returning();

          oldToNewLessonId.set(l.id, newL.id);
          copiedLessons += 1;

          const srcMats = await db
            .select()
            .from(material)
            .where(and(eq(material.tenantId, tenantId), eq(material.leccionId, l.id)))
            .orderBy(asc(material.orden));

          if (srcMats.length > 0) {
            await db.insert(material).values(
              srcMats.map((m) => ({
                tenantId,
                leccionId: newL.id,
                tipo: m.tipo,
                titulo: m.titulo,
                descripcion: m.descripcion,
                url: m.url,
                mimeType: m.mimeType,
                tamanoBytes: m.tamanoBytes,
                orden: m.orden,
              })),
            );
          }

          const srcQuizzes = await db
            .select()
            .from(quiz)
            .where(and(eq(quiz.tenantId, tenantId), eq(quiz.leccionId, l.id)));

          for (const q of srcQuizzes) {
            const [newQ] = await db
              .insert(quiz)
              .values({
                tenantId,
                leccionId: newL.id,
                titulo: q.titulo,
                descripcion: q.descripcion,
                intentosMax: q.intentosMax,
                notaMinima: q.notaMinima,
                tiempoLimiteMin: q.tiempoLimiteMin,
                envioAutomatico: q.envioAutomatico,
                modo: q.modo,
                mezclarPreguntas: q.mezclarPreguntas,
                nivelMcer: q.nivelMcer,
                habilidadCambridge: q.habilidadCambridge,
                politicaSalida: q.politicaSalida,
                maxCambiosPestana: q.maxCambiosPestana,
                publicada: q.publicada,
              })
              .returning();

            copiedQuizzes += 1;

            const srcPregs = await db
              .select()
              .from(pregunta)
              .where(eq(pregunta.quizId, q.id))
              .orderBy(asc(pregunta.orden));

            if (srcPregs.length > 0) {
              await db.insert(pregunta).values(
                srcPregs.map((p) => ({
                  quizId: newQ.id,
                  orden: p.orden,
                  enunciado: p.enunciado,
                  tipo: p.tipo,
                  opciones: p.opciones,
                  respuestaCorrecta: p.respuestaCorrecta,
                  audioUrl: p.audioUrl,
                  videoUrl: p.videoUrl,
                  retroalimentacion: p.retroalimentacion,
                  minPalabras: p.minPalabras,
                  maxPalabras: p.maxPalabras,
                  puntos: p.puntos,
                })),
              );
            }
          }
        }
      }

      const srcTareas = await db
        .select()
        .from(tarea)
        .where(and(eq(tarea.tenantId, tenantId), eq(tarea.cursoId, cursoId)));

      if (srcTareas.length > 0) {
        await db.insert(tarea).values(
          srcTareas.map((t) => ({
            tenantId,
            cursoId: cloned.id,
            leccionId: t.leccionId ? oldToNewLessonId.get(t.leccionId) || null : null,
            titulo: t.titulo,
            instrucciones: t.instrucciones,
            tipoTarea: t.tipoTarea,
            nivelMcer: t.nivelMcer,
            minPalabras: t.minPalabras,
            maxPalabras: t.maxPalabras,
            notaMaxima: t.notaMaxima,
            venceEn: t.venceEn,
            permiteTardio: t.permiteTardio,
            publicada: t.publicada,
          })),
        );
      }

      return res.status(201).json({
        curso: cloned,
        estadisticas: {
          unidades: srcUnidades.length,
          lecciones: copiedLessons,
          tareas: srcTareas.length,
          examenes: copiedQuizzes,
        },
      });
    } catch (error) {
      console.error('Error duplicating curso:', error);
      return res.status(500).json({ error: 'No se pudo duplicar el curso.' });
    }
  },
);

// POST /api/cursos/:id/eliminar — Crea respaldo completo automático con motivo obligatorio y luego elimina el curso
cursosRouter.post(
  '/cursos/:id/eliminar',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      if (!isValidUuid(cursoId)) return res.status(400).json({ error: 'ID inválido.' });

      const reasonCheck = validateCourseDeletionReason(req.body?.motivo);
      if (!reasonCheck.valid) {
        return res.status(400).json({ error: reasonCheck.error });
      }

      const { tenantId, rol, sub, nombre: actorNombre } = req.aulaUser!;
      const [existing] = await db
        .select()
        .from(curso)
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
        .limit(1);

      if (!existing) return res.status(404).json({ error: 'Curso no encontrado.' });
      if (rol === 'PROFESOR' && existing.profesorId && existing.profesorId !== sub) {
        return res.status(403).json({ error: 'Solo el docente asignado o un administrador puede eliminar este curso.' });
      }

      // 1. Construir respaldo completo del curso ANTES de eliminar
      const unidadesList = await db
        .select()
        .from(unidad)
        .where(and(eq(unidad.tenantId, tenantId), eq(unidad.cursoId, cursoId)))
        .orderBy(asc(unidad.orden));
      const unidadIds = unidadesList.map((u) => u.id);

      const leccionesList =
        unidadIds.length > 0
          ? await db
              .select()
              .from(leccion)
              .where(and(eq(leccion.tenantId, tenantId), inArray(leccion.unidadId, unidadIds)))
              .orderBy(asc(leccion.orden))
          : [];
      const leccionIds = leccionesList.map((l) => l.id);

      const [materialesList, quizzesList, tareasList, anunciosList, inscripcionesList] =
        await Promise.all([
          leccionIds.length > 0
            ? db
                .select()
                .from(material)
                .where(and(eq(material.tenantId, tenantId), inArray(material.leccionId, leccionIds)))
                .orderBy(asc(material.orden))
            : Promise.resolve([]),
          leccionIds.length > 0
            ? db
                .select()
                .from(quiz)
                .where(and(eq(quiz.tenantId, tenantId), inArray(quiz.leccionId, leccionIds)))
            : Promise.resolve([]),
          db
            .select()
            .from(tarea)
            .where(and(eq(tarea.tenantId, tenantId), eq(tarea.cursoId, cursoId))),
          db
            .select()
            .from(anuncio)
            .where(and(eq(anuncio.tenantId, tenantId), eq(anuncio.cursoId, cursoId))),
          db
            .select()
            .from(inscripcionCurso)
            .where(and(eq(inscripcionCurso.tenantId, tenantId), eq(inscripcionCurso.cursoId, cursoId))),
        ]);

      const quizIds = quizzesList.map((q) => q.id);
      const preguntasList =
        quizIds.length > 0
          ? await db
              .select()
              .from(pregunta)
              .where(inArray(pregunta.quizId, quizIds))
              .orderBy(asc(pregunta.orden))
          : [];

      const snapshot = {
        exportedAt: new Date().toISOString(),
        curso: existing,
        totalInscritos: inscripcionesList.length,
        unidades: unidadesList.map((u) => ({
          ...u,
          lecciones: leccionesList
            .filter((l) => l.unidadId === u.id)
            .map((l) => ({
              ...l,
              materiales: materialesList.filter((m) => m.leccionId === l.id),
              quizzes: quizzesList
                .filter((q) => q.leccionId === l.id)
                .map((q) => ({
                  ...q,
                  preguntas: preguntasList.filter((p) => p.quizId === q.id),
                })),
            })),
        })),
        tareas: tareasList,
        anuncios: anunciosList,
      };

      const [savedBackup] = await db
        .insert(cursoBackup)
        .values({
          tenantId,
          cursoOriginalId: existing.id,
          cursoNombre: existing.nombre,
          cursoNivel: existing.nivel,
          motivo: String(req.body?.motivo || '').trim(),
          eliminadoPorId: sub,
          eliminadoPorNombre: actorNombre,
          snapshot,
        })
        .returning();

      if (!savedBackup) {
        return res
          .status(500)
          .json({ error: 'No se pudo generar el respaldo previo. El curso no fue eliminado.' });
      }

      // 2. Eliminar curso tras confirmar respaldo guardado
      await db
        .delete(curso)
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)));

      return res.json({
        ok: true,
        backup: {
          id: savedBackup.id,
          cursoNombre: savedBackup.cursoNombre,
          motivo: savedBackup.motivo,
          createdAt: savedBackup.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Error deleting curso with backup:', error);
      return res.status(500).json({ error: 'No se pudo eliminar el curso.' });
    }
  },
);

// POST /api/cursos/:id/publicar
cursosRouter.post(
  '/cursos/:id/publicar',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      if (!isValidUuid(cursoId)) return res.status(400).json({ error: 'ID inválido.' });

      const { tenantId, rol, sub } = req.aulaUser!;
      const [existing] = await db
        .select()
        .from(curso)
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
        .limit(1);

      if (!existing) return res.status(404).json({ error: 'Curso no encontrado.' });
      if (rol === 'PROFESOR' && existing.profesorId !== sub) {
        return res.status(403).json({ error: 'Sin permisos para publicar este curso.' });
      }

      const [updated] = await db
        .update(curso)
        .set({ estado: 'PUBLICADO', updatedAt: new Date() })
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
        .returning();

      return res.json({ curso: updated });
    } catch (error) {
      console.error('Error publishing curso:', error);
      return res.status(500).json({ error: 'No se pudo publicar el curso.' });
    }
  },
);

// GET /api/cursos/:id/inscripciones — participantes del curso + progreso resumido
cursosRouter.get(
  '/cursos/:id/inscripciones',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      if (!isValidUuid(cursoId)) return res.status(400).json({ error: 'ID inválido.' });

      const { tenantId } = req.aulaUser!;
      const rows = await db
        .select({
          inscripcionId: inscripcionCurso.id,
          estado: inscripcionCurso.estado,
          origen: inscripcionCurso.origen,
          fechaAlta: inscripcionCurso.fechaAlta,
          fechaBaja: inscripcionCurso.fechaBaja,
          estudiante: estudianteRef,
        })
        .from(inscripcionCurso)
        .innerJoin(estudianteRef, eq(inscripcionCurso.estudianteId, estudianteRef.id))
        .where(and(eq(inscripcionCurso.tenantId, tenantId), eq(inscripcionCurso.cursoId, cursoId)))
        .orderBy(asc(estudianteRef.apellidos), asc(estudianteRef.nombres));

      const unidades = await db
        .select({ id: unidad.id })
        .from(unidad)
        .where(and(eq(unidad.tenantId, tenantId), eq(unidad.cursoId, cursoId)));
      const unidadIds = unidades.map((u) => u.id);

      const publishedLecciones =
        unidadIds.length > 0
          ? await db
              .select({ id: leccion.id })
              .from(leccion)
              .where(
                and(
                  eq(leccion.tenantId, tenantId),
                  inArray(leccion.unidadId, unidadIds),
                  eq(leccion.publicada, true),
                ),
              )
          : [];
      const publishedIds = publishedLecciones.map((l) => l.id);

      const estIds = rows.map((r) => r.estudiante.id);
      const progresos =
        estIds.length > 0 && publishedIds.length > 0
          ? await db
              .select()
              .from(progresoLeccion)
              .where(
                and(
                  eq(progresoLeccion.tenantId, tenantId),
                  inArray(progresoLeccion.estudianteId, estIds),
                  inArray(progresoLeccion.leccionId, publishedIds),
                  eq(progresoLeccion.estado, 'COMPLETADA'),
                ),
              )
          : [];

      const participantes = rows.map((r) => {
        const doneIds = progresos
          .filter((p) => p.estudianteId === r.estudiante.id)
          .map((p) => p.leccionId);
        return {
          inscripcionId: r.inscripcionId,
          estado: r.estado,
          origen: r.origen,
          fechaAlta: r.fechaAlta,
          fechaBaja: r.fechaBaja,
          estudiante: r.estudiante,
          progresoPorcentaje: calculateCourseProgress(publishedIds, doneIds),
          leccionesCompletadas: doneIds.length,
          leccionesTotales: publishedIds.length,
        };
      });

      return res.json({ participantes });
    } catch (error) {
      console.error('Error fetching inscripciones:', error);
      return res.status(500).json({ error: 'No se pudieron cargar los participantes.' });
    }
  },
);

// GET /api/estudiantes-disponibles — lista espejos de ALLEN para inscripción manual
cursosRouter.get(
  '/estudiantes-disponibles',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const list = await db
        .select()
        .from(estudianteRef)
        .where(eq(estudianteRef.tenantId, tenantId))
        .orderBy(asc(estudianteRef.apellidos));
      return res.json({ estudiantes: list });
    } catch (error) {
      console.error('Error listing estudiantes disponibles:', error);
      return res.status(500).json({ error: 'No se pudo cargar el listado de estudiantes.' });
    }
  },
);

// POST /api/cursos/:id/inscripciones — inscripción manual (ADMIN y PROFESOR del curso)
cursosRouter.post(
  '/cursos/:id/inscripciones',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      const estudianteId = typeof req.body?.estudianteId === 'string' ? req.body.estudianteId : '';
      if (!isValidUuid(cursoId) || !isValidUuid(estudianteId)) {
        return res.status(400).json({ error: 'Identificadores inválidos.' });
      }

      const { tenantId, rol, sub } = req.aulaUser!;
      const [foundCurso] = await db
        .select()
        .from(curso)
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
        .limit(1);
      if (!foundCurso) {
        return res.status(404).json({ error: 'Curso no encontrado.' });
      }
      if (rol === 'PROFESOR' && foundCurso.profesorId && foundCurso.profesorId !== sub) {
        return res.status(403).json({ error: 'Solo el docente asignado puede inscribir estudiantes en este curso.' });
      }

      const [foundEst] = await db
        .select()
        .from(estudianteRef)
        .where(and(eq(estudianteRef.id, estudianteId), eq(estudianteRef.tenantId, tenantId)))
        .limit(1);

      if (!foundEst) {
        return res.status(404).json({ error: 'El estudiante no existe en el registro de tu institución.' });
      }

      const estadoInicial = req.body?.estado === 'PENDIENTE' ? 'PENDIENTE' : 'ACTIVO';

      const [insc] = await db
        .insert(inscripcionCurso)
        .values({
          tenantId,
          cursoId,
          estudianteId,
          estado: estadoInicial,
          origen: 'MANUAL',
        })
        .onConflictDoUpdate({
          target: [inscripcionCurso.cursoId, inscripcionCurso.estudianteId],
          set: { estado: estadoInicial, fechaBaja: null },
        })
        .returning();

      return res.status(201).json({ inscripcion: insc });
    } catch (error) {
      console.error('Error enrolling student:', error);
      return res.status(500).json({ error: 'No se pudo inscribir al estudiante.' });
    }
  },
);

// PATCH /api/cursos/:id/inscripciones/:inscripcionId/estado — Docente o Admin aprueba (ACTIVO) o rechaza (RETIRADO) matrícula
cursosRouter.patch(
  '/cursos/:id/inscripciones/:inscripcionId/estado',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      const inscripcionId = String(req.params.inscripcionId);
      if (!isValidUuid(cursoId) || !isValidUuid(inscripcionId)) {
        return res.status(400).json({ error: 'Identificadores inválidos.' });
      }

      const nuevoEstado = req.body?.estado;
      if (nuevoEstado !== 'ACTIVO' && nuevoEstado !== 'RETIRADO' && nuevoEstado !== 'PENDIENTE') {
        return res
          .status(400)
          .json({ error: 'Estado inválido. Usa ACTIVO, RETIRADO o PENDIENTE.' });
      }

      const { tenantId, rol, sub } = req.aulaUser!;

      const [foundCurso] = await db
        .select()
        .from(curso)
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
        .limit(1);
      if (!foundCurso) return res.status(404).json({ error: 'Curso no encontrado.' });
      if (rol === 'PROFESOR' && foundCurso.profesorId && foundCurso.profesorId !== sub) {
        return res
          .status(403)
          .json({ error: 'Solo el docente asignado a este curso puede aprobar matrículas.' });
      }

      const [updated] = await db
        .update(inscripcionCurso)
        .set({
          estado: nuevoEstado,
          fechaBaja: nuevoEstado === 'RETIRADO' ? new Date() : null,
        })
        .where(
          and(
            eq(inscripcionCurso.id, inscripcionId),
            eq(inscripcionCurso.cursoId, cursoId),
            eq(inscripcionCurso.tenantId, tenantId),
          ),
        )
        .returning();

      if (!updated) return res.status(404).json({ error: 'Inscripción no encontrada.' });

      if (nuevoEstado === 'ACTIVO') {
        await db.insert(notificacionAula).values({
          tenantId,
          destinatarioRol: 'ESTUDIANTE',
          destinatarioId: updated.estudianteId,
          tipo: 'ACADEMICO',
          titulo: 'Matrícula aprobada',
          mensaje: `Tu acceso al curso "${foundCurso.nombre}" fue aprobado por el docente. Ya puedes ingresar a las lecciones.`,
          accionNav: 'mis-cursos',
        });
      }

      return res.json({ inscripcion: updated });
    } catch (error) {
      console.error('Error updating enrollment status:', error);
      return res.status(500).json({ error: 'No se pudo actualizar el estado de la matrícula.' });
    }
  },
);

// DELETE /api/cursos/:id/inscripciones/:estudianteId — retira estudiante (borrado lógico)
cursosRouter.delete(
  '/cursos/:id/inscripciones/:estudianteId',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      const estudianteId = String(req.params.estudianteId);
      const { tenantId, rol, sub } = req.aulaUser!;

      if (rol === 'PROFESOR') {
        const [foundCurso] = await db
          .select()
          .from(curso)
          .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
          .limit(1);
        if (!foundCurso || (foundCurso.profesorId && foundCurso.profesorId !== sub)) {
          return res.status(403).json({ error: 'Solo el docente asignado puede retirar estudiantes de este curso.' });
        }
      }

      await db
        .update(inscripcionCurso)
        .set({ estado: 'RETIRADO', fechaBaja: new Date() })
        .where(
          and(
            eq(inscripcionCurso.tenantId, tenantId),
            eq(inscripcionCurso.cursoId, cursoId),
            eq(inscripcionCurso.estudianteId, estudianteId),
          ),
        );

      return res.json({ ok: true });
    } catch (error) {
      console.error('Error removing enrollment:', error);
      return res.status(500).json({ error: 'No se pudo retirar al estudiante.' });
    }
  },
);

// GET /api/cursos/:id/calificaciones — libro de calificaciones del curso
cursosRouter.get(
  '/cursos/:id/calificaciones',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      if (!isValidUuid(cursoId)) return res.status(400).json({ error: 'ID inválido.' });

      const { tenantId, rol, sub, estudianteId } = req.aulaUser!;
      const estSelfId = estudianteId || sub;

      const tareasList = await db
        .select()
        .from(tarea)
        .where(and(eq(tarea.tenantId, tenantId), eq(tarea.cursoId, cursoId)))
        .orderBy(asc(tarea.createdAt));

      const unidades = await db
        .select({ id: unidad.id })
        .from(unidad)
        .where(and(eq(unidad.tenantId, tenantId), eq(unidad.cursoId, cursoId)));
      const unidadIds = unidades.map((u) => u.id);

      const lecciones =
        unidadIds.length > 0
          ? await db
              .select({ id: leccion.id })
              .from(leccion)
              .where(and(eq(leccion.tenantId, tenantId), inArray(leccion.unidadId, unidadIds)))
          : [];
      const leccionIds = lecciones.map((l) => l.id);

      const quizzesList =
        leccionIds.length > 0
          ? await db
              .select()
              .from(quiz)
              .where(and(eq(quiz.tenantId, tenantId), inArray(quiz.leccionId, leccionIds)))
          : [];

      const inscQuery =
        rol === 'ESTUDIANTE'
          ? db
              .select({ estudiante: estudianteRef })
              .from(inscripcionCurso)
              .innerJoin(estudianteRef, eq(inscripcionCurso.estudianteId, estudianteRef.id))
              .where(
                and(
                  eq(inscripcionCurso.tenantId, tenantId),
                  eq(inscripcionCurso.cursoId, cursoId),
                  eq(inscripcionCurso.estudianteId, estSelfId),
                ),
              )
          : db
              .select({ estudiante: estudianteRef })
              .from(inscripcionCurso)
              .innerJoin(estudianteRef, eq(inscripcionCurso.estudianteId, estudianteRef.id))
              .where(
                and(
                  eq(inscripcionCurso.tenantId, tenantId),
                  eq(inscripcionCurso.cursoId, cursoId),
                  eq(inscripcionCurso.estado, 'ACTIVO'),
                ),
              )
              .orderBy(asc(estudianteRef.apellidos));

      const inscritos = await inscQuery;
      const tareaIds = tareasList.map((t) => t.id);
      const quizIds = quizzesList.map((q) => q.id);

      const [entregasList, intentosList] = await Promise.all([
        tareaIds.length > 0
          ? db
              .select()
              .from(entrega)
              .where(and(eq(entrega.tenantId, tenantId), inArray(entrega.tareaId, tareaIds)))
          : Promise.resolve([]),
        quizIds.length > 0
          ? db
              .select()
              .from(intentoQuiz)
              .where(and(eq(intentoQuiz.tenantId, tenantId), inArray(intentoQuiz.quizId, quizIds)))
          : Promise.resolve([]),
      ]);

      const filas = inscritos.map(({ estudiante }) => {
        const notasTareas = tareasList.map((t) => {
          const ent = entregasList.find(
            (e) => e.tareaId === t.id && e.estudianteId === estudiante.id,
          );
          return {
            tareaId: t.id,
            estado: ent?.estado || 'PENDIENTE',
            nota: ent?.nota ?? null,
            notaMaxima: t.notaMaxima,
          };
        });

        const notasQuizzes = quizzesList.map((q) => {
          const ints = intentosList.filter(
            (i) => i.quizId === q.id && i.estudianteId === estudiante.id && i.nota !== null,
          );
          const mejorNota =
            ints.length > 0 ? Math.max(...ints.map((i) => Number(i.nota ?? 0))) : null;
          return {
            quizId: q.id,
            intentos: ints.length,
            nota: mejorNota,
            notaMinima: q.notaMinima,
          };
        });

        const numericGrades = [
          ...notasTareas.filter((n) => n.nota !== null).map((n) => Number(n.nota)),
          ...notasQuizzes.filter((n) => n.nota !== null).map((n) => Number(n.nota)),
        ];
        const promedio =
          numericGrades.length > 0
            ? Math.round((numericGrades.reduce((a, b) => a + b, 0) / numericGrades.length) * 10) / 10
            : null;

        return {
          estudiante,
          notasTareas,
          notasQuizzes,
          promedio,
        };
      });

      return res.json({
        tareas: tareasList,
        quizzes: quizzesList,
        filas,
      });
    } catch (error) {
      console.error('Error fetching gradebook:', error);
      return res.status(500).json({ error: 'No se pudo cargar el libro de calificaciones.' });
    }
  },
);

// GET /api/estudiantes/:id/progreso — progreso individual (LOPDP: alumno solo ve sus datos)
cursosRouter.get(
  '/estudiantes/:id/progreso',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const targetId = String(req.params.id);
      if (!isValidUuid(targetId)) return res.status(400).json({ error: 'ID inválido.' });

      const { tenantId, rol, sub, estudianteId } = req.aulaUser!;
      if (rol === 'ESTUDIANTE' && targetId !== (estudianteId || sub)) {
        return res.status(403).json({ error: 'Solo puedes consultar tu propio progreso.' });
      }

      const [est] = await db
        .select()
        .from(estudianteRef)
        .where(and(eq(estudianteRef.id, targetId), eq(estudianteRef.tenantId, tenantId)))
        .limit(1);

      if (!est) return res.status(404).json({ error: 'Estudiante no encontrado.' });

      const [inscripciones, progresos, entregas, intentos] = await Promise.all([
        db
          .select({ inscripcion: inscripcionCurso, curso })
          .from(inscripcionCurso)
          .innerJoin(curso, eq(inscripcionCurso.cursoId, curso.id))
          .where(
            and(
              eq(inscripcionCurso.tenantId, tenantId),
              eq(inscripcionCurso.estudianteId, targetId),
            ),
          ),
        db
          .select({ progreso: progresoLeccion, leccion })
          .from(progresoLeccion)
          .innerJoin(leccion, eq(progresoLeccion.leccionId, leccion.id))
          .where(
            and(
              eq(progresoLeccion.tenantId, tenantId),
              eq(progresoLeccion.estudianteId, targetId),
            ),
          ),
        db
          .select({ entrega, tarea })
          .from(entrega)
          .innerJoin(tarea, eq(entrega.tareaId, tarea.id))
          .where(and(eq(entrega.tenantId, tenantId), eq(entrega.estudianteId, targetId)))
          .orderBy(desc(entrega.updatedAt)),
        db
          .select({ intento: intentoQuiz, quiz })
          .from(intentoQuiz)
          .innerJoin(quiz, eq(intentoQuiz.quizId, quiz.id))
          .where(and(eq(intentoQuiz.tenantId, tenantId), eq(intentoQuiz.estudianteId, targetId)))
          .orderBy(desc(intentoQuiz.inicioEn)),
      ]);

      return res.json({
        estudiante: est,
        cursos: inscripciones.map((i) => ({
          ...i.curso,
          estadoInscripcion: i.inscripcion.estado,
          origen: i.inscripcion.origen,
        })),
        progresos: progresos.map((p) => ({
          ...p.progreso,
          leccionTitulo: p.leccion.titulo,
        })),
        entregas: entregas.map((e) => ({
          ...e.entrega,
          tareaTitulo: e.tarea.titulo,
          notaMaxima: e.tarea.notaMaxima,
        })),
        intentos: intentos.map((i) => ({
          ...i.intento,
          quizTitulo: i.quiz.titulo,
          notaMinima: i.quiz.notaMinima,
        })),
      });
    } catch (error) {
      console.error('Error fetching student progress:', error);
      return res.status(500).json({ error: 'No se pudo cargar el progreso del estudiante.' });
    }
  },
);
