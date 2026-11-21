export type MediaEmbedKind = 'audio' | 'video';
export type MediaRenderMode = 'audio' | 'video' | 'iframe' | 'link';

export interface ParsedQuestionMedia {
  valid: boolean;
  kind: MediaEmbedKind;
  renderMode: MediaRenderMode;
  src: string;
  originalUrl: string;
  providerLabel: string;
  error?: string;
}

/**
 * Valida estrictamente que una URL use protocolo http: o https: (bloquea javascript:, data:, vbscript:).
 */
export function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Convierte enlaces de audio o video (MP3, MP4, YouTube, Vimeo, Google Drive) en una fuente segura
 * lista para reproducirse embebida dentro del examen online.
 */
export function parseQuestionMediaUrl(
  rawUrl: string | null | undefined,
  kind: MediaEmbedKind,
): ParsedQuestionMedia {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      kind,
      renderMode: 'link',
      src: '',
      originalUrl: '',
      providerLabel: '',
      error: 'URL vacía.',
    };
  }

  if (!isSafeHttpUrl(trimmed)) {
    return {
      valid: false,
      kind,
      renderMode: 'link',
      src: '',
      originalUrl: trimmed,
      providerLabel: '',
      error: 'Solo se permiten enlaces seguros con https:// o http://.',
    };
  }

  // Google Drive file link -> preview iframe (funciona tanto para audio como para video en Drive)
  const driveFileMatch =
    trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i) ||
    trimmed.match(/drive\.google\.com\/(?:open|uc)\?[^#]*id=([a-zA-Z0-9_-]+)/i);

  if (driveFileMatch?.[1]) {
    const fileId = driveFileMatch[1];
    return {
      valid: true,
      kind,
      renderMode: 'iframe',
      src: `https://drive.google.com/file/d/${fileId}/preview`,
      originalUrl: trimmed,
      providerLabel: 'Google Drive',
    };
  }

  if (kind === 'video') {
    // YouTube watch, short, embed o youtu.be
    const ytMatch =
      trimmed.match(/(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/i);
    if (ytMatch?.[1]) {
      return {
        valid: true,
        kind: 'video',
        renderMode: 'iframe',
        src: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0`,
        originalUrl: trimmed,
        providerLabel: 'YouTube',
      };
    }

    // Vimeo
    const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeoMatch?.[1]) {
      return {
        valid: true,
        kind: 'video',
        renderMode: 'iframe',
        src: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
        originalUrl: trimmed,
        providerLabel: 'Vimeo',
      };
    }

    // Archivo directo MP4 / WebM / OGG / MOV
    if (/\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(trimmed)) {
      return {
        valid: true,
        kind: 'video',
        renderMode: 'video',
        src: trimmed,
        originalUrl: trimmed,
        providerLabel: 'Video directo',
      };
    }

    // Fallback seguro: intentar <video> nativo con enlace de respaldo
    return {
      valid: true,
      kind: 'video',
      renderMode: 'video',
      src: trimmed,
      originalUrl: trimmed,
      providerLabel: 'Enlace de video',
    };
  }

  // Audio directo o URL de streaming (MP3, WAV, OGG, M4A, etc.)
  return {
    valid: true,
    kind: 'audio',
    renderMode: 'audio',
    src: trimmed,
    originalUrl: trimmed,
    providerLabel: /\.(mp3|wav|ogg|m4a|aac)(?:[?#].*)?$/i.test(trimmed)
      ? 'Audio directo'
      : 'Enlace de audio',
  };
}
