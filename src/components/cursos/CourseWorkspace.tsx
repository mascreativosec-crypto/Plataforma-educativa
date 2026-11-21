import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  HelpCircle,
  Megaphone,
  MessageSquareHeart,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiFetch, formatGuayaquilDate, formatGuayaquilDateTime } from '../../lib/api';
import { getCourseNavForRole, type CourseSectionId } from '../../lib/navigation';
import { getNivelInfo } from '../../lib/niveles';
import type {
  AulaUsuario,
  CursoDetalleResponse,
  LeccionDetallada,
  QuizItem,
} from '../../types/aula';
import { AttendanceTab } from '../asistencia/AttendanceTab';
import { GradebookTab } from '../calificaciones/GradebookTab';
import { ExamBuilderModal } from '../evaluaciones/ExamBuilderModal';
import { SubmissionsTab } from '../evaluaciones/SubmissionsTab';
import { AiAssistantDrawer, type QuickAiAction } from '../ia/AiAssistantDrawer';
import { UnsavedChangesDialog } from '../layout/UnsavedChangesDialog';
import { ParticipantsTab } from '../participantes/ParticipantsTab';
import { ActivityPickerModal, type ActivityPickerChoice } from './ActivityPickerModal';
import {
  CourseExamsSection,
  CourseSettingsSection,
  CourseSummarySection,
} from './CourseExtraSections';
import { LessonDetailPanel, type LessonInitialAction } from './LessonDetailPanel';
import { RightBlocks } from './RightBlocks';
import { SimpleRichTextEditor } from './SimpleRichTextEditor';

interface CourseWorkspaceProps {
  cursoId: string;
  usuario: AulaUsuario;
  activeSection: CourseSectionId;
  initialLessonId?: string | null;
  resetLessonNonce?: number;
  enrolledCount?: number;
  pendingSubmissions?: number;
  onSectionChange: (section: CourseSectionId) => void;
  onClearInitialLesson?: () => void;
  onLessonOpenChange?: (isOpen: boolean) => void;
  onExamFocusChange?: (active: boolean) => void;
  onBackToCatalog: () => void;
  onSelectStudent: (estudianteId: string) => void;
  onCourseListChanged: () => Promise<void>;
}

