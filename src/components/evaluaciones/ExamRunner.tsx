import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  LogOut,
  Maximize2,
  Minimize2,
  Send,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  evaluateIntegrityAction,
  isQuestionAnswered,
  POLITICA_SALIDA_META,
  QUESTION_TYPE_LABELS,
} from '../../lib/exam-questions';
import type {
  EventoIntegridadExamen,
  EventoIntegridadTipo,
  PoliticaSalidaExamen,
  PreguntaItem,
  QuizItem,
} from '../../types/aula';
import { InteractiveQuestionInput } from './InteractiveQuestionInput';
import { QuestionMediaPlayer } from './QuestionMediaPlayer';

export interface ExamSubmitOutcome {
  nota: number;
  aprobado: boolean;
  puntosObtenidos: number;
  puntosTotales: number;
  requiereRevisionDocente: boolean;
  anuladoPorSalida?: boolean;
  motivoAnulacion?: string | null;
  detalle: Array<{
    preguntaId: string;
    enunciado: string;
    tipo: string;
    correcta: boolean;
    requiereRevisionManual: boolean;
    puntosObtenidos: number;
    puntosPosibles: number;
    retroalimentacion: string | null;
    respuestaCorrecta: unknown;
  }>;
}

interface ExamRunnerProps {
  quiz: QuizItem;
  intentoId: string;
  preguntas: PreguntaItem[];
  expiraEn: string | null;
  fullScreen?: boolean;
  onExit: () => void;
  onSubmitted: (outcome: ExamSubmitOutcome) => Promise<void> | void;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatExpectedAnswer(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  if (Array.isArray(val)) return val.join(' · ');
  if (typeof val === 'object') {
    return Object.values(val as Record<string, unknown>).join(' · ');
  }
  return String(val);
}

export function ExamRunner({
  quiz,
  intentoId,
  preguntas,
  expiraEn,
  fullScreen = true,
  onExit,
  onSubmitted,
}: ExamRunnerProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ExamSubmitOutcome | null>(null);

  // Integridad y control de salida
  const politicaSalida: PoliticaSalidaExamen = quiz.politicaSalida || 'ADVERTENCIA_LIMITE';
  const maxCambiosPestana = Math.max(2, quiz.maxCambiosPestana || 3);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [integrityEvents, setIntegrityEvents] = useState<EventoIntegridadExamen[]>([]);
  const [integrityBanner, setIntegrityBanner] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isBrowserFs, setIsBrowserFs] = useState(false);

  const [remainingSec, setRemainingSec] = useState<number | null>(() => {
    if (!expiraEn) return null;
    return Math.max(0, Math.floor((new Date(expiraEn).getTime() - Date.now()) / 1000));
  });

