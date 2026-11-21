import React, { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Coins,
  Flame,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
} from 'lucide-react';
import {
  getRoleDisplayLabel,
  type CourseSectionId,
  type MainNavId,
  type NavBadgeCounts,
} from '../../lib/navigation';
import type { AulaUsuario, CursoItem, StudentGamificationState } from '../../types/aula';

interface TopNavProps {
  usuario: AulaUsuario;
  activeNav: MainNavId;
  inCourseView: boolean;
  selectedCurso: CursoItem | null;
  activeCourseSection: CourseSectionId;
  hasOpenLesson?: boolean;
  badges: NavBadgeCounts | null;
  studentGamification?: StudentGamificationState | null;
  sidebarCollapsed: boolean;
  onToggleSidebarCollapse: () => void;
  onOpenMobileMenu: () => void;
  onNavigateMain: (nav: MainNavId) => void;
  onBackInCourse: () => void;
  onSwitchRole: (rol: 'PROFESOR' | 'ESTUDIANTE') => Promise<void>;
  onLogout: () => Promise<void>;
}

export function TopNav({
  usuario,
  activeNav,
  inCourseView,
  selectedCurso,
  activeCourseSection,
  hasOpenLesson = false,
  badges,
  studentGamification,
  sidebarCollapsed,
  onToggleSidebarCollapse,
  onOpenMobileMenu,
  onNavigateMain,
  onBackInCourse,
  onSwitchRole,
  onLogout,
}: TopNavProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const isDocente = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';
  const roleLabel = getRoleDisplayLabel(usuario.rol);

  const initials = usuario.nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  const notifCount = badges?.notificaciones ?? 0;

  const backButtonLabel = hasOpenLesson
    ? 'Volver a unidades'
    : activeCourseSection !== 'resumen'
      ? 'Volver al curso'
      : 'Mis cursos';

  return (
    <header className="sticky top-0 z-30 bg-[#011f52] text-white border-b border-white/10 h-14 px-3 sm:px-5 flex items-center justify-between gap-3">
      {/* Zona 1: Control de menú + Marca institucional + Rol + Volver (en curso) */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Abrir navegación principal"
          className="lg:hidden p-2 -ml-1 rounded-lg text-white/90 hover:text-white hover:bg-white/10 shrink-0"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onToggleSidebarCollapse}
          aria-label={sidebarCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
          className="hidden lg:inline-flex p-1.5 rounded-lg text-white/85 hover:text-white hover:bg-white/10 shrink-0"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onNavigateMain('dashboard')}
          className="font-display text-base sm:text-lg font-bold tracking-tight text-white hover:text-white/90 transition-colors whitespace-nowrap shrink-0 inline-flex items-baseline gap-1.5"
        >
          <span>ALLEN</span>
          <span className="font-semibold text-white/95">Aula</span>
        </button>

        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide bg-white/12 text-white whitespace-nowrap shrink-0">
          {roleLabel}
        </span>

        {inCourseView && selectedCurso && (
          <button
            type="button"
            onClick={onBackInCourse}
            className="inline-flex items-center gap-1.5 ml-1 sm:ml-2 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{backButtonLabel}</span>
          </button>
        )}
      </div>

      {/* Zona 2: Indicadores gamificación (estudiante) + Notificaciones + Perfil */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {!isDocente && studentGamification && (
          <div className="hidden sm:flex items-center gap-1.5 mr-1">
            <button
              type="button"
              onClick={() => onNavigateMain('gamificacion')}
              aria-label={`Racha actual: ${studentGamification.racha.rachaVigente} días`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/18 transition-colors text-xs font-bold tabular-nums"
            >
              <Flame
                className={`w-3.5 h-3.5 ${
                  studentGamification.racha.estadoVisual === 'EN_RIESGO'
                    ? 'text-amber-300'
                    : studentGamification.racha.rachaVigente > 0
                      ? 'text-orange-400'
                      : 'text-white/60'
                }`}
                aria-hidden="true"
              />
              <span>{studentGamification.racha.rachaVigente}d</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateMain('tienda')}
              aria-label={`Saldo: ${studentGamification.perfil.puntosSaldo} ALLEN POINTS`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/18 transition-colors text-xs font-bold tabular-nums"
            >
              <Coins className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
              <span>{studentGamification.perfil.puntosSaldo} pts</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => onNavigateMain('notificaciones')}
          aria-label={
            notifCount > 0
              ? `Ir a Notificaciones (${notifCount} sin leer)`
              : 'Ir a Notificaciones'
          }
          title="Notificaciones"
          className={`relative p-2 rounded-lg transition-colors ${
            !inCourseView && activeNav === 'notificaciones'
              ? 'bg-white/20 text-white'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          <Bell className="w-4 h-4" aria-hidden="true" />
          {notifCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#cf080d] text-white text-[10px] font-bold tabular-nums flex items-center justify-center">
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </button>

        {/* Menú de cuenta */}
        <div className="relative pl-1">
          <button
            type="button"
            onClick={() => setAccountMenuOpen((o) => !o)}
            aria-expanded={accountMenuOpen}
            aria-label={`Menú de cuenta de ${usuario.nombre}`}
            className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
          >
            <span className="w-8 h-8 rounded-full bg-[#cf080d] text-white text-xs font-bold flex items-center justify-center shrink-0">
              {initials || 'AA'}
            </span>
            <span className="hidden sm:inline text-sm font-medium text-white max-w-[150px] truncate">
              {usuario.nombre}
            </span>
          </button>

          {accountMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setAccountMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 mt-2 w-64 bg-white border border-[#d9d9d9] rounded-xl shadow-lg py-2 z-50 text-[#011f52]">
                <div className="px-4 py-2.5 border-b border-[#d9d9d9]/70">
                  <p className="text-sm font-semibold text-[#011f52] truncate">{usuario.nombre}</p>
                  <p className="text-xs text-slate-600 truncate">
                    {usuario.rol === 'ADMIN'
                      ? 'Administrador Total'
                      : usuario.rol === 'PROFESOR'
                        ? 'Docente'
                        : 'Estudiante'}
                    {usuario.email ? ` · ${usuario.email}` : ''}
                  </p>
                </div>

                <div className="py-1 border-b border-[#d9d9d9]/70">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onNavigateMain('configuracion');
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-[#011f52] hover:bg-[#f5f6f8] flex items-center gap-2.5"
                  >
                    <Settings className="w-4 h-4 text-[#011f52]" aria-hidden="true" />
                    <span>Configuración</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setAccountMenuOpen(false);
                      await onSwitchRole(isDocente ? 'ESTUDIANTE' : 'PROFESOR');
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-[#011f52] hover:bg-[#f5f6f8] flex items-center gap-2.5"
                  >
                    <RefreshCw className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
                    <span>{isDocente ? 'Ver como Estudiante' : 'Ver como Docente'}</span>
                  </button>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setAccountMenuOpen(false);
                      await onLogout();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-[#f5f6f8] flex items-center gap-2.5"
                  >
                    <LogOut className="w-4 h-4 text-slate-500" aria-hidden="true" />
                    <span>Cerrar sesión</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
