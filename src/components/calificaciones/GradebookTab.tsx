import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import type { AulaUsuario, CalificacionesResponse } from '../../types/aula';

interface GradebookTabProps {
  cursoId: string;
  usuario: AulaUsuario;
  onSelectStudent?: (estudianteId: string) => void;
}

export function GradebookTab({ cursoId, usuario, onSelectStudent }: GradebookTabProps) {
  const [data, setData] = useState<CalificacionesResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setCargando(true);
      setError(null);
      try {
        const res = await apiFetch<CalificacionesResponse>(`/api/cursos/${cursoId}/calificaciones`);
        if (active) setData(res);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar las calificaciones.');
        }
      } finally {
        if (active) setCargando(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [cursoId]);

  const isDocente = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-[#0f172a]">
          {isDocente ? 'Libro de calificaciones del curso' : 'Mis calificaciones'}
        </h2>
        <p className="text-xs text-[#475569] mt-0.5">
          Notas de tareas y quizzes del Aula. Las notas oficiales se replican en la ficha académica
          de ALLEN.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        {cargando ? (
          <div className="p-8 text-sm text-[#475569]">Cargando libro de calificaciones...</div>
        ) : !data || data.filas.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#475569]">
            Sin calificaciones registradas todavía.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-[#475569]">
                <th className="py-3 px-4 min-w-[200px]">Estudiante</th>
                {data.tareas.map((t) => (
                  <th key={t.id} className="py-3 px-4 text-right min-w-[130px]">
                    <span className="block truncate max-w-[160px] ml-auto" title={t.titulo}>
                      {t.titulo}
                    </span>
                    <span className="text-[11px] font-normal text-slate-400">
                      Tarea · /{t.notaMaxima}
                    </span>
                  </th>
                ))}
                {data.quizzes.map((q) => (
                  <th key={q.id} className="py-3 px-4 text-right min-w-[130px]">
                    <span className="block truncate max-w-[160px] ml-auto" title={q.titulo}>
                      {q.titulo}
                    </span>
                    <span className="text-[11px] font-normal text-slate-400">Quiz · /100</span>
                  </th>
                ))}
                <th className="py-3 px-4 text-right min-w-[110px]">Promedio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {data.filas.map((fila) => (
                <tr key={fila.estudiante.id} className="hover:bg-slate-50/80">
                  <td className="py-3 px-4">
                    {isDocente && onSelectStudent ? (
                      <button
                        type="button"
                        onClick={() => onSelectStudent(fila.estudiante.id)}
                        className="font-medium text-[#2f5597] hover:underline text-left"
                      >
                        {fila.estudiante.apellidos}, {fila.estudiante.nombres}
                      </button>
                    ) : (
                      <span className="font-medium text-[#0f172a]">
                        {fila.estudiante.apellidos}, {fila.estudiante.nombres}
                      </span>
                    )}
                    <span className="block text-xs text-[#475569] font-mono-data">
                      {fila.estudiante.numeroContrato || '—'}
                    </span>
                  </td>

                  {fila.notasTareas.map((nt) => (
                    <td key={nt.tareaId} className="py-3 px-4 text-right font-mono-data text-sm">
                      {nt.nota !== null ? (
                        <span className="font-semibold text-[#0f172a]">{nt.nota.toFixed(1)}</span>
                      ) : (
                        <span className="text-xs text-[#475569] font-sans">
                          {nt.estado === 'ENTREGADO' ? 'Por calificar' : 'Sin entrega'}
                        </span>
                      )}
                    </td>
                  ))}

                  {fila.notasQuizzes.map((nq) => (
                    <td key={nq.quizId} className="py-3 px-4 text-right font-mono-data text-sm">
                      {nq.nota !== null ? (
                        <span
                          className={`font-semibold ${
                            nq.nota >= nq.notaMinima ? 'text-emerald-800' : 'text-amber-800'
                          }`}
                        >
                          {nq.nota.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-[#475569] font-sans">Sin intento</span>
                      )}
                    </td>
                  ))}

                  <td className="py-3 px-4 text-right font-mono-data font-bold text-[#0f172a]">
                    {fila.promedio !== null ? `${fila.promedio.toFixed(1)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
