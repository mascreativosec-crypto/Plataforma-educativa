import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Clock,
  Eye,
  Film,
  MessageSquarePlus,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  countBlanksInTemplate,
  CREATOR_QUESTION_TYPES_META,
  POLITICA_SALIDA_META,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES_META,
  type PairItem,
} from '../../lib/exam-questions';
import type {
  LeccionDetallada,
  PoliticaSalidaExamen,
  PreguntaItem,
  QuizItem,
  TipoPregunta,
} from '../../types/aula';
import { UnsavedChangesDialog } from '../layout/UnsavedChangesDialog';
import { InteractiveQuestionInput } from './InteractiveQuestionInput';
import { QuestionMediaPlayer } from './QuestionMediaPlayer';

interface DraftQuestion {
  localId: string;
  enunciado: string;
  tipo: TipoPregunta;
  // OPCION_MULTIPLE & SELECCION_MULTIPLE
  opciones: string[];
  respuestaCorrecta: string;
  respuestasMultiples: string[];
  // VERDADERO_FALSO
  respuestaBoolean: boolean;
  // UNIR_PAREJAS & RELACIONAR_COLUMNAS
  parejas: PairItem[];
  columnaALabel: string;
  columnaBLabel: string;
  // COMPLETAR_ESPACIOS & COMPLETAR_OPCIONES
  respuestasEspacios: string[];
  distractoresTexto: string;
  // ORDENAR_PALABRAS
  oracionCorrectaPalabras: string;
  // ORDENAR_ORACIONES
  oracionesOrdenadas: string[];
  // Opcionales habilitables por pregunta
  audioUrl: string;
  videoUrl: string;
  retroalimentacion: string;
  showAudio: boolean;
  showVideo: boolean;
  showFeedback: boolean;
  minPalabras: string;
  maxPalabras: string;
  puntos: number;
}

interface ExamBuilderModalProps {
  open: boolean;
  onClose: () => void;
  lecciones: LeccionDetallada[];
  defaultLeccionId?: string;
  defaultNivelMcer?: string | null;
  editingQuiz?: QuizItem | null;
  onCreated: () => Promise<void>;
}

function makeUid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function createDraftQuestion(tipo: TipoPregunta = 'OPCION_MULTIPLE'): DraftQuestion {
  const base: DraftQuestion = {
    localId: makeUid('q'),
    enunciado: '',
    tipo,
    opciones: ['', '', '', ''],
    respuestaCorrecta: '',
    respuestasMultiples: [],
    respuestaBoolean: true,
    parejas: [
      { id: makeUid('p'), left: '', right: '', imageUrl: '' },
      { id: makeUid('p'), left: '', right: '', imageUrl: '' },
      { id: makeUid('p'), left: '', right: '', imageUrl: '' },
    ],
    columnaALabel: 'Columna A',
    columnaBLabel: 'Columna B',
    respuestasEspacios: [''],
    distractoresTexto: '',
    oracionCorrectaPalabras: '',
    oracionesOrdenadas: ['', '', ''],
    audioUrl: '',
    videoUrl: '',
    retroalimentacion: '',
    showAudio: false,
    showVideo: false,
    showFeedback: false,
    minPalabras: '60',
    maxPalabras: '100',
    puntos: tipo === 'WRITING' ? 5 : 2,
  };

  if (tipo === 'COMPLETAR_ESPACIOS') {
    base.enunciado = 'Yesterday I ___ to the park and ___ a good book.';
    base.respuestasEspacios = ['went', 'read'];
  } else if (tipo === 'COMPLETAR_OPCIONES') {
    base.enunciado = 'She ___ English every day and ___ watching movies.';
    base.respuestasEspacios = ['studies', 'loves'];
    base.distractoresTexto = 'study, loving';
  } else if (tipo === 'ORDENAR_PALABRAS') {
    base.enunciado = 'Ordena las palabras para formar una oración correcta en inglés.';
    base.oracionCorrectaPalabras = 'She speaks English very well';
  } else if (tipo === 'ORDENAR_ORACIONES') {
    base.enunciado = 'Ordena las oraciones para formar una secuencia coherente.';
    base.oracionesOrdenadas = [
      'First, I wake up at 7:00 AM.',
      'Then, I eat breakfast with my family.',
      'Finally, I join my English class.',
    ];
  } else if (tipo === 'UNIR_PAREJAS') {
    base.enunciado = 'Une cada palabra en inglés con su traducción o definición.';
    base.parejas = [
      { id: makeUid('p'), left: 'Library', right: 'Biblioteca', imageUrl: '' },
      { id: makeUid('p'), left: 'Notebook', right: 'Cuaderno', imageUrl: '' },
      { id: makeUid('p'), left: 'Teacher', right: 'Docente', imageUrl: '' },
    ];
  } else if (tipo === 'RELACIONAR_COLUMNAS') {
    base.enunciado = 'Relaciona cada pregunta de la Columna A con su respuesta en la Columna B.';
    base.columnaALabel = 'Pregunta';
    base.columnaBLabel = 'Respuesta';
    base.parejas = [
      { id: makeUid('c'), left: 'Where do you live?', right: 'I live in Guayaquil.', imageUrl: '' },
      { id: makeUid('c'), left: 'How old are you?', right: 'I am twenty years old.', imageUrl: '' },
      { id: makeUid('c'), left: 'Can I park here?', right: 'Only for half an hour.', imageUrl: '' },
    ];
  }

  return base;
}

