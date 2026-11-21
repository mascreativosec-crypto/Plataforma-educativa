import { and, asc, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import { db } from '../../db/index.ts';
import {
  curso,
  entrega,
  estudianteRef,
  inscripcionCurso,
  intentoQuiz,
  leccion,
  pregunta,
  quiz,
  tarea,
  unidad,
} from '../../db/schema.ts';
import { requireAuth, requireRole, type AuthRequest } from '../../middleware/auth.ts';
import {
  appendGradeHistoryEntry,
  evaluateGradeEditPermission,
  validateModificationReason,
} from '../../lib/grade-policy.ts';
import { isSafeHttpUrl } from '../../lib/media-embed.ts';
import { awardAcademicActivity } from '../services/gamificacion.service.ts';
import { gradeQuizAttempt, parseGoogleDriveUrl } from '../services/grading.ts';
import { enqueueOutboxEvent } from '../services/outbox.ts';
import { buildStorageKey, savePrivateBuffer, signDownloadToken } from '../services/storage.ts';

export const evaluacionesRouter = Router();

const submissionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// GET /api/tareas?cursoId=
evaluacionesRouter.get(
  '/tareas',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = typeof req.query.cursoId === 'string' ? req.query.cursoId : '';
      const { tenantId, rol, sub, estudianteId } = req.aulaUser!;

      if (!cursoId) {
        return res.status(400).json({ error: 'Indica el parámetro cursoId.' });
      }

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

      const conditions = [eq(tarea.tenantId, tenantId), eq(tarea.cursoId, cursoId)];
      if (rol === 'ESTUDIANTE') {
        conditions.push(eq(tarea.publicada, true));
      }

      const tareasList = await db
        .select()
        .from(tarea)
        .where(and(...conditions))
        .orderBy(desc(tarea.createdAt));

      return res.json({ tareas: tareasList });
    } catch (error) {
      console.error('Error listing tareas:', error);
      return res.status(500).json({ error: 'No se pudieron cargar las tareas.' });
    }
  },
);

// POST /api/tareas
evaluacionesRouter.post(
  '/tareas',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const cursoId = typeof req.body?.cursoId === 'string' ? req.body.cursoId : '';
      const leccionId =
        typeof req.body?.leccionId === 'string' && req.body.leccionId ? req.body.leccionId : null;
      const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
      const instrucciones =
        typeof req.body?.instrucciones === 'string' ? req.body.instrucciones.trim() : null;
      const tipoTarea = req.body?.tipoTarea === 'WRITING' ? 'WRITING' : 'TAREA';
      const nivelMcer =
        typeof req.body?.nivelMcer === 'string' && req.body.nivelMcer.trim()
          ? req.body.nivelMcer.trim().toUpperCase().slice(0, 20)
          : null;
      const minPalabras =
        Number.isFinite(Number(req.body?.minPalabras)) && Number(req.body?.minPalabras) > 0
          ? Math.round(Number(req.body.minPalabras))
          : null;
      const maxPalabras =
        Number.isFinite(Number(req.body?.maxPalabras)) && Number(req.body?.maxPalabras) > 0
          ? Math.round(Number(req.body.maxPalabras))
          : null;
      const notaMaxima = Number(req.body?.notaMaxima ?? 100);
      const venceEn =
        typeof req.body?.venceEn === 'string' && req.body.venceEn
          ? new Date(req.body.venceEn)
          : null;
      const permiteTardio = Boolean(req.body?.permiteTardio);
      const publicada = req.body?.publicada !== false;

      if (!cursoId || titulo.length < 3) {
        return res.status(400).json({ error: 'Ingresa curso y título válido para la tarea.' });
      }

      const [foundCurso] = await db
        .select()
        .from(curso)
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
        .limit(1);
      if (!foundCurso) return res.status(404).json({ error: 'Curso no encontrado.' });

      const [created] = await db
        .insert(tarea)
        .values({
          tenantId,
          cursoId,
          leccionId,
          titulo: titulo.slice(0, 200),
          instrucciones,
          tipoTarea,
          nivelMcer,
          minPalabras,
          maxPalabras,
          notaMaxima: Number.isFinite(notaMaxima) && notaMaxima > 0 ? notaMaxima : 100,
          venceEn,
          permiteTardio,
          publicada,
        })
        .returning();

      return res.status(201).json({ tarea: created });
    } catch (error) {
      console.error('Error creating tarea:', error);
      return res.status(500).json({ error: 'No se pudo crear la tarea.' });
    }
  },
);

// PATCH /api/tareas/:id
evaluacionesRouter.patch(
  '/tareas/:id',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const tareaId = String(req.params.id);
      const { tenantId } = req.aulaUser!;
      const patch: Record<string, unknown> = {};
      if (typeof req.body?.titulo === 'string' && req.body.titulo.trim().length >= 3) {
        patch.titulo = req.body.titulo.trim().slice(0, 200);
      }
      if (typeof req.body?.instrucciones === 'string') {
        patch.instrucciones = req.body.instrucciones.trim();
      }
      if (typeof req.body?.publicada === 'boolean') {
        patch.publicada = req.body.publicada;
      }

      const [updated] = await db
        .update(tarea)
        .set(patch)
        .where(and(eq(tarea.id, tareaId), eq(tarea.tenantId, tenantId)))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Tarea no encontrada.' });
      return res.json({ tarea: updated });
    } catch (error) {
      console.error('Error updating tarea:', error);
      return res.status(500).json({ error: 'No se pudo actualizar la tarea.' });
    }
  },
);

