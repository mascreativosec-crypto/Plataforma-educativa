import React, { useMemo, useState } from 'react';
import {
  Apple,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Gamepad2,
  Globe,
  Heart,
  Lock,
  Pencil,
  ShoppingBag,
  Sparkles,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { MainNavId } from '../../lib/navigation';
import {
  WORLD_PETS_CATALOG,
  WORLD_PET_REGIONS,
  getWorldPetMeta,
  resolveWorldPetSpecies,
  type WorldPetRegion,
} from '../../lib/world-pets';
import type { PetSpecies, StudentGamificationState } from '../../types/aula';
import { PetReviewGameModal, type ReviewGameMode } from './PetReviewGameModal';
import { VirtualPetAvatar } from './VirtualPetAvatar';

interface PetHubViewProps {
  data: StudentGamificationState;
  onRefresh: () => Promise<void>;
  onNavigateMain: (nav: MainNavId) => void;
}

const HEAD_ACCESSORIES = [
  { key: null, label: 'Sin accesorio' },
  { key: 'lentes', label: 'Lentes Explorador' },
  { key: 'birrete', label: 'Birrete Cambridge' },
  { key: 'audifonos', label: 'Audífonos Pro' },
  { key: 'corona', label: 'Corona Dorada' },
];

const NECK_ACCESSORIES = [
  { key: null, label: 'Sin vestimenta' },
  { key: 'bufanda_allen', label: 'Bufanda ALLEN' },
  { key: 'capa_maestro', label: 'Capa de Maestro' },
];

const HABITAT_OPTIONS = [
  { key: 'aula', label: 'Aula ALLEN (Gratis)' },
  { key: 'biblioteca', label: 'Biblioteca Nocturna' },
  { key: 'londres', label: 'Londres & Big Ben' },
];

export function PetHubView({ data, onRefresh, onNavigateMain }: PetHubViewProps) {
  const { mascota, perfil, racha } = data;
  const currentSpecies = resolveWorldPetSpecies(mascota.especie);
  const currentMeta = getWorldPetMeta(currentSpecies);
  const vitalidad = mascota.vitalidad;

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(mascota.nombre);
  const [regionFilter, setRegionFilter] = useState<'Todas' | WorldPetRegion>('Todas');
  const [activeGameMode, setActiveGameMode] = useState<ReviewGameMode | null>(null);

  const unlocked = new Set<string>(['aula', ...(mascota.accesoriosDesbloqueados || [])]);

  const filteredWorldPets = useMemo(() => {
    if (regionFilter === 'Todas') return WORLD_PETS_CATALOG;
    return WORLD_PETS_CATALOG.filter((p) => p.region === regionFilter);
  }, [regionFilter]);

  const handleQuickCare = async (accion: 'ALIMENTAR' | 'CUIDAR') => {
    setBusyAction(accion);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiFetch<{
        puntosGanados: number;
        pet: { ultimaReaccion: string | null };
      }>('/api/mascota/interactuar', {
        method: 'POST',
        body: JSON.stringify({ accion }),
      });
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 1800);
      setFeedback(
        res.puntosGanados > 0
          ? `${res.pet.ultimaReaccion || '¡Cuidado completado!'} (+${res.puntosGanados} ALLEN POINTS)`
          : res.pet.ultimaReaccion || '¡Tu mascota se siente renovada!',
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCustomize = async (patch: Record<string, unknown>, successText: string) => {
    setBusyAction('CUSTOMIZE');
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/mascota', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setEditingName(false);
      setFeedback(successText);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la personalización.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSwitchToPro = async () => {
    setBusyAction('MODE');
    setError(null);
    try {
      await apiFetch('/api/gamificacion/mi-perfil', {
        method: 'PATCH',
        body: JSON.stringify({ perfilExperiencia: 'PROFESIONAL' }),
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar a Enfoque Pro.');
    } finally {
      setBusyAction(null);
    }
  };

  const vitalityBadgeStyle =
    vitalidad?.nivelVital === 'RADIANTE'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : vitalidad?.nivelVital === 'ACTIVA'
        ? 'bg-sky-50 text-sky-800 border-sky-200'
        : vitalidad?.nivelVital === 'NECESITA_REPASO'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-red-50 text-red-800 border-red-200';

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-7 py-6 space-y-6">
      {/* Encabezado compacto */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#d9d9d9]">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#011f52]">Mi mascota</h1>
          <p className="text-sm text-slate-600">
            Adopta un compañero del mundo, dale nombre y mantenlo activo con tus repasos, tareas, exámenes y racha diaria.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-white border border-[#d9d9d9] text-xs font-bold text-[#011f52] tabular-nums">
            {perfil.puntosSaldo} ALLEN POINTS
          </div>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleSwitchToPro}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d9d9d9] bg-white hover:border-[#011f52] text-xs font-semibold text-[#011f52] transition-colors"
          >
            <Briefcase className="w-3.5 h-3.5 text-[#011f52]" aria-hidden="true" />
            <span>¿Adulto (+18)? Enfoque Pro</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateMain('tienda')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold transition-colors"
          >
            <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tienda</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 font-medium flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Escenario principal + Accesorios */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white border border-[#d9d9d9] rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <VirtualPetAvatar
              especie={currentSpecies}
              etapa={mascota.stageInfo.etapa}
              mood={mascota.mood.mood}
              accesorioCabeza={mascota.accesorioCabeza}
              accesorioCuello={mascota.accesorioCuello}
              fondoHabitat={mascota.fondoHabitat}
              size="lg"
              celebrating={celebrating}
            />

            <div className="flex-1 min-w-0 w-full space-y-3">
              {/* Nombre editable */}
              <div className="flex items-center justify-between gap-2">
                {editingName ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleCustomize({ nombre: nameInput }, `Tu mascota ahora se llama "${nameInput.trim()}".`);
                    }}
                    className="flex items-center gap-2 flex-1"
                  >
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      maxLength={32}
                      aria-label="Nombre de tu mascota"
                      className="px-3 py-1.5 text-sm border border-[#011f52] rounded-lg w-full text-[#011f52] font-semibold"
                    />
                    <button
                      type="submit"
                      disabled={busyAction !== null}
                      className="px-3 py-1.5 bg-[#011f52] text-white text-xs font-semibold rounded-lg"
                    >
                      Guardar
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="font-display text-2xl font-bold text-[#011f52] truncate">
                      {mascota.nombre}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(mascota.nombre);
                        setEditingName(true);
                      }}
                      aria-label="Cambiar nombre de mascota"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-[#011f52] hover:bg-[#f5f6f8]"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}

                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${vitalityBadgeStyle}`}
                >
                  {vitalidad ? vitalidad.etiqueta : mascota.mood.etiqueta}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-[#cf080d]">
                  {currentMeta.nombreEspecie}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">{currentMeta.origen}</span>
                <span className="text-slate-400">·</span>
                <span className="font-semibold text-[#011f52]">
                  Nivel {mascota.stageInfo.nivel} ({mascota.stageInfo.etapaNombre})
                </span>
              </div>

              {/* Burbuja de diálogo */}
              <div className="p-3.5 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9] text-sm text-[#011f52] leading-snug">
                “{mascota.ultimaReaccion || vitalidad?.resumen || mascota.mood.mensaje}”
              </div>

              {/* Barra XP evolutiva */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-slate-600">Experiencia ({mascota.xp} XP)</span>
                  <span className="font-mono-data font-semibold text-[#011f52]">
                    {mascota.stageInfo.xpNivelActual}/{mascota.stageInfo.xpSiguienteNivel} XP
                  </span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#011f52] rounded-full transition-all duration-500"
                    style={{ width: `${mascota.stageInfo.progresoNivelPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Vitalidad ligada al estudio */}
          <div className="p-4 rounded-xl bg-[#011f52]/[0.03] border border-[#011f52]/15 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#011f52] flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
                <span>Vitalidad ligada a tu estudio y racha ({racha.rachaVigente} días)</span>
              </p>
              <span className="text-xs font-mono-data font-bold text-[#011f52]">
                {vitalidad?.porcentaje ?? Math.round((mascota.energia + mascota.felicidad) / 2)}% activa
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                {
                  label: 'Racha diaria activa hoy',
                  done: racha.completadoHoy,
                  hint: racha.completadoHoy ? '¡Mantenida hoy!' : 'Repasa hoy para mantenerla viva',
                },
                {
                  label: 'Juego de repaso o simulador',
                  done: (mascota.energia >= 80 && racha.completadoHoy),
                  hint: 'Suma XP, puntos y activa tu racha',
                },
                {
                  label: 'Entregar tareas y cuestionarios',
                  done: racha.rachaVigente >= 3,
                  hint: 'Acelera su evolución a Etapa 4',
                },
                {
                  label: 'Energía y ánimo de tu mascota',
                  done: mascota.energia >= 60 && mascota.felicidad >= 60,
                  hint: `Energía ${mascota.energia}% · Felicidad ${mascota.felicidad}%`,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-[#d9d9d9]/70"
                >
                  <CheckCircle2
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      item.done ? 'text-emerald-600' : 'text-slate-300'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-[#011f52] leading-tight">{item.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Acciones reales de juego y repaso */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Jugar y mantener activa a {mascota.nombre}
              </p>
              <span className="text-[11px] text-slate-500">
                Estudiar = más energía y racha protegida
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setActiveGameMode('REPASO')}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-[#cf080d] hover:bg-[#ad060a] text-white text-left transition-colors shadow-xs"
              >
                <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <Gamepad2 className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-tight">Jugar y repasar</p>
                  <p className="text-[11px] text-white/85 mt-0.5">
                    5 preguntas con {mascota.nombre} · Activa tu racha
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveGameMode('SIMULADOR')}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-[#011f52] hover:bg-[#022a6e] text-white text-left transition-colors shadow-xs"
              >
                <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-tight">Simulador rápido (60s)</p>
                  <p className="text-[11px] text-white/80 mt-0.5">
                    Contrarreloj con bono extra de XP y puntos
                  </p>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onNavigateMain('mis-cursos')}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#d9d9d9] bg-white hover:border-[#011f52] text-xs font-semibold text-[#011f52]"
              >
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mis cursos</span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleQuickCare('ALIMENTAR')}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#d9d9d9] bg-white hover:border-[#011f52] text-xs font-semibold text-[#011f52] disabled:opacity-60"
              >
                <Apple className="w-3.5 h-3.5 text-[#cf080d]" aria-hidden="true" />
                <span>Snack rápido</span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleQuickCare('CUIDAR')}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#d9d9d9] bg-white hover:border-[#011f52] text-xs font-semibold text-[#011f52] disabled:opacity-60"
              >
                <Heart className="w-3.5 h-3.5 text-[#cf080d]" aria-hidden="true" />
                <span>Descansar</span>
              </button>
            </div>
          </div>

          {/* Indicadores vitales compactos */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#d9d9d9]/70">
            {[
              { label: 'Felicidad', val: mascota.felicidad, color: 'bg-[#cf080d]', icon: Heart },
              { label: 'Energía', val: mascota.energia, color: 'bg-[#011f52]', icon: Zap },
              { label: 'Alimentación', val: mascota.saciedad, color: 'bg-amber-500', icon: Apple },
            ].map((stat) => (
              <div key={stat.label} className="p-2.5 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9]/60">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-[#011f52] flex items-center gap-1">
                    <stat.icon className="w-3 h-3" aria-hidden="true" />
                    {stat.label}
                  </span>
                  <span className="font-mono-data font-bold text-[#011f52]">{stat.val}%</span>
                </div>
                <div className="h-1.5 bg-white rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stat.color} transition-all duration-300`}
                    style={{ width: `${stat.val}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Panel derecho: Accesorios y evolución */}
        <section className="lg:col-span-5 bg-white border border-[#d9d9d9] rounded-2xl p-5 space-y-5">
          <div>
            <h3 className="font-display text-sm font-bold text-[#011f52] mb-2">
              Accesorios de cabeza
            </h3>
            <div className="flex flex-wrap gap-2">
              {HEAD_ACCESSORIES.map((item) => {
                const isUnlocked = item.key === null || unlocked.has(item.key);
                const equipped = (mascota.accesorioCabeza || null) === item.key;
                return (
                  <button
                    key={item.key || 'none-head'}
                    type="button"
                    disabled={!isUnlocked || busyAction !== null}
                    onClick={() =>
                      handleCustomize(
                        { accesorioCabeza: item.key },
                        item.key ? `Equipaste ${item.label}.` : 'Accesorio retirado.',
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      equipped
                        ? 'bg-[#cf080d] text-white border-[#cf080d]'
                        : isUnlocked
                          ? 'bg-white text-[#011f52] border-[#d9d9d9] hover:border-[#011f52]'
                          : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    {equipped ? (
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : !isUnlocked ? (
                      <Lock className="w-3 h-3" aria-hidden="true" />
                    ) : null}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm font-bold text-[#011f52] mb-2">Vestimenta</h3>
            <div className="flex flex-wrap gap-2">
              {NECK_ACCESSORIES.map((item) => {
                const isUnlocked = item.key === null || unlocked.has(item.key);
                const equipped = (mascota.accesorioCuello || null) === item.key;
                return (
                  <button
                    key={item.key || 'none-neck'}
                    type="button"
                    disabled={!isUnlocked || busyAction !== null}
                    onClick={() =>
                      handleCustomize(
                        { accesorioCuello: item.key },
                        item.key ? `Equipaste ${item.label}.` : 'Vestimenta retirada.',
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      equipped
                        ? 'bg-[#cf080d] text-white border-[#cf080d]'
                        : isUnlocked
                          ? 'bg-white text-[#011f52] border-[#d9d9d9] hover:border-[#011f52]'
                          : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    {equipped ? (
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : !isUnlocked ? (
                      <Lock className="w-3 h-3" aria-hidden="true" />
                    ) : null}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm font-bold text-[#011f52] mb-2">Hábitat visual</h3>
            <div className="flex flex-wrap gap-2">
              {HABITAT_OPTIONS.map((item) => {
                const isUnlocked = unlocked.has(item.key);
                const equipped = mascota.fondoHabitat === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={!isUnlocked || busyAction !== null}
                    onClick={() =>
                      handleCustomize(
                        { fondoHabitat: item.key },
                        `Hábitat cambiado a ${item.label}.`,
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      equipped
                        ? 'bg-[#011f52] text-white border-[#011f52]'
                        : isUnlocked
                          ? 'bg-white text-[#011f52] border-[#d9d9d9] hover:border-[#011f52]'
                          : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    {equipped ? (
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : !isUnlocked ? (
                      <Lock className="w-3 h-3" aria-hidden="true" />
                    ) : null}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[#d9d9d9]">
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
              Evolución visual (4 etapas)
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {[
                { etapa: 1, label: 'Cachorro', xp: '0 XP' },
                { etapa: 2, label: 'Aprendiz', xp: '200 XP' },
                { etapa: 3, label: 'Explorador', xp: '600 XP' },
                { etapa: 4, label: 'Maestro', xp: '1300 XP' },
              ].map((st) => {
                const reached = mascota.stageInfo.etapa >= st.etapa;
                return (
                  <div
                    key={st.etapa}
                    className={`p-2 rounded-lg text-center border ${
                      reached
                        ? 'bg-[#011f52]/8 border-[#011f52]/30 text-[#011f52]'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    <p className="text-[11px] font-bold">Etapa {st.etapa}</p>
                    <p className="text-[10px] truncate">{st.label}</p>
                    <p className="text-[10px] font-mono-data mt-0.5">{st.xp}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* BIBLIOTECA DE MASCOTAS DEL MUNDO */}
      <section
        aria-label="Biblioteca de mascotas del mundo"
        className="bg-white border border-[#d9d9d9] rounded-2xl p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[#011f52] flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#cf080d]" aria-hidden="true" />
              <span>Biblioteca de mascotas del mundo</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Elige tu especie favorita de distintos continentes. Tu progreso, nivel, accesorios y nombre personalizado se conservan.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar mascotas por región">
            {WORLD_PET_REGIONS.map((reg) => {
              const active = regionFilter === reg;
              return (
                <button
                  key={reg}
                  type="button"
                  onClick={() => setRegionFilter(reg)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-[#011f52] text-white border-[#011f52]'
                      : 'bg-white text-[#011f52] border-[#d9d9d9] hover:border-[#011f52]'
                  }`}
                >
                  {reg}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {filteredWorldPets.map((petItem) => {
            const isSelected = currentSpecies === petItem.id;
            return (
              <article
                key={petItem.id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition-colors ${
                  isSelected
                    ? 'border-[#011f52] bg-[#011f52]/[0.04]'
                    : 'border-[#d9d9d9] bg-white hover:border-[#011f52]/60'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <VirtualPetAvatar
                      especie={petItem.id as PetSpecies}
                      etapa={mascota.stageInfo.etapa}
                      mood="FELIZ"
                      size="xs"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-[#cf080d] truncate">
                        {petItem.origen}
                      </p>
                      <h3 className="font-display text-sm font-bold text-[#011f52] truncate">
                        {petItem.nombreEspecie}
                      </h3>
                      <p className="text-[11px] text-slate-500 truncate">{petItem.rasgo}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {petItem.descripcion}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isSelected || busyAction !== null}
                  onClick={() =>
                    handleCustomize(
                      { especie: petItem.id },
                      `¡Adoptaste a ${petItem.nombreEspecie} (${petItem.origen})!`,
                    )
                  }
                  className={`w-full py-2 rounded-lg text-xs font-bold transition-colors ${
                    isSelected
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                      : 'bg-[#011f52] hover:bg-[#022a6e] text-white'
                  }`}
                >
                  {isSelected ? 'Compañero actual' : `Elegir ${petItem.nombreEspecie}`}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <PetReviewGameModal
        open={activeGameMode !== null}
        modo={activeGameMode || 'REPASO'}
        mascota={mascota}
        onClose={() => setActiveGameMode(null)}
        onCompleted={onRefresh}
      />
    </main>
  );
}
