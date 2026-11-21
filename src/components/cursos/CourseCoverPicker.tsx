import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Link2, Upload } from 'lucide-react';
import { resolveCourseCoverUrl } from '../../lib/course-cover';

export const COURSE_COVER_PRESETS = [
  {
    label: 'Estudio académico A2',
    url: '/src/assets/images/course_english_a2_1795125510232.jpg',
  },
  {
    label: 'Comunicación ejecutiva B2',
    url: '/src/assets/images/course_english_b2_1795125510227.jpg',
  },
  {
    label: 'Preparación Cambridge',
    url: '/src/assets/images/course_cambridge_prep_1795125510290.jpg',
  },
];

type CoverMode = 'drive' | 'upload' | 'preset';

interface CourseCoverPickerProps {
  value: string;
  onChange: (nextUrl: string) => void;
  idPrefix?: string;
}

function detectInitialMode(url: string): CoverMode {
  if (!url) return 'preset';
  if (url.startsWith('data:image/')) return 'upload';
  if (COURSE_COVER_PRESETS.some((p) => p.url === url)) return 'preset';
  return 'drive';
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
    el.src = rawDataUrl;
  });

  const maxWidth = 960;
  const maxHeight = 640;
  let { width, height } = img;
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawDataUrl;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', 0.82);
}

export function CourseCoverPicker({
  value,
  onChange,
  idPrefix = 'cover',
}: CourseCoverPickerProps) {
  const [mode, setMode] = useState<CoverMode>(() => detectInitialMode(value));
  const [rawLinkInput, setRawLinkInput] = useState(() =>
    value && !value.startsWith('data:image/') && !COURSE_COVER_PRESETS.some((p) => p.url === value)
      ? value
      : '',
  );
  const [helperError, setHelperError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLinkChange = (input: string) => {
    setRawLinkInput(input);
    setHelperError(null);
    setPreviewFailed(false);
    const trimmed = input.trim();
    if (!trimmed) {
      onChange('');
      return;
    }
    const resolved = resolveCourseCoverUrl(trimmed);
    if (!resolved.valid) {
      setHelperError(
        resolved.error ||
          'Enlace no válido. Pega un enlace público de Google Drive o una URL https:// de imagen.',
      );
      return;
    }
    onChange(resolved.normalizedUrl);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHelperError(null);
    setPreviewFailed(false);

    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      setHelperError('Solo se admiten imágenes JPG, PNG o WEBP.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setHelperError('La imagen supera los 8 MB. Elige un archivo más liviano.');
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressImageFileToDataUrl(file);
      const validated = resolveCourseCoverUrl(compressed);
      if (!validated.valid) {
        setHelperError(
          validated.error ||
            'La imagen procesada supera el límite permitido. Intenta con una foto más pequeña.',
        );
        return;
      }
      onChange(validated.normalizedUrl);
    } catch (err) {
      setHelperError(err instanceof Error ? err.message : 'No se pudo procesar la imagen.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const resolvedPreview = value ? resolveCourseCoverUrl(value) : null;
  const activePreviewUrl = resolvedPreview?.valid ? resolvedPreview.previewUrl : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#011f52]">Portada del curso</span>
        <div
          role="tablist"
          aria-label="Origen de portada del curso"
          className="inline-flex rounded-lg bg-[#f5f6f8] p-0.5 border border-[#d9d9d9]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'drive'}
            onClick={() => {
              setMode('drive');
              setHelperError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              mode === 'drive'
                ? 'bg-[#011f52] text-white'
                : 'text-slate-600 hover:text-[#011f52]'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Google Drive / URL</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'upload'}
            onClick={() => {
              setMode('upload');
              setHelperError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              mode === 'upload'
                ? 'bg-[#011f52] text-white'
                : 'text-slate-600 hover:text-[#011f52]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Subir foto</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'preset'}
            onClick={() => {
              setMode('preset');
              setHelperError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              mode === 'preset'
                ? 'bg-[#011f52] text-white'
                : 'text-slate-600 hover:text-[#011f52]'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Galería</span>
          </button>
        </div>
      </div>

      {mode === 'drive' && (
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-drive-url`} className="sr-only">
            Enlace de Google Drive o URL de imagen
          </label>
          <input
            id={`${idPrefix}-drive-url`}
            type="url"
            value={rawLinkInput}
            onChange={(e) => handleLinkChange(e.target.value)}
            placeholder="https://drive.google.com/file/d/.../view o URL de imagen"
            className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-xs text-[#011f52] focus:border-[#011f52] focus:outline-none"
          />
          <p className="text-[11px] text-slate-500">
            Si usas Google Drive, asegúrate de compartir el archivo como &ldquo;Cualquier persona con el enlace&rdquo;.
          </p>
        </div>
      )}

      {mode === 'upload' && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-dashed border-[#011f52]/30 bg-[#f5f6f8]">
          <input
            ref={fileInputRef}
            id={`${idPrefix}-file-upload`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="sr-only"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{uploading ? 'Optimizando imagen...' : 'Seleccionar imagen desde tu equipo'}</span>
          </button>
          <span className="text-[11px] text-slate-600">
            JPG, PNG o WEBP · Se optimiza automáticamente para cargar rápido.
          </span>
        </div>
      )}

      {mode === 'preset' && (
        <div className="grid grid-cols-3 gap-2">
          {COURSE_COVER_PRESETS.map((opt) => {
            const selected = value === opt.url;
            return (
              <button
                key={opt.url}
                type="button"
                onClick={() => {
                  setPreviewFailed(false);
                  setHelperError(null);
                  onChange(opt.url);
                }}
                className={`text-left rounded-lg overflow-hidden border transition-colors ${
                  selected
                    ? 'border-[#cf080d] ring-2 ring-[#cf080d]/25'
                    : 'border-[#d9d9d9] hover:border-[#011f52]'
                }`}
              >
                <img
                  src={opt.url}
                  alt={opt.label}
                  className="w-full h-14 object-cover bg-slate-100"
                />
                <span className="block px-2 py-1 text-[11px] font-medium text-[#011f52] truncate bg-white">
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {helperError && (
        <p role="alert" className="text-xs text-[#cf080d] font-medium">
          {helperError}
        </p>
      )}

      {/* Vista previa en vivo de la portada */}
      <div className="rounded-lg border border-[#d9d9d9] overflow-hidden bg-slate-50">
        <div className="h-28 w-full relative bg-slate-100 flex items-center justify-center">
          {activePreviewUrl && !previewFailed ? (
            <img
              src={activePreviewUrl}
              alt="Vista previa de la portada del curso"
              referrerPolicy="no-referrer"
              onError={() => setPreviewFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center px-4">
              <ImageIcon className="w-6 h-6 text-slate-400 mx-auto mb-1" aria-hidden="true" />
              <p className="text-[11px] text-slate-500">
                {previewFailed
                  ? 'No se pudo cargar la vista previa. Verifica que el enlace sea público.'
                  : 'Vista previa de portada'}
              </p>
            </div>
          )}
        </div>
        {activePreviewUrl && (
          <div className="px-3 py-1.5 bg-white border-t border-[#d9d9d9]/70 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 truncate">
              {activePreviewUrl.startsWith('data:image/')
                ? 'Imagen cargada desde el equipo (optimizada)'
                : activePreviewUrl}
            </span>
            <span className="text-[11px] font-semibold text-emerald-700 shrink-0">Lista</span>
          </div>
        )}
      </div>
    </div>
  );
}
