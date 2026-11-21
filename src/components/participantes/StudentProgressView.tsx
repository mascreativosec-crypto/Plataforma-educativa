import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardCheck, HelpCircle } from 'lucide-react';
import { apiFetch, formatGuayaquilDateTime } from '../../lib/api';
import type { EstudianteProgresoResponse } from '../../types/aula';

interface StudentProgressViewProps {
  estudianteId: string;
  onBack: () => void;
}

export function StudentProgressView({ estudianteId, onBack }: StudentProgressViewProps) {
  const [data, setData] = useState<EstudianteProgresoResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setCargando(true);
      setError(null);
      try {
        const res = await apiFetch<EstudianteProgresoResponse>(
          `/api/estudiantes/${estudianteId}/progreso`,
        );
        if (active) setData(res);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el progreso.');
        }
      } finally {
        if (active) setCargando(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [estudianteId]);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-[#2f5597] hover:underline"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Volver al curso</span>
      </button>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {cargando || !data ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-[#475569]">
          Cargando progreso individual...
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-[#475569]">Espejo de estudiante · CRM ALLEN</p>
              <h1 className="font-display text-2xl font-bold text-[#0f172a] mt-0.5">
                {data.estudiante.nombres} {data.estudiante.apellidos}
              </h1>
              <p className="text-sm text-[#475569] mt-1">
                Contrato:{' '}
                <span className="font-mono-data text-[#0f172a]">
                  {data.estudiante.numeroContrato || '—'}
                </span>{' '}
                · {data.estudiante.email || 'Sin correo'}
              </p>
            </div>
            <div className="flex items-center gap-6 text-right tabular-nums">
              <div>
                <p className="text-xs text-[#475569]">Lecciones completadas</p>
                <p className="font-mono-data text-2xl font-bold text-[#0f172a]">
                  {data.progresos.filter((p) => p.estado === 'COMPLETADA').length}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#475569]">Entregas</p>
                <p className="font-mono-data text-2xl font-bold text-[#0f172a]">
                  {data.entregas.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#475569]">Quizzes rendidos</p>
                <p className="font-mono-data text-2xl font-bold text-[#0f172a]">
                  {data.intentos.length}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-display text-base font-semibold text-[#0f172a] flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-[#2f5597]" aria-hidden="true" />
                <span>Avance por lección</span>
              </h2>
              {data.progresos.length === 0 ? (
                <p className="text-sm text-[#475569]">Sin lecciones iniciadas todavía.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.progresos.map((p) => (
                    <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="text-[#0f172a]">{p.leccionTitulo}</span>
                      <span className="font-mono-data text-xs font-semibold text-emerald-800 shrink-0">
                        {p.porcentaje}% · {p.estado === 'COMPLETADA' ? 'Completada' : 'En progreso'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-display text-base font-semibold text-[#0f172a] flex items-center gap-2 mb-4">
                <ClipboardCheck className="w-4 h-4 text-[#2f5597]" aria-hidden="true" />
                <span>Entregas de tareas</span>
              </h2>
              {data.entregas.length === 0 ? (
                <p className="text-sm text-[#475569]">Sin entregas registradas.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.entregas.map((e) => (
                    <li key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-[#0f172a]">{e.tareaTitulo}</p>
                        <p className="text-xs text-[#475569]">
                          {formatGuayaquilDateTime(e.entregadoEn)}
                        </p>
                      </div>
                      <span className="font-mono-data text-xs font-semibold text-[#0f172a] shrink-0">
                        {e.nota !== null ? `${e.nota}/${e.notaMaxima}` : e.estado}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-display text-base font-semibold text-[#0f172a] flex items-center gap-2 mb-4">
              <HelpCircle className="w-4 h-4 text-[#2f5597]" aria-hidden="true" />
              <span>Intentos de quizzes</span>
            </h2>
            {data.intentos.length === 0 ? (
              <p className="text-sm text-[#475569]">Sin intentos de quizzes registrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {data.intentos.map((i) => (
                  <li key={i.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-[#0f172a]">{i.quizTitulo}</p>
                      <p className="text-xs text-[#475569]">
                        {formatGuayaquilDateTime(i.finEn || i.inicioEn)}
                      </p>
                    </div>
                    <span className="font-mono-data text-xs font-semibold text-[#0f172a]">
                      {i.nota !== null ? `${i.nota}/100` : i.estado}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
