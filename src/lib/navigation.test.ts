import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COURSE_NAV_SECTIONS,
  getCourseNavForRole,
  getMainNavForRole,
  MAIN_NAV_ITEMS,
  resolveNavBadgeCount,
  sanitizeNavContext,
} from './navigation.ts';

test('consolidated global sidebar has zero duplicates with course-internal sections and groups cleanly', () => {
  const docenteGroups = getMainNavForRole('PROFESOR');
  assert.equal(docenteGroups.length, 3);
  assert.deepEqual(
    docenteGroups.map((g) => g.category.id),
    ['academico', 'gamificacion', 'cuenta'],
  );

  const docenteIds = docenteGroups.flatMap((g) => g.items.map((i) => i.id));
  assert.deepEqual(docenteIds, [
    'dashboard',
    'mis-cursos',
    'calendario',
    'entregas',
    'gamificacion',
    'tienda',
    'reportes',
    'configuracion',
  ]);
  // Notificaciones lives in TopNav bell and is not duplicated in sidebar
  assert.ok(!docenteIds.includes('notificaciones'));
  // Mascota is student-only
  assert.ok(!docenteIds.includes('mascota'));
});

test('student navigation includes Mi mascota, Rachas y retos, Tienda, and hides docente-only course sections', () => {
  const studentMainIds = getMainNavForRole('ESTUDIANTE').flatMap((g) => g.items.map((i) => i.id));
  assert.ok(studentMainIds.includes('mascota'));
  assert.ok(studentMainIds.includes('gamificacion'));
  assert.ok(studentMainIds.includes('tienda'));

  const studentCourseIds = getCourseNavForRole('ESTUDIANTE').map((s) => s.id);
  assert.deepEqual(studentCourseIds, [
    'resumen',
    'unidades',
    'tareas',
    'examenes',
    'calificaciones',
    'asistencia',
    'anuncios',
  ]);
  assert.ok(!studentCourseIds.includes('participantes'));
  assert.ok(!studentCourseIds.includes('entregas'));
  assert.ok(!studentCourseIds.includes('configuracion'));
});

test('course navigation contains 10 focused zero-overlap sections for docente', () => {
  const docenteCourseIds = getCourseNavForRole('PROFESOR').map((s) => s.id);
  assert.equal(docenteCourseIds.length, COURSE_NAV_SECTIONS.length);
  assert.equal(new Set(docenteCourseIds).size, docenteCourseIds.length);
});

test('student navigation hides duplicate global Mis tareas when inside active course and suppresses glued numeric badge', () => {
  const outsideCourseMain = getMainNavForRole('ESTUDIANTE', { inCourseView: false });
  const outsideAcademicLabels = outsideCourseMain[0].items.map((i) => i.displayLabel);
  assert.deepEqual(outsideAcademicLabels, ['Inicio', 'Mis cursos', 'Calendario', 'Mis tareas']);

  const insideCourseMain = getMainNavForRole('ESTUDIANTE', { inCourseView: true });
  const insideAcademicLabels = insideCourseMain[0].items.map((i) => i.displayLabel);
  assert.deepEqual(insideAcademicLabels, ['Inicio', 'Mis cursos', 'Calendario']);

  const entregas = MAIN_NAV_ITEMS.find((i) => i.id === 'entregas')!;
  const tienda = MAIN_NAV_ITEMS.find((i) => i.id === 'tienda')!;
  assert.equal(
    resolveNavBadgeCount(
      entregas,
      { entregasPendientes: 4, notificaciones: 1, canjesPendientes: 2 },
      'ESTUDIANTE',
    ),
    0,
  );
  assert.equal(
    resolveNavBadgeCount(
      entregas,
      { entregasPendientes: 4, notificaciones: 1, canjesPendientes: 2 },
      'PROFESOR',
    ),
    4,
  );
  assert.equal(
    resolveNavBadgeCount(
      tienda,
      { entregasPendientes: 4, notificaciones: 1, canjesPendientes: 2 },
      'PROFESOR',
    ),
    2,
  );
});

test('sanitizeNavContext enforces role permissions and drops stale course IDs', () => {
  const res = sanitizeNavContext(
    {
      activeNav: 'mascota',
      selectedCursoId: 'course-old',
      courseSection: 'participantes',
      sidebarCollapsed: true,
    },
    'PROFESOR',
    ['course-valid'],
  );
  assert.equal(res.activeNav, 'dashboard');
  assert.equal(res.selectedCursoId, null);
  assert.equal(res.courseSection, 'participantes');
  assert.equal(res.sidebarCollapsed, true);

  const studentRes = sanitizeNavContext(
    {
      activeNav: 'mascota',
      selectedCursoId: 'course-valid',
      courseSection: 'configuracion',
      sidebarCollapsed: false,
    },
    'ESTUDIANTE',
    ['course-valid'],
  );
  assert.equal(studentRes.activeNav, 'mascota');
  assert.equal(studentRes.courseSection, 'resumen');
});
