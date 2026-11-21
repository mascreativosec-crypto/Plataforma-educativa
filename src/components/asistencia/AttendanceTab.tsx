import React, { useEffect, useState } from 'react';
import { CalendarCheck2, CheckCircle2, Clock, Info, XCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { AsistenciaResponse, AulaUsuario } from '../../types/aula';

interface AttendanceTabProps {
  cursoId: string;
  usuario: AulaUsuario;
}

const ESTADO_STYLES: Record<string, { label: string; className: string }> = {
  PRESENTE: {
    label: 'Presente',
    className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  },
  TARDANZA: {
    label: 'Tardanza',
    className: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  JUSTIFICADA: {
    label: 'Justificada',
    className: 'bg-sky-50 text-sky-900 border-sky-200',
  },
  AUSENTE: {
    label: 'Ausente',
    className: 'bg-red-50 text-red-900 border-red-200',
  },
};

export function AttendanceTab({ cursoId, usuario }: AttendanceTabProps) {
  const isDocente = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';
  const [data, setData] = useState<AsistenciaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<AsistenciaResponse>(`/api/cursos/${cursoId}/asistencia`);
        if (active) setData(res);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'No se pudo cargar el registro de asistencia.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [cursoId]);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-[#475569]">
        Cargando historial de asistencia desde ALLEN CRM...
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const summary = isDocente ? data.resumenGlobal : data.resumen;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#0f172a]">
            {isDocente ? 'Asistencia sincronizada del curso' : 'Mi registro de asistencia'}
          </h2>
          <p className="text-xs text-[#475569] mt-0.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#2f5597] shrink-0" aria-hidden="true" />
            <span>
              Sincronizado automáticamente desde <strong>ALLEN CRM</strong> (consulta de solo
              lectura; la toma de lista oficial se gestiona en ALLEN).
            </span>
          </p>
        </div>
        <span className="text-xs font-medium text-[#2f5597] bg-sky-50 border border-sky-200 px-2.5 py-1 rounded">
          Fuente: {data.origen || 'ALLEN CRM'}
        </span>
      </div>

      {/* KPI Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-[#475569]">Asistencia efectiva</p>
            <p className="font-display text-2xl font-bold text-[#2f5597] mt-1 tabular-nums">
              {summary.porcentajeAsistencia}%
            </p>
            <p className="text-[11px] text-[#475569] mt-0.5 tabular-nums">
              {summary.total} sesiones
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-[#475569] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
              Presentes
            </p>
            <p className="font-display text-2xl font-bold text-[#0f172a] mt-1 tabular-nums">
              {summary.presentes}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-[#475569] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
              Tardanzas
            </p>
            <p className="font-display text-2xl font-bold text-[#0f172a] mt-1 tabular-nums">
              {summary.tardanzas}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-[#475569] flex items-center gap-1">
              <CalendarCheck2 className="w-3.5 h-3.5 text-sky-700" aria-hidden="true" />
              Justificadas
            </p>
            <p className="font-display text-2xl font-bold text-[#0f172a] mt-1 tabular-nums">
              {summary.justificadas}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-[#475569] flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 text-red-700" aria-hidden="true" />
              Ausentes
            </p>
            <p className="font-display text-2xl font-bold text-[#0f172a] mt-1 tabular-nums">
              {summary.ausentes}
            </p>
          </div>
        </div>
      )}

      {/* Vista Docente: Resumen por estudiante */}
      {isDocente && data.resumenPorEstudiante && data.resumenPorEstudiante.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="font-display text-sm font-semibold text-[#0f172a]">
              Resumen por estudiante
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-[#475569]">
                  <th className="py-2.5 px-4 font-semibold">Estudiante</th>
                  <th className="py-2.5 px-4 font-semibold">Contrato</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Presentes</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Tardanzas</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Ausentes</th>
                  <th className="py-2.5 px-4 font-semibold text-right">% Asistencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.resumenPorEstudiante.map((row) => (
                  <tr key={row.estudiante.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-medium text-[#0f172a]">
                      {row.estudiante.apellidos}, {row.estudiante.nombres}
                    </td>
                    <td className="py-3 px-4 font-mono-data text-xs text-[#475569]">
                      {row.estudiante.numeroContrato || '—'}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">{row.resumen.presentes}</td>
                    <td className="py-3 px-4 text-right tabular-nums">{row.resumen.tardanzas}</td>
                    <td className="py-3 px-4 text-right tabular-nums">{row.resumen.ausentes}</td>
                    <td className="py-3 px-4 text-right font-semibold tabular-nums text-[#2f5597]">
                      {row.resumen.porcentajeAsistencia}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Historial detallado de sesiones */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-display text-sm font-semibold text-[#0f172a]">
            Detalle de sesiones ({data.registros.length})
          </h3>
        </div>
        {data.registros.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#475569]">
            Aún no se han recibido registros de asistencia desde ALLEN CRM para este curso.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-[#475569]">
                  <th className="py-2.5 px-4 font-semibold">Fecha</th>
                  {isDocente && <th className="py-2.5 px-4 font-semibold">Estudiante</th>}
                  <th className="py-2.5 px-4 font-semibold">Tema de clase</th>
                  <th className="py-2.5 px-4 font-semibold">Estado</th>
                  <th className="py-2.5 px-4 font-semibold">Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.registros.map((reg) => {
                  const style = ESTADO_STYLES[reg.estado] || ESTADO_STYLES.AUSENTE;
                  return (
                    <tr key={reg.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono-data text-xs text-[#0f172a] whitespace-nowrap">
                        {reg.fecha}
                      </td>
                      {isDocente && (
                        <td className="py-3 px-4 text-xs font-medium text-[#0f172a]">
                          {reg.estudianteNombre || reg.estudianteId}
                        </td>
                      )}
                      <td className="py-3 px-4 text-sm text-[#0f172a]">{reg.tema || 'Sesión regular'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${style.className}`}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#475569]">{reg.observacion || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
