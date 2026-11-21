import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Calendar as CalendarIcon,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Flame,
  Inbox,
  Megaphone,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { apiFetch, formatGuayaquilDate, formatGuayaquilDateTime } from '../../lib/api';
import type { CourseSectionId, MainNavId } from '../../lib/navigation';
import { getNivelInfo } from '../../lib/niveles';
import type {
  AdminGamificationSummary,
  AulaUsuario,
  CursoItem,
  NavegacionResumenResponse,
  NotificacionAulaItem,
  StudentGamificationState,
  TenantInfo,
} from '../../types/aula';
import { AdminPanelView } from '../admin/AdminPanelView';
import { OutboxView } from '../calificaciones/OutboxView';
import { SubmissionsTab } from '../evaluaciones/SubmissionsTab';
import { AdminGamificationView } from '../gamificacion/AdminGamificationView';
import { PetHubView } from '../gamificacion/PetHubView';
import { ProfessionalFocusView } from '../gamificacion/ProfessionalFocusView';
import { RewardsStoreView } from '../gamificacion/RewardsStoreView';
import { StudentGamificationView } from '../gamificacion/StudentGamificationView';
import { VirtualPetAvatar } from '../gamificacion/VirtualPetAvatar';

interface GlobalModuleViewsProps {
  activeNav: MainNavId;
  usuario: AulaUsuario;
  tenant: TenantInfo | null;
  cursos: CursoItem[];
  resumen: NavegacionResumenResponse | null;
  resumenCargando: boolean;
  studentGamification: StudentGamificationState | null;
  adminGamification: AdminGamificationSummary | null;
  onRefreshAll: () => Promise<void>;
  onSelectCurso: (cursoId: string, section?: CourseSectionId, lessonId?: string | null) => void;
  onNavigateMain: (nav: MainNavId) => void;
  onSelectStudent: (estudianteId: string) => void;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function formatGreetingName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const hasTitle =
    parts.length > 1 && /^(lcda?\.|lic\.|prof\.|dr\.|dra\.|ing\.|mg\.)$/i.test(parts[0]);
  return hasTitle ? `${parts[0]} ${parts[1]}` : parts[0];
}

