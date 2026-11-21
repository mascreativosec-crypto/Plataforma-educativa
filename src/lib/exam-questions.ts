import type {
  EventoIntegridadTipo,
  PoliticaSalidaExamen,
  PreguntaItem,
  TipoPregunta,
} from '../types/aula';

export interface QuestionTypeMeta {
  tipo: TipoPregunta;
  label: string;
  shortLabel: string;
  description: string;
  autoGraded: boolean;
}

export const QUESTION_TYPES_META: QuestionTypeMeta[] = [
  {
    tipo: 'OPCION_MULTIPLE',
    label: 'Seleccionar respuesta correcta',
    shortLabel: 'Respuesta única',
    description: 'El estudiante elige una única opción correcta.',
    autoGraded: true,
  },
  {
    tipo: 'SELECCION_MULTIPLE',
    label: 'Selección múltiple',
    shortLabel: 'Varias opciones',
    description: 'El estudiante marca una o varias respuestas correctas.',
    autoGraded: true,
  },
  {
    tipo: 'UNIR_PAREJAS',
    label: 'Unir parejas',
    shortLabel: 'Unir parejas',
    description: 'Dos columnas interactivas para unir elementos mediante flechas o líneas.',
    autoGraded: true,
  },
  {
    tipo: 'COMPLETAR_ESPACIOS',
    label: 'Completar espacios',
    shortLabel: 'Completar espacios',
    description: 'Usa ___ en la oración para que el estudiante escriba cada palabra faltante.',
    autoGraded: true,
  },
  {
    tipo: 'ORDENAR_PALABRAS',
    label: 'Ordenar palabras',
    shortLabel: 'Ordenar palabras',
    description: 'El estudiante organiza palabras desordenadas para formar una oración.',
    autoGraded: true,
  },
  {
    tipo: 'ORDENAR_ORACIONES',
    label: 'Ordenar oraciones',
    shortLabel: 'Ordenar oraciones',
    description: 'El estudiante ordena frases o párrafos para construir un texto coherente.',
    autoGraded: true,
  },
  {
    tipo: 'RELACIONAR_COLUMNAS',
    label: 'Unir parejas',
    shortLabel: 'Unir parejas',
    description: 'Dos columnas interactivas para unir elementos mediante flechas o líneas.',
    autoGraded: true,
  },
  {
    tipo: 'COMPLETAR_OPCIONES',
    label: 'Completar mediante opciones',
    shortLabel: 'Banco de palabras',
    description: 'Completa los espacios ___ eligiendo palabras de un banco de opciones.',
    autoGraded: true,
  },
  {
    tipo: 'VERDADERO_FALSO',
    label: 'True / False',
    shortLabel: 'True / False',
    description: 'Evalúa comprensión rápida con las opciones True y False.',
    autoGraded: true,
  },
  {
    tipo: 'RESPUESTA_CORTA',
    label: 'Respuesta corta',
    shortLabel: 'Respuesta corta',
    description: 'Respuesta breve evaluada automáticamente (admite variantes con |).',
    autoGraded: true,
  },
  {
    tipo: 'WRITING',
    label: 'Redacción (Writing)',
    shortLabel: 'Writing',
    description: 'Producción escrita abierta para revisión manual o asistida por IA.',
    autoGraded: false,
  },
];

/**
 * Catálogo consolidado para el creador de preguntas (sin duplicar "Relacionar columnas" con "Unir parejas").
 */
export const CREATOR_QUESTION_TYPES_META: QuestionTypeMeta[] = QUESTION_TYPES_META.filter(
  (item) => item.tipo !== 'RELACIONAR_COLUMNAS',
);

export const QUESTION_TYPE_LABELS: Record<TipoPregunta, string> = QUESTION_TYPES_META.reduce(
  (acc, item) => {
    acc[item.tipo] = item.label;
    return acc;
  },
  {} as Record<TipoPregunta, string>,
);

export const POLITICA_SALIDA_META: Record<
  PoliticaSalidaExamen,
  {
    label: string;
    shortLabel: string;
    description: string;
  }
> = {
  SOLO_REGISTRO: {
    label: 'Solo advertir y registrar eventos',
    shortLabel: 'Solo registro',
    description:
      'Muestra advertencia si intenta salir o cambiar de pestaña y registra los eventos para el docente sin anular la nota.',
  },
  ADVERTENCIA_LIMITE: {
    label: 'Advertir y marcar alerta al docente',
    shortLabel: 'Alerta docente',
    description:
      'Advierte al estudiante y marca una alerta visible en la revisión si supera el límite de cambios de pestaña.',
  },
  ANULAR_CON_CERO: {
    label: 'Restricción estricta (anular con 0 tras confirmación o exceso)',
    shortLabel: 'Anular con 0',
    description:
      'Nunca anula por una sola pérdida de foco. Anula con nota 0 únicamente si el estudiante confirma salir o supera el límite configurable de cambios de pestaña verificables.',
  },
};

export interface PairItem {
  id: string;
  left: string;
  right: string;
  imageUrl?: string;
}

