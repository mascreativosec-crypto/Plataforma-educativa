import type { AulaRol, HistorialNotaCambio } from '../types/aula';

export const GRADE_EDIT_WINDOW_HOURS = 48;
export const GRADE_EDIT_WINDOW_MS = GRADE_EDIT_WINDOW_HOURS * 60 * 60 * 1000;
export const MIN_GRADE_CHANGE_REASON_LENGTH = 5;

export interface GradeEditEvaluationInput {
  rol: AulaRol;
  existingNota: number | null | undefined;
  notaAsentadaEn: string | Date | null | undefined;
  now?: Date;
}

export interface GradeEditEvaluationResult {
  isInitialGrade: boolean;
  canEdit: boolean;
  requiresReason: boolean;
  lockedAfter48h: boolean;
  isAdminOverride: boolean;
  hoursRemaining: number | null;
  deadlineIso: string | null;
}

/**
 * Evalúa si un usuario puede registrar o modificar una calificación bajo el protocolo de 48 horas:
 * - Primera calificación (existingNota == null): PROFESOR y ADMIN pueden calificar sin motivo de cambio.
 * - Modificación dentro de las primeras 48 horas desde notaAsentadaEn: PROFESOR y ADMIN pueden modificar
 *   proporcionando un comentario obligatorio (motivoCambio).
 * - Pasadas 48 horas desde notaAsentadaEn: bloqueado para PROFESOR. Solo ADMIN puede modificar
 *   (también con comentario obligatorio registrado en el historial).
 */
export function evaluateGradeEditPermission(
  input: GradeEditEvaluationInput,
): GradeEditEvaluationResult {
  const now = input.now ?? new Date();
  const isStaff = input.rol === 'PROFESOR' || input.rol === 'ADMIN';
  const hasExistingGrade =
    input.existingNota !== null &&
    input.existingNota !== undefined &&
    Number.isFinite(Number(input.existingNota));

  if (!isStaff) {
    return {
      isInitialGrade: !hasExistingGrade,
      canEdit: false,
      requiresReason: false,
      lockedAfter48h: false,
      isAdminOverride: false,
      hoursRemaining: null,
      deadlineIso: null,
    };
  }

  if (!hasExistingGrade) {
    return {
      isInitialGrade: true,
      canEdit: true,
      requiresReason: false,
      lockedAfter48h: false,
      isAdminOverride: false,
      hoursRemaining: null,
      deadlineIso: null,
    };
  }

  // Nota ya asentada previamente: evaluar ventana de 48 horas
  const settledDate = input.notaAsentadaEn ? new Date(input.notaAsentadaEn) : null;
  const validSettled = settledDate && !Number.isNaN(settledDate.getTime());

  if (!validSettled) {
    // Registro legado sin marca temporal: permitir edición con motivo obligatorio
    return {
      isInitialGrade: false,
      canEdit: true,
      requiresReason: true,
      lockedAfter48h: false,
      isAdminOverride: false,
      hoursRemaining: GRADE_EDIT_WINDOW_HOURS,
      deadlineIso: null,
    };
  }

  const deadlineMs = settledDate.getTime() + GRADE_EDIT_WINDOW_MS;
  const diffMs = deadlineMs - now.getTime();
  const expired = diffMs <= 0;
  const hoursRemaining = expired ? 0 : Math.ceil(diffMs / (60 * 60 * 1000));
  const deadlineIso = new Date(deadlineMs).toISOString();

  if (!expired) {
    return {
      isInitialGrade: false,
      canEdit: true,
      requiresReason: true,
      lockedAfter48h: false,
      isAdminOverride: false,
      hoursRemaining,
      deadlineIso,
    };
  }

  // Ventana de 48h vencida
  if (input.rol === 'ADMIN') {
    return {
      isInitialGrade: false,
      canEdit: true,
      requiresReason: true,
      lockedAfter48h: true,
      isAdminOverride: true,
      hoursRemaining: 0,
      deadlineIso,
    };
  }

  return {
    isInitialGrade: false,
    canEdit: false,
    requiresReason: true,
    lockedAfter48h: true,
    isAdminOverride: false,
    hoursRemaining: 0,
    deadlineIso,
  };
}

export function validateModificationReason(rawReason: unknown): {
  valid: boolean;
  cleaned: string;
  error?: string;
} {
  const cleaned = typeof rawReason === 'string' ? rawReason.trim() : '';
  if (cleaned.length < MIN_GRADE_CHANGE_REASON_LENGTH) {
    return {
      valid: false,
      cleaned,
      error: `Debes indicar un comentario de al menos ${MIN_GRADE_CHANGE_REASON_LENGTH} caracteres explicando el motivo del cambio de nota.`,
    };
  }
  return { valid: true, cleaned };
}

export function appendGradeHistoryEntry(
  existing: unknown,
  entry: HistorialNotaCambio,
): HistorialNotaCambio[] {
  const list = Array.isArray(existing) ? (existing as HistorialNotaCambio[]) : [];
  return [...list, entry].slice(-30);
}
