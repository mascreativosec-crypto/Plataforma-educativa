import React, { useState } from 'react';
import {
  Archive,
  BookOpen,
  Copy,
  Download,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, formatGuayaquilDate, formatGuayaquilDateTime } from '../../lib/api';
import { validateCourseDeletionReason } from '../../lib/course-cover';
import { getNivelInfo, NIVELES_DISPONIBLES } from '../../lib/niveles';
import type {
  AulaUsuario,
  CursoBackupItem,
  CursoItem,
  EstudianteMirror,
  ParticipanteItem,
  TenantInfo,
} from '../../types/aula';
import { COURSE_COVER_PRESETS, CourseCoverPicker } from './CourseCoverPicker';

interface CourseCatalogProps {
  usuario: AulaUsuario;
  tenant: TenantInfo | null;
  cursos: CursoItem[];
  cargando: boolean;
  error: string | null;
  onSelectCurso: (cursoId: string) => void;
  onRefresh: () => Promise<void>;
}

const DELETION_REASON_CHIPS = [
  'El curso finalizó su periodo académico',
  'El grupo avanzó al siguiente nivel',
  'Curso duplicado por error',
  'Reorganización de horarios',
];

export function CourseCatalog({
  usuario,
  tenant,
  cursos,
  cargando,
  error,
  onSelectCurso,
  onRefresh,
}: CourseCatalogProps) {
  const isDocente = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'PUBLICADO' | 'BORRADOR'>('TODOS');
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [bannerErr, setBannerErr] = useState<string | null>(null);

  // Modal: Crear curso
  const [modalOpen, setModalOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [nivel, setNivel] = useState('A2');
  const [portadaUrl, setPortadaUrl] = useState(COURSE_COVER_PRESETS[0].url);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Modal: Duplicar curso
  const [duplicateTarget, setDuplicateTarget] = useState<CursoItem | null>(null);
  const [dupNombre, setDupNombre] = useState('');
  const [dupEstado, setDupEstado] = useState<'BORRADOR' | 'PUBLICADO'>('BORRADOR');
  const [dupInicio, setDupInicio] = useState('');
  const [dupFin, setDupFin] = useState('');
  const [dupBusy, setDupBusy] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);

  // Modal: Eliminar curso (con respaldo automático obligatorio y motivo)
  const [deleteTarget, setDeleteTarget] = useState<CursoItem | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Modal: Respaldos y restauración
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [backups, setBackups] = useState<CursoBackupItem[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Modal: Inscribir personas rápidamente
  const [enrollTarget, setEnrollTarget] = useState<CursoItem | null>(null);
  const [enrollParticipants, setEnrollParticipants] = useState<ParticipanteItem[]>([]);
  const [enrollAvailable, setEnrollAvailable] = useState<EstudianteMirror[]>([]);
  const [enrollSearch, setEnrollSearch] = useState('');
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollBusyId, setEnrollBusyId] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const filtered = cursos.filter((c) => {
    const matchesSearch =
      !busqueda.trim() ||
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (c.nivel || '').toLowerCase().includes(busqueda.toLowerCase());
    const matchesEstado = filtroEstado === 'TODOS' || c.estado === filtroEstado;
    return matchesSearch && matchesEstado;
  });

  const handleCreateCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (nombre.trim().length < 3) {
      setFormError('Ingresa un nombre de curso de al menos 3 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch<{ curso: CursoItem }>('/api/cursos', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
          nivel,
          portadaUrl: portadaUrl || undefined,
          fechaInicio: fechaInicio || undefined,
          fechaFin: fechaFin || undefined,
        }),
      });
      setModalOpen(false);
      setNombre('');
      setDescripcion('');
      setPortadaUrl(COURSE_COVER_PRESETS[0].url);
      setFechaInicio('');
      setFechaFin('');
      await onRefresh();
      onSelectCurso(data.curso.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear el curso.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDuplicateModal = (curso: CursoItem) => {
    setDuplicateTarget(curso);
    setDupNombre(`${curso.nombre} (Copia)`);
    setDupEstado('BORRADOR');
    setDupInicio('');
    setDupFin('');
    setDupError(null);
  };

  const handleDuplicateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateTarget) return;
    if (dupNombre.trim().length < 3) {
      setDupError('Ingresa un nombre de al menos 3 caracteres para la copia.');
      return;
    }
    setDupBusy(true);
    setDupError(null);
    try {
      const res = await apiFetch<{
        curso: CursoItem;
        estadisticas: { unidades: number; lecciones: number; examenes: number; tareas: number };
      }>(`/api/cursos/${duplicateTarget.id}/duplicar`, {
        method: 'POST',
        body: JSON.stringify({
          nombre: dupNombre.trim(),
          estado: dupEstado,
          fechaInicio: dupInicio || undefined,
          fechaFin: dupFin || undefined,
        }),
      });
      setDuplicateTarget(null);
      setBannerErr(null);
      setBannerMsg(
        `Curso duplicado como "${res.curso.nombre}" (${res.estadisticas.unidades} unidad(es), ${res.estadisticas.lecciones} lección(es), ${res.estadisticas.examenes} examen(es)).`,
      );
      await onRefresh();
    } catch (err) {
      setDupError(err instanceof Error ? err.message : 'No se pudo duplicar el curso.');
    } finally {
      setDupBusy(false);
    }
  };

  const openDeleteModal = (curso: CursoItem) => {
    setDeleteTarget(curso);
    setDeleteReason('');
    setDeleteError(null);
  };

  const handleDeleteCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    const validation = validateCourseDeletionReason(deleteReason);
    if (!validation.valid) {
      setDeleteError(validation.error || 'Ingresa el motivo de eliminación.');
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/cursos/${deleteTarget.id}/eliminar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: deleteReason.trim() }),
      });
      const deletedName = deleteTarget.nombre;
      setDeleteTarget(null);
      setDeleteReason('');
      setBannerErr(null);
      setBannerMsg(
        `Se generó el respaldo completo y se eliminó "${deletedName}". Puedes restaurarlo cuando lo necesites desde Respaldos.`,
      );
      await onRefresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar el curso.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const openBackupsModal = async () => {
    setBackupsOpen(true);
    setBackupsLoading(true);
    setBackupsError(null);
    try {
      const data = await apiFetch<{ backups: CursoBackupItem[] }>('/api/cursos/backups');
      setBackups(data.backups);
    } catch (err) {
      setBackupsError(err instanceof Error ? err.message : 'No se pudieron cargar los respaldos.');
    } finally {
      setBackupsLoading(false);
    }
  };

  const handleRestoreBackup = async (backup: CursoBackupItem) => {
    setRestoringId(backup.id);
    setBackupsError(null);
    try {
      const res = await apiFetch<{ curso: CursoItem }>(
        `/api/cursos/backups/${backup.id}/restaurar`,
        { method: 'POST' },
      );
      setBackupsOpen(false);
      setBannerErr(null);
      setBannerMsg(
        `Curso "${res.curso.nombre}" restaurado en estado Borrador con todas sus unidades, recursos, tareas y exámenes.`,
      );
      await onRefresh();
    } catch (err) {
      setBackupsError(err instanceof Error ? err.message : 'No se pudo restaurar el respaldo.');
    } finally {
      setRestoringId(null);
    }
  };

  const handleDownloadBackupJson = (backup: CursoBackupItem) => {
    const blob = new Blob([JSON.stringify(backup.snapshot || backup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = backup.cursoNombre
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '');
    a.download = `respaldo-${slug || 'curso'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openEnrollModal = async (curso: CursoItem) => {
    setEnrollTarget(curso);
    setEnrollSearch('');
    setEnrollError(null);
    setEnrollLoading(true);
    try {
      const [partData, availData] = await Promise.all([
        apiFetch<{ participantes: ParticipanteItem[] }>(`/api/cursos/${curso.id}/inscripciones`),
        apiFetch<{ estudiantes: EstudianteMirror[] }>('/api/estudiantes-disponibles'),
      ]);
      setEnrollParticipants(partData.participantes);
      setEnrollAvailable(availData.estudiantes);
    } catch (err) {
      setEnrollError(
        err instanceof Error ? err.message : 'No se pudo cargar la lista de estudiantes.',
      );
    } finally {
      setEnrollLoading(false);
    }
  };

  const handleQuickEnroll = async (estudianteId: string) => {
    if (!enrollTarget) return;
    setEnrollBusyId(estudianteId);
    setEnrollError(null);
    try {
      await apiFetch(`/api/cursos/${enrollTarget.id}/inscripciones`, {
        method: 'POST',
        body: JSON.stringify({ estudianteId }),
      });
      const partData = await apiFetch<{ participantes: ParticipanteItem[] }>(
        `/api/cursos/${enrollTarget.id}/inscripciones`,
      );
      setEnrollParticipants(partData.participantes);
      await onRefresh();
    } catch (err) {
      setEnrollError(err instanceof Error ? err.message : 'No se pudo inscribir al estudiante.');
    } finally {
      setEnrollBusyId(null);
    }
  };

  const handleQuickUnenroll = async (estudianteId: string) => {
    if (!enrollTarget) return;
    setEnrollBusyId(estudianteId);
    setEnrollError(null);
    try {
      await apiFetch(`/api/cursos/${enrollTarget.id}/inscripciones/${estudianteId}`, {
        method: 'DELETE',
      });
      const partData = await apiFetch<{ participantes: ParticipanteItem[] }>(
        `/api/cursos/${enrollTarget.id}/inscripciones`,
      );
      setEnrollParticipants(partData.participantes);
      await onRefresh();
    } catch (err) {
      setEnrollError(err instanceof Error ? err.message : 'No se pudo retirar al estudiante.');
    } finally {
      setEnrollBusyId(null);
    }
  };

  const enrolledIdsSet = new Set(enrollParticipants.map((p) => p.estudiante.id));
  const filteredAvailableStudents = enrollAvailable.filter((e) => {
    if (enrolledIdsSet.has(e.id)) return false;
    if (!enrollSearch.trim()) return true;
    const q = enrollSearch.toLowerCase();
    const fullName = `${e.nombres} ${e.apellidos}`.toLowerCase();
    return (
      fullName.includes(q) ||
      (e.numeroContrato || '').toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Encabezado de página */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#d9d9d9]">
        <div>
          <p className="text-xs text-slate-600 mb-1">
            {tenant?.nombre || 'All American English'} ·{' '}
            {usuario.rol === 'ADMIN'
              ? 'Administración académica'
              : isDocente
                ? 'Panel docente'
                : 'Portal del estudiante'}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#011f52]">
            Mis cursos
          </h1>
        </div>

        {isDocente && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={openBackupsModal}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white hover:bg-[#f5f6f8] border border-[#d9d9d9] hover:border-[#011f52] text-[#011f52] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Archive className="w-4 h-4" aria-hidden="true" />
              <span>Respaldos</span>
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#cf080d] hover:bg-[#ad060a] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Crear curso</span>
            </button>
          </div>
        )}
      </div>

      {/* Barra de búsqueda y filtro */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 py-5">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-[#475569] absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar curso por nombre o nivel..."
            aria-label="Buscar curso"
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-[#0f172a] focus:border-[#011f52] focus:outline-none"
          />
        </div>

        {isDocente && (
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
            {(['TODOS', 'PUBLICADO', 'BORRADOR'] as const).map((est) => (
              <button
                key={est}
                type="button"
                onClick={() => setFiltroEstado(est)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filtroEstado === est
                    ? 'bg-white text-[#0f172a] shadow-sm'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                {est === 'TODOS' ? 'Todos' : est === 'PUBLICADO' ? 'Publicados' : 'Borradores'}
              </button>
            ))}
          </div>
        )}
      </div>

      {bannerMsg && (
        <div
          role="status"
          className="mb-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center justify-between gap-3"
        >
          <span>{bannerMsg}</span>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            aria-label="Cerrar notificación"
            className="p-1 text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {(error || bannerErr) && (
        <div role="alert" className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error || bannerErr}
        </div>
      )}

      {cargando ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-pulse">
              <div className="h-40 bg-slate-200" />
              <div className="p-5 space-y-3">
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-5 bg-slate-200 rounded w-5/6" />
                <div className="h-3 bg-slate-100 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-3" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-[#0f172a] mb-1">
            {isDocente ? 'Sin cursos en esta vista' : 'Sin cursos asignados'}
          </h2>
          <p className="text-sm text-[#475569] mb-5 max-w-md mx-auto">
            {isDocente
              ? 'Crea un nuevo curso para organizar unidades, lecciones, tareas y evaluaciones.'
              : 'Cuando tu matrícula se sincronice desde ALLEN, tus cursos aparecerán aquí.'}
          </p>
          {isDocente && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-sm font-medium rounded-lg"
            >
              Crear primer curso
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((c) => {
            const nivelInfo = getNivelInfo(c.nivel);
            const imgFailed = failedImages[c.id];
            const progress = c.progresoPorcentaje ?? 0;

            return (
              <article
                key={c.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col hover:border-slate-300 transition-colors"
              >
                <div className="h-44 bg-slate-100 relative overflow-hidden">
                  {c.portadaUrl && !imgFailed ? (
                    <img
                      src={c.portadaUrl}
                      alt={`Portada del curso ${c.nombre}`}
                      referrerPolicy="no-referrer"
                      onError={() => setFailedImages((prev) => ({ ...prev, [c.id]: true }))}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center p-4 text-center">
                      <BookOpen className="w-8 h-8 text-[#011f52] mb-2" aria-hidden="true" />
                      <span className="text-xs font-medium text-[#475569]">{nivelInfo.etiqueta}</span>
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col">
                  {/* Señalética funcional de nivel + estado en texto limpio */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold rounded border ${nivelInfo.bgClass} ${nivelInfo.textClass} ${nivelInfo.borderClass}`}
                    >
                      {nivelInfo.etiqueta}
                    </span>
                    <span className="text-xs font-medium text-[#475569]">
                      {c.estado === 'PUBLICADO'
                        ? 'Publicado'
                        : c.estado === 'BORRADOR'
                          ? 'Borrador'
                          : 'Archivado'}
                    </span>
                  </div>

                  <h2 className="font-display text-lg font-semibold text-[#011f52] leading-snug mb-2">
                    <button
                      type="button"
                      onClick={() => onSelectCurso(c.id)}
                      className="text-left hover:text-[#cf080d] transition-colors"
                    >
                      {c.nombre}
                    </button>
                  </h2>

                  {c.descripcion && (
                    <p className="text-sm text-[#475569] line-clamp-2 mb-4">{c.descripcion}</p>
                  )}

                  <div className="mt-auto pt-4 border-t border-slate-100 space-y-3">
                    {isDocente ? (
                      <div className="flex items-center justify-between text-xs text-[#475569] tabular-nums">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" aria-hidden="true" />
                          {c.estadisticas?.inscritos ?? 0} inscritos
                        </span>
                        <span>
                          {c.estadisticas?.unidades ?? 0}{' '}
                          {(c.estadisticas?.unidades ?? 0) === 1 ? 'unidad' : 'unidades'} ·{' '}
                          {c.estadisticas?.lecciones ?? 0}{' '}
                          {(c.estadisticas?.lecciones ?? 0) === 1 ? 'lección' : 'lecciones'}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-[#475569]">Progreso del curso</span>
                          <span className="font-mono-data font-semibold text-[#0f172a]">
                            {progress}%
                          </span>
                        </div>
                        <div
                          className="h-2 bg-slate-100 rounded-full overflow-hidden"
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Progreso de ${c.nombre}`}
                        >
                          <div
                            className="h-full bg-[#cf080d] transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-600 mt-1.5 tabular-nums">
                          {c.leccionesCompletadas ?? 0} de {c.leccionesPublicadas ?? 0} lecciones
                          completadas
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-600 truncate">
                        {c.profesorNombre || 'Docente asignado'}
                        {c.fechaInicio ? ` · Inicio ${formatGuayaquilDate(c.fechaInicio)}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectCurso(c.id)}
                        className="text-sm font-semibold text-[#011f52] hover:text-[#cf080d] whitespace-nowrap shrink-0"
                      >
                        Abrir curso
                      </button>
                    </div>

                    {isDocente && (
                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEnrollModal(c)}
                          aria-label={`Inscribir estudiantes en ${c.nombre}`}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-[#d9d9d9] hover:border-[#011f52] text-[11px] font-semibold text-[#011f52] transition-colors"
                        >
                          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Inscribir</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openDuplicateModal(c)}
                          aria-label={`Duplicar curso ${c.nombre}`}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-[#d9d9d9] hover:border-[#011f52] text-[11px] font-semibold text-[#011f52] transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Duplicar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteModal(c)}
                          aria-label={`Eliminar curso ${c.nombre}`}
                          className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#d9d9d9] hover:border-red-300 hover:bg-red-50 text-[11px] font-semibold text-slate-600 hover:text-[#cf080d] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Eliminar</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal: Nuevo curso */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nuevo-curso-title"
            className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-[#011f52] text-white">
              <h2 id="nuevo-curso-title" className="font-display text-lg font-semibold">
                Crear nuevo curso
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Cerrar diálogo"
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateCurso} className="p-6 space-y-4 overflow-y-auto">
              {formError && (
                <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="curso-nombre" className="block text-sm font-medium text-[#0f172a] mb-1">
                  Nombre del curso
                </label>
                <input
                  id="curso-nombre"
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Inglés Conversacional B1 — Noche"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-[#0f172a] focus:border-[#011f52] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="curso-nivel" className="block text-sm font-medium text-[#0f172a] mb-1">
                  Nivel / Programa
                </label>
                <select
                  id="curso-nivel"
                  value={nivel}
                  onChange={(e) => setNivel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-[#0f172a] bg-white focus:border-[#011f52] focus:outline-none"
                >
                  {NIVELES_DISPONIBLES.map((n) => (
                    <option key={n} value={n}>
                      {getNivelInfo(n).etiqueta}
                    </option>
                  ))}
                </select>
              </div>

              <CourseCoverPicker
                value={portadaUrl}
                onChange={setPortadaUrl}
                idPrefix="create-course-cover"
              />

              <div>
                <label htmlFor="curso-desc" className="block text-sm font-medium text-[#0f172a] mb-1">
                  Descripción
                </label>
                <textarea
                  id="curso-desc"
                  rows={3}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Objetivos comunicativos, destrezas y dinámica del curso."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-[#0f172a] focus:border-[#011f52] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="curso-inicio" className="block text-sm font-medium text-[#0f172a] mb-1">
                    Fecha de inicio
                  </label>
                  <input
                    id="curso-inicio"
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-[#0f172a]"
                  />
                </div>
                <div>
                  <label htmlFor="curso-fin" className="block text-sm font-medium text-[#0f172a] mb-1">
                    Fecha de fin
                  </label>
                  <input
                    id="curso-fin"
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-[#0f172a]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-[#475569] hover:text-[#0f172a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-sm font-semibold rounded-lg disabled:opacity-60"
                >
                  {submitting ? 'Guardando...' : 'Guardar curso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Duplicar curso */}
      {duplicateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dup-curso-title"
            className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#011f52] text-white">
              <div className="flex items-center gap-2">
                <Copy className="w-4 h-4" aria-hidden="true" />
                <h2 id="dup-curso-title" className="font-display text-base font-bold">
                  Duplicar curso completo
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateTarget(null)}
                aria-label="Cerrar diálogo de duplicación"
                className="p-1 text-white/80 hover:text-white rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleDuplicateCourse} className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Se copiarán todas las unidades, lecciones, recursos, tareas y exámenes con sus
                preguntas. El nuevo curso inicia sin entregas ni notas previas para un nuevo grupo.
              </p>
              {dupError && (
                <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {dupError}
                </div>
              )}
              <div>
                <label htmlFor="dup-nombre" className="block text-xs font-semibold text-[#011f52] mb-1">
                  Nombre del nuevo curso
                </label>
                <input
                  id="dup-nombre"
                  type="text"
                  required
                  value={dupNombre}
                  onChange={(e) => setDupNombre(e.target.value)}
                  className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm text-[#011f52]"
                />
              </div>
              <div>
                <label htmlFor="dup-estado" className="block text-xs font-semibold text-[#011f52] mb-1">
                  Estado inicial
                </label>
                <select
                  id="dup-estado"
                  value={dupEstado}
                  onChange={(e) => setDupEstado(e.target.value as 'BORRADOR' | 'PUBLICADO')}
                  className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm bg-white text-[#011f52]"
                >
                  <option value="BORRADOR">Borrador (revisar antes de publicar)</option>
                  <option value="PUBLICADO">Publicado inmediatamente</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dup-inicio" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Fecha inicio
                  </label>
                  <input
                    id="dup-inicio"
                    type="date"
                    value={dupInicio}
                    onChange={(e) => setDupInicio(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[#d9d9d9] rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="dup-fin" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Fecha fin
                  </label>
                  <input
                    id="dup-fin"
                    type="date"
                    value={dupFin}
                    onChange={(e) => setDupFin(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[#d9d9d9] rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDuplicateTarget(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-[#011f52]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={dupBusy}
                  className="px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
                >
                  {dupBusy ? 'Duplicando...' : 'Duplicar curso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Eliminar curso con respaldo automático y motivo obligatorio */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="del-curso-title"
            className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-lg overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-red-200 flex items-center justify-between bg-red-50">
              <div className="flex items-center gap-2 text-[#cf080d]">
                <ShieldAlert className="w-5 h-5" aria-hidden="true" />
                <h2 id="del-curso-title" className="font-display text-base font-bold text-[#011f52]">
                  Eliminar curso con respaldo automático
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                aria-label="Cerrar diálogo de eliminación"
                className="p-1 text-slate-500 hover:text-[#011f52] rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleDeleteCourse} className="p-5 space-y-4">
              <div className="p-3.5 rounded-lg bg-[#f5f6f8] border border-[#011f52]/20 text-xs text-[#011f52] space-y-1">
                <p className="font-semibold">
                  Curso a eliminar: <span className="text-[#cf080d]">{deleteTarget.nombre}</span>
                </p>
                <p className="text-slate-600">
                  Antes de eliminarlo, ALLEN guardará automáticamente un respaldo completo
                  (unidades, lecciones, materiales, tareas y cuestionarios) en la sección{' '}
                  <strong>Respaldos</strong> para que puedas restaurarlo o descargarlo cuando quieras.
                </p>
              </div>

              {deleteError && (
                <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {deleteError}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="del-motivo" className="block text-xs font-semibold text-[#011f52]">
                  Motivo de eliminación (obligatorio)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DELETION_REASON_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setDeleteReason(chip)}
                      className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                        deleteReason === chip
                          ? 'bg-[#011f52] text-white border-[#011f52]'
                          : 'bg-white text-slate-600 border-[#d9d9d9] hover:border-[#011f52]'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <textarea
                  id="del-motivo"
                  rows={3}
                  required
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Describe brevemente por qué se elimina este curso (mínimo 5 caracteres)..."
                  className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm text-[#011f52]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-[#011f52]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deleteBusy}
                  className="px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
                >
                  {deleteBusy ? 'Respaldando y eliminando...' : 'Respaldar y eliminar curso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Respaldos y restauración */}
      {backupsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="backups-title"
            className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#011f52] text-white">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4" aria-hidden="true" />
                <h2 id="backups-title" className="font-display text-base font-bold">
                  Respaldos de cursos eliminados
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setBackupsOpen(false)}
                aria-label="Cerrar respaldos"
                className="p-1 text-white/80 hover:text-white rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              {backupsError && (
                <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {backupsError}
                </div>
              )}
              {backupsLoading ? (
                <p className="text-sm text-slate-600 py-8 text-center">Cargando respaldos...</p>
              ) : backups.length === 0 ? (
                <div className="py-10 text-center space-y-1">
                  <Archive className="w-7 h-7 text-slate-400 mx-auto" aria-hidden="true" />
                  <p className="text-sm font-semibold text-[#011f52]">Sin respaldos guardados todavía</p>
                  <p className="text-xs text-slate-500">
                    Cada vez que elimines un curso, su copia completa quedará protegida aquí.
                  </p>
                </div>
              ) : (
                backups.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 rounded-xl border border-[#d9d9d9] bg-[#f5f6f8]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-sm font-bold text-[#011f52]">
                          {b.cursoNombre}
                        </p>
                        {b.cursoNivel && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-[#d9d9d9] text-[#011f52]">
                            {b.cursoNivel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700">
                        <strong>Motivo:</strong> {b.motivo}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {b.resumen.unidades} unidad(es) · {b.resumen.lecciones} lección(es) ·{' '}
                        {b.resumen.examenes} examen(es) · Eliminado por {b.eliminadoPorNombre} el{' '}
                        {formatGuayaquilDateTime(b.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadBackupJson(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d9d9d9] bg-white hover:border-[#011f52] text-xs font-semibold text-[#011f52]"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>JSON</span>
                      </button>
                      <button
                        type="button"
                        disabled={restoringId === b.id}
                        onClick={() => handleRestoreBackup(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold disabled:opacity-60"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{restoringId === b.id ? 'Restaurando...' : 'Restaurar'}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Inscribir estudiantes en el curso */}
      {enrollTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enroll-title"
            className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#011f52] text-white">
              <div className="flex items-center gap-2 min-w-0">
                <UserPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
                <h2 id="enroll-title" className="font-display text-base font-bold truncate">
                  Inscribir estudiantes · {enrollTarget.nombre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEnrollTarget(null)}
                aria-label="Cerrar inscripciones"
                className="p-1 text-white/80 hover:text-white rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-5">
              {enrollError && (
                <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {enrollError}
                </div>
              )}

              {enrollLoading ? (
                <p className="text-sm text-slate-600 py-8 text-center">Cargando estudiantes...</p>
              ) : (
                <>
                  {/* Disponibles para inscribir */}
                  <section className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#011f52]">
                        Disponibles para inscribir ({filteredAvailableStudents.length})
                      </h3>
                      <input
                        type="search"
                        value={enrollSearch}
                        onChange={(e) => setEnrollSearch(e.target.value)}
                        placeholder="Buscar por nombre o cédula..."
                        aria-label="Buscar estudiante disponible"
                        className="px-3 py-1.5 border border-[#d9d9d9] rounded-lg text-xs w-56"
                      />
                    </div>
                    {filteredAvailableStudents.length === 0 ? (
                      <p className="text-xs text-slate-500 p-3 rounded-lg bg-[#f5f6f8] border border-[#d9d9d9]">
                        No hay estudiantes disponibles con ese filtro o ya están todos inscritos.
                      </p>
                    ) : (
                      <div className="divide-y divide-[#d9d9d9]/70 border border-[#d9d9d9] rounded-lg max-h-48 overflow-y-auto">
                        {filteredAvailableStudents.map((st) => (
                          <div
                            key={st.id}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#011f52] truncate">
                                {st.nombres} {st.apellidos}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {st.numeroContrato || st.email || 'Estudiante'} ·{' '}
                                {st.etiquetaEstado || st.estado}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={enrollBusyId === st.id}
                              onClick={() => handleQuickEnroll(st.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-60 shrink-0"
                            >
                              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Inscribir</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Actualmente inscritos */}
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#011f52]">
                      Inscritos actualmente ({enrollParticipants.length})
                    </h3>
                    {enrollParticipants.length === 0 ? (
                      <p className="text-xs text-slate-500 p-3 rounded-lg bg-[#f5f6f8] border border-[#d9d9d9]">
                        Todavía no hay estudiantes inscritos en este curso.
                      </p>
                    ) : (
                      <div className="divide-y divide-[#d9d9d9]/70 border border-[#d9d9d9] rounded-lg max-h-48 overflow-y-auto">
                        {enrollParticipants.map((p) => {
                          const fullName = `${p.estudiante.nombres} ${p.estudiante.apellidos}`;
                          return (
                            <div
                              key={p.inscripcionId}
                              className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[#011f52] truncate">
                                  {fullName}
                                </p>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {p.estudiante.numeroContrato || p.estudiante.email || 'Estudiante'} · Avance{' '}
                                  {p.progresoPorcentaje}%
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={enrollBusyId === p.estudiante.id}
                                onClick={() => handleQuickUnenroll(p.estudiante.id)}
                                aria-label={`Retirar a ${fullName} del curso`}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#d9d9d9] hover:border-red-300 hover:bg-red-50 text-slate-600 hover:text-[#cf080d] text-xs font-semibold rounded-lg disabled:opacity-60 shrink-0"
                              >
                                <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Retirar</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
