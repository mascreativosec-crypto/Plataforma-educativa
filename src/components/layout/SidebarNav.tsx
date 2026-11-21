import React, { useState } from 'react';
import {
  ArrowLeft,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Calendar,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  Home,
  Inbox,
  LayoutGrid,
  Megaphone,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  getCourseNavForRole,
  getMainNavForRole,
  getRoleDisplayLabel,
  resolveNavBadgeCount,
  type CourseSectionId,
  type MainNavId,
  type NavBadgeCounts,
} from '../../lib/navigation';
import type { AulaUsuario, CursoItem, LearningExperienceMode } from '../../types/aula';

interface SidebarNavProps {
  usuario: AulaUsuario;
  activeNav: MainNavId;
  inCourseView: boolean;
  selectedCurso: CursoItem | null;
  activeCourseSection: CourseSectionId;
  badges: NavBadgeCounts | null;
  experienceMode?: LearningExperienceMode;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectMainNav: (nav: MainNavId) => void;
  onSelectCourseSection: (section: CourseSectionId) => void;
  onExitCourse: () => void;
}

function MainNavIcon({
  id,
  className,
  experienceMode = 'JUVENIL',
}: {
  id: MainNavId;
  className?: string;
  experienceMode?: LearningExperienceMode;
}) {
  const props = { className: className || 'w-4 h-4 shrink-0', 'aria-hidden': true as const };
  switch (id) {
    case 'dashboard':
      return <LayoutGrid {...props} />;
    case 'mis-cursos':
      return <BookOpen {...props} />;
    case 'calendario':
      return <Calendar {...props} />;
    case 'entregas':
      return <Inbox {...props} />;
    case 'gamificacion':
      return <Trophy {...props} />;
    case 'mascota':
      return experienceMode === 'PROFESIONAL' ? <Briefcase {...props} /> : <Sparkles {...props} />;
    case 'tienda':
      return <ShoppingBag {...props} />;
    case 'reportes':
      return <BarChart3 {...props} />;
    case 'admin-usuarios':
      return <ShieldCheck {...props} />;
    case 'notificaciones':
      return <Bell {...props} />;
    case 'configuracion':
      return <Settings {...props} />;
  }
}

function CourseSectionIcon({ id, className }: { id: CourseSectionId; className?: string }) {
  const props = { className: className || 'w-4 h-4 shrink-0', 'aria-hidden': true as const };
  switch (id) {
    case 'resumen':
      return <Home {...props} />;
    case 'participantes':
      return <Users {...props} />;
    case 'unidades':
      return <BookOpen {...props} />;
    case 'tareas':
      return <ClipboardCheck {...props} />;
    case 'entregas':
      return <Inbox {...props} />;
    case 'examenes':
      return <FileCheck2 {...props} />;
    case 'calificaciones':
      return <GraduationCap {...props} />;
    case 'asistencia':
      return <CalendarCheck2 {...props} />;
    case 'anuncios':
      return <Megaphone {...props} />;
    case 'configuracion':
      return <Settings {...props} />;
  }
}

