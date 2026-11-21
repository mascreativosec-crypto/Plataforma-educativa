import type { AulaRol } from '../types/aula';

/**
 * Navegación global consolidada (Nivel 1):
 * Elimina módulos duplicados con la navegación interna del curso y accesos redundantes.
 * - Notificaciones se abre directamente desde la campana de la barra superior (sin duplicarse en el sidebar).
 * - Participantes, Asistencia, Calificaciones, Evaluaciones y Anuncios viven en su contexto de curso.
 */
export type MainNavId =
  | 'dashboard'
  | 'mis-cursos'
  | 'calendario'
  | 'entregas'
  | 'gamificacion'
  | 'mascota'
  | 'tienda'
  | 'reportes'
  | 'admin-usuarios'
  | 'notificaciones'
  | 'configuracion';

/**
 * Navegación contextual interna del curso (Nivel 2):
 * Sin solapamientos entre Actividades/Tareas ni accesos de relleno.
 */
export type CourseSectionId =
  | 'resumen'
  | 'unidades'
  | 'tareas'
  | 'entregas'
  | 'examenes'
  | 'calificaciones'
  | 'asistencia'
  | 'anuncios'
  | 'participantes'
  | 'configuracion';

export type MainNavCategoryId = 'academico' | 'gamificacion' | 'cuenta';

export interface MainNavItemDef {
  id: MainNavId;
  label: string;
  studentLabel?: string;
  category: MainNavCategoryId;
  roles: AulaRol[];
  badgeKey?: 'entregasPendientes' | 'canjesPendientes' | 'notificaciones';
  hiddenInSidebar?: boolean;
}

export interface CourseSectionDef {
  id: CourseSectionId;
  label: string;
  studentLabel?: string;
  roles: AulaRol[];
}

export interface NavCategoryMeta {
  id: MainNavCategoryId;
  label: string;
}

export const MAIN_NAV_CATEGORIES: NavCategoryMeta[] = [
  { id: 'academico', label: 'MENÚ PRINCIPAL' },
  { id: 'gamificacion', label: 'GAMIFICACIÓN Y PROGRESO' },
  { id: 'cuenta', label: 'CUENTA' },
];

export const MAIN_NAV_ITEMS: MainNavItemDef[] = [
  // ACADÉMICO (4 ítems esenciales sin duplicar secciones internas del curso)
  {
    id: 'dashboard',
    label: 'Inicio',
    category: 'academico',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
  },
  {
    id: 'mis-cursos',
    label: 'Mis cursos',
    category: 'academico',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
  },
  {
    id: 'calendario',
    label: 'Calendario',
    category: 'academico',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
  },
  {
    id: 'entregas',
    label: 'Entregas por revisar',
    studentLabel: 'Mis tareas',
    category: 'academico',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
    badgeKey: 'entregasPendientes',
  },

  // GAMIFICACIÓN Y PROGRESO
  {
    id: 'gamificacion',
    label: 'Gamificación',
    studentLabel: 'Rachas y retos',
    category: 'gamificacion',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
  },
  {
    id: 'mascota',
    label: 'Mi mascota',
    category: 'gamificacion',
    roles: ['ESTUDIANTE'],
  },
  {
    id: 'tienda',
    label: 'Tienda de canjes',
    category: 'gamificacion',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
    badgeKey: 'canjesPendientes',
  },
  {
    id: 'reportes',
    label: 'Analítica',
    studentLabel: 'Mi progreso',
    category: 'gamificacion',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
  },

  // CUENTA Y ADMINISTRACIÓN
  {
    id: 'admin-usuarios',
    label: 'Administración',
    category: 'cuenta',
    roles: ['ADMIN'],
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    category: 'cuenta',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
  },
  {
    id: 'notificaciones',
    label: 'Notificaciones',
    category: 'cuenta',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
    badgeKey: 'notificaciones',
    hiddenInSidebar: true,
  },
];