// POST /api/tareas/:id/entregas — entrega del estudiante (multipart o texto)
evaluacionesRouter.post(
  '/tareas/:id/entregas',
  requireAuth,
  requireRole('ESTUDIANTE'),
  submissionUpload.single('archivo'),
  async (req: AuthRequest, res) => {
    try {
      const tareaId = String(req.params.id);
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const estId = estudianteId || sub;

      const [foundTarea] = await db
        .select()
        .from(tarea)
        .where(and(eq(tarea.id, tareaId), eq(tarea.tenantId, tenantId)))
        .limit(1);
      if (!foundTarea || !foundTarea.publicada) {
        return res.status(404).json({ error: 'Tarea no disponible.' });
      }

      const [insc] = await db
        .select()
        .from(inscripcionCurso)
        .where(
          and(
            eq(inscripcionCurso.tenantId, tenantId),
            eq(inscripcionCurso.cursoId, foundTarea.cursoId),
            eq(inscripcionCurso.estudianteId, estId),
            eq(inscripcionCurso.estado, 'ACTIVO'),
          ),
        )
        .limit(1);
      if (!insc) return res.status(403).json({ error: 'No estás inscrito en este curso.' });

      const now = new Date();
      const isLate = Boolean(foundTarea.venceEn && now.getTime() > foundTarea.venceEn.getTime());
      if (isLate && !foundTarea.permiteTardio) {
        return res.status(400).json({ error: 'El plazo de entrega de esta tarea ya venció.' });
      }

      const comentario =
        typeof req.body?.comentario === 'string' ? req.body.comentario.trim() : null;
      const enlaceDrive =
        typeof req.body?.enlaceDrive === 'string' && /^https?:\/\//i.test(req.body.enlaceDrive.trim())
          ? req.body.enlaceDrive.trim()
          : null;
      let archivoUrl: string | null =
        enlaceDrive ||
        (typeof req.body?.archivoNombre === 'string' && req.body.archivoNombre.trim()
          ? `demo://${req.body.archivoNombre.trim()}`
          : null);

      if (req.file) {
        const key = buildStorageKey(tenantId, foundTarea.cursoId, req.file.originalname);
        savePrivateBuffer(key, req.file.buffer);
        archivoUrl = key;
      }

      if (!comentario && !archivoUrl) {
        return res
          .status(400)
          .json({ error: 'Incluye tu redacción, un enlace de Drive o adjunta un archivo.' });
      }

      const estadoFinal = isLate ? 'TARDIO' : 'ENTREGADO';

      const [saved] = await db
        .insert(entrega)
        .values({
          tenantId,
          tareaId,
          estudianteId: estId,
          archivoUrl,
          comentario,
          estado: estadoFinal,
          entregadoEn: now,
        })
        .onConflictDoUpdate({
          target: [entrega.tareaId, entrega.estudianteId],
          set: {
            archivoUrl: archivoUrl ?? undefined,
            comentario,
            estado: estadoFinal,
            entregadoEn: now,
            updatedAt: now,
          },
        })
        .returning();

      let gamificacion = null;
      if (!isLate) {
        gamificacion = await awardAcademicActivity({
          tenantId,
          estudianteId: estId,
          fuente: 'TAREA',
          referenciaId: tareaId,
          descripcion: `Tarea entregada a tiempo: ${foundTarea.titulo}`,
          habilidadMcer: foundTarea.tipoTarea === 'WRITING' ? 'WRITING' : null,
          esWriting: foundTarea.tipoTarea === 'WRITING',
        }).catch((err) => {
          console.error('Gamification hook error on task submission:', err);
          return null;
        });
      }

      return res.status(201).json({ entrega: saved, gamificacion });
    } catch (error) {
      console.error('Error submitting entrega:', error);
      return res.status(500).json({ error: 'No se pudo registrar tu entrega.' });
    }
  },
);

// GET /api/tareas/:id/entregas — bandeja de entregas para docente
evaluacionesRouter.get(
  '/tareas/:id/entregas',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const tareaId = String(req.params.id);
      const { tenantId } = req.aulaUser!;

      const rows = await db
        .select({
          entrega,
          estudiante: estudianteRef,
        })
        .from(entrega)
        .innerJoin(estudianteRef, eq(entrega.estudianteId, estudianteRef.id))
        .where(and(eq(entrega.tenantId, tenantId), eq(entrega.tareaId, tareaId)))
        .orderBy(desc(entrega.entregadoEn));

      return res.json({
        entregas: rows.map((r) => ({
          ...r.entrega,
          estudiante: r.estudiante,
        })),
      });
    } catch (error) {
      console.error('Error listing entregas:', error);
      return res.status(500).json({ error: 'No se pudieron cargar las entregas.' });
    }
  },
);

// GET /api/cursos/:id/entregas — todas las entregas de un curso para bandeja docente
evaluacionesRouter.get(
  '/cursos/:id/entregas',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      const { tenantId } = req.aulaUser!;

      const rows = await db
        .select({
          entrega,
          tarea,
          estudiante: estudianteRef,
        })
        .from(entrega)
        .innerJoin(tarea, eq(entrega.tareaId, tarea.id))
        .innerJoin(estudianteRef, eq(entrega.estudianteId, estudianteRef.id))
        .where(and(eq(entrega.tenantId, tenantId), eq(tarea.cursoId, cursoId)))
        .orderBy(desc(entrega.entregadoEn));

      return res.json({
        entregas: rows.map((r) => ({
          ...r.entrega,
          tareaTitulo: r.tarea.titulo,
          tipoTarea: r.tarea.tipoTarea,
          nivelMcer: r.tarea.nivelMcer,
          instrucciones: r.tarea.instrucciones,
          notaMaxima: r.tarea.notaMaxima,
          estudiante: r.estudiante,
        })),
      });
    } catch (error) {
      console.error('Error listing curso entregas:', error);
      return res.status(500).json({ error: 'No se pudo cargar la bandeja de entregas.' });
    }
  },
);

// GET /api/entregas/:id/archivo — enlace seguro (10 min) o descarga Drive del archivo entregado
evaluacionesRouter.get(
  '/entregas/:id/archivo',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const entregaId = String(req.params.id);
      const { tenantId, rol, sub, estudianteId } = req.aulaUser!;

      const [found] = await db
        .select()
        .from(entrega)
        .where(and(eq(entrega.id, entregaId), eq(entrega.tenantId, tenantId)))
        .limit(1);

      if (!found || !found.archivoUrl) {
        return res.status(404).json({ error: 'Esta entrega no tiene archivo adjunto.' });
      }
      if (rol === 'ESTUDIANTE' && found.estudianteId !== (estudianteId || sub)) {
        return res.status(403).json({ error: 'Solo puedes descargar tus propias entregas.' });
      }

      if (/^https?:\/\//i.test(found.archivoUrl)) {
        const parsed = parseGoogleDriveUrl(found.archivoUrl);
        return res.json({
          url: parsed.isDrive ? parsed.downloadUrl : found.archivoUrl,
          previewUrl: parsed.previewUrl,
          externo: true,
        });
      }

      const token = signDownloadToken({
        tenantId,
        storageKey: found.archivoUrl,
        filename: `entrega-${found.id.slice(0, 8)}`,
        mimeType: 'application/octet-stream',
      });
      return res.json({
        url: `/api/materiales/archivo/${token}`,
        externo: false,
      });
    } catch (error) {
      console.error('Error downloading submission file:', error);
      return res.status(500).json({ error: 'No se pudo obtener el archivo de la entrega.' });
    }
  },
);

