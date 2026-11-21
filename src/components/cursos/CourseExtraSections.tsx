import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  Eye,
  EyeOff,
  FileCheck2,
  Globe,
  MessageSquareHeart,
  Pencil,
  Plus,
  Save,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, formatGuayaquilDate, formatGuayaquilDateTime } from '../../lib/api';
import { POLITICA_SALIDA_META, QUESTION_TYPE_LABELS } from '../../lib/exam-questions';
import type { CourseSectionId } from '../../lib/navigation';
import { getNivelInfo, NIVELES_DISPONIBLES } from '../../lib/niveles';
import type {
  AulaUsuario,
  CursoDetalleResponse,
  LeccionDetallada,
  PreguntaItem,
  QuizItem,
} from '../../types/aula';
import { ExamRunner, type ExamSubmitOutcome } from '../evaluaciones/ExamRunner';
import { InteractiveQuestionInput } from '../evaluaciones/InteractiveQuestionInput';
import { QuestionMediaPlayer } from '../evaluaciones/QuestionMediaPlayer';
import { CourseCoverPicker } from './CourseCoverPicker';

interface CourseSummarySectionProps {
  detail: CursoDetalleResponse;
  usuario: AulaUsuario;
  enrolledCount: number;
  pendingSubmissions: number;
  onNavigateSection: (section: CourseSectionId) => void;
  onSelectLesson: (lessonId: string) => void;
  onOpenActivityPicker: () => void;
}

