import { and, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import { db } from '../../db/index.ts';
import {
  curso,
  entrega,
  inscripcionCurso,
  leccion,
  material,
  progresoLeccion,
  tarea,
  unidad,
} from '../../db/schema.ts';
import { requireAuth, requireRole, type AuthRequest } from '../../middleware/auth.ts';
import { awardAcademicActivity } from '../services/gamificacion.service.ts';
import { parseGoogleDriveUrl, sanitizeLessonHtml } from '../services/grading.ts';
import {
  buildStorageKey,
  generateDemoFileBuffer,
  readPrivateFile,
  savePrivateBuffer,
  signDownloadToken,
  signUploadToken,
  verifyDownloadToken,
  verifyUploadToken,
} from '../services/storage.ts';

export const contenidoRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// POST /api/cursos/:id/unidades
contenidoRouter.post(
  '/cursos/:id/unidades',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const cursoId = String(req.params.id);
      const { tenantId } = req.aulaUser!;
      const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
      const descripcion =
        typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : null;

      if (titulo.length < 2) {
        return res.status(400).json({ error: 'Ingresa un título para la unidad.' });
      }

      const [foundCurso] = await db
        .select()
        .from(curso)
        .where(and(eq(curso.id, cursoId), eq(curso.tenantId, tenantId)))
        .limit(1);
      if (!foundCurso) return res.status(404).json({ error: 'Curso no encontrado.' });

      const last = await db
        .select({ orden: unidad.orden })
        .from(unidad)
        .where(and(eq(unidad.cursoId, cursoId), eq(unidad.tenantId, tenantId)))
        .orderBy(desc(unidad.orden))
        .limit(1);

      const nextOrden = (last[0]?.orden ?? 0) + 1;
      const [created] = await db
        .insert(unidad)
        .values({
          tenantId,
          cursoId,
          orden: nextOrden,
          titulo: titulo.slice(0, 200),
          descripcion,
        })
        .returning();

      return res.status(201).json({ unidad: created });
    } catch (error) {
      console.error('Error creating unidad:', error);
      return res.status(500).json({ error: 'No se pudo crear la unidad.' });
    }
  },
);

// PATCH /api/unidades/:id
contenidoRouter.patch(
  '/unidades/:id',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const unidadId = String(req.params.id);
      const { tenantId } = req.aulaUser!;
      const patch: Record<string, unknown> = {};
      if (typeof req.body?.titulo === 'string' && req.body.titulo.trim().length >= 2) {
        patch.titulo = req.body.titulo.trim().slice(0, 200);
      }
      if (typeof req.body?.descripcion === 'string') {
        patch.descripcion = req.body.descripcion.trim();
      }

      const [updated] = await db
        .update(unidad)
        .set(patch)
        .where(and(eq(unidad.id, unidadId), eq(unidad.tenantId, tenantId)))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Unidad no encontrada.' });
      return res.json({ unidad: updated });
    } catch (error) {
      console.error('Error updating unidad:', error);
      return res.status(500).json({ error: 'No se pudo actualizar la unidad.' });
    }
  },
);

// DELETE /api/unidades/:id — borra solo si no tiene entregas asociadas
contenidoRouter.delete(
  '/unidades/:id',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const unidadId = String(req.params.id);
      const { tenantId } = req.aulaUser!;

      const lecs = await db
        .select({ id: leccion.id })
        .from(leccion)
        .where(and(eq(leccion.unidadId, unidadId), eq(leccion.tenantId, tenantId)));

      for (const l of lecs) {
        const tars = await db
          .select({ id: tarea.id })
          .from(tarea)
          .where(and(eq(tarea.leccionId, l.id), eq(tarea.tenantId, tenantId)));
        for (const t of tars) {
          const ents = await db
            .select({ id: entrega.id })
            .from(entrega)
            .where(and(eq(entrega.tareaId, t.id), eq(entrega.tenantId, tenantId)))
            .limit(1);
          if (ents.length > 0) {
            return res.status(409).json({
              error: 'No se puede eliminar esta unidad porque tiene entregas de estudiantes.',
            });
          }
        }
      }

      await db
        .delete(unidad)
        .where(and(eq(unidad.id, unidadId), eq(unidad.tenantId, tenantId)));

      return res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting unidad:', error);
      return res.status(500).json({ error: 'No se pudo eliminar la unidad.' });
    }
  },
);