export function CourseWorkspace({
  cursoId,
  usuario,
  activeSection,
  initialLessonId = null,
  resetLessonNonce = 0,
  enrolledCount = 0,
  pendingSubmissions = 0,
  onSectionChange,
  onClearInitialLesson,
  onLessonOpenChange,
  onExamFocusChange,
  onBackToCatalog,
  onSelectStudent,
  onCourseListChanged,
}: CourseWorkspaceProps) {
  const isDocente = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';

  const [detail, setDetail] = useState<CursoDetalleResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(initialLessonId);
  const [lessonInitialAction, setLessonInitialAction] = useState<LessonInitialAction>(null);
  const [pendingExamQuizId, setPendingExamQuizId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [collapsedUnits, setCollapsedUnits] = useState<Record<string, boolean>>({});

  // Modales Moodle 5.0 + IA
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [pickerTargetUnitId, setPickerTargetUnitId] = useState<string | null>(null);
  const [showExamModal, setShowExamModal] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<QuizItem | null>(null);
  const [discardTarget, setDiscardTarget] = useState<'task' | 'greeting' | 'anuncio' | null>(null);

  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiQuickAction, setAiQuickAction] = useState<{
    accion: QuickAiAction;
    nonce: number;
  } | null>(null);
  const [examLockedAi, setExamLockedAi] = useState(false);

  const handleExamFocusChange = (active: boolean) => {
    setExamLockedAi(active);
    if (active) {
      setAiDrawerOpen(false);
      setLeftOpen(false);
    }
    onExamFocusChange?.(active);
  };

  const handleLaunchExamInModule = (quizId: string) => {
    setSelectedLessonId(null);
    setPendingExamQuizId(quizId);
    onSectionChange('examenes');
  };

  // Formularios inline en Modo edición
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnitTitle, setNewUnitTitle] = useState('');
  const [newUnitDesc, setNewUnitDesc] = useState('');

  const [addingLessonUnitId, setAddingLessonUnitId] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonContent, setNewLessonContent] = useState('');
  const [newLessonPublished, setNewLessonPublished] = useState(true);

  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTipo, setNewTaskTipo] = useState<'GENERAL' | 'WRITING'>('GENERAL');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskInst, setNewTaskInst] = useState('');
  const [newTaskLeccionId, setNewTaskLeccionId] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskMinWords, setNewTaskMinWords] = useState(60);
  const [newTaskMaxWords, setNewTaskMaxWords] = useState(120);

  // Anuncio / Greeting (Saludo de bienvenida)
  const [showAddGreeting, setShowAddGreeting] = useState(false);
  const [newAnuncioTitulo, setNewAnuncioTitulo] = useState('');
  const [newAnuncioMsg, setNewAnuncioMsg] = useState('');
  const [newAnuncioEsSaludo, setNewAnuncioEsSaludo] = useState(false);
  const [aiDraftingGreeting, setAiDraftingGreeting] = useState(false);

  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadDetail = async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await apiFetch<CursoDetalleResponse>(`/api/cursos/${cursoId}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el curso.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    setSelectedLessonId(initialLessonId || null);
    setExamLockedAi(false);
    loadDetail();
  }, [cursoId]);

  useEffect(() => {
    if (initialLessonId) {
      setSelectedLessonId(initialLessonId);
      onClearInitialLesson?.();
    }
  }, [initialLessonId]);

  useEffect(() => {
    if (activeSection !== 'unidades') {
      setSelectedLessonId(null);
    }
  }, [activeSection]);

  useEffect(() => {
    if (resetLessonNonce > 0) {
      setSelectedLessonId(null);
    }
  }, [resetLessonNonce]);

  useEffect(() => {
    onLessonOpenChange?.(Boolean(selectedLessonId));
  }, [selectedLessonId, onLessonOpenChange]);

  const allLessons: LeccionDetallada[] =
    detail?.unidades.flatMap((u) => u.lecciones) || [];
  const selectedLesson = selectedLessonId
    ? allLessons.find((l) => l.id === selectedLessonId) || null
    : null;

  const pinnedGreeting = detail?.anuncios.find((a) => a.esSaludo) || null;

  const handleOpenAiAction = (accion: QuickAiAction) => {
    if (examLockedAi) return;
    setAiQuickAction({ accion, nonce: Date.now() });
    setAiDrawerOpen(true);
  };

  const handlePickerSelect = (choice: ActivityPickerChoice) => {
    const targetUnit =
      detail?.unidades.find((u) => u.id === pickerTargetUnitId) || detail?.unidades[0];
    const firstLesson = targetUnit?.lecciones[0] || allLessons[0];

    if (choice === 'leccion') {
      onSectionChange('unidades');
      setEditMode(true);
      if (targetUnit) {
        setCollapsedUnits((prev) => ({ ...prev, [targetUnit.id]: false }));
        setAddingLessonUnitId(targetUnit.id);
      } else {
        setShowAddUnit(true);
      }
      return;
    }

    if (choice === 'tarea' || choice === 'writing') {
      onSectionChange('unidades');
      setNewTaskTipo(choice === 'writing' ? 'WRITING' : 'GENERAL');
      setNewTaskLeccionId(firstLesson?.id || '');
      setShowAddTask(true);
      return;
    }

    if (choice === 'saludo') {
      onSectionChange('unidades');
      setNewAnuncioEsSaludo(true);
      setShowAddGreeting(true);
      return;
    }

    if (choice === 'examen') {
      if (allLessons.length === 0) {
        setError('Crea al menos una lección antes de agregar un examen cronometrado.');
        return;
      }
      setEditingQuiz(null);
      setShowExamModal(true);
      return;
    }

    // Recursos vinculados a una lección (Google Drive, Archivo, Enlace)
    if (!firstLesson) {
      setError('Crea primero una lección para adjuntar recursos audiovisuales o de Google Drive.');
      return;
    }
    onSectionChange('unidades');
    setSelectedLessonId(firstLesson.id);
    setLessonInitialAction(
      choice === 'google_drive'
        ? 'material_drive'
        : choice === 'archivo'
          ? 'material_file'
          : 'material_link',
    );
  };

  const handlePublishCourse = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/cursos/${cursoId}/publicar`, { method: 'POST' });
      setStatusMsg('Curso publicado y visible para los estudiantes inscritos.');
      await loadDetail();
      await onCourseListChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el curso.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newUnitTitle.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/cursos/${cursoId}/unidades`, {
        method: 'POST',
        body: JSON.stringify({
          titulo: newUnitTitle.trim(),
          descripcion: newUnitDesc.trim(),
        }),
      });
      setNewUnitTitle('');
      setNewUnitDesc('');
      setShowAddUnit(false);
      setStatusMsg('Unidad agregada al curso.');
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la unidad.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUnit = async (unidadId: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/unidades/${unidadId}`, { method: 'DELETE' });
      setStatusMsg('Unidad eliminada.');
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la unidad.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateLesson = async (e: React.FormEvent, unidadId: string) => {
    e.preventDefault();
    if (newLessonTitle.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = newLessonContent.trim();
      const htmlContent = trimmed
        ? /<[a-z][\s\S]*>/i.test(trimmed)
          ? trimmed
          : `<p>${trimmed}</p>`
        : '<p>Contenido de la lección.</p>';
      await apiFetch(`/api/unidades/${unidadId}/lecciones`, {
        method: 'POST',
        body: JSON.stringify({
          titulo: newLessonTitle.trim(),
          contenido: htmlContent,
          publicada: newLessonPublished,
        }),
      });
      setNewLessonTitle('');
      setNewLessonContent('');
      setAddingLessonUnitId(null);
      setStatusMsg('Lección creada correctamente.');
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la lección.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/tareas', {
        method: 'POST',
        body: JSON.stringify({
          cursoId,
          leccionId: newTaskLeccionId || null,
          titulo: newTaskTitle.trim(),
          instrucciones: newTaskInst.trim(),
          tipoTarea: newTaskTipo,
          nivelMcer: detail?.curso.nivel || 'A2',
          minPalabras: newTaskTipo === 'WRITING' ? newTaskMinWords : null,
          maxPalabras: newTaskTipo === 'WRITING' ? newTaskMaxWords : null,
          venceEn: newTaskDue || undefined,
          publicada: true,
        }),
      });
      setNewTaskTitle('');
      setNewTaskInst('');
      setNewTaskDue('');
      setShowAddTask(false);
      setStatusMsg(
        newTaskTipo === 'WRITING'
          ? 'Actividad de redacción creada y publicada.'
          : 'Tarea creada y publicada.',
      );
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea.');
    } finally {
      setBusy(false);
    }
  };

  const handleAiDraftGreeting = async () => {
    if (!detail) return;
    setAiDraftingGreeting(true);
    setError(null);
    try {
      const res = await apiFetch<{ respuesta: string }>('/api/ia/accion-leccion', {
        method: 'POST',
        body: JSON.stringify({
          accion: 'saludo',
          cursoNombre: detail.curso.nombre,
          nivelMcer: detail.curso.nivel || 'A2',
          titulo: detail.curso.nombre,
          contenido: detail.curso.descripcion || '',
        }),
      });
      if (!newAnuncioTitulo.trim()) {
        setNewAnuncioTitulo(`Welcome to ${detail.curso.nombre}! · Saludo de bienvenida`);
      }
      setNewAnuncioMsg(res.respuesta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo redactar el saludo con IA.');
    } finally {
      setAiDraftingGreeting(false);
    }
  };

  const handleCreateAnuncio = async (e: React.FormEvent, forceSaludo = false) => {
    e.preventDefault();
    if (newAnuncioTitulo.trim().length < 3 || newAnuncioMsg.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const esSaludo = forceSaludo || newAnuncioEsSaludo;
      await apiFetch('/api/anuncios', {
        method: 'POST',
        body: JSON.stringify({
          cursoId,
          titulo: newAnuncioTitulo.trim(),
          mensaje: newAnuncioMsg.trim(),
          esSaludo,
        }),
      });
      setNewAnuncioTitulo('');
      setNewAnuncioMsg('');
      setNewAnuncioEsSaludo(false);
      setShowAddGreeting(false);
      setStatusMsg(
        esSaludo
          ? 'Saludo de bienvenida (Greeting) fijado en la portada del curso.'
          : 'Anuncio publicado para todos los inscritos.',
      );
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el anuncio.');
    } finally {
      setBusy(false);
    }
  };

  const requestCancelTask = () => {
    const dirty = Boolean(newTaskTitle.trim() || newTaskInst.trim() || newTaskDue);
    if (dirty) {
      setDiscardTarget('task');
      return;
    }
    setShowAddTask(false);
  };

  const requestCancelGreeting = () => {
    const dirty = Boolean(newAnuncioTitulo.trim() || newAnuncioMsg.trim());
    if (dirty) {
      setDiscardTarget('greeting');
      return;
    }
    setShowAddGreeting(false);
  };

  const requestCancelAnuncio = () => {
    const dirty = Boolean(newAnuncioTitulo.trim() || newAnuncioMsg.trim());
    if (dirty) {
      setDiscardTarget('anuncio');
      return;
    }
    setNewAnuncioTitulo('');
    setNewAnuncioMsg('');
    setNewAnuncioEsSaludo(false);
  };

  const handleConfirmDiscard = () => {
    if (discardTarget === 'task') {
      setNewTaskTitle('');
      setNewTaskInst('');
      setNewTaskDue('');
      setShowAddTask(false);
    } else if (discardTarget === 'greeting') {
      setNewAnuncioTitulo('');
      setNewAnuncioMsg('');
      setNewAnuncioEsSaludo(false);
      setShowAddGreeting(false);
    } else if (discardTarget === 'anuncio') {
      setNewAnuncioTitulo('');
      setNewAnuncioMsg('');
      setNewAnuncioEsSaludo(false);
    }
    setDiscardTarget(null);
  };

  const handleQuickCompleteLesson = async (lec: LeccionDetallada) => {
    const done = lec.progreso?.estado === 'COMPLETADA';
    setBusy(true);
    try {
      await apiFetch(`/api/lecciones/${lec.id}/progreso`, {
        method: 'POST',
        body: JSON.stringify({ porcentaje: done ? 0 : 100 }),
      });
      await loadDetail();
      await onCourseListChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el progreso.');
    } finally {
      setBusy(false);
    }
  };

  if (cargando && !detail) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10 text-sm text-[#475569]">
        Cargando aula del curso...
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
        <button
          type="button"
          onClick={onBackToCatalog}
          className="text-sm font-medium text-[#2f5597] hover:underline"
        >
          Volver a cursos
        </button>
      </div>
    );
  }

  if (!detail) return null;

  const nivelInfo = getNivelInfo(detail.curso.nivel);
  const allCollapsed =
    detail.unidades.length > 0 && detail.unidades.every((u) => collapsedUnits[u.id]);

  const tabs = getCourseNavForRole(usuario.rol);

  const isTabularTab =
    activeSection === 'participantes' ||
    activeSection === 'entregas' ||
    activeSection === 'calificaciones' ||
    activeSection === 'asistencia';
  const showRightBlocks = rightOpen && !isTabularTab;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] bg-[#f5f6f8]">
      {/* Cajón interno colapsable tipo Moodle: Índice de unidades y lecciones */}
      {leftOpen && activeSection === 'unidades' && (
        <aside
          aria-label="Índice de unidades del curso"
          className="hidden xl:flex flex-col w-56 shrink-0 bg-white border-r border-[#d9d9d9]"
        >
          <div className="px-3.5 py-3 border-b border-[#d9d9d9] flex items-center justify-between">
            <span className="font-display text-xs font-bold text-[#011f52]">
              Índice de unidades
            </span>
            <button
              type="button"
              onClick={() => setLeftOpen(false)}
              aria-label="Contraer índice de unidades"
              className="p-1 rounded hover:bg-[#f5f6f8] text-slate-600"
            >
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {detail.unidades.map((u) => (
              <div key={u.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onSectionChange('unidades');
                    setSelectedLessonId(null);
                    setCollapsedUnits((prev) => ({ ...prev, [u.id]: false }));
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-[#011f52] hover:bg-[#f5f6f8] flex items-center justify-between gap-2"
                >
                  <span className="truncate">{u.titulo}</span>
                </button>
                <div className="pl-2.5 space-y-0.5">
                  {u.lecciones.map((l) => {
                    const active = selectedLessonId === l.id && activeSection === 'unidades';
                    const done = l.progreso?.estado === 'COMPLETADA';
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          onSectionChange('unidades');
                          setSelectedLessonId(l.id);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center justify-between gap-2 transition-colors ${
                          active
                            ? 'bg-[#011f52] text-white font-medium'
                            : 'text-slate-600 hover:bg-[#f5f6f8] hover:text-[#011f52]'
                        }`}
                      >
                        <span className="truncate">{l.titulo}</span>
                        {done && (
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-emerald-600'}`}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
      )}

      {/* Columna central principal */}
      <main className="flex-1 min-w-0 px-4 sm:px-7 py-6">
        <div className={`${isTabularTab ? 'max-w-5xl' : 'max-w-4xl'} mx-auto`}>
          {/* Barra superior contextual del curso */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              {activeSection === 'unidades' && !leftOpen && (
                <button
                  type="button"
                  onClick={() => setLeftOpen(true)}
                  aria-label="Abrir índice de unidades"
                  className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#d9d9d9] bg-white text-xs font-medium text-[#011f52] hover:border-[#011f52]"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Índice</span>
                </button>
              )}
              <button
                type="button"
                onClick={onBackToCatalog}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#011f52] hover:text-[#cf080d]"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mis cursos</span>
              </button>
              <span className="text-xs text-slate-400">/</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#011f52]/10 text-[#011f52]">
                {nivelInfo.codigo}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Botón Asistente IA (Docente y Estudiante, pausado durante examen cronometrado) */}
              <button
                type="button"
                disabled={examLockedAi}
                onClick={() => setAiDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#011f52]/25 bg-white hover:border-[#011f52] text-[#011f52] text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#cf080d]" aria-hidden="true" />
                <span>
                  {examLockedAi
                    ? 'IA pausada (examen)'
                    : isDocente
                      ? 'Copiloto IA'
                      : 'Tutor IA'}
                </span>
              </button>

              {isDocente && detail.curso.estado === 'BORRADOR' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handlePublishCourse}
                  className="px-3.5 py-1.5 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg whitespace-nowrap"
                >
                  Publicar curso
                </button>
              )}

              {isDocente && activeSection === 'unidades' && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={editMode}
                  onClick={() => setEditMode((m) => !m)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                    editMode
                      ? 'bg-[#cf080d] text-white border-[#cf080d]'
                      : 'bg-white text-[#011f52] border-[#d9d9d9] hover:border-[#011f52]'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Modo edición: {editMode ? 'Activo' : 'Inactivo'}</span>
                </button>
              )}

              {!rightOpen && !isTabularTab && (
                <button
                  type="button"
                  onClick={() => setRightOpen(true)}
                  aria-label="Mostrar bloques derechos"
                  className="hidden xl:inline-flex p-1.5 rounded-lg border border-[#d9d9d9] bg-white text-[#011f52] hover:border-[#011f52]"
                >
                  <PanelRightOpen className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Título del curso + estado */}
          <div className="mb-4">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#011f52]">
              {detail.curso.nombre}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {detail.curso.profesorNombre || 'Docente asignado'} ·{' '}
              {detail.curso.estado === 'PUBLICADO'
                ? 'Curso publicado'
                : 'Borrador (oculto a estudiantes)'}
              {!isDocente ? ` · Avance general: ${detail.progresoCurso}%` : ''}
            </p>
          </div>

          {/* Pestañas secundarias móviles/rápidas sincronizadas con la navegación contextual del sidebar */}
          <div
            role="tablist"
            aria-label="Secciones rápidas del curso"
            className="flex lg:hidden items-center gap-4 border-b border-[#d9d9d9] mb-5 overflow-x-auto"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeSection === t.id}
                onClick={() => {
                  onSectionChange(t.id);
                  if (t.id !== 'unidades') setSelectedLessonId(null);
                }}
                className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeSection === t.id
                    ? 'border-[#cf080d] text-[#011f52]'
                    : 'border-transparent text-slate-600 hover:text-[#011f52]'
                }`}
              >
                {t.displayLabel}
              </button>
            ))}
          </div>

          {statusMsg && (
            <div role="status" className="mb-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
              {statusMsg}
            </div>
          )}
          {error && (
            <div role="alert" className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* SECCIÓN: RESUMEN DEL CURSO */}
          {activeSection === 'resumen' && (
            <CourseSummarySection
              detail={detail}
              usuario={usuario}
              enrolledCount={enrolledCount}
              pendingSubmissions={pendingSubmissions}
              onNavigateSection={onSectionChange}
              onSelectLesson={(lessonId) => {
                onSectionChange('unidades');
                setSelectedLessonId(lessonId);
              }}
              onOpenActivityPicker={() => {
                setPickerTargetUnitId(detail.unidades[0]?.id || null);
                setShowActivityPicker(true);
              }}
            />
          )}

          {/* SECCIÓN: UNIDADES Y LECCIONES (Experiencia Moodle completa) */}
          {activeSection === 'unidades' && (
            selectedLesson ? (
              <LessonDetailPanel
                cursoId={cursoId}
                cursoNombre={detail.curso.nombre}
                nivelMcer={detail.curso.nivel}
                leccion={selectedLesson}
                allLecciones={allLessons}
                usuario={usuario}
                editMode={editMode}
                initialAction={lessonInitialAction}
                onClearInitialAction={() => setLessonInitialAction(null)}
                onOpenAiAction={handleOpenAiAction}
                onExamLockChange={handleExamFocusChange}
                onLaunchExamInModule={!isDocente ? handleLaunchExamInModule : undefined}
                onBack={() => setSelectedLessonId(null)}
                onRefresh={async () => {
                  await loadDetail();
                  await onCourseListChanged();
                }}
              />
            ) : (
              <div className="space-y-5">
                {detail.curso.estado === 'BORRADOR' && isDocente && (
                  <div className="p-3.5 rounded-lg bg-[#011f52]/5 border border-[#d9d9d9] text-sm text-[#011f52]">
                    Este curso está en estado borrador. Solo los docentes y administradores pueden
                    verlo hasta que lo publiques.
                  </div>
                )}

                {/* Saludo de bienvenida fijado (Greeting del tutor) */}
                {pinnedGreeting && (
                  <section
                    aria-label="Saludo de bienvenida del tutor"
                    className="bg-white border border-[#d9d9d9] rounded-xl p-5 flex items-start gap-3.5"
                  >
                    <span className="w-10 h-10 rounded-lg bg-[#011f52]/5 border border-[#d9d9d9] text-[#011f52] flex items-center justify-center shrink-0">
                      <MessageSquareHeart className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-bold tracking-wide text-[#cf080d] mb-0.5">
                            Saludo de bienvenida del tutor
                          </p>
                          <h2 className="font-display text-base font-bold text-[#011f52]">
                            {pinnedGreeting.titulo}
                          </h2>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 mt-1.5 leading-relaxed whitespace-pre-wrap">
                        {pinnedGreeting.mensaje}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        {pinnedGreeting.autorNombre} ·{' '}
                        {formatGuayaquilDateTime(pinnedGreeting.createdAt)}
                      </p>
                    </div>
                  </section>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {isDocente && editMode && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPickerTargetUnitId(detail.unidades[0]?.id || null);
                            setShowActivityPicker(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Añadir actividad o recurso</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddUnit((s) => !s)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#f5f6f8] text-[#011f52] border border-[#d9d9d9] text-xs font-medium rounded-lg"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#011f52]" aria-hidden="true" />
                          <span>Añadir unidad</span>
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      for (const u of detail.unidades) {
                        next[u.id] = !allCollapsed;
                      }
                      setCollapsedUnits(next);
                    }}
                    className="text-xs font-medium text-[#011f52] hover:text-[#cf080d] hover:underline"
                  >
                    {allCollapsed ? 'Expandir todo' : 'Contraer todo'}
                  </button>
                </div>

                {/* Formulario nuevo Saludo / Greeting del tutor */}
                {showAddGreeting && isDocente && (
                  <form
                    onSubmit={(e) => handleCreateAnuncio(e, true)}
                    className="bg-white border border-sky-300 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold text-[#0f172a] flex items-center gap-2">
                        <MessageSquareHeart className="w-4 h-4 text-[#2f5597]" aria-hidden="true" />
                        <span>Publicar Saludo de bienvenida (Greeting)</span>
                      </h3>
                      <button
                        type="button"
                        disabled={aiDraftingGreeting}
                        onClick={handleAiDraftGreeting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[#2f5597] text-xs font-semibold rounded-lg disabled:opacity-60"
                      >
                        {aiDraftingGreeting ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>Redactar saludo con IA</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={newAnuncioTitulo}
                      onChange={(e) => setNewAnuncioTitulo(e.target.value)}
                      placeholder="Ej. Welcome to Week 1! · Saludo de bienvenida"
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <textarea
                      rows={3}
                      required
                      value={newAnuncioMsg}
                      onChange={(e) => setNewAnuncioMsg(e.target.value)}
                      placeholder="Escribe un saludo motivador e indica cómo comenzar la semana..."
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={requestCancelGreeting}
                        className="px-3 py-1.5 text-xs text-[#475569] hover:text-[#011f52]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-4 py-1.5 bg-[#2f5597] hover:bg-[#244378] text-white text-xs font-medium rounded-lg"
                      >
                        Fijar Greeting en el curso
                      </button>
                    </div>
                  </form>
                )}

                {/* Formulario nueva unidad */}
                {showAddUnit && isDocente && editMode && (
                  <form
                    onSubmit={handleCreateUnit}
                    className="bg-white border border-slate-300 rounded-xl p-5 space-y-3"
                  >
                    <h3 className="font-display text-sm font-semibold text-[#0f172a]">
                      Nueva unidad / sección
                    </h3>
                    <input
                      type="text"
                      required
                      value={newUnitTitle}
                      onChange={(e) => setNewUnitTitle(e.target.value)}
                      placeholder="Ej. Unidad 4 — Conversación y viajes"
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      value={newUnitDesc}
                      onChange={(e) => setNewUnitDesc(e.target.value)}
                      placeholder="Descripción breve (opcional)"
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddUnit(false)}
                        className="px-3 py-1.5 text-xs text-[#475569]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-4 py-1.5 bg-[#2f5597] hover:bg-[#244378] text-white text-xs font-medium rounded-lg"
                      >
                        Guardar unidad
                      </button>
                    </div>
                  </form>
                )}

                {/* Formulario nueva tarea o Writing MCER */}
                {showAddTask && isDocente && (
                  <form
                    onSubmit={handleCreateTask}
                    className="bg-white border border-slate-300 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold text-[#0f172a]">
                        {newTaskTipo === 'WRITING'
                          ? 'Nueva actividad de Writing MCER Cambridge'
                          : 'Nueva tarea evaluable'}
                      </h3>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setNewTaskTipo('GENERAL')}
                          className={`px-2.5 py-1 rounded border ${
                            newTaskTipo === 'GENERAL'
                              ? 'bg-[#2f5597] text-white border-[#2f5597]'
                              : 'bg-white text-[#475569] border-slate-300'
                          }`}
                        >
                          Tarea general
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewTaskTipo('WRITING')}
                          className={`px-2.5 py-1 rounded border ${
                            newTaskTipo === 'WRITING'
                              ? 'bg-[#2f5597] text-white border-[#2f5597]'
                              : 'bg-white text-[#475569] border-slate-300'
                          }`}
                        >
                          Writing MCER
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      required
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder={
                        newTaskTipo === 'WRITING'
                          ? 'Ej. Writing Task · Formal Email about a Holiday (A2)'
                          : 'Título de la tarea (ej. UT3 · Práctica de escucha)'
                      }
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select
                        value={newTaskLeccionId}
                        onChange={(e) => setNewTaskLeccionId(e.target.value)}
                        aria-label="Vincular a lección"
                        className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                      >
                        <option value="">Sin vincular a una lección</option>
                        {allLessons.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.titulo}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={newTaskDue}
                        onChange={(e) => setNewTaskDue(e.target.value)}
                        aria-label="Fecha de vencimiento"
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    {newTaskTipo === 'WRITING' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="min-words" className="block text-xs text-[#475569] mb-1">
                            Mínimo de palabras
                          </label>
                          <input
                            id="min-words"
                            type="number"
                            min={15}
                            value={newTaskMinWords}
                            onChange={(e) => setNewTaskMinWords(Number(e.target.value))}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm tabular-nums"
                          />
                        </div>
                        <div>
                          <label htmlFor="max-words" className="block text-xs text-[#475569] mb-1">
                            Máximo de palabras
                          </label>
                          <input
                            id="max-words"
                            type="number"
                            min={30}
                            value={newTaskMaxWords}
                            onChange={(e) => setNewTaskMaxWords(Number(e.target.value))}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm tabular-nums"
                          />
                        </div>
                      </div>
                    )}
                    <textarea
                      rows={3}
                      value={newTaskInst}
                      onChange={(e) => setNewTaskInst(e.target.value)}
                      placeholder="Instrucciones claras y criterios de evaluación..."
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={requestCancelTask}
                        className="px-3 py-1.5 text-xs text-[#475569] hover:text-[#011f52]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-4 py-1.5 bg-[#2f5597] hover:bg-[#244378] text-white text-xs font-medium rounded-lg"
                      >
                        Publicar actividad
                      </button>
                    </div>
                  </form>
                )}

                {/* Acordeones de Unidades */}
                {detail.unidades.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-[#475569]">
                    Este curso todavía no tiene unidades creadas.
                  </div>
                ) : (
                  detail.unidades.map((u) => {
                    const isCollapsed = Boolean(collapsedUnits[u.id]);
                    return (
                      <section
                        key={u.id}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                      >
                        <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-100">
                          <button
                            type="button"
                            aria-expanded={!isCollapsed}
                            onClick={() =>
                              setCollapsedUnits((prev) => ({ ...prev, [u.id]: !prev[u.id] }))
                            }
                            className="flex items-center gap-2.5 text-left min-w-0"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-[#2f5597] shrink-0" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#2f5597] shrink-0" aria-hidden="true" />
                            )}
                            <span className="font-display text-base sm:text-lg font-semibold text-[#0f172a] truncate">
                              {u.titulo}
                            </span>
                          </button>

                          {isDocente && editMode && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUnit(u.id)}
                              aria-label={`Eliminar ${u.titulo}`}
                              className="p-1.5 text-[#475569] hover:text-red-700 rounded hover:bg-slate-100 shrink-0"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        {!isCollapsed && (
                          <div className="p-5 space-y-3">
                            {u.descripcion && (
                              <p className="text-sm text-[#475569] mb-3">{u.descripcion}</p>
                            )}

                            {u.lecciones.length === 0 ? (
                              <p className="text-xs text-[#475569] py-2">
                                Sin lecciones publicadas en esta unidad.
                              </p>
                            ) : (
                              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                                {u.lecciones.map((lec) => {
                                  const done = lec.progreso?.estado === 'COMPLETADA';
                                  return (
                                    <div
                                      key={lec.id}
                                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                                    >
                                      <div className="flex items-start gap-3 min-w-0">
                                        <span className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200 text-[#2f5597] flex items-center justify-center shrink-0 mt-0.5">
                                          <BookOpen className="w-4 h-4" aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0">
                                          <button
                                            type="button"
                                            onClick={() => setSelectedLessonId(lec.id)}
                                            className="text-sm font-semibold text-[#2f5597] hover:underline text-left"
                                          >
                                            {lec.titulo}
                                          </button>
                                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#475569] mt-1">
                                            <span className="inline-flex items-center gap-1">
                                              <FileText className="w-3 h-3" aria-hidden="true" />
                                              {lec.materiales.length} recurso(s)
                                            </span>
                                            {lec.tareas.length > 0 && (
                                              <>
                                                <span aria-hidden="true">·</span>
                                                <span className="inline-flex items-center gap-1">
                                                  <ClipboardCheck className="w-3 h-3" aria-hidden="true" />
                                                  {lec.tareas.length} tarea(s)
                                                </span>
                                              </>
                                            )}
                                            {lec.quizzes.length > 0 && (
                                              <>
                                                <span aria-hidden="true">·</span>
                                                <span className="inline-flex items-center gap-1">
                                                  <HelpCircle className="w-3 h-3" aria-hidden="true" />
                                                  {lec.quizzes.length} examen(es)
                                                </span>
                                              </>
                                            )}
                                            {!lec.publicada && (
                                              <>
                                                <span aria-hidden="true">·</span>
                                                <span className="font-medium text-amber-800">
                                                  No mostrado a estudiantes
                                                </span>
                                              </>
                                            )}
                                          </div>
                                          {!isDocente && lec.quizzes.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                              {lec.quizzes.map((q) => (
                                                <button
                                                  key={q.id}
                                                  type="button"
                                                  onClick={() => handleLaunchExamInModule(q.id)}
                                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#011f52]/8 hover:bg-[#cf080d] text-[#011f52] hover:text-white text-xs font-semibold transition-colors"
                                                >
                                                  <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                                                  <span>Examen: {q.titulo}</span>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                        {!isDocente ? (
                                          <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => handleQuickCompleteLesson(lec)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                                              done
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                                : 'bg-white border-slate-300 text-[#0f172a] hover:bg-slate-50'
                                            }`}
                                          >
                                            {done ? 'Hecha' : 'Marcar como hecha'}
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setSelectedLessonId(lec.id)}
                                            className="px-3 py-1.5 text-xs font-medium text-[#2f5597] border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                                          >
                                            {editMode ? 'Editar contenido' : 'Abrir lección'}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Botón estilo Moodle 5.0: Añadir actividad o recurso en esta unidad */}
                            {isDocente && editMode && (
                              addingLessonUnitId === u.id ? (
                                <form
                                  onSubmit={(e) => handleCreateLesson(e, u.id)}
                                  className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
                                >
                                  <input
                                    type="text"
                                    required
                                    value={newLessonTitle}
                                    onChange={(e) => setNewLessonTitle(e.target.value)}
                                    placeholder="Título de la nueva lección"
                                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                                  />
                                  <SimpleRichTextEditor
                                    id={`new-lesson-editor-${u.id}`}
                                    value={newLessonContent}
                                    onChange={setNewLessonContent}
                                    placeholder="Escribe el contenido o las indicaciones de la lección..."
                                    minHeightClass="min-h-[110px]"
                                  />
                                  <div className="flex items-center justify-between gap-3">
                                    <label className="inline-flex items-center gap-2 text-xs text-[#0f172a]">
                                      <input
                                        type="checkbox"
                                        checked={newLessonPublished}
                                        onChange={(e) => setNewLessonPublished(e.target.checked)}
                                      />
                                      <span>Publicar inmediatamente</span>
                                    </label>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setAddingLessonUnitId(null)}
                                        className="px-3 py-1.5 text-xs text-[#475569]"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="submit"
                                        disabled={busy}
                                        className="px-3.5 py-1.5 bg-[#2f5597] hover:bg-[#244378] text-white text-xs font-medium rounded-lg"
                                      >
                                        Guardar lección
                                      </button>
                                    </div>
                                  </div>
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPickerTargetUnitId(u.id);
                                    setShowActivityPicker(true);
                                  }}
                                  className="w-full mt-2 py-2.5 px-4 border border-dashed border-slate-300 hover:border-[#2f5597] rounded-lg text-xs font-medium text-[#2f5597] hover:bg-blue-50/40 transition-colors flex items-center justify-center gap-1.5"
                                >
                                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Añadir una actividad o un recurso en esta unidad</span>
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </section>
                    );
                  })
                )}
              </div>
            )
          )}

          {/* SECCIÓN: PARTICIPANTES */}
          {activeSection === 'participantes' && isDocente && (
            <ParticipantsTab
              cursoId={cursoId}
              usuario={usuario}
              onSelectStudent={onSelectStudent}
            />
          )}

          {/* SECCIÓN: ASISTENCIA (sincronizada desde ALLEN CRM) */}
          {activeSection === 'asistencia' && (
            <AttendanceTab cursoId={cursoId} usuario={usuario} />
          )}

          {/* SECCIÓN: ENTREGAS (DOCENTE) */}
          {activeSection === 'entregas' && isDocente && (
            <SubmissionsTab cursoId={cursoId} usuario={usuario} />
          )}

          {/* SECCIÓN: TAREAS (DOCENTE Y ESTUDIANTE) */}
          {activeSection === 'tareas' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold text-[#011f52]">
                  {isDocente ? 'Tareas del curso' : 'Mis tareas del curso'}
                </h2>
                {isDocente && (
                  <button
                    type="button"
                    onClick={() => {
                      onSectionChange('unidades');
                      setNewTaskTipo('GENERAL');
                      setNewTaskLeccionId(allLessons[0]?.id || '');
                      setShowAddTask(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Nueva tarea</span>
                  </button>
                )}
              </div>
              {detail.tareas.length === 0 ? (
                <div className="bg-white border border-[#d9d9d9] rounded-xl p-10 text-center text-sm text-slate-600">
                  Sin tareas asignadas en este curso.
                </div>
              ) : (
                detail.tareas.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white border border-[#d9d9d9] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-[#011f52]">{t.titulo}</h3>
                        {t.tipoTarea === 'WRITING' && (
                          <span className="text-[11px] font-semibold text-[#cf080d]">
                            · Writing {t.nivelMcer || 'MCER'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                        Vence: {formatGuayaquilDate(t.venceEn)} · Nota máxima: {t.notaMaxima} pts
                      </p>
                      {t.instrucciones && (
                        <p className="text-sm text-slate-600 mt-2">{t.instrucciones}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {!isDocente && (
                        <span className="text-xs font-semibold text-[#011f52] tabular-nums">
                          {t.miEntrega?.estado === 'CALIFICADO'
                            ? `Calificado: ${t.miEntrega.nota}/${t.notaMaxima}`
                            : t.miEntrega
                              ? `Estado: ${t.miEntrega.estado}`
                              : 'Pendiente'}
                        </span>
                      )}
                      {isDocente ? (
                        <button
                          type="button"
                          onClick={() => onSectionChange('entregas')}
                          className="px-3.5 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg"
                        >
                          Revisar entregas
                        </button>
                      ) : (
                        t.leccionId && (
                          <button
                            type="button"
                            onClick={() => {
                              onSectionChange('unidades');
                              setSelectedLessonId(t.leccionId);
                            }}
                            className="px-3.5 py-1.5 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg"
                          >
                            Ir a la tarea
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* SECCIÓN: EXÁMENES */}
          {activeSection === 'examenes' && (
            <CourseExamsSection
              detail={detail}
              isDocente={isDocente}
              autoStartQuizId={pendingExamQuizId}
              onClearAutoStartQuiz={() => setPendingExamQuizId(null)}
              onExamFocusChange={handleExamFocusChange}
              onSelectLesson={(lessonId) => {
                onSectionChange('unidades');
                setSelectedLessonId(lessonId);
              }}
              onOpenExamBuilder={() => {
                if (allLessons.length === 0) {
                  setError('Crea al menos una lección antes de agregar un examen cronometrado.');
                  return;
                }
                setEditingQuiz(null);
                setShowExamModal(true);
              }}
              onEditQuiz={(quiz) => {
                setEditingQuiz(quiz);
                setShowExamModal(true);
              }}
              onRefresh={async () => {
                await loadDetail();
                await onCourseListChanged();
              }}
            />
          )}

          {/* SECCIÓN: CALIFICACIONES */}
          {activeSection === 'calificaciones' && (
            <GradebookTab
              cursoId={cursoId}
              usuario={usuario}
              onSelectStudent={isDocente ? onSelectStudent : undefined}
            />
          )}

          {/* SECCIÓN: CONFIGURACIÓN DEL CURSO */}
          {activeSection === 'configuracion' && isDocente && (
            <CourseSettingsSection
              detail={detail}
              onUpdated={async () => {
                await loadDetail();
                await onCourseListChanged();
              }}
            />
          )}

          {/* SECCIÓN: ANUNCIOS & GREETINGS */}
          {activeSection === 'anuncios' && (
            <div className="space-y-5">
              <h2 className="font-display text-xl font-bold text-[#0f172a]">
                Tablón de anuncios y Greetings del tutor
              </h2>

              {isDocente && (
                <form
                  onSubmit={(e) => handleCreateAnuncio(e, false)}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-[#0f172a]">
                      Publicar comunicado o saludo para todos los inscritos
                    </h3>
                    <button
                      type="button"
                      disabled={aiDraftingGreeting}
                      onClick={handleAiDraftGreeting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[#2f5597] text-xs font-semibold rounded-lg disabled:opacity-60"
                    >
                      <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Sugerir saludo con IA</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={newAnuncioTitulo}
                    onChange={(e) => setNewAnuncioTitulo(e.target.value)}
                    placeholder="Asunto del anuncio o saludo"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <textarea
                    rows={3}
                    required
                    value={newAnuncioMsg}
                    onChange={(e) => setNewAnuncioMsg(e.target.value)}
                    placeholder="Escribe el comunicado o Greeting para el grupo..."
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-[#0f172a]">
                      <input
                        type="checkbox"
                        checked={newAnuncioEsSaludo}
                        onChange={(e) => setNewAnuncioEsSaludo(e.target.checked)}
                      />
                      <span>Fijar como Saludo de bienvenida (Greeting) en la portada del curso</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {(newAnuncioTitulo.trim() || newAnuncioMsg.trim()) && (
                        <button
                          type="button"
                          onClick={requestCancelAnuncio}
                          className="px-3 py-2 text-xs font-medium text-[#475569] hover:text-[#011f52]"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#2f5597] hover:bg-[#244378] text-white text-xs font-medium rounded-lg"
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Publicar</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {detail.anuncios.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-[#475569]">
                  Sin anuncios publicados en este curso.
                </div>
              ) : (
                <div className="space-y-3">
                  {detail.anuncios.map((a) => (
                    <article
                      key={a.id}
                      className={`bg-white border rounded-xl p-5 ${
                        a.esSaludo ? 'border-sky-200' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {a.esSaludo ? (
                          <MessageSquareHeart
                            className="w-4 h-4 text-[#2f5597] shrink-0 mt-1"
                            aria-hidden="true"
                          />
                        ) : (
                          <Megaphone
                            className="w-4 h-4 text-[#2f5597] shrink-0 mt-1"
                            aria-hidden="true"
                          />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-[#0f172a]">{a.titulo}</h3>
                            {a.esSaludo && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-sky-50 text-[#2f5597] border-sky-200">
                                Saludo fijado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#475569] mt-0.5">
                            {a.autorNombre} · {formatGuayaquilDateTime(a.createdAt)}
                          </p>
                          <p className="text-sm text-[#334155] mt-2.5 leading-relaxed whitespace-pre-wrap">
                            {a.mensaje}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Cajón derecho colapsable tipo Moodle: Bloques */}
      {showRightBlocks && !examLockedAi && (
        <aside
          aria-label="Bloques del curso"
          className="hidden xl:flex flex-col w-72 shrink-0 bg-[#f5f6f8] border-l border-[#d9d9d9] p-4"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="font-display text-sm font-bold text-[#011f52]">Bloques</span>
            <button
              type="button"
              onClick={() => setRightOpen(false)}
              aria-label="Ocultar bloques derechos"
              className="p-1 rounded hover:bg-[#d9d9d9]/50 text-[#011f52]"
            >
              <PanelRightClose className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <RightBlocks
            tareas={detail.tareas}
            anuncios={detail.anuncios}
            progresoCurso={detail.progresoCurso}
            isDocente={isDocente}
            onOpenTab={(tab) => onSectionChange(tab)}
          />
          {usuario.rol === 'ADMIN' && (
            <div className="mt-4 bg-white border border-[#d9d9d9] rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-[#011f52] flex items-center gap-1.5">
                <CalendarCheck2 className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
                <span>Asistencia ALLEN</span>
              </p>
              <p className="text-xs text-slate-600">
                Consulta el historial de sesiones sincronizado desde el CRM ALLEN.
              </p>
              <button
                type="button"
                onClick={() => onSectionChange('asistencia')}
                className="text-xs font-semibold text-[#011f52] hover:text-[#cf080d]"
              >
                Ver asistencia →
              </button>
            </div>
          )}
        </aside>
      )}

      {/* Modales y Paneles */}
      {isDocente && (
        <>
          <ActivityPickerModal
            open={showActivityPicker}
            onClose={() => setShowActivityPicker(false)}
            onSelect={handlePickerSelect}
          />
          <ExamBuilderModal
            open={showExamModal}
            onClose={() => {
              setShowExamModal(false);
              setEditingQuiz(null);
            }}
            lecciones={allLessons}
            defaultLeccionId={selectedLesson?.id || allLessons[0]?.id}
            defaultNivelMcer={detail.curso.nivel}
            editingQuiz={editingQuiz}
            onCreated={async () => {
              setStatusMsg(
                editingQuiz
                  ? 'Cuestionario actualizado correctamente.'
                  : 'Cuestionario guardado en el curso.',
              );
              setEditingQuiz(null);
              await loadDetail();
            }}
          />
        </>
      )}

      <UnsavedChangesDialog
        open={discardTarget !== null}
        title={
          discardTarget === 'task'
            ? '¿Descartar borrador de tarea?'
            : '¿Descartar borrador del anuncio?'
        }
        message={
          discardTarget === 'task'
            ? 'Tienes información escrita en esta tarea sin guardar. Si cancelas ahora, se perderá.'
            : 'Tienes texto escrito en este anuncio o Greeting sin publicar. Si cancelas ahora, se perderá.'
        }
        confirmLabel="Sí, descartar"
        cancelLabel="Seguir editando"
        onConfirmDiscard={handleConfirmDiscard}
        onContinueEditing={() => setDiscardTarget(null)}
      />

      <AiAssistantDrawer
        open={aiDrawerOpen && !examLockedAi}
        onClose={() => setAiDrawerOpen(false)}
        rol={usuario.rol}
        cursoNombre={detail.curso.nombre}
        nivelMcer={detail.curso.nivel}
        leccionTitulo={selectedLesson?.titulo || null}
        leccionContenido={selectedLesson?.contenido || null}
        initialQuickAction={aiQuickAction}
      />
    </div>
  );
}