export function GlobalModuleViews({
  activeNav,
  usuario,
  tenant,
  cursos,
  resumen,
  resumenCargando,
  studentGamification,
  adminGamification,
  onRefreshAll,
  onSelectCurso,
  onNavigateMain,
  onSelectStudent,
}: GlobalModuleViewsProps) {
  const isDocente = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedScopeCursoId, setSelectedScopeCursoId] = useState<string>('');
  const [monthOffset, setMonthOffset] = useState(0);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [dashNotice, setDashNotice] = useState<string | null>(null);
  const [savingProfileMode, setSavingProfileMode] = useState(false);

  const handleSetExperienceMode = async (mode: 'JUVENIL' | 'PROFESIONAL') => {
    setSavingProfileMode(true);
    try {
      await apiFetch('/api/gamificacion/mi-perfil', {
        method: 'PATCH',
        body: JSON.stringify({ perfilExperiencia: mode }),
      });
      await onRefreshAll();
    } catch {
      // ignore
    } finally {
      setSavingProfileMode(false);
    }
  };

  // Notificaciones persistentes de BD
  const [notifs, setNotifs] = useState<NotificacionAulaItem[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setNotifsLoading(true);
    try {
      const res = await apiFetch<{ notificaciones: NotificacionAulaItem[]; noLeidas: number }>(
        '/api/notificaciones',
      );
      setNotifs(res.notificaciones);
    } catch {
      // Keep graceful empty state
    } finally {
      setNotifsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeNav === 'notificaciones') {
      loadNotifications();
    }
  }, [activeNav, loadNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notificaciones/leer-todas', { method: 'PATCH' });
      setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
      await onRefreshAll();
    } catch {
      // ignore
    }
  };

  const handleQuickClaimChallenge = async (retoId: string, titulo: string, pts: number) => {
    setClaimingId(retoId);
    setDashNotice(null);
    try {
      await apiFetch(`/api/gamificacion/retos/${retoId}/reclamar`, { method: 'POST' });
      setDashNotice(`¡Recompensa reclamada! +${pts} ALLEN POINTS por "${titulo}".`);
      await onRefreshAll();
    } catch {
      // ignore
    } finally {
      setClaimingId(null);
    }
  };

  const effectiveCursoId =
    selectedScopeCursoId && cursos.some((c) => c.id === selectedScopeCursoId)
      ? selectedScopeCursoId
      : cursos[0]?.id || '';

  const calendarData = useMemo(() => {
    const today = new Date();
    const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const rawLabel = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric' }).format(
      viewDate,
    );
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    const firstWeekday = (viewDate.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const eventsByDay = new Map<number, number>();
    for (const ev of resumen?.proximosEventos || []) {
      const d = new Date(ev.fecha);
      if (d.getFullYear() === year && d.getMonth() === month) {
        eventsByDay.set(d.getDate(), (eventsByDay.get(d.getDate()) || 0) + 1);
      }
    }

    const cells: Array<{ day: number | null; isToday: boolean; count: number }> = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ day: null, isToday: false, count: 0 });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday =
        year === today.getFullYear() && month === today.getMonth() && d === today.getDate();
      cells.push({ day: d, isToday, count: eventsByDay.get(d) || 0 });
    }
    return { label, cells };
  }, [monthOffset, resumen?.proximosEventos]);

  // ============================================================================
  // 1. INICIO (DASHBOARD CONSOLIDADO ESTUDIANTE + DOCENTE)
  // ============================================================================
  if (activeNav === 'dashboard') {
    const kpis = resumen?.kpis;
    const sg = studentGamification;
    const ag = adminGamification;

    return (
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        <main className="flex-1 min-w-0 px-4 sm:px-7 py-6">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Encabezado limpio y directo */}
            <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-[#d9d9d9]">
              <div>
                <p className="text-xs font-medium text-slate-600 mb-0.5">
                  {tenant?.nombre || 'All American English'} ·{' '}
                  {isDocente ? 'Panel docente' : 'Portal del estudiante'}
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#011f52]">
                  Hola, {formatGreetingName(usuario.nombre)}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onNavigateMain('mis-cursos')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  {isDocente ? (
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <BookOpen className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{isDocente ? 'Gestionar cursos' : 'Ir a Mis cursos'}</span>
                </button>

                {!rightPanelOpen && (
                  <button
                    type="button"
                    onClick={() => setRightPanelOpen(true)}
                    aria-label="Mostrar panel derecho"
                    className="hidden xl:inline-flex p-2 rounded-lg border border-[#d9d9d9] bg-white text-[#011f52] hover:bg-[#f5f6f8]"
                  >
                    <PanelRightOpen className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {dashNotice && (
              <div
                role="status"
                className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900"
              >
                {dashNotice}
              </div>
            )}

            {/* BLOQUE ESTRELLA ESTUDIANTE: MASCOTA (<=18) O ENFOQUE PRO (+18) + RACHA + ALLEN POINTS */}
            {!isDocente && sg && (
              <section
                aria-label={
                  sg.perfil.perfilExperiencia === 'PROFESIONAL'
                    ? 'Enfoque profesional, meta semanal y ALLEN POINTS'
                    : 'Tu compañera, racha y ALLEN POINTS'
                }
                className="bg-gradient-to-br from-[#011f52] via-[#072a6b] to-[#0d3a8a] text-white rounded-2xl p-5 sm:p-6 shadow-sm"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  {sg.perfil.perfilExperiencia === 'PROFESIONAL' ? (
                    <div className="md:col-span-5 flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-white/12 border border-white/20 flex items-center justify-center shrink-0">
                        <Briefcase className="w-8 h-8 text-amber-300" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                          Enfoque Pro · Adultos (+18)
                        </span>
                        <h2 className="font-display text-xl font-bold truncate">
                          Meta: {sg.perfil.sesionesEstaSemana ?? 0}/{sg.perfil.metaSemanalSesiones ?? 3} sesiones
                        </h2>
                        <p className="text-xs text-white/85 leading-snug line-clamp-2">
                          Micro-repasos ejecutivos de 3 min y metas semanales a tu ritmo.
                        </p>
                        <button
                          type="button"
                          onClick={() => onNavigateMain('mascota')}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
                        >
                          <Target className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Iniciar micro-repaso</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="md:col-span-5 flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => onNavigateMain('mascota')}
                        aria-label={`Abrir espacio de ${sg.mascota.nombre}`}
                        className="shrink-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-white/60"
                      >
                        <VirtualPetAvatar
                          especie={sg.mascota.especie}
                          etapa={sg.mascota.etapa}
                          mood={sg.mascota.mood.mood}
                          accesorioCabeza={sg.mascota.accesorioCabeza}
                          accesorioCuello={sg.mascota.accesorioCuello}
                          fondoHabitat={sg.mascota.fondoHabitat}
                          size="sm"
                        />
                      </button>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                            Nv. {sg.mascota.stageInfo.nivel} · {sg.mascota.stageInfo.etapaNombre}
                          </span>
                        </div>
                        <h2 className="font-display text-xl font-bold truncate">
                          {sg.mascota.nombre}
                        </h2>
                        <p className="text-xs text-white/85 leading-snug line-clamp-2">
                          {sg.mascota.vitalidad?.resumen || sg.mascota.mood.mensaje}
                        </p>
                        <button
                          type="button"
                          onClick={() => onNavigateMain('mascota')}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
                        >
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Jugar y repasar</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Métricas de Racha + ALLEN POINTS */}
                  <div className="md:col-span-7 grid grid-cols-3 gap-2.5 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => onNavigateMain('gamificacion')}
                      className="text-left rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 p-3.5 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[11px] text-white/80">
                        <span>Racha</span>
                        <Flame className="w-4 h-4 text-orange-400 animate-flame-pulse" aria-hidden="true" />
                      </div>
                      <p className="font-display text-2xl font-bold mt-1 tabular-nums">
                        {sg.racha.rachaVigente}d
                      </p>
                      <p className="text-[11px] text-white/75 truncate">
                        Récord: {sg.perfil.rachaMaxima}d
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigateMain('tienda')}
                      className="text-left rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 p-3.5 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[11px] text-white/80">
                        <span>ALLEN POINTS</span>
                        <Coins className="w-4 h-4 text-amber-300" aria-hidden="true" />
                      </div>
                      <p className="font-display text-2xl font-bold mt-1 tabular-nums">
                        {sg.perfil.puntosSaldo}
                      </p>
                      <p className="text-[11px] text-amber-200 font-medium truncate">
                        Canjear →
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigateMain('gamificacion')}
                      className="text-left rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 p-3.5 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[11px] text-white/80">
                        <span>Escudos</span>
                        <Shield className="w-4 h-4 text-emerald-300" aria-hidden="true" />
                      </div>
                      <p className="font-display text-2xl font-bold mt-1 tabular-nums">
                        {sg.perfil.comodinesRacha}
                      </p>
                      <p className="text-[11px] text-white/75 truncate">
                        Protegen tu racha
                      </p>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Tarjetas KPI compactas */}
            <section
              aria-label="Indicadores principales"
              className="grid grid-cols-2 lg:grid-cols-4 gap-3.5"
            >
              <button
                type="button"
                onClick={() => onNavigateMain('mis-cursos')}
                className="text-left bg-white border border-[#d9d9d9] rounded-xl p-4 hover:border-[#011f52] transition-colors"
              >
                <p className="text-xs font-medium text-slate-600">Cursos activos</p>
                <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
                  {resumenCargando && !kpis ? '—' : (kpis?.cursosActivos ?? cursos.length)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isDocente ? `${kpis?.estudiantesMatriculados ?? 0} estudiantes` : 'Matriculados'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigateMain('entregas')}
                className="text-left bg-white border border-[#d9d9d9] rounded-xl p-4 hover:border-[#cf080d] transition-colors"
              >
                <p className="text-xs font-medium text-slate-600">
                  {isDocente ? 'Entregas por revisar' : 'Tareas pendientes'}
                </p>
                <p
                  className={`font-display text-2xl font-bold mt-1 tabular-nums ${
                    (kpis?.entregasPendientes ?? 0) > 0 ? 'text-[#cf080d]' : 'text-[#011f52]'
                  }`}
                >
                  {resumenCargando && !kpis ? '—' : (kpis?.entregasPendientes ?? 0)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isDocente ? 'Requieren nota' : 'Por completar'}
                </p>
              </button>

              {isDocente ? (
                <button
                  type="button"
                  onClick={() => onNavigateMain('gamificacion')}
                  className="text-left bg-white border border-[#d9d9d9] rounded-xl p-4 hover:border-[#011f52] transition-colors"
                >
                  <p className="text-xs font-medium text-slate-600">Rachas activas</p>
                  <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
                    {ag ? `${ag.resumen.rachasActivas}/${ag.resumen.totalEstudiantes}` : '—'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {ag ? `${ag.resumen.rachasEnRiesgo} en riesgo` : 'Seguimiento diario'}
                  </p>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigateMain('reportes')}
                  className="text-left bg-white border border-[#d9d9d9] rounded-xl p-4 hover:border-[#011f52] transition-colors"
                >
                  <p className="text-xs font-medium text-slate-600">Progreso académico</p>
                  <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
                    {resumenCargando && !kpis ? '—' : `${kpis?.progresoPromedio ?? 0}%`}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Promedio: {kpis?.promedioAcademico ?? '—'}
                  </p>
                </button>
              )}

              {isDocente ? (
                <button
                  type="button"
                  onClick={() => onNavigateMain('tienda')}
                  className="text-left bg-white border border-[#d9d9d9] rounded-xl p-4 hover:border-[#cf080d] transition-colors"
                >
                  <p className="text-xs font-medium text-slate-600">Canjes por aprobar</p>
                  <p
                    className={`font-display text-2xl font-bold mt-1 tabular-nums ${
                      (ag?.resumen.canjesPendientes ?? 0) > 0 ? 'text-[#cf080d]' : 'text-[#011f52]'
                    }`}
                  >
                    {ag?.resumen.canjesPendientes ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Tienda ALLEN POINTS</p>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigateMain('reportes')}
                  className="text-left bg-white border border-[#d9d9d9] rounded-xl p-4 hover:border-[#011f52] transition-colors"
                >
                  <p className="text-xs font-medium text-slate-600">Asistencia ALLEN</p>
                  <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
                    {resumenCargando && !kpis ? '—' : `${kpis?.porcentajeAsistencia ?? 0}%`}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Sincronizada</p>
                </button>
              )}
            </section>

            {/* RETOS ACTIVOS DEL ESTUDIANTE + INSIGNIAS RECIENTES */}
            {!isDocente && sg && sg.retos.length > 0 && (
              <section
                aria-label="Retos activos"
                className="bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base font-bold text-[#011f52] flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
                    <span>Retos activos</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigateMain('gamificacion')}
                    className="text-xs font-semibold text-[#011f52] hover:text-[#cf080d] inline-flex items-center gap-1"
                  >
                    <span>Ver todos</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {sg.retos.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-[#d9d9d9] p-3.5 flex flex-col justify-between gap-2.5 bg-[#f5f6f8]/45"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#011f52] line-clamp-1">
                            {r.titulo}
                          </span>
                          <span className="text-[11px] font-bold text-emerald-700 tabular-nums shrink-0">
                            +{r.recompensaPuntos}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 bg-[#d9d9d9] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#cf080d] transition-all"
                            style={{ width: `${r.porcentaje ?? 0}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] tabular-nums">
                        <span className="text-slate-600">
                          {r.progresoActual ?? 0}/{r.metaValor}
                        </span>
                        {r.completado && !r.reclamado ? (
                          <button
                            type="button"
                            disabled={claimingId === r.id}
                            onClick={() =>
                              handleQuickClaimChallenge(r.id, r.titulo, r.recompensaPuntos)
                            }
                            className="px-2.5 py-1 rounded-md bg-[#cf080d] hover:bg-[#ad060a] text-white font-bold"
                          >
                            {claimingId === r.id ? '...' : `Reclamar +${r.recompensaPuntos}`}
                          </button>
                        ) : r.reclamado ? (
                          <span className="font-semibold text-emerald-700">Reclamado</span>
                        ) : (
                          <span className="text-slate-500">{r.porcentaje ?? 0}%</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* SALUD DE RACHAS PARA DOCENTE */}
            {isDocente && ag && (
              <section
                aria-label="Salud de rachas del aula"
                className="bg-white border border-[#d9d9d9] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <h2 className="font-display text-base font-bold text-[#011f52] flex items-center gap-2">
                    <Flame className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
                    <span>Salud de rachas del grupo</span>
                  </h2>
                  <p className="text-xs text-slate-600 tabular-nums">
                    <strong className="text-emerald-700">{ag.resumen.rachasActivas} activas</strong> ·{' '}
                    <strong className="text-amber-700">{ag.resumen.rachasEnRiesgo} en riesgo</strong> ·{' '}
                    <strong className="text-red-700">{ag.resumen.rachasPerdidas} perdidas</strong> ·{' '}
                    Promedio {ag.resumen.promedioRacha} días
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigateMain('gamificacion')}
                    className="px-3.5 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
                  >
                    Ver seguimiento grupal
                  </button>
                  {ag.resumen.canjesPendientes > 0 && (
                    <button
                      type="button"
                      onClick={() => onNavigateMain('tienda')}
                      className="px-3.5 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg"
                    >
                      Aprobar canjes ({ag.resumen.canjesPendientes})
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* Cursos disponibles */}
            <section aria-label="Cursos disponibles" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-[#011f52]">
                  {isDocente ? 'Cursos asignados' : 'Continuar aprendiendo'}
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigateMain('mis-cursos')}
                  className="text-xs font-semibold text-[#011f52] hover:text-[#cf080d] inline-flex items-center gap-1"
                >
                  <span>Ver todos</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              {cursos.length === 0 ? (
                <div className="bg-white border border-[#d9d9d9] rounded-xl p-8 text-center text-sm text-slate-600">
                  Sin cursos disponibles todavía.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cursos.slice(0, 4).map((c) => {
                    const nivelInfo = getNivelInfo(c.nivel);
                    const pendingCount = resumen?.entregasPendientesPorCurso?.[c.id] ?? 0;
                    const progress = c.progresoPorcentaje ?? 0;
                    return (
                      <article
                        key={c.id}
                        className="bg-white border border-[#d9d9d9] rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-[#011f52] transition-colors"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-600 mb-1.5">
                            <span className="font-semibold text-[#011f52]">{nivelInfo.etiqueta}</span>
                            <span>{c.estado === 'PUBLICADO' ? 'Publicado' : 'Borrador'}</span>
                          </div>
                          <h3 className="font-display text-base font-bold text-[#011f52]">
                            {c.nombre}
                          </h3>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                            {c.descripcion || 'Curso de inglés bajo el Marco Común Europeo.'}
                          </p>
                        </div>

                        <div className="space-y-3 pt-3 border-t border-[#d9d9d9]/70">
                          {isDocente ? (
                            <div className="flex items-center justify-between text-xs text-slate-600 tabular-nums">
                              <span>{c.estadisticas?.inscritos ?? 0} estudiantes</span>
                              <span
                                className={
                                  pendingCount > 0 ? 'font-semibold text-[#cf080d]' : ''
                                }
                              >
                                {pendingCount} entrega(s) pendiente(s)
                              </span>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-slate-600">Progreso</span>
                                <span className="font-mono-data font-semibold text-[#011f52]">
                                  {progress}%
                                </span>
                              </div>
                              <div className="h-2 bg-[#d9d9d9]/60 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#cf080d] transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectCurso(c.id, 'resumen')}
                              className="text-xs font-semibold text-[#011f52] hover:text-[#cf080d]"
                            >
                              Ver resumen
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectCurso(c.id, 'unidades')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg transition-colors"
                            >
                              <span>Entrar al aula</span>
                              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </main>

        {/* Panel derecho colapsable del Dashboard */}
        {rightPanelOpen && (
          <aside
            aria-label="Panel informativo del Dashboard"
            className="hidden xl:flex flex-col w-72 shrink-0 bg-white border-l border-[#d9d9d9] p-4 space-y-5"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold text-[#011f52]">
                Agenda y actividad
              </span>
              <button
                type="button"
                onClick={() => setRightPanelOpen(false)}
                aria-label="Contraer panel derecho"
                className="p-1 rounded hover:bg-[#f5f6f8] text-slate-600"
              >
                <PanelRightClose className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#011f52] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#cf080d]" aria-hidden="true" />
                  <span>Próximos eventos</span>
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigateMain('calendario')}
                  className="text-[11px] font-semibold text-[#011f52] hover:text-[#cf080d]"
                >
                  Calendario
                </button>
              </div>
              {!resumen || resumen.proximosEventos.length === 0 ? (
                <p className="text-xs text-slate-500">Sin eventos próximos.</p>
              ) : (
                <ul className="space-y-2.5">
                  {resumen.proximosEventos.slice(0, 5).map((ev) => (
                    <li
                      key={ev.id}
                      className="pb-2.5 border-b border-[#d9d9d9]/60 last:border-0 last:pb-0"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onSelectCurso(ev.cursoId, 'unidades', ev.leccionId || null)
                        }
                        className="text-left w-full group"
                      >
                        <p className="text-xs font-semibold text-[#011f52] group-hover:text-[#cf080d] leading-snug">
                          {ev.titulo}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                          {ev.cursoNombre} · {formatGuayaquilDate(ev.fecha)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="pt-4 border-t border-[#d9d9d9] space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#011f52] flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-[#011f52]" aria-hidden="true" />
                  <span>Anuncios recientes</span>
                </h3>
              </div>
              {!resumen || resumen.anunciosRecientes.length === 0 ? (
                <p className="text-xs text-slate-500">Sin anuncios recientes.</p>
              ) : (
                <ul className="space-y-2.5">
                  {resumen.anunciosRecientes.slice(0, 3).map((a) => (
                    <li
                      key={a.id}
                      className="pb-2.5 border-b border-[#d9d9d9]/60 last:border-0 last:pb-0"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectCurso(a.cursoId, 'anuncios')}
                        className="text-left w-full group"
                      >
                        <p className="text-xs font-semibold text-[#011f52] group-hover:text-[#cf080d] leading-snug">
                          {a.titulo}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                          {a.mensaje}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        )}
      </div>
    );
  }

  // ============================================================================
  // 2. CALENDARIO ACADÉMICO REAL
  // ============================================================================
  if (activeNav === 'calendario') {
    const events = resumen?.proximosEventos || [];
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-7 py-6 space-y-6">
        <div className="pb-4 border-b border-[#d9d9d9]">
          <h1 className="font-display text-2xl font-bold text-[#011f52]">Calendario académico</h1>
          <p className="text-sm text-slate-600 mt-1">
            Fechas límite de tareas, Writing MCER y exámenes cronometrados.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 bg-white border border-[#d9d9d9] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-bold text-[#011f52] flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
                <span>{calendarData.label}</span>
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMonthOffset((m) => m - 1)}
                  aria-label="Mes anterior"
                  className="p-1.5 rounded-lg border border-[#d9d9d9] hover:bg-[#f5f6f8] text-[#011f52]"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setMonthOffset(0)}
                  className="px-2.5 py-1 text-xs font-semibold text-[#011f52] hover:bg-[#f5f6f8] rounded-lg"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => setMonthOffset((m) => m + 1)}
                  aria-label="Mes siguiente"
                  className="p-1.5 rounded-lg border border-[#d9d9d9] hover:bg-[#f5f6f8] text-[#011f52]"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-slate-600 mb-2">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-sm tabular-nums">
              {calendarData.cells.map((cell, idx) => (
                <div
                  key={idx}
                  className={`h-12 rounded-lg flex flex-col items-center justify-center border ${
                    cell.day === null
                      ? 'border-transparent'
                      : cell.isToday
                        ? 'bg-[#011f52] text-white border-[#011f52] font-bold'
                        : cell.count > 0
                          ? 'bg-[#cf080d]/8 text-[#cf080d] border-[#cf080d]/35 font-bold'
                          : 'bg-white text-[#011f52] border-[#d9d9d9]/60'
                  }`}
                >
                  <span>{cell.day ?? ''}</span>
                  {cell.count > 0 && (
                    <span className="text-[10px] leading-none mt-0.5">{cell.count} ev.</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="lg:col-span-5 bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-bold text-[#011f52]">
              Próximos eventos ({events.length})
            </h2>
            {events.length === 0 ? (
              <p className="text-sm text-slate-600">No hay fechas programadas en tus cursos.</p>
            ) : (
              <ul className="divide-y divide-[#d9d9d9]/60">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#cf080d]">
                        {ev.tipo} · {formatGuayaquilDate(ev.fecha)}
                      </p>
                      <p className="text-sm font-semibold text-[#011f52] mt-0.5">{ev.titulo}</p>
                      <p className="text-xs text-slate-600">{ev.cursoNombre}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectCurso(ev.cursoId, 'unidades', ev.leccionId || null)}
                      className="px-3 py-1.5 text-xs font-semibold text-[#011f52] border border-[#d9d9d9] rounded-lg hover:border-[#011f52] whitespace-nowrap shrink-0"
                    >
                      Abrir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    );
  }

  // ============================================================================
  // 3. ENTREGAS POR REVISAR (DOCENTE) / MIS TAREAS (ESTUDIANTE)
  // ============================================================================
  if (activeNav === 'entregas') {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-7 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-[#d9d9d9]">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#011f52]">
              {isDocente ? 'Entregas por revisar' : 'Mis tareas'}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {isDocente
                ? 'Califica entregas de tareas y escritos MCER por curso.'
                : 'Consulta tus tareas pendientes, enviadas y calificaciones recibidas.'}
            </p>
          </div>

          {cursos.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="scope-curso-select" className="text-xs font-semibold text-[#011f52]">
                Curso:
              </label>
              <select
                id="scope-curso-select"
                value={effectiveCursoId}
                onChange={(e) => setSelectedScopeCursoId(e.target.value)}
                className="px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-sm text-[#011f52] font-medium"
              >
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {cursos.length === 0 ? (
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-10 text-center text-sm text-slate-600">
            No hay cursos disponibles.
          </div>
        ) : isDocente ? (
          <SubmissionsTab cursoId={effectiveCursoId} usuario={usuario} />
        ) : (
          <div className="bg-white border border-[#d9d9d9] rounded-xl divide-y divide-[#d9d9d9]/70">
            {(resumen?.tareasResumen || [])
              .filter((t) => !effectiveCursoId || t.cursoId === effectiveCursoId)
              .map((t) => (
                <div
                  key={t.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#011f52]">{t.titulo}</p>
                    <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                      Estado: {t.miEstado}
                      {t.miNota !== null ? ` · Nota: ${t.miNota}/${t.notaMaxima}` : ''}
                      {t.venceEn ? ` · Vence ${formatGuayaquilDate(t.venceEn)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectCurso(t.cursoId, 'unidades', t.leccionId || null)}
                    className="px-3.5 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
                  >
                    Abrir actividad
                  </button>
                </div>
              ))}
          </div>
        )}
      </main>
    );
  }

  // ============================================================================
  // 4. GAMIFICACIÓN (RACHAS Y RETOS ESTUDIANTE / PANEL CONTROL ADMIN-DOCENTE)
  // ============================================================================
  if (activeNav === 'gamificacion') {
    if (isDocente) {
      return (
        <AdminGamificationView
          onSelectStudent={onSelectStudent}
          onNavigateStore={() => onNavigateMain('tienda')}
          onDataChanged={onRefreshAll}
        />
      );
    }

    if (!studentGamification) {
      return (
        <main className="max-w-5xl mx-auto px-4 sm:px-7 py-8">
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-10 text-center text-sm text-slate-600 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#011f52]" aria-hidden="true" />
            <span>Cargando tus rachas y retos...</span>
          </div>
        </main>
      );
    }

    return (
      <StudentGamificationView
        data={studentGamification}
        onRefresh={onRefreshAll}
        onNavigateMain={onNavigateMain}
      />
    );
  }

  // ============================================================================
  // 5. MI MASCOTA (<=18) / ENFOQUE PRO (+18)
  // ============================================================================
  if (activeNav === 'mascota' && !isDocente) {
    if (!studentGamification) {
      return (
        <main className="max-w-5xl mx-auto px-4 sm:px-7 py-8">
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-10 text-center text-sm text-slate-600 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#011f52]" aria-hidden="true" />
            <span>Cargando tu espacio de práctica...</span>
          </div>
        </main>
      );
    }
    if (studentGamification.perfil.perfilExperiencia === 'PROFESIONAL') {
      return (
        <ProfessionalFocusView
          data={studentGamification}
          onRefresh={onRefreshAll}
          onNavigateMain={onNavigateMain}
        />
      );
    }
    return (
      <PetHubView
        data={studentGamification}
        onRefresh={onRefreshAll}
        onNavigateMain={onNavigateMain}
      />
    );
  }

  // ============================================================================
  // 6. TIENDA DE CANJES (ESTUDIANTE + ADMIN/DOCENTE)
  // ============================================================================
  if (activeNav === 'tienda') {
    return (
      <RewardsStoreView
        usuario={usuario}
        initialSaldo={studentGamification?.perfil.puntosSaldo}
        initialComodines={studentGamification?.perfil.comodinesRacha}
        onBalanceChanged={onRefreshAll}
      />
    );
  }

  // ============================================================================
  // 7. ANALÍTICA / MI PROGRESO (ACADÉMICO + GAMIFICACIÓN)
  // ============================================================================
  if (activeNav === 'reportes') {
    const kpis = resumen?.kpis;
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-7 py-6 space-y-6">
        <div className="pb-4 border-b border-[#d9d9d9]">
          <h1 className="font-display text-2xl font-bold text-[#011f52] flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-[#cf080d]" aria-hidden="true" />
            <span>{isDocente ? 'Analítica del aula' : 'Mi progreso integral'}</span>
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {isDocente
              ? 'Rendimiento académico, asistencia y participación en gamificación.'
              : 'Resumen de tu avance académico, asistencia y economía de ALLEN POINTS.'}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
            <p className="text-xs text-slate-600">Promedio académico</p>
            <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
              {kpis?.promedioAcademico ?? '—'}
            </p>
          </div>
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
            <p className="text-xs text-slate-600">Asistencia</p>
            <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
              {kpis?.porcentajeAsistencia ?? 0}%
            </p>
          </div>
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
            <p className="text-xs text-slate-600">
              {isDocente ? 'Puntos emitidos' : 'ALLEN POINTS totales'}
            </p>
            <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
              {isDocente
                ? (adminGamification?.resumen.totalPuntosEmitidos ?? 0).toLocaleString('es-EC')
                : (studentGamification?.perfil.puntosTotales ?? 0).toLocaleString('es-EC')}
            </p>
          </div>
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
            <p className="text-xs text-slate-600">
              {isDocente ? 'Promedio de racha' : 'Racha récord'}
            </p>
            <p className="font-display text-2xl font-bold text-[#cf080d] mt-1 tabular-nums">
              {isDocente
                ? `${adminGamification?.resumen.promedioRacha ?? 0}d`
                : `${studentGamification?.perfil.rachaMaxima ?? 0}d`}
            </p>
          </div>
        </div>

        {/* Ranking rápido o desglose de cursos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-3">
            <h2 className="font-display text-base font-bold text-[#011f52]">
              Avance por curso
            </h2>
            <div className="divide-y divide-[#d9d9d9]/70">
              {cursos.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#011f52] truncate">{c.nombre}</p>
                    <p className="text-xs text-slate-600">
                      {isDocente
                        ? `${c.estadisticas?.inscritos ?? 0} estudiantes · ${c.estadisticas?.tareas ?? 0} tareas`
                        : `Progreso: ${c.progresoPorcentaje ?? 0}%`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectCurso(c.id, 'calificaciones')}
                      className="px-2.5 py-1 text-xs font-semibold text-[#011f52] border border-[#d9d9d9] rounded-lg hover:border-[#011f52]"
                    >
                      Notas
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectCurso(c.id, 'asistencia')}
                      className="px-2.5 py-1 text-xs font-semibold text-[#011f52] border border-[#d9d9d9] rounded-lg hover:border-[#011f52]"
                    >
                      Asistencia
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[#011f52] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" aria-hidden="true" />
                <span>{isDocente ? 'Top participación' : 'Últimos movimientos'}</span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigateMain('gamificacion')}
                className="text-xs font-semibold text-[#011f52] hover:text-[#cf080d]"
              >
                Ver detalle
              </button>
            </div>
            {isDocente ? (
              <ul className="divide-y divide-[#d9d9d9]/70">
                {(adminGamification?.estudiantes || []).slice(0, 5).map((e, i) => (
                  <li key={e.estudianteId} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#011f52]">
                      {i + 1}. {e.nombre}
                    </span>
                    <span className="tabular-nums text-slate-600">
                      <strong className="text-[#011f52]">{e.puntosTotales} pts</strong> · {e.rachaActual}d
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-[#d9d9d9]/70">
                {(studentGamification?.movimientos || []).slice(0, 6).map((m) => (
                  <li key={m.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <span className="text-[#011f52] truncate">{m.descripcion}</span>
                    <span
                      className={`font-bold tabular-nums shrink-0 ${
                        m.cantidad >= 0 ? 'text-emerald-700' : 'text-[#cf080d]'
                      }`}
                    >
                      {m.cantidad >= 0 ? `+${m.cantidad}` : m.cantidad} pts
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    );
  }

  // ============================================================================
  // 8. NOTIFICACIONES PERSISTENTES (BD + ALERTAS REALES)
  // ============================================================================
  if (activeNav === 'notificaciones') {
    const unreadCount = notifs.filter((n) => !n.leida).length;
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-7 py-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-[#d9d9d9]">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#011f52] flex items-center gap-2">
              <Bell className="w-6 h-6 text-[#cf080d]" aria-hidden="true" />
              <span>Notificaciones</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Alertas de rachas, recompensas, canjes y actividad del aula.
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
            >
              <CheckCheck className="w-4 h-4" aria-hidden="true" />
              <span>Marcar todas como leídas ({unreadCount})</span>
            </button>
          )}
        </div>

        {(resumen?.kpis.entregasPendientes ?? 0) > 0 && (
          <div className="bg-white border border-[#cf080d]/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Inbox className="w-5 h-5 text-[#cf080d] shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-[#011f52]">
                  {isDocente
                    ? `Tienes ${resumen?.kpis.entregasPendientes} entrega(s) pendiente(s) de calificación`
                    : `Tienes ${resumen?.kpis.entregasPendientes} tarea(s) pendiente(s)`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateMain('entregas')}
              className="px-3.5 py-1.5 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg"
            >
              Ver entregas
            </button>
          </div>
        )}

        <div className="bg-white border border-[#d9d9d9] rounded-xl divide-y divide-[#d9d9d9]/70 overflow-hidden">
          {notifsLoading && notifs.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-600">
              Cargando notificaciones...
            </div>
          ) : notifs.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-600">
              No tienes notificaciones pendientes.
            </div>
          ) : (
            notifs.map((n) => (
              <div
                key={n.id}
                className={`p-4 flex items-start justify-between gap-4 ${
                  n.leida ? 'bg-white' : 'bg-[#011f52]/[0.03]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                      n.leida ? 'bg-slate-300' : 'bg-[#cf080d]'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#011f52]">{n.titulo}</p>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.mensaje}</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {formatGuayaquilDateTime(n.createdAt)}
                    </p>
                  </div>
                </div>
                {n.accionNav && (
                  <button
                    type="button"
                    onClick={() => onNavigateMain(n.accionNav as MainNavId)}
                    className="px-3 py-1.5 text-xs font-semibold text-[#011f52] border border-[#d9d9d9] rounded-lg hover:border-[#011f52] whitespace-nowrap shrink-0"
                  >
                    Abrir
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    );
  }

  // ============================================================================
  // 8B. PANEL DE ADMINISTRACIÓN TOTAL (SOLO ADMIN)
  // ============================================================================
  if (activeNav === 'admin-usuarios' && usuario.rol === 'ADMIN') {
    return <AdminPanelView onRefreshAll={onRefreshAll} />;
  }

  // ============================================================================
  // 9. CONFIGURACIÓN (Cuenta + Sincronización Outbox ALLEN para Docentes)
  // ============================================================================
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-7 py-6 space-y-6">
      <div className="pb-4 border-b border-[#d9d9d9]">
        <h1 className="font-display text-2xl font-bold text-[#011f52] flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-[#011f52]" aria-hidden="true" />
          <span>Configuración</span>
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Preferencias de cuenta y estado de sincronización con ALLEN.
        </p>
      </div>

      <section className="bg-white border border-[#d9d9d9] rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-slate-500">Usuario</p>
          <p className="font-semibold text-[#011f52] mt-0.5">{usuario.nombre}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Rol activo</p>
          <p className="font-semibold text-[#011f52] mt-0.5">
            {usuario.rol === 'ADMIN'
              ? 'Administrador Total'
              : usuario.rol === 'PROFESOR'
                ? 'Docente'
                : 'Estudiante'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Sede</p>
          <p className="font-semibold text-[#011f52] mt-0.5">
            {tenant?.nombre || 'All American English'}
          </p>
        </div>
      </section>

      {!isDocente && studentGamification && (
        <section className="bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-display text-base font-bold text-[#011f52]">
              Modalidad de aprendizaje según edad y perfil
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Elige entre la experiencia con mascota virtual (recomendada hasta 18 años) o el Enfoque Pro para adultos y profesionales (+18 años).
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={savingProfileMode}
              onClick={() => handleSetExperienceMode('JUVENIL')}
              aria-pressed={(studentGamification.perfil.perfilExperiencia || 'JUVENIL') === 'JUVENIL'}
              className={`p-4 rounded-xl border text-left transition-colors ${
                (studentGamification.perfil.perfilExperiencia || 'JUVENIL') === 'JUVENIL'
                  ? 'border-[#011f52] bg-[#011f52]/[0.05]'
                  : 'border-[#d9d9d9] bg-white hover:border-[#011f52]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-bold text-[#011f52] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
                  <span>Juvenil (hasta 18 años)</span>
                </span>
                {(studentGamification.perfil.perfilExperiencia || 'JUVENIL') === 'JUVENIL' && (
                  <span className="text-[11px] font-bold text-emerald-700">Activo</span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1.5">
                Biblioteca de mascotas del mundo, juegos de repaso interactivos y vitalidad ligada a tu racha diaria.
              </p>
            </button>

            <button
              type="button"
              disabled={savingProfileMode}
              onClick={() => handleSetExperienceMode('PROFESIONAL')}
              aria-pressed={studentGamification.perfil.perfilExperiencia === 'PROFESIONAL'}
              className={`p-4 rounded-xl border text-left transition-colors ${
                studentGamification.perfil.perfilExperiencia === 'PROFESIONAL'
                  ? 'border-[#011f52] bg-[#011f52]/[0.05]'
                  : 'border-[#d9d9d9] bg-white hover:border-[#011f52]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-bold text-[#011f52] flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-[#011f52]" aria-hidden="true" />
                  <span>Adulto / Profesional (+18 años)</span>
                </span>
                {studentGamification.perfil.perfilExperiencia === 'PROFESIONAL' && (
                  <span className="text-[11px] font-bold text-emerald-700">Activo</span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1.5">
                Interfaz sobria sin mascota, metas semanales flexibles y micro-repasos ejecutivos de 3 minutos.
              </p>
            </button>
          </div>
        </section>
      )}

      {isDocente && (
        <section className="space-y-2">
          <h2 className="font-display text-base font-bold text-[#011f52]">
            Sincronización Outbox con ALLEN
          </h2>
          <OutboxView />
        </section>
      )}
    </main>
  );
}