// POST /api/unidades/:id/lecciones
contenidoRouter.post(
  '/unidades/:id/lecciones',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const unidadId = String(req.params.id);
      const { tenantId } = req.aulaUser!;
      const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
      const contenido = sanitizeLessonHtml(req.body?.contenido);
      const publicada = req.body?.publicada !== false;

      if (titulo.length < 2) {
        return res.status(400).json({ error: 'Ingresa un título para la lección.' });
      }

      const [foundUnidad] = await db
        .select()
        .from(unidad)
        .where(and(eq(unidad.id, unidadId), eq(unidad.tenantId, tenantId)))
        .limit(1);
      if (!foundUnidad) return res.status(404).json({ error: 'Unidad no encontrada.' });

      const last = await db
        .select({ orden: leccion.orden })
        .from(leccion)
        .where(and(eq(leccion.unidadId, unidadId), eq(leccion.tenantId, tenantId)))
        .orderBy(desc(leccion.orden))
        .limit(1);

      const nextOrden = (last[0]?.orden ?? 0) + 1;
      const [created] = await db
        .insert(leccion)
        .values({
          tenantId,
          unidadId,
          orden: nextOrden,
          titulo: titulo.slice(0, 200),
          contenido,
          publicada,
        })
        .returning();

      return res.status(201).json({ leccion: created });
    } catch (error) {
      console.error('Error creating leccion:', error);
      return res.status(500).json({ error: 'No se pudo crear la lección.' });
    }
  },
);

// PATCH /api/lecciones/:id
contenidoRouter.patch(
  '/lecciones/:id',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const leccionId = String(req.params.id);
      const { tenantId } = req.aulaUser!;

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof req.body?.titulo === 'string' && req.body.titulo.trim().length >= 2) {
        patch.titulo = req.body.titulo.trim().slice(0, 200);
      }
      if (typeof req.body?.contenido === 'string') {
        patch.contenido = sanitizeLessonHtml(req.body.contenido);
      }
      if (typeof req.body?.publicada === 'boolean') {
        patch.publicada = req.body.publicada;
      }

      const [updated] = await db
        .update(leccion)
        .set(patch)
        .where(and(eq(leccion.id, leccionId), eq(leccion.tenantId, tenantId)))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Lección no encontrada.' });
      return res.json({ leccion: updated });
    } catch (error) {
      console.error('Error updating leccion:', error);
      return res.status(500).json({ error: 'No se pudo actualizar la lección.' });
    }
  },
);

// POST /api/materiales/firma — genera URL prefirmada de subida (5 min)
contenidoRouter.post(
  '/materiales/firma',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const cursoId = typeof req.body?.cursoId === 'string' ? req.body.cursoId : 'general';
      const filename = typeof req.body?.filename === 'string' ? req.body.filename : 'archivo.pdf';
      const mimeType =
        typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'application/pdf';

      const storageKey = buildStorageKey(tenantId, cursoId, filename);
      const uploadToken = signUploadToken({ tenantId, cursoId, storageKey, mimeType });

      return res.json({
        storageKey,
        uploadUrl: `/api/materiales/subir/${uploadToken}`,
        expiraSegundos: 300,
      });
    } catch (error) {
      console.error('Error signing upload:', error);
      return res.status(500).json({ error: 'No se pudo generar la firma de subida.' });
    }
  },
);

