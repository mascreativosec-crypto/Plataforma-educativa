import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';

export function LoginView() {
  const {
    iniciarConCredenciales,
    entrarDemo,
    error,
    limpiarError,
  } = useAuth();

  const [usuarioInput, setUsuarioInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeError = localError || error;

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    limpiarError();
    if (!usuarioInput.trim() || !password) {
      setLocalError('Ingresa tu usuario o correo electrónico y tu contraseña.');
      return;
    }
    setBusy(true);
    try {
      await iniciarConCredenciales(usuarioInput.trim(), password);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Usuario o contraseña incorrectos.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = async (rol: 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE') => {
    setLocalError(null);
    limpiarError();
    setBusy(true);
    try {
      await entrarDemo(rol);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'No se pudo iniciar la sesión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col">
      <header className="bg-[#011f52] text-white border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              ALLEN
            </span>
            <span className="text-white/30" aria-hidden="true">|</span>
            <span className="text-xs sm:text-sm font-medium text-white/90 truncate">
              All American English
            </span>
          </div>
          <span className="text-xs text-white/75 hidden sm:inline">
            Sistema académico y aula virtual
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Columna izquierda: identidad institucional All American English · Sistema ALLEN */}
          <div className="lg:col-span-6 bg-[#011f52] text-white rounded-xl p-8 sm:p-10 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
                All American English · Sistema ALLEN
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight text-white mb-4">
                Aula virtual para gestionar cursos, evaluaciones y progreso estudiantil
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-8">
                Administra unidades, lecciones, materiales en Google Drive, exámenes interactivos y
                seguimiento académico desde un solo lugar.
              </p>

              <div className="space-y-4 border-t border-slate-800 pt-6">
                <div className="flex items-start gap-3">
                  <BookOpen className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-white">Cursos modulares y evaluaciones en línea</p>
                    <p className="text-xs text-slate-400">
                      Unidades, lecciones, recursos multimedia, tareas y cuestionarios con vista previa docente.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <GraduationCap className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-white">Control de notas, asistencia y progreso</p>
                    <p className="text-xs text-slate-400">
                      Calificaciones sincronizadas, historial auditado y seguimiento diario por estudiante.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-white">Control de acceso por usuario y estado</p>
                    <p className="text-xs text-slate-400">
                      Ingreso seguro con usuario y contraseña para administradores, docentes y estudiantes activos.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-8 pt-4 border-t border-slate-800">
              All American English · Hora oficial: America/Guayaquil
            </p>
          </div>

          {/* Columna derecha: acceso unificado con usuario y contraseña */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#011f52] mb-1">
                Iniciar sesión en ALLEN
              </h2>
              <p className="text-sm text-[#475569] mb-6">
                Ingresa con tu usuario, correo electrónico o cédula y tu contraseña asignada.
              </p>

              {activeError && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
                >
                  {activeError}
                </div>
              )}

              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="login-usuario"
                    className="block text-sm font-semibold text-[#011f52] mb-1.5"
                  >
                    Usuario, correo electrónico o cédula
                  </label>
                  <div className="relative">
                    <User
                      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      id="login-usuario"
                      type="text"
                      autoComplete="username"
                      required
                      value={usuarioInput}
                      onChange={(e) => setUsuarioInput(e.target.value)}
                      placeholder="Ej. admin, carolina.andrade o tu correo"
                      className="w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-[#0f172a] bg-white focus:border-[#011f52] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-semibold text-[#011f52] mb-1.5"
                  >
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock
                      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ingresa tu contraseña"
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg text-sm text-[#0f172a] bg-white focus:border-[#011f52] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-[#011f52]"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 px-4 bg-[#cf080d] hover:bg-[#ad060a] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  <span>{busy ? 'Verificando acceso...' : 'Ingresar al sistema ALLEN'}</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </form>

              <p className="text-xs text-slate-500 mt-3">
                ¿Olvidaste tu contraseña? Solicita un restablecimiento al administrador de All American English.
              </p>

              {/* Acceso rápido de evaluación para los 3 perfiles */}
              <div className="relative py-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-[#475569]">Acceso rápido de evaluación</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDemo('ADMIN')}
                  className="py-2.5 px-3 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  Administrador
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDemo('PROFESOR')}
                  className="py-2.5 px-3 bg-white hover:bg-slate-50 text-[#011f52] border border-slate-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  Docente
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDemo('ESTUDIANTE')}
                  className="py-2.5 px-3 bg-white hover:bg-slate-50 text-[#011f52] border border-slate-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  Estudiante
                </button>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-[#f5f6f8] border border-[#d9d9d9] text-[11px] text-slate-600 space-y-1">
                <p className="font-semibold text-[#011f52]">Credenciales de prueba:</p>
                <p>
                  Admin: <span className="font-mono-data text-[#011f52]">admin</span> /{' '}
                  <span className="font-mono-data text-[#011f52]">Admin2026!</span> · Docente:{' '}
                  <span className="font-mono-data text-[#011f52]">carolina.andrade</span> /{' '}
                  <span className="font-mono-data text-[#011f52]">Docente2026!</span>
                </p>
                <p>
                  Estudiante: <span className="font-mono-data text-[#011f52]">1724567890</span> /{' '}
                  <span className="font-mono-data text-[#011f52]">Estudiante2026!</span>
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-[#475569] flex items-center justify-between gap-4">
              <span>Seguridad: bloqueo temporal tras 5 intentos fallidos</span>
              <span className="font-semibold text-[#011f52]">All American English · ALLEN</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
