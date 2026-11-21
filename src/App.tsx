import React, { useCallback, useEffect, useState } from 'react';
import { LoginView } from './components/auth/LoginView';
import { CourseCatalog } from './components/cursos/CourseCatalog';
import { CourseWorkspace } from './components/cursos/CourseWorkspace';
import { GlobalModuleViews } from './components/layout/GlobalModuleViews';
import { SidebarNav } from './components/layout/SidebarNav';
import { TopNav } from './components/layout/TopNav';
import { StudentProgressView } from './components/participantes/StudentProgressView';
import { apiFetch } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import {
  getNavStorageKey,
  sanitizeNavContext,
  type CourseSectionId,
  type MainNavId,
} from './lib/navigation';
import type {
  AdminGamificationSummary,
  CursoItem,
  NavegacionResumenResponse,
  StudentGamificationState,
} from './types/aula';

function AulaShell() {
  const { usuario, tenant, cargando, entrarDemo, cerrarSesion } = useAuth();

  const [activeNav, setActiveNav] = useState<MainNavId>('dashboard');
  const [inCourseView, setInCourseView] = useState(false);
  const [selectedCursoId, setSelectedCursoId] = useState<string | null>(null);
  const [courseSection, setCourseSection] = useState<CourseSectionId>('resumen');
  const [pendingLessonId, setPendingLessonId] = useState<string | null>(null);
  const [courseLessonOpen, setCourseLessonOpen] = useState(false);
  const [resetLessonNonce, setResetLessonNonce] = useState(0);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [examFocusActive, setExamFocusActive] = useState(false);

  const [cursos, setCursos] = useState<CursoItem[]>([]);
  const [cursosCargando, setCursosCargando] = useState(false);
  const [cursosError, setCursosError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<NavegacionResumenResponse | null>(null);
  const [resumenCargando, setResumenCargando] = useState(false);

  const [studentGamification, setStudentGamification] =
    useState<StudentGamificationState | null>(null);
  const [adminGamification, setAdminGamification] =
    useState<AdminGamificationSummary | null>(null);

  const cargarDatosBase = useCallback(async () => {
    if (!usuario) return;
    setCursosCargando(true);
    setResumenCargando(true);
    setCursosError(null);
    try {
      const isStudent = usuario.rol === 'ESTUDIANTE';
      const endpoint = isStudent ? '/api/mis-cursos' : '/api/cursos';
      const [cursosData, resumenData, gamifData] = await Promise.all([
        apiFetch<{ cursos: CursoItem[] }>(endpoint),
        apiFetch<NavegacionResumenResponse>('/api/navegacion/resumen').catch(() => null),
        isStudent
          ? apiFetch<StudentGamificationState>('/api/gamificacion/mi-estado').catch(() => null)
          : apiFetch<AdminGamificationSummary>('/api/gamificacion/admin/resumen').catch(() => null),
      ]);

      setCursos(cursosData.cursos);
      if (resumenData) setResumen(resumenData);
      if (isStudent) {
        setStudentGamification(gamifData as StudentGamificationState | null);
        setAdminGamification(null);
      } else {
        setAdminGamification(gamifData as AdminGamificationSummary | null);
        setStudentGamification(null);
      }

      // Validar contexto persistido contra cursos reales
      const validIds = cursosData.cursos.map((c) => c.id);
      if (selectedCursoId && !validIds.includes(selectedCursoId)) {
        setSelectedCursoId(null);
        setInCourseView(false);
      }
    } catch (err) {
      setCursosError(err instanceof Error ? err.message : 'No se pudieron cargar los cursos.');
    } finally {
      setCursosCargando(false);
      setResumenCargando(false);
    }
  }, [usuario]);

  // Restaurar contexto de navegación al iniciar sesión
  useEffect(() => {
    if (!usuario) {
      setCursos([]);
      setResumen(null);
      setStudentGamification(null);
      setAdminGamification(null);
      setSelectedCursoId(null);
      setSelectedStudentId(null);
      setInCourseView(false);
      setActiveNav('dashboard');
      setCourseSection('resumen');
      return;
    }

    try {
      const raw = sessionStorage.getItem(getNavStorageKey(usuario.sub, usuario.rol));
      if (raw) {
        const parsed = sanitizeNavContext(JSON.parse(raw), usuario.rol);
        setActiveNav(parsed.activeNav);
        setSelectedCursoId(parsed.selectedCursoId);
        setCourseSection(parsed.courseSection);
        setSidebarCollapsed(parsed.sidebarCollapsed);
        setInCourseView(Boolean(parsed.selectedCursoId && parsed.activeNav === 'mis-cursos'));
      } else {
        setActiveNav('dashboard');
        setSelectedCursoId(null);
        setInCourseView(false);
        setCourseSection('resumen');
      }
    } catch {
      setActiveNav('dashboard');
    }

    cargarDatosBase();
  }, [usuario, cargarDatosBase]);

  // Persistir contexto de navegación
  useEffect(() => {
    if (!usuario) return;
    try {
      sessionStorage.setItem(
        getNavStorageKey(usuario.sub, usuario.rol),
        JSON.stringify({
          activeNav: inCourseView ? 'mis-cursos' : activeNav,
          selectedCursoId: inCourseView ? selectedCursoId : null,
          courseSection,
          sidebarCollapsed,
        }),
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [usuario, activeNav, inCourseView, selectedCursoId, courseSection, sidebarCollapsed]);

  if (cargando) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center text-sm text-[#011f52] font-medium">
        Iniciando ALLEN Aula...
      </div>
    );
  }

  if (!usuario) {
    return <LoginView />;
  }

  const selectedCurso = selectedCursoId
    ? cursos.find((c) => c.id === selectedCursoId) || null
    : null;

  const handleSelectCurso = (
    cursoId: string,
    section: CourseSectionId = 'resumen',
    lessonId: string | null = null,
  ) => {
    setSelectedCursoId(cursoId);
    setSelectedStudentId(null);
    setActiveNav('mis-cursos');
    setCourseSection(section);
    setPendingLessonId(lessonId);
    setInCourseView(true);
  };

  const handleSelectMainNav = (nav: MainNavId) => {
    setSelectedStudentId(null);
    setInCourseView(false);
    setActiveNav(nav);
  };

  const handleSelectCourseSection = (section: CourseSectionId) => {
    setSelectedStudentId(null);
    setCourseSection(section);
    setInCourseView(true);
  };

  const handleExitCourse = () => {
    setSelectedStudentId(null);
    setCourseLessonOpen(false);
    setInCourseView(false);
    setActiveNav('mis-cursos');
  };

  const handleBackInCourse = () => {
    if (courseLessonOpen) {
      setResetLessonNonce((n) => n + 1);
      setCourseLessonOpen(false);
      return;
    }
    if (courseSection !== 'resumen') {
      setCourseSection('resumen');
      return;
    }
    handleExitCourse();
  };

  const handleSelectStudent = (estudianteId: string) => {
    setSelectedStudentId(estudianteId);
  };

  const handleSwitchRole = async (rol: 'PROFESOR' | 'ESTUDIANTE') => {
    setSelectedCursoId(null);
    setSelectedStudentId(null);
    setInCourseView(false);
    setActiveNav('dashboard');
    setCourseSection('resumen');
    await entrarDemo(rol);
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col">
      {/* A. BARRA SUPERIOR (#011f52) — se oculta automáticamente durante modo examen */}
      {!examFocusActive && (
        <TopNav
          usuario={usuario}
          activeNav={activeNav}
          inCourseView={inCourseView && Boolean(selectedCurso)}
          selectedCurso={selectedCurso}
          activeCourseSection={courseSection}
          hasOpenLesson={courseLessonOpen}
          badges={resumen?.badges || null}
          studentGamification={studentGamification}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebarCollapse={() => setSidebarCollapsed((c) => !c)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNavigateMain={handleSelectMainNav}
          onBackInCourse={handleBackInCourse}
          onSwitchRole={handleSwitchRole}
          onLogout={cerrarSesion}
        />
      )}

      {/* B. PANEL IZQUIERDO (2 niveles) + C. ÁREA CENTRAL + D. PANEL DERECHO */}
      <div className="flex flex-1 min-w-0">
        {!examFocusActive && (
          <SidebarNav
            usuario={usuario}
            activeNav={activeNav}
            inCourseView={inCourseView && Boolean(selectedCurso)}
            selectedCurso={selectedCurso}
            activeCourseSection={courseSection}
            badges={resumen?.badges || null}
            experienceMode={studentGamification?.perfil.perfilExperiencia || 'JUVENIL'}
            collapsed={sidebarCollapsed}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
            onSelectMainNav={handleSelectMainNav}
            onSelectCourseSection={handleSelectCourseSection}
            onExitCourse={handleExitCourse}
          />
        )}

        <div className="flex-1 min-w-0">
          {selectedStudentId ? (
            <StudentProgressView
              estudianteId={selectedStudentId}
              onBack={() => setSelectedStudentId(null)}
            />
          ) : inCourseView && selectedCurso ? (
            <CourseWorkspace
              cursoId={selectedCurso.id}
              usuario={usuario}
              activeSection={courseSection}
              initialLessonId={pendingLessonId}
              resetLessonNonce={resetLessonNonce}
              enrolledCount={selectedCurso.estadisticas?.inscritos ?? 0}
              pendingSubmissions={
                resumen?.entregasPendientesPorCurso?.[selectedCurso.id] ?? 0
              }
              onSectionChange={handleSelectCourseSection}
              onClearInitialLesson={() => setPendingLessonId(null)}
              onLessonOpenChange={setCourseLessonOpen}
              onExamFocusChange={setExamFocusActive}
              onBackToCatalog={handleExitCourse}
              onSelectStudent={handleSelectStudent}
              onCourseListChanged={cargarDatosBase}
            />
          ) : activeNav === 'mis-cursos' ? (
            <CourseCatalog
              usuario={usuario}
              tenant={tenant}
              cursos={cursos}
              cargando={cursosCargando}
              error={cursosError}
              onSelectCurso={(id) => handleSelectCurso(id, 'resumen')}
              onRefresh={cargarDatosBase}
            />
          ) : (
            <GlobalModuleViews
              activeNav={activeNav}
              usuario={usuario}
              tenant={tenant}
              cursos={cursos}
              resumen={resumen}
              resumenCargando={resumenCargando}
              studentGamification={studentGamification}
              adminGamification={adminGamification}
              onRefreshAll={cargarDatosBase}
              onSelectCurso={handleSelectCurso}
              onNavigateMain={handleSelectMainNav}
              onSelectStudent={handleSelectStudent}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AulaShell />
    </AuthProvider>
  );
}