  const autoSubmittedRef = useRef(false);
  const tabSwitchesRef = useRef(0);
  const eventsRef = useRef<EventoIntegridadExamen[]>([]);
  const answersRef = useRef<Record<string, unknown>>({});
  const outcomeRef = useRef<ExamSubmitOutcome | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    outcomeRef.current = outcome;
  }, [outcome]);

  const currentQuestion = preguntas[currentIdx];

  const recordIntegrityEvent = useCallback(
    async (tipo: EventoIntegridadTipo, detalle?: string) => {
      const event: EventoIntegridadExamen = {
        tipo,
        timestamp: new Date().toISOString(),
        ...(detalle ? { detalle } : {}),
      };
      const nextList = [...eventsRef.current, event];
      eventsRef.current = nextList;
      setIntegrityEvents(nextList);

      try {
        await apiFetch(`/api/intentos/${intentoId}/evento-integridad`, {
          method: 'POST',
          body: JSON.stringify({ tipo, detalle }),
        });
      } catch {
        // Persistirá igualmente en el envío final
      }
    },
    [intentoId],
  );

  const handleSubmit = useCallback(
    async (options?: {
      auto?: boolean;
      voidByExit?: boolean;
      voidReason?: string;
    }) => {
      if (submitting || outcomeRef.current) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await apiFetch<{ resultado: ExamSubmitOutcome }>(
          `/api/intentos/${intentoId}/enviar`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              respuestas: answersRef.current,
              eventosIntegridad: eventsRef.current,
              anuladoPorSalida: Boolean(options?.voidByExit),
              motivoAnulacion: options?.voidReason || null,
            }),
          },
        );
        outcomeRef.current = res.resultado;
        setOutcome(res.resultado);
        setShowExitModal(false);
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        await onSubmitted(res.resultado);
      } catch (err) {
        setError(
          options?.auto
            ? 'El tiempo finalizó, pero hubo un problema al enviar. Intenta pulsar "Enviar examen".'
            : err instanceof Error
              ? err.message
              : 'No se pudo enviar el examen.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [intentoId, onSubmitted, submitting],
  );

  // Temporizador automático
  useEffect(() => {
    if (!expiraEn || outcome) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(expiraEn).getTime() - Date.now()) / 1000));
      setRemainingSec(diff);
      if (diff === 0 && quiz.envioAutomatico !== false && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        handleSubmit({ auto: true });
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiraEn, outcome, quiz.envioAutomatico, handleSubmit]);

  // Escucha de eventos verificables del navegador (sin anular por una sola pérdida de foco)
  useEffect(() => {
    if (outcome) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        'Tienes un examen en curso. Si sales ahora podrías perder tu intento o recibir nota 0.';
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden' || outcomeRef.current) return;
      const evalRes = evaluateIntegrityAction({
        politicaSalida,
        maxCambiosPestana,
        eventType: 'CAMBIO_PESTANA',
        currentTabSwitches: tabSwitchesRef.current,
      });
      tabSwitchesRef.current = evalRes.nextTabSwitches;
      setTabSwitches(evalRes.nextTabSwitches);
      if (evalRes.warningMessage) {
        setIntegrityBanner(evalRes.warningMessage);
      }
      void recordIntegrityEvent(
        'CAMBIO_PESTANA',
        `Cambio de pestaña #${evalRes.nextTabSwitches} (límite ${maxCambiosPestana})`,
      );
      if (evalRes.shouldVoidWithZero && evalRes.voidReason) {
        void handleSubmit({
          voidByExit: true,
          voidReason: evalRes.voidReason,
        });
      }
    };

    const handleWindowBlur = () => {
      if (outcomeRef.current) return;
      // Solo registrar pérdida de foco como telemetría verificable; NUNCA anular automáticamente
      if (document.visibilityState === 'visible') {
        void recordIntegrityEvent('PERDIDA_FOCO', 'Pérdida temporal de foco de ventana');
      }
    };

    const handleFullscreenChange = () => {
      setIsBrowserFs(Boolean(document.fullscreenElement));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [outcome, politicaSalida, maxCambiosPestana, recordIntegrityEvent, handleSubmit]);

  const handleToggleBrowserFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Navegador/iframe puede restringir fullscreen nativo; la vista ya es full-viewport
    }
  };

  const handleRequestExit = () => {
    const evalRes = evaluateIntegrityAction({
      politicaSalida,
      maxCambiosPestana,
      eventType: 'INTENTO_SALIDA',
      currentTabSwitches: tabSwitchesRef.current,
    });
    if (evalRes.warningMessage) {
      setIntegrityBanner(evalRes.warningMessage);
    }
    void recordIntegrityEvent('INTENTO_SALIDA', 'Pulsó salir durante el examen');
    setShowExitModal(true);
  };

  const handleConfirmExit = async () => {
    const evalRes = evaluateIntegrityAction({
      politicaSalida,
      maxCambiosPestana,
      eventType: 'SALIDA_CONFIRMADA',
      currentTabSwitches: tabSwitchesRef.current,
      confirmedExit: true,
    });
    tabSwitchesRef.current = evalRes.nextTabSwitches;
    setTabSwitches(evalRes.nextTabSwitches);
    await recordIntegrityEvent(
      'SALIDA_CONFIRMADA',
      evalRes.shouldVoidWithZero
        ? 'Salida confirmada: intento anulado con 0'
        : 'Salida confirmada por el estudiante',
    );

    if (evalRes.shouldVoidWithZero && evalRes.voidReason) {
      await handleSubmit({
        voidByExit: true,
        voidReason: evalRes.voidReason,
      });
    } else {
      setShowExitModal(false);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      onExit();
    }
  };

  const answeredCount = preguntas.filter((p) => isQuestionAnswered(p, answers[p.id])).length;
  const lowTime = remainingSec !== null && remainingSec <= 120;

  const wrapperClass = fullScreen
    ? 'fixed inset-0 z-50 bg-[#f5f6f8] flex flex-col overflow-hidden'
    : 'bg-white border border-[#d9d9d9] rounded-xl overflow-hidden';

  // Pantalla de resultado final (tras enviar o anular)
  if (outcome) {
    return (
      <div
        role="region"
        aria-label="Resultado del examen"
        className={
          fullScreen
            ? 'fixed inset-0 z-50 bg-[#f5f6f8] overflow-y-auto p-4 sm:p-8'
            : 'bg-white border border-[#d9d9d9] rounded-xl p-6 space-y-6'
        }
      >
        <div className="max-w-3xl mx-auto bg-white border border-[#d9d9d9] rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#d9d9d9]">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  outcome.anuladoPorSalida
                    ? 'bg-red-50 text-[#cf080d] border border-red-200'
                    : outcome.requiereRevisionDocente
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : outcome.aprobado
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-[#cf080d] border border-red-200'
                }`}
              >
                {outcome.anuladoPorSalida ? (
                  <ShieldAlert className="w-6 h-6" aria-hidden="true" />
                ) : (
                  <Award className="w-6 h-6" aria-hidden="true" />
                )}
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-[#011f52]">
                  {outcome.anuladoPorSalida
                    ? 'Examen anulado por política de salida'
                    : outcome.requiereRevisionDocente
                      ? 'Examen enviado — Redacción en revisión docente'
                      : outcome.aprobado
                        ? '¡Evaluación aprobada!'
                        : 'Evaluación completada'}
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">{quiz.titulo}</p>
              </div>
            </div>

            <div className="text-right">
              <p className="font-mono-data text-3xl font-bold text-[#011f52] tabular-nums">
                {outcome.requiereRevisionDocente ? 'Pendiente' : `${outcome.nota}/100`}
              </p>
              <p className="text-xs text-slate-500 tabular-nums">
                {outcome.puntosObtenidos}/{outcome.puntosTotales} pts · Mínimo {quiz.notaMinima}/100
              </p>
            </div>
          </div>

          {outcome.anuladoPorSalida && outcome.motivoAnulacion && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900">
              <p className="font-semibold">Motivo de anulación:</p>
              <p className="mt-1">{outcome.motivoAnulacion}</p>
            </div>
          )}

          {outcome.requiereRevisionDocente && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-950">
              Tus respuestas objetivas ya fueron calificadas automáticamente. El docente revisará tu
              sección de redacción y publicará tu nota definitiva.
            </div>
          )}

          {tabSwitches > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-[#d9d9d9] text-xs text-slate-700 flex items-center justify-between gap-2">
              <span>Registro de integridad de la sesión:</span>
              <span className="font-semibold text-[#011f52] tabular-nums">
                {tabSwitches} cambio(s) de pestaña · {integrityEvents.length} evento(s) registrados
              </span>
            </div>
          )}

          {outcome.detalle.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold text-[#011f52]">
                Revisión pregunta por pregunta
              </h3>
              {outcome.detalle.map((d, idx) => (
                <div
                  key={d.preguntaId}
                  className="p-4 rounded-xl border border-[#d9d9d9] bg-[#f8fafc] space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[#011f52]">
                      {idx + 1}. {d.enunciado}
                    </p>
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
                      {d.requiereRevisionManual ? (
                        <span className="text-amber-800">En revisión</span>
                      ) : d.correcta ? (
                        <span className="text-emerald-700 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                          {d.puntosObtenidos}/{d.puntosPosibles} pts
                        </span>
                      ) : (
                        <span className="text-[#cf080d] inline-flex items-center gap-1">
                          <XCircle className="w-4 h-4" aria-hidden="true" />
                          {d.puntosObtenidos}/{d.puntosPosibles} pts
                        </span>
                      )}
                    </span>
                  </div>

                  {!d.requiereRevisionManual && !d.correcta && d.respuestaCorrecta !== null && (
                    <p className="text-xs text-slate-600">
                      Respuesta esperada:{' '}
                      <strong className="text-[#011f52]">
                        {formatExpectedAnswer(d.respuestaCorrecta)}
                      </strong>
                    </p>
                  )}

                  {d.retroalimentacion && (
                    <p className="text-xs text-[#011f52] bg-white border border-[#d9d9d9] rounded-lg px-3 py-2">
                      {d.retroalimentacion}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onExit}
              className="px-5 py-2.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-sm font-semibold rounded-xl"
            >
              Volver al módulo de exámenes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={`Examen en modo enfoque: ${quiz.titulo}`}
      className={wrapperClass}
    >
      {/* Barra superior minimalista de modo examen (sin menús laterales ni distracciones) */}
      <header className="bg-[#011f52] text-white px-4 sm:px-6 h-16 flex items-center justify-between gap-3 shrink-0 shadow-xs">
        <div className="min-w-0 flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-white/75 uppercase tracking-wider">
              Modo examen enfocado · {POLITICA_SALIDA_META[politicaSalida].shortLabel}
            </p>
            <h2 className="font-display text-sm sm:text-base font-bold truncate">{quiz.titulo}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {remainingSec !== null && (
            <div
              role="timer"
              aria-live="off"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono-data text-sm font-bold tabular-nums ${
                lowTime ? 'bg-[#cf080d] text-white' : 'bg-white/15 text-white'
              }`}
            >
              <Clock className="w-4 h-4" aria-hidden="true" />
              <span>{formatCountdown(remainingSec)}</span>
            </div>
          )}

          <div
            title={`Cambios de pestaña registrados: ${tabSwitches} de ${maxCambiosPestana}`}
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold tabular-nums ${
              tabSwitches > 0 ? 'bg-amber-400/20 text-amber-200' : 'bg-white/10 text-white/90'
            }`}
          >
            {tabSwitches > 0 ? (
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>
              Avisos: {tabSwitches}/{maxCambiosPestana}
            </span>
          </div>

          <button
            type="button"
            onClick={handleToggleBrowserFullscreen}
            aria-label={isBrowserFs ? 'Salir de pantalla completa del navegador' : 'Ampliar a pantalla completa'}
            className="hidden sm:inline-flex p-2 rounded-lg text-white/85 hover:text-white hover:bg-white/10"
          >
            {isBrowserFs ? (
              <Minimize2 className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={handleRequestExit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-[#cf080d] text-white text-xs font-semibold transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Salir del examen</span>
          </button>
        </div>
      </header>

      {/* Banner de advertencia de integridad si ocurrió un cambio de pestaña */}
      {integrityBanner && (
        <div
          role="alert"
          className="bg-amber-50 border-b border-amber-300 px-4 sm:px-6 py-2.5 text-xs sm:text-sm text-amber-950 flex items-center justify-between gap-3 shrink-0"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            <span>{integrityBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setIntegrityBanner(null)}
            className="text-xs font-semibold text-amber-900 underline shrink-0"
          >
            Entendido
          </button>
        </div>
      )}

      {/* Cuerpo principal centrado: pregunta activa + navegador compacto de preguntas */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Pregunta activa */}
          <div className="lg:col-span-8 bg-white border border-[#d9d9d9] rounded-2xl p-5 sm:p-7 space-y-5 shadow-xs">
            {error && (
              <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
                {error}
              </div>
            )}

            {currentQuestion && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#d9d9d9]/70">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-[#011f52] bg-[#011f52]/8 px-2.5 py-1 rounded-lg">
                      Pregunta {currentIdx + 1} de {preguntas.length}
                    </span>
                    <span className="font-semibold text-slate-600">
                      {QUESTION_TYPE_LABELS[currentQuestion.tipo] || currentQuestion.tipo}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-[#011f52] tabular-nums">
                      {currentQuestion.puntos} pt(s)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setFlagged((prev) => ({
                        ...prev,
                        [currentQuestion.id]: !prev[currentQuestion.id],
                      }))
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                      flagged[currentQuestion.id]
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-white border-[#d9d9d9] text-slate-600 hover:bg-[#f5f6f8]'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{flagged[currentQuestion.id] ? 'Marcada' : 'Marcar para revisar'}</span>
                  </button>
                </div>

                {/* Enunciado (para COMPLETAR_ESPACIOS / COMPLETAR_OPCIONES se renderiza inline en el componente) */}
                {currentQuestion.tipo !== 'COMPLETAR_ESPACIOS' &&
                  currentQuestion.tipo !== 'COMPLETAR_OPCIONES' && (
                    <h3 className="text-base sm:text-lg font-semibold text-[#011f52] leading-relaxed">
                      {currentQuestion.enunciado}
                    </h3>
                  )}

                <QuestionMediaPlayer
                  audioUrl={currentQuestion.audioUrl}
                  videoUrl={currentQuestion.videoUrl}
                />

                <InteractiveQuestionInput
                  pregunta={currentQuestion}
                  value={answers[currentQuestion.id]}
                  onChange={(nextVal) =>
                    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: nextVal }))
                  }
                />

                {/* Navegación anterior / siguiente */}
                <div className="pt-4 border-t border-[#d9d9d9]/70 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#d9d9d9] bg-white hover:bg-[#f5f6f8] text-[#011f52] text-xs font-semibold rounded-lg disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    <span>Anterior</span>
                  </button>

                  {currentIdx < preguntas.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setCurrentIdx((i) => Math.min(preguntas.length - 1, i + 1))}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
                    >
                      <span>Siguiente pregunta</span>
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleSubmit()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{submitting ? 'Enviando...' : 'Finalizar y enviar'}</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Panel lateral compacto de navegación de preguntas */}
          <aside
            aria-label="Navegación de preguntas del examen"
            className="lg:col-span-4 bg-white border border-[#d9d9d9] rounded-2xl p-5 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-[#011f52]">
                Navegación del cuestionario
              </h3>
              <span className="text-xs font-semibold text-slate-600 tabular-nums">
                {answeredCount}/{preguntas.length}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {preguntas.map((p, idx) => {
                const isCurrent = idx === currentIdx;
                const isDone = isQuestionAnswered(p, answers[p.id]);
                const isFlagged = Boolean(flagged[p.id]);

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    aria-label={`Ir a pregunta ${idx + 1}${isDone ? ', respondida' : ''}`}
                    className={`relative h-10 rounded-lg text-xs font-bold border transition-colors ${
                      isCurrent
                        ? 'bg-[#011f52] text-white border-[#011f52]'
                        : isDone
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          : 'bg-white text-slate-700 border-[#d9d9d9] hover:bg-[#f5f6f8]'
                    }`}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#cf080d]"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[#d9d9d9]/70 space-y-2 text-[11px] text-slate-600">
              <p className="font-semibold text-[#011f52]">Regla de integridad activa:</p>
              <p>{POLITICA_SALIDA_META[politicaSalida].description}</p>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit()}
              className="w-full py-2.5 bg-[#cf080d] hover:bg-[#ad060a] text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Enviando examen...' : 'Enviar examen'}</span>
            </button>
          </aside>
        </div>
      </div>

      {/* Modal de confirmación explícita al intentar salir del examen */}
      {showExitModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="exit-exam-title"
          aria-describedby="exit-exam-desc"
          className="fixed inset-0 z-[60] bg-[#011f52]/65 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#d9d9d9] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-red-50 text-[#cf080d] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </span>
              <div>
                <h3 id="exit-exam-title" className="font-display text-lg font-bold text-[#011f52]">
                  ¿Seguro que deseas salir del examen?
                </h3>
                <p id="exit-exam-desc" className="text-sm text-slate-600 mt-1 leading-relaxed">
                  {politicaSalida === 'ANULAR_CON_CERO'
                    ? 'Este examen tiene restricción de salida activa. Si confirmas salir ahora, tu intento se anulará automáticamente y recibirás calificación 0/100.'
                    : 'Si abandonas el examen ahora, se registrará el evento de salida y podrías perder tus respuestas no enviadas.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                className="px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
              >
                Continuar examen
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmExit}
                className="px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
              >
                {politicaSalida === 'ANULAR_CON_CERO'
                  ? 'Confirmar salida y anular (0)'
                  : 'Confirmar salida'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