// POST /api/materiales/subir/:token — sube archivo al almacenamiento privado
contenidoRouter.post(
  '/materiales/subir/:token',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  upload.single('archivo'),
  async (req: AuthRequest, res) => {
    try {
      const token = String(req.params.token);
      const decoded = verifyUploadToken(token);
      if (decoded.tenantId !== req.aulaUser!.tenantId) {
        return res.status(403).json({ error: 'Token de subida fuera de tu institución.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Adjunta un archivo válido (máximo 25 MB).' });
      }

      const size = savePrivateBuffer(decoded.storageKey, req.file.buffer);
      return res.status(201).json({
        storageKey: decoded.storageKey,
        tamanoBytes: size,
        mimeType: req.file.mimetype || decoded.mimeType,
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      return res.status(400).json({ error: 'Firma de subida inválida o expirada.' });
    }
  },
);

// POST /api/lecciones/:id/materiales — registra material en la lección
contenidoRouter.post(
  '/lecciones/:id/materiales',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const leccionId = String(req.params.id);
      const { tenantId } = req.aulaUser!;

      const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
      const tipo = req.body?.tipo;
      const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      const descripcion =
        typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : null;
      const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : null;
      const tamanoBytes = typeof req.body?.tamanoBytes === 'number' ? req.body.tamanoBytes : null;

      if (
        !titulo ||
        !url ||
        !['PDF', 'VIDEO', 'ENLACE', 'IMAGEN', 'AUDIO', 'GOOGLE_DRIVE'].includes(tipo)
      ) {
        return res.status(400).json({ error: 'Datos de material incompletos.' });
      }

      const [foundLec] = await db
        .select()
        .from(leccion)
        .where(and(eq(leccion.id, leccionId), eq(leccion.tenantId, tenantId)))
        .limit(1);
      if (!foundLec) return res.status(404).json({ error: 'Lección no encontrada.' });

      const [created] = await db
        .insert(material)
        .values({
          tenantId,
          leccionId,
          tipo,
          titulo: titulo.slice(0, 200),
          descripcion,
          url,
          mimeType,
          tamanoBytes,
        })
        .returning();

      return res.status(201).json({ material: created });
    } catch (error) {
      console.error('Error registering material:', error);
      return res.status(500).json({ error: 'No se pudo registrar el material.' });
    }
  },
);

// GET /api/materiales/:id/descarga — URL prefirmada de descarga (10 minutos)
contenidoRouter.get(
  '/materiales/:id/descarga',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const materialId = String(req.params.id);
      const { tenantId, rol, sub, estudianteId } = req.aulaUser!;

      const [mat] = await db
        .select({
          material,
          cursoId: unidad.cursoId,
        })
        .from(material)
        .innerJoin(leccion, eq(material.leccionId, leccion.id))
        .innerJoin(unidad, eq(leccion.unidadId, unidad.id))
        .where(and(eq(material.id, materialId), eq(material.tenantId, tenantId)))
        .limit(1);

      if (!mat) return res.status(404).json({ error: 'Material no encontrado.' });

      if (rol === 'ESTUDIANTE') {
        const [insc] = await db
          .select()
          .from(inscripcionCurso)
          .where(
            and(
              eq(inscripcionCurso.tenantId, tenantId),
              eq(inscripcionCurso.cursoId, mat.cursoId),
              eq(inscripcionCurso.estudianteId, estudianteId || sub),
              eq(inscripcionCurso.estado, 'ACTIVO'),
            ),
          )
          .limit(1);
        if (!insc) return res.status(403).json({ error: 'No estás inscrito en este curso.' });
      }

      if (
        (mat.material.tipo === 'ENLACE' ||
          mat.material.tipo === 'GOOGLE_DRIVE' ||
          mat.material.tipo === 'AUDIO' ||
          mat.material.tipo === 'VIDEO' ||
          mat.material.tipo === 'PDF') &&
        /^https?:\/\//i.test(mat.material.url)
      ) {
        const parsedDrive = parseGoogleDriveUrl(mat.material.url);
        return res.json({
          url: parsedDrive.isDrive ? parsedDrive.downloadUrl : mat.material.url,
          previewUrl: parsedDrive.isDrive ? parsedDrive.previewUrl : mat.material.url,
          externo: true,
          esGoogleDrive: parsedDrive.isDrive,
          expiraSegundos: 600,
        });
      }

      const token = signDownloadToken({
        tenantId,
        storageKey: mat.material.url,
        filename: mat.material.titulo,
        mimeType: mat.material.mimeType || 'application/octet-stream',
      });

      const inline = req.query.inline === '1';
      return res.json({
        url: `/api/materiales/archivo/${token}${inline ? '?inline=1' : ''}`,
        previewUrl: `/api/materiales/archivo/${token}?inline=1`,
        externo: false,
        esGoogleDrive: false,
        expiraSegundos: 600,
      });
    } catch (error) {
      console.error('Error generating download URL:', error);
      return res.status(500).json({ error: 'No se pudo generar el enlace de descarga.' });
    }
  },
);

