import React, { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Cloud,
  ExternalLink,
  FileAudio,
  FileText,
  Film,
  HelpCircle,
  Image as ImageIcon,
  Link2,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiFetch, formatBytes, formatGuayaquilDate } from '../../lib/api';
import { countWords, parseGoogleDriveUrl } from '../../lib/drive';
import type {
  AulaUsuario,
  LeccionDetallada,
  MaterialItem,
  PreguntaItem,
  QuizItem,
  TareaItem,
  TipoMaterial,
} from '../../types/aula';
import { ExamBuilderModal } from '../evaluaciones/ExamBuilderModal';
import { ExamRunner, type ExamSubmitOutcome } from '../evaluaciones/ExamRunner';
import type { QuickAiAction } from '../ia/AiAssistantDrawer';
import { SimpleRichTextEditor } from './SimpleRichTextEditor';

export type LessonInitialAction =
  | 'material_drive'
  | 'material_file'
  | 'material_link'
  | 'exam'
  | null;

interface LessonDetailPanelProps {
  cursoId: string;
  cursoNombre?: string;
  nivelMcer?: string | null;
  leccion: LeccionDetallada;
  allLecciones?: LeccionDetallada[];
  usuario: AulaUsuario;
  editMode: boolean;
  initialAction?: LessonInitialAction;
  onClearInitialAction?: () => void;
  onOpenAiAction?: (accion: QuickAiAction) => void;
  onExamLockChange?: (locked: boolean) => void;
  onLaunchExamInModule?: (quizId: string) => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

export function LessonDetailPanel({
  cursoId,
  nivelMcer,
  leccion,
  allLecciones,
  usuario,
  editMode,
  initialAction,
  onClearInitialAction,
  onOpenAiAction,
  onExamLockChange,
  onLaunchExamInModule,
  onBack,
  onRefresh,
}: LessonDetailPanelProps) {
  const isDocente = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Menú Moodle 5.0 "Características de IA"
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  // Edición de lección
  const [editTitulo, setEditTitulo] = useState(leccion.titulo);
  const [editContenido, setEditContenido] = useState(leccion.contenido || '');
  const [editPublicada, setEditPublicada] = useState(leccion.publicada);

  // Nuevo material (PDF, AUDIO, VIDEO, IMAGEN, ENLACE, GOOGLE_DRIVE)
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [matTipo, setMatTipo] = useState<TipoMaterial>('GOOGLE_DRIVE');
  const [matTitulo, setMatTitulo] = useState('');
  const [matDesc, setMatDesc] = useState('');
  const [matUrl, setMatUrl] = useState('');
  const [matFile, setMatFile] = useState<File | null>(null);

  // Reproductores de audio inline cargados bajo demanda con firma segura
  const [inlineAudioUrls, setInlineAudioUrls] = useState<Record<string, string>>({});

  // Constructor de examen Moodle + Cambridge
  const [showExamBuilder, setShowExamBuilder] = useState(false);

  // Entrega estudiante (texto / Writing + archivo o enlace de Drive)
  const [submittingTareaId, setSubmittingTareaId] = useState<string | null>(null);
  const [comentarioEntrega, setComentarioEntrega] = useState('');
  const [enlaceDriveEntrega, setEnlaceDriveEntrega] = useState('');
  const [archivoEntrega, setArchivoEntrega] = useState<File | null>(null);

  // Exam runner activo
  const [activeAttempt, setActiveAttempt] = useState<{
    quiz: QuizItem;
    intentoId: string;
    preguntas: PreguntaItem[];
    expiraEn: string | null;
  } | null>(null);

  useEffect(() => {
    setEditTitulo(leccion.titulo);
    setEditContenido(leccion.contenido || '');
    setEditPublicada(leccion.publicada);
  }, [leccion.id, leccion.titulo, leccion.contenido, leccion.publicada]);

  useEffect(() => {
    if (!initialAction || !isDocente) return;
    if (initialAction === 'material_drive') {
      setMatTipo('GOOGLE_DRIVE');
      setShowAddMaterial(true);
    } else if (initialAction === 'material_file') {
      setMatTipo('PDF');
      setShowAddMaterial(true);
    } else if (initialAction === 'material_link') {
      setMatTipo('ENLACE');
      setShowAddMaterial(true);
    } else if (initialAction === 'exam') {
      setShowExamBuilder(true);
    }
    onClearInitialAction?.();
  }, [initialAction, isDocente]);

  useEffect(() => {
    return () => {
      onExamLockChange?.(false);
    };
  }, []);

  const isCompleted = leccion.progreso?.estado === 'COMPLETADA';
  const examLocked = Boolean(activeAttempt && activeAttempt.quiz.modo !== 'PRACTICA');

  const handleToggleComplete = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/lecciones/${leccion.id}/progreso`, {
        method: 'POST',
        body: JSON.stringify({ porcentaje: isCompleted ? 0 : 100 }),
      });
      setFeedbackMsg(
        isCompleted
          ? 'Lección marcada como pendiente.'
          : 'Lección marcada como completada. Progreso actualizado.',
      );
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo actualizar el progreso.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/lecciones/${leccion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          titulo: editTitulo,
          contenido: editContenido,
          publicada: editPublicada,
        }),
      });
      setFeedbackMsg('Cambios de la lección guardados.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo guardar la lección.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadMaterial = async (mat: MaterialItem, openPreview = false) => {
    setErrorMsg(null);
    try {
      const data = await apiFetch<{
        url: string;
        previewUrl?: string;
        externo: boolean;
        esGoogleDrive?: boolean;
      }>(`/api/materiales/${mat.id}/descarga`);
      const targetUrl = openPreview && data.previewUrl ? data.previewUrl : data.url;
      const a = document.createElement('a');
      a.href = targetUrl;
      if (data.externo) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      } else {
        a.download = mat.titulo;
      }
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (!data.externo) {
        setFeedbackMsg('Descarga iniciada (enlace seguro válido por 10 minutos).');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo acceder al material.');
    }
  };

  const handleLoadInlineAudio = async (mat: MaterialItem) => {
    setErrorMsg(null);
    try {
      if (/^https?:\/\//i.test(mat.url)) {
        const parsed = parseGoogleDriveUrl(mat.url);
        setInlineAudioUrls((prev) => ({
          ...prev,
          [mat.id]: parsed.isDrive ? parsed.downloadUrl : mat.url,
        }));
        return;
      }
      const data = await apiFetch<{ url: string; externo: boolean }>(
        `/api/materiales/${mat.id}/descarga`,
      );
      const streamUrl = data.externo ? data.url : `${data.url}?inline=1`;
      setInlineAudioUrls((prev) => ({ ...prev, [mat.id]: streamUrl }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo preparar el audio.');
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (matTitulo.trim().length < 2) {
      setErrorMsg('Ingresa el título del material.');
      return;
    }
    if ((matTipo === 'ENLACE' || matTipo === 'GOOGLE_DRIVE') && !/^https?:\/\//i.test(matUrl.trim())) {
      setErrorMsg('Ingresa una URL válida que empiece con https://');
      return;
    }

    setBusy(true);
    try {
      let finalUrl = matUrl.trim();
      let mimeType: string | null =
        matTipo === 'PDF'
          ? 'application/pdf'
          : matTipo === 'AUDIO'
            ? 'audio/mpeg'
            : matTipo === 'VIDEO'
              ? 'video/mp4'
              : null;
      let tamanoBytes: number | null = null;

      if (matTipo !== 'ENLACE' && matTipo !== 'GOOGLE_DRIVE' && matFile) {
        const signed = await apiFetch<{ storageKey: string; uploadUrl: string }>(
          '/api/materiales/firma',
          {
            method: 'POST',
            body: JSON.stringify({
              cursoId,
              filename: matFile.name,
              mimeType: matFile.type || 'application/octet-stream',
            }),
          },
        );
        const fd = new FormData();
        fd.append('archivo', matFile);
        const uploaded = await apiFetch<{
          storageKey: string;
          tamanoBytes: number;
          mimeType: string;
        }>(signed.uploadUrl, {
          method: 'POST',
          body: fd,
        });
        finalUrl = uploaded.storageKey;
        tamanoBytes = uploaded.tamanoBytes;
        mimeType = uploaded.mimeType;
      } else if (!finalUrl) {
        const ext = matTipo === 'PDF' ? 'pdf' : matTipo === 'AUDIO' ? 'mp3' : 'mp4';
        finalUrl = `demo://${matTitulo.toLowerCase().replace(/\s+/g, '-')}.${ext}`;
      }