export function SidebarNav({
  usuario,
  activeNav,
  inCourseView,
  selectedCurso,
  activeCourseSection,
  badges,
  experienceMode = 'JUVENIL',
  collapsed,
  mobileOpen,
  onCloseMobile,
  onSelectMainNav,
  onSelectCourseSection,
  onExitCourse,
}: SidebarNavProps) {
  const [courseBoxExpanded, setCourseBoxExpanded] = useState(true);
  const groups = getMainNavForRole(usuario.rol, { inCourseView });
  const courseSections = getCourseNavForRole(usuario.rol);
  const roleLabel = getRoleDisplayLabel(usuario.rol);

  const renderSidebarBody = (isMobileDrawer: boolean) => {
    const isSlim = !isMobileDrawer && collapsed;

    return (
      <div className="flex flex-col h-full bg-white">
        {/* Encabezado institucional en drawer móvil */}
        {isMobileDrawer && (
          <div className="h-14 px-4 bg-[#011f52] text-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="font-display font-bold text-base tracking-tight whitespace-nowrap">
                ALLEN Aula
              </span>
              <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded bg-white/15 text-white whitespace-nowrap">
                {roleLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Cerrar menú lateral"
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        )}

        <nav
          aria-label="Navegación principal del aula"
          className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4"
        >
          {groups.map((group, groupIndex) => (
            <div
              key={group.category.id}
              className={groupIndex > 0 ? 'pt-3 border-t border-[#d9d9d9]' : ''}
            >
              {!isSlim && (
                <p className="px-2.5 pb-1.5 text-[11px] font-bold tracking-wider text-[#011f52]/70">
                  {group.category.label}
                </p>
              )}

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = !inCourseView && activeNav === item.id;
                  const isCoursesParentActive = inCourseView && item.id === 'mis-cursos';
                  const badgeCount = resolveNavBadgeCount(item, badges, usuario.rol);
                  const navLabel =
                    item.id === 'mascota' && experienceMode === 'PROFESIONAL'
                      ? 'Enfoque Pro'
                      : item.displayLabel;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        title={isSlim ? navLabel : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => {
                          onSelectMainNav(item.id);
                          if (isMobileDrawer) onCloseMobile();
                        }}
                        className={`w-full flex items-center gap-3 rounded-lg transition-colors text-sm ${
                          isSlim ? 'justify-center px-2 py-2.5' : 'px-2.5 py-2'
                        } ${
                          isActive
                            ? 'bg-[#011f52] text-white font-semibold'
                            : isCoursesParentActive
                              ? 'bg-[#011f52]/8 text-[#011f52] font-semibold'
                              : 'text-[#011f52]/85 hover:bg-[#f5f6f8] hover:text-[#011f52] font-medium'
                        }`}
                      >
                        <MainNavIcon
                          id={item.id}
                          experienceMode={experienceMode}
                          className={`w-[18px] h-[18px] shrink-0 ${
                            isActive ? 'text-white' : 'text-[#011f52]'
                          }`}
                        />

                        {!isSlim && (
                          <>
                            <span className="truncate flex-1 text-left">{navLabel}</span>
                            {badgeCount > 0 && (
                              <span
                                aria-label={`${badgeCount} pendientes`}
                                className={`min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums inline-flex items-center justify-center shrink-0 ${
                                  isActive
                                    ? 'bg-[#cf080d] text-white'
                                    : item.id === 'entregas' || item.id === 'tienda'
                                      ? 'bg-[#cf080d]/12 text-[#cf080d]'
                                      : 'bg-[#011f52]/10 text-[#011f52]'
                                }`}
                              >
                                {badgeCount}
                              </span>
                            )}
                          </>
                        )}
                      </button>

                      {/* NAVEGACIÓN CONTEXTUAL DEL CURSO (Nivel 2) integrada bajo Mis cursos */}
                      {item.id === 'mis-cursos' && inCourseView && selectedCurso && !isSlim && (
                        <div
                          aria-label={`Navegación contextual del curso ${selectedCurso.nombre}`}
                          className="mt-2 mb-2 rounded-xl border border-[#cf080d]/45 bg-[#ffffff] p-2 shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                            <button
                              type="button"
                              aria-expanded={courseBoxExpanded}
                              onClick={() => setCourseBoxExpanded((e) => !e)}
                              className="flex items-center gap-1.5 min-w-0 text-left flex-1 text-[#011f52] hover:text-[#cf080d] transition-colors"
                            >
                              {courseBoxExpanded ? (
                                <ChevronDown className="w-4 h-4 shrink-0 text-[#011f52]" aria-hidden="true" />
                              ) : (
                                <ChevronRight className="w-4 h-4 shrink-0 text-[#011f52]" aria-hidden="true" />
                              )}
                              <span className="font-display text-xs font-bold truncate">
                                {selectedCurso.nombre}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onExitCourse();
                                if (isMobileDrawer) onCloseMobile();
                              }}
                              title="Volver a Mis cursos"
                              aria-label="Volver a Mis cursos"
                              className="p-1 rounded hover:bg-[#f5f6f8] text-[#011f52]/70 hover:text-[#cf080d] shrink-0"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>

                          {courseBoxExpanded && (
                            <div className="mt-1 pt-1.5 border-t border-[#d9d9d9]/70">
                              <p className="px-2 pb-1 text-[10px] font-bold tracking-wider text-[#011f52]/65">
                                NAVEGACIÓN DEL CURSO
                              </p>
                              <ul className="space-y-0.5">
                                {courseSections.map((sec) => {
                                  const secActive = activeCourseSection === sec.id;
                                  return (
                                    <li key={sec.id}>
                                      <button
                                        type="button"
                                        aria-current={secActive ? 'page' : undefined}
                                        onClick={() => {
                                          onSelectCourseSection(sec.id);
                                          if (isMobileDrawer) onCloseMobile();
                                        }}
                                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                                          secActive
                                            ? 'bg-[#cf080d] text-white font-semibold'
                                            : 'text-[#011f52]/85 hover:bg-[#f5f6f8] hover:text-[#011f52] font-medium'
                                        }`}
                                      >
                                        <CourseSectionIcon
                                          id={sec.id}
                                          className={`w-3.5 h-3.5 shrink-0 ${
                                            secActive ? 'text-white' : 'text-[#011f52]/80'
                                          }`}
                                        />
                                        <span className="truncate flex-1 text-left">
                                          {sec.displayLabel}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {!isSlim && (
          <div className="px-3.5 py-2.5 border-t border-[#d9d9d9] bg-[#f5f6f8]/60 text-[11px] text-[#011f52]/70 flex items-center justify-between gap-2 shrink-0">
            <span className="truncate font-medium">
              {inCourseView ? 'Contexto de curso activo' : 'All American English · ALLEN'}
            </span>
            <Award className="w-3.5 h-3.5 text-[#011f52]/50 shrink-0" aria-hidden="true" />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Sidebar fijo colapsable en escritorio */}
      <aside
        aria-label="Menú lateral de ALLEN Aula"
        className={`hidden lg:flex flex-col shrink-0 border-r border-[#d9d9d9] bg-white transition-[width] duration-200 sticky top-14 h-[calc(100vh-3.5rem)] ${
          collapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        {renderSidebarBody(false)}
      </aside>

      {/* Cajón desplegable en móvil y tablet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#011f52]/45"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            aria-label="Menú móvil de ALLEN Aula"
            className="relative w-72 max-w-[85vw] h-full border-r border-[#d9d9d9] bg-white z-10 shadow-xl"
          >
            {renderSidebarBody(true)}
          </aside>
        </div>
      )}
    </>
  );
}