// PATCH /api/entregas/:id/calificar — califica entrega con protocolo de 48 horas + historial + Outbox ALLEN
evaluacionesRouter.patch(
  '/entregas/:id/calificar',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const entregaId = String(req.params.id);
      const { tenantId, sub, rol, nombre: actorNombre } = req.aulaUser!;

      const nota = Number(req.body?.nota);
      const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : null;
      const motivoRaw = req.body?.motivoCambio;

      if (!Number.isFinite(nota) || nota < 0 || nota > 100) {
        return res.status(400).json({ error: 'La nota debe ser un número entre 0 y 100.' });
      }

      const [existing] = await db
        .select({ entrega, tarea })
        .from(entrega)
        .innerJoin(tarea, eq(entrega.tareaId, tarea.id))
        .where(and(eq(entrega.id, entregaId), eq(entrega.tenantId, tenantId)))
        .limit(1);

      if (!existing) return res.status(404).json({ error: 'Entrega no encontrada.' });

      const now = new Date();
      const settledAt = existing.entrega.notaAsentadaEn || existing.entrega.calificadoEn;
      const permission = evaluateGradeEditPermission({
        rol,
        existingNota: existing.entrega.nota,
        notaAsentadaEn: settledAt,
        now,
      });

      if (!permission.canEdit) {
        return res.status(403).json({
          error:
            'Han transcurrido más de 48 horas desde que se asentó la calificación. Solo el Administrador Total puede modificar esta nota.',
          lockedAfter48h: true,
        });
      }

      let motivoFinal = 'Calificación inicial registrada.';
      if (permission.requiresReason) {
        const reasonCheck = validateModificationReason(motivoRaw);
        if (!reasonCheck.valid) {
          return res.status(400).json({ error: reasonCheck.error });
        }
        motivoFinal = reasonCheck.cleaned;
      }

      const nextHistory = appendGradeHistoryEntry(existing.entrega.historialNotas, {
        fecha: now.toISOString(),
        actorId: sub,
        actorNombre,
        actorRol: rol,
        notaAnterior: existing.entrega.nota,
        notaNueva: nota,
        motivo: motivoFinal,
      });

      const [updated] = await db
        .update(entrega)
        .set({
          nota,
          feedback,
          estado: 'CALIFICADO',
          calificadoPor: sub,
          calificadoEn: now,
          notaAsentadaEn: settledAt || now,
          ultimoMotivoCambio: permission.requiresReason ? motivoFinal : existing.entrega.ultimoMotivoCambio,
          historialNotas: nextHistory,
          updatedAt: now,
        })
        .where(and(eq(entrega.id, entregaId), eq(entrega.tenantId, tenantId)))
        .returning();

      // Outbox §8.4: nota.publicada hacia ALLEN
      const evento = await enqueueOutboxEvent(tenantId, 'nota.publicada', {
        tenantId,
        estudianteId: updated.estudianteId,
        claseId: null,
        tipo: 'EVALUACION',
        actividad: existing.tarea.titulo,
        fecha: now.toISOString().slice(0, 10),
        nota,
        peso: 10,
        origen: 'AULA',
        origenId: updated.id,
      });

      return res.json({ entrega: updated, eventoOutbox: evento });
    } catch (error) {
      console.error('Error grading entrega:', error);
      return res.status(500).json({ error: 'No se pudo guardar la calificación.' });
    }
  },
);

// POST /api/quizzes — crea examen/cuestionario interactivo estilo Moodle 5.0 + Cuestia + MCER Cambridge
evaluacionesRouter.post(
  '/quizzes',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const leccionId = typeof req.body?.leccionId === 'string' ? req.body.leccionId : '';
      const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
      const descripcion =
        typeof req.body?.descripcion === 'string' && req.body.descripcion.trim()
          ? req.body.descripcion.trim()
          : null;
      const intentosMax = Math.max(1, Math.min(10, Number(req.body?.intentosMax ?? 1)));
      const notaMinima = Math.max(0, Math.min(100, Number(req.body?.notaMinima ?? 70)));
      const tiempoLimiteMin =
        Number.isFinite(Number(req.body?.tiempoLimiteMin)) && Number(req.body?.tiempoLimiteMin) > 0
          ? Math.min(240, Math.round(Number(req.body.tiempoLimiteMin)))
          : null;
      const abrirEn =
        typeof req.body?.abrirEn === 'string' && req.body.abrirEn ? new Date(req.body.abrirEn) : null;
      const cerrarEn =
        typeof req.body?.cerrarEn === 'string' && req.body.cerrarEn
          ? new Date(req.body.cerrarEn)
          : null;
      const envioAutomatico = req.body?.envioAutomatico !== false;
      const modo = req.body?.modo === 'PRACTICA' ? 'PRACTICA' : 'EXAMEN';
      const mezclarPreguntas = Boolean(req.body?.mezclarPreguntas);
      const nivelMcer =
        typeof req.body?.nivelMcer === 'string' && req.body.nivelMcer.trim()
          ? req.body.nivelMcer.trim().toUpperCase().slice(0, 20)
          : null;
      const habilidadCambridge =
        typeof req.body?.habilidadCambridge === 'string' && req.body.habilidadCambridge.trim()
          ? req.body.habilidadCambridge.trim().toUpperCase().slice(0, 30)
          : null;
      const rawPolitica = typeof req.body?.politicaSalida === 'string' ? req.body.politicaSalida : '';
      const politicaSalida =
        rawPolitica === 'SOLO_REGISTRO' ||
        rawPolitica === 'ADVERTENCIA_LIMITE' ||
        rawPolitica === 'ANULAR_CON_CERO'
          ? rawPolitica
          : 'ADVERTENCIA_LIMITE';
      const maxCambiosPestana = Math.max(
        2,
        Math.min(10, Math.round(Number(req.body?.maxCambiosPestana ?? 3) || 3)),
      );
      const publicada = req.body?.publicada !== false;
      const preguntasInput = Array.isArray(req.body?.preguntas) ? req.body.preguntas : [];

      if (!leccionId || titulo.length < 3 || preguntasInput.length === 0) {
        return res
          .status(400)
          .json({ error: 'Indica lección, título y al menos una pregunta para el examen.' });
      }

      const VALID_TIPOS = new Set([
        'OPCION_MULTIPLE',
        'SELECCION_MULTIPLE',
        'UNIR_PAREJAS',
        'COMPLETAR_ESPACIOS',
        'ORDENAR_PALABRAS',
        'ORDENAR_ORACIONES',
        'RELACIONAR_COLUMNAS',
        'COMPLETAR_OPCIONES',
        'VERDADERO_FALSO',
        'RESPUESTA_CORTA',
        'WRITING',
      ]);

      for (const p of preguntasInput) {
        if (!p || !VALID_TIPOS.has(String(p.tipo))) {
          return res.status(400).json({ error: 'Tipo de pregunta no soportado.' });
        }
        if (!String(p.enunciado || '').trim()) {
          return res.status(400).json({ error: 'Todas las preguntas deben incluir enunciado.' });
        }
        if (typeof p.audioUrl === 'string' && p.audioUrl.trim() && !isSafeHttpUrl(p.audioUrl)) {
          return res.status(400).json({ error: 'El enlace de audio debe usar https:// o http://.' });
        }
        if (typeof p.videoUrl === 'string' && p.videoUrl.trim() && !isSafeHttpUrl(p.videoUrl)) {
          return res.status(400).json({ error: 'El enlace de video debe usar https:// o http://.' });
        }
      }

      const [foundLec] = await db
        .select()
        .from(leccion)
        .where(and(eq(leccion.id, leccionId), eq(leccion.tenantId, tenantId)))
        .limit(1);
      if (!foundLec) return res.status(404).json({ error: 'Lección no encontrada.' });

      const [createdQuiz] = await db
        .insert(quiz)
        .values({
          tenantId,
          leccionId,
          titulo: titulo.slice(0, 200),
          descripcion,
          intentosMax,
          notaMinima,
          tiempoLimiteMin,
          abrirEn,
          cerrarEn,
          envioAutomatico,
          modo,
          mezclarPreguntas,
          nivelMcer,
          habilidadCambridge,
          politicaSalida,
          maxCambiosPestana,
          publicada,
        })
        .returning();

      const insertedPreguntas = await db
        .insert(pregunta)
        .values(
          preguntasInput.map(
            (
              p: {
                enunciado: string;
                tipo:
                  | 'OPCION_MULTIPLE'
                  | 'SELECCION_MULTIPLE'
                  | 'UNIR_PAREJAS'
                  | 'COMPLETAR_ESPACIOS'
                  | 'ORDENAR_PALABRAS'
                  | 'ORDENAR_ORACIONES'
                  | 'RELACIONAR_COLUMNAS'
                  | 'COMPLETAR_OPCIONES'
                  | 'VERDADERO_FALSO'
                  | 'RESPUESTA_CORTA'
                  | 'WRITING';
                opciones?: unknown;
                respuestaCorrecta: unknown;
                audioUrl?: string | null;
                videoUrl?: string | null;
                retroalimentacion?: string | null;
                minPalabras?: number | null;
                maxPalabras?: number | null;
                puntos?: number;
              },
              idx: number,
            ) => ({
              quizId: createdQuiz.id,
              orden: idx + 1,
              enunciado: String(p.enunciado || '').trim(),
              tipo: p.tipo,
              opciones: p.opciones ?? null,
              respuestaCorrecta: p.respuestaCorrecta ?? '',
              audioUrl:
                typeof p.audioUrl === 'string' && p.audioUrl.trim() ? p.audioUrl.trim() : null,
              videoUrl:
                typeof p.videoUrl === 'string' && p.videoUrl.trim() ? p.videoUrl.trim() : null,
              retroalimentacion:
                typeof p.retroalimentacion === 'string' && p.retroalimentacion.trim()
                  ? p.retroalimentacion.trim()
                  : null,
              minPalabras:
                p.tipo === 'WRITING' && Number(p.minPalabras) > 0
                  ? Math.round(Number(p.minPalabras))
                  : null,
              maxPalabras:
                p.tipo === 'WRITING' && Number(p.maxPalabras) > 0
                  ? Math.round(Number(p.maxPalabras))
                  : null,
              puntos: Number(p.puntos) > 0 ? Number(p.puntos) : 1,
            }),
          ),
        )
        .returning();

      return res.status(201).json({ quiz: { ...createdQuiz, preguntas: insertedPreguntas } });
    } catch (error) {
      console.error('Error creating quiz:', error);
      return res.status(500).json({ error: 'No se pudo crear el examen.' });
    }
  },
);