export interface UnirParejasOpciones {
  pairs: PairItem[];
}

export interface RelacionarColumnasOpciones {
  columnALabel?: string;
  columnBLabel?: string;
  items: PairItem[];
}

export interface CompletarEspaciosOpciones {
  blanksCount?: number;
  hint?: string;
}

export interface CompletarOpcionesOpciones {
  wordBank: string[];
}

export interface OrdenarPalabrasOpciones {
  words: string[];
}

export interface OrdenarOracionesOpciones {
  sentences: string[];
}

/**
 * Divide un enunciado con placeholders "___" (3 o más guiones bajos) en segmentos de texto.
 * Si hay N espacios, devuelve N+1 segmentos.
 */
export function splitBlankTemplate(template: string): string[] {
  return template.split(/_{3,}/g);
}

export function countBlanksInTemplate(template: string): number {
  const matches = template.match(/_{3,}/g);
  return matches ? matches.length : 0;
}

/**
 * Barajado determinístico (sin saltos visuales entre renders) usando semilla de texto.
 */
export function deterministicShuffle<T>(items: T[], seedText: string): T[] {
  const arr = [...items];
  if (arr.length <= 1) return arr;

  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  for (let i = arr.length - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  // Evitar devolver exactamente el mismo orden original si hay >= 2 elementos distintos
  const sameOrder = arr.every((val, idx) => val === items[idx]);
  if (sameOrder && arr.length >= 2) {
    const first = arr.shift()!;
    arr.push(first);
  }
  return arr;
}

/**
 * Verifica si el estudiante proporcionó una respuesta sustantiva para el indicador de avance.
 */
export function isQuestionAnswered(pregunta: Pick<PreguntaItem, 'tipo' | 'opciones' | 'enunciado'>, answer: unknown): boolean {
  if (answer === undefined || answer === null) return false;

  switch (pregunta.tipo) {
    case 'OPCION_MULTIPLE':
    case 'RESPUESTA_CORTA':
    case 'WRITING':
      return typeof answer === 'string' && answer.trim().length > 0;
    case 'VERDADERO_FALSO':
      return typeof answer === 'boolean';
    case 'SELECCION_MULTIPLE':
      return Array.isArray(answer) && answer.some((v) => String(v).trim().length > 0);
    case 'UNIR_PAREJAS': {
      if (typeof answer !== 'object' || Array.isArray(answer)) return false;
      const map = answer as Record<string, string>;
      const pairs = extractPairs(pregunta.opciones);
      if (pairs.length === 0) return Object.keys(map).length > 0;
      return pairs.every((p) => typeof map[p.id] === 'string' && map[p.id].trim().length > 0);
    }
    case 'RELACIONAR_COLUMNAS': {
      if (typeof answer !== 'object' || Array.isArray(answer)) return false;
      const map = answer as Record<string, string>;
      const items = extractColumnItems(pregunta.opciones);
      if (items.length === 0) return Object.keys(map).length > 0;
      return items.every((p) => typeof map[p.id] === 'string' && map[p.id].trim().length > 0);
    }
    case 'COMPLETAR_ESPACIOS':
    case 'COMPLETAR_OPCIONES': {
      if (!Array.isArray(answer)) return false;
      const expectedCount = Math.max(1, countBlanksInTemplate(pregunta.enunciado));
      return (
        answer.length >= expectedCount &&
        answer.slice(0, expectedCount).every((v) => typeof v === 'string' && v.trim().length > 0)
      );
    }
    case 'ORDENAR_PALABRAS': {
      if (!Array.isArray(answer)) return false;
      const words = extractWordPool(pregunta.opciones);
      if (words.length === 0) return answer.length > 0;
      return answer.length === words.length;
    }
    case 'ORDENAR_ORACIONES': {
      if (!Array.isArray(answer)) return false;
      const sentences = extractSentencePool(pregunta.opciones);
      if (sentences.length === 0) return answer.length > 0;
      return answer.length === sentences.length;
    }
    default:
      return false;
  }
}

export function extractPairs(opciones: unknown): PairItem[] {
  if (!opciones || typeof opciones !== 'object') return [];
  const obj = opciones as Partial<UnirParejasOpciones>;
  if (!Array.isArray(obj.pairs)) return [];
  return obj.pairs.filter((p) => p && typeof p.id === 'string' && typeof p.left === 'string');
}

export function extractColumnItems(opciones: unknown): PairItem[] {
  if (!opciones || typeof opciones !== 'object') return [];
  const obj = opciones as Partial<RelacionarColumnasOpciones>;
  if (!Array.isArray(obj.items)) return [];
  return obj.items.filter((p) => p && typeof p.id === 'string' && typeof p.left === 'string');
}

export function extractWordPool(opciones: unknown): string[] {
  if (!opciones) return [];
  if (Array.isArray(opciones)) return opciones.map(String);
  const obj = opciones as Partial<OrdenarPalabrasOpciones>;
  return Array.isArray(obj.words) ? obj.words.map(String) : [];
}

export function extractSentencePool(opciones: unknown): string[] {
  if (!opciones) return [];
  if (Array.isArray(opciones)) return opciones.map(String);
  const obj = opciones as Partial<OrdenarOracionesOpciones>;
  return Array.isArray(obj.sentences) ? obj.sentences.map(String) : [];
}

export function extractWordBank(opciones: unknown): string[] {
  if (!opciones) return [];
  if (Array.isArray(opciones)) return opciones.map(String);
  const obj = opciones as Partial<CompletarOpcionesOpciones>;
  return Array.isArray(obj.wordBank) ? obj.wordBank.map(String) : [];
}

export interface IntegrityEvaluationInput {
  politicaSalida: PoliticaSalidaExamen;
  maxCambiosPestana: number;
  eventType: EventoIntegridadTipo;
  currentTabSwitches: number;
  confirmedExit?: boolean;
}

export interface IntegrityEvaluationResult {
  nextTabSwitches: number;
  shouldWarn: boolean;
  shouldFlagForTeacher: boolean;
  shouldVoidWithZero: boolean;
  warningMessage: string | null;
  voidReason: string | null;
}

/**
 * Evalúa reglas de integridad del examen sin anular nunca por una sola pérdida de foco o notificación.
 */
export function evaluateIntegrityAction(input: IntegrityEvaluationInput): IntegrityEvaluationResult {
  const safeMax = Math.max(2, Math.min(10, Math.floor(input.maxCambiosPestana || 3)));
  const current = Math.max(0, Math.floor(input.currentTabSwitches || 0));

  // Una pérdida de foco aislada (notificación del sistema, clic en barra del SO) NUNCA anula el intento.
  if (input.eventType === 'PERDIDA_FOCO') {
    return {
      nextTabSwitches: current,
      shouldWarn: false,
      shouldFlagForTeacher: current >= safeMax,
      shouldVoidWithZero: false,
      warningMessage: null,
      voidReason: null,
    };
  }

  // Intento de salida antes de confirmar: siempre mostrar advertencia y pedir confirmación.
  if (input.eventType === 'INTENTO_SALIDA') {
    return {
      nextTabSwitches: current,
      shouldWarn: true,
      shouldFlagForTeacher: current >= safeMax,
      shouldVoidWithZero: false,
      warningMessage:
        input.politicaSalida === 'ANULAR_CON_CERO'
          ? 'Si confirmas salir del examen ahora, tu intento será anulado con calificación 0/100.'
          : 'Si sales del examen, se registrará el evento y podrías perder tu progreso actual.',
      voidReason: null,
    };
  }

  // Salida confirmada explícitamente por el estudiante en el diálogo modal.
  if (input.eventType === 'SALIDA_CONFIRMADA') {
    const voidIt = input.politicaSalida === 'ANULAR_CON_CERO' && Boolean(input.confirmedExit);
    return {
      nextTabSwitches: current + 1,
      shouldWarn: true,
      shouldFlagForTeacher: true,
      shouldVoidWithZero: voidIt,
      warningMessage: voidIt
        ? 'Intento anulado con calificación 0/100 por salida confirmada durante restricción activa.'
        : 'Salida registrada en el historial del intento.',
      voidReason: voidIt
        ? 'El estudiante confirmó abandonar el examen con restricción de salida activa.'
        : null,
    };
  }

  // Cambio de pestaña verificable (document.visibilityState === 'hidden')
  const nextCount = current + 1;
  const reachedLimit = nextCount >= safeMax;
  const exceededLimit = nextCount > safeMax;

  if (input.politicaSalida === 'ANULAR_CON_CERO' && exceededLimit) {
    return {
      nextTabSwitches: nextCount,
      shouldWarn: true,
      shouldFlagForTeacher: true,
      shouldVoidWithZero: true,
      warningMessage: `Se superó el máximo permitido de ${safeMax} cambios de pestaña. El intento quedó anulado con 0/100.`,
      voidReason: `Superó el límite configurado de ${safeMax} cambios de pestaña verificables (${nextCount} registrados).`,
    };
  }

  const remaining = Math.max(0, safeMax - nextCount);
  const warningMessage =
    input.politicaSalida === 'ANULAR_CON_CERO'
      ? remaining === 0
        ? `Aviso final (${nextCount}/${safeMax}): un cambio de pestaña adicional anulará tu intento con calificación 0/100.`
        : `Se registró un cambio de pestaña (${nextCount}/${safeMax}). Evita salir del examen; te quedan ${remaining} advertencia(s) antes de la anulación.`
      : input.politicaSalida === 'ADVERTENCIA_LIMITE' && reachedLimit
        ? `Has realizado ${nextCount} cambios de pestaña. Este intento quedará marcado para revisión del docente.`
        : `Se registró un cambio de pestaña (${nextCount}). Mantente en esta pantalla hasta enviar tu examen.`;

  return {
    nextTabSwitches: nextCount,
    shouldWarn: true,
    shouldFlagForTeacher: reachedLimit,
    shouldVoidWithZero: false,
    warningMessage,
    voidReason: null,
  };
}