function draftFromQuizQuestion(p: PreguntaItem): DraftQuestion {
  const draft = createDraftQuestion(p.tipo || 'OPCION_MULTIPLE');
  draft.localId = p.id || makeUid('q');
  draft.enunciado = p.enunciado || '';
  draft.puntos = Number(p.puntos) > 0 ? Number(p.puntos) : 1;
  draft.audioUrl = p.audioUrl || '';
  draft.videoUrl = p.videoUrl || '';
  draft.retroalimentacion = p.retroalimentacion || '';
  draft.showAudio = Boolean(p.audioUrl?.trim());
  draft.showVideo = Boolean(p.videoUrl?.trim());
  draft.showFeedback = Boolean(p.retroalimentacion?.trim());
  draft.minPalabras = p.minPalabras ? String(p.minPalabras) : '60';
  draft.maxPalabras = p.maxPalabras ? String(p.maxPalabras) : '100';

  if (p.tipo === 'OPCION_MULTIPLE') {
    const opts = Array.isArray(p.opciones) ? p.opciones.map(String) : [];
    draft.opciones = opts.length >= 2 ? opts : ['', '', '', ''];
    draft.respuestaCorrecta = String(p.respuestaCorrecta ?? draft.opciones[0] ?? '');
  } else if (p.tipo === 'SELECCION_MULTIPLE') {
    const opts = Array.isArray(p.opciones) ? p.opciones.map(String) : [];
    draft.opciones = opts.length >= 2 ? opts : ['', '', '', ''];
    draft.respuestasMultiples = Array.isArray(p.respuestaCorrecta)
      ? p.respuestaCorrecta.map(String)
      : [];
  } else if (p.tipo === 'VERDADERO_FALSO') {
    draft.respuestaBoolean =
      p.respuestaCorrecta === true || String(p.respuestaCorrecta).toLowerCase() === 'true';
  } else if (p.tipo === 'UNIR_PAREJAS' || p.tipo === 'RELACIONAR_COLUMNAS') {
    const raw = p.opciones as
      | {
          pairs?: PairItem[];
          items?: PairItem[];
          columnALabel?: string;
          columnBLabel?: string;
        }
      | null;
    const list = raw?.pairs || raw?.items || [];
    if (list.length >= 2) {
      draft.parejas = list.map((item) => ({
        id: item.id || makeUid('p'),
        left: String(item.left || ''),
        right: String(item.right || ''),
        imageUrl: item.imageUrl || '',
      }));
    }
    if (raw?.columnALabel) draft.columnaALabel = raw.columnALabel;
    if (raw?.columnBLabel) draft.columnaBLabel = raw.columnBLabel;
  } else if (p.tipo === 'COMPLETAR_ESPACIOS' || p.tipo === 'COMPLETAR_OPCIONES') {
    const ans = Array.isArray(p.respuestaCorrecta)
      ? p.respuestaCorrecta.map(String)
      : [String(p.respuestaCorrecta || '')];
    draft.respuestasEspacios = ans.length > 0 ? ans : [''];
    if (p.tipo === 'COMPLETAR_OPCIONES') {
      const bank = (p.opciones as { wordBank?: string[] } | null)?.wordBank || [];
      const ansLower = new Set(ans.map((a) => a.toLowerCase()));
      const distractors = bank.filter((w) => !ansLower.has(String(w).toLowerCase()));
      draft.distractoresTexto = distractors.join(', ');
    }
  } else if (p.tipo === 'ORDENAR_PALABRAS') {
    const words = Array.isArray(p.respuestaCorrecta)
      ? p.respuestaCorrecta.map(String)
      : (p.opciones as { words?: string[] } | null)?.words || [];
    draft.oracionCorrectaPalabras = words.join(' ');
  } else if (p.tipo === 'ORDENAR_ORACIONES') {
    const sents = Array.isArray(p.respuestaCorrecta)
      ? p.respuestaCorrecta.map(String)
      : (p.opciones as { sentences?: string[] } | null)?.sentences || [];
    if (sents.length >= 2) draft.oracionesOrdenadas = sents;
  } else {
    draft.respuestaCorrecta = String(p.respuestaCorrecta ?? '');
  }

  return draft;
}

function buildPayloadFromDraft(q: DraftQuestion): {
  valid: boolean;
  error?: string;
  enunciado: string;
  tipo: TipoPregunta;
  opciones: unknown;
  respuestaCorrecta: unknown;
  audioUrl: string | null;
  videoUrl: string | null;
  retroalimentacion: string | null;
  minPalabras: number | null;
  maxPalabras: number | null;
  puntos: number;
} {
  const enunciado = q.enunciado.trim();
  const base = {
    enunciado,
    tipo: q.tipo,
    audioUrl: q.showAudio && q.audioUrl.trim() ? q.audioUrl.trim() : null,
    videoUrl: q.showVideo && q.videoUrl.trim() ? q.videoUrl.trim() : null,
    retroalimentacion:
      q.showFeedback && q.retroalimentacion.trim() ? q.retroalimentacion.trim() : null,
    minPalabras: q.tipo === 'WRITING' && Number(q.minPalabras) > 0 ? Number(q.minPalabras) : null,
    maxPalabras: q.tipo === 'WRITING' && Number(q.maxPalabras) > 0 ? Number(q.maxPalabras) : null,
    puntos: Number(q.puntos) > 0 ? Number(q.puntos) : 1,
  };

  if (enunciado.length < 3) {
    return { ...base, valid: false, error: 'Escribe el enunciado de la pregunta.', opciones: null, respuestaCorrecta: '' };
  }

  if (q.tipo === 'OPCION_MULTIPLE') {
    const cleanOpts = q.opciones.map((o) => o.trim()).filter(Boolean);
    if (cleanOpts.length < 2) {
      return { ...base, valid: false, error: 'Agrega al menos 2 opciones.', opciones: cleanOpts, respuestaCorrecta: '' };
    }
    const correct = cleanOpts.includes(q.respuestaCorrecta.trim())
      ? q.respuestaCorrecta.trim()
      : cleanOpts[0];
    return { ...base, valid: true, opciones: cleanOpts, respuestaCorrecta: correct };
  }

  if (q.tipo === 'SELECCION_MULTIPLE') {
    const cleanOpts = q.opciones.map((o) => o.trim()).filter(Boolean);
    const correctList = q.respuestasMultiples.map((r) => r.trim()).filter((r) => cleanOpts.includes(r));
    if (cleanOpts.length < 2 || correctList.length === 0) {
      return {
        ...base,
        valid: false,
        error: 'Agrega al menos 2 opciones y marca al menos 1 respuesta correcta.',
        opciones: cleanOpts,
        respuestaCorrecta: correctList,
      };
    }
    return { ...base, valid: true, opciones: cleanOpts, respuestaCorrecta: correctList };
  }

  if (q.tipo === 'UNIR_PAREJAS' || q.tipo === 'RELACIONAR_COLUMNAS') {
    const cleanPairs = q.parejas
      .map((p) => ({
        id: p.id,
        left: p.left.trim(),
        right: p.right.trim(),
        ...(p.imageUrl?.trim() ? { imageUrl: p.imageUrl.trim() } : {}),
      }))
      .filter((p) => p.left && p.right);

    if (cleanPairs.length < 2) {
      return {
        ...base,
        valid: false,
        error: 'Define al menos 2 parejas completas.',
        opciones: null,
        respuestaCorrecta: {},
      };
    }
    const answerMap: Record<string, string> = {};
    for (const p of cleanPairs) {
      answerMap[p.id] = p.right;
    }
    const opciones =
      q.tipo === 'UNIR_PAREJAS'
        ? { pairs: cleanPairs }
        : {
            columnALabel: q.columnaALabel.trim() || 'Columna A',
            columnBLabel: q.columnaBLabel.trim() || 'Columna B',
            items: cleanPairs,
          };
    return { ...base, valid: true, opciones, respuestaCorrecta: answerMap };
  }

  if (q.tipo === 'COMPLETAR_ESPACIOS' || q.tipo === 'COMPLETAR_OPCIONES') {
    const blanks = Math.max(1, countBlanksInTemplate(enunciado));
    const cleanAns = Array.from({ length: blanks }, (_, i) => (q.respuestasEspacios[i] || '').trim());
    if (cleanAns.some((a) => !a)) {
      return {
        ...base,
        valid: false,
        error: `Completa la respuesta esperada para cada uno de los ${blanks} espacio(s) ___.`,
        opciones: null,
        respuestaCorrecta: cleanAns,
      };
    }
    if (q.tipo === 'COMPLETAR_ESPACIOS') {
      return {
        ...base,
        valid: true,
        opciones: { blanksCount: blanks },
        respuestaCorrecta: cleanAns,
      };
    }
    const distractors = q.distractoresTexto
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const wordBank = [...cleanAns, ...distractors];
    return {
      ...base,
      valid: true,
      opciones: { wordBank },
      respuestaCorrecta: cleanAns,
    };
  }

  if (q.tipo === 'ORDENAR_PALABRAS') {
    const words = q.oracionCorrectaPalabras
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length < 2) {
      return {
        ...base,
        valid: false,
        error: 'Escribe una oración de al menos 2 palabras para desordenar.',
        opciones: { words },
        respuestaCorrecta: words,
      };
    }
    return { ...base, valid: true, opciones: { words }, respuestaCorrecta: words };
  }

  if (q.tipo === 'ORDENAR_ORACIONES') {
    const sentences = q.oracionesOrdenadas.map((s) => s.trim()).filter(Boolean);
    if (sentences.length < 2) {
      return {
        ...base,
        valid: false,
        error: 'Agrega al menos 2 oraciones en su orden correcto.',
        opciones: { sentences },
        respuestaCorrecta: sentences,
      };
    }
    return { ...base, valid: true, opciones: { sentences }, respuestaCorrecta: sentences };
  }

  if (q.tipo === 'VERDADERO_FALSO') {
    return { ...base, valid: true, opciones: null, respuestaCorrecta: q.respuestaBoolean };
  }

  if (q.tipo === 'RESPUESTA_CORTA') {
    if (!q.respuestaCorrecta.trim()) {
      return {
        ...base,
        valid: false,
        error: 'Indica la respuesta correcta esperada.',
        opciones: null,
        respuestaCorrecta: '',
      };
    }
    return { ...base, valid: true, opciones: null, respuestaCorrecta: q.respuestaCorrecta.trim() };
  }

  // WRITING
  return { ...base, valid: true, opciones: null, respuestaCorrecta: q.respuestaCorrecta.trim() };
}

