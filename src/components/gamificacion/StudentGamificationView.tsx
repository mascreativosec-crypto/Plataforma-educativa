import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Coins,
  Flame,
  History,
  RotateCcw,
  Shield,
  ShoppingBag,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { apiFetch, formatGuayaquilDateTime } from '../../lib/api';
import type { MainNavId } from '../../lib/navigation';
import type { StudentGamificationState } from '../../types/aula';

interface StudentGamificationViewProps {
  data: StudentGamificationState;
  onRefresh: () => Promise<void>;
  onNavigateMain: (nav: MainNavId) => void;
}

export function StudentGamificationView({
  data,
  onRefresh,
  onNavigateMain,
}: StudentGamificationViewProps) {
  const { perfil, racha, calendarioActividad, historialRacha, retos, ranking, reglas } = data;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'retos' | 'ranking' | 'historial'>('retos');

  // Construir cuadrícula de últimos 28 días
  const last28Days = useMemo(() => {
    const map = new Map(calendarioActividad.map((c) => [c.fecha, c]));
    const today = new Date();
    const list: Array<{
      fecha: string;
      dayNum: number;
      tipo: 'ACTIVA' | 'PROTEGIDA' | 'RECUPERADA' | 'INACTIVA';
      detalle: string;
      puntos: number;
    }> = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const key = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;
      const hit = map.get(key);
      list.push({
        fecha: key,
        dayNum: Number(key.slice(8, 10)),
        tipo: hit ? hit.tipo : 'INACTIVA',
        detalle: hit?.detalle || 'Sin actividad registrada',
        puntos: hit?.puntosGanados || 0,
      });
    }
    return list;
  }, [calendarioActividad]);

  const handleUseShield = async () => {
    setBusyId('SHIELD');
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await apiFetch('/api/gamificacion/racha/usar-comodin', { method: 'POST' });
      setStatusMsg('¡Escudo aplicado! Tu racha quedó protegida.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo aplicar el comodín.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRecoverStreak = async () => {
    setBusyId('RECOVER');
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiFetch<{ rachaActual: number }>('/api/gamificacion/racha/recuperar', {
        method: 'POST',
      });
      setStatusMsg(`¡Racha de ${res.rachaActual} días recuperada! Tu mascota está celebrando.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo recuperar la racha.');
    } finally {
      setBusyId(null);
    }
  };

  const handleClaimChallenge = async (retoId: string) => {
    setBusyId(retoId);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiFetch<{ puntosGanados: number }>(
        `/api/gamificacion/retos/${retoId}/reclamar`,
        { method: 'POST' },
      );
      setStatusMsg(`¡Recompensa reclamada! +${res.puntosGanados} ALLEN POINTS sumados.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo reclamar el reto.');
    } finally {
      setBusyId(null);
    }
  };

  const streakVisual = (() => {
    switch (racha.estadoVisual) {
      case 'ACTIVA':
        return {
          gradient: 'from-[#011f52] via-[#132c66] to-[#cf080d]',
          pill: 'Racha activa hoy',
          pillBg: 'bg-emerald-500/20 text-emerald-100 border-emerald-300/30',
          flameColor: 'text-amber-300 animate-flame-pulse',
        };
      case 'RECUPERADA':
        return {
          gradient: 'from-[#011f52] via-[#1e3a8a] to-[#0284c7]',
          pill: 'Racha recuperada',
          pillBg: 'bg-sky-400/20 text-sky-100 border-sky-300/40',
          flameColor: 'text-sky-300 animate-flame-pulse',
        };
      case 'EN_RIESGO':
        return {
          gradient: 'from-[#7c2d12] via-[#b45309] to-[#cf080d]',
          pill: 'En riesgo hoy',
          pillBg: 'bg-amber-300/25 text-amber-50 border-amber-200/40',
          flameColor: 'text-amber-200 animate-flame-pulse',
        };
      case 'PERDIDA':
        return {
          gradient: 'from-[#1e293b] via-[#334155] to-[#475569]',
          pill: 'Racha pausada',
          pillBg: 'bg-white/15 text-slate-100 border-white/25',
          flameColor: 'text-slate-300',
        };
      default:
        return {
          gradient: 'from-[#011f52] to-[#1e3a8a]',
          pill: 'Lista para iniciar',
          pillBg: 'bg-white/15 text-white border-white/25',
          flameColor: 'text-amber-300',
        };
    }
  })();

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-7 py-6 space-y-6">
      {/* Feedback */}
      {statusMsg && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 font-medium flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Hero de Racha + ALLEN POINTS */}
      <section
        className={`rounded-2xl bg-gradient-to-br ${streakVisual.gradient} text-white p-6 sm:p-7 shadow-sm`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/12 border border-white/20 flex items-center justify-center shrink-0">
              <Flame className={`w-10 h-10 sm:w-12 sm:h-12 ${streakVisual.flameColor}`} aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${streakVisual.pillBg}`}
                >
                  {streakVisual.pill}
                </span>
                <span className="text-xs text-white/80 tabular-nums">
                  Récord personal: <strong>{perfil.rachaMaxima} días</strong>
                </span>
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tabular-nums leading-tight">
                {racha.rachaVigente} {racha.rachaVigente === 1 ? 'día' : 'días'} en racha
              </h1>
              {racha.alertaMensaje && (
                <p className="text-sm text-white/90 mt-1 max-w-xl">{racha.alertaMensaje}</p>
              )}
            </div>
          </div>

          {/* Indicadores rápidos + acciones de protección/recuperación */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2.5 rounded-xl bg-white/12 border border-white/20">
              <p className="text-[11px] text-white/75 font-medium">ALLEN POINTS</p>
              <p className="font-display text-2xl font-bold tabular-nums flex items-center gap-1.5">
                <Coins className="w-5 h-5 text-amber-300" aria-hidden="true" />
                {perfil.puntosSaldo}
              </p>
            </div>

            <div className="px-4 py-2.5 rounded-xl bg-white/12 border border-white/20">
              <p className="text-[11px] text-white/75 font-medium">Comodines</p>
              <p className="font-display text-2xl font-bold tabular-nums flex items-center gap-1.5">
                <Shield className="w-5 h-5 text-sky-300" aria-hidden="true" />
                {perfil.comodinesRacha}
              </p>
            </div>

            {racha.puedeUsarComodin && (
              <button
                type="button"
                disabled={busyId !== null}
                onClick={handleUseShield}
                className="px-4 py-2.5 rounded-xl bg-white text-[#011f52] hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
              >
                <Shield className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
                <span>Proteger con comodín</span>
              </button>
            )}

            {racha.puedeRecuperar && (
              <button
                type="button"
                disabled={busyId !== null || perfil.puntosSaldo < racha.costoRecuperacion}
                onClick={handleRecoverStreak}
                className="px-4 py-2.5 rounded-xl bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>
                  Recuperar {racha.rachaRecuperable}d ({racha.costoRecuperacion} pts)
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigateMain('tienda')}
              className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              <span>Canjear puntos</span>
            </button>
          </div>
        </div>

        {/* Progreso al siguiente hito */}
        <div className="mt-6 pt-5 border-t border-white/15">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
            <span className="font-semibold text-white/90">
              {racha.proximoHito
                ? `Próximo hito: ${racha.proximoHito.titulo} (+${racha.proximoHito.puntos} pts)`
                : '¡Todos los hitos de racha completados!'}
            </span>
            <span className="font-mono-data text-white/85">{racha.progresoHitoPct}%</span>
          </div>
          <div className="h-2.5 bg-white/20 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-amber-300 rounded-full transition-all duration-500"
              style={{ width: `${racha.progresoHitoPct}%` }}
            />
          </div>

          {/* 7 Hitos de motivación (3, 7, 14, 30, 60, 100, 365) */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {racha.milestones.map((m) => {
              const reached = racha.rachaVigente >= m.dias;
              return (
                <div
                  key={m.dias}
                  className={`rounded-lg px-1.5 py-2 text-center border ${
                    reached
                      ? 'bg-amber-300 text-[#011f52] border-amber-200 font-bold'
                      : 'bg-white/10 text-white/80 border-white/15'
                  }`}
                >
                  <p className="text-xs sm:text-sm font-extrabold tabular-nums">{m.dias}d</p>
                  <p className="text-[10px] opacity-85 tabular-nums">+{m.puntos}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Calendario de actividad (28 días) + Cómo ganar ALLEN POINTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-8 bg-white border border-[#d9d9d9] rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-base font-bold text-[#011f52] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
              <span>Calendario de actividad (28 días)</span>
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#cf080d]" /> Activo
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#011f52]" /> Protegido
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Recuperado
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {last28Days.map((cell) => {
              const style =
                cell.tipo === 'ACTIVA'
                  ? 'bg-[#cf080d] text-white border-[#cf080d]'
                  : cell.tipo === 'PROTEGIDA'
                    ? 'bg-[#011f52] text-white border-[#011f52]'
                    : cell.tipo === 'RECUPERADA'
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-[#f5f6f8] text-slate-500 border-[#d9d9d9]/70';
              return (
                <div
                  key={cell.fecha}
                  title={`${cell.fecha}: ${cell.detalle}${cell.puntos ? ` (+${cell.puntos} pts)` : ''}`}
                  className={`h-10 rounded-lg border flex flex-col items-center justify-center text-xs font-bold tabular-nums ${style}`}
                >
                  <span>{cell.dayNum}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-4 bg-white border border-[#d9d9d9] rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-[#011f52] mb-3">
              Cómo ganar ALLEN POINTS
            </h2>
            <ul className="space-y-2 text-xs">
              <li className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-700">Completar una lección</span>
                <span className="font-mono-data font-bold text-[#011f52]">+{reglas.ptsLeccion} pts</span>
              </li>
              <li className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-700">Entregar tarea a tiempo</span>
                <span className="font-mono-data font-bold text-[#011f52]">+{reglas.ptsTareaATiempo} pts</span>
              </li>
              <li className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-700">Aprobar examen MCER</span>
                <span className="font-mono-data font-bold text-[#011f52]">+{reglas.ptsExamenAprobado} pts</span>
              </li>
              <li className="flex items-center justify-between py-1.5">
                <span className="text-slate-700">Bonus habilidad Cambridge</span>
                <span className="font-mono-data font-bold text-[#cf080d]">+{reglas.ptsHabilidadMcer} pts</span>
              </li>
            </ul>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-100">
            Límite diario justo: {reglas.limitePuntosDiarios} pts/día.
          </p>
        </section>
      </div>

      {/* Pestañas: Retos · Ranking · Historial de rachas */}
      <div className="bg-white border border-[#d9d9d9] rounded-2xl overflow-hidden">
        <div className="flex flex-wrap border-b border-[#d9d9d9] bg-[#f5f6f8] px-3 pt-2 gap-1">
          {[
            { id: 'retos', label: `Retos activos (${retos.length})`, icon: Target },
            { id: 'ranking', label: 'Ranking del aula', icon: Trophy },
            { id: 'historial', label: 'Historial de rachas', icon: History },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition-colors ${
                  active
                    ? 'bg-white text-[#011f52] border-[#cf080d]'
                    : 'text-slate-600 border-transparent hover:text-[#011f52]'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {activeTab === 'retos' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {retos.map((r) => (
                <div
                  key={r.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                    r.completado && !r.reclamado
                      ? 'border-[#cf080d] bg-[#cf080d]/5'
                      : 'border-[#d9d9d9] bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-sm font-bold text-[#011f52]">{r.titulo}</h3>
                      <span className="px-2 py-0.5 rounded-md bg-[#011f52]/8 text-[#011f52] text-xs font-bold tabular-nums shrink-0">
                        +{r.recompensaPuntos} pts
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{r.descripcion}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="font-medium text-slate-600">
                        Progreso: {r.progresoActual}/{r.metaValor}
                      </span>
                      <span className="font-bold text-[#011f52]">{r.porcentaje}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          r.completado ? 'bg-emerald-600' : 'bg-[#011f52]'
                        }`}
                        style={{ width: `${r.porcentaje || 0}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-end pt-1">
                      {r.reclamado ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Reclamado
                        </span>
                      ) : r.completado ? (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => handleClaimChallenge(r.id)}
                          className="px-3.5 py-1.5 rounded-lg bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-bold transition-colors disabled:opacity-60"
                        >
                          {busyId === r.id ? 'Reclamando...' : `Reclamar +${r.recompensaPuntos} pts`}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onNavigateMain('mis-cursos')}
                          className="text-xs font-semibold text-[#011f52] hover:text-[#cf080d]"
                        >
                          Ir a practicar →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'ranking' && (
            <div className="divide-y divide-slate-100">
              {ranking.map((row) => (
                <div
                  key={row.estudianteId}
                  className={`flex items-center justify-between gap-3 py-3 px-3 rounded-lg ${
                    row.esYo ? 'bg-[#011f52]/6 font-bold' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${
                        row.posicion === 1
                          ? 'bg-amber-400 text-[#011f52]'
                          : row.posicion === 2
                            ? 'bg-slate-300 text-[#011f52]'
                            : row.posicion === 3
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.posicion}
                    </span>
                    <span className="text-sm text-[#011f52] truncate">
                      {row.nombre} {row.esYo ? '(Tú)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs tabular-nums shrink-0">
                    <span className="inline-flex items-center gap-1 text-[#cf080d] font-bold">
                      <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                      {row.rachaActual}d
                    </span>
                    <span className="font-mono-data font-bold text-[#011f52]">
                      {row.puntosTotales} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="space-y-2.5">
              {historialRacha.length === 0 ? (
                <p className="text-sm text-slate-500">Aún no hay eventos en tu historial de rachas.</p>
              ) : (
                historialRacha.map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[#d9d9d9]/70 bg-[#f5f6f8]/60 text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#011f52] mr-2">{h.tipoEvento}</span>
                      <span className="text-slate-700">{h.nota}</span>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span className="font-semibold text-[#011f52]">
                        {h.rachaAntes}d → {h.rachaDespues}d
                      </span>
                      {h.costoPuntos > 0 && (
                        <span className="font-bold text-[#cf080d]">-{h.costoPuntos} pts</span>
                      )}
                      {h.recompensaPuntos > 0 && (
                        <span className="font-bold text-emerald-700">+{h.recompensaPuntos} pts</span>
                      )}
                      <span className="text-slate-500">{formatGuayaquilDateTime(h.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