// PATCH /api/quizzes/:id — Actualiza examen/cuestionario, sus preguntas y estado borrador/publicado
evaluacionesRouter.patch(
  '/quizzes/:id',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const quizId = String(req.params.id);
      const { tenantId, rol, sub } = req.aulaUser!;

      const [existing] = await db
        .select({
          quiz,
          profesorId: curso.profesorId,
        })
        .from(quiz)
        .innerJoin(leccion, eq(quiz.leccionId, leccion.id))
        .innerJoin(unidad, eq(leccion.unidadId, unidad.id))
        .innerJoin(curso, eq(unidad.cursoId, curso.id))
        .where(and(eq(quiz.id, quizId), eq(quiz.tenantId, tenantId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'Examen no encontrado.' });
      }
      if (rol === 'PROFESOR' && existing.profesorId && existing.profesorId !== sub) {
        return res.status(403).json({ error: 'No tienes permisos para editar este examen.' });
      }

      const patch: Record<string, unknown> = {};
      if (typeof req.body?.titulo === 'string' && req.body.titulo.trim().length >= 3) {
        patch.titulo = req.body.titulo.trim().slice(0, 200);
      }
      if (req.body?.descripcion !== undefined) {
        patch.descripcion =
          typeof req.body.descripcion === 'string' && req.body.descripcion.trim()
            ? req.body.descripcion.trim()
            : null;
      }
      if (typeof req.body?.leccionId === 'string' && req.body.leccionId.trim()) {
        const [foundLec] = await db
          .select()
          .from(leccion)
          .where(and(eq(leccion.id, req.body.leccionId.trim()), eq(leccion.tenantId, tenantId)))
          .limit(1);
        if (foundLec) {
          patch.leccionId = foundLec.id;
        }
      }
      if (req.body?.intentosMax !== undefined) {
        patch.intentosMax = Math.max(1, Math.min(10, Number(req.body.intentosMax) || 1));
      }
      if (req.body?.notaMinima !== undefined) {
        patch.notaMinima = Math.max(0, Math.min(100, Number(req.body.notaMinima) || 70));
      }
      if (req.body?.tiempoLimiteMin !== undefined) {
        patch.tiempoLimiteMin =
          req.body.tiempoLimiteMin === null || req.body.tiempoLimiteMin === ''
            ? null
            : Number.isFinite(Number(req.body.tiempoLimiteMin)) && Number(req.body.tiempoLimiteMin) > 0
              ? Math.min(240, Math.round(Number(req.body.tiempoLimiteMin)))
              : null;
      }
      if (req.body?.abrirEn !== undefined) {
        patch.abrirEn =
          typeof req.body.abrirEn === 'string' && req.body.abrirEn ? new Date(req.body.abrirEn) : null;
      }
      if (req.body?.cerrarEn !== undefined) {
        patch.cerrarEn =
          typeof req.body.cerrarEn === 'string' && req.body.cerrarEn
            ? new Date(req.body.cerrarEn)
            : null;
      }
      if (typeof req.body?.envioAutomatico === 'boolean') {
        patch.envioAutomatico = req.body.envioAutomatico;
      }
      if (req.body?.modo === 'EXAMEN' || req.body?.modo === 'PRACTICA') {
        patch.modo = req.body.modo;
      }
      if (typeof req.body?.mezclarPreguntas === 'boolean') {
        patch.mezclarPreguntas = req.body.mezclarPreguntas;
      }
      if (req.body?.nivelMcer !== undefined) {
        patch.nivelMcer =
          typeof req.body.nivelMcer === 'string' && req.body.nivelMcer.trim()
            ? req.body.nivelMcer.trim().toUpperCase().slice(0, 20)
            : null;
      }
      if (req.body?.habilidadCambridge !== undefined) {
        patch.habilidadCambridge =
          typeof req.body.habilidadCambridge === 'string' && req.body.habilidadCambridge.trim()
            ? req.body.habilidadCambridge.trim().toUpperCase().slice(0, 30)
            : null;
      }
      if (
        req.body?.politicaSalida === 'SOLO_REGISTRO' ||
        req.body?.politicaSalida === 'ADVERTENCIA_LIMITE' ||
        req.body?.politicaSalida === 'ANULAR_CON_CERO'
      ) {
        patch.politicaSalida = req.body.politicaSalida;
      }
      if (req.body?.maxCambiosPestana !== undefined) {
        patch.maxCambiosPestana = Math.max(
          2,
          Math.min(10, Math.round(Number(req.body.maxCambiosPestana) || 3)),
        );
      }
      if (typeof req.body?.publicada === 'boolean') {
        patch.publicada = req.body.publicada;
      }

      const VALID_TIPOS = new Set([
        'OPCION_MULTIPLE',
        'SELECCION_MULTIPLE',
        'UNIR_PAREJAS',
        'COMPLETAR_ESPACIOS',
        'ORDENAR_PALABRAS',
        'ORDENAR_ORACIONES',
        'RELACIONAR_COLUMNAS',
        'COMPLETAR_OPCIONES',
        'VERDADERO_FALSO',
        'RESPUESTA_CORTA',
        'WRITING',
      ]);

      const preguntasInput = Array.isArray(req.body?.preguntas) ? req.body.preguntas : null;
      if (preguntasInput) {
        if (preguntasInput.length === 0) {
          return res.status(400).json({ error: 'El examen debe incluir al menos una pregunta.' });
        }
        for (const p of preguntasInput) {
          if (!p || !VALID_TIPOS.has(String(p.tipo))) {
            return res.status(400).json({ error: 'Tipo de pregunta no soportado.' });
          }
          if (!String(p.enunciado || '').trim()) {
            return res.status(400).json({ error: 'Todas las preguntas deben incluir enunciado.' });
          }
          if (typeof p.audioUrl === 'string' && p.audioUrl.trim() && !isSafeHttpUrl(p.audioUrl)) {
            return res.status(400).json({ error: 'El enlace de audio debe usar https:// o http://.' });
          }
          if (typeof p.videoUrl === 'string' && p.videoUrl.trim() && !isSafeHttpUrl(p.videoUrl)) {
            return res.status(400).json({ error: 'El enlace de video debe usar https:// o http://.' });
          }
        }
      }

      let updatedQuiz = existing.quiz;
      if (Object.keys(patch).length > 0) {
        const [saved] = await db
          .update(quiz)
          .set(patch)
          .where(and(eq(quiz.id, quizId), eq(quiz.tenantId, tenantId)))
          .returning();
        if (saved) updatedQuiz = saved;
      }

      let finalPreguntas;
      if (preguntasInput) {
        await db.delete(pregunta).where(eq(pregunta.quizId, quizId));
        finalPreguntas = await db
          .insert(pregunta)
          .values(
            preguntasInput.map(
              (
                p: {
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
                },
                idx: number,
              ) => ({
                quizId,
                orden: idx + 1,
                enunciado: String(p.enunciado || '').trim(),
                tipo: p.tipo,
                opciones: p.opciones ?? null,
                respuestaCorrecta: p.respuestaCorrecta ?? '',
                audioUrl:
                  typeof p.audioUrl === 'string' && p.audioUrl.trim() ? p.audioUrl.trim() : null,
                videoUrl:
                  typeof p.videoUrl === 'string' && p.videoUrl.trim() ? p.videoUrl.trim() : null,
                retroalimentacion:
                  typeof p.retroalimentacion === 'string' && p.retroalimentacion.trim()
                    ? p.retroalimentacion.trim()
                    : null,
                minPalabras:
                  p.tipo === 'WRITING' && Number(p.minPalabras) > 0
                    ? Math.round(Number(p.minPalabras))
                    : null,
                maxPalabras:
                  p.tipo === 'WRITING' && Number(p.maxPalabras) > 0
                    ? Math.round(Number(p.maxPalabras))
                    : null,
                puntos: Number(p.puntos) > 0 ? Number(p.puntos) : 1,
              }),
            ),
          )
          .returning();
      } else {
        finalPreguntas = await db
          .select()
          .from(pregunta)
          .where(eq(pregunta.quizId, quizId))
          .orderBy(asc(pregunta.orden));
      }

      return res.json({ quiz: { ...updatedQuiz, preguntas: finalPreguntas } });
    } catch (error) {
      console.error('Error updating quiz:', error);
      return res.status(500).json({ error: 'No se pudo actualizar el examen.' });
    }
  },
);