export function ExamBuilderModal({
  open,
  onClose,
  lecciones,
  defaultLeccionId,
  defaultNivelMcer,
  editingQuiz = null,
  onCreated,
}: ExamBuilderModalProps) {
  const isEditing = Boolean(editingQuiz);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [leccionId, setLeccionId] = useState(defaultLeccionId || lecciones[0]?.id || '');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tiempoLimiteMin, setTiempoLimiteMin] = useState('25');
  const [intentosMax, setIntentosMax] = useState('1');
  const [notaMinima, setNotaMinima] = useState('70');
  const [modo, setModo] = useState<'EXAMEN' | 'PRACTICA'>('EXAMEN');
  const [mezclarPreguntas, setMezclarPreguntas] = useState(false);
  const [envioAutomatico, setEnvioAutomatico] = useState(true);
  const [politicaSalida, setPoliticaSalida] = useState<PoliticaSalidaExamen>('ADVERTENCIA_LIMITE');
  const [maxCambiosPestana, setMaxCambiosPestana] = useState('3');

  const [preguntas, setPreguntas] = useState<DraftQuestion[]>([
    createDraftQuestion('OPCION_MULTIPLE'),
  ]);

  // Estado de cambios sin guardar
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Estado interactivo para vista previa
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});

  // Asistente IA para generar banco rápido
  const [aiTopic, setAiTopic] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingQuiz) {
      setLeccionId(editingQuiz.leccionId || defaultLeccionId || lecciones[0]?.id || '');
      setTitulo(editingQuiz.titulo || '');
      setDescripcion(editingQuiz.descripcion || '');
      setTiempoLimiteMin(editingQuiz.tiempoLimiteMin ? String(editingQuiz.tiempoLimiteMin) : '25');
      setIntentosMax(String(editingQuiz.intentosMax || 1));
      setNotaMinima(String(editingQuiz.notaMinima ?? 70));
      setModo(editingQuiz.modo === 'PRACTICA' ? 'PRACTICA' : 'EXAMEN');
      setMezclarPreguntas(Boolean(editingQuiz.mezclarPreguntas));
      setEnvioAutomatico(editingQuiz.envioAutomatico !== false);
      setPoliticaSalida(editingQuiz.politicaSalida || 'ADVERTENCIA_LIMITE');
      setMaxCambiosPestana(String(editingQuiz.maxCambiosPestana ?? 3));
      setPreguntas(
        editingQuiz.preguntas && editingQuiz.preguntas.length > 0
          ? editingQuiz.preguntas.map(draftFromQuizQuestion)
          : [createDraftQuestion('OPCION_MULTIPLE')],
      );
    } else {
      setLeccionId(defaultLeccionId || lecciones[0]?.id || '');
      setTitulo('');
      setDescripcion('');
      setTiempoLimiteMin('25');
      setIntentosMax('1');
      setNotaMinima('70');
      setModo('EXAMEN');
      setMezclarPreguntas(false);
      setEnvioAutomatico(true);
      setPoliticaSalida('ADVERTENCIA_LIMITE');
      setMaxCambiosPestana('3');
      setPreguntas([createDraftQuestion('OPCION_MULTIPLE')]);
    }
    setViewMode('edit');
    setPreviewAnswers({});
    setIsDirty(false);
    setShowDiscardDialog(false);
    setError(null);
  }, [open, editingQuiz, defaultLeccionId]);

  const previewQuestions: PreguntaItem[] = useMemo(
    () =>
      preguntas.map((q, idx) => {
        const built = buildPayloadFromDraft(q);
        return {
          id: q.localId,
          quizId: editingQuiz?.id || 'preview',
          orden: idx + 1,
          enunciado: built.enunciado || `Pregunta ${idx + 1} (sin enunciado todavía)`,
          tipo: built.tipo,
          opciones: built.opciones,
          respuestaCorrecta: built.respuestaCorrecta,
          audioUrl: built.audioUrl,
          videoUrl: built.videoUrl,
          retroalimentacion: built.retroalimentacion,
          minPalabras: built.minPalabras,
          maxPalabras: built.maxPalabras,
          puntos: built.puntos,
        };
      }),
    [preguntas, editingQuiz],
  );

  if (!open) return null;

  const requestClose = () => {
    if (saving) return;
    if (isDirty) {
      setShowDiscardDialog(true);
      return;
    }
    onClose();
  };

  const updateQuestion = (idx: number, patch: Partial<DraftQuestion>) => {
    setIsDirty(true);
    setPreguntas((prev) =>
      prev.map((q, i) => {
        if (i !== idx) return q;
        const next = { ...q, ...patch };
        if (
          (next.tipo === 'COMPLETAR_ESPACIOS' || next.tipo === 'COMPLETAR_OPCIONES') &&
          patch.enunciado !== undefined
        ) {
          const blanks = Math.max(1, countBlanksInTemplate(next.enunciado));
          next.respuestasEspacios = Array.from(
            { length: blanks },
            (_, bIdx) => next.respuestasEspacios[bIdx] || '',
          );
        }
        return next;
      }),
    );
  };

  const changeQuestionType = (idx: number, nextTipo: TipoPregunta) => {
    setIsDirty(true);
    setPreguntas((prev) =>
      prev.map((q, i) => {
        if (i !== idx) return q;
        const fresh = createDraftQuestion(nextTipo);
        return {
          ...fresh,
          localId: q.localId,
          puntos: q.puntos,
        };
      }),
    );
  };

  const handleAddQuestion = (tipo: TipoPregunta) => {
    setIsDirty(true);
    setPreguntas((prev) => [...prev, createDraftQuestion(tipo)]);
  };

  const handleRemoveQuestion = (idx: number) => {
    setIsDirty(true);
    setPreguntas((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const handleGenerateWithAi = async () => {
    setAiBusy(true);
    setError(null);
    try {
      const targetLesson = lecciones.find((l) => l.id === leccionId);
      const data = await apiFetch<{
        preguntas: Array<{
          enunciado: string;
          tipo: TipoPregunta;
          opciones?: string[];
          respuestaCorrecta?: unknown;
          retroalimentacion?: string;
          puntos?: number;
        }>;
      }>('/api/ia/generar-preguntas', {
        method: 'POST',
        body: JSON.stringify({
          tema: aiTopic.trim() || targetLesson?.titulo || titulo || 'English Practice',
          nivelMcer: defaultNivelMcer || 'A2',
          habilidad: 'MIXTO',
          cantidad: 4,
          incluirWriting: true,
        }),
      });

      if (data.preguntas?.length) {
        setIsDirty(true);
        setPreguntas(
          data.preguntas.map((p) => {
            const draft = createDraftQuestion(p.tipo || 'OPCION_MULTIPLE');
            draft.enunciado = p.enunciado;
            draft.puntos = p.puntos || (p.tipo === 'WRITING' ? 4 : 2);
            draft.retroalimentacion = p.retroalimentacion || '';
            draft.showFeedback = Boolean(p.retroalimentacion?.trim());
            if (p.tipo === 'OPCION_MULTIPLE') {
              draft.opciones = Array.isArray(p.opciones) && p.opciones.length >= 2 ? p.opciones : ['', '', '', ''];
              draft.respuestaCorrecta = String(p.respuestaCorrecta ?? draft.opciones[0] ?? '');
            } else if (p.tipo === 'VERDADERO_FALSO') {
              draft.respuestaBoolean = Boolean(p.respuestaCorrecta);
            } else {
              draft.respuestaCorrecta = String(p.respuestaCorrecta ?? '');
            }
            return draft;
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron generar preguntas con IA.');
    } finally {
      setAiBusy(false);
    }
  };

  const saveQuiz = async (publicar: boolean) => {
    setError(null);
    if (!leccionId) {
      setError('Selecciona la lección a la que pertenece este cuestionario.');
      return;
    }
    if (titulo.trim().length < 3) {
      setError('Ingresa un título de al menos 3 caracteres.');
      return;
    }

    const builtList = preguntas.map((q) => buildPayloadFromDraft(q));
    const invalidIdx = builtList.findIndex((b) => !b.valid);
    if (invalidIdx !== -1) {
      setViewMode('edit');
      setError(`Pregunta ${invalidIdx + 1}: ${builtList[invalidIdx].error}`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        leccionId,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        tiempoLimiteMin: Number(tiempoLimiteMin) > 0 ? Number(tiempoLimiteMin) : null,
        intentosMax: Number(intentosMax) || 1,
        notaMinima: Number(notaMinima) || 70,
        modo,
        mezclarPreguntas,
        envioAutomatico,
        politicaSalida,
        maxCambiosPestana: Math.max(2, Math.min(10, Number(maxCambiosPestana) || 3)),
        publicada: publicar,
        preguntas: builtList.map((b) => ({
          enunciado: b.enunciado,
          tipo: b.tipo,
          opciones: b.opciones,
          respuestaCorrecta: b.respuestaCorrecta,
          audioUrl: b.audioUrl,
          videoUrl: b.videoUrl,
          retroalimentacion: b.retroalimentacion,
          minPalabras: b.minPalabras,
          maxPalabras: b.maxPalabras,
          puntos: b.puntos,
        })),
      };

      if (editingQuiz) {
        await apiFetch(`/api/quizzes/${editingQuiz.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/quizzes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setIsDirty(false);
      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cuestionario.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveQuiz(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-builder-title"
      className="fixed inset-0 z-50 bg-[#011f52]/55 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div className="bg-white border border-[#d9d9d9] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Encabezado */}
        <div className="px-5 py-4 border-b border-[#d9d9d9] flex flex-wrap items-center justify-between gap-3 bg-[#011f52] text-white">
          <div className="flex items-center gap-2.5">
            <CheckSquare className="w-5 h-5 text-white" aria-hidden="true" />
            <div>
              <h2 id="exam-builder-title" className="font-display text-lg font-bold">
                {isEditing ? 'Editar cuestionario o examen' : 'Nuevo cuestionario o examen'}
              </h2>
              <p className="text-xs text-white/80">
                {isEditing
                  ? 'Actualiza preguntas, reglas de salida o estado de publicación.'
                  : 'Crea preguntas interactivas, configura reglas de salida y revisa la vista previa.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  viewMode === 'edit' ? 'bg-white text-[#011f52]' : 'text-white/90 hover:text-white'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Editor</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  viewMode === 'preview' ? 'bg-white text-[#011f52]' : 'text-white/90 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Vista previa ({preguntas.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={requestClose}
              aria-label="Cerrar creador de cuestionario"
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}

          {viewMode === 'preview' ? (
            /* VISTA PREVIA INTERACTIVA DEL ESTUDIANTE */
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#cf080d]">
                    Vista previa interactiva del estudiante
                  </p>
                  <h3 className="font-display text-lg font-bold text-[#011f52] mt-0.5">
                    {titulo.trim() || 'Cuestionario sin título todavía'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Tiempo: {tiempoLimiteMin || 'Sin límite'} min · Regla de salida:{' '}
                    {POLITICA_SALIDA_META[politicaSalida].shortLabel} · Prueba responder cada
                    pregunta antes de publicar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className="px-3.5 py-2 rounded-lg border border-[#011f52] text-[#011f52] text-xs font-semibold hover:bg-[#011f52]/5"
                >
                  Volver al editor
                </button>
              </div>

              {previewQuestions.map((pq, idx) => (
                <div
                  key={pq.id}
                  className="bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#d9d9d9]/70">
                    <span className="text-xs font-bold text-[#011f52]">
                      Pregunta {idx + 1} · {QUESTION_TYPE_LABELS[pq.tipo]}
                    </span>
                    <span className="text-xs font-semibold text-slate-600 tabular-nums">
                      {pq.puntos} pt(s)
                    </span>
                  </div>
                  {pq.tipo !== 'COMPLETAR_ESPACIOS' && pq.tipo !== 'COMPLETAR_OPCIONES' && (
                    <p className="text-base font-semibold text-[#011f52]">{pq.enunciado}</p>
                  )}
                  <QuestionMediaPlayer
                    audioUrl={pq.audioUrl}
                    videoUrl={pq.videoUrl}
                    compact
                  />
                  <InteractiveQuestionInput
                    pregunta={pq}
                    value={previewAnswers[pq.id]}
                    onChange={(val) =>
                      setPreviewAnswers((prev) => ({ ...prev, [pq.id]: val }))
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            /* MODO EDITOR */
            <>
              {/* 1. Configuración general del cuestionario */}
              <section className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-6">
                  <label htmlFor="quiz-titulo" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Título del cuestionario
                  </label>
                  <input
                    id="quiz-titulo"
                    type="text"
                    required
                    value={titulo}
                    onChange={(e) => {
                      setIsDirty(true);
                      setTitulo(e.target.value);
                    }}
                    placeholder="Ej. Evaluación Unidad 1: Vocabulario y Gramática"
                    className="w-full px-3.5 py-2 border border-[#d9d9d9] rounded-lg text-sm text-[#011f52]"
                  />
                </div>

                <div className="md:col-span-6">
                  <label htmlFor="quiz-leccion" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Lección donde aparecerá
                  </label>
                  <select
                    id="quiz-leccion"
                    value={leccionId}
                    onChange={(e) => {
                      setIsDirty(true);
                      setLeccionId(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm bg-white text-[#011f52]"
                  >
                    {lecciones.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.titulo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label htmlFor="quiz-tiempo" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Tiempo límite (minutos)
                  </label>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
                    <input
                      id="quiz-tiempo"
                      type="number"
                      min={1}
                      max={240}
                      value={tiempoLimiteMin}
                      onChange={(e) => {
                        setIsDirty(true);
                        setTiempoLimiteMin(e.target.value);
                      }}
                      className="w-full pl-8 pr-3 py-2 border border-[#d9d9d9] rounded-lg text-sm font-mono-data"
                    />
                  </div>
                </div>

                <div className="md:col-span-3">
                  <label htmlFor="quiz-modo" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Tipo de evaluación
                  </label>
                  <select
                    id="quiz-modo"
                    value={modo}
                    onChange={(e) => {
                      setIsDirty(true);
                      setModo(e.target.value as 'EXAMEN' | 'PRACTICA');
                    }}
                    className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm bg-white text-[#011f52]"
                  >
                    <option value="EXAMEN">Examen calificado</option>
                    <option value="PRACTICA">Cuestionario de práctica</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label htmlFor="quiz-intentos" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Intentos permitidos
                  </label>
                  <input
                    id="quiz-intentos"
                    type="number"
                    min={1}
                    max={10}
                    value={intentosMax}
                    onChange={(e) => {
                      setIsDirty(true);
                      setIntentosMax(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm font-mono-data"
                  />
                </div>

                <div className="md:col-span-3">
                  <label htmlFor="quiz-min" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Nota mínima (/100)
                  </label>
                  <input
                    id="quiz-min"
                    type="number"
                    min={0}
                    max={100}
                    value={notaMinima}
                    onChange={(e) => {
                      setIsDirty(true);
                      setNotaMinima(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm font-mono-data"
                  />
                </div>

                <div className="md:col-span-12">
                  <label htmlFor="quiz-desc" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Instrucciones para el estudiante (opcional)
                  </label>
                  <input
                    id="quiz-desc"
                    type="text"
                    value={descripcion}
                    onChange={(e) => {
                      setIsDirty(true);
                      setDescripcion(e.target.value);
                    }}
                    placeholder="Ej. Lee atentamente cada pregunta antes de responder. Tienes un solo intento."
                    className="w-full px-3.5 py-2 border border-[#d9d9d9] rounded-lg text-sm text-[#011f52]"
                  />
                </div>

                <div className="md:col-span-12 flex flex-wrap gap-5 text-xs text-[#011f52]">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={envioAutomatico}
                      onChange={(e) => {
                        setIsDirty(true);
                        setEnvioAutomatico(e.target.checked);
                      }}
                      className="accent-[#011f52]"
                    />
                    <span>Enviar automáticamente cuando termine el tiempo</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mezclarPreguntas}
                      onChange={(e) => {
                        setIsDirty(true);
                        setMezclarPreguntas(e.target.checked);
                      }}
                      className="accent-[#011f52]"
                    />
                    <span>Mezclar el orden de las preguntas para cada estudiante</span>
                  </label>
                </div>
              </section>

              {/* 2. Reglas de integridad y restricción de salida */}
              <section className="p-4 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9] space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#011f52]" aria-hidden="true" />
                  <h3 className="font-display text-sm font-bold text-[#011f52]">
                    Modo enfoque y control de salida del examen
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-8">
                    <label
                      htmlFor="quiz-politica-salida"
                      className="block text-xs font-semibold text-[#011f52] mb-1"
                    >
                      Acción ante cambios de pestaña o intento de salida
                    </label>
                    <select
                      id="quiz-politica-salida"
                      value={politicaSalida}
                      onChange={(e) => {
                        setIsDirty(true);
                        setPoliticaSalida(e.target.value as PoliticaSalidaExamen);
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-xs sm:text-sm text-[#011f52]"
                    >
                      <option value="SOLO_REGISTRO">
                        Solo advertir y registrar eventos (sin anular nota)
                      </option>
                      <option value="ADVERTENCIA_LIMITE">
                        Advertir y marcar alerta al docente al superar límite
                      </option>
                      <option value="ANULAR_CON_CERO">
                        Anular intento con 0 tras confirmación de salida o superar límite
                      </option>
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <label
                      htmlFor="quiz-max-cambios"
                      className="block text-xs font-semibold text-[#011f52] mb-1"
                    >
                      Límite de cambios de pestaña
                    </label>
                    <input
                      id="quiz-max-cambios"
                      type="number"
                      min={2}
                      max={10}
                      value={maxCambiosPestana}
                      onChange={(e) => {
                        setIsDirty(true);
                        setMaxCambiosPestana(e.target.value);
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-sm font-mono-data"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-600">
                  {POLITICA_SALIDA_META[politicaSalida].description}
                </p>
              </section>

              {/* 3. Asistente IA opcional */}
              <section className="p-3.5 rounded-xl bg-white border border-[#011f52]/20 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#011f52] shrink-0">
                  <Sparkles className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
                  <span>Asistente IA:</span>
                </div>
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Tema para sugerir preguntas base (ej. Past Simple & Travel)..."
                  aria-label="Tema para generar preguntas con IA"
                  className="flex-1 px-3 py-1.5 bg-[#f5f6f8] border border-[#d9d9d9] rounded-lg text-xs"
                />
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={handleGenerateWithAi}
                  className="px-3.5 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg disabled:opacity-60 whitespace-nowrap"
                >
                  {aiBusy ? 'Generando...' : 'Sugerir preguntas'}
                </button>
              </section>

              {/* 4. Constructor de preguntas interactivas */}
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-base font-bold text-[#011f52]">
                    Preguntas del cuestionario ({preguntas.length})
                  </h3>

                  <button
                    type="button"
                    onClick={() => handleAddQuestion('OPCION_MULTIPLE')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Agregar pregunta</span>
                  </button>
                </div>

                {preguntas.map((q, idx) => {
                  const typeMeta = QUESTION_TYPES_META.find((m) => m.tipo === q.tipo);
                  return (
                    <div
                      key={q.localId}
                      className="p-4 sm:p-5 rounded-xl border border-[#d9d9d9] bg-white space-y-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#d9d9d9]/70">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-white bg-[#011f52] px-2.5 py-1 rounded-md">
                            #{idx + 1}
                          </span>
                          <select
                            aria-label={`Tipo de pregunta ${idx + 1}`}
                            value={q.tipo === 'RELACIONAR_COLUMNAS' ? 'UNIR_PAREJAS' : q.tipo}
                            onChange={(e) => changeQuestionType(idx, e.target.value as TipoPregunta)}
                            className="px-2.5 py-1.5 border border-[#d9d9d9] rounded-lg text-xs font-semibold bg-[#f5f6f8] text-[#011f52]"
                          >
                            {CREATOR_QUESTION_TYPES_META.map((meta) => (
                              <option key={meta.tipo} value={meta.tipo}>
                                {meta.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                            <span>Puntos:</span>
                            <input
                              type="number"
                              min={0.5}
                              max={50}
                              step={0.5}
                              value={q.puntos}
                              onChange={(e) =>
                                updateQuestion(idx, { puntos: Number(e.target.value) || 1 })
                              }
                              className="w-16 px-2 py-1 border border-[#d9d9d9] rounded-md text-xs font-mono-data text-center"
                            />
                          </label>
                          {preguntas.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveQuestion(idx)}
                              aria-label={`Eliminar pregunta ${idx + 1}`}
                              className="p-1.5 text-slate-500 hover:text-[#cf080d] rounded-lg hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      {typeMeta && (
                        <p className="text-xs text-slate-500">{typeMeta.description}</p>
                      )}

                      {/* Enunciado */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-[#011f52]">
                            {q.tipo === 'COMPLETAR_ESPACIOS' || q.tipo === 'COMPLETAR_OPCIONES'
                              ? 'Oración con espacios (escribe ___ donde va cada palabra faltante)'
                              : 'Enunciado o consigna'}
                          </label>
                          {(q.tipo === 'COMPLETAR_ESPACIOS' || q.tipo === 'COMPLETAR_OPCIONES') && (
                            <button
                              type="button"
                              onClick={() =>
                                updateQuestion(idx, {
                                  enunciado: `${q.enunciado.trim()} ___ `.trimStart(),
                                })
                              }
                              className="text-[11px] font-semibold text-[#011f52] hover:text-[#cf080d] underline"
                            >
                              + Insertar espacio (___)
                            </button>
                          )}
                        </div>
                        <textarea
                          rows={2}
                          required
                          value={q.enunciado}
                          onChange={(e) => updateQuestion(idx, { enunciado: e.target.value })}
                          placeholder="Escribe aquí la pregunta o instrucción para el estudiante..."
                          className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm text-[#011f52]"
                        />
                      </div>

                      {/* EDITOR 1: OPCION_MULTIPLE */}
                      {q.tipo === 'OPCION_MULTIPLE' && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-[#011f52]">
                            Opciones (marca el círculo de la única respuesta correcta):
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.opciones.map((opt, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`correct-single-${q.localId}`}
                                  checked={Boolean(opt.trim()) && q.respuestaCorrecta === opt}
                                  onChange={() => updateQuestion(idx, { respuestaCorrecta: opt })}
                                  aria-label={`Marcar opción ${optIdx + 1} como correcta`}
                                  className="accent-[#011f52]"
                                />
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => {
                                    const nextOpts = [...q.opciones];
                                    const wasCorrect = q.respuestaCorrecta === opt;
                                    nextOpts[optIdx] = e.target.value;
                                    updateQuestion(idx, {
                                      opciones: nextOpts,
                                      ...(wasCorrect ? { respuestaCorrecta: e.target.value } : {}),
                                    });
                                  }}
                                  placeholder={`Opción ${String.fromCharCode(65 + optIdx)}`}
                                  className="flex-1 px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* EDITOR 2: SELECCION_MULTIPLE */}
                      {q.tipo === 'SELECCION_MULTIPLE' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-[#011f52]">
                              Opciones (marca todas las respuestas correctas):
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                updateQuestion(idx, { opciones: [...q.opciones, ''] })
                              }
                              className="text-[11px] font-semibold text-[#011f52] hover:text-[#cf080d]"
                            >
                              + Añadir opción
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.opciones.map((opt, optIdx) => {
                              const checked = Boolean(opt.trim()) && q.respuestasMultiples.includes(opt);
                              return (
                                <div key={optIdx} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      if (!opt.trim()) return;
                                      const next = checked
                                        ? q.respuestasMultiples.filter((x) => x !== opt)
                                        : [...q.respuestasMultiples, opt];
                                      updateQuestion(idx, { respuestasMultiples: next });
                                    }}
                                    aria-label={`Marcar opción ${optIdx + 1} como correcta`}
                                    className="accent-[#011f52]"
                                  />
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const nextOpts = [...q.opciones];
                                      const oldVal = opt;
                                      nextOpts[optIdx] = e.target.value;
                                      const nextMulti = q.respuestasMultiples.map((m) =>
                                        m === oldVal ? e.target.value : m,
                                      );
                                      updateQuestion(idx, {
                                        opciones: nextOpts,
                                        respuestasMultiples: nextMulti,
                                      });
                                    }}
                                    placeholder={`Opción ${optIdx + 1}`}
                                    className="flex-1 px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* EDITOR 3 & 7: UNIR_PAREJAS & RELACIONAR_COLUMNAS */}
                      {(q.tipo === 'UNIR_PAREJAS' || q.tipo === 'RELACIONAR_COLUMNAS') && (
                        <div className="space-y-2.5">
                          {q.tipo === 'RELACIONAR_COLUMNAS' && (
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={q.columnaALabel}
                                onChange={(e) =>
                                  updateQuestion(idx, { columnaALabel: e.target.value })
                                }
                                placeholder="Título Columna A"
                                aria-label="Título Columna A"
                                className="px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs font-semibold bg-[#f5f6f8]"
                              />
                              <input
                                type="text"
                                value={q.columnaBLabel}
                                onChange={(e) =>
                                  updateQuestion(idx, { columnaBLabel: e.target.value })
                                }
                                placeholder="Título Columna B"
                                aria-label="Título Columna B"
                                className="px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs font-semibold bg-[#f5f6f8]"
                              />
                            </div>
                          )}

                          <div className="space-y-2">
                            {q.parejas.map((pair, pIdx) => (
                              <div
                                key={pair.id}
                                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                              >
                                <input
                                  type="text"
                                  value={pair.left}
                                  onChange={(e) => {
                                    const next = q.parejas.map((it, i) =>
                                      i === pIdx ? { ...it, left: e.target.value } : it,
                                    );
                                    updateQuestion(idx, { parejas: next });
                                  }}
                                  placeholder={
                                    q.tipo === 'RELACIONAR_COLUMNAS'
                                      ? `Elemento A${pIdx + 1}`
                                      : `Palabra / concepto ${pIdx + 1}`
                                  }
                                  className="sm:col-span-5 px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs"
                                />
                                <input
                                  type="text"
                                  value={pair.right}
                                  onChange={(e) => {
                                    const next = q.parejas.map((it, i) =>
                                      i === pIdx ? { ...it, right: e.target.value } : it,
                                    );
                                    updateQuestion(idx, { parejas: next });
                                  }}
                                  placeholder={
                                    q.tipo === 'RELACIONAR_COLUMNAS'
                                      ? `Respuesta B${pIdx + 1}`
                                      : `Definición o traducción ${pIdx + 1}`
                                  }
                                  className="sm:col-span-5 px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs"
                                />
                                <div className="sm:col-span-2 flex items-center justify-end gap-1">
                                  {q.parejas.length > 2 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateQuestion(idx, {
                                          parejas: q.parejas.filter((_, i) => i !== pIdx),
                                        })
                                      }
                                      aria-label={`Quitar pareja ${pIdx + 1}`}
                                      className="p-1 text-slate-400 hover:text-[#cf080d]"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuestion(idx, {
                                parejas: [
                                  ...q.parejas,
                                  { id: makeUid('p'), left: '', right: '', imageUrl: '' },
                                ],
                              })
                            }
                            className="text-xs font-semibold text-[#011f52] hover:text-[#cf080d]"
                          >
                            + Añadir pareja
                          </button>
                        </div>
                      )}

                      {/* EDITOR 4 & 8: COMPLETAR_ESPACIOS & COMPLETAR_OPCIONES */}
                      {(q.tipo === 'COMPLETAR_ESPACIOS' || q.tipo === 'COMPLETAR_OPCIONES') && (
                        <div className="space-y-2.5 p-3 rounded-lg bg-[#f5f6f8] border border-[#d9d9d9]">
                          <p className="text-xs font-semibold text-[#011f52]">
                            Respuestas correctas para cada espacio (___):
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Array.from(
                              { length: Math.max(1, countBlanksInTemplate(q.enunciado)) },
                              (_, bIdx) => (
                                <div key={bIdx} className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-[#011f52] shrink-0">
                                    Espacio {bIdx + 1}:
                                  </span>
                                  <input
                                    type="text"
                                    value={q.respuestasEspacios[bIdx] || ''}
                                    onChange={(e) => {
                                      const next = [...q.respuestasEspacios];
                                      next[bIdx] = e.target.value;
                                      updateQuestion(idx, { respuestasEspacios: next });
                                    }}
                                    placeholder={
                                      q.tipo === 'COMPLETAR_ESPACIOS'
                                        ? 'Palabra (usa | para sinónimos)'
                                        : 'Palabra exacta del banco'
                                    }
                                    className="flex-1 px-2.5 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs"
                                  />
                                </div>
                              ),
                            )}
                          </div>
                          {q.tipo === 'COMPLETAR_OPCIONES' && (
                            <div>
                              <label className="block text-xs font-semibold text-[#011f52] mb-1">
                                Palabras distractoras adicionales (separadas por coma, opcional)
                              </label>
                              <input
                                type="text"
                                value={q.distractoresTexto}
                                onChange={(e) =>
                                  updateQuestion(idx, { distractoresTexto: e.target.value })
                                }
                                placeholder="Ej. study, going, plays"
                                className="w-full px-3 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* EDITOR 5: ORDENAR_PALABRAS */}
                      {q.tipo === 'ORDENAR_PALABRAS' && (
                        <div className="space-y-2 p-3 rounded-lg bg-[#f5f6f8] border border-[#d9d9d9]">
                          <label className="block text-xs font-semibold text-[#011f52]">
                            Escribe la oración en su orden correcto (el sistema la desordenará automáticamente):
                          </label>
                          <input
                            type="text"
                            value={q.oracionCorrectaPalabras}
                            onChange={(e) =>
                              updateQuestion(idx, { oracionCorrectaPalabras: e.target.value })
                            }
                            placeholder="Ej. They are going to travel next week"
                            className="w-full px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-sm text-[#011f52]"
                          />
                          {q.oracionCorrectaPalabras.trim() && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {q.oracionCorrectaPalabras
                                .trim()
                                .split(/\s+/)
                                .map((w, wIdx) => (
                                  <span
                                    key={`${w}-${wIdx}`}
                                    className="px-2 py-0.5 rounded bg-white border border-[#d9d9d9] text-[11px] font-semibold text-[#011f52]"
                                  >
                                    {w}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* EDITOR 6: ORDENAR_ORACIONES */}
                      {q.tipo === 'ORDENAR_ORACIONES' && (
                        <div className="space-y-2 p-3 rounded-lg bg-[#f5f6f8] border border-[#d9d9d9]">
                          <p className="text-xs font-semibold text-[#011f52]">
                            Escribe las oraciones en el orden lógico correcto (1 → final):
                          </p>
                          {q.oracionesOrdenadas.map((sent, sIdx) => (
                            <div key={sIdx} className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded bg-[#011f52] text-white text-xs font-bold flex items-center justify-center shrink-0">
                                {sIdx + 1}
                              </span>
                              <input
                                type="text"
                                value={sent}
                                onChange={(e) => {
                                  const next = [...q.oracionesOrdenadas];
                                  next[sIdx] = e.target.value;
                                  updateQuestion(idx, { oracionesOrdenadas: next });
                                }}
                                placeholder={`Oración #${sIdx + 1}`}
                                className="flex-1 px-3 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs"
                              />
                              {q.oracionesOrdenadas.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuestion(idx, {
                                      oracionesOrdenadas: q.oracionesOrdenadas.filter(
                                        (_, i) => i !== sIdx,
                                      ),
                                    })
                                  }
                                  aria-label={`Quitar oración ${sIdx + 1}`}
                                  className="p-1 text-slate-400 hover:text-[#cf080d]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              updateQuestion(idx, {
                                oracionesOrdenadas: [...q.oracionesOrdenadas, ''],
                              })
                            }
                            className="text-xs font-semibold text-[#011f52] hover:text-[#cf080d]"
                          >
                            + Añadir oración
                          </button>
                        </div>
                      )}

                      {/* EDITOR 9: VERDADERO_FALSO (True / False) */}
                      {q.tipo === 'VERDADERO_FALSO' && (
                        <div className="flex items-center gap-5 text-xs font-semibold text-[#011f52]">
                          <span>Respuesta correcta:</span>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`vf-${q.localId}`}
                              checked={q.respuestaBoolean === true}
                              onChange={() => updateQuestion(idx, { respuestaBoolean: true })}
                              className="accent-[#011f52]"
                            />
                            <span>True</span>
                          </label>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`vf-${q.localId}`}
                              checked={q.respuestaBoolean === false}
                              onChange={() => updateQuestion(idx, { respuestaBoolean: false })}
                              className="accent-[#011f52]"
                            />
                            <span>False</span>
                          </label>
                        </div>
                      )}

                      {/* EDITOR 10: RESPUESTA_CORTA */}
                      {q.tipo === 'RESPUESTA_CORTA' && (
                        <input
                          type="text"
                          value={q.respuestaCorrecta}
                          onChange={(e) =>
                            updateQuestion(idx, { respuestaCorrecta: e.target.value })
                          }
                          placeholder="Respuesta aceptada (separa sinónimos con | ej. went|walked)"
                          className="w-full px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs"
                        />
                      )}

                      {/* EDITOR 11: WRITING */}
                      {q.tipo === 'WRITING' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-[#f5f6f8] border border-[#d9d9d9]">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#011f52] mb-1">
                              Mínimo de palabras
                            </label>
                            <input
                              type="number"
                              min={10}
                              value={q.minPalabras}
                              onChange={(e) =>
                                updateQuestion(idx, { minPalabras: e.target.value })
                              }
                              className="w-full px-2.5 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs font-mono-data"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#011f52] mb-1">
                              Máximo de palabras
                            </label>
                            <input
                              type="number"
                              min={20}
                              value={q.maxPalabras}
                              onChange={(e) =>
                                updateQuestion(idx, { maxPalabras: e.target.value })
                              }
                              className="w-full px-2.5 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs font-mono-data"
                            />
                          </div>
                        </div>
                      )}

                      {/* Opcionales habilitables bajo demanda: Audio, Video y Retroalimentación */}
                      <div className="pt-2 border-t border-[#d9d9d9]/60 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-500">
                            Recursos opcionales:
                          </span>
                          <button
                            type="button"
                            aria-pressed={q.showAudio}
                            onClick={() =>
                              updateQuestion(idx, {
                                showAudio: !q.showAudio,
                                ...(q.showAudio ? { audioUrl: '' } : {}),
                              })
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                              q.showAudio
                                ? 'bg-[#011f52] text-white border-[#011f52]'
                                : 'bg-white text-[#011f52] border-[#d9d9d9] hover:bg-[#f5f6f8]'
                            }`}
                          >
                            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{q.showAudio ? 'Audio activo' : '+ Audio'}</span>
                          </button>

                          <button
                            type="button"
                            aria-pressed={q.showVideo}
                            onClick={() =>
                              updateQuestion(idx, {
                                showVideo: !q.showVideo,
                                ...(q.showVideo ? { videoUrl: '' } : {}),
                              })
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                              q.showVideo
                                ? 'bg-[#011f52] text-white border-[#011f52]'
                                : 'bg-white text-[#011f52] border-[#d9d9d9] hover:bg-[#f5f6f8]'
                            }`}
                          >
                            <Film className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{q.showVideo ? 'Video activo' : '+ Video'}</span>
                          </button>

                          <button
                            type="button"
                            aria-pressed={q.showFeedback}
                            onClick={() =>
                              updateQuestion(idx, {
                                showFeedback: !q.showFeedback,
                                ...(q.showFeedback ? { retroalimentacion: '' } : {}),
                              })
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                              q.showFeedback
                                ? 'bg-[#011f52] text-white border-[#011f52]'
                                : 'bg-white text-[#011f52] border-[#d9d9d9] hover:bg-[#f5f6f8]'
                            }`}
                          >
                            <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {q.showFeedback ? 'Retroalimentación activa' : '+ Retroalimentación'}
                            </span>
                          </button>
                        </div>

                        {(q.showAudio || q.showVideo || q.showFeedback) && (
                          <div className="space-y-2.5 pt-1">
                            {q.showAudio && (
                              <div>
                                <label className="block text-[11px] font-semibold text-[#011f52] mb-1">
                                  Enlace de audio (MP3, WAV, OGG o Google Drive)
                                </label>
                                <input
                                  type="url"
                                  value={q.audioUrl}
                                  onChange={(e) => updateQuestion(idx, { audioUrl: e.target.value })}
                                  placeholder="https://... (archivo de audio o enlace compartido de Drive)"
                                  aria-label={`Audio opcional pregunta ${idx + 1}`}
                                  className="w-full px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs"
                                />
                              </div>
                            )}

                            {q.showVideo && (
                              <div>
                                <label className="block text-[11px] font-semibold text-[#011f52] mb-1">
                                  Enlace de video (YouTube, Vimeo, Google Drive o MP4)
                                </label>
                                <input
                                  type="url"
                                  value={q.videoUrl}
                                  onChange={(e) => updateQuestion(idx, { videoUrl: e.target.value })}
                                  placeholder="https://www.youtube.com/watch?v=... o enlace MP4 / Drive"
                                  aria-label={`Video opcional pregunta ${idx + 1}`}
                                  className="w-full px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs"
                                />
                              </div>
                            )}

                            {q.showFeedback && (
                              <div>
                                <label className="block text-[11px] font-semibold text-[#011f52] mb-1">
                                  Retroalimentación al finalizar el intento
                                </label>
                                <input
                                  type="text"
                                  value={q.retroalimentacion}
                                  onChange={(e) =>
                                    updateQuestion(idx, { retroalimentacion: e.target.value })
                                  }
                                  placeholder="Explicación que verá el estudiante al enviar su examen..."
                                  aria-label={`Retroalimentación pregunta ${idx + 1}`}
                                  className="w-full px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            </>
          )}

          {/* Footer de acciones */}
          <div className="pt-4 border-t border-[#d9d9d9] flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'edit' ? 'preview' : 'edit')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#011f52] text-[#011f52] hover:bg-[#011f52]/5 text-xs font-semibold rounded-lg"
            >
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{viewMode === 'edit' ? 'Ver vista previa' : 'Seguir editando'}</span>
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={requestClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#011f52]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveQuiz(false)}
                className="px-4 py-2 border border-[#011f52] text-[#011f52] hover:bg-[#011f52]/5 text-xs font-semibold rounded-lg disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Guardar borrador'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
              >
                {saving
                  ? 'Guardando...'
                  : isEditing
                    ? 'Guardar y publicar'
                    : 'Publicar cuestionario'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <UnsavedChangesDialog
        open={showDiscardDialog}
        title="¿Descartar cambios del cuestionario?"
        message="Tienes cambios sin guardar en este cuestionario. Si sales ahora, perderás las modificaciones realizadas."
        confirmLabel="Sí, descartar cambios"
        cancelLabel="Seguir editando"
        onConfirmDiscard={() => {
          setShowDiscardDialog(false);
          setIsDirty(false);
          onClose();
        }}
        onContinueEditing={() => setShowDiscardDialog(false)}
      />
    </div>
  );
}
