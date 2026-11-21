import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const MODEL_NAME = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'El servicio de IA no está configurado en el servidor (falta GEMINI_API_KEY en Settings > Secrets).',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export async function runAulaAssistant(params: {
  rol: 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE';
  cursoNombre: string;
  nivelMcer?: string | null;
  leccionTitulo?: string | null;
  leccionContenido?: string | null;
  mensaje: string;
  historial?: ChatTurn[];
}): Promise<string> {
  const ai = getAiClient();
  const isDocente = params.rol === 'ADMIN' || params.rol === 'PROFESOR';

  const systemInstruction = isDocente
    ? [
        'Eres el Copiloto Pedagógico de ALLEN Aula especializado en enseñanza de inglés bajo el Marco Común Europeo de Referencia (MCER / Cambridge English: A1 Movers, A2 Key, B1 Preliminary, B2 First, C1 Advanced).',
        'Responde en español claro y conciso, con ejemplos prácticos en inglés cuando corresponda.',
        'Ayuda al docente a redactar explicaciones, actividades comunicativas, tareas de Writing, saludos de bienvenida (greetings), rúbricas de evaluación Cambridge (Content, Communicative Achievement, Organisation, Language) y reactivos de examen.',
        `Contexto del curso: "${params.cursoNombre}" (Nivel MCER: ${params.nivelMcer || 'A2'}).`,
        params.leccionTitulo ? `Lección activa: "${params.leccionTitulo}".` : '',
        params.leccionContenido
          ? `Resumen del contenido de la lección: ${params.leccionContenido.replace(/<[^>]+>/g, ' ').slice(0, 1200)}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : [
        'Eres el Tutor de Inglés IA de ALLEN Aula, especialista en metodología Cambridge y Marco Común Europeo (MCER).',
        'Responde principalmente en español amigable y pedagógico, incluyendo ejemplos y pronunciación práctica en inglés.',
        'Tu meta es que el estudiante comprenda y practique: explica reglas paso a paso, ofrece 2 o 3 ejemplos claros y haz preguntas de verificación cortas.',
        'Si el estudiante pega un borrador de Writing, dale retroalimentación constructiva basada en los criterios Cambridge (Contenido, Logro comunicativo, Organización y Lenguaje) sin reescribirle toda la tarea de cero.',
        `Curso actual: "${params.cursoNombre}" (Nivel MCER: ${params.nivelMcer || 'A2'}).`,
        params.leccionTitulo ? `Lección actual: "${params.leccionTitulo}".` : '',
        params.leccionContenido
          ? `Contenido de la lección: ${params.leccionContenido.replace(/<[^>]+>/g, ' ').slice(0, 1200)}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

  const historyLines = (params.historial || [])
    .slice(-8)
    .map((h) => `${h.role === 'user' ? 'Usuario' : 'Asistente'}: ${h.text}`)
    .join('\n');

  const fullPrompt = historyLines
    ? `${historyLines}\nUsuario: ${params.mensaje}`
    : params.mensaje;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: fullPrompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const text = (response.text || '').trim();
  if (!text) {
    throw new Error('El asistente de IA no devolvió contenido. Intenta nuevamente.');
  }
  return text;
}

export async function runLessonQuickAction(params: {
  accion: 'resumir' | 'explicar' | 'vocabulario' | 'saludo' | 'rubrica';
  rol: 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE';
  cursoNombre: string;
  nivelMcer?: string | null;
  titulo: string;
  contenido: string;
}): Promise<string> {
  const prompts: Record<typeof params.accion, string> = {
    resumir: `Resume en puntos claros y fáciles de repasar la lección "${params.titulo}" para un estudiante de nivel ${params.nivelMcer || 'A2'}. Incluye al final 3 ideas clave para recordar.`,
    explicar: `Explica paso a paso el tema "${params.titulo}" usando metodología Cambridge MCER (${params.nivelMcer || 'A2'}). Incluye estructura gramatical, 3 ejemplos en inglés con traducción y 2 errores frecuentes que evitar.`,
    vocabulario: `Extrae o propón una tabla breve de 8 expresiones o palabras clave en inglés relacionadas con "${params.titulo}" (nivel ${params.nivelMcer || 'A2'}), con su traducción al español y una oración de ejemplo.`,
    saludo: `Redacta un saludo de bienvenida (Greeting) cercano, motivador y profesional en español con una frase de apertura en inglés para el curso "${params.cursoNombre}" (${params.nivelMcer || 'A2'}) e indica a los estudiantes cómo iniciar la semana.`,
    rubrica: `Diseña una rúbrica breve de evaluación estilo Cambridge (Content, Communicative Achievement, Organisation, Language sobre 100 puntos) para la actividad "${params.titulo}" nivel ${params.nivelMcer || 'A2'}.`,
  };

  return runAulaAssistant({
    rol: params.rol,
    cursoNombre: params.cursoNombre,
    nivelMcer: params.nivelMcer,
    leccionTitulo: params.titulo,
    leccionContenido: params.contenido,
    mensaje: prompts[params.accion],
  });
}

export interface GeneratedCambridgeQuestion {
  enunciado: string;
  tipo: 'OPCION_MULTIPLE' | 'VERDADERO_FALSO' | 'RESPUESTA_CORTA' | 'WRITING';
  opciones: string[] | null;
  respuestaCorrecta: string;
  retroalimentacion: string;
  minPalabras: number | null;
  maxPalabras: number | null;
  puntos: number;
}

export async function generateCambridgeQuiz(params: {
  tema: string;
  nivelMcer: string;
  habilidad: string;
  cantidad: number;
  incluirWriting: boolean;
}): Promise<{
  tituloSugerido: string;
  descripcionSugerida: string;
  preguntas: GeneratedCambridgeQuestion[];
}> {
  const ai = getAiClient();
  const safeCount = Math.max(2, Math.min(8, params.cantidad));

  const prompt = [
    `Genera un examen interactivo de inglés alineado al Marco Común Europeo (MCER nivel ${params.nivelMcer}) y formato Cambridge (${params.habilidad}) sobre el tema: "${params.tema}".`,
    `Cantidad total de preguntas: ${safeCount}.`,
    params.incluirWriting
      ? 'Incluye exactamente 1 pregunta de tipo WRITING al final (con consigna clara estilo Cambridge email/essay/story, minPalabras y maxPalabras apropiados al nivel) y el resto combinando OPCION_MULTIPLE, VERDADERO_FALSO y RESPUESTA_CORTA.'
      : 'Combina preguntas de tipo OPCION_MULTIPLE, VERDADERO_FALSO y RESPUESTA_CORTA (sin tipo WRITING).',
    'Reglas estrictas:',
    '- Para OPCION_MULTIPLE: entrega exactamente 4 opciones en el arreglo "opciones" y pon en "respuestaCorrecta" el texto exacto de la opción correcta.',
    '- Para VERDADERO_FALSO: "opciones" vacío y "respuestaCorrecta" debe ser "verdadero" o "falso".',
    '- Para RESPUESTA_CORTA: "opciones" vacío y "respuestaCorrecta" la palabra o frase exacta en inglés esperada.',
    '- Para WRITING: "opciones" vacío, "respuestaCorrecta" con los criterios clave de evaluación en 1 frase, y define minPalabras y maxPalabras.',
    '- Distribuye los "puntos" para que sumen exactamente 100.',
    '- Incluye "retroalimentacion" breve y educativa en español para cada pregunta.',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tituloSugerido: { type: Type.STRING },
          descripcionSugerida: { type: Type.STRING },
          preguntas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                enunciado: { type: Type.STRING },
                tipo: {
                  type: Type.STRING,
                  enum: ['OPCION_MULTIPLE', 'VERDADERO_FALSO', 'RESPUESTA_CORTA', 'WRITING'],
                },
                opciones: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                respuestaCorrecta: { type: Type.STRING },
                retroalimentacion: { type: Type.STRING },
                minPalabras: { type: Type.INTEGER },
                maxPalabras: { type: Type.INTEGER },
                puntos: { type: Type.NUMBER },
              },
              required: ['enunciado', 'tipo', 'respuestaCorrecta', 'retroalimentacion', 'puntos'],
            },
          },
        },
        required: ['tituloSugerido', 'descripcionSugerida', 'preguntas'],
      },
    },
  });

  const raw = (response.text || '').trim();
  const parsed = JSON.parse(raw) as {
    tituloSugerido: string;
    descripcionSugerida: string;
    preguntas: GeneratedCambridgeQuestion[];
  };

  return {
    tituloSugerido: parsed.tituloSugerido || `Evaluación ${params.nivelMcer} · ${params.tema}`,
    descripcionSugerida: parsed.descripcionSugerida || '',
    preguntas: (parsed.preguntas || []).map((p) => ({
      enunciado: p.enunciado,
      tipo: p.tipo,
      opciones: p.tipo === 'OPCION_MULTIPLE' && Array.isArray(p.opciones) ? p.opciones : null,
      respuestaCorrecta: String(p.respuestaCorrecta ?? ''),
      retroalimentacion: p.retroalimentacion || '',
      minPalabras: p.tipo === 'WRITING' ? p.minPalabras || 60 : null,
      maxPalabras: p.tipo === 'WRITING' ? p.maxPalabras || 120 : null,
      puntos: Number(p.puntos) > 0 ? Number(p.puntos) : Math.round(100 / safeCount),
    })),
  };
}

