import React, { useEffect, useState } from 'react';
import { CheckCircle2, Search, UserMinus, UserPlus, X, XCircle } from 'lucide-react';
import { apiFetch, formatGuayaquilDate } from '../../lib/api';
import type { AulaUsuario, EstudianteMirror, ParticipanteItem } from '../../types/aula';

interface ParticipantsTabProps {
  cursoId: string;
  usuario: AulaUsuario;
  onSelectStudent: (estudianteId: string) => void;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function ParticipantsTab({ cursoId, usuario, onSelectStudent }: ParticipantsTabProps) {
  const canManage = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';
  const canApprove = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';
  const [participantes, setParticipantes] = useState<ParticipanteItem[]>([]);
  const [disponibles, setDisponibles] = useState<EstudianteMirror[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [firstLetter, setFirstLetter] = useState<string>('ALL');
  const [lastLetter, setLastLetter] = useState<string>('ALL');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedEstId, setSelectedEstId] = useState('');
  const [enrollAsPending, setEnrollAsPending] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadData = async () => {
    setCargando(true);
    setError(null);
    try {
      const [partData, dispData] = await Promise.all([
        apiFetch<{ participantes: ParticipanteItem[] }>(`/api/cursos/${cursoId}/inscripciones`),
        canManage
          ? apiFetch<{ estudiantes: EstudianteMirror[] }>('/api/estudiantes-disponibles')
          : Promise.resolve({ estudiantes: [] }),
      ]);
      setParticipantes(partData.participantes);
      setDisponibles(dispData.estudiantes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los participantes.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [cursoId]);

  const filtered = participantes.filter((p) => {
    const full = `${p.estudiante.nombres} ${p.estudiante.apellidos} ${p.estudiante.numeroContrato || ''}`.toLowerCase();
    const matchQuery = !query.trim() || full.includes(query.toLowerCase());
    const matchFirst =
      firstLetter === 'ALL' || p.estudiante.nombres.toUpperCase().startsWith(firstLetter);
    const matchLast =
      lastLetter === 'ALL' || p.estudiante.apellidos.toUpperCase().startsWith(lastLetter);
    return matchQuery && matchFirst && matchLast;
  });

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEstId) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      await apiFetch(`/api/cursos/${cursoId}/inscripciones`, {
        method: 'POST',
        body: JSON.stringify({
          estudianteId: selectedEstId,
          estado: enrollAsPending ? 'PENDIENTE' : 'ACTIVO',
        }),
      });
      setShowEnrollModal(false);
      setSelectedEstId('');
      setStatusMsg(
        enrollAsPending
          ? 'Estudiante inscrito como Pendiente de aprobación del docente.'
          : 'Estudiante inscrito y activado en el curso.',
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo inscribir al estudiante.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateEnrollmentStatus = async (
    inscripcionId: string,
    estado: 'ACTIVO' | 'RETIRADO',
    nombreEstudiante: string,
  ) => {
    setBusy(true);
    setError(null);
    setStatusMsg(null);
    try {
      await apiFetch(`/api/cursos/${cursoId}/inscripciones/${inscripcionId}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado }),
      });
      setStatusMsg(
        estado === 'ACTIVO'
          ? `Acceso de ${nombreEstudiante} aprobado en este curso.`
          : `Solicitud de ${nombreEstudiante} rechazada.`,
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la matrícula.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (estudianteId: string) => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await apiFetch(`/api/cursos/${cursoId}/inscripciones/${estudianteId}`, {
        method: 'DELETE',
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo retirar al estudiante.');
    } finally {
      setBusy(false);
    }
  };

  const enrolledIds = new Set(
    participantes
      .filter((p) => p.estado === 'ACTIVO' || p.estado === 'PENDIENTE')
      .map((p) => p.estudiante.id),
  );
  const enrollCandidates = disponibles.filter((e) => !enrolledIds.has(e.id));
  const pendingCount = participantes.filter((p) => p.estado === 'PENDIENTE').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-[#0f172a]">
            Participantes inscritos
          </h2>
          <p className="text-xs text-[#475569] mt-0.5 tabular-nums">
            {filtered.length} participante(s) encontrado(s) · Matrícula sincronizada desde CRM ALLEN
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setShowEnrollModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-sm font-semibold rounded-lg whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            <span>Inscribir estudiante</span>
          </button>
        )}
      </div>

      {/* Filtros inspirados en la vista Participants de Moodle */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, apellido o número de contrato..."
              aria-label="Buscar participante"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          {(firstLetter !== 'ALL' || lastLetter !== 'ALL' || query) && (
            <button
              type="button"
              onClick={() => {
                setFirstLetter('ALL');
                setLastLetter('ALL');
                setQuery('');
              }}
              className="px-3 py-2 text-xs font-medium text-[#475569] bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Índices alfabéticos Nombre / Apellido */}
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-0.5">
            <span className="w-16 text-[#475569] font-medium shrink-0">Nombre</span>
            <button
              type="button"
              onClick={() => setFirstLetter('ALL')}
              className={`px-2 py-1 rounded mr-1 ${
                firstLetter === 'ALL'
                  ? 'bg-[#2f5597] text-white font-medium'
                  : 'text-[#2f5597] hover:bg-slate-100'
              }`}
            >
              Todos
            </button>
            {LETTERS.map((l) => (
              <button
                key={`f-${l}`}
                type="button"
                onClick={() => setFirstLetter(l)}
                className={`w-6 py-1 rounded text-center ${
                  firstLetter === l
                    ? 'bg-[#2f5597] text-white font-medium'
                    : 'text-[#475569] hover:bg-slate-100'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-0.5">
            <span className="w-16 text-[#475569] font-medium shrink-0">Apellido</span>
            <button
              type="button"
              onClick={() => setLastLetter('ALL')}
              className={`px-2 py-1 rounded mr-1 ${
                lastLetter === 'ALL'
                  ? 'bg-[#2f5597] text-white font-medium'
                  : 'text-[#2f5597] hover:bg-slate-100'
              }`}
            >
              Todos
            </button>
            {LETTERS.map((l) => (
              <button
                key={`l-${l}`}
                type="button"
                onClick={() => setLastLetter(l)}
                className={`w-6 py-1 rounded text-center ${
                  lastLetter === l
                    ? 'bg-[#2f5597] text-white font-medium'
                    : 'text-[#475569] hover:bg-slate-100'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pendingCount > 0 && canApprove && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 flex items-center justify-between gap-3">
          <span>
            Hay <strong>{pendingCount}</strong> estudiante(s) esperando tu aprobación para ingresar a este curso.
          </span>
        </div>
      )}

      {statusMsg && (
        <div role="status" className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          {statusMsg}
        </div>
      )}

      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        {cargando ? (
          <div className="p-8 text-sm text-[#475569]">Cargando participantes...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#475569]">
            Sin participantes que coincidan con el filtro actual.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-[#475569]">
                <th className="py-3 px-4">Nombre / Apellido</th>
                <th className="py-3 px-4">Contrato ALLEN</th>
                <th className="py-3 px-4">Origen</th>
                <th className="py-3 px-4 text-right">Progreso</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((p) => (
                <tr key={p.inscripcionId} className="hover:bg-slate-50/80">
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => onSelectStudent(p.estudiante.id)}
                      className="font-medium text-[#2f5597] hover:underline text-left"
                    >
                      {p.estudiante.apellidos}, {p.estudiante.nombres}
                    </button>
                    <p className="text-xs text-[#475569]">
                      {p.estudiante.email || 'Sin correo registrado'} · Alta{' '}
                      {formatGuayaquilDate(p.fechaAlta)}
                    </p>
                  </td>
                  <td className="py-3 px-4 font-mono-data text-xs text-[#0f172a]">
                    {p.estudiante.numeroContrato || '—'}
                  </td>
                  <td className="py-3 px-4 text-xs text-[#475569]">{p.origen}</td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    <span className="font-mono-data font-semibold text-[#0f172a]">
                      {p.progresoPorcentaje}%
                    </span>
                    <span className="block text-[11px] text-[#475569]">
                      {p.leccionesCompletadas}/{p.leccionesTotales} lecciones
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded border ${
                          p.estado === 'ACTIVO'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : p.estado === 'PENDIENTE'
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-slate-100 text-[#475569] border-slate-200'
                        }`}
                      >
                        {p.estado === 'ACTIVO'
                          ? 'Activo'
                          : p.estado === 'PENDIENTE'
                            ? 'Pendiente aprobación'
                            : p.estado === 'RETIRADO'
                              ? 'Retirado'
                              : 'Finalizado'}
                      </span>
                      {p.estudiante.estado !== 'ACTIVO' && (
                        <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border bg-red-50 text-[#cf080d] border-red-200">
                          Cuenta inactiva · {p.estudiante.etiquetaEstado || 'Pago pendiente'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      {p.estado === 'PENDIENTE' && canApprove ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              handleUpdateEnrollmentStatus(
                                p.inscripcionId,
                                'ACTIVO',
                                `${p.estudiante.nombres} ${p.estudiante.apellidos}`,
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg disabled:opacity-60"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Aprobar</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              handleUpdateEnrollmentStatus(
                                p.inscripcionId,
                                'RETIRADO',
                                `${p.estudiante.nombres} ${p.estudiante.apellidos}`,
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-red-200 text-[#cf080d] hover:bg-red-50 text-xs font-semibold rounded-lg disabled:opacity-60"
                          >
                            <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Rechazar</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onSelectStudent(p.estudiante.id)}
                            className="text-xs font-medium text-[#2f5597] hover:underline whitespace-nowrap"
                          >
                            Ver progreso
                          </button>
                          {canManage && p.estado === 'ACTIVO' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRemove(p.estudiante.id)}
                              aria-label={`Retirar a ${p.estudiante.nombres}`}
                              className="p-1.5 text-[#475569] hover:text-red-700 rounded hover:bg-slate-100"
                            >
                              <UserMinus className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal inscribir estudiante */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enroll-title"
            className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 id="enroll-title" className="font-display text-base font-semibold text-[#0f172a]">
                Inscribir estudiante (espejo ALLEN)
              </h3>
              <button
                type="button"
                onClick={() => setShowEnrollModal(false)}
                aria-label="Cerrar diálogo"
                className="p-1 rounded hover:bg-slate-100 text-[#475569]"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleEnroll} className="p-5 space-y-4">
              {enrollCandidates.length === 0 ? (
                <p className="text-sm text-[#475569]">
                  Todos los estudiantes sincronizados de tu institución ya están inscritos en este
                  curso.
                </p>
              ) : (
                <div>
                  <label htmlFor="select-est" className="block text-sm font-medium text-[#0f172a] mb-1.5">
                    Seleccionar estudiante
                  </label>
                  <select
                    id="select-est"
                    required
                    value={selectedEstId}
                    onChange={(e) => setSelectedEstId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Elige un estudiante...</option>
                    {enrollCandidates.map((est) => (
                      <option key={est.id} value={est.id}>
                        {est.apellidos}, {est.nombres} ({est.numeroContrato || 'Sin contrato'})
                      </option>
                    ))}
                  </select>
                  <label className="mt-3 flex items-start gap-2 text-xs text-[#011f52]">
                    <input
                      type="checkbox"
                      checked={enrollAsPending}
                      onChange={(e) => setEnrollAsPending(e.target.checked)}
                      className="mt-0.5 accent-[#011f52]"
                    />
                    <span>Requiere aprobación del docente del curso (Pendiente)</span>
                  </label>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="px-3.5 py-2 text-sm text-[#475569]"
                >
                  Cancelar
                </button>
                {enrollCandidates.length > 0 && (
                  <button
                    type="submit"
                    disabled={busy || !selectedEstId}
                    className="px-4 py-2 bg-[#2f5597] hover:bg-[#244378] text-white text-sm font-medium rounded-lg disabled:opacity-60"
                  >
                    Confirmar inscripción
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
