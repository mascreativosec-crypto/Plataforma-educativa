import React from 'react';
import { Megaphone, Clock } from 'lucide-react';
import { formatGuayaquilDate } from '../../lib/api';
import type { AnuncioItem, TareaItem } from '../../types/aula';

interface RightBlocksProps {
  tareas: TareaItem[];
  anuncios: AnuncioItem[];
  progresoCurso?: number;
  isDocente?: boolean;
  onOpenTab: (tab: 'anuncios' | 'tareas') => void;
}

export function RightBlocks({
  tareas,
  anuncios,
  progresoCurso,
  isDocente = false,
  onOpenTab,
}: RightBlocksProps) {
  const upcomingTareas = tareas.filter((t) => t.venceEn).slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Bloque Progreso del curso (Estudiante) */}
      {!isDocente && typeof progresoCurso === 'number' && (
        <section className="bg-white border border-[#d9d9d9] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <h3 className="font-display text-sm font-semibold text-[#011f52]">
              Progreso del curso
            </h3>
            <span className="font-mono-data font-bold text-[#011f52]">{progresoCurso}%</span>
          </div>
          <div
            className="h-2 bg-[#d9d9d9]/70 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={progresoCurso}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso del curso"
          >
            <div
              className="h-full bg-[#cf080d] transition-all"
              style={{ width: `${progresoCurso}%` }}
            />
          </div>
        </section>
      )}

      {/* Bloque Próximos eventos */}
      <section className="bg-white border border-[#d9d9d9] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-[#011f52] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
            <span>Próximos eventos</span>
          </h3>
          <button
            type="button"
            onClick={() => onOpenTab('tareas')}
            className="text-xs font-medium text-[#011f52] hover:text-[#cf080d]"
          >
            Ver tareas
          </button>
        </div>
        {upcomingTareas.length === 0 ? (
          <p className="text-xs text-slate-600">Sin vencimientos programados.</p>
        ) : (
          <ul className="space-y-3">
            {upcomingTareas.map((t) => (
              <li
                key={t.id}
                className="text-xs border-b border-[#d9d9d9]/60 pb-2.5 last:border-0 last:pb-0"
              >
                <p className="font-semibold text-[#011f52] leading-snug">{t.titulo}</p>
                <p className="text-slate-600 mt-0.5 tabular-nums">
                  Vence: {formatGuayaquilDate(t.venceEn)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bloque Anuncios recientes */}
      <section className="bg-white border border-[#d9d9d9] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-[#011f52] flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[#011f52]" aria-hidden="true" />
            <span>Anuncios recientes</span>
          </h3>
          <button
            type="button"
            onClick={() => onOpenTab('anuncios')}
            className="text-xs font-medium text-[#011f52] hover:text-[#cf080d]"
          >
            Ver todos
          </button>
        </div>
        {anuncios.length === 0 ? (
          <p className="text-xs text-slate-600">Sin anuncios publicados.</p>
        ) : (
          <ul className="space-y-3">
            {anuncios.slice(0, 2).map((a) => (
              <li
                key={a.id}
                className="text-xs border-b border-[#d9d9d9]/60 pb-2.5 last:border-0 last:pb-0"
              >
                <p className="font-semibold text-[#011f52] leading-snug">{a.titulo}</p>
                <p className="text-slate-600 mt-0.5 line-clamp-2">{a.mensaje}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

