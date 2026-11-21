import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  GraduationCap,
  KeyRound,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { apiFetch, formatGuayaquilDateTime } from '../../lib/api';
import type { AdminUsuariosResponse, EstudianteAdminItem, ProfesorAdminItem } from '../../types/aula';

interface AdminPanelViewProps {
  onRefreshAll: () => Promise<void>;
}

interface CredentialReceipt {
  titulo: string;
  nombre: string;
  usuario: string;
  passwordTemporal: string;
  extra?: string;
}

const STUDENT_INACTIVE_TAGS = [
  'Pago pendiente',
  'Retirado del programa',
  'Pausa temporal',
  'Suspendido',
];

const STAFF_INACTIVE_TAGS = [
  'Inactivo',
  'Licencia temporal',
  'Fuera de nómina',
];

export function AdminPanelView({ onRefreshAll }: AdminPanelViewProps) {
  const [tab, setTab] = useState<'docentes' | 'estudiantes' | 'mantenimiento'>('docentes');
  const [data, setData] = useState<AdminUsuariosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Formulario nuevo docente / admin
  const [profNombre, setProfNombre] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [profUsername, setProfUsername] = useState('');
  const [profRol, setProfRol] = useState<'PROFESOR' | 'ADMIN'>('PROFESOR');
  const [profPassword, setProfPassword] = useState('');
  const [staffReceipt, setStaffReceipt] = useState<CredentialReceipt | null>(null);

  // Formulario nuevo estudiante
  const [estNombres, setEstNombres] = useState('');
  const [estApellidos, setEstApellidos] = useState('');
  const [estEmail, setEstEmail] = useState('');
  const [estContrato, setEstContrato] = useState('');
  const [estPassword, setEstPassword] = useState('');
  const [estCursoId, setEstCursoId] = useState('');
  const [estRequiereAprobacion, setEstRequiereAprobacion] = useState(true);
  const [studentReceipt, setStudentReceipt] = useState<CredentialReceipt | null>(null);

  // Filtros de estudiantes
  const [studentQuery, setStudentQuery] = useState('');
  const [studentFilter, setStudentFilter] = useState<'TODOS' | 'ACTIVO' | 'INACTIVO'>('TODOS');

  // Modal Restablecer contraseña (docente o estudiante)
  const [resetModal, setResetModal] = useState<{
    tipo: 'PROFESOR' | 'ESTUDIANTE';
    id: string | number;
    nombre: string;
    identificador: string;
  } | null>(null);
  const [resetCustomPassword, setResetCustomPassword] = useState('');
  const [resetResult, setResetResult] = useState<CredentialReceipt | null>(null);

  // Modal Cambiar estado / etiqueta (activar o desactivar)
  const [statusModal, setStatusModal] = useState<{
    tipo: 'PROFESOR' | 'ESTUDIANTE';
    id: string | number;
    nombre: string;
    activoActual: boolean;
    etiquetaActual: string;
  } | null>(null);
  const [statusTargetActive, setStatusTargetActive] = useState(false);
  const [statusTagInput, setStatusTagInput] = useState('Pago pendiente');

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<AdminUsuariosResponse>('/api/admin/usuarios');
      setData(res);
      if (!estCursoId && res.cursos.length > 0) {
        setEstCursoId(res.cursos[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el panel administrativo.');
    } finally {
      setLoading(false);
    }
  }, [estCursoId]);

  useEffect(() => {
    loadData();
  }, []);

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback silencioso
    }
  };

  const handleCreateProfesor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    setStaffReceipt(null);
    setBusy(true);
    try {
      const res = await apiFetch<{
        profesor: ProfesorAdminItem;
        passwordTemporal: string;
      }>('/api/admin/profesores', {
        method: 'POST',
        body: JSON.stringify({
          nombre: profNombre.trim(),
          email: profEmail.trim(),
          username: profUsername.trim() || undefined,
          rol: profRol,
          password: profPassword.trim() || undefined,
        }),
      });
      setStaffReceipt({
        titulo: res.profesor.rol === 'ADMIN' ? 'Administrador creado' : 'Docente creado',
        nombre: res.profesor.nombre,
        usuario: res.profesor.username || res.profesor.email,
        passwordTemporal: res.passwordTemporal,
        extra: res.profesor.email,
      });
      setProfNombre('');
      setProfEmail('');
      setProfUsername('');
      setProfPassword('');
      setStatusMsg('Cuenta creada correctamente con usuario y contraseña.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar al usuario.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProfesor = async (id: number, nombre: string) => {
    setError(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      await apiFetch(`/api/admin/profesores/${id}`, { method: 'DELETE' });
      setStatusMsg(`Usuario ${nombre} eliminado del aula.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar al usuario.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateEstudiante = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    setStudentReceipt(null);
    setBusy(true);
    try {
      const res = await apiFetch<{
        estudiante: { nombres: string; apellidos: string; email: string | null };
        identificadorAcceso: string;
        passwordTemporal: string;
        estadoInscripcion: 'PENDIENTE' | 'ACTIVO' | null;
      }>('/api/admin/estudiantes', {
        method: 'POST',
        body: JSON.stringify({
          nombres: estNombres.trim(),
          apellidos: estApellidos.trim(),
          email: estEmail.trim(),
          numeroContrato: estContrato.trim() || undefined,
          password: estPassword.trim() || undefined,
          cursoId: estCursoId || undefined,
          requiereAprobacionDocente: estRequiereAprobacion,
        }),
      });

      setStudentReceipt({
        titulo: 'Credenciales de acceso generadas',
        nombre: `${res.estudiante.nombres} ${res.estudiante.apellidos}`,
        usuario: res.estudiante.email || res.identificadorAcceso,
        passwordTemporal: res.passwordTemporal,
        extra:
          res.estadoInscripcion === 'PENDIENTE'
            ? `ID/Cédula: ${res.identificadorAcceso} · Matrícula pendiente de aprobación docente`
            : `ID/Cédula: ${res.identificadorAcceso}`,
      });
      setEstNombres('');
      setEstApellidos('');
      setEstEmail('');
      setEstContrato('');
      setEstPassword('');
      setStatusMsg('Estudiante creado con credenciales de acceso.');
      await loadData();
      await onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar al estudiante.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEstudiante = async (id: string, nombre: string) => {
    setError(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      await apiFetch(`/api/admin/estudiantes/${id}`, { method: 'DELETE' });
      setStatusMsg(`Estudiante ${nombre} eliminado del aula.`);
      await loadData();
      await onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar al estudiante.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenStatusModal = (
    tipo: 'PROFESOR' | 'ESTUDIANTE',
    id: string | number,
    nombre: string,
    activoActual: boolean,
    etiquetaActual: string,
  ) => {
    setStatusModal({ tipo, id, nombre, activoActual, etiquetaActual });
    const nextActive = !activoActual;
    setStatusTargetActive(nextActive);
    setStatusTagInput(
      nextActive
        ? tipo === 'ESTUDIANTE'
          ? 'Al día'
          : 'Activo'
        : tipo === 'ESTUDIANTE'
          ? 'Pago pendiente'
          : 'Inactivo',
    );
  };

  const handleSubmitStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModal) return;
    setError(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      const url =
        statusModal.tipo === 'PROFESOR'
          ? `/api/admin/profesores/${statusModal.id}/estado`
          : `/api/admin/estudiantes/${statusModal.id}/estado`;
      await apiFetch(url, {
        method: 'PATCH',
        body: JSON.stringify({
          activo: statusTargetActive,
          etiquetaEstado: statusTagInput.trim() || (statusTargetActive ? 'Al día' : 'Pago pendiente'),
        }),
      });
      setStatusMsg(
        statusTargetActive
          ? `Cuenta de ${statusModal.nombre} reactivada (${statusTagInput.trim() || 'Activo'}).`
          : `Cuenta de ${statusModal.nombre} desactivada (${statusTagInput.trim() || 'Inactivo'}). El acceso quedó bloqueado inmediatamente.`,
      );
      setStatusModal(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModal) return;
    setError(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      const url =
        resetModal.tipo === 'PROFESOR'
          ? `/api/admin/profesores/${resetModal.id}/reset-password`
          : `/api/admin/estudiantes/${resetModal.id}/reset-password`;
      const res = await apiFetch<{
        ok: boolean;
        email?: string | null;
        username?: string;
        identificadorAcceso?: string;
        passwordTemporal: string;
      }>(url, {
        method: 'POST',
        body: JSON.stringify({
          newPassword: resetCustomPassword.trim() || undefined,
        }),
      });

      setResetResult({
        titulo: 'Contraseña restablecida',
        nombre: resetModal.nombre,
        usuario: res.username || res.email || res.identificadorAcceso || resetModal.identificador,
        passwordTemporal: res.passwordTemporal,
      });
      setResetCustomPassword('');
      setStatusMsg(`Contraseña de ${resetModal.nombre} restablecida correctamente.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetDemoData = async () => {
    setError(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; mensaje: string }>(
        '/api/admin/demo/reset-examenes',
        { method: 'POST' },
      );
      setStatusMsg(res.mensaje);
      await loadData();
      await onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron recargar los datos demo.');
    } finally {
      setBusy(false);
    }
  };

  const filteredStudents = (data?.estudiantes || []).filter((est: EstudianteAdminItem) => {
    const isActive = est.estado === 'ACTIVO' && est.accesoActivo !== false;
    if (studentFilter === 'ACTIVO' && !isActive) return false;
    if (studentFilter === 'INACTIVO' && isActive) return false;
    if (!studentQuery.trim()) return true;
    const q = studentQuery.toLowerCase();
    return (
      `${est.nombres} ${est.apellidos}`.toLowerCase().includes(q) ||
      (est.email || '').toLowerCase().includes(q) ||
      (est.identificadorAcceso || '').toLowerCase().includes(q) ||
      (est.etiquetaEstado || '').toLowerCase().includes(q)
    );
  });

  const inactiveStudentsCount = (data?.estudiantes || []).filter(
    (e) => e.estado !== 'ACTIVO' || e.accesoActivo === false,
  ).length;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-7 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-[#d9d9d9]">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#011f52] flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-[#cf080d]" aria-hidden="true" />
            <span>Administración · All American English</span>
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Control de usuarios, contraseñas, estado activo/inactivo por pagos y gestión del sistema ALLEN.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('docentes')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              tab === 'docentes'
                ? 'bg-[#011f52] text-white border-[#011f52]'
                : 'bg-white text-[#011f52] border-[#d9d9d9] hover:bg-[#f5f6f8]'
            }`}
          >
            Docentes y Admins ({data?.profesores.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTab('estudiantes')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              tab === 'estudiantes'
                ? 'bg-[#011f52] text-white border-[#011f52]'
                : 'bg-white text-[#011f52] border-[#d9d9d9] hover:bg-[#f5f6f8]'
            }`}
          >
            Estudiantes ({data?.estudiantes.length ?? 0})
            {inactiveStudentsCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#cf080d] text-white text-[10px]">
                {inactiveStudentsCount} inact.
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('mantenimiento')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              tab === 'mantenimiento'
                ? 'bg-[#011f52] text-white border-[#011f52]'
                : 'bg-white text-[#011f52] border-[#d9d9d9] hover:bg-[#f5f6f8]'
            }`}
          >
            Pruebas y recarga
          </button>
        </div>
      </div>

      {statusMsg && (
        <div role="status" className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          {statusMsg}
        </div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="bg-white border border-[#d9d9d9] rounded-xl p-10 text-center text-sm text-slate-600 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#011f52]" aria-hidden="true" />
          <span>Cargando directorio del sistema...</span>
        </div>
      ) : tab === 'docentes' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Alta de docente / admin */}
          <form
            onSubmit={handleCreateProfesor}
            className="lg:col-span-4 bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-3.5"
          >
            <h2 className="font-display text-base font-bold text-[#011f52] flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
              <span>Crear docente o administrador</span>
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Asigna usuario y contraseña inicial para el ingreso al sistema ALLEN. Si dejas la contraseña vacía, se genera una automáticamente.
            </p>
            <div>
              <label htmlFor="admin-prof-rol" className="block text-xs font-semibold text-[#011f52] mb-1">
                Rol de acceso
              </label>
              <select
                id="admin-prof-rol"
                value={profRol}
                onChange={(e) => setProfRol(e.target.value as 'PROFESOR' | 'ADMIN')}
                className="w-full px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-sm text-[#011f52]"
              >
                <option value="PROFESOR">Docente / Tutor</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
            <div>
              <label htmlFor="admin-prof-nombre" className="block text-xs font-semibold text-[#011f52] mb-1">
                Nombre completo
              </label>
              <input
                id="admin-prof-nombre"
                type="text"
                required
                value={profNombre}
                onChange={(e) => setProfNombre(e.target.value)}
                placeholder="Ej. Lic. Roberto Paredes"
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
              />
            </div>
            <div>
              <label htmlFor="admin-prof-email" className="block text-xs font-semibold text-[#011f52] mb-1">
                Correo electrónico
              </label>
              <input
                id="admin-prof-email"
                type="email"
                required
                value={profEmail}
                onChange={(e) => setProfEmail(e.target.value)}
                placeholder="roberto.paredes@allamericanenglish.edu.ec"
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="admin-prof-user" className="block text-xs font-semibold text-[#011f52] mb-1">
                  Usuario (opcional)
                </label>
                <input
                  id="admin-prof-user"
                  type="text"
                  value={profUsername}
                  onChange={(e) => setProfUsername(e.target.value)}
                  placeholder="roberto.paredes"
                  className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
                />
              </div>
              <div>
                <label htmlFor="admin-prof-pass" className="block text-xs font-semibold text-[#011f52] mb-1">
                  Contraseña (opcional)
                </label>
                <input
                  id="admin-prof-pass"
                  type="text"
                  value={profPassword}
                  onChange={(e) => setProfPassword(e.target.value)}
                  placeholder="Auto-generada"
                  className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
            >
              {busy ? 'Guardando...' : 'Crear cuenta de acceso'}
            </button>

            {staffReceipt && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-950">
                <p className="font-bold">
                  {staffReceipt.titulo}: {staffReceipt.nombre}
                </p>
                <div className="bg-white px-3 py-2 rounded-lg border border-emerald-200 space-y-1 font-mono-data">
                  <p>
                    Usuario: <strong>{staffReceipt.usuario}</strong>
                  </p>
                  <p>
                    Contraseña: <strong>{staffReceipt.passwordTemporal}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      `Acceso ALLEN (All American English)\nUsuario: ${staffReceipt.usuario}\nContraseña: ${staffReceipt.passwordTemporal}`,
                      'staff-receipt',
                    )
                  }
                  className="inline-flex items-center gap-1 text-[#011f52] font-semibold hover:text-[#cf080d]"
                >
                  {copiedKey === 'staff-receipt' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copiar credenciales</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </form>

          {/* Listado de personal */}
          <section className="lg:col-span-8 bg-white border border-[#d9d9d9] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#d9d9d9] bg-[#f5f6f8] flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#011f52] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#011f52]" aria-hidden="true" />
                <span>Personal registrado ({data?.profesores.length ?? 0})</span>
              </h2>
            </div>
            <div className="divide-y divide-[#d9d9d9]/70">
              {!data || data.profesores.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-600">
                  No hay docentes o administradores registrados todavía.
                </p>
              ) : (
                data.profesores.map((prof) => (
                  <div
                    key={prof.id}
                    className={`p-4 flex flex-wrap items-center justify-between gap-3 ${
                      prof.activo ? 'hover:bg-[#f5f6f8]/60' : 'bg-red-50/40'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#011f52]">{prof.nombre}</p>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                            prof.rol === 'ADMIN'
                              ? 'bg-[#011f52] text-white border-[#011f52]'
                              : 'bg-slate-100 text-[#011f52] border-slate-200'
                          }`}
                        >
                          {prof.rol === 'ADMIN' ? 'Administrador' : 'Docente'}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                            prof.activo
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-red-50 text-[#cf080d] border-red-200'
                          }`}
                        >
                          {prof.activo ? prof.etiquetaEstado || 'Activo' : `Inactivo · ${prof.etiquetaEstado || 'Suspendido'}`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Usuario: <span className="font-mono-data text-[#011f52]">{prof.username || prof.email.split('@')[0]}</span> ·{' '}
                        {prof.email} · {prof.cursosAsignados} curso(s)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setResetResult(null);
                          setResetCustomPassword('');
                          setResetModal({
                            tipo: 'PROFESOR',
                            id: prof.id,
                            nombre: prof.nombre,
                            identificador: prof.username || prof.email,
                          });
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#011f52] bg-white border border-[#d9d9d9] hover:bg-[#f5f6f8] rounded-lg"
                      >
                        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Restablecer clave</span>
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          handleOpenStatusModal(
                            'PROFESOR',
                            prof.id,
                            prof.nombre,
                            prof.activo,
                            prof.etiquetaEstado || (prof.activo ? 'Activo' : 'Inactivo'),
                          )
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border ${
                          prof.activo
                            ? 'text-amber-900 bg-amber-50 border-amber-200 hover:bg-amber-100'
                            : 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {prof.activo ? (
                          <>
                            <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Desactivar</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Activar</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDeleteProfesor(prof.id, prof.nombre)}
                        aria-label={`Eliminar ${prof.nombre}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#cf080d] border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : tab === 'estudiantes' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Alta de estudiante */}
            <form
              onSubmit={handleCreateEstudiante}
              className="lg:col-span-5 bg-white border border-[#d9d9d9] rounded-xl p-5 space-y-3.5"
            >
              <h2 className="font-display text-base font-bold text-[#011f52] flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
                <span>Registrar estudiante</span>
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Crea el acceso con usuario y contraseña para el estudiante. Puedes activar o desactivar su ingreso en cualquier momento según su estado de pago.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="admin-est-nombres" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Nombres
                  </label>
                  <input
                    id="admin-est-nombres"
                    type="text"
                    required
                    value={estNombres}
                    onChange={(e) => setEstNombres(e.target.value)}
                    placeholder="Ej. Sofía"
                    className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="admin-est-apellidos" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Apellidos
                  </label>
                  <input
                    id="admin-est-apellidos"
                    type="text"
                    required
                    value={estApellidos}
                    onChange={(e) => setEstApellidos(e.target.value)}
                    placeholder="Ej. Herrera"
                    className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-est-email" className="block text-xs font-semibold text-[#011f52] mb-1">
                  Correo electrónico
                </label>
                <input
                  id="admin-est-email"
                  type="email"
                  required
                  value={estEmail}
                  onChange={(e) => setEstEmail(e.target.value)}
                  placeholder="sofia.herrera@correo.ec"
                  className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="admin-est-contrato" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Cédula / ID (opcional)
                  </label>
                  <input
                    id="admin-est-contrato"
                    type="text"
                    value={estContrato}
                    onChange={(e) => setEstContrato(e.target.value)}
                    placeholder="Auto-generado si vacío"
                    className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="admin-est-pass" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Contraseña (opcional)
                  </label>
                  <input
                    id="admin-est-pass"
                    type="text"
                    value={estPassword}
                    onChange={(e) => setEstPassword(e.target.value)}
                    placeholder="Auto-generada"
                    className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-est-curso" className="block text-xs font-semibold text-[#011f52] mb-1">
                  Asignar al curso
                </label>
                <select
                  id="admin-est-curso"
                  value={estCursoId}
                  onChange={(e) => setEstCursoId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-sm text-[#011f52]"
                >
                  <option value="">Sin asignar todavía</option>
                  {(data?.cursos || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {estCursoId && (
                <label className="flex items-start gap-2 text-xs text-[#011f52] p-2.5 rounded-lg bg-[#f5f6f8] border border-[#d9d9d9]">
                  <input
                    type="checkbox"
                    checked={estRequiereAprobacion}
                    onChange={(e) => setEstRequiereAprobacion(e.target.checked)}
                    className="mt-0.5 accent-[#011f52]"
                  />
                  <span>
                    Enviar como <strong>Pendiente de aprobación</strong> para que el docente acepte el ingreso en Participantes.
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{busy ? 'Registrando...' : 'Crear estudiante y generar clave'}</span>
              </button>

              {studentReceipt && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-950">
                  <p className="font-bold">
                    {studentReceipt.titulo} · {studentReceipt.nombre}
                  </p>
                  <div className="bg-white px-3 py-2 rounded-lg border border-emerald-200 font-mono-data space-y-1">
                    <p>
                      Usuario/Correo: <strong>{studentReceipt.usuario}</strong>
                    </p>
                    <p>
                      Contraseña: <strong>{studentReceipt.passwordTemporal}</strong>
                    </p>
                  </div>
                  {studentReceipt.extra && (
                    <p className="text-[11px] text-emerald-900">{studentReceipt.extra}</p>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(
                        `Acceso ALLEN (All American English)\nUsuario: ${studentReceipt.usuario}\nContraseña: ${studentReceipt.passwordTemporal}`,
                        'student-receipt',
                      )
                    }
                    className="inline-flex items-center gap-1 text-[#011f52] font-semibold hover:text-[#cf080d]"
                  >
                    {copiedKey === 'student-receipt' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiar credenciales</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>

            {/* Listado de estudiantes con estado Activo/Inactivo, etiquetas de pago y reset de clave */}
            <section className="lg:col-span-7 bg-white border border-[#d9d9d9] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#d9d9d9] bg-[#f5f6f8] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-bold text-[#011f52]">
                    Estudiantes ({filteredStudents.length})
                  </h2>
                  <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-[#d9d9d9] text-[11px] font-semibold">
                    {(['TODOS', 'ACTIVO', 'INACTIVO'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setStudentFilter(f)}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          studentFilter === f
                            ? 'bg-[#011f52] text-white'
                            : 'text-slate-600 hover:text-[#011f52]'
                        }`}
                      >
                        {f === 'TODOS' ? 'Todos' : f === 'ACTIVO' ? 'Activos' : 'Inactivos'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Buscar por nombre, correo, cédula o etiqueta (ej. Pago pendiente)..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#d9d9d9] rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="divide-y divide-[#d9d9d9]/70 max-h-[560px] overflow-y-auto">
                {filteredStudents.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-600">
                    No se encontraron estudiantes con el filtro seleccionado.
                  </p>
                ) : (
                  filteredStudents.map((est) => {
                    const isActive = est.estado === 'ACTIVO' && est.accesoActivo !== false;
                    return (
                      <div
                        key={est.id}
                        className={`p-4 flex flex-wrap items-start justify-between gap-3 ${
                          isActive ? 'hover:bg-[#f5f6f8]/60' : 'bg-red-50/45'
                        }`}
                      >
                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[#011f52]">
                              {est.apellidos}, {est.nombres}
                            </p>
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                isActive
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-red-100 text-[#cf080d] border-red-200'
                              }`}
                            >
                              <Tag className="w-3 h-3" aria-hidden="true" />
                              <span>
                                {isActive
                                  ? `Activo · ${est.etiquetaEstado || 'Al día'}`
                                  : `Inactivo · ${est.etiquetaEstado || 'Pago pendiente'}`}
                              </span>
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            {est.email || 'Sin correo'} · ID/Cédula:{' '}
                            <span className="font-mono-data text-[#011f52]">
                              {est.identificadorAcceso || '—'}
                            </span>
                          </p>
                          {est.inscripciones.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {est.inscripciones.map((ins) => (
                                <span
                                  key={ins.inscripcionId}
                                  className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                    ins.estado === 'PENDIENTE'
                                      ? 'bg-amber-50 text-amber-900 border-amber-200'
                                      : ins.estado === 'ACTIVO'
                                        ? 'bg-slate-50 text-[#011f52] border-slate-200'
                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                  }`}
                                >
                                  {ins.cursoNombre} · {ins.estado === 'PENDIENTE' ? 'Pendiente docente' : ins.estado}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setResetResult(null);
                              setResetCustomPassword('');
                              setResetModal({
                                tipo: 'ESTUDIANTE',
                                id: est.id,
                                nombre: `${est.nombres} ${est.apellidos}`,
                                identificador: est.identificadorAcceso || est.email || '',
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#011f52] bg-white border border-[#d9d9d9] hover:bg-[#f5f6f8] rounded-lg"
                          >
                            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Clave</span>
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              handleOpenStatusModal(
                                'ESTUDIANTE',
                                est.id,
                                `${est.nombres} ${est.apellidos}`,
                                isActive,
                                est.etiquetaEstado || (isActive ? 'Al día' : 'Pago pendiente'),
                              )
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border ${
                              isActive
                                ? 'text-amber-900 bg-amber-50 border-amber-200 hover:bg-amber-100'
                                : 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                            }`}
                          >
                            {isActive ? (
                              <>
                                <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Desactivar</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Reactivar</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDeleteEstudiante(est.id, `${est.nombres} ${est.apellidos}`)}
                            aria-label={`Eliminar estudiante ${est.nombres} ${est.apellidos}`}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-[#cf080d] border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          {/* Registro de invitaciones por correo */}
          <section className="bg-white border border-[#d9d9d9] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#d9d9d9] bg-[#f5f6f8] flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#011f52] flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#011f52]" aria-hidden="true" />
                <span>Historial de altas e invitaciones ({data?.invitaciones.length ?? 0})</span>
              </h2>
            </div>
            {!data || data.invitaciones.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-600">
                Aún no se han emitido invitaciones desde el panel administrativo.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#d9d9d9] bg-slate-50 text-slate-600">
                      <th className="py-2.5 px-4">Destinatario</th>
                      <th className="py-2.5 px-4">Perfil</th>
                      <th className="py-2.5 px-4">Curso</th>
                      <th className="py-2.5 px-4">Estado</th>
                      <th className="py-2.5 px-4">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d9d9d9]/60">
                    {data.invitaciones.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-2.5 px-4">
                          <span className="font-semibold text-[#011f52] block">{inv.nombre}</span>
                          <span className="text-slate-500">{inv.email}</span>
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-[#011f52]">
                          {inv.rol === 'ADMIN' ? 'Administrador' : inv.rol === 'PROFESOR' ? 'Docente' : 'Estudiante'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{inv.cursoNombre || '—'}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded border font-semibold ${
                              inv.estado === 'ACEPTADA'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-sky-50 text-[#011f52] border-sky-200'
                            }`}
                          >
                            {inv.estado}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 tabular-nums">
                          {formatGuayaquilDateTime(inv.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="bg-white border border-[#d9d9d9] rounded-xl p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-[#011f52]">
            Recargar información demo para pruebas de exámenes y protocolo 48h
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
            Esta acción restablece los intentos de evaluación del estudiante demo, asegura que el examen interactivo con <strong>Unir parejas con flechas, Audio, Video y True / False</strong> esté disponible para rendirse de nuevo, y prepara ejemplos de entregas (una bloqueada con más de 48 horas y otra editable dentro del plazo) y una matrícula pendiente de aprobación docente.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={handleResetDemoData}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{busy ? 'Recargando datos...' : 'Recargar datos demo de exámenes y entregas'}</span>
          </button>
        </section>
      )}

      {/* Modal: Restablecer contraseña */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-pass-title"
            className="bg-white border border-[#d9d9d9] rounded-xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#d9d9d9] flex items-center justify-between">
              <h3 id="reset-pass-title" className="font-display text-base font-bold text-[#011f52]">
                Restablecer contraseña
              </h3>
              <button
                type="button"
                onClick={() => {
                  setResetModal(null);
                  setResetResult(null);
                }}
                aria-label="Cerrar"
                className="p-1 rounded hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {resetResult ? (
              <div className="p-5 space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-950">
                  <p className="font-bold text-sm">Contraseña actualizada para {resetResult.nombre}</p>
                  <div className="bg-white p-3 rounded-lg border border-emerald-200 font-mono-data space-y-1">
                    <p>
                      Usuario: <strong>{resetResult.usuario}</strong>
                    </p>
                    <p>
                      Nueva contraseña: <strong>{resetResult.passwordTemporal}</strong>
                    </p>
                  </div>
                  <p className="text-[11px] text-emerald-900">
                    Copia y entrega esta contraseña al usuario. Por seguridad, no se volverá a mostrar al cerrar esta ventana.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(
                        `Acceso ALLEN (All American English)\nUsuario: ${resetResult.usuario}\nNueva contraseña: ${resetResult.passwordTemporal}`,
                        'reset-copy',
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#011f52] text-white text-xs font-semibold rounded-lg"
                  >
                    {copiedKey === 'reset-copy' ? (
                      <>
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiar credenciales</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetModal(null);
                      setResetResult(null);
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitPasswordReset} className="p-5 space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Usuario seleccionado: <strong className="text-[#011f52]">{resetModal.nombre}</strong> ({resetModal.identificador}).
                </p>
                <div>
                  <label htmlFor="reset-custom-pass" className="block text-xs font-semibold text-[#011f52] mb-1">
                    Nueva contraseña (opcional, mínimo 6 caracteres)
                  </label>
                  <input
                    id="reset-custom-pass"
                    type="text"
                    value={resetCustomPassword}
                    onChange={(e) => setResetCustomPassword(e.target.value)}
                    placeholder="Déjalo vacío para generar una clave segura automáticamente"
                    className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModal(null)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
                  >
                    {busy ? 'Restableciendo...' : 'Restablecer contraseña'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Activar / Desactivar cuenta con etiqueta */}
      {statusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-modal-title"
            className="bg-white border border-[#d9d9d9] rounded-xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#d9d9d9] flex items-center justify-between">
              <h3 id="status-modal-title" className="font-display text-base font-bold text-[#011f52]">
                {statusTargetActive ? 'Activar cuenta' : 'Desactivar y etiquetar cuenta'}
              </h3>
              <button
                type="button"
                onClick={() => setStatusModal(null)}
                aria-label="Cerrar"
                className="p-1 rounded hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmitStatusChange} className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Usuario: <strong className="text-[#011f52]">{statusModal.nombre}</strong>.{' '}
                {statusTargetActive
                  ? 'Al activar esta cuenta, el usuario podrá volver a iniciar sesión inmediatamente en ALLEN.'
                  : 'Al desactivar esta cuenta, se bloqueará su ingreso al aula virtual y cualquier sesión abierta quedará revocada de inmediato.'}
              </p>

              <div>
                <label htmlFor="status-tag-input" className="block text-xs font-semibold text-[#011f52] mb-1.5">
                  Etiqueta de estado
                </label>
                {!statusTargetActive && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(statusModal.tipo === 'ESTUDIANTE' ? STUDENT_INACTIVE_TAGS : STAFF_INACTIVE_TAGS).map(
                      (tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setStatusTagInput(tag)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                            statusTagInput === tag
                              ? 'bg-[#cf080d] text-white border-[#cf080d]'
                              : 'bg-[#f5f6f8] text-[#011f52] border-[#d9d9d9] hover:bg-slate-200/70'
                          }`}
                        >
                          {tag}
                        </button>
                      ),
                    )}
                  </div>
                )}
                <input
                  id="status-tag-input"
                  type="text"
                  required
                  value={statusTagInput}
                  onChange={(e) => setStatusTagInput(e.target.value)}
                  placeholder={statusTargetActive ? 'Ej. Al día' : 'Ej. Pago pendiente'}
                  className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStatusModal(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className={`px-4 py-2 text-white text-xs font-semibold rounded-lg disabled:opacity-60 ${
                    statusTargetActive
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-[#cf080d] hover:bg-[#ad060a]'
                  }`}
                >
                  {busy
                    ? 'Guardando...'
                    : statusTargetActive
                      ? 'Confirmar activación'
                      : 'Desactivar acceso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