// GET /api/materiales/archivo/:sigToken — sirve archivo privado verificando firma temporal de 10 min
contenidoRouter.get('/materiales/archivo/:sigToken', (req, res) => {
  try {
    const decoded = verifyDownloadToken(String(req.params.sigToken));
    const safeFilename = decoded.filename.replace(/["\r\n]/g, '');
    const disposition = req.query.inline === '1' ? 'inline' : 'attachment';

    if (decoded.storageKey.startsWith('demo://')) {
      const buf = generateDemoFileBuffer(decoded.filename, decoded.storageKey);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}.txt"`);
      return res.send(buf);
    }

    const data = readPrivateFile(decoded.storageKey);
    if (!data) {
      return res.status(404).json({ error: 'Archivo no disponible en el almacenamiento.' });
    }

    res.setHeader('Content-Type', decoded.mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"`);
    return res.send(data);
  } catch {
    return res.status(401).json({ error: 'El enlace de descarga ha expirado o no es válido.' });
  }
});

// DELETE /api/materiales/:id
contenidoRouter.delete(
  '/materiales/:id',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const materialId = String(req.params.id);
      const { tenantId } = req.aulaUser!;
      await db
        .delete(material)
        .where(and(eq(material.id, materialId), eq(material.tenantId, tenantId)));
      return res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting material:', error);
      return res.status(500).json({ error: 'No se pudo eliminar el material.' });
    }
  },
);

// POST /api/lecciones/:id/progreso — reporta avance del estudiante (0-100)
contenidoRouter.post(
  '/lecciones/:id/progreso',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const leccionId = String(req.params.id);
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const estId = estudianteId || sub;

      const rawPct = Number(req.body?.porcentaje ?? 100);
      const porcentaje = Math.max(0, Math.min(100, Math.round(Number.isFinite(rawPct) ? rawPct : 100)));
      const estado =
        porcentaje >= 100 ? 'COMPLETADA' : porcentaje > 0 ? 'EN_PROGRESO' : 'NO_INICIADA';

      const [foundLec] = await db
        .select({ leccion, cursoId: unidad.cursoId })
        .from(leccion)
        .innerJoin(unidad, eq(leccion.unidadId, unidad.id))
        .where(and(eq(leccion.id, leccionId), eq(leccion.tenantId, tenantId)))
        .limit(1);

      if (!foundLec) return res.status(404).json({ error: 'Lección no encontrada.' });

      const [insc] = await db
        .select()
        .from(inscripcionCurso)
        .where(
          and(
            eq(inscripcionCurso.tenantId, tenantId),
            eq(inscripcionCurso.cursoId, foundLec.cursoId),
            eq(inscripcionCurso.estudianteId, estId),
            eq(inscripcionCurso.estado, 'ACTIVO'),
          ),
        )
        .limit(1);
      if (!insc) return res.status(403).json({ error: 'No estás inscrito en este curso.' });

      const [saved] = await db
        .insert(progresoLeccion)
        .values({
          tenantId,
          estudianteId: estId,
          leccionId,
          estado,
          porcentaje,
          completadaEn: estado === 'COMPLETADA' ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: [progresoLeccion.estudianteId, progresoLeccion.leccionId],
          set: {
            estado,
            porcentaje,
            completadaEn: estado === 'COMPLETADA' ? new Date() : null,
            updatedAt: new Date(),
          },
        })
        .returning();

      let gamificacion = null;
      if (estado === 'COMPLETADA') {
        gamificacion = await awardAcademicActivity({
          tenantId,
          estudianteId: estId,
          fuente: 'LECCION',
          referenciaId: leccionId,
          descripcion: `Lección completada: ${foundLec.leccion.titulo}`,
        }).catch((err) => {
          console.error('Gamification hook error on lesson completion:', err);
          return null;
        });
      }

      return res.json({ progreso: saved, gamificacion });
    } catch (error) {
      console.error('Error updating lesson progress:', error);
      return res.status(500).json({ error: 'No se pudo guardar tu progreso.' });
    }
  },
);