// POST /api/quizzes/:id/intentos — inicia intento verificando ventana temporal e intentosMax
evaluacionesRouter.post(
  '/quizzes/:id/intentos',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const quizId = String(req.params.id);
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const estId = estudianteId || sub;

      const [found] = await db
        .select({ quiz, cursoId: unidad.cursoId })
        .from(quiz)
        .innerJoin(leccion, eq(quiz.leccionId, leccion.id))
        .innerJoin(unidad, eq(leccion.unidadId, unidad.id))
        .where(and(eq(quiz.id, quizId), eq(quiz.tenantId, tenantId)))
        .limit(1);

      if (!found || !found.quiz.publicada) {
        return res.status(404).json({ error: 'Examen no disponible.' });
      }

      const now = Date.now();
      if (found.quiz.abrirEn && now < found.quiz.abrirEn.getTime()) {
        return res.status(403).json({
          error: 'Este examen aún no está abierto. Revisa la fecha de apertura.',
        });
      }
      if (found.quiz.cerrarEn && now > found.quiz.cerrarEn.getTime()) {
        return res.status(403).json({
          error: 'El plazo para rendir este examen ya cerró.',
        });
      }

      const [insc] = await db
        .select()
        .from(inscripcionCurso)
        .where(
          and(
            eq(inscripcionCurso.tenantId, tenantId),
            eq(inscripcionCurso.cursoId, found.cursoId),
            eq(inscripcionCurso.estudianteId, estId),
            eq(inscripcionCurso.estado, 'ACTIVO'),
          ),
        )
        .limit(1);
      if (!insc) return res.status(403).json({ error: 'No estás inscrito en este curso.' });

      const existentes = await db
        .select()
        .from(intentoQuiz)
        .where(
          and(
            eq(intentoQuiz.tenantId, tenantId),
            eq(intentoQuiz.quizId, quizId),
            eq(intentoQuiz.estudianteId, estId),
          ),
        );

      const enCurso = existentes.find((i) => i.estado === 'EN_CURSO');
      const rawPreguntas = await db
        .select({
          id: pregunta.id,
          quizId: pregunta.quizId,
          orden: pregunta.orden,
          enunciado: pregunta.enunciado,
          tipo: pregunta.tipo,
          opciones: pregunta.opciones,
          audioUrl: pregunta.audioUrl,
          videoUrl: pregunta.videoUrl,
          minPalabras: pregunta.minPalabras,
          maxPalabras: pregunta.maxPalabras,
          puntos: pregunta.puntos,
        })
        .from(pregunta)
        .where(eq(pregunta.quizId, quizId))
        .orderBy(asc(pregunta.orden));

      const preguntas = found.quiz.mezclarPreguntas
        ? [...rawPreguntas].sort(() => Math.random() - 0.5)
        : rawPreguntas;

      if (enCurso) {
        const expiraEn = found.quiz.tiempoLimiteMin
          ? new Date(enCurso.inicioEn.getTime() + found.quiz.tiempoLimiteMin * 60 * 1000).toISOString()
          : null;
        return res.json({ intento: enCurso, preguntas, expiraEn });
      }

      if (existentes.length >= found.quiz.intentosMax) {
        return res.status(400).json({
          error: `Has alcanzado el máximo de ${found.quiz.intentosMax} intento(s) permitido(s) para esta evaluación.`,
        });
      }

      const [created] = await db
        .insert(intentoQuiz)
        .values({
          tenantId,
          quizId,
          estudianteId: estId,
          estado: 'EN_CURSO',
        })
        .returning();

      const expiraEn = found.quiz.tiempoLimiteMin
        ? new Date(created.inicioEn.getTime() + found.quiz.tiempoLimiteMin * 60 * 1000).toISOString()
        : null;

      return res.status(201).json({ intento: created, preguntas, expiraEn });
    } catch (error) {
      console.error('Error starting quiz attempt:', error);
      return res.status(500).json({ error: 'No se pudo iniciar el intento del examen.' });
    }
  },
);

