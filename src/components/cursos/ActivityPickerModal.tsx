import React, { useState } from 'react';
import {
  BookOpen,
  ClipboardCheck,
  Cloud,
  FileAudio,
  FileText,
  HelpCircle,
  Link2,
  MessageSquareHeart,
  PenTool,
  Search,
  X,
} from 'lucide-react';

export type ActivityPickerChoice =
  | 'leccion'
  | 'archivo'
  | 'google_drive'
  | 'enlace'
  | 'tarea'
  | 'writing'
  | 'examen'
  | 'saludo';

interface ActivityPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (choice: ActivityPickerChoice) => void;
}

interface PickerItem {
  id: ActivityPickerChoice;
  label: string;
  desc: string;
  category: 'actividades' | 'recursos';
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}

const ITEMS: PickerItem[] = [
  {
    id: 'examen',
    label: 'Nuevo cuestionario / Examen',
    desc: 'Tiempo límite, opción múltiple, V/F, respuesta corta o redacción abierta.',
    category: 'actividades',
    icon: HelpCircle,
    accentClass: 'bg-sky-50 text-[#011f52] border-sky-200',
  },
  {
    id: 'tarea',
    label: 'Tarea evaluable',
    desc: 'Entrega de archivos o enlace de Drive con calificación en línea.',
    category: 'actividades',
    icon: ClipboardCheck,
    accentClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  {
    id: 'writing',
    label: 'Actividad de redacción (Writing)',
    desc: 'Ejercicio de escritura con conteo de palabras y revisión del docente.',
    category: 'actividades',
    icon: PenTool,
    accentClass: 'bg-violet-50 text-violet-800 border-violet-200',
  },
  {
    id: 'saludo',
    label: 'Saludo / Greeting',
    desc: 'Mensaje de bienvenida fijado en la cabecera del curso para motivar al grupo.',
    category: 'actividades',
    icon: MessageSquareHeart,
    accentClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  {
    id: 'google_drive',
    label: 'Recurso Google Drive',
    desc: 'Enlaza PDFs, audios o packs desde Google Drive con descarga directa sin saturar el servidor.',
    category: 'recursos',
    icon: Cloud,
    accentClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    id: 'archivo',
    label: 'Archivo PDF / Audio / Video',
    desc: 'Sube PDF, audio MP3 reproducible en línea o video privado con descarga firmada.',
    category: 'recursos',
    icon: FileAudio,
    accentClass: 'bg-red-50 text-red-700 border-red-200',
  },
  {
    id: 'enlace',
    label: 'URL / Enlace web',
    desc: 'Conecta diccionarios Cambridge, videos educativos o herramientas externas.',
    category: 'recursos',
    icon: Link2,
    accentClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  {
    id: 'leccion',
    label: 'Nueva lección',
    desc: 'Crea una página de contenido estructurado dentro de una unidad del curso.',
    category: 'recursos',
    icon: BookOpen,
    accentClass: 'bg-slate-100 text-[#0f172a] border-slate-200',
  },
];

export function ActivityPickerModal({ open, onClose, onSelect }: ActivityPickerModalProps) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'todos' | 'actividades' | 'recursos'>('todos');

  if (!open) return null;

  const filtered = ITEMS.filter((item) => {
    const matchesTab = tab === 'todos' || item.category === tab;
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q || item.label.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q);
    return matchesTab && matchesQuery;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Añadir una actividad o recurso"
    >
      <div className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0f172a]">
              Añadir una actividad o un recurso
            </h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Selecciona qué deseas incorporar en el aula virtual.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar selector de actividades"
            className="p-1.5 rounded-lg text-[#475569] hover:text-[#0f172a] hover:bg-slate-100"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 pt-4 pb-3 border-b border-slate-100 space-y-3">
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar actividad o recurso (ej. Google Drive, Writing, Examen, Saludo)..."
              aria-label="Buscar actividad o recurso"
              className="w-full pl-9 pr-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#2f5597]"
            />
          </div>

          <div className="flex items-center gap-4 text-xs font-medium border-b border-slate-200">
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'actividades', label: 'Actividades' },
                { id: 'recursos', label: 'Recursos' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`pb-2 border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-[#2f5597] text-[#0f172a]'
                    : 'border-transparent text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-full py-8 text-center text-sm text-[#475569]">
              <FileText className="w-6 h-6 mx-auto mb-2 text-slate-400" aria-hidden="true" />
              No se encontraron actividades o recursos con ese filtro.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  className="text-left p-4 rounded-xl border border-slate-200 hover:border-[#2f5597] hover:bg-sky-50/30 transition-colors flex items-start gap-3"
                >
                  <span
                    className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${item.accentClass}`}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0f172a]">{item.label}</p>
                    <p className="text-xs text-[#475569] mt-0.5 leading-snug">{item.desc}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
