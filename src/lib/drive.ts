export interface DriveLinkInfo {
  isDrive: boolean;
  fileId: string | null;
  downloadUrl: string;
  previewUrl: string;
}

export function parseGoogleDriveUrl(rawUrl: string): DriveLinkInfo {
  const trimmed = rawUrl.trim();
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i,
    /drive\.google\.com\/open\?[^#]*id=([a-zA-Z0-9_-]+)/i,
    /drive\.google\.com\/uc\?[^#]*id=([a-zA-Z0-9_-]+)/i,
    /docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/i,
  ];

  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match?.[1]) {
      const fileId = match[1];
      if (/docs\.google\.com\/document\/d\//i.test(trimmed)) {
        return {
          isDrive: true,
          fileId,
          downloadUrl: `https://docs.google.com/document/d/${fileId}/export?format=pdf`,
          previewUrl: `https://docs.google.com/document/d/${fileId}/view`,
        };
      }
      if (/docs\.google\.com\/presentation\/d\//i.test(trimmed)) {
        return {
          isDrive: true,
          fileId,
          downloadUrl: `https://docs.google.com/presentation/d/${fileId}/export/pdf`,
          previewUrl: `https://docs.google.com/presentation/d/${fileId}/present`,
        };
      }
      if (/docs\.google\.com\/spreadsheets\/d\//i.test(trimmed)) {
        return {
          isDrive: true,
          fileId,
          downloadUrl: `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`,
          previewUrl: `https://docs.google.com/spreadsheets/d/${fileId}/view`,
        };
      }
      return {
        isDrive: true,
        fileId,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
        previewUrl: `https://drive.google.com/file/d/${fileId}/view`,
      };
    }
  }

  return {
    isDrive: false,
    fileId: null,
    downloadUrl: trimmed,
    previewUrl: trimmed,
  };
}

export function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