// POST /api/intentos/:id/evento-integridad — Registra cambio de pestaña, pérdida de foco o intento de salida
evaluacionesRouter.post(
  '/intentos/:id/evento-integridad',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const intentoId = String(req.params.id);
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const estId = estudianteId || sub;

      const rawTipo = typeof req.body?.tipo === 'string' ? req.body.tipo : '';
      const validEvents = new Set([
        'CAMBIO_PESTANA',
        'PERDIDA_FOCO',
        'INTENTO_SALIDA',
        'SALIDA_CONFIRMADA',
      ]);
      if (!validEvents.has(rawTipo)) {
        return res.status(400).json({ error: 'Tipo de evento de integridad inválido.' });
      }
      const detalle =
        typeof req.body?.detalle === 'string' ? req.body.detalle.trim().slice(0, 300) : undefined;

      const [found] = await db
        .select({ intento: intentoQuiz, quiz })
        .from(intentoQuiz)
        .innerJoin(quiz, eq(intentoQuiz.quizId, quiz.id))
        .where(and(eq(intentoQuiz.id, intentoId), eq(intentoQuiz.tenantId, tenantId)))
        .limit(1);

      if (!found) return res.status(404).json({ error: 'Intento no encontrado.' });
      if (found.intento.estudianteId !== estId) {
        return res.status(403).json({ error: 'Este intento pertenece a otro estudiante.' });
      }
      if (found.intento.estado !== 'EN_CURSO') {
        return res.json({
          registrado: false,
          cambiosPestanaCount: found.intento.cambiosPestanaCount,
        });
      }

      const prevEvents = Array.isArray(found.intento.eventosIntegridad)
        ? (found.intento.eventosIntegridad as Array<{ tipo: string; timestamp: string; detalle?: string }>)
        : [];
      const nextEvents = [
        ...prevEvents.slice(-49),
        {
          tipo: rawTipo,
          timestamp: new Date().toISOString(),
          ...(detalle ? { detalle } : {}),
        },
      ];

      const incrementTabCount = rawTipo === 'CAMBIO_PESTANA' || rawTipo === 'SALIDA_CONFIRMADA';
      const nextTabCount = found.intento.cambiosPestanaCount + (incrementTabCount ? 1 : 0);

      await db
        .update(intentoQuiz)
        .set({
          eventosIntegridad: nextEvents,
          cambiosPestanaCount: nextTabCount,
        })
        .where(and(eq(intentoQuiz.id, intentoId), eq(intentoQuiz.tenantId, tenantId)));

      return res.json({
        registrado: true,
        cambiosPestanaCount: nextTabCount,
        maxCambiosPestana: found.quiz.maxCambiosPestana,
        politicaSalida: found.quiz.politicaSalida,
      });
    } catch (error) {
      console.error('Error recording integrity event:', error);
      return res.status(500).json({ error: 'No se pudo registrar el evento de integridad.' });
    }
  },
);