export async function evaluateWritingWithCambridgeRubric(params: {
  consigna: string;
  textoEstudiante: string;
  nivelMcer: string;
  puntajeMaximo: number;
}): Promise<{
  notaSugerida: number;
  feedbackSugerido: string;
  criterios: {
    content: string;
    communicativeAchievement: string;
    organisation: string;
    language: string;
  };
}> {
  const ai = getAiClient();

  const prompt = [
    `Evalúa este texto de Writing en inglés de un estudiante de nivel MCER ${params.nivelMcer} siguiendo la rúbrica oficial de Cambridge English.`,
    `Consigna: ${params.consigna}`,
    `Respuesta del estudiante: ${params.textoEstudiante}`,
    `Puntaje máximo de la actividad: ${params.puntajeMaximo}.`,
    'Devuelve una nota sugerida justa (número entre 0 y puntajeMaximo), feedback constructivo y claro en español listo para que el docente revise o ajuste, y un breve comentario por cada criterio Cambridge (content, communicativeAchievement, organisation, language).',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          notaSugerida: { type: Type.NUMBER },
          feedbackSugerido: { type: Type.STRING },
          criterios: {
            type: Type.OBJECT,
            properties: {
              content: { type: Type.STRING },
              communicativeAchievement: { type: Type.STRING },
              organisation: { type: Type.STRING },
              language: { type: Type.STRING },
            },
            required: ['content', 'communicativeAchievement', 'organisation', 'language'],
          },
        },
        required: ['notaSugerida', 'feedbackSugerido', 'criterios'],
      },
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim()) as {
    notaSugerida: number;
    feedbackSugerido: string;
    criterios: {
      content: string;
      communicativeAchievement: string;
      organisation: string;
      language: string;
    };
  };

  return {
    notaSugerida: Math.max(
      0,
      Math.min(params.puntajeMaximo, Math.round((Number(parsed.notaSugerida) || 0) * 10) / 10),
    ),
    feedbackSugerido: parsed.feedbackSugerido || '',
    criterios: parsed.criterios || {
      content: '',
      communicativeAchievement: '',
      organisation: '',
      language: '',
    },
  };
}
