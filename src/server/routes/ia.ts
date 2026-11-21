import { Router } from 'express';
import { requireAuth, requireRole, type AuthRequest } from '../../middleware/auth.ts';
import { createRateLimiter } from '../../middleware/rate-limit.ts';
import {
  evaluateWritingWithCambridgeRubric,
  generateCambridgeQuiz,
  runAulaAssistant,
  runLessonQuickAction,
  type ChatTurn,
} from '../services/ai.ts';

export const iaRouter = Router();

const aiLimiter = createRateLimiter(30, 60 * 1000);

function formatAiError(error: unknown): { status: number; message: string } {
  const msg = error instanceof Error ? error.message : 'No se pudo procesar la consulta de IA.';
  if (msg.includes('GEMINI_API_KEY')) {
    return { status: 503, message: msg };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'El límite temporal de consultas a la IA fue alcanzado. Intenta en unos segundos.',
    };
  }
  return { status: 502, message: msg };
}

// POST /api/ia/asistente — Chat contextual para Docente y Estudiante
iaRouter.post(
  '/ia/asistente',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  aiLimiter,
  async (req: AuthRequest, res) => {
    try {
      const { rol } = req.aulaUser!;
      const mensaje = typeof req.body?.mensaje === 'string' ? req.body.mensaje.trim() : '';
      const cursoNombre =
        typeof req.body?.cursoNombre === 'string' ? req.body.cursoNombre.trim() : 'ALLEN Aula';
      const nivelMcer =
        typeof req.body?.nivelMcer === 'string' ? req.body.nivelMcer.trim() : 'A2';
      const leccionTitulo =
        typeof req.body?.leccionTitulo === 'string' ? req.body.leccionTitulo.trim() : null;
      const leccionContenido =
        typeof req.body?.leccionContenido === 'string' ? req.body.leccionContenido : null;
      const historial = Array.isArray(req.body?.historial)
        ? (req.body.historial as ChatTurn[])
        : [];

      if (mensaje.length < 2 || mensaje.length > 2000) {
        return res.status(400).json({ error: 'Escribe una consulta de entre 2 y 2000 caracteres.' });
      }

      const respuesta = await runAulaAssistant({
        rol,
        cursoNombre,
        nivelMcer,
        leccionTitulo,
        leccionContenido,
        mensaje,
        historial,
      });

      return res.json({ respuesta });
    } catch (error) {
      console.error('AI assistant error:', error);
      const { status, message } = formatAiError(error);
      return res.status(status).json({ error: message });
    }
  },
);

// POST /api/ia/accion-leccion — Acciones rápidas estilo Moodle 5.0 (Resumir, Explicar, Vocabulario, Saludo, Rúbrica)
iaRouter.post(
  '/ia/accion-leccion',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  aiLimiter,
  async (req: AuthRequest, res) => {
    try {
      const { rol } = req.aulaUser!;
      const accion = req.body?.accion;
      if (!['resumir', 'explicar', 'vocabulario', 'saludo', 'rubrica'].includes(accion)) {
        return res.status(400).json({ error: 'Acción de IA no soportada.' });
      }

      const respuesta = await runLessonQuickAction({
        accion,
        rol,
        cursoNombre:
          typeof req.body?.cursoNombre === 'string' ? req.body.cursoNombre : 'ALLEN Aula',
        nivelMcer: typeof req.body?.nivelMcer === 'string' ? req.body.nivelMcer : 'A2',
        titulo: typeof req.body?.titulo === 'string' ? req.body.titulo : 'Lección actual',
        contenido: typeof req.body?.contenido === 'string' ? req.body.contenido : '',
      });

      return res.json({ respuesta });
    } catch (error) {
      console.error('AI quick action error:', error);
      const { status, message } = formatAiError(error);
      return res.status(status).json({ error: message });
    }
  },
);

// POST /api/ia/generar-quiz — Genera preguntas MCER Cambridge estructuradas para el docente
iaRouter.post(
  '/ia/generar-quiz',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  aiLimiter,
  async (req: AuthRequest, res) => {
    try {
      const tema = typeof req.body?.tema === 'string' ? req.body.tema.trim() : '';
      const nivelMcer = typeof req.body?.nivelMcer === 'string' ? req.body.nivelMcer.trim() : 'A2';
      const habilidad =
        typeof req.body?.habilidad === 'string' ? req.body.habilidad.trim() : 'USE_OF_ENGLISH';
      const cantidad = Number(req.body?.cantidad ?? 4);
      const incluirWriting = Boolean(req.body?.incluirWriting);

      if (tema.length < 3) {
        return res.status(400).json({ error: 'Indica el tema del examen (mínimo 3 caracteres).' });
      }

      const generated = await generateCambridgeQuiz({
        tema,
        nivelMcer,
        habilidad,
        cantidad,
        incluirWriting,
      });

      return res.json(generated);
    } catch (error) {
      console.error('AI generate quiz error:', error);
      const { status, message } = formatAiError(error);
      return res.status(status).json({ error: message });
    }
  },
);

// POST /api/ia/evaluar-writing — Asistente de rúbrica Cambridge para que el docente revise Writing
iaRouter.post(
  '/ia/evaluar-writing',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  aiLimiter,
  async (req: AuthRequest, res) => {
    try {
      const consigna = typeof req.body?.consigna === 'string' ? req.body.consigna.trim() : '';
      const textoEstudiante =
        typeof req.body?.textoEstudiante === 'string' ? req.body.textoEstudiante.trim() : '';
      const nivelMcer = typeof req.body?.nivelMcer === 'string' ? req.body.nivelMcer.trim() : 'A2';
      const puntajeMaximo = Number(req.body?.puntajeMaximo ?? 100);

      if (textoEstudiante.length < 10) {
        return res.status(400).json({ error: 'El texto del estudiante es demasiado corto para evaluar.' });
      }

      const result = await evaluateWritingWithCambridgeRubric({
        consigna: consigna || 'Evaluación de expresión escrita en inglés',
        textoEstudiante,
        nivelMcer,
        puntajeMaximo: Number.isFinite(puntajeMaximo) && puntajeMaximo > 0 ? puntajeMaximo : 100,
      });

      return res.json(result);
    } catch (error) {
      console.error('AI evaluate writing error:', error);
      const { status, message } = formatAiError(error);
      return res.status(status).json({ error: message });
    }
  },
);
