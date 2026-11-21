import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch, formatGuayaquilDateTime } from '../../lib/api';
import type { OutboxEventItem } from '../../types/aula';

export function OutboxView() {
  const [eventos, setEventos] = useState<OutboxEventItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await apiFetch<{ eventos: OutboxEventItem[] }>('/api/outbox');
      setEventos(data.eventos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la cola de eventos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    setError(null);
    try {
      await apiFetch(`/api/outbox/${id}/reintentar`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reintentar el envío.');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-[#d9d9d9]">
        <div>
          <p className="text-xs text-slate-600 mb-1">Integración HTTP + HMAC-SHA256</p>
          <h2 className="font-display text-lg sm:text-xl font-bold text-[#011f52]">
            Sincronización de notas hacia ALLEN
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Cola Outbox (<span className="font-mono-data">evento_aula</span>) con reintentos
            automáticos (1 min, 5 min, 30 min, 2 h, 6 h) e idempotencia por{' '}
            <span className="font-mono-data">origenId</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#f5f6f8] border border-[#d9d9d9] text-sm font-medium text-[#011f52] rounded-lg whitespace-nowrap"
        >
          <RefreshCw className="w-4 h-4 text-[#011f52]" aria-hidden="true" />
          <span>Actualizar lista</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        {cargando ? (
          <div className="p-8 text-sm text-[#475569]">Cargando eventos Outbox...</div>
        ) : eventos.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#475569]">
            Sin eventos registrados en la cola de sincronización.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-[#475569]">
                <th className="py-3 px-4">Tipo de evento</th>
                <th className="py-3 px-4">Detalle</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Intentos</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {eventos.map((ev) => {
                const actividad =
                  typeof ev.payload?.actividad === 'string'
                    ? ev.payload.actividad
                    : typeof ev.payload?.plantilla === 'string'
                      ? `Notificación ${ev.payload.plantilla}`
                      : 'Evento del aula';
                const nota = typeof ev.payload?.nota === 'number' ? ev.payload.nota : null;

                return (
                  <tr key={ev.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono-data text-xs text-[#0f172a]">{ev.tipo}</td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-[#0f172a]">{actividad}</p>
                      {nota !== null && (
                        <p className="text-xs text-[#475569] font-mono-data">Nota: {nota}/100</p>
                      )}
                      {ev.ultimoError && (
                        <p className="text-xs text-amber-800 mt-0.5 max-w-md">{ev.ultimoError}</p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          ev.estado === 'ENVIADO'
                            ? 'text-emerald-800'
                            : ev.estado === 'FALLIDO'
                              ? 'text-red-800'
                              : 'text-amber-800'
                        }`}
                      >
                        {ev.estado === 'ENVIADO'
                          ? 'Enviado'
                          : ev.estado === 'FALLIDO'
                            ? 'Fallido'
                            : 'Pendiente'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data text-xs text-[#0f172a]">
                      {ev.intentos}/5
                    </td>
                    <td className="py-3 px-4 text-xs text-[#475569] tabular-nums">
                      {formatGuayaquilDateTime(ev.enviadoEn || ev.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {ev.estado !== 'ENVIADO' && (
                        <button
                          type="button"
                          disabled={retryingId === ev.id}
                          onClick={() => handleRetry(ev.id)}
                          className="px-3 py-1.5 text-xs font-medium text-[#2f5597] border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                        >
                          {retryingId === ev.id ? 'Reintentando...' : 'Reintentar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