export const COURSE_NAV_SECTIONS: CourseSectionDef[] = [
  { id: 'resumen', label: 'Resumen', roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'] },
  { id: 'unidades', label: 'Unidades y lecciones', roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'] },
  { id: 'tareas', label: 'Tareas', studentLabel: 'Mis tareas', roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'] },
  { id: 'entregas', label: 'Calificar entregas', roles: ['ADMIN', 'PROFESOR'] },
  { id: 'examenes', label: 'Exámenes', roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'] },
  {
    id: 'calificaciones',
    label: 'Calificaciones',
    studentLabel: 'Mis notas',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
  },
  {
    id: 'asistencia',
    label: 'Asistencia',
    studentLabel: 'Mi asistencia',
    roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'],
  },
  { id: 'anuncios', label: 'Anuncios', roles: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'] },
  { id: 'participantes', label: 'Participantes', roles: ['ADMIN', 'PROFESOR'] },
  { id: 'configuracion', label: 'Ajustes del curso', roles: ['ADMIN', 'PROFESOR'] },
];

export interface NavBadgeCounts {
  entregasPendientes: number;
  notificaciones: number;
  actividadesPendientes?: number;
  canjesPendientes?: number;
}

export function getMainNavForRole(
  rol: AulaRol,
  options?: { inCourseView?: boolean },
): Array<{
  category: NavCategoryMeta;
  items: Array<MainNavItemDef & { displayLabel: string }>;
}> {
  const hideGlobalTasksInCourse = rol === 'ESTUDIANTE' && Boolean(options?.inCourseView);

  return MAIN_NAV_CATEGORIES.map((category) => {
    const items = MAIN_NAV_ITEMS.filter(
      (item) =>
        item.category === category.id &&
        item.roles.includes(rol) &&
        !item.hiddenInSidebar &&
        !(hideGlobalTasksInCourse && item.id === 'entregas'),
    ).map((item) => ({
      ...item,
      displayLabel: rol === 'ESTUDIANTE' && item.studentLabel ? item.studentLabel : item.label,
    }));
    return { category, items };
  }).filter((group) => group.items.length > 0);
}

export function getCourseNavForRole(
  rol: AulaRol,
): Array<CourseSectionDef & { displayLabel: string }> {
  return COURSE_NAV_SECTIONS.filter((sec) => sec.roles.includes(rol)).map((sec) => ({
    ...sec,
    displayLabel: rol === 'ESTUDIANTE' && sec.studentLabel ? sec.studentLabel : sec.label,
  }));
}

export function resolveNavBadgeCount(
  item: MainNavItemDef,
  counts: NavBadgeCounts | null | undefined,
  rol?: AulaRol,
): number {
  if (!item.badgeKey || !counts) return 0;
  // Evitar mostrar contadores pegados como "Mis tareas1" en el menú del estudiante
  if (rol === 'ESTUDIANTE' && item.id === 'entregas') return 0;
  const raw = counts[item.badgeKey] ?? 0;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
}

export function getRoleDisplayLabel(rol: AulaRol): string {
  if (rol === 'ADMIN') return 'ADMIN';
  if (rol === 'PROFESOR') return 'DOCENTE';
  return 'ESTUDIANTE';
}

export interface PersistedNavContext {
  activeNav: MainNavId;
  selectedCursoId: string | null;
  courseSection: CourseSectionId;
  sidebarCollapsed: boolean;
}

const DEFAULT_NAV_CONTEXT: PersistedNavContext = {
  activeNav: 'dashboard',
  selectedCursoId: null,
  courseSection: 'resumen',
  sidebarCollapsed: false,
};

export function sanitizeNavContext(
  raw: unknown,
  rol: AulaRol,
  validCursoIds?: string[],
): PersistedNavContext {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NAV_CONTEXT };
  const obj = raw as Record<string, unknown>;

  const allowedNavIds = new Set(
    MAIN_NAV_ITEMS.filter((i) => i.roles.includes(rol)).map((i) => i.id),
  );
  const allowedCourseSections = new Set(
    COURSE_NAV_SECTIONS.filter((s) => s.roles.includes(rol)).map((s) => s.id),
  );

  const activeNav =
    typeof obj.activeNav === 'string' && allowedNavIds.has(obj.activeNav as MainNavId)
      ? (obj.activeNav as MainNavId)
      : 'dashboard';

  let selectedCursoId =
    typeof obj.selectedCursoId === 'string' && obj.selectedCursoId.length > 0
      ? obj.selectedCursoId
      : null;

  if (selectedCursoId && validCursoIds && !validCursoIds.includes(selectedCursoId)) {
    selectedCursoId = null;
  }

  const courseSection =
    typeof obj.courseSection === 'string' &&
    allowedCourseSections.has(obj.courseSection as CourseSectionId)
      ? (obj.courseSection as CourseSectionId)
      : 'resumen';

  const sidebarCollapsed = Boolean(obj.sidebarCollapsed);

  return {
    activeNav,
    selectedCursoId,
    courseSection,
    sidebarCollapsed,
  };
}

export function getNavStorageKey(userSub: string, rol: AulaRol): string {
  return `allen_aula_nav_v2_${rol}_${userSub}`;
}