export function CourseSummarySection({
  detail,
  usuario,
  enrolledCount,
  pendingSubmissions,
  onNavigateSection,
  onSelectLesson,
  onOpenActivityPicker,
}: CourseSummarySectionProps) {
  const isDocente = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';
  const nivelInfo = getNivelInfo(detail.curso.nivel);
  const allLessons = detail.unidades.flatMap((u) => u.lecciones);
  const allQuizzes = allLessons.flatMap((l) => l.quizzes);
  const pinnedGreeting = detail.anuncios.find((a) => a.esSaludo) || null;

  // Próximo evento real del curso
  const upcomingEvents = [
    ...detail.tareas
      .filter((t) => t.venceEn)
      .map((t) => ({
        id: `t-${t.id}`,
        titulo: t.titulo,
        fecha: t.venceEn!,
        leccionId: t.leccionId,
        tipo: t.tipoTarea === 'WRITING' ? 'Writing' : 'Tarea',
      })),
    ...allQuizzes
      .filter((q) => q.cerrarEn || q.abrirEn)
      .map((q) => ({
        id: `q-${q.id}`,
        titulo: q.titulo,
        fecha: (q.cerrarEn || q.abrirEn)!,
        leccionId: q.leccionId,
        tipo: 'Examen',
      })),
  ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  const nextEvent = upcomingEvents[0] || null;

  return (
    <div className="space-y-5">
      {/* Tarjetas de resumen del curso (referencia visual ALLEN Aula) */}
      <section aria-label="Resumen del curso" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onNavigateSection(isDocente ? 'participantes' : 'unidades')}
          className="text-left bg-white border border-[#d9d9d9] rounded-xl p-5 hover:border-[#011f52] transition-colors"
        >
          <p className="font-display text-3xl font-bold text-[#011f52] tabular-nums">
            {isDocente ? enrolledCount : `${detail.progresoCurso}%`}
          </p>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {isDocente ? 'Estudiantes' : 'Progreso del curso'}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {detail.unidades.length} unidad(es) · {allLessons.length} lección(es)
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection(isDocente ? 'entregas' : 'tareas')}
          className="text-left bg-white border border-[#d9d9d9] rounded-xl p-5 hover:border-[#cf080d] transition-colors"
        >
          <p
            className={`font-display text-3xl font-bold tabular-nums ${
              pendingSubmissions > 0 ? 'text-[#cf080d]' : 'text-[#011f52]'
            }`}
          >
            {pendingSubmissions}
          </p>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {isDocente ? 'Entregas pendientes' : 'Tareas pendientes'}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {detail.tareas.length} tarea(s) · {allQuizzes.length} examen(es)
          </p>
        </button>

        <div className="bg-white border border-[#d9d9d9] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-bold text-[#011f52] uppercase tracking-wide">
              Próximo evento
            </p>
            {nextEvent ? (
              <>
                <p className="font-display text-base font-bold text-[#011f52] mt-1.5 leading-snug">
                  {nextEvent.titulo}
                </p>
                <p className="text-xs text-slate-600 mt-1 tabular-nums">
                  {nextEvent.tipo} · {formatGuayaquilDate(nextEvent.fecha)}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-600 mt-2">Sin eventos próximos registrados.</p>
            )}
          </div>
          {nextEvent?.leccionId && (
            <button
              type="button"
              onClick={() => {
                onNavigateSection('unidades');
                onSelectLesson(nextEvent.leccionId!);
              }}
              className="mt-3 text-xs font-semibold text-[#cf080d] hover:underline self-start"
            >
              Ir a la actividad →
            </button>
          )}
        </div>
      </section>

      {/* Saludo de bienvenida fijado si existe */}
      {pinnedGreeting && (
        <section className="bg-white border border-[#011f52]/20 rounded-xl p-5 flex items-start gap-3.5">
          <span className="w-10 h-10 rounded-lg bg-[#011f52]/8 text-[#011f52] flex items-center justify-center shrink-0">
            <MessageSquareHeart className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#cf080d]">Saludo de bienvenida del tutor</p>
            <h2 className="font-display text-base font-bold text-[#011f52] mt-0.5">
              {pinnedGreeting.titulo}
            </h2>
            <p className="text-sm text-slate-700 mt-1.5 leading-relaxed whitespace-pre-wrap">
              {pinnedGreeting.mensaje}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {pinnedGreeting.autorNombre} · {formatGuayaquilDateTime(pinnedGreeting.createdAt)}
            </p>
          </div>
        </section>
      )}

      {/* Información general del curso + accesos rápidos */}
      <section className="bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">
              Nivel {nivelInfo.etiqueta} · {detail.curso.profesorNombre || 'Docente asignado'}
            </p>
            <h2 className="font-display text-lg font-bold text-[#011f52] mt-0.5">
              Ruta académica del curso
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {isDocente && (
              <button
                type="button"
                onClick={onOpenActivityPicker}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Añadir actividad o recurso</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateSection('unidades')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ir a Unidades y lecciones</span>
            </button>
          </div>
        </div>

        {detail.curso.descripcion && (
          <p className="text-sm text-slate-700 leading-relaxed">{detail.curso.descripcion}</p>
        )}

        <div className="divide-y divide-[#d9d9d9]/70 border border-[#d9d9d9] rounded-lg">
          {detail.unidades.map((u) => (
            <div
              key={u.id}
              className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-[#f5f6f8]/60"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#011f52]">{u.titulo}</p>
                <p className="text-xs text-slate-600 tabular-nums">
                  {u.lecciones.length} lección(es)
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('unidades')}
                className="text-xs font-semibold text-[#011f52] hover:text-[#cf080d] inline-flex items-center gap-1"
              >
                <span>Ver unidad</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

interface CourseActivitiesSectionProps {
  detail: CursoDetalleResponse;
  isDocente: boolean;
  onSelectLesson: (lessonId: string) => void;
  onOpenActivityPicker: () => void;
}

export function CourseActivitiesSection({
  detail,
  isDocente,
  onSelectLesson,
  onOpenActivityPicker,
}: CourseActivitiesSectionProps) {
  const allLessons: LeccionDetallada[] = detail.unidades.flatMap((u) => u.lecciones);
  const allQuizzes: Array<QuizItem & { leccionTitulo: string }> = allLessons.flatMap((l) =>
    l.quizzes.map((q) => ({ ...q, leccionTitulo: l.titulo })),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#011f52]">Actividades del curso</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Consolidado de lecciones con recursos, tareas, Writing MCER y evaluaciones.
          </p>
        </div>
        {isDocente && (
          <button
            type="button"
            onClick={onOpenActivityPicker}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Añadir actividad</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-[#d9d9d9] rounded-xl divide-y divide-[#d9d9d9]/70">
        {detail.tareas.map((t) => (
          <div key={t.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <ClipboardCheck className="w-4 h-4 text-[#cf080d] mt-1 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-[#011f52]">{t.titulo}</p>
                <p className="text-xs text-slate-600 tabular-nums">
                  {t.tipoTarea === 'WRITING' ? `Writing ${t.nivelMcer || 'MCER'}` : 'Tarea'} ·{' '}
                  {t.venceEn ? `Vence ${formatGuayaquilDate(t.venceEn)}` : 'Sin fecha límite'} ·{' '}
                  {t.notaMaxima} pts
                </p>
              </div>
            </div>
            {t.leccionId && (
              <button
                type="button"
                onClick={() => onSelectLesson(t.leccionId!)}
                className="px-3 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
              >
                Abrir
              </button>
            )}
          </div>
        ))}

        {allQuizzes.map((q) => (
          <div key={q.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <FileCheck2 className="w-4 h-4 text-[#011f52] mt-1 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-[#011f52]">{q.titulo}</p>
                <p className="text-xs text-slate-600 tabular-nums">
                  Examen {q.nivelMcer || 'MCER'} · {q.leccionTitulo} ·{' '}
                  {q.tiempoLimiteMin ? `${q.tiempoLimiteMin} min` : 'Sin límite'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectLesson(q.leccionId)}
              className="px-3 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
            >
              Abrir
            </button>
          </div>
        ))}

        {detail.tareas.length === 0 && allQuizzes.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-600">
            Sin actividades registradas en este curso todavía.
          </div>
        )}
      </div>
    </div>
  );
}

function formatCorrectAnswerSummary(p: PreguntaItem): string {
  const ans = p.respuestaCorrecta;
  if (p.tipo === 'WRITING') {
    const range =
      p.minPalabras || p.maxPalabras
        ? ` (${p.minPalabras || 0}–${p.maxPalabras || '∞'} palabras)`
        : '';
    return `Evaluación abierta por el docente${range}.`;
  }
  if (p.tipo === 'VERDADERO_FALSO') {
    return ans === true || String(ans).toLowerCase() === 'true' ? 'True' : 'False';
  }
  if (p.tipo === 'SELECCION_MULTIPLE' || p.tipo === 'COMPLETAR_ESPACIOS' || p.tipo === 'COMPLETAR_OPCIONES') {
    if (Array.isArray(ans)) return ans.map((v, i) => (p.tipo.startsWith('COMPLETAR') ? `#${i + 1}: ${String(v)}` : String(v))).join(' · ');
  }
  if (p.tipo === 'ORDENAR_PALABRAS') {
    if (Array.isArray(ans)) return ans.join(' ');
  }
  if (p.tipo === 'ORDENAR_ORACIONES') {
    if (Array.isArray(ans)) return ans.map((s, i) => `${i + 1}) ${String(s)}`).join(' → ');
  }
  if (p.tipo === 'UNIR_PAREJAS' || p.tipo === 'RELACIONAR_COLUMNAS') {
    const rawOpts = p.opciones as
      | { pairs?: Array<{ id: string; left: string; right: string }>; items?: Array<{ id: string; left: string; right: string }> }
      | null;
    const pairs = rawOpts?.pairs || rawOpts?.items || [];
    if (pairs.length > 0) {
      return pairs.map((pair) => `${pair.left} → ${pair.right}`).join(' · ');
    }
    if (ans && typeof ans === 'object') {
      return Object.entries(ans as Record<string, string>)
        .map(([k, v]) => `${k} → ${v}`)
        .join(' · ');
    }
  }
  if (ans === null || ans === undefined || ans === '') return 'Sin clave definida.';
  return String(ans);
}

interface CourseExamsSectionProps {
  detail: CursoDetalleResponse;
  isDocente: boolean;
  autoStartQuizId?: string | null;
  onClearAutoStartQuiz?: () => void;
  onExamFocusChange?: (active: boolean) => void;
  onSelectLesson: (lessonId: string) => void;
  onOpenExamBuilder: () => void;
  onEditQuiz?: (quiz: QuizItem) => void;
  onRefresh: () => Promise<void>;
}

export function CourseExamsSection({
  detail,
  isDocente,
  autoStartQuizId,
  onClearAutoStartQuiz,
  onExamFocusChange,
  onOpenExamBuilder,
  onEditQuiz,
  onRefresh,
}: CourseExamsSectionProps) {
  const allQuizzes = detail.unidades.flatMap((u) =>
    u.lecciones.flatMap((l) =>
      l.quizzes.map((q) => ({ ...q, unidadTitulo: u.titulo, leccionTitulo: l.titulo })),
    ),
  );

  const [startingId, setStartingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<{
    quiz: QuizItem;
    intentoId: string;
    preguntas: PreguntaItem[];
    expiraEn: string | null;
  } | null>(null);

  // Vista previa docente dentro del mismo módulo de Exámenes (sin redirigir a Unidades)
  const [previewQuizId, setPreviewQuizId] = useState<string | null>(null);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [togglingPublishId, setTogglingPublishId] = useState<string | null>(null);

  const autoStartedRef = useRef<string | null>(null);

  const handleStartQuiz = async (q: QuizItem) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setStartingId(q.id);
    try {
      const data = await apiFetch<{
        intento: { id: string };
        preguntas: PreguntaItem[];
        expiraEn: string | null;
      }>(`/api/quizzes/${q.id}/intentos`, { method: 'POST' });

      setActiveAttempt({
        quiz: q,
        intentoId: data.intento.id,
        preguntas: data.preguntas,
        expiraEn: data.expiraEn,
      });
      onExamFocusChange?.(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo iniciar el examen.');
    } finally {
      setStartingId(null);
    }
  };

  const handleToggleQuizPublished = async (q: QuizItem) => {
    setTogglingPublishId(q.id);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const nextPublished = !q.publicada;
      await apiFetch(`/api/quizzes/${q.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ publicada: nextPublished }),
      });
      setStatusMsg(
        nextPublished
          ? `"${q.titulo}" fue publicado y ya está disponible para los estudiantes.`
          : `"${q.titulo}" pasó a borrador (oculto para estudiantes hasta publicarlo).`,
      );
      await onRefresh();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo cambiar el estado del cuestionario.',
      );
    } finally {
      setTogglingPublishId(null);
    }
  };

  useEffect(() => {
    if (!autoStartQuizId || isDocente) return;
    if (autoStartedRef.current === autoStartQuizId) return;
    const target = allQuizzes.find((q) => q.id === autoStartQuizId);
    if (target) {
      autoStartedRef.current = autoStartQuizId;
      onClearAutoStartQuiz?.();
      void handleStartQuiz(target);
    }
  }, [autoStartQuizId, isDocente, allQuizzes]);

  useEffect(() => {
    return () => {
      onExamFocusChange?.(false);
    };
  }, []);

  const handleExamSubmitted = async (outcome: ExamSubmitOutcome) => {
    setStatusMsg(
      outcome.anuladoPorSalida
        ? 'El intento fue anulado con nota 0/100 según la regla de salida configurada.'
        : outcome.requiereRevisionDocente
          ? 'Examen enviado. Tus respuestas objetivas fueron corregidas y la redacción quedó en revisión docente.'
          : `Examen calificado automáticamente: ${outcome.nota}/100.`,
    );
    await onRefresh();
  };

  if (activeAttempt) {
    return (
      <ExamRunner
        quiz={activeAttempt.quiz}
        intentoId={activeAttempt.intentoId}
        preguntas={activeAttempt.preguntas}
        expiraEn={activeAttempt.expiraEn}
        fullScreen
        onExit={() => {
          setActiveAttempt(null);
          autoStartedRef.current = null;
          onExamFocusChange?.(false);
        }}
        onSubmitted={handleExamSubmitted}
      />
    );
  }

  // Vista previa docente en sitio (sin salir del módulo Exámenes)
  const previewQuiz =
    isDocente && previewQuizId ? allQuizzes.find((q) => q.id === previewQuizId) || null : null;

  if (previewQuiz) {
    const politica = previewQuiz.politicaSalida || 'ADVERTENCIA_LIMITE';
    const totalPuntos = previewQuiz.preguntas.reduce((acc, p) => acc + Number(p.puntos || 0), 0);

    return (
      <div className="space-y-5">
        <div className="bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setPreviewQuizId(null);
                setPreviewAnswers({});
                setShowAnswerKey(false);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#011f52] hover:text-[#cf080d]"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Volver a exámenes</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={showAnswerKey}
                onClick={() => setShowAnswerKey((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  showAnswerKey
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-white border-[#d9d9d9] text-[#011f52] hover:border-[#011f52]'
                }`}
              >
                {showAnswerKey ? (
                  <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{showAnswerKey ? 'Ocultar respuestas' : 'Mostrar respuestas correctas'}</span>
              </button>

              <button
                type="button"
                disabled={togglingPublishId === previewQuiz.id}
                onClick={() => handleToggleQuizPublished(previewQuiz)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d9d9d9] bg-white hover:border-[#011f52] text-xs font-semibold text-[#011f52] disabled:opacity-60"
              >
                <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {togglingPublishId === previewQuiz.id
                    ? 'Actualizando...'
                    : previewQuiz.publicada
                      ? 'Pasar a borrador'
                      : 'Publicar examen'}
                </span>
              </button>

              {onEditQuiz && (
                <button
                  type="button"
                  onClick={() => onEditQuiz(previewQuiz)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Editar examen</span>
                </button>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#d9d9d9]/70 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#cf080d]">
                  Vista previa del docente
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                    previewQuiz.publicada
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {previewQuiz.publicada ? 'Publicado' : 'Borrador'}
                </span>
              </div>
              <h2 className="font-display text-xl font-bold text-[#011f52]">
                {previewQuiz.titulo}
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                {previewQuiz.unidadTitulo} · {previewQuiz.leccionTitulo}
              </p>
              {previewQuiz.descripcion && (
                <p className="text-sm text-slate-700 mt-2">{previewQuiz.descripcion}</p>
              )}
            </div>
            <div className="text-xs text-slate-600 bg-[#f5f6f8] border border-[#d9d9d9] rounded-lg px-3.5 py-2.5 space-y-1 tabular-nums">
              <p>
                <strong>Tiempo:</strong>{' '}
                {previewQuiz.tiempoLimiteMin ? `${previewQuiz.tiempoLimiteMin} min` : 'Sin límite'} ·{' '}
                <strong>Nota mín.:</strong> {previewQuiz.notaMinima}%
              </p>
              <p>
                <strong>Preguntas:</strong> {previewQuiz.preguntas.length} ·{' '}
                <strong>Total:</strong> {totalPuntos} pts ·{' '}
                <strong>Intentos:</strong> {previewQuiz.intentosMax}
              </p>
              <p>
                <strong>Control de salida:</strong> {POLITICA_SALIDA_META[politica].shortLabel}
              </p>
            </div>
          </div>
        </div>

        {statusMsg && (
          <div role="status" className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        <div className="p-3.5 rounded-xl bg-[#011f52]/5 border border-[#011f52]/20 text-xs text-[#011f52]">
          Puedes interactuar con cada pregunta exactamente como la verá el estudiante sin registrar
          intentos ni afectar calificaciones.
        </div>

        {previewQuiz.preguntas.length === 0 ? (
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-8 text-center text-sm text-slate-600">
            Este examen todavía no tiene preguntas. Usa <strong>Editar examen</strong> para agregarlas.
          </div>
        ) : (
          <div className="space-y-4">
            {previewQuiz.preguntas.map((pq, idx) => (
              <section
                key={pq.id}
                className="bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#d9d9d9]/70">
                  <span className="text-xs font-bold text-[#011f52]">
                    Pregunta {idx + 1} · {QUESTION_TYPE_LABELS[pq.tipo] || pq.tipo}
                  </span>
                  <span className="text-xs font-semibold text-slate-600 tabular-nums">
                    {pq.puntos} pt(s)
                  </span>
                </div>

                {pq.tipo !== 'COMPLETAR_ESPACIOS' && pq.tipo !== 'COMPLETAR_OPCIONES' && (
                  <p className="text-base font-semibold text-[#011f52]">{pq.enunciado}</p>
                )}

                <QuestionMediaPlayer audioUrl={pq.audioUrl} videoUrl={pq.videoUrl} compact />

                <InteractiveQuestionInput
                  pregunta={pq}
                  value={previewAnswers[pq.id]}
                  onChange={(val) =>
                    setPreviewAnswers((prev) => ({ ...prev, [pq.id]: val }))
                  }
                />

                {showAnswerKey && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Respuesta correcta: {formatCorrectAnswerSummary(pq)}</span>
                    </p>
                    {pq.retroalimentacion && (
                      <p className="text-emerald-800">
                        <strong>Retroalimentación:</strong> {pq.retroalimentacion}
                      </p>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#011f52]">
            Exámenes y cuestionarios
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {isDocente
              ? 'Previsualiza, edita y publica cuestionarios directamente desde este módulo.'
              : 'Evaluaciones interactivas cronometradas en modo enfoque de pantalla completa.'}
          </p>
        </div>
        {isDocente && (
          <button
            type="button"
            onClick={onOpenExamBuilder}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Nuevo cuestionario</span>
          </button>
        )}
      </div>

      {statusMsg && (
        <div role="status" className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {allQuizzes.length === 0 ? (
        <div className="bg-white border border-[#d9d9d9] rounded-xl p-10 text-center text-sm text-slate-600">
          Todavía no existen exámenes creados en este curso.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allQuizzes.map((q) => {
            const usados = q.misIntentos?.length ?? 0;
            const enCurso = q.misIntentos?.some((i) => i.estado === 'EN_CURSO');
            const agotados = !isDocente && usados >= q.intentosMax && !enCurso;
            const mejorNota =
              q.misIntentos && q.misIntentos.some((i) => i.nota !== null)
                ? Math.max(...q.misIntentos.map((i) => Number(i.nota ?? 0)))
                : null;
            const politica = q.politicaSalida || 'ADVERTENCIA_LIMITE';

            return (
              <article
                key={q.id}
                className="bg-white border border-[#d9d9d9] rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-xs text-slate-600 truncate">{q.unidadTitulo}</p>
                      {isDocente && (
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded border shrink-0 ${
                            q.publicada
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {q.publicada ? 'Publicado' : 'Borrador'}
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${
                        politica === 'ANULAR_CON_CERO'
                          ? 'bg-red-50 text-[#cf080d] border-red-200'
                          : 'bg-[#f5f6f8] text-[#011f52] border-[#d9d9d9]'
                      }`}
                    >
                      {politica === 'ANULAR_CON_CERO' ? (
                        <ShieldAlert className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                      )}
                      <span>{POLITICA_SALIDA_META[politica].shortLabel}</span>
                    </span>
                  </div>
                  <h3 className="font-display text-base font-bold text-[#011f52]">{q.titulo}</h3>
                  {q.descripcion && (
                    <p className="text-xs text-slate-600 line-clamp-2">{q.descripcion}</p>
                  )}
                  <p className="text-xs text-slate-500 tabular-nums flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#cf080d]" aria-hidden="true" />
                    <span>
                      {q.tiempoLimiteMin ? `${q.tiempoLimiteMin} min` : 'Sin límite'} ·{' '}
                      {q.preguntas.length} pregunta(s) · Mín. {q.notaMinima}%
                      {!isDocente ? ` · Intentos: ${usados}/${q.intentosMax}` : ''}
                    </span>
                  </p>
                  {!isDocente && mejorNota !== null && (
                    <p className="text-xs font-semibold text-emerald-800 tabular-nums">
                      Mejor nota obtenida: {mejorNota}/100
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between pt-3 border-t border-[#d9d9d9]/60 gap-2">
                  <span className="text-xs text-slate-600 truncate max-w-[160px]">
                    {q.leccionTitulo}
                  </span>
                  {isDocente ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewQuizId(q.id);
                          setPreviewAnswers({});
                          setShowAnswerKey(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Vista previa</span>
                      </button>
                      {onEditQuiz && (
                        <button
                          type="button"
                          onClick={() => onEditQuiz(q)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#d9d9d9] hover:border-[#011f52] bg-white text-[#011f52] text-xs font-semibold rounded-lg whitespace-nowrap"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Editar</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={agotados || startingId === q.id}
                      onClick={() => handleStartQuiz(q)}
                      className="px-4 py-1.5 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg whitespace-nowrap disabled:opacity-50"
                    >
                      {startingId === q.id
                        ? 'Abriendo...'
                        : agotados
                          ? 'Sin intentos'
                          : enCurso
                            ? 'Continuar examen'
                            : 'Presentar examen'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CourseQuestionBankSection({ detail }: { detail: CursoDetalleResponse }) {
  const allQuestions = detail.unidades.flatMap((u) =>
    u.lecciones.flatMap((l) =>
      l.quizzes.flatMap((q) =>
        q.preguntas.map((p) => ({
          ...p,
          quizTitulo: q.titulo,
          nivelMcer: q.nivelMcer || detail.curso.nivel || 'MCER',
        })),
      ),
    ),
  );

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#d9d9d9] rounded-xl p-5 flex items-start gap-3.5">
        <Database className="w-5 h-5 text-[#011f52] mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold text-[#cf080d]">Banco de preguntas · Ampliación en Fase 5</p>
          <h2 className="font-display text-lg font-bold text-[#011f52]">
            Preguntas activas en este curso ({allQuestions.length})
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Aquí se visualizan las preguntas reales existentes en los exámenes del curso. En Fase 5
            se incorporará el repositorio reutilizable por habilidad, dificultad e importación con IA.
          </p>
        </div>
      </div>

      {allQuestions.length > 0 && (
        <div className="bg-white border border-[#d9d9d9] rounded-xl divide-y divide-[#d9d9d9]/70">
          {allQuestions.map((p) => (
            <div key={p.id} className="p-4">
              <p className="text-xs text-slate-500">
                {p.quizTitulo} · {p.tipo} · {p.nivelMcer} · {p.puntos} pt(s)
              </p>
              <p className="text-sm font-medium text-[#011f52] mt-1">{p.enunciado}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CourseReportsSection({
  detail,
  enrolledCount,
  pendingSubmissions,
  onNavigateSection,
}: {
  detail: CursoDetalleResponse;
  enrolledCount: number;
  pendingSubmissions: number;
  onNavigateSection: (sec: CourseSectionId) => void;
}) {
  const allLessons = detail.unidades.flatMap((u) => u.lecciones);
  const allMaterials = allLessons.flatMap((l) => l.materiales);
  const allQuizzes = allLessons.flatMap((l) => l.quizzes);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-[#011f52]">Informes del curso</h2>
        <p className="text-xs text-slate-600 mt-0.5">
          Indicadores académicos reales del curso. Exportaciones Excel/PDF se incorporarán en Fase 6.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
          <p className="text-xs text-slate-600">Estudiantes activos</p>
          <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
            {enrolledCount}
          </p>
        </div>
        <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
          <p className="text-xs text-slate-600">Lecciones y recursos</p>
          <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
            {allLessons.length} / {allMaterials.length}
          </p>
        </div>
        <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
          <p className="text-xs text-slate-600">Tareas y exámenes</p>
          <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
            {detail.tareas.length} / {allQuizzes.length}
          </p>
        </div>
        <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
          <p className="text-xs text-slate-600">Entregas pendientes</p>
          <p
            className={`font-display text-2xl font-bold mt-1 tabular-nums ${
              pendingSubmissions > 0 ? 'text-[#cf080d]' : 'text-[#011f52]'
            }`}
          >
            {pendingSubmissions}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => onNavigateSection('calificaciones')}
          className="px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
        >
          Abrir libro de calificaciones
        </button>
        <button
          type="button"
          onClick={() => onNavigateSection('asistencia')}
          className="px-4 py-2 border border-[#d9d9d9] bg-white hover:border-[#011f52] text-[#011f52] text-xs font-semibold rounded-lg"
        >
          Ver asistencia del curso
        </button>
      </div>
    </div>
  );
}

export function CourseSettingsSection({
  detail,
  onUpdated,
}: {
  detail: CursoDetalleResponse;
  onUpdated: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState(detail.curso.nombre);
  const [descripcion, setDescripcion] = useState(detail.curso.descripcion || '');
  const [nivel, setNivel] = useState(detail.curso.nivel || 'A2');
  const [portadaUrl, setPortadaUrl] = useState(detail.curso.portadaUrl || '');
  const [estado, setEstado] = useState<'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO'>(detail.curso.estado);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nombre.trim().length < 3) {
      setErr('El nombre del curso debe tener al menos 3 caracteres.');
      return;
    }
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      await apiFetch(`/api/cursos/${detail.curso.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
          nivel,
          portadaUrl: portadaUrl || null,
          estado,
        }),
      });
      setMsg('Configuración del curso actualizada correctamente.');
      await onUpdated();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'No se pudo actualizar el curso.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="bg-white border border-[#d9d9d9] rounded-xl p-6 space-y-4 max-w-2xl"
    >
      <div className="flex items-center gap-2 pb-3 border-b border-[#d9d9d9]">
        <Settings className="w-5 h-5 text-[#011f52]" aria-hidden="true" />
        <h2 className="font-display text-lg font-bold text-[#011f52]">Configuración del curso</h2>
      </div>

      {msg && (
        <div role="status" className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          {msg}
        </div>
      )}
      {err && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
          {err}
        </div>
      )}

      <div>
        <label htmlFor="cfg-curso-nombre" className="block text-xs font-semibold text-[#011f52] mb-1">
          Nombre del curso
        </label>
        <input
          id="cfg-curso-nombre"
          type="text"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full px-3.5 py-2 border border-[#d9d9d9] rounded-lg text-sm text-[#011f52]"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cfg-curso-nivel" className="block text-xs font-semibold text-[#011f52] mb-1">
            Nivel / Programa
          </label>
          <select
            id="cfg-curso-nivel"
            value={nivel}
            onChange={(e) => setNivel(e.target.value)}
            className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm text-[#011f52] bg-white"
          >
            {NIVELES_DISPONIBLES.map((n) => (
              <option key={n} value={n}>
                {getNivelInfo(n).etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cfg-curso-estado" className="block text-xs font-semibold text-[#011f52] mb-1">
            Estado de publicación
          </label>
          <select
            id="cfg-curso-estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO')}
            className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm text-[#011f52] bg-white"
          >
            <option value="BORRADOR">Borrador (oculto a estudiantes)</option>
            <option value="PUBLICADO">Publicado (visible a inscritos)</option>
            <option value="ARCHIVADO">Archivado</option>
          </select>
        </div>
      </div>

      <CourseCoverPicker
        value={portadaUrl}
        onChange={setPortadaUrl}
        idPrefix="settings-course-cover"
      />

      <div>
        <label htmlFor="cfg-curso-desc" className="block text-xs font-semibold text-[#011f52] mb-1">
          Descripción
        </label>
        <textarea
          id="cfg-curso-desc"
          rows={3}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full px-3.5 py-2 border border-[#d9d9d9] rounded-lg text-sm text-[#011f52]"
        />
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
        >
          <Save className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{saving ? 'Guardando...' : 'Guardar cambios'}</span>
        </button>
      </div>
    </form>
  );
}
