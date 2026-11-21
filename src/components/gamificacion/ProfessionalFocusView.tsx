import React, { useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Clock,
  Coins,
  Flame,
  ShoppingBag,
  Sparkles,
  Target,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { MainNavId } from '../../lib/navigation';
import type { StudentGamificationState } from '../../types/aula';
import { PetReviewGameModal } from './PetReviewGameModal';

interface ProfessionalFocusViewProps {
  data: StudentGamificationState;
  onRefresh: () => Promise<void>;
  onNavigateMain: (nav: MainNavId) => void;
}

const WEEKLY_GOAL_OPTIONS = [2, 3, 4, 5, 7];

export function ProfessionalFocusView({
  data,
  onRefresh,
  onNavigateMain,
}: ProfessionalFocusViewProps) {
  const { perfil, racha, retos } = data;
  const metaSemanal = perfil.metaSemanalSesiones || 3;
  const sesionesSemana = perfil.sesionesEstaSemana || 0;
  const pctMeta = Math.min(100, Math.round((sesionesSemana / metaSemanal) * 100));

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [microGameOpen, setMicroGameOpen] = useState(false);

  const handleUpdateGoal = async (newGoal: number) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/gamificacion/mi-perfil', {
        method: 'PATCH',
        body: JSON.stringify({ metaSemanalSesiones: newGoal }),
      });
      setNotice(`Meta semanal actualizada a ${newGoal} sesiones por semana.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la meta semanal.');
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchToJuvenil = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/gamificacion/mi-perfil', {
        method: 'PATCH',
        body: JSON.stringify({ perfilExperiencia: 'JUVENIL' }),
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la modalidad.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-7 py-6 space-y-6">
      {/* Encabezado ejecutivo sobrio */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#d9d9d9]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#cf080d] flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Modalidad Adultos y Profesionales (+18 años)</span>
          </p>
          <h1 className="font-display text-2xl font-bold text-[#011f52] mt-0.5">
            Enfoque Pro · Aprendizaje a tu ritmo
          </h1>
          <p className="text-sm text-slate-600">
            Sin mascota virtual ni distracciones: metas semanales flexibles, micro-sesiones de 3 minutos y beneficios reales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-lg bg-white border border-[#d9d9d9] text-xs font-bold text-[#011f52] tabular-nums inline-flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            <span>{perfil.puntosSaldo} ALLEN POINTS</span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={handleSwitchToJuvenil}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d9d9d9] bg-white hover:border-[#011f52] text-xs font-semibold text-[#011f52]"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#cf080d]" aria-hidden="true" />
            <span>Cambiar a Modo Juvenil (≤18)</span>
          </button>
        </div>
      </div>

      {notice && (
        <div role="status" className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Bloque principal: Meta semanal + Micro-repaso de 3 minutos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Micro-repaso ejecutivo 3 min */}
        <section className="lg:col-span-7 bg-gradient-to-br from-[#011f52] via-[#072a6b] to-[#0d3a8a] text-white rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-sm">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/12 text-xs font-semibold text-amber-200">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Micro-sesión · 3 minutos</span>
            </div>
            <h2 className="font-display text-2xl font-bold leading-tight">
              Micro-repaso ejecutivo de inglés
            </h2>
            <p className="text-sm text-white/85 leading-relaxed max-w-xl">
              Pensado para agendas ocupadas: responde 5 preguntas prácticas de tus cursos y comunicación laboral. Suma tu sesión semanal, protege tu ritmo y acumula puntos para tutorías 1:1 o certificados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMicroGameOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#cf080d] hover:bg-[#ad060a] text-white text-sm font-bold transition-colors"
            >
              <Target className="w-4 h-4" aria-hidden="true" />
              <span>Iniciar micro-repaso (3 min)</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateMain('mis-cursos')}
              className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl bg-white/12 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
            >
              <BookOpen className="w-4 h-4" aria-hidden="true" />
              <span>Ir a mis cursos</span>
            </button>
          </div>
        </section>

        {/* Meta semanal flexible (sin castigo por días sin entrar) */}
        <section className="lg:col-span-5 bg-white border border-[#d9d9d9] rounded-2xl p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-[#011f52]">
                Meta semanal flexible
              </h2>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#011f52] bg-[#f5f6f8] px-2.5 py-1 rounded-md border border-[#d9d9d9] tabular-nums">
                <Flame className="w-3.5 h-3.5 text-[#cf080d]" aria-hidden="true" />
                {sesionesSemana}/{metaSemanal} sesiones
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              En lugar de exigir conexión diaria, define cuántos días a la semana puedes estudiar sin presión.
            </p>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-[#011f52]">Avance esta semana</span>
                <span className="font-mono-data font-bold text-[#011f52]">{pctMeta}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#011f52] rounded-full transition-all duration-300"
                  style={{ width: `${pctMeta}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {sesionesSemana >= metaSemanal
                  ? '¡Meta semanal cumplida! Excelente constancia.'
                  : `Te faltan ${Math.max(0, metaSemanal - sesionesSemana)} sesión(es) para cumplir tu objetivo semanal.`}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-[#d9d9d9]">
            <p className="text-xs font-bold text-[#011f52] mb-2">
              Ajustar sesiones por semana:
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {WEEKLY_GOAL_OPTIONS.map((opt) => {
                const active = metaSemanal === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={busy}
                    onClick={() => handleUpdateGoal(opt)}
                    aria-pressed={active}
                    className={`py-2 rounded-lg text-xs font-bold border transition-colors tabular-nums ${
                      active
                        ? 'bg-[#011f52] text-white border-[#011f52]'
                        : 'bg-white text-[#011f52] border-[#d9d9d9] hover:border-[#011f52]'
                    }`}
                  >
                    {opt}d
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Pilares de valor para profesionales */}
      <section aria-label="Accesos ejecutivos" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#d9d9d9] rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <div className="w-9 h-9 rounded-lg bg-[#011f52]/8 text-[#011f52] flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="font-display text-sm font-bold text-[#011f52]">
              Racha y retos activos ({racha.rachaVigente}d)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Consulta tus metas académicas y {retos.length} retos activos sin elementos infantiles.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateMain('gamificacion')}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#011f52] hover:text-[#cf080d]"
          >
            <span>Ver rachas y retos</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="bg-white border border-[#d9d9d9] rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <div className="w-9 h-9 rounded-lg bg-[#cf080d]/10 text-[#cf080d] flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="font-display text-sm font-bold text-[#011f52]">
              Beneficios reales en Tienda
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Canjea tus {perfil.puntosSaldo} ALLEN POINTS por tutorías personalizadas, extensión de entregas o certificados.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateMain('tienda')}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#011f52] hover:text-[#cf080d]"
          >
            <span>Explorar beneficios</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="bg-white border border-[#d9d9d9] rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Award className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="font-display text-sm font-bold text-[#011f52]">
              Progreso y asistencia ALLEN
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Revisa tus calificaciones oficiales, porcentaje de asistencia sincronizado y avance por curso.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateMain('reportes')}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#011f52] hover:text-[#cf080d]"
          >
            <span>Ver mi progreso</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </section>

      <PetReviewGameModal
        open={microGameOpen}
        modo="MICRO_PRO"
        onClose={() => setMicroGameOpen(false)}
        onCompleted={onRefresh}
      />
    </main>
  );
}