// PATCH /api/intentos/:id/enviar — corrige preguntas objetivas, soporta anulación configurable, y notifica Outbox ALLEN
evaluacionesRouter.patch(
  '/intentos/:id/enviar',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const intentoId = String(req.params.id);
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const estId = estudianteId || sub;
      const respuestas =
        req.body?.respuestas && typeof req.body.respuestas === 'object'
          ? (req.body.respuestas as Record<string, unknown>)
          : {};
      const requestVoid = Boolean(req.body?.anuladoPorSalida);
      const motivoAnulacion =
        typeof req.body?.motivoAnulacion === 'string' && req.body.motivoAnulacion.trim()
          ? req.body.motivoAnulacion.trim().slice(0, 400)
          : null;
      const incomingEvents = Array.isArray(req.body?.eventosIntegridad)
        ? (req.body.eventosIntegridad as Array<{ tipo: string; timestamp: string; detalle?: string }>).slice(-50)
        : null;

      const [found] = await db
        .select({ intento: intentoQuiz, quiz })
        .from(intentoQuiz)
        .innerJoin(quiz, eq(intentoQuiz.quizId, quiz.id))
        .where(and(eq(intentoQuiz.id, intentoId), eq(intentoQuiz.tenantId, tenantId)))
        .limit(1);

      if (!found) return res.status(404).json({ error: 'Intento no encontrado.' });
      if (found.intento.estudianteId !== estId) {
        return res.status(403).json({ error: 'Este intento pertenece a otro estudiante.' });
      }
      if (found.intento.estado !== 'EN_CURSO') {
        return res.status(400).json({ error: 'Este intento ya fue enviado.' });
      }

      const preguntas = await db
        .select()
        .from(pregunta)
        .where(eq(pregunta.quizId, found.quiz.id))
        .orderBy(asc(pregunta.orden));

      const storedEvents = Array.isArray(found.intento.eventosIntegridad)
        ? (found.intento.eventosIntegridad as Array<{ tipo: string; timestamp: string; detalle?: string }>)
        : [];
      const mergedEvents =
        incomingEvents && incomingEvents.length > storedEvents.length ? incomingEvents : storedEvents;

      const shouldVoid = requestVoid && found.quiz.politicaSalida === 'ANULAR_CON_CERO';
      const now = new Date();

      if (shouldVoid) {
        const finalMotivo =
          motivoAnulacion ||
          'Intento anulado con calificación 0/100 conforme a la política de salida configurada por el docente.';

        const [updated] = await db
          .update(intentoQuiz)
          .set({
            estado: 'CALIFICADO',
            respuestas,
            nota: 0,
            notaAsentadaEn: now,
            requiereRevisionDocente: false,
            eventosIntegridad: mergedEvents,
            anuladoPorSalida: true,
            motivoAnulacion: finalMotivo,
            finEn: now,
          })
          .where(and(eq(intentoQuiz.id, intentoId), eq(intentoQuiz.tenantId, tenantId)))
          .returning();

        const evento = await enqueueOutboxEvent(tenantId, 'nota.publicada', {
          tenantId,
          estudianteId: estId,
          claseId: null,
          tipo: 'EVALUACION',
          actividad: found.quiz.titulo,
          fecha: now.toISOString().slice(0, 10),
          nota: 0,
          peso: 10,
          origen: 'AULA',
          origenId: updated.id,
        });

        return res.json({
          intento: updated,
          resultado: {
            puntosObtenidos: 0,
            puntosTotales: preguntas.reduce((acc, p) => acc + (Number(p.puntos) || 1), 0),
            nota: 0,
            aprobado: false,
            requiereRevisionDocente: false,
            anuladoPorSalida: true,
            motivoAnulacion: finalMotivo,
            detalle: [],
          },
          eventoOutbox: evento,
          gamificacion: null,
        });
      }

      const resultado = gradeQuizAttempt(
        preguntas.map((p) => ({
          id: p.id,
          tipo: p.tipo,
          respuestaCorrecta: p.respuestaCorrecta,
          puntos: p.puntos,
        })),
        respuestas,
        found.quiz.notaMinima,
      );

      const nuevoEstado = resultado.requiereRevisionDocente ? 'ENVIADO' : 'CALIFICADO';
      const [updated] = await db
        .update(intentoQuiz)
        .set({
          estado: nuevoEstado,
          respuestas,
          nota: resultado.requiereRevisionDocente ? null : resultado.nota,
          notaAsentadaEn: resultado.requiereRevisionDocente ? null : now,
          requiereRevisionDocente: resultado.requiereRevisionDocente,
          eventosIntegridad: mergedEvents,
          finEn: now,
        })
        .where(and(eq(intentoQuiz.id, intentoId), eq(intentoQuiz.tenantId, tenantId)))
        .returning();

      let evento = null;
      if (!resultado.requiereRevisionDocente) {
        evento = await enqueueOutboxEvent(tenantId, 'nota.publicada', {
          tenantId,
          estudianteId: estId,
          claseId: null,
          tipo: 'EVALUACION',
          actividad: found.quiz.titulo,
          fecha: now.toISOString().slice(0, 10),
          nota: resultado.nota,
          peso: 10,
          origen: 'AULA',
          origenId: updated.id,
        });
      }

      const revisionDetalle = resultado.detalle.map((d) => {
        const p = preguntas.find((q) => q.id === d.preguntaId);
        return {
          ...d,
          enunciado: p?.enunciado || '',
          tipo: p?.tipo || 'OPCION_MULTIPLE',
          retroalimentacion: p?.retroalimentacion || null,
          respuestaCorrecta: p?.tipo === 'WRITING' ? null : p?.respuestaCorrecta,
        };
      });

      let gamificacion = null;
      if (resultado.requiereRevisionDocente || resultado.aprobado) {
        gamificacion = await awardAcademicActivity({
          tenantId,
          estudianteId: estId,
          fuente: 'EXAMEN',
          referenciaId: found.quiz.id,
          descripcion: resultado.requiereRevisionDocente
            ? `Examen enviado: ${found.quiz.titulo}`
            : `Examen aprobado (${resultado.nota}/100): ${found.quiz.titulo}`,
          habilidadMcer: found.quiz.habilidadCambridge || null,
          esWriting: resultado.requiereRevisionDocente,
        }).catch((err) => {
          console.error('Gamification hook error on quiz submission:', err);
          return null;
        });
      }

      return res.json({
        intento: updated,
        resultado: {
          ...resultado,
          anuladoPorSalida: false,
          motivoAnulacion: null,
          detalle: revisionDetalle,
        },
        eventoOutbox: evento,
        gamificacion,
      });
    } catch (error) {
      console.error('Error submitting quiz attempt:', error);
      return res.status(500).json({ error: 'No se pudo corregir y enviar el examen.' });
    }
  },
);

// GET /api/cursos/:id/intentos-revision — Intentos de examen con Writing, anulaciones o eventos de integridad para revisión docente
evaluacionesRouter.get(
  '/cursos/:id/intentos-revision',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      const { tenantId } = req.aulaUser!;

      const rows = await db
        .select({
          intento: intentoQuiz,
          quiz,
          estudiante: estudianteRef,
        })
        .from(intentoQuiz)
        .innerJoin(quiz, eq(intentoQuiz.quizId, quiz.id))
        .innerJoin(leccion, eq(quiz.leccionId, leccion.id))
        .innerJoin(unidad, eq(leccion.unidadId, unidad.id))
        .innerJoin(estudianteRef, eq(intentoQuiz.estudianteId, estudianteRef.id))
        .where(
          and(
            eq(intentoQuiz.tenantId, tenantId),
            eq(unidad.cursoId, cursoId),
          ),
        )
        .orderBy(desc(intentoQuiz.finEn));

      const filtered = rows.filter(
        (r) =>
          r.intento.estado !== 'EN_CURSO' &&
          (r.intento.requiereRevisionDocente ||
            r.intento.anuladoPorSalida ||
            r.intento.cambiosPestanaCount > 0 ||
            (r.intento.calificacionManual && Object.keys(r.intento.calificacionManual as object).length > 0) ||
            r.intento.nota !== null),
      );

      const enriched = await Promise.all(
        filtered.map(async (r) => {
          const pregs = await db
            .select()
            .from(pregunta)
            .where(eq(pregunta.quizId, r.quiz.id))
            .orderBy(asc(pregunta.orden));
          return {
            ...r.intento,
            quizTitulo: r.quiz.titulo,
            nivelMcer: r.quiz.nivelMcer,
            notaMinima: r.quiz.notaMinima,
            politicaSalida: r.quiz.politicaSalida,
            maxCambiosPestana: r.quiz.maxCambiosPestana,
            estudiante: r.estudiante,
            preguntasWriting: pregs.filter((p) => p.tipo === 'WRITING'),
            totalPreguntas: pregs.length,
          };
        }),
      );

      return res.json({ intentos: enriched });
    } catch (error) {
      console.error('Error listing quiz writing reviews:', error);
      return res.status(500).json({ error: 'No se pudieron cargar los exámenes por revisar.' });
    }
  },
);

