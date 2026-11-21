import crypto from 'node:crypto';
import { parseGoogleDriveUrl } from '../../lib/drive.ts';
import type { AsistenciaResumen, TipoPregunta } from '../../types/aula';

export { parseGoogleDriveUrl };

export const MAX_OUTBOX_ATTEMPTS = 5;

export interface GradableQuestion {
  id: string;
  tipo: TipoPregunta;
  respuestaCorrecta: unknown;
  puntos: number;
}

export interface QuestionGradeDetail {
  preguntaId: string;
  tipo: GradableQuestion['tipo'];
  correcta: boolean;
  requiereRevisionManual: boolean;
  puntosObtenidos: number;
  puntosPosibles: number;
}

export interface QuizGradeResult {
  puntosObtenidos: number;
  puntosTotales: number;
  nota: number;
  aprobado: boolean;
  requiereRevisionDocente: boolean;
  detalle: QuestionGradeDetail[];
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function matchesAcceptedText(actual: unknown, expectedSpec: unknown): boolean {
  const act = normalizeText(actual);
  if (!act) return false;
  const accepted = String(expectedSpec ?? '')
    .split('|')
    .map((s) => normalizeText(s))
    .filter(Boolean);
  return accepted.includes(act);
}

/**
 * Califica automáticamente un intento de cuestionario (escala 0–100).
 * Soporta los 8 tipos interactivos + V/F + Respuesta corta + Writing manual.
 */
export function gradeQuizAttempt(
  preguntas: GradableQuestion[],
  respuestas: Record<string, unknown>,
  notaMinima = 70,
  calificacionesManuales?: Record<string, number>,
): QuizGradeResult {
  let puntosTotales = 0;
  let puntosObtenidos = 0;
  let tienePendientesManual = false;
  const detalles: QuestionGradeDetail[] = [];

  for (const p of preguntas) {
    const puntos = Number(p.puntos) > 0 ? Number(p.puntos) : 1;
    puntosTotales += puntos;
    const respuesta = respuestas[p.id];

    if (p.tipo === 'WRITING') {
      const manualScore = calificacionesManuales?.[p.id];
      if (typeof manualScore === 'number' && Number.isFinite(manualScore)) {
        const clamped = Math.max(0, Math.min(puntos, manualScore));
        puntosObtenidos += clamped;
        detalles.push({
          preguntaId: p.id,
          tipo: p.tipo,
          correcta: clamped >= puntos * 0.6,
          requiereRevisionManual: false,
          puntosObtenidos: Number(clamped.toFixed(2)),
          puntosPosibles: puntos,
        });
      } else {
        tienePendientesManual = true;
        detalles.push({
          preguntaId: p.id,
          tipo: p.tipo,
          correcta: false,
          requiereRevisionManual: true,
          puntosObtenidos: 0,
          puntosPosibles: puntos,
        });
      }
      continue;
    }

    let ratio = 0;

    if (p.tipo === 'VERDADERO_FALSO') {
      const expected = Boolean(p.respuestaCorrecta);
      const actual =
        typeof respuesta === 'boolean'
          ? respuesta
          : normalizeText(respuesta) === 'true' || normalizeText(respuesta) === 'verdadero';
      ratio = respuesta !== undefined && respuesta !== null && actual === expected ? 1 : 0;
    } else if (p.tipo === 'OPCION_MULTIPLE') {
      ratio =
        respuesta !== undefined &&
        respuesta !== null &&
        normalizeText(respuesta) === normalizeText(p.respuestaCorrecta)
          ? 1
          : 0;
    } else if (p.tipo === 'RESPUESTA_CORTA') {
      ratio = matchesAcceptedText(respuesta, p.respuestaCorrecta) ? 1 : 0;
    } else if (p.tipo === 'SELECCION_MULTIPLE') {
      const expectedSet = new Set(
        (Array.isArray(p.respuestaCorrecta) ? p.respuestaCorrecta : [])
          .map(normalizeText)
          .filter(Boolean),
      );
      const actualSet = new Set(
        (Array.isArray(respuesta) ? respuesta : []).map(normalizeText).filter(Boolean),
      );
      if (expectedSet.size > 0 && actualSet.size > 0) {
        let hits = 0;
        let wrong = 0;
        for (const item of actualSet) {
          if (expectedSet.has(item)) hits += 1;
          else wrong += 1;
        }
        ratio = Math.max(0, (hits - wrong) / expectedSet.size);
      }
    } else if (p.tipo === 'UNIR_PAREJAS' || p.tipo === 'RELACIONAR_COLUMNAS') {
      const expectedMap =
        p.respuestaCorrecta && typeof p.respuestaCorrecta === 'object' && !Array.isArray(p.respuestaCorrecta)
          ? (p.respuestaCorrecta as Record<string, unknown>)
          : {};
      const actualMap =
        respuesta && typeof respuesta === 'object' && !Array.isArray(respuesta)
          ? (respuesta as Record<string, unknown>)
          : {};
      const keys = Object.keys(expectedMap);
      if (keys.length > 0) {
        let hits = 0;
        for (const k of keys) {
          if (normalizeText(actualMap[k]) && normalizeText(actualMap[k]) === normalizeText(expectedMap[k])) {
            hits += 1;
          }
        }
        ratio = hits / keys.length;
      }
    } else if (p.tipo === 'COMPLETAR_ESPACIOS' || p.tipo === 'COMPLETAR_OPCIONES') {
      const expectedList = Array.isArray(p.respuestaCorrecta) ? p.respuestaCorrecta : [];
      const actualList = Array.isArray(respuesta) ? respuesta : [];
      if (expectedList.length > 0) {
        let hits = 0;
        for (let i = 0; i < expectedList.length; i += 1) {
          if (matchesAcceptedText(actualList[i], expectedList[i])) {
            hits += 1;
          }
        }
        ratio = hits / expectedList.length;
      }
    } else if (p.tipo === 'ORDENAR_PALABRAS' || p.tipo === 'ORDENAR_ORACIONES') {
      const expectedList = (Array.isArray(p.respuestaCorrecta) ? p.respuestaCorrecta : []).map(normalizeText);
      const actualList = (Array.isArray(respuesta) ? respuesta : []).map(normalizeText);
      if (expectedList.length > 0 && actualList.length === expectedList.length) {
        const allExact = expectedList.every((val, idx) => actualList[idx] === val);
        ratio = allExact ? 1 : 0;
      }
    }

    const earned = Number((puntos * ratio).toFixed(2));
    puntosObtenidos += earned;
    detalles.push({
      preguntaId: p.id,
      tipo: p.tipo,
      correcta: ratio >= 0.999,
      requiereRevisionManual: false,
      puntosObtenidos: earned,
      puntosPosibles: puntos,
    });
  }

  const nota = puntosTotales > 0 ? Number(((puntosObtenidos / puntosTotales) * 100).toFixed(1)) : 0;
  return {
    puntosObtenidos: Number(puntosObtenidos.toFixed(2)),
    puntosTotales,
    nota,
    aprobado: !tienePendientesManual && nota >= notaMinima,
    requiereRevisionDocente: tienePendientesManual,
    detalle: detalles,
  };
}

/**
 * Calcula porcentaje de avance de un curso a partir de listas de IDs de lecciones publicadas y completadas.
 */
export function calculateCourseProgress(
  publishedLessonIds: string[],
  completedLessonIds: string[],
): number {
  if (!Array.isArray(publishedLessonIds) || publishedLessonIds.length === 0) return 0;
  const completedSet = new Set(completedLessonIds || []);
  const doneCount = publishedLessonIds.filter((id) => completedSet.has(id)).length;
  return Math.round((doneCount / publishedLessonIds.length) * 100);
}

/**
 * Resume registros de asistencia sincronizados desde ALLEN CRM.
 */
export function calculateAttendanceSummary(
  records: Array<{ estado: string }>,
): AsistenciaResumen & { porcentaje: number } {
  let presentes = 0;
  let tardanzas = 0;
  let justificadas = 0;
  let ausentes = 0;

  for (const r of records) {
    const st = String(r.estado || '').toUpperCase();
    if (st === 'PRESENTE') presentes += 1;
    else if (st === 'TARDANZA') tardanzas += 1;
    else if (st === 'JUSTIFICADA') justificadas += 1;
    else ausentes += 1;
  }

  const total = records.length;
  const attended = presentes + tardanzas + justificadas;
  const porcentajeAsistencia = total > 0 ? Math.round((attended / total) * 100) : 100;

  return {
    total,
    presentes,
    tardanzas,
    justificadas,
    ausentes,
    porcentajeAsistencia,
    porcentaje: porcentajeAsistencia,
  };
}

/**
 * Sanitiza HTML básico generado por el editor visual de lecciones.
 */
export function sanitizeLessonHtml(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Calcula firma HMAC-SHA256 en formato hexadecimal para webhooks ALLEN <-> Aula.
 */
export function computeHmacSignature(rawBody: string | Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Verifica firma HMAC y ventana anti-replay de 5 minutos.
 */
export function verifyHmacSignature(
  rawBody: Buffer,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
): { valid: boolean; reason?: string } {
  if (!signature || !timestamp) {
    return { valid: false, reason: 'Faltan cabeceras X-Aula-Signature o X-Aula-Timestamp.' };
  }
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return { valid: false, reason: 'Timestamp inválido.' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > 300) {
    return { valid: false, reason: 'Timestamp fuera de la ventana de 5 minutos.' };
  }

  const expected = computeHmacSignature(rawBody, secret);
  const sigBuf = Buffer.from(signature.replace(/^sha256=/i, ''), 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'Firma HMAC no coincide.' };
  }
  return { valid: true };
}

/**
 * Calcula tiempo de espera exponencial para reintentos del Outbox.
 */
export function computeNextBackoffMs(attempt: number): number | null {
  if (attempt >= MAX_OUTBOX_ATTEMPTS) return null;
  const scheduleMs = [60_000, 300_000, 900_000, 3_600_000];
  return scheduleMs[Math.min(Math.max(0, attempt - 1), scheduleMs.length - 1)];
}
