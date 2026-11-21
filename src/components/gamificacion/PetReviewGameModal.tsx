import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Flame,
  Gamepad2,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { MascotaState, PetMood, ReviewGameQuestion } from '../../types/aula';
import { VirtualPetAvatar } from './VirtualPetAvatar';

export type ReviewGameMode = 'REPASO' | 'SIMULADOR' | 'MICRO_PRO';

interface ReviewGameResultPayload {
  aciertos: number;
  total: number;
  porcentaje: number;
  aprobado: boolean;
  rachaActivada: boolean;
  rachaActual: number;
  puntosGanados: number;
  xpGanado: number;
  puntosSaldo: number;
  mensaje: string;
}

interface PetReviewGameModalProps {
  open: boolean;
  modo: ReviewGameMode;
  mascota?: MascotaState;
  onClose: () => void;
  onCompleted: () => Promise<void>;
}

export function PetReviewGameModal({
  open,
  modo,
  mascota,
  onClose,
  onCompleted,
}: PetReviewGameModalProps) {
  const showPet = modo !== 'MICRO_PRO' && Boolean(mascota);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ReviewGameQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeftSec, setTimeLeftSec] = useState(60);
  const [result, setResult] = useState<ReviewGameResultPayload | null>(null);

  const loadRound = useCallback(async () => {
    setLoading(true);
    setError(null);
    setQuestions([]);
    setCurrentIdx(0);
    setSelectedOption(null);
    setCorrectCount(0);
    setTimeLeftSec(60);
    setResult(null);
    try {
      const data = await apiFetch<{ preguntas: ReviewGameQuestion[] }>(
        `/api/mascota/juego-repaso?modo=${modo}`,
      );
      setQuestions(data.preguntas || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el repaso.');
    } finally {
      setLoading(false);
    }
  }, [modo]);

  useEffect(() => {
    if (open) {
      loadRound();
    }
  }, [open, loadRound]);

  const finishRound = useCallback(
    async (finalCorrect: number, totalQuestions: number) => {
      if (submitting || result) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await apiFetch<ReviewGameResultPayload>(
          '/api/mascota/juego-repaso/completar',
          {
            method: 'POST',
            body: JSON.stringify({
              aciertos: finalCorrect,
              total: Math.max(1, totalQuestions),
              modoJuego: modo,
            }),
          },
        );
        setResult(res);
        await onCompleted();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo registrar el resultado.');
      } finally {
        setSubmitting(false);
      }
    },
    [modo, onCompleted, result, submitting],
  );

  // Temporizador para modo SIMULADOR (60 segundos)
  useEffect(() => {
    if (!open || modo !== 'SIMULADOR' || loading || result || questions.length === 0) return;
    if (timeLeftSec <= 0) {
      finishRound(correctCount, questions.length);
      return;
    }
    const timer = setTimeout(() => setTimeLeftSec((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [open, modo, loading, result, questions.length, timeLeftSec, correctCount, finishRound]);

  if (!open) return null;

  const currentQuestion = questions[currentIdx];
  const isAnswered = selectedOption !== null;
  const isCorrectAnswer =
    isAnswered &&
    currentQuestion &&
    selectedOption.trim().toLowerCase() === currentQuestion.respuestaCorrecta.trim().toLowerCase();

  const petReactionMood: PetMood = result
    ? result.aprobado
      ? 'EMOCIONADA'
      : 'FELIZ'
    : isAnswered
      ? isCorrectAnswer
        ? 'EMOCIONADA'
        : 'ESPERANDO'
      : 'FELIZ';

  const petSpeech = !mascota
    ? ''
    : isAnswered
      ? isCorrectAnswer
        ? `¡Excelente! ${mascota.nombre} salta de alegría. ¡Sigue así!`
        : `Buen intento. Lee la pista para reforzarlo y avanzamos juntos.`
      : modo === 'SIMULADOR'
        ? `¡Reto contrarreloj! Responde con calma y precisión junto a ${mascota.nombre}.`
        : `Repasemos juntos esta pregunta para mantener tu racha y mi energía al máximo.`;

  const handleSelectOption = (option: string) => {
    if (isAnswered || !currentQuestion) return;
    setSelectedOption(option);
    const correct =
      option.trim().toLowerCase() === currentQuestion.respuestaCorrecta.trim().toLowerCase();
    if (correct) {
      setCorrectCount((c) => c + 1);
    }
  };

  const handleNext = () => {
    if (!currentQuestion) return;
    if (currentIdx + 1 >= questions.length) {
      finishRound(correctCount, questions.length);
    } else {
      setCurrentIdx((idx) => idx + 1);
      setSelectedOption(null);
    }
  };

  const headerTitle =
    modo === 'MICRO_PRO'
      ? 'Micro-repaso ejecutivo (3 min)'
      : modo === 'SIMULADOR'
        ? `Simulador rápido con ${mascota?.nombre || 'tu mascota'}`
        : `Juego de repaso con ${mascota?.nombre || 'tu mascota'}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={headerTitle}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#011f52]/55 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-[#d9d9d9] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-[#011f52] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {modo === 'MICRO_PRO' ? (
              <Target className="w-5 h-5 text-amber-300 shrink-0" aria-hidden="true" />
            ) : (
              <Gamepad2 className="w-5 h-5 text-amber-300 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold truncate">{headerTitle}</h2>
              <p className="text-[11px] text-white/75">
                {modo === 'MICRO_PRO'
                  ? '5 preguntas breves de inglés práctico para cumplir tu meta semanal.'
                  : 'Cada ronda completada fortalece tu racha y mantiene activa a tu mascota.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {modo === 'SIMULADOR' && !result && !loading && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono-data font-bold ${
                  timeLeftSec <= 15 ? 'bg-[#cf080d] text-white' : 'bg-white/15 text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                {timeLeftSec}s
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar juego de repaso"
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-sm text-slate-600">
              <RefreshCw className="w-6 h-6 animate-spin text-[#011f52]" aria-hidden="true" />
              <span>Preparando preguntas de repaso...</span>
            </div>
          ) : result ? (
            <div className="space-y-5 text-center">
              <div className="flex flex-col items-center gap-3">
                {showPet && mascota ? (
                  <VirtualPetAvatar
                    especie={mascota.especie}
                    etapa={mascota.stageInfo.etapa}
                    mood={petReactionMood}
                    accesorioCabeza={mascota.accesorioCabeza}
                    accesorioCuello={mascota.accesorioCuello}
                    fondoHabitat={mascota.fondoHabitat}
                    size="md"
                    celebrating={result.aprobado}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[#011f52]/10 text-[#011f52] flex items-center justify-center">
                    <Trophy className="w-8 h-8 text-[#cf080d]" aria-hidden="true" />
                  </div>
                )}

                <div>
                  <h3 className="font-display text-2xl font-bold text-[#011f52]">
                    {result.aprobado ? '¡Sesión completada!' : 'Repaso registrado'}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                    {modo === 'MICRO_PRO'
                      ? `Completaste ${result.aciertos} de ${result.total} preguntas (${result.porcentaje}%). Tu progreso semanal fue actualizado.`
                      : result.mensaje}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-left">
                <div className="p-3.5 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9]">
                  <p className="text-[11px] font-semibold text-slate-500">Precisión</p>
                  <p className="font-display text-xl font-bold text-[#011f52] tabular-nums mt-0.5">
                    {result.aciertos}/{result.total} ({result.porcentaje}%)
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9]">
                  <p className="text-[11px] font-semibold text-slate-500">Recompensa</p>
                  <p className="font-display text-xl font-bold text-emerald-700 tabular-nums mt-0.5">
                    +{result.puntosGanados} pts
                  </p>
                  <p className="text-[11px] text-slate-500">+{result.xpGanado} XP</p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9]">
                  <p className="text-[11px] font-semibold text-slate-500">Racha actual</p>
                  <p className="font-display text-xl font-bold text-[#cf080d] tabular-nums mt-0.5 flex items-center gap-1">
                    <Flame className="w-4 h-4" aria-hidden="true" />
                    {result.rachaActual}d
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {result.rachaActivada ? 'Activa hoy' : 'Acierta 2+ para activar'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={loadRound}
                  className="px-4 py-2.5 rounded-xl border border-[#011f52] text-[#011f52] hover:bg-[#f5f6f8] text-sm font-semibold"
                >
                  Jugar otra ronda
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-[#011f52] hover:bg-[#022a6e] text-white text-sm font-semibold"
                >
                  Volver al aula
                </button>
              </div>
            </div>
          ) : currentQuestion ? (
            <>
              {/* Barra de progreso */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>
                    Pregunta {currentIdx + 1} de {questions.length} ·{' '}
                    <span className="text-[#011f52]">{currentQuestion.tema}</span>
                  </span>
                  <span className="tabular-nums text-emerald-700">Aciertos: {correctCount}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#cf080d] transition-all duration-300"
                    style={{ width: `${((currentIdx + (isAnswered ? 1 : 0)) / questions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Compañero vivo acompañando el repaso (solo en modo juvenil) */}
              {showPet && mascota && (
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9]">
                  <VirtualPetAvatar
                    especie={mascota.especie}
                    etapa={mascota.stageInfo.etapa}
                    mood={petReactionMood}
                    accesorioCabeza={mascota.accesorioCabeza}
                    accesorioCuello={mascota.accesorioCuello}
                    fondoHabitat={mascota.fondoHabitat}
                    size="xs"
                    celebrating={Boolean(isAnswered && isCorrectAnswer)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#011f52] flex items-center gap-1.5">
                      <span>{mascota.nombre}</span>
                      <Sparkles className="w-3.5 h-3.5 text-[#cf080d]" aria-hidden="true" />
                    </p>
                    <p className="text-xs text-slate-700 leading-snug mt-0.5">{petSpeech}</p>
                  </div>
                </div>
              )}

              {/* Enunciado y opciones */}
              <div className="space-y-3">
                <p className="font-display text-base sm:text-lg font-bold text-[#011f52] leading-snug">
                  {currentQuestion.enunciado}
                </p>

                <div className="grid grid-cols-1 gap-2.5">
                  {currentQuestion.opciones.map((opt, idx) => {
                    const isPicked = selectedOption === opt;
                    const isRightOpt =
                      opt.trim().toLowerCase() ===
                      currentQuestion.respuestaCorrecta.trim().toLowerCase();

                    let btnStyle =
                      'bg-white border-[#d9d9d9] text-[#011f52] hover:border-[#011f52] hover:bg-[#f5f6f8]';
                    if (isAnswered) {
                      if (isRightOpt) {
                        btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold';
                      } else if (isPicked) {
                        btnStyle = 'bg-red-50 border-red-400 text-red-900';
                      } else {
                        btnStyle = 'bg-slate-50 border-slate-200 text-slate-400';
                      }
                    }

                    return (
                      <button
                        key={`${currentQuestion.id}-${idx}`}
                        type="button"
                        disabled={isAnswered}
                        onClick={() => handleSelectOption(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center justify-between gap-3 ${btnStyle}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-md bg-[#011f52]/8 text-[#011f52] text-xs font-bold inline-flex items-center justify-center shrink-0">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span>{opt}</span>
                        </span>
                        {isAnswered && isRightOpt && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                        )}
                        {isAnswered && isPicked && !isRightOpt && (
                          <XCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Explicación y botón continuar */}
              {isAnswered && (
                <div className="p-3.5 rounded-xl bg-[#011f52]/5 border border-[#011f52]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-[#011f52] leading-relaxed">
                    <strong className="font-bold">Explicación: </strong>
                    {currentQuestion.explicacion}
                  </p>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleNext}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-bold whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <span>
                      {submitting
                        ? 'Guardando...'
                        : currentIdx + 1 >= questions.length
                          ? 'Ver resultado'
                          : 'Siguiente'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
