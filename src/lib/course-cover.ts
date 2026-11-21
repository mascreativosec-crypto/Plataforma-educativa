export interface CourseCoverResolution {
  valid: boolean;
  source: 'drive' | 'upload' | 'url' | 'preset';
  normalizedUrl: string;
  previewUrl: string;
  error?: string;
}

const MAX_DATA_URL_LENGTH = 1_500_000; // ~1.1MB decoded image
const SAFE_IMAGE_DATA_URL_REGEX = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const SAFE_LOCAL_ASSET_REGEX = /^\/(src\/assets|assets)\/[A-Za-z0-9/_.-]+\.(jpg|jpeg|png|webp|gif)$/i;

/**
 * Extrae el fileId de un enlace compartido de Google Drive.
 */
export function extractGoogleDriveImageId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'drive.google.com' && host !== 'docs.google.com' && host !== 'lh3.googleusercontent.com') {
      return null;
    }

    // https://drive.google.com/file/d/<ID>/view...
    const fileMatch = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/);
    if (fileMatch) return fileMatch[1];

    // https://lh3.googleusercontent.com/d/<ID>
    const lhMatch = parsed.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})/);
    if (lhMatch) return lhMatch[1];

    // https://drive.google.com/open?id=<ID> or /uc?id=<ID> or /thumbnail?id=<ID>
    const idParam = parsed.searchParams.get('id');
    if (idParam && /^[A-Za-z0-9_-]{10,}$/.test(idParam)) {
      return idParam;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normaliza y valida una portada de curso (Google Drive, imagen subida en data URL, URL HTTPS o asset local).
 * Bloquea esquemas inseguros (javascript:, data:text/html, data:image/svg+xml).
 */
export function resolveCourseCoverUrl(rawInput: string): CourseCoverResolution {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      source: 'url',
      normalizedUrl: '',
      previewUrl: '',
      error: 'Ingresa un enlace o selecciona una imagen de portada.',
    };
  }

  // 1. Asset predefinido local
  if (SAFE_LOCAL_ASSET_REGEX.test(trimmed)) {
    return {
      valid: true,
      source: 'preset',
      normalizedUrl: trimmed,
      previewUrl: trimmed,
    };
  }

  // 2. Imagen subida (Data URL seguro: solo jpeg/png/webp/gif, nunca SVG ni HTML)
  if (trimmed.toLowerCase().startsWith('data:')) {
    if (trimmed.length > MAX_DATA_URL_LENGTH) {
      return {
        valid: false,
        source: 'upload',
        normalizedUrl: '',
        previewUrl: '',
        error: 'La imagen es demasiado pesada. Usa una foto más liviana o un enlace de Google Drive.',
      };
    }
    if (!SAFE_IMAGE_DATA_URL_REGEX.test(trimmed)) {
      return {
        valid: false,
        source: 'upload',
        normalizedUrl: '',
        previewUrl: '',
        error: 'Formato de imagen no permitido. Usa JPG, PNG, WebP o GIF.',
      };
    }
    return {
      valid: true,
      source: 'upload',
      normalizedUrl: trimmed,
      previewUrl: trimmed,
    };
  }

  // 3. Enlace de Google Drive -> thumbnail directo sin saturar el servidor
  const driveId = extractGoogleDriveImageId(trimmed);
  if (driveId) {
    const thumb = `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`;
    return {
      valid: true,
      source: 'drive',
      normalizedUrl: thumb,
      previewUrl: thumb,
    };
  }

  // 4. URL HTTPS / HTTP segura
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        valid: false,
        source: 'url',
        normalizedUrl: '',
        previewUrl: '',
        error: 'El enlace de portada debe iniciar con https:// o http://.',
      };
    }
    return {
      valid: true,
      source: 'url',
      normalizedUrl: parsed.toString(),
      previewUrl: parsed.toString(),
    };
  } catch {
    return {
      valid: false,
      source: 'url',
      normalizedUrl: '',
      previewUrl: '',
      error: 'El enlace ingresado no es una URL válida de imagen o Google Drive.',
    };
  }
}

/**
 * Valida que el motivo de eliminación de un curso cumpla con la política de respaldo obligatorio.
 */
export function validateCourseDeletionReason(reason: string): { valid: boolean; error?: string } {
  const cleaned = reason.trim();
  if (cleaned.length < 4) {
    return {
      valid: false,
      error: 'Debes indicar un motivo de eliminación de al menos 4 caracteres (ej. El curso finalizó).',
    };
  }
  return { valid: true };
}
