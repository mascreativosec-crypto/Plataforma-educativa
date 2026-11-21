import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Coins,
  Flame,
  Plus,
  RefreshCw,
  Save,
  Shield,
  ShoppingBag,
  Sliders,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { apiFetch, formatGuayaquilDateTime } from '../../lib/api';
import type { AdminGamificationSummary, StreakVisualState } from '../../types/aula';

interface AdminGamificationViewProps {
  onSelectStudent: (estudianteId: string) => void;
  onNavigateStore: () => void;
  onDataChanged?: () => Promise<void>;
}

function StreakStatusBadge({ estado }: { estado: StreakVisualState }) {
  switch (estado) {
    case 'ACTIVA':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900">
          Activa
        </span>
      );
    case 'RECUPERADA':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-[#011f52]">
          Recuperada
        </span>
      );
    case 'EN_RIESGO':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">
          En riesgo
        </span>
      );
    case 'PERDIDA':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
          Perdida
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
          Sin iniciar
        </span>
      );
  }
}

export function AdminGamificationView({
  onSelectStudent,
  onNavigateStore,
  onDataChanged,
}: AdminGamificationViewProps) {
  const [data, setData] = useState<AdminGamificationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'estudiantes' | 'reglas' | 'retos' | 'auditoria'>(
    'estudiantes',
  );
  const [saving, setSaving] = useState(false);

  // Form config
  const [ptsLeccion, setPtsLeccion] = useState(25);
  const [ptsTareaATiempo, setPtsTareaATiempo] = useState(40);
  const [ptsExamenAprobado, setPtsExamenAprobado] = useState(60);
  const [ptsHabilidadMcer, setPtsHabilidadMcer] = useState(30);
  const [costoRecuperarRacha, setCostoRecuperarRacha] = useState(120);
  const [ventanaRecuperacionHoras, setVentanaRecuperacionHoras] = useState(48);
  const [maxRecuperacionesMes, setMaxRecuperacionesMes] = useState(2);
  const [limitePuntosDiarios, setLimitePuntosDiarios] = useState(500);

  // Nuevo reto
  const [retoTitulo, setRetoTitulo] = useState('');
  const [retoDesc, setRetoDesc] = useState('');
  const [retoTipo, setRetoTipo] = useState('LECCIONES');
  const [retoMeta, setRetoMeta] = useState(3);
  const [retoRecompensa, setRetoRecompensa] = useState(90);

  // Nueva insignia
  const [insNombre, setInsNombre] = useState('');
  const [insDesc, setInsDesc] = useState('');
  const [insCategoria, setInsCategoria] = useState('ACADEMICO');
  const [insBonus, setInsBonus] = useState(40);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<AdminGamificationSummary>('/api/gamificacion/admin/resumen');
      setData(res);
      setPtsLeccion(res.config.ptsLeccion);
      setPtsTareaATiempo(res.config.ptsTareaATiempo);
      setPtsExamenAprobado(res.config.ptsExamenAprobado);
      setPtsHabilidadMcer(res.config.ptsHabilidadMcer);
      setCostoRecuperarRacha(res.config.costoRecuperarRacha);
      setVentanaRecuperacionHoras(res.config.ventanaRecuperacionHoras);
      setMaxRecuperacionesMes(res.config.maxRecuperacionesMes);
      setLimitePuntosDiarios(res.config.limitePuntosDiarios);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el panel de gamificación.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/gamificacion/admin/config', {
        method: 'PATCH',
        body: JSON.stringify({
          ptsLeccion: Number(ptsLeccion),
          ptsTareaATiempo: Number(ptsTareaATiempo),
          ptsExamenAprobado: Number(ptsExamenAprobado),
          ptsHabilidadMcer: Number(ptsHabilidadMcer),
          costoRecuperarRacha: Number(costoRecuperarRacha),
          ventanaRecuperacionHoras: Number(ventanaRecuperacionHoras),
          maxRecuperacionesMes: Number(maxRecuperacionesMes),
          limitePuntosDiarios: Number(limitePuntosDiarios),
        }),
      });
      setNotice('Reglas de ALLEN POINTS, rachas y anti-abuso guardadas en base de datos.');
      await loadSummary();
      await onDataChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/gamificacion/admin/retos', {
        method: 'POST',
        body: JSON.stringify({
          titulo: retoTitulo.trim(),
          descripcion: retoDesc.trim(),
          tipoObjetivo: retoTipo,
          metaValor: Number(retoMeta),
          recompensaPuntos: Number(retoRecompensa),
        }),
      });
      setRetoTitulo('');
      setRetoDesc('');
      setNotice('Nuevo reto académico publicado para todos los estudiantes.');
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el reto.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/gamificacion/admin/insignias', {
        method: 'POST',
        body: JSON.stringify({
          nombre: insNombre.trim(),
          descripcion: insDesc.trim(),
          categoria: insCategoria,
          puntosBonus: Number(insBonus),
        }),
      });
      setInsNombre('');
      setInsDesc('');
      setNotice('Nueva insignia registrada en el catálogo.');
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la insignia.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-7 py-8">
        <div className="bg-white border border-[#d9d9d9] rounded-xl p-10 text-center text-sm text-slate-600 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#011f52]" aria-hidden="true" />
          <span>Cargando control de gamificación...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-7 py-6 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#d9d9d9]">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#011f52] flex items-center gap-2.5">
            <Trophy className="w-6 h-6 text-[#cf080d]" aria-hidden="true" />
            <span>Administración de Gamificación</span>
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Supervisa rachas, ALLEN POINTS, reglas anti-abuso, retos e insignias del aula.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateStore}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
        >
          <ShoppingBag className="w-4 h-4" aria-hidden="true" />
          <span>
            Gestionar tienda
            {(data?.resumen.canjesPendientes ?? 0) > 0
              ? ` (${data?.resumen.canjesPendientes} pendientes)`
              : ''}
          </span>
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900"
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {/* KPIs principales */}
      {data && (
        <section
          aria-label="Métricas de gamificación del aula"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Rachas activas</span>
              <Flame className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
            </div>
            <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
              {data.resumen.rachasActivas} / {data.resumen.totalEstudiantes}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
              Promedio: {data.resumen.promedioRacha} días · {data.resumen.rachasEnRiesgo} en riesgo
            </p>
          </div>

          <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>ALLEN POINTS emitidos</span>
              <Coins className="w-4 h-4 text-amber-500" aria-hidden="true" />
            </div>
            <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
              {data.resumen.totalPuntosEmitidos.toLocaleString('es-EC')}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Tope diario: {data.config.limitePuntosDiarios} pts/est.
            </p>
          </div>

          <button
            type="button"
            onClick={onNavigateStore}
            className="text-left bg-white border border-[#d9d9d9] hover:border-[#cf080d] rounded-xl p-4 transition-colors"
          >
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Canjes por aprobar</span>
              <ShoppingBag className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
            </div>
            <p
              className={`font-display text-2xl font-bold mt-1 tabular-nums ${
                data.resumen.canjesPendientes > 0 ? 'text-[#cf080d]' : 'text-[#011f52]'
              }`}
            >
              {data.resumen.canjesPendientes}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Clic para revisar en Tienda</p>
          </button>

          <div className="bg-white border border-[#d9d9d9] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Control anti-abuso</span>
              <Shield className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            </div>
            <p className="font-display text-2xl font-bold text-[#011f52] mt-1 tabular-nums">
              {data.resumen.alertasIrregulares}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {data.resumen.alertasIrregulares === 0
                ? 'Sin movimientos irregulares'
                : 'Movimientos marcados para revisión'}
            </p>
          </div>
        </section>
      )}

      {/* Pestañas internas */}
      <div
        role="tablist"
        aria-label="Módulos administrativos de gamificación"
        className="flex flex-wrap gap-2 border-b border-[#d9d9d9] pb-3"
      >
        {[
          { id: 'estudiantes', label: 'Seguimiento grupal', icon: <Users className="w-4 h-4" /> },
          { id: 'reglas', label: 'Reglas y economía', icon: <Sliders className="w-4 h-4" /> },
          { id: 'retos', label: 'Retos e insignias', icon: <Target className="w-4 h-4" /> },
          { id: 'auditoria', label: 'Auditoría de puntos', icon: <AlertTriangle className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
              activeTab === tab.id
                ? 'bg-[#011f52] text-white'
                : 'bg-white border border-[#d9d9d9] text-[#011f52] hover:bg-[#f5f6f8]'
            }`}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: TABLA CONSOLIDADA DE ESTUDIANTES (sin entrar perfil por perfil) */}
      {activeTab === 'estudiantes' && data && (
        <section
          aria-label="Tabla consolidada de progreso y gamificación estudiantil"
          className="bg-white border border-[#d9d9d9] rounded-xl overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-[#d9d9d9] flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-[#011f52]">
              Vista rápida de estudiantes ({data.estudiantes.length})
            </h2>
            <span className="text-xs text-slate-500">
              Ordenados por ALLEN POINTS acumulados
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#f5f6f8] border-b border-[#d9d9d9] text-[#011f52]">
                  <th className="py-3 px-4 font-bold">Estudiante</th>
                  <th className="py-3 px-3 font-bold">Racha</th>
                  <th className="py-3 px-3 font-bold">Estado</th>
                  <th className="py-3 px-3 font-bold text-right">Saldo / Total</th>
                  <th className="py-3 px-3 font-bold">Mascota</th>
                  <th className="py-3 px-3 font-bold text-center">Lecciones</th>
                  <th className="py-3 px-3 font-bold text-center">Insignias</th>
                  <th className="py-3 px-4 font-bold text-right">Perfil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d9d9d9]/70">
                {data.estudiantes.map((est, idx) => (
                  <tr key={est.estudianteId} className="hover:bg-[#f5f6f8]/60">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-[#011f52]/10 text-[#011f52] font-bold flex items-center justify-center shrink-0 tabular-nums">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#011f52] truncate">{est.nombre}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {est.cursosInscritos} curso(s) · {est.comodinesRacha} comodín(es)
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 tabular-nums">
                      <span className="font-bold text-[#011f52]">{est.rachaActual}d</span>
                      <span className="text-[11px] text-slate-500 ml-1">
                        (máx. {est.rachaMaxima}d)
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <StreakStatusBadge estado={est.estadoRacha} />
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      <p className="font-bold text-[#011f52]">{est.puntosSaldo} pts</p>
                      <p className="text-[11px] text-slate-500">{est.puntosTotales} acum.</p>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-[#011f52]">{est.mascotaNombre}</p>
                      <p className="text-[11px] text-slate-500">
                        Nv. {est.mascotaNivel} · {est.mascotaEtapa}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-[#011f52] tabular-nums">
                      {est.leccionesCompletadas}
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-[#011f52] tabular-nums">
                      {est.insigniasCount}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectStudent(est.estudianteId)}
                        className="px-2.5 py-1 rounded-lg border border-[#d9d9d9] hover:border-[#011f52] text-[#011f52] font-semibold"
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: REGLAS Y ECONOMÍA DE PUNTOS */}
      {activeTab === 'reglas' && (
        <form
          onSubmit={handleSaveConfig}
          className="bg-white border border-[#d9d9d9] rounded-xl p-6 space-y-5"
        >
          <div>
            <h2 className="font-display text-base font-bold text-[#011f52]">
              Reglas de asignación, rachas y límites anti-abuso
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Estos valores rigen en tiempo real la economía de ALLEN POINTS para toda la sede.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="cfg-pts-lec" className="block text-xs font-semibold text-[#011f52] mb-1">
                Pts por lección completada
              </label>
              <input
                id="cfg-pts-lec"
                type="number"
                min={5}
                max={500}
                value={ptsLeccion}
                onChange={(e) => setPtsLeccion(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="cfg-pts-tar" className="block text-xs font-semibold text-[#011f52] mb-1">
                Pts por tarea a tiempo
              </label>
              <input
                id="cfg-pts-tar"
                type="number"
                min={5}
                max={500}
                value={ptsTareaATiempo}
                onChange={(e) => setPtsTareaATiempo(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="cfg-pts-exa" className="block text-xs font-semibold text-[#011f52] mb-1">
                Pts por examen aprobado
              </label>
              <input
                id="cfg-pts-exa"
                type="number"
                min={5}
                max={1000}
                value={ptsExamenAprobado}
                onChange={(e) => setPtsExamenAprobado(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="cfg-pts-mcer" className="block text-xs font-semibold text-[#011f52] mb-1">
                Bonus habilidad MCER
              </label>
              <input
                id="cfg-pts-mcer"
                type="number"
                min={5}
                max={500}
                value={ptsHabilidadMcer}
                onChange={(e) => setPtsHabilidadMcer(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="cfg-rec-cost" className="block text-xs font-semibold text-[#011f52] mb-1">
                Costo recuperar racha (pts)
              </label>
              <input
                id="cfg-rec-cost"
                type="number"
                min={20}
                max={2000}
                value={costoRecuperarRacha}
                onChange={(e) => setCostoRecuperarRacha(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="cfg-rec-hrs" className="block text-xs font-semibold text-[#011f52] mb-1">
                Ventana recuperación (horas)
              </label>
              <input
                id="cfg-rec-hrs"
                type="number"
                min={12}
                max={168}
                value={ventanaRecuperacionHoras}
                onChange={(e) => setVentanaRecuperacionHoras(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="cfg-rec-mes" className="block text-xs font-semibold text-[#011f52] mb-1">
                Máx. recuperaciones / mes
              </label>
              <input
                id="cfg-rec-mes"
                type="number"
                min={0}
                max={10}
                value={maxRecuperacionesMes}
                onChange={(e) => setMaxRecuperacionesMes(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="cfg-cap" className="block text-xs font-semibold text-[#011f52] mb-1">
                Tope diario anti-abuso (pts)
              </label>
              <input
                id="cfg-cap"
                type="number"
                min={50}
                max={5000}
                value={limitePuntosDiarios}
                onChange={(e) => setLimitePuntosDiarios(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-[#d9d9d9]/70">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>{saving ? 'Guardando...' : 'Guardar reglas'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: RETOS E INSIGNIAS */}
      {activeTab === 'retos' && data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-bold text-[#011f52] flex items-center gap-2">
              <Target className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
              <span>Retos activos ({data.retos.length})</span>
            </h2>
            <form onSubmit={handleCreateChallenge} className="space-y-3 p-3.5 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9]">
              <p className="text-xs font-bold text-[#011f52]">Nuevo reto académico</p>
              <input
                type="text"
                required
                minLength={3}
                value={retoTitulo}
                onChange={(e) => setRetoTitulo(e.target.value)}
                placeholder="Título del reto (ej. Semana de Speaking B1)"
                aria-label="Título del reto"
                className="w-full px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-xs"
              />
              <input
                type="text"
                required
                minLength={5}
                value={retoDesc}
                onChange={(e) => setRetoDesc(e.target.value)}
                placeholder="Descripción breve de la meta"
                aria-label="Descripción del reto"
                className="w-full px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-xs"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={retoTipo}
                  onChange={(e) => setRetoTipo(e.target.value)}
                  aria-label="Tipo de objetivo del reto"
                  className="px-2.5 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs"
                >
                  <option value="LECCIONES">Lecciones</option>
                  <option value="TAREAS">Tareas</option>
                  <option value="EXAMENES">Exámenes</option>
                  <option value="WRITING">Writing MCER</option>
                  <option value="RACHA">Días de racha</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={retoMeta}
                  onChange={(e) => setRetoMeta(Number(e.target.value))}
                  aria-label="Meta numérica"
                  placeholder="Meta"
                  className="px-2.5 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs tabular-nums"
                />
                <input
                  type="number"
                  min={10}
                  value={retoRecompensa}
                  onChange={(e) => setRetoRecompensa(Number(e.target.value))}
                  aria-label="Recompensa en puntos"
                  placeholder="Pts"
                  className="px-2.5 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs tabular-nums"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Publicar reto</span>
              </button>
            </form>

            <ul className="divide-y divide-[#d9d9d9]/70">
              {data.retos.map((r) => (
                <li key={r.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#011f52] truncate">{r.titulo}</p>
                    <p className="text-[11px] text-slate-600 truncate">
                      Meta: {r.metaValor} ({r.tipoObjetivo})
                    </p>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 tabular-nums shrink-0">
                    +{r.recompensaPuntos} pts
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-bold text-[#011f52] flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" aria-hidden="true" />
              <span>Insignias ({data.insignias.length})</span>
            </h2>
            <form onSubmit={handleCreateBadge} className="space-y-3 p-3.5 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9]">
              <p className="text-xs font-bold text-[#011f52]">Nueva insignia</p>
              <input
                type="text"
                required
                minLength={3}
                value={insNombre}
                onChange={(e) => setInsNombre(e.target.value)}
                placeholder="Nombre de insignia (ej. Campeón de Listening)"
                aria-label="Nombre de la insignia"
                className="w-full px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-xs"
              />
              <input
                type="text"
                required
                minLength={5}
                value={insDesc}
                onChange={(e) => setInsDesc(e.target.value)}
                placeholder="Criterio para obtenerla"
                aria-label="Descripción de la insignia"
                className="w-full px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={insCategoria}
                  onChange={(e) => setInsCategoria(e.target.value)}
                  aria-label="Categoría de insignia"
                  className="px-2.5 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs"
                >
                  <option value="ACADEMICO">Académico</option>
                  <option value="RACHA">Racha</option>
                  <option value="MCER">MCER Cambridge</option>
                  <option value="ESPECIAL">Especial</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={insBonus}
                  onChange={(e) => setInsBonus(Number(e.target.value))}
                  aria-label="Puntos bonus"
                  placeholder="Bonus pts"
                  className="px-2.5 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs tabular-nums"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Crear insignia</span>
              </button>
            </form>

            <ul className="divide-y divide-[#d9d9d9]/70 max-h-72 overflow-y-auto">
              {data.insignias.map((b) => (
                <li key={b.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#011f52] truncate">{b.nombre}</p>
                    <p className="text-[11px] text-slate-600 truncate">{b.descripcion}</p>
                  </div>
                  <span className="text-xs font-semibold text-[#011f52] tabular-nums shrink-0">
                    +{b.puntosBonus} pts
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* TAB 4: AUDITORÍA Y CONTROL ANTI-ABUSO */}
      {activeTab === 'auditoria' && data && (
        <section
          aria-label="Auditoría de movimientos de puntos"
          className="bg-white border border-[#d9d9d9] rounded-xl overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-[#d9d9d9] flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-[#011f52]">
              Libro mayor de ALLEN POINTS ({data.movimientos.length} recientes)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#f5f6f8] border-b border-[#d9d9d9] text-[#011f52]">
                  <th className="py-2.5 px-4 font-bold">Fecha</th>
                  <th className="py-2.5 px-3 font-bold">Estudiante</th>
                  <th className="py-2.5 px-3 font-bold">Fuente / Detalle</th>
                  <th className="py-2.5 px-3 font-bold text-right">Movimiento</th>
                  <th className="py-2.5 px-4 font-bold text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d9d9d9]/70">
                {data.movimientos.map((m) => (
                  <tr key={m.id} className={m.sospechoso ? 'bg-red-50/60' : ''}>
                    <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap tabular-nums">
                      {formatGuayaquilDateTime(m.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-[#011f52]">
                      {m.estudianteNombre || 'Estudiante'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{m.descripcion}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold tabular-nums ${
                        m.cantidad >= 0 ? 'text-emerald-700' : 'text-[#cf080d]'
                      }`}
                    >
                      {m.cantidad >= 0 ? `+${m.cantidad}` : m.cantidad} pts
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {m.sospechoso ? (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[10px]">
                          Revisar
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-medium">Verificado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
