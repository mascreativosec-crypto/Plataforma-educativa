import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface UnsavedChangesDialogProps {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirmDiscard: () => void;
  onContinueEditing: () => void;
}

export function UnsavedChangesDialog({
  open,
  title = '¿Salir sin guardar los cambios?',
  message = 'Tienes cambios sin guardar. Si sales ahora, perderás el avance que has escrito.',
  confirmLabel = 'Descartar cambios',
  cancelLabel = 'Seguir editando',
  onConfirmDiscard,
  onContinueEditing,
}: UnsavedChangesDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
        aria-describedby="unsaved-dialog-desc"
        className="bg-white border border-[#d9d9d9] rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="p-5 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-700" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3
              id="unsaved-dialog-title"
              className="font-display text-base font-bold text-[#011f52]"
            >
              {title}
            </h3>
            <p id="unsaved-dialog-desc" className="text-sm text-slate-600 mt-1 leading-relaxed">
              {message}
            </p>
          </div>
        </div>
        <div className="px-5 py-3.5 bg-[#f5f6f8] border-t border-[#d9d9d9] flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onContinueEditing}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-[#011f52] border border-[#d9d9d9] text-xs font-semibold rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirmDiscard}
            className="px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
