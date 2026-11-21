import React, { useEffect, useRef } from 'react';
import {
  Bold,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  RemoveFormatting,
  Underline,
} from 'lucide-react';

interface SimpleRichTextEditorProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClass?: string;
}

/**
 * Editor visual sencillo para docentes (sin código HTML visible).
 * Permite dar formato tipo procesador de texto (negrita, cursiva, listas, subtítulos)
 * y genera HTML limpio que el servidor sanea automáticamente al guardar.
 */
export function SimpleRichTextEditor({
  id = 'simple-rich-editor',
  label,
  value,
  onChange,
  placeholder = 'Escribe aquí el contenido de tu lección...',
  minHeightClass = 'min-h-[160px]',
}: SimpleRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedRef = useRef<string>(value);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastEmittedRef.current && el.innerHTML !== value) {
      el.innerHTML = value || '';
      lastEmittedRef.current = value;
    }
  }, [value]);

  // Inicialización en el primer montaje
  useEffect(() => {
    const el = editorRef.current;
    if (el && value && el.innerHTML !== value) {
      el.innerHTML = value;
      lastEmittedRef.current = value;
    }
  }, []);

  const syncValue = () => {
    const el = editorRef.current;
    if (!el) return;
    const rawHtml = el.innerHTML;
    const textOnly = (el.textContent || '').trim();
    const cleaned = textOnly.length === 0 ? '' : rawHtml;
    lastEmittedRef.current = cleaned;
    onChange(cleaned);
  };

  const applyFormat = (command: string, arg?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand(command, false, arg);
    } catch {
      // Ignorar si el navegador bloquea un comando opcional
    }
    syncValue();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const plain = e.clipboardData.getData('text/plain');
    if (!plain) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand('insertText', false, plain);
    } catch {
      el.textContent = `${el.textContent || ''}${plain}`;
    }
    syncValue();
  };

  const isEmpty = !value || value.replace(/<[^>]+>/g, '').trim().length === 0;

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[#011f52]">
          {label}
        </label>
      )}

      <div className="border border-slate-300 rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-[#011f52]/20 focus-within:border-[#011f52] transition-colors">
        {/* Barra de herramientas visual sencilla */}
        <div
          role="toolbar"
          aria-label="Herramientas de formato de texto"
          className="flex flex-wrap items-center gap-1 px-2.5 py-2 bg-[#f5f6f8] border-b border-slate-200"
        >
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat('bold');
            }}
            title="Negrita"
            aria-label="Negrita"
            className="p-1.5 rounded-md text-[#011f52] hover:bg-white hover:shadow-xs transition-colors"
          >
            <Bold className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat('italic');
            }}
            title="Cursiva"
            aria-label="Cursiva"
            className="p-1.5 rounded-md text-[#011f52] hover:bg-white hover:shadow-xs transition-colors"
          >
            <Italic className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat('underline');
            }}
            title="Subrayado"
            aria-label="Subrayado"
            className="p-1.5 rounded-md text-[#011f52] hover:bg-white hover:shadow-xs transition-colors"
          >
            <Underline className="w-4 h-4" aria-hidden="true" />
          </button>

          <span className="w-px h-5 bg-slate-300 mx-1" aria-hidden="true" />

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat('formatBlock', 'H3');
            }}
            title="Subtítulo"
            aria-label="Subtítulo"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-[#011f52] hover:bg-white hover:shadow-xs transition-colors"
          >
            <Heading3 className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Subtítulo</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat('formatBlock', 'P');
            }}
            title="Texto normal"
            aria-label="Texto normal"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-[#011f52] hover:bg-white hover:shadow-xs transition-colors"
          >
            <Pilcrow className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Normal</span>
          </button>

          <span className="w-px h-5 bg-slate-300 mx-1" aria-hidden="true" />

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat('insertUnorderedList');
            }}
            title="Lista con viñetas"
            aria-label="Lista con viñetas"
            className="p-1.5 rounded-md text-[#011f52] hover:bg-white hover:shadow-xs transition-colors"
          >
            <List className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat('insertOrderedList');
            }}
            title="Lista numerada"
            aria-label="Lista numerada"
            className="p-1.5 rounded-md text-[#011f52] hover:bg-white hover:shadow-xs transition-colors"
          >
            <ListOrdered className="w-4 h-4" aria-hidden="true" />
          </button>

          <span className="w-px h-5 bg-slate-300 mx-1" aria-hidden="true" />

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat('removeFormat');
            }}
            title="Quitar formato"
            aria-label="Quitar formato"
            className="p-1.5 rounded-md text-slate-600 hover:text-[#011f52] hover:bg-white transition-colors"
          >
            <RemoveFormatting className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Área de escritura visual */}
        <div className="relative">
          {isEmpty && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-3 left-3.5 right-3.5 text-sm text-slate-400 select-none"
            >
              {placeholder}
            </div>
          )}
          <div
            id={id}
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            aria-label={label || 'Contenido de la lección'}
            contentEditable
            suppressContentEditableWarning
            onInput={syncValue}
            onBlur={syncValue}
            onPaste={handlePaste}
            className={`lesson-prose text-sm text-slate-800 px-3.5 py-3 ${minHeightClass} focus:outline-none`}
          />
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        Escribe y da formato normalmente como en Word o Google Docs. No necesitas usar ningún código.
      </p>
    </div>
  );
}
