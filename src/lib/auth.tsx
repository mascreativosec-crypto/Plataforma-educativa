import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from './firebase';
import { apiFetch, setAuthToken } from './api';
import type { AulaUsuario, TenantInfo } from '../types/aula';

interface AuthContextValue {
  usuario: AulaUsuario | null;
  tenant: TenantInfo | null;
  cargando: boolean;
  error: string | null;
  iniciarConCredenciales: (usuario: string, password: string) => Promise<void>;
  iniciarConGoogle: () => Promise<void>;
  solicitarCodigoEstudiante: (identificador: string) => Promise<void>;
  entrarEstudiante: (identificador: string, codigo: string) => Promise<void>;
  entrarDemo: (rol: 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE') => Promise<void>;
  cerrarSesion: () => Promise<void>;
  limpiarError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<AulaUsuario | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarSesionActual = useCallback(async () => {
    try {
      const data = await apiFetch<{ usuario: AulaUsuario; tenant: TenantInfo }>('/api/auth/yo');
      setUsuario(data.usuario);
      setTenant(data.tenant);
      return true;
    } catch {
      setUsuario(null);
      setTenant(null);
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const ticket = params.get('ticket');
        const autostart = params.get('autostart');

        // 1. Canje automático si llega desde ALLEN con ?ticket=
        if (ticket) {
          const data = await apiFetch<{ usuario: AulaUsuario; accessToken: string }>(
            '/api/auth/canjear',
            {
              method: 'POST',
              body: JSON.stringify({ ticket }),
            },
          );
          setAuthToken(data.accessToken);
          window.history.replaceState({}, '', window.location.pathname);
          if (active) {
            await cargarSesionActual();
          }
          return;
        }

        // 2. Comprobar cookie HttpOnly existente sin generar 401 en consola
        const sesion = await apiFetch<{
          autenticado: boolean;
          usuario: AulaUsuario | null;
          tenant: TenantInfo | null;
          motivoDesactivacion?: string;
        }>('/api/auth/sesion');
        if (sesion.autenticado && sesion.usuario) {
          if (active) {
            setUsuario(sesion.usuario);
            setTenant(sesion.tenant);
          }
          return;
        }
        if (sesion.motivoDesactivacion && active) {
          setError(sesion.motivoDesactivacion);
        }

        // 3. Soporte ?autostart=1|admin|estudiante para evaluación directa
        if (autostart === '1' || autostart === 'estudiante' || autostart === 'admin') {
          const rol =
            autostart === 'admin'
              ? 'ADMIN'
              : autostart === 'estudiante'
                ? 'ESTUDIANTE'
                : 'PROFESOR';
          const demo = await apiFetch<{ usuario: AulaUsuario; accessToken: string }>(
            '/api/auth/demo-session',
            {
              method: 'POST',
              body: JSON.stringify({ rol }),
            },
          );
          setAuthToken(demo.accessToken);
          if (active) {
            await cargarSesionActual();
          }
          return;
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudo iniciar la sesión.');
        }
      } finally {
        if (active) setCargando(false);
      }
    };

    bootstrap();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !usuario) {
        try {
          const idToken = await fbUser.getIdToken();
          setAuthToken(idToken);
          if (active) {
            await cargarSesionActual();
          }
        } catch {
          // Mantener sesión actual si existe
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [cargarSesionActual]);

  const iniciarConCredenciales = useCallback(
    async (usuarioInput: string, password: string) => {
      setError(null);
      const data = await apiFetch<{ usuario: AulaUsuario; accessToken: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ usuario: usuarioInput, password }),
        },
      );
      setAuthToken(data.accessToken);
      await cargarSesionActual();
    },
    [cargarSesionActual],
  );

  const iniciarConGoogle = useCallback(async () => {
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      setAuthToken(idToken);
      await cargarSesionActual();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo completar el inicio de sesión con Google.';
      setError(msg);
      throw err;
    }
  }, [cargarSesionActual]);

  const solicitarCodigoEstudiante = useCallback(async (identificador: string) => {
    setError(null);
    await apiFetch('/api/auth/estudiante/codigo', {
      method: 'POST',
      body: JSON.stringify({ identificador }),
    });
  }, []);

  const entrarEstudiante = useCallback(
    async (identificador: string, codigo: string) => {
      setError(null);
      const data = await apiFetch<{ usuario: AulaUsuario; accessToken: string }>(
        '/api/auth/estudiante/entrar',
        {
          method: 'POST',
          body: JSON.stringify({ identificador, codigo }),
        },
      );
      setAuthToken(data.accessToken);
      await cargarSesionActual();
    },
    [cargarSesionActual],
  );

  const entrarDemo = useCallback(
    async (rol: 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE') => {
      setError(null);
      const data = await apiFetch<{ usuario: AulaUsuario; accessToken: string }>(
        '/api/auth/demo-session',
        {
          method: 'POST',
          body: JSON.stringify({ rol }),
        },
      );
      setAuthToken(data.accessToken);
      await cargarSesionActual();
    },
    [cargarSesionActual],
  );

  const cerrarSesion = useCallback(async () => {
    try {
      await apiFetch('/api/auth/salir', { method: 'POST' });
    } catch {
      // ignore
    }
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUsuario(null);
    setTenant(null);
  }, []);

  const limpiarError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        usuario,
        tenant,
        cargando,
        error,
        iniciarConCredenciales,
        iniciarConGoogle,
        solicitarCodigoEstudiante,
        entrarEstudiante,
        entrarDemo,
        cerrarSesion,
        limpiarError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
