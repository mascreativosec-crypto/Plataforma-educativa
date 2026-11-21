import React, { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  History,
  Lock,
  PenTool,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { apiFetch, formatGuayaquilDateTime } from '../../lib/api';
import { countWords } from '../../lib/drive';
import { evaluateGradeEditPermission, validateModificationReason } from '../../lib/grade-policy';
import type {
  AulaUsuario,
  EntregaItem,
  HistorialNotaCambio,
  IntentoRevisionItem,
} from '../../types/aula';

interface SubmissionsTabProps {
  cursoId: string;
  usuario: AulaUsuario;
}

interface AiRubricSuggestion {
  notaSugerida: number;
  feedbackSugerido: string;
  criterios: {
    content: string;
    communicativeAchievement: string;
    organisation: string;
    language: string;
  };
}

function GradeAuditTrail({ historial }: { historial?: HistorialNotaCambio[] | null }) {
  if (!Array.isArray(historial) || historial.length === 0) return null;
  return (
    <div className="mt-3 p-3 rounded-lg bg-[#f5f6f8] border border-[#d9d9d9] space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#011f52] flex items-center gap-1.5">
        <History className="w-3.5 h-3.5 text-[#011f52]" aria-hidden="true" />
        <span>Historial de modificaciones de nota ({historial.length})</span>
      </p>
      <ul className="space-y-1 text-xs text-slate-700">
        {historial.slice(-5).map((h, i) => (
          <li
            key={`${h.fecha}-${i}`}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              <strong className="text-[#011f52]">
                {h.notaAnterior === null ? 'Sin nota' : h.notaAnterior} → {h.notaNueva}
              </strong>{' '}
              · {h.actorNombre} ({h.actorRol === 'ADMIN' ? 'Admin' : 'Docente'}): “{h.motivo}”
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {formatGuayaquilDateTime(h.fecha)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SubmissionsTab({ cursoId, usuario }: SubmissionsTabProps) {
  const [subTab, setSubTab] = useState<'tareas' | 'examenes'>('tareas');

  const [entregas, setEntregas] = useState<EntregaItem[]>([]);
  const [intentos, setIntentos] = useState<IntentoRevisionItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Calificación de entregas de tarea / writing
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [notaInput, setNotaInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [taskReasonInput, setTaskReasonInput] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<AiRubricSuggestion | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // Calificación de exámenes con preguntas WRITING
  const [reviewingIntentoId, setReviewingIntentoId] = useState<string | null>(null);
  const [manualScores, setManualScores] = useState<Record<string, string>>({});
  const [examFeedback, setExamFeedback] = useState('');
  const [examReasonInput, setExamReasonInput] = useState('');
  const [examAiRubric, setExamAiRubric] = useState<AiRubricSuggestion | null>(null);

  // Edición directa de nota de examen (sin Writing o ajuste de nota final bajo regla 48h)
  const [editingExamGradeId, setEditingExamGradeId] = useState<string | null>(null);
  const [examDirectNota, setExamDirectNota] = useState('');
  const [examDirectFeedback, setExamDirectFeedback] = useState('');
  const [examDirectReason, setExamDirectReason] = useState('');

  const loadAll = async () => {
    setCargando(true);
    setError(null);
    try {
      const [entData, revData] = await Promise.all([
        apiFetch<{ entregas: EntregaItem[] }>(`/api/cursos/${cursoId}/entregas`),
        apiFetch<{ intentos: IntentoRevisionItem[] }>(`/api/cursos/${cursoId}/intentos-revision`),
      ]);
      setEntregas(entData.entregas);
      setIntentos(revData.intentos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las entregas.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [cursoId]);

  const handleDownloadAttachment = async (ent: EntregaItem) => {
    setError(null);
    try {
      const data = await apiFetch<{ url: string; externo: boolean }>(
        `/api/entregas/${ent.id}/archivo`,
      );
      const a = document.createElement('a');
      a.href = data.url;
      if (data.externo) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      } else {
        a.download = `entrega-${ent.id.slice(0, 8)}`;
      }
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el adjunto.');
    }
  };

  const handleOpenGrade = (ent: EntregaItem) => {
    setGradingId(ent.id);
    setNotaInput(ent.nota !== null ? String(ent.nota) : '');
    setFeedbackInput(ent.feedback || '');
    setTaskReasonInput('');
    setAiSuggestion(null);
    setSuccessMsg(null);
    setError(null);
  };

  const handleAiEvaluateTask = async (ent: EntregaItem) => {
    const texto = ent.comentario?.trim() || '';
    if (texto.length < 10) {
      setError('Esta entrega no contiene texto suficiente en línea para evaluar con rúbrica IA.');
      return;
    }
    setAiBusy(true);
    setError(null);
    try {
      const res = await apiFetch<AiRubricSuggestion>('/api/ia/evaluar-writing', {
        method: 'POST',
        body: JSON.stringify({
          consigna: `${ent.tareaTitulo || 'Tarea'}: ${ent.instrucciones || ''}`,
          textoEstudiante: texto,
          nivelMcer: ent.nivelMcer || 'A2',
          puntajeMaximo: ent.notaMaxima ?? 100,
        }),
      });
      setAiSuggestion(res);
      setNotaInput(String(res.notaSugerida));
      setFeedbackInput(res.feedbackSugerido);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la evaluación con IA.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSaveGrade = async (e: React.FormEvent, ent: EntregaItem) => {
    e.preventDefault();
    setError(null);
    const parsed = Number(notaInput);
    const maxNota = ent.notaMaxima ?? 100;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxNota) {
      setError(`Ingresa una calificación numérica entre 0 y ${maxNota}.`);
      return;
    }

    const perm = evaluateGradeEditPermission({
      rol: usuario.rol,
      existingNota: ent.nota,
      notaAsentadaEn: ent.notaAsentadaEn ?? ent.calificadoEn,
    });

    if (!perm.canEdit) {
      setError(
        'Han transcurrido más de 48 horas desde que se asentó la nota. Solo el Administrador Total puede modificarla.',
      );
      return;
    }

    if (perm.requiresReason) {
      const check = validateModificationReason(taskReasonInput);
      if (!check.valid) {
        setError(check.error || 'Debes escribir un motivo para modificar la calificación.');
        return;
      }
    }

    setSaving(true);
    try {
      await apiFetch(`/api/entregas/${ent.id}/calificar`, {
        method: 'PATCH',
        body: JSON.stringify({
          nota: parsed,
          feedback: feedbackInput.trim(),
          ...(perm.requiresReason ? { motivoCambio: taskReasonInput.trim() } : {}),
        }),
      });
      setGradingId(null);
      setTaskReasonInput('');
      setAiSuggestion(null);
      setSuccessMsg('Calificación guardada y publicada para el estudiante.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calificar la entrega.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenExamReview = (intento: IntentoRevisionItem) => {
    setReviewingIntentoId(intento.id);
    setEditingExamGradeId(null);
    const initialScores: Record<string, string> = {};
    for (const p of intento.preguntasWriting) {
      const existing = intento.calificacionManual?.[p.id];
      initialScores[p.id] = existing !== undefined ? String(existing) : '';
    }
    setManualScores(initialScores);
    setExamFeedback(intento.feedbackDocente || '');
    setExamReasonInput('');
    setExamAiRubric(null);
    setSuccessMsg(null);
    setError(null);
  };

  const handleOpenExamDirectGrade = (intento: IntentoRevisionItem) => {
    setEditingExamGradeId(intento.id);
    setReviewingIntentoId(null);
    setExamDirectNota(intento.nota !== null ? String(intento.nota) : '');
    setExamDirectFeedback(intento.feedbackDocente || '');
    setExamDirectReason('');
    setSuccessMsg(null);
    setError(null);
  };

  const handleAiEvaluateExamWriting = async (
    intento: IntentoRevisionItem,
    preguntaId: string,
    consigna: string,
    puntosMaximos: number,
  ) => {
    const texto = String(intento.respuestas?.[preguntaId] ?? '').trim();
    if (texto.length < 10) {
      setError('La respuesta Writing del estudiante es demasiado corta para evaluar con IA.');
      return;
    }
    setAiBusy(true);
    setError(null);
    try {
      const res = await apiFetch<AiRubricSuggestion>('/api/ia/evaluar-writing', {
        method: 'POST',
        body: JSON.stringify({
          consigna,
          textoEstudiante: texto,
          nivelMcer: intento.nivelMcer || 'A2',
          puntajeMaximo: puntosMaximos,
        }),
      });
      setExamAiRubric(res);
      setManualScores((prev) => ({ ...prev, [preguntaId]: String(res.notaSugerida) }));
      setExamFeedback(res.feedbackSugerido);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo sugerir la rúbrica con IA.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSaveExamWritingGrade = async (e: React.FormEvent, intento: IntentoRevisionItem) => {
    e.preventDefault();
    setError(null);
    const calificacionesManuales: Record<string, number> = {};
    for (const p of intento.preguntasWriting) {
      const val = Number(manualScores[p.id]);
      if (!Number.isFinite(val) || val < 0 || val > p.puntos) {
        setError(`Ingresa un puntaje válido entre 0 y ${p.puntos} pts para la pregunta de Writing.`);
        return;
      }
      calificacionesManuales[p.id] = val;
    }

    const perm = evaluateGradeEditPermission({
      rol: usuario.rol,
      existingNota: intento.requiereRevisionDocente ? null : intento.nota,
      notaAsentadaEn: intento.notaAsentadaEn ?? intento.finEn,
    });

    if (!perm.canEdit) {
      setError(
        'Han transcurrido más de 48 horas desde que se asentó la nota del examen. Solo el Administrador Total puede modificarla.',
      );
      return;
    }

    if (perm.requiresReason) {
      const check = validateModificationReason(examReasonInput);
      if (!check.valid) {
        setError(check.error || 'Debes escribir un motivo para modificar la calificación.');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await apiFetch<{ resultado: { nota: number } }>(
        `/api/intentos/${intento.id}/calificar-writing`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            calificacionesManuales,
            feedbackDocente: examFeedback.trim(),
            ...(perm.requiresReason ? { motivoCambio: examReasonInput.trim() } : {}),
          }),
        },
      );
      setReviewingIntentoId(null);
      setExamReasonInput('');
      setExamAiRubric(null);
      setSuccessMsg(`Examen calificado (${res.resultado.nota}/100) y publicado.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calificar el examen.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExamDirectGrade = async (e: React.FormEvent, intento: IntentoRevisionItem) => {
    e.preventDefault();
    setError(null);
    const parsed = Number(examDirectNota);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError('Ingresa una calificación numérica entre 0 y 100.');
      return;
    }

    const perm = evaluateGradeEditPermission({
      rol: usuario.rol,
      existingNota: intento.nota,
      notaAsentadaEn: intento.notaAsentadaEn ?? intento.finEn,
    });

    if (!perm.canEdit) {
      setError(
        'Han transcurrido más de 48 horas desde que se asentó la nota del examen. Solo el Administrador Total puede modificarla.',
      );
      return;
    }

    if (perm.requiresReason) {
      const check = validateModificationReason(examDirectReason);
      if (!check.valid) {
        setError(check.error || 'Debes escribir un motivo para modificar la nota del examen.');
        return;
      }
    }

    setSaving(true);
    try {
      await apiFetch(`/api/intentos/${intento.id}/nota`, {
        method: 'PATCH',
        body: JSON.stringify({
          nota: parsed,
          feedbackDocente: examDirectFeedback.trim(),
          ...(perm.requiresReason ? { motivoCambio: examDirectReason.trim() } : {}),
        }),
      });
      setEditingExamGradeId(null);
      setExamDirectReason('');
      setSuccessMsg(`Nota del examen actualizada a ${parsed}/100.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo modificar la nota del examen.');
    } finally {
      setSaving(false);
    }
  };

  const pendingExamsCount = intentos.filter((i) => i.requiereRevisionDocente).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#011f52]">
            Calificar entregas
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Protocolo de notas: tras asentar una calificación tienes 48 horas para modificarla dejando un motivo obligatorio. Pasado ese plazo, solo el Administrador Total puede ajustarla.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('tareas')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              subTab === 'tareas'
                ? 'bg-[#011f52] text-white border-[#011f52]'
                : 'bg-white text-[#011f52] border-[#d9d9d9] hover:bg-[#f5f6f8]'
            }`}
          >
            Tareas ({entregas.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('examenes')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              subTab === 'examenes'
                ? 'bg-[#011f52] text-white border-[#011f52]'
                : 'bg-white text-[#011f52] border-[#d9d9d9] hover:bg-[#f5f6f8]'
            }`}
          >
            Exámenes ({intentos.length}
            {pendingExamsCount > 0 ? ` · ${pendingExamsCount} pend.` : ''})
          </button>
        </div>
      </div>

      {successMsg && (
        <div role="status" className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          {successMsg}
        </div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-[#475569]">
          Cargando bandeja de calificación...
        </div>
      ) : subTab === 'tareas' ? (
        entregas.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <ClipboardCheck className="w-7 h-7 text-slate-400 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-[#0f172a]">Sin entregas todavía</p>
            <p className="text-xs text-[#475569] mt-1">
              Las tareas y Writings enviados por tus estudiantes aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {entregas.map((ent) => {
              const isEditing = gradingId === ent.id;
              const wordCount = ent.comentario ? countWords(ent.comentario) : 0;
              const perm = evaluateGradeEditPermission({
                rol: usuario.rol,
                existingNota: ent.nota,
                notaAsentadaEn: ent.notaAsentadaEn ?? ent.calificadoEn,
              });

              return (
                <article key={ent.id} className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium text-[#475569]">{ent.tareaTitulo}</p>
                        {ent.tipoTarea === 'WRITING' && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-violet-50 text-violet-900 border-violet-200">
                            Redacción · {wordCount} palabras
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-[#0f172a] mt-0.5">
                        {ent.estudiante
                          ? `${ent.estudiante.apellidos}, ${ent.estudiante.nombres}`
                          : 'Estudiante'}
                      </h3>
                      <p className="text-xs text-[#475569] mt-0.5 tabular-nums">
                        Contrato: {ent.estudiante?.numeroContrato || '—'} · Entregado:{' '}
                        {formatGuayaquilDateTime(ent.entregadoEn)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {ent.archivoUrl && (
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(ent)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-[#2f5597] text-xs font-medium rounded-lg"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Descargar adjunto</span>
                        </button>
                      )}

                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded border ${
                          ent.estado === 'CALIFICADO'
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            : ent.estado === 'TARDIO'
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-slate-50 text-[#0f172a] border-slate-200'
                        }`}
                      >
                        {ent.estado === 'CALIFICADO'
                          ? `Calificado · ${ent.nota}/${ent.notaMaxima ?? 100}`
                          : ent.estado === 'TARDIO'
                            ? 'Entregado tardío'
                            : 'Pendiente de calificar'}
                      </span>

                      {/* Indicador de protocolo 48 horas */}
                      {!perm.isInitialGrade && (
                        perm.lockedAfter48h ? (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded border ${
                              perm.isAdminOverride
                                ? 'bg-[#011f52]/10 text-[#011f52] border-[#011f52]/30'
                                : 'bg-red-50 text-[#cf080d] border-red-200'
                            }`}
                          >
                            <Lock className="w-3 h-3" aria-hidden="true" />
                            <span>
                              {perm.isAdminOverride
                                ? 'Bloqueada (+48h) · Ajuste Admin'
                                : 'Bloqueada (+48h) · Solo Admin'}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded border bg-amber-50 text-amber-900 border-amber-200 tabular-nums">
                            <Clock className="w-3 h-3" aria-hidden="true" />
                            <span>Editable ({perm.hoursRemaining}h restantes)</span>
                          </span>
                        )
                      )}

                      {!isEditing && perm.canEdit && (
                        <button
                          type="button"
                          onClick={() => handleOpenGrade(ent)}
                          className="px-3.5 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-medium rounded-lg whitespace-nowrap"
                        >
                          {ent.estado === 'CALIFICADO'
                            ? perm.isAdminOverride
                              ? 'Modificar (Admin)'
                              : 'Modificar nota'
                            : 'Calificar'}
                        </button>
                      )}
                    </div>
                  </div>

                  {ent.comentario && (
                    <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-[#0f172a] whitespace-pre-wrap leading-relaxed">
                      {ent.comentario}
                    </div>
                  )}

                  {ent.feedback && !isEditing && (
                    <p className="mt-3 text-xs text-[#475569] flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        <strong className="text-[#0f172a]">Feedback:</strong> {ent.feedback}
                      </span>
                    </p>
                  )}

                  {!isEditing && !perm.canEdit && (
                    <p className="mt-3 text-xs text-[#cf080d] bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        Plazo de 48 horas concluido para esta nota. Si requieres un cambio, solicita al Administrador Total.
                      </span>
                    </p>
                  )}

                  <GradeAuditTrail historial={ent.historialNotas} />

                  {isEditing && (
                    <form
                      onSubmit={(e) => handleSaveGrade(e, ent)}
                      className="mt-4 pt-4 border-t border-slate-200 space-y-3"
                    >
                      {ent.comentario && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            disabled={aiBusy}
                            onClick={() => handleAiEvaluateTask(ent)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[#2f5597] text-xs font-semibold rounded-lg disabled:opacity-60"
                          >
                            {aiBusy ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>Sugerir nota y feedback (IA)</span>
                          </button>
                        </div>
                      )}

                      {aiSuggestion && (
                        <div className="p-3 rounded-lg bg-sky-50/60 border border-sky-200 text-xs text-[#0f172a] grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <p><strong>Content:</strong> {aiSuggestion.criterios.content}</p>
                          <p><strong>Communicative:</strong> {aiSuggestion.criterios.communicativeAchievement}</p>
                          <p><strong>Organisation:</strong> {aiSuggestion.criterios.organisation}</p>
                          <p><strong>Language:</strong> {aiSuggestion.criterios.language}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className="sm:col-span-3">
                          <label
                            htmlFor={`nota-${ent.id}`}
                            className="block text-xs font-medium text-[#0f172a] mb-1"
                          >
                            Nota (0–{ent.notaMaxima ?? 100})
                          </label>
                          <input
                            id={`nota-${ent.id}`}
                            type="number"
                            step="0.5"
                            min={0}
                            max={ent.notaMaxima ?? 100}
                            required
                            value={notaInput}
                            onChange={(e) => setNotaInput(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-data"
                          />
                        </div>
                        <div className="sm:col-span-9">
                          <label
                            htmlFor={`fb-${ent.id}`}
                            className="block text-xs font-medium text-[#0f172a] mb-1"
                          >
                            Retroalimentación para el estudiante
                          </label>
                          <input
                            id={`fb-${ent.id}`}
                            type="text"
                            value={feedbackInput}
                            onChange={(e) => setFeedbackInput(e.target.value)}
                            placeholder="Comentarios claros y constructivos..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>

                      {perm.requiresReason && (
                        <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 space-y-1.5">
                          <label
                            htmlFor={`reason-${ent.id}`}
                            className="block text-xs font-bold text-[#011f52]"
                          >
                            Motivo de modificación de nota (obligatorio — quedará en el historial)
                          </label>
                          <input
                            id={`reason-${ent.id}`}
                            type="text"
                            required
                            minLength={5}
                            value={taskReasonInput}
                            onChange={(e) => setTaskReasonInput(e.target.value)}
                            placeholder="Ej. Corrección de puntaje tras revisar adjunto completo del estudiante..."
                            className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs text-[#011f52]"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setGradingId(null)}
                          className="px-3 py-2 text-xs font-medium text-[#475569]"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg whitespace-nowrap disabled:opacity-60"
                        >
                          {saving ? 'Guardando...' : 'Guardar nota'}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )
      ) : intentos.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <PenTool className="w-7 h-7 text-slate-400 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-[#011f52]">
            Sin exámenes enviados todavía
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Cuando un estudiante envíe un cuestionario o examen, aparecerá aquí con su calificación y registro de integridad.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {intentos.map((intento) => {
            const isReviewing = reviewingIntentoId === intento.id;
            const isDirectEditing = editingExamGradeId === intento.id;
            const perm = evaluateGradeEditPermission({
              rol: usuario.rol,
              existingNota: intento.requiereRevisionDocente ? null : intento.nota,
              notaAsentadaEn: intento.notaAsentadaEn ?? intento.finEn,
            });

            return (
              <article key={intento.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-[#011f52]">{intento.quizTitulo}</p>
                    </div>
                    <h3 className="text-base font-semibold text-[#0f172a] mt-0.5">
                      {intento.estudiante.apellidos}, {intento.estudiante.nombres}
                    </h3>
                    <p className="text-xs text-[#475569] mt-0.5 tabular-nums">
                      Enviado: {formatGuayaquilDateTime(intento.finEn)} · {intento.totalPreguntas}{' '}
                      preguntas totales
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {intento.anuladoPorSalida && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded border bg-red-50 text-[#cf080d] border-red-200">
                        <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Anulado por salida (0)</span>
                      </span>
                    )}
                    {!intento.anuladoPorSalida && (intento.cambiosPestanaCount ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded border bg-amber-50 text-amber-900 border-amber-200 tabular-nums">
                        <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{intento.cambiosPestanaCount} cambio(s) de pestaña</span>
                      </span>
                    )}
                    {!intento.anuladoPorSalida && (intento.cambiosPestanaCount ?? 0) === 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded border bg-[#f5f6f8] text-[#011f52] border-[#d9d9d9]">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        <span>Sin alertas de salida</span>
                      </span>
                    )}

                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded border ${
                        intento.anuladoPorSalida
                          ? 'bg-red-50 text-[#cf080d] border-red-200'
                          : intento.requiereRevisionDocente
                            ? 'bg-amber-50 text-amber-900 border-amber-200'
                            : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                      }`}
                    >
                      {intento.requiereRevisionDocente
                        ? 'Pendiente revisión Writing'
                        : `Nota · ${intento.nota ?? 0}/100`}
                    </span>

                    {!perm.isInitialGrade && (
                      perm.lockedAfter48h ? (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded border ${
                            perm.isAdminOverride
                              ? 'bg-[#011f52]/10 text-[#011f52] border-[#011f52]/30'
                              : 'bg-red-50 text-[#cf080d] border-red-200'
                          }`}
                        >
                          <Lock className="w-3 h-3" aria-hidden="true" />
                          <span>
                            {perm.isAdminOverride
                              ? 'Bloqueada (+48h) · Ajuste Admin'
                              : 'Bloqueada (+48h) · Solo Admin'}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded border bg-amber-50 text-amber-900 border-amber-200 tabular-nums">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          <span>Editable ({perm.hoursRemaining}h restantes)</span>
                        </span>
                      )
                    )}

                    {!isReviewing &&
                      !isDirectEditing &&
                      perm.canEdit &&
                      intento.preguntasWriting.length > 0 &&
                      !intento.anuladoPorSalida && (
                        <button
                          type="button"
                          onClick={() => handleOpenExamReview(intento)}
                          className="px-3.5 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-medium rounded-lg"
                        >
                          {intento.requiereRevisionDocente ? 'Revisar Writing' : 'Editar Writing'}
                        </button>
                      )}

                    {!isReviewing &&
                      !isDirectEditing &&
                      perm.canEdit &&
                      !intento.requiereRevisionDocente && (
                        <button
                          type="button"
                          onClick={() => handleOpenExamDirectGrade(intento)}
                          className="px-3 py-1.5 border border-[#011f52] text-[#011f52] hover:bg-[#011f52]/5 text-xs font-semibold rounded-lg"
                        >
                          {perm.isAdminOverride ? 'Ajustar nota (Admin)' : 'Modificar nota'}
                        </button>
                      )}
                  </div>
                </div>

                {intento.motivoAnulacion && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900">
                    <strong>Motivo de anulación:</strong> {intento.motivoAnulacion}
                  </div>
                )}

                {!perm.canEdit && (
                  <p className="text-xs text-[#cf080d] bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Plazo de 48 horas concluido para este examen. Solo el Administrador Total puede modificar la nota.
                    </span>
                  </p>
                )}

                {Array.isArray(intento.eventosIntegridad) && intento.eventosIntegridad.length > 0 && (
                  <div className="p-3 rounded-lg bg-[#f5f6f8] border border-[#d9d9d9] space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#011f52]">
                      Registro de integridad ({intento.eventosIntegridad.length} evento(s))
                    </p>
                    <ul className="space-y-1 text-xs text-slate-700">
                      {intento.eventosIntegridad.slice(-6).map((ev, evIdx) => (
                        <li
                          key={`${ev.timestamp}-${evIdx}`}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span>
                            <strong className="text-[#011f52]">{ev.tipo}</strong>
                            {ev.detalle ? ` · ${ev.detalle}` : ''}
                          </span>
                          <span className="text-[11px] text-slate-500 tabular-nums">
                            {formatGuayaquilDateTime(ev.timestamp)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <GradeAuditTrail historial={intento.historialNotas} />

                {/* Formulario de modificación directa de nota de examen */}
                {isDirectEditing && (
                  <form
                    onSubmit={(e) => handleSaveExamDirectGrade(e, intento)}
                    className="pt-3 border-t border-slate-200 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      <div className="sm:col-span-3">
                        <label
                          htmlFor={`exnota-${intento.id}`}
                          className="block text-xs font-medium text-[#0f172a] mb-1"
                        >
                          Nota final (0–100)
                        </label>
                        <input
                          id={`exnota-${intento.id}`}
                          type="number"
                          step="0.5"
                          min={0}
                          max={100}
                          required
                          value={examDirectNota}
                          onChange={(e) => setExamDirectNota(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-data"
                        />
                      </div>
                      <div className="sm:col-span-9">
                        <label
                          htmlFor={`exdirectfb-${intento.id}`}
                          className="block text-xs font-medium text-[#0f172a] mb-1"
                        >
                          Retroalimentación para el estudiante
                        </label>
                        <input
                          id={`exdirectfb-${intento.id}`}
                          type="text"
                          value={examDirectFeedback}
                          onChange={(e) => setExamDirectFeedback(e.target.value)}
                          placeholder="Comentarios sobre el examen..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>

                    {perm.requiresReason && (
                      <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 space-y-1.5">
                        <label
                          htmlFor={`exdirectreason-${intento.id}`}
                          className="block text-xs font-bold text-[#011f52]"
                        >
                          Motivo de modificación de nota (obligatorio — quedará en el historial)
                        </label>
                        <input
                          id={`exdirectreason-${intento.id}`}
                          type="text"
                          required
                          minLength={5}
                          value={examDirectReason}
                          onChange={(e) => setExamDirectReason(e.target.value)}
                          placeholder="Ej. Recalificación aprobada por revisión de audio..."
                          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs text-[#011f52]"
                        />
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingExamGradeId(null)}
                        className="px-3 py-2 text-xs text-[#475569]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
                      >
                        {saving ? 'Guardando...' : 'Guardar nota'}
                      </button>
                    </div>
                  </form>
                )}

                {intento.preguntasWriting.map((pw) => {
                  const ans = String(intento.respuestas?.[pw.id] ?? '');
                  return (
                    <div
                      key={pw.id}
                      className="p-3.5 rounded-lg bg-[#f8fafc] border border-slate-200 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#0f172a]">
                          Consigna Writing ({pw.puntos} pts): {pw.enunciado}
                        </span>
                        <span className="font-mono-data text-[#475569]">
                          {countWords(ans)} palabras
                        </span>
                      </div>
                      <p className="text-sm text-[#0f172a] whitespace-pre-wrap bg-white p-3 rounded border border-slate-200">
                        {ans || '(El estudiante dejó esta pregunta en blanco)'}
                      </p>

                      {isReviewing && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`wscore-${intento.id}-${pw.id}`}
                              className="text-xs font-medium text-[#0f172a]"
                            >
                              Puntaje Writing (0–{pw.puntos} pts):
                            </label>
                            <input
                              id={`wscore-${intento.id}-${pw.id}`}
                              type="number"
                              step="0.5"
                              min={0}
                              max={pw.puntos}
                              value={manualScores[pw.id] ?? ''}
                              onChange={(e) =>
                                setManualScores((prev) => ({ ...prev, [pw.id]: e.target.value }))
                              }
                              className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-mono-data"
                            />
                          </div>

                          <button
                            type="button"
                            disabled={aiBusy}
                            onClick={() =>
                              handleAiEvaluateExamWriting(intento, pw.id, pw.enunciado, pw.puntos)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[#2f5597] text-xs font-semibold rounded-lg disabled:opacity-60"
                          >
                            {aiBusy ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>Evaluar con rúbrica (IA)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {isReviewing && (
                  <form
                    onSubmit={(e) => handleSaveExamWritingGrade(e, intento)}
                    className="pt-2 space-y-3 border-t border-slate-200"
                  >
                    {examAiRubric && (
                      <div className="p-3 rounded-lg bg-sky-50/60 border border-sky-200 text-xs text-[#0f172a] grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <p><strong>Content:</strong> {examAiRubric.criterios.content}</p>
                        <p><strong>Communicative:</strong> {examAiRubric.criterios.communicativeAchievement}</p>
                        <p><strong>Organisation:</strong> {examAiRubric.criterios.organisation}</p>
                        <p><strong>Language:</strong> {examAiRubric.criterios.language}</p>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor={`exfb-${intento.id}`}
                        className="block text-xs font-medium text-[#0f172a] mb-1"
                      >
                        Retroalimentación docente para el estudiante
                      </label>
                      <input
                        id={`exfb-${intento.id}`}
                        type="text"
                        value={examFeedback}
                        onChange={(e) => setExamFeedback(e.target.value)}
                        placeholder="Comentarios sobre vocabulario, estructura y logro comunicativo..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>

                    {perm.requiresReason && (
                      <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 space-y-1.5">
                        <label
                          htmlFor={`exreason-${intento.id}`}
                          className="block text-xs font-bold text-[#011f52]"
                        >
                          Motivo de modificación de nota (obligatorio — quedará en el historial)
                        </label>
                        <input
                          id={`exreason-${intento.id}`}
                          type="text"
                          required
                          minLength={5}
                          value={examReasonInput}
                          onChange={(e) => setExamReasonInput(e.target.value)}
                          placeholder="Explica por qué se modifica esta calificación..."
                          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs text-[#011f52]"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewingIntentoId(null)}
                        className="px-3 py-2 text-xs text-[#475569]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg whitespace-nowrap disabled:opacity-60"
                      >
                        {saving ? 'Publicando...' : 'Publicar nota final'}
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