      await apiFetch(`/api/lecciones/${leccion.id}/materiales`, {
        method: 'POST',
        body: JSON.stringify({
          tipo: matTipo,
          titulo: matTitulo.trim(),
          descripcion: matDesc.trim() || null,
          url: finalUrl,
          mimeType,
          tamanoBytes,
        }),
      });
      setMatTitulo('');
      setMatDesc('');
      setMatUrl('');
      setMatFile(null);
      setShowAddMaterial(false);
      setFeedbackMsg('Material agregado a la lección.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo subir el material.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteMaterial = async (materialId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/materiales/${materialId}`, { method: 'DELETE' });
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo eliminar el material.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitTarea = async (tarea: TareaItem) => {
    setErrorMsg(null);
    if (!comentarioEntrega.trim() && !archivoEntrega && !enlaceDriveEntrega.trim()) {
      setErrorMsg('Escribe tu respuesta, pega un enlace de Google Drive o adjunta un archivo.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      if (comentarioEntrega.trim()) fd.append('comentario', comentarioEntrega.trim());
      if (enlaceDriveEntrega.trim()) fd.append('enlaceDrive', enlaceDriveEntrega.trim());
      if (archivoEntrega) fd.append('archivo', archivoEntrega);
      await apiFetch(`/api/tareas/${tarea.id}/entregas`, {
        method: 'POST',
        body: fd,
      });
      setSubmittingTareaId(null);
      setComentarioEntrega('');
      setEnlaceDriveEntrega('');
      setArchivoEntrega(null);
      setFeedbackMsg('Entrega registrada correctamente.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo enviar tu entrega.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartQuiz = async (q: QuizItem) => {
    // Redirigir siempre al módulo de Exámenes en modo pantalla completa
    if (onLaunchExamInModule) {
      onLaunchExamInModule(q.id);
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    try {
      const data = await apiFetch<{
        intento: { id: string };
        preguntas: PreguntaItem[];
        expiraEn: string | null;
      }>(`/api/quizzes/${q.id}/intentos`, { method: 'POST' });

      setActiveAttempt({
        quiz: q,
        intentoId: data.intento.id,
        preguntas: data.preguntas,
        expiraEn: data.expiraEn,
      });
      if (q.modo !== 'PRACTICA') {
        onExamLockChange?.(true);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo iniciar el examen.');
    } finally {
      setBusy(false);
    }
  };

  const handleExamSubmitted = async (outcome: ExamSubmitOutcome) => {
    onExamLockChange?.(false);
    setFeedbackMsg(
      outcome.requiereRevisionDocente
        ? 'Examen enviado. Tus preguntas objetivas fueron corregidas y el Writing quedó en revisión docente.'
        : `Examen calificado automáticamente: ${outcome.nota}/100. Evento nota.publicada enviado a ALLEN.`,
    );
    await onRefresh();
  };

  const drivePreview = matTipo === 'GOOGLE_DRIVE' && matUrl.trim() ? parseGoogleDriveUrl(matUrl) : null;

  return (
    <div className="space-y-6">
      {/* Encabezado de la lección + Moodle 5.0 Características de IA */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#2f5597] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Volver a secciones del curso</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenAiAction && (
            <div className="relative">
              <button
                type="button"
                disabled={examLocked}
                onClick={() => setAiMenuOpen((v) => !v)}
                aria-expanded={aiMenuOpen}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-[#0f172a] hover:bg-slate-50 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#2f5597]" aria-hidden="true" />
                <span>{examLocked ? 'IA pausada (examen)' : 'Características de IA'}</span>
              </button>

              {aiMenuOpen && !examLocked && (
                <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-30">
                  {(
                    [
                      { id: 'resumir', label: 'Resumir esta lección' },
                      { id: 'explicar', label: 'Explicar paso a paso (MCER)' },
                      { id: 'vocabulario', label: 'Vocabulario clave en inglés' },
                      ...(isDocente ? [{ id: 'rubrica', label: 'Crear rúbrica Cambridge' }] : []),
                    ] as Array<{ id: QuickAiAction; label: string }>
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setAiMenuOpen(false);
                        onOpenAiAction(item.id);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-[#0f172a] hover:bg-sky-50 hover:text-[#2f5597]"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isDocente && (
            <button
              type="button"
              disabled={busy}
              onClick={handleToggleComplete}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors ${
                isCompleted
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                  : 'bg-[#2f5597] border-[#2f5597] text-white hover:bg-[#244378]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>{isCompleted ? 'Completada' : 'Marcar como completada'}</span>
            </button>
          )}
        </div>
      </div>

      {feedbackMsg && (
        <div role="status" className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          {feedbackMsg}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Contenido o Editor de la lección */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        {isDocente && editMode ? (
          <form onSubmit={handleSaveLesson} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-[#0f172a]">Editar lección</h2>
              <label className="inline-flex items-center gap-2 text-sm text-[#0f172a]">
                <input
                  type="checkbox"
                  checked={editPublicada}
                  onChange={(e) => setEditPublicada(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Visible para estudiantes</span>
              </label>
            </div>
            <div>
              <label htmlFor="edit-lec-titulo" className="block text-sm font-medium text-[#0f172a] mb-1">
                Título
              </label>
              <input
                id="edit-lec-titulo"
                type="text"
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <SimpleRichTextEditor
              id="edit-lec-contenido"
              label="Contenido de la lección"
              value={editContenido}
              onChange={setEditContenido}
              placeholder="Escribe el tema, explicaciones, ejemplos o instrucciones de la clase..."
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-sm font-medium rounded-lg"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="font-display text-xl font-bold text-[#0f172a]">{leccion.titulo}</h2>
              {!leccion.publicada && (
                <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
                  No mostrado a estudiantes
                </span>
              )}
            </div>
            {leccion.contenido ? (
              <div
                className="lesson-prose text-sm"
                dangerouslySetInnerHTML={{ __html: leccion.contenido }}
              />
            ) : (
              <p className="text-sm text-[#475569]">Esta lección aún no tiene contenido redactado.</p>
            )}
          </div>
        )}
      </section>

      {/* Materiales audiovisuales, PDFs y Google Drive */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display text-base font-semibold text-[#0f172a]">
              Materiales audiovisuales y recursos ({leccion.materiales.length})
            </h3>
            <p className="text-xs text-[#475569] mt-0.5">
              PDFs, audios reproducibles en línea, enlaces y recursos ligeros desde Google Drive.
            </p>
          </div>
          {isDocente && (
            <button
              type="button"
              onClick={() => setShowAddMaterial((s) => !s)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2f5597] border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <ArrowUpFromLine className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Agregar recurso</span>
            </button>
          )}
        </div>

        {showAddMaterial && isDocente && (
          <form onSubmit={handleAddMaterial} className="mb-5 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="mat-tipo" className="block text-xs font-medium text-[#0f172a] mb-1">
                  Tipo de recurso
                </label>
                <select
                  id="mat-tipo"
                  value={matTipo}
                  onChange={(e) => setMatTipo(e.target.value as TipoMaterial)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                >
                  <option value="GOOGLE_DRIVE">Google Drive (descarga directa)</option>
                  <option value="PDF">Documento PDF</option>
                  <option value="AUDIO">Audio MP3 (reproductor en línea)</option>
                  <option value="VIDEO">Video MP4</option>
                  <option value="IMAGEN">Imagen / Infografía</option>
                  <option value="ENLACE">Enlace web externo</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="mat-titulo" className="block text-xs font-medium text-[#0f172a] mb-1">
                  Título del recurso
                </label>
                <input
                  id="mat-titulo"
                  type="text"
                  required
                  value={matTitulo}
                  onChange={(e) => setMatTitulo(e.target.value)}
                  placeholder="Ej. Cambridge A2 Listening Track + PDF Workbook"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <input
              type="text"
              value={matDesc}
              onChange={(e) => setMatDesc(e.target.value)}
              placeholder="Descripción breve para el estudiante (opcional)"
              aria-label="Descripción del material"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
            />

            {matTipo === 'ENLACE' || matTipo === 'GOOGLE_DRIVE' ? (
              <div className="space-y-2">
                <label htmlFor="mat-url" className="block text-xs font-medium text-[#0f172a]">
                  {matTipo === 'GOOGLE_DRIVE'
                    ? 'Enlace compartido de Google Drive / Docs / Slides'
                    : 'URL del enlace externo (https://...)'}
                </label>
                <input
                  id="mat-url"
                  type="url"
                  required
                  value={matUrl}
                  onChange={(e) => setMatUrl(e.target.value)}
                  placeholder={
                    matTipo === 'GOOGLE_DRIVE'
                      ? 'https://drive.google.com/file/d/ID_DEL_ARCHIVO/view?usp=sharing'
                      : 'https://dictionary.cambridge.org/'
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                />
                {drivePreview?.isDrive && (
                  <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded">
                    Enlace de Google Drive detectado. El botón &ldquo;Descargar&rdquo; convertirá este
                    archivo a descarga directa sin ocupar almacenamiento del servidor.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label htmlFor="mat-file" className="block text-xs font-medium text-[#0f172a] mb-1">
                  Archivo privado (máx. 25 MB) o pega una URL directa opcional
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    id="mat-file"
                    type="file"
                    onChange={(e) => setMatFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-[#475569] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:text-xs file:font-medium file:text-[#0f172a]"
                  />
                  <input
                    type="url"
                    value={matUrl}
                    onChange={(e) => setMatUrl(e.target.value)}
                    placeholder="O URL externa directa (opcional)"
                    aria-label="URL externa directa opcional"
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddMaterial(false)}
                className="px-3 py-1.5 text-xs font-medium text-[#475569]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-3.5 py-1.5 bg-[#2f5597] hover:bg-[#244378] text-white text-xs font-medium rounded-lg"
              >
                Guardar recurso
              </button>
            </div>
          </form>
        )}

        {leccion.materiales.length === 0 ? (
          <p className="text-sm text-[#475569]">Sin materiales cargados en esta lección.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {leccion.materiales.map((mat) => {
              const isPdf = mat.tipo === 'PDF';
              const isDrive = mat.tipo === 'GOOGLE_DRIVE';
              const isLink = mat.tipo === 'ENLACE';
              const isAudio = mat.tipo === 'AUDIO';
              const Icon = isPdf
                ? FileText
                : isDrive
                  ? Cloud
                  : isLink
                    ? Link2
                    : isAudio
                      ? FileAudio
                      : mat.tipo === 'IMAGEN'
                        ? ImageIcon
                        : Film;

              const loadedAudioUrl = inlineAudioUrls[mat.id];

              return (
                <li key={mat.id} className="py-3.5 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                          isPdf
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : isDrive
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : isLink
                                ? 'bg-sky-50 text-sky-800 border-sky-200'
                                : isAudio
                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                  : 'bg-slate-100 text-[#0f172a] border-slate-200'
                        }`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0f172a] truncate">{mat.titulo}</p>
                        <p className="text-xs text-[#475569]">
                          {isDrive ? 'Google Drive' : mat.tipo}
                          {mat.tamanoBytes ? ` · ${formatBytes(mat.tamanoBytes)}` : ''}
                          {mat.descripcion ? ` · ${mat.descripcion}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                      {isAudio && !loadedAudioUrl && (
                        <button
                          type="button"
                          onClick={() => handleLoadInlineAudio(mat)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 bg-indigo-50/70 text-indigo-900 hover:bg-indigo-100 whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Escuchar aquí</span>
                        </button>
                      )}

                      {isDrive && (
                        <button
                          type="button"
                          onClick={() => handleDownloadMaterial(mat, true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Ver en Drive</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDownloadMaterial(mat, false)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                          isPdf
                            ? 'text-red-700 border-red-200 bg-red-50/50 hover:bg-red-50'
                            : isDrive
                              ? 'text-white border-[#2f5597] bg-[#2f5597] hover:bg-[#244378]'
                              : 'text-[#2f5597] border-slate-300 bg-white hover:bg-slate-50'
                        }`}
                      >
                        {isLink ? (
                          <>
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Abrir</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownToLine className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Descargar</span>
                          </>
                        )}
                      </button>

                      {isDocente && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMaterial(mat.id)}
                          aria-label={`Eliminar material ${mat.titulo}`}
                          className="p-1.5 text-[#475569] hover:text-red-700 rounded-lg hover:bg-slate-100"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isAudio && loadedAudioUrl && (
                    <div className="pl-0 sm:pl-12">
                      <audio controls src={loadedAudioUrl} className="w-full max-w-md h-9" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Tareas y Writings vinculados a esta lección */}
      {leccion.tareas.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-[#0f172a] flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-[#2f5597]" aria-hidden="true" />
            <span>Tareas prácticas y Writing MCER</span>
          </h3>

          {leccion.tareas.map((t) => {
            const isWriting = t.tipoTarea === 'WRITING';
            const liveWords = submittingTareaId === t.id ? countWords(comentarioEntrega) : 0;
            return (
              <div key={t.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-[#0f172a]">{t.titulo}</h4>
                      {isWriting && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-violet-50 text-violet-900 border-violet-200">
                          Writing {t.nivelMcer || nivelMcer || 'MCER'}
                          {t.minPalabras || t.maxPalabras
                            ? ` · ${t.minPalabras ?? 0}–${t.maxPalabras ?? '∞'} palabras`
                            : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#475569] mt-0.5 tabular-nums">
                      Nota máxima: {t.notaMaxima} pts · Vence: {formatGuayaquilDate(t.venceEn)}
                    </p>
                  </div>
                  {t.miEntrega && (
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                      {t.miEntrega.estado === 'CALIFICADO'
                        ? `Calificado · ${t.miEntrega.nota}/${t.notaMaxima}`
                        : `Entregado (${t.miEntrega.estado})`}
                    </span>
                  )}
                </div>

                {t.instrucciones && <p className="text-sm text-[#475569]">{t.instrucciones}</p>}

                {t.miEntrega?.feedback && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-[#0f172a]">
                    <span className="font-semibold">Retroalimentación docente: </span>
                    {t.miEntrega.feedback}
                  </div>
                )}

                {!isDocente && (
                  <div>
                    {submittingTareaId === t.id ? (
                      <div className="space-y-3 pt-2 border-t border-slate-100">
                        {isWriting && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#475569]">Redacción en línea (Cambridge Writing):</span>
                            <span className="font-mono-data font-semibold text-[#2f5597] tabular-nums">
                              {liveWords} palabras
                              {t.minPalabras || t.maxPalabras
                                ? ` / meta ${t.minPalabras ?? 0}–${t.maxPalabras ?? '∞'}`
                                : ''}
                            </span>
                          </div>
                        )}
                        <textarea
                          rows={isWriting ? 6 : 3}
                          value={comentarioEntrega}
                          onChange={(e) => setComentarioEntrega(e.target.value)}
                          placeholder={
                            isWriting
                              ? 'Redacta tu respuesta en inglés aquí...'
                              : 'Escribe tu respuesta o comentario para el profesor...'
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <input
                            type="file"
                            onChange={(e) => setArchivoEntrega(e.target.files?.[0] || null)}
                            className="block w-full text-xs text-[#475569] file:mr-2 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-300 file:bg-white file:text-xs"
                          />
                          <input
                            type="url"
                            value={enlaceDriveEntrega}
                            onChange={(e) => setEnlaceDriveEntrega(e.target.value)}
                            placeholder="O pega tu enlace de Google Drive (opcional)"
                            aria-label="Enlace de Google Drive para entrega"
                            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSubmittingTareaId(null)}
                            className="px-3 py-1.5 text-xs font-medium text-[#475569]"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleSubmitTarea(t)}
                            className="px-4 py-1.5 bg-[#2f5597] hover:bg-[#244378] text-white text-xs font-medium rounded-lg"
                          >
                            Guardar entrega
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSubmittingTareaId(t.id);
                          setComentarioEntrega(t.miEntrega?.comentario || '');
                          setEnlaceDriveEntrega('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2f5597] hover:bg-[#244378] text-white text-xs font-medium rounded-lg"
                      >
                        <ArrowUpFromLine className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.miEntrega ? 'Actualizar entrega' : 'Subir entrega'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Exámenes y cuestionarios interactivos cronometrados */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-[#011f52] flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#011f52]" aria-hidden="true" />
              <span>Exámenes y cuestionarios ({leccion.quizzes.length})</span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Opción múltiple, Verdadero/Falso, respuesta corta y redacción con temporizador automático.
            </p>
          </div>
          {isDocente && (
            <button
              type="button"
              onClick={() => setShowExamBuilder(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#cf080d] hover:bg-[#ad060a] rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Nuevo cuestionario</span>
            </button>
          )}
        </div>

        {activeAttempt ? (
          <ExamRunner
            quiz={activeAttempt.quiz}
            intentoId={activeAttempt.intentoId}
            preguntas={activeAttempt.preguntas}
            expiraEn={activeAttempt.expiraEn}
            onExit={() => {
              setActiveAttempt(null);
              onExamLockChange?.(false);
            }}
            onSubmitted={handleExamSubmitted}
          />
        ) : leccion.quizzes.length === 0 ? (
          <p className="text-sm text-[#475569]">Sin exámenes registrados en esta lección.</p>
        ) : (
          <div className="space-y-3">
            {leccion.quizzes.map((q) => {
              const usados = q.misIntentos?.length ?? 0;
              const enRevision = q.misIntentos?.some((i) => i.estado === 'ENVIADO');
              const mejorNota =
                q.misIntentos && q.misIntentos.some((i) => i.nota !== null)
                  ? Math.max(...q.misIntentos.map((i) => Number(i.nota ?? 0)))
                  : null;
              const tieneWriting = q.preguntas.some((p) => p.tipo === 'WRITING');
              const agotados = !isDocente && usados >= q.intentosMax && !q.misIntentos?.some((i) => i.estado === 'EN_CURSO');

              return (
                <div
                  key={q.id}
                  className="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-[#011f52]">{q.titulo}</h4>
                      {q.tiempoLimiteMin && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border bg-slate-50 text-[#0f172a] border-slate-200 tabular-nums">
                          <Clock className="w-3 h-3 text-[#2f5597]" aria-hidden="true" />
                          {q.tiempoLimiteMin} min
                        </span>
                      )}
                      {tieneWriting && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-violet-50 text-violet-900 border-violet-200">
                          Incluye Writing
                        </span>
                      )}
                    </div>
                    {q.descripcion && <p className="text-xs text-[#475569]">{q.descripcion}</p>}
                    <p className="text-xs text-[#475569] tabular-nums">
                      {q.preguntas.length} preguntas · Nota mínima {q.notaMinima}/100 · Modo:{' '}
                      {q.modo === 'PRACTICA' ? 'Práctica' : 'Examen'} · Intentos máx.:{' '}
                      {q.intentosMax}
                      {!isDocente ? ` · Usados: ${usados}/${q.intentosMax}` : ''}
                      {mejorNota !== null ? ` · Mejor nota: ${mejorNota}/100` : ''}
                      {enRevision ? ' · Writing en revisión docente' : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {!isDocente ? (
                      <button
                        type="button"
                        disabled={busy || agotados}
                        onClick={() => handleStartQuiz(q)}
                        className="px-4 py-2 bg-[#2f5597] hover:bg-[#244378] text-white text-xs font-semibold rounded-lg disabled:opacity-50 whitespace-nowrap"
                      >
                        {agotados
                          ? 'Sin intentos disponibles'
                          : q.misIntentos?.some((i) => i.estado === 'EN_CURSO')
                            ? 'Continuar intento'
                            : 'Iniciar examen'}
                      </button>
                    ) : (
                      <span className="text-xs text-[#475569] border border-slate-200 px-2.5 py-1 rounded bg-slate-50">
                        Publicado
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isDocente && (
        <ExamBuilderModal
          open={showExamBuilder}
          onClose={() => setShowExamBuilder(false)}
          lecciones={allLecciones && allLecciones.length > 0 ? allLecciones : [leccion]}
          defaultLeccionId={leccion.id}
          defaultNivelMcer={nivelMcer}
          onCreated={async () => {
            setFeedbackMsg('Examen cronometrado creado y publicado en la lección.');
            await onRefresh();
          }}
        />
      )}
    </div>
  );
}