// PATCH /api/intentos/:id/calificar-writing — Docente califica preguntas WRITING con protocolo 48h y publica nota final
evaluacionesRouter.patch(
  '/intentos/:id/calificar-writing',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const intentoId = String(req.params.id);
      const { tenantId, sub, rol, nombre: actorNombre } = req.aulaUser!;
      const calificacionesManuales =
        req.body?.calificacionesManuales && typeof req.body.calificacionesManuales === 'object'
          ? (req.body.calificacionesManuales as Record<string, number>)
          : {};
      const feedbackDocente =
        typeof req.body?.feedbackDocente === 'string' ? req.body.feedbackDocente.trim() : null;
      const motivoRaw = req.body?.motivoCambio;

      const [found] = await db
        .select({ intento: intentoQuiz, quiz })
        .from(intentoQuiz)
        .innerJoin(quiz, eq(intentoQuiz.quizId, quiz.id))
        .where(and(eq(intentoQuiz.id, intentoId), eq(intentoQuiz.tenantId, tenantId)))
        .limit(1);

      if (!found) return res.status(404).json({ error: 'Intento de examen no encontrado.' });

      const now = new Date();
      const settledAt = found.intento.notaAsentadaEn || (found.intento.nota !== null ? found.intento.finEn : null);
      const permission = evaluateGradeEditPermission({
        rol,
        existingNota: found.intento.nota,
        notaAsentadaEn: settledAt,
        now,
      });

      if (!permission.canEdit) {
        return res.status(403).json({
          error:
            'Han transcurrido más de 48 horas desde que se asentó la nota del examen. Solo el Administrador Total puede modificarla.',
          lockedAfter48h: true,
        });
      }

      let motivoFinal = 'Calificación inicial de Writing registrada.';
      if (permission.requiresReason) {
        const reasonCheck = validateModificationReason(motivoRaw);
        if (!reasonCheck.valid) {
          return res.status(400).json({ error: reasonCheck.error });
        }
        motivoFinal = reasonCheck.cleaned;
      }

      const preguntas = await db
        .select()
        .from(pregunta)
        .where(eq(pregunta.quizId, found.quiz.id))
        .orderBy(asc(pregunta.orden));

      const respuestas =
        found.intento.respuestas && typeof found.intento.respuestas === 'object'
          ? (found.intento.respuestas as Record<string, unknown>)
          : {};

      const resultado = gradeQuizAttempt(
        preguntas.map((p) => ({
          id: p.id,
          tipo: p.tipo,
          respuestaCorrecta: p.respuestaCorrecta,
          puntos: p.puntos,
        })),
        respuestas,
        found.quiz.notaMinima,
        calificacionesManuales,
      );

      const nextHistory = appendGradeHistoryEntry(found.intento.historialNotas, {
        fecha: now.toISOString(),
        actorId: sub,
        actorNombre,
        actorRol: rol,
        notaAnterior: found.intento.nota,
        notaNueva: resultado.nota,
        motivo: motivoFinal,
      });

      const [updated] = await db
        .update(intentoQuiz)
        .set({
          estado: 'CALIFICADO',
          nota: resultado.nota,
          notaAsentadaEn: settledAt || now,
          calificadoPor: sub,
          requiereRevisionDocente: false,
          calificacionManual: calificacionesManuales,
          feedbackDocente,
          ultimoMotivoCambio: permission.requiresReason ? motivoFinal : found.intento.ultimoMotivoCambio,
          historialNotas: nextHistory,
        })
        .where(and(eq(intentoQuiz.id, intentoId), eq(intentoQuiz.tenantId, tenantId)))
        .returning();

      const evento = await enqueueOutboxEvent(tenantId, 'nota.publicada', {
        tenantId,
        estudianteId: updated.estudianteId,
        claseId: null,
        tipo: 'EVALUACION',
        actividad: found.quiz.titulo,
        fecha: now.toISOString().slice(0, 10),
        nota: resultado.nota,
        peso: 10,
        origen: 'AULA',
        origenId: updated.id,
      });

      return res.json({ intento: updated, resultado, eventoOutbox: evento });
    } catch (error) {
      console.error('Error grading writing quiz attempt:', error);
      return res.status(500).json({ error: 'No se pudo calificar el Writing del examen.' });
    }
  },
);

// PATCH /api/intentos/:id/nota — Permite modificar la nota de cualquier examen bajo protocolo de 48h + motivo obligatorio
evaluacionesRouter.patch(
  '/intentos/:id/nota',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const intentoId = String(req.params.id);
      const { tenantId, sub, rol, nombre: actorNombre } = req.aulaUser!;
      const nota = Number(req.body?.nota);
      const feedbackDocente =
        typeof req.body?.feedbackDocente === 'string' ? req.body.feedbackDocente.trim() : null;
      const motivoRaw = req.body?.motivoCambio;

      if (!Number.isFinite(nota) || nota < 0 || nota > 100) {
        return res.status(400).json({ error: 'La nota debe ser un número entre 0 y 100.' });
      }

      const [found] = await db
        .select({ intento: intentoQuiz, quiz })
        .from(intentoQuiz)
        .innerJoin(quiz, eq(intentoQuiz.quizId, quiz.id))
        .where(and(eq(intentoQuiz.id, intentoId), eq(intentoQuiz.tenantId, tenantId)))
        .limit(1);

      if (!found) return res.status(404).json({ error: 'Intento de examen no encontrado.' });

      const now = new Date();
      const settledAt = found.intento.notaAsentadaEn || (found.intento.nota !== null ? found.intento.finEn : null);
      const permission = evaluateGradeEditPermission({
        rol,
        existingNota: found.intento.nota,
        notaAsentadaEn: settledAt,
        now,
      });

      if (!permission.canEdit) {
        return res.status(403).json({
          error:
            'Han transcurrido más de 48 horas desde que se asentó la nota del examen. Solo el Administrador Total puede modificarla.',
          lockedAfter48h: true,
        });
      }

      let motivoFinal = 'Calificación inicial registrada.';
      if (permission.requiresReason) {
        const reasonCheck = validateModificationReason(motivoRaw);
        if (!reasonCheck.valid) {
          return res.status(400).json({ error: reasonCheck.error });
        }
        motivoFinal = reasonCheck.cleaned;
      }

      const nextHistory = appendGradeHistoryEntry(found.intento.historialNotas, {
        fecha: now.toISOString(),
        actorId: sub,
        actorNombre,
        actorRol: rol,
        notaAnterior: found.intento.nota,
        notaNueva: nota,
        motivo: motivoFinal,
      });

      const [updated] = await db
        .update(intentoQuiz)
        .set({
          estado: 'CALIFICADO',
          nota,
          notaAsentadaEn: settledAt || now,
          calificadoPor: sub,
          requiereRevisionDocente: false,
          feedbackDocente: feedbackDocente ?? found.intento.feedbackDocente,
          ultimoMotivoCambio: permission.requiresReason ? motivoFinal : found.intento.ultimoMotivoCambio,
          historialNotas: nextHistory,
        })
        .where(and(eq(intentoQuiz.id, intentoId), eq(intentoQuiz.tenantId, tenantId)))
        .returning();

      const evento = await enqueueOutboxEvent(tenantId, 'nota.publicada', {
        tenantId,
        estudianteId: updated.estudianteId,
        claseId: null,
        tipo: 'EVALUACION',
        actividad: found.quiz.titulo,
        fecha: now.toISOString().slice(0, 10),
        nota,
        peso: 10,
        origen: 'AULA',
        origenId: updated.id,
      });

      return res.json({ intento: updated, eventoOutbox: evento });
    } catch (error) {
      console.error('Error updating exam attempt grade:', error);
      return res.status(500).json({ error: 'No se pudo actualizar la nota del examen.' });
    }
  },
);
