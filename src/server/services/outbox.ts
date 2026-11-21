import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { eventoAula } from '../../db/schema.ts';
import { computeHmacSignature, computeNextBackoffMs, MAX_OUTBOX_ATTEMPTS } from './grading.ts';

export interface NotaPublicadaPayload {
  tenantId: string;
  estudianteId: string;
  claseId: string | null;
  tipo: 'EVALUACION';
  actividad: string;
  fecha: string;
  nota: number;
  peso: number;
  origen: 'AULA';
  origenId: string;
}

export async function enqueueOutboxEvent(
  tenantId: string,
  tipo: string,
  payload: Record<string, unknown>,
) {
  try {
    const [created] = await db
      .insert(eventoAula)
      .values({
        tenantId,
        tipo,
        payload,
        estado: 'PENDIENTE',
        intentos: 0,
        proximoIntento: new Date(),
      })
      .returning();

    // Attempt immediate dispatch if ALLEN_API_URL and AULA_HMAC_SECRET are explicitly configured
    if (process.env.ALLEN_API_URL && process.env.AULA_HMAC_SECRET) {
      return await dispatchOutboxEvent(created.id, tenantId);
    }

    return created;
  } catch (error) {
    console.error('Database error enqueueing outbox event:', error);
    throw new Error('No se pudo registrar el evento en la cola de sincronización.', { cause: error });
  }
}

export async function dispatchOutboxEvent(eventoId: string, tenantId: string) {
  try {
    const [evt] = await db
      .select()
      .from(eventoAula)
      .where(and(eq(eventoAula.id, eventoId), eq(eventoAula.tenantId, tenantId)))
      .limit(1);

    if (!evt) {
      throw new Error('Evento no encontrado.');
    }

    const baseUrl = process.env.ALLEN_API_URL;
    const secret = process.env.AULA_HMAC_SECRET;
    const nextAttempt = evt.intentos + 1;

    if (!baseUrl || !secret) {
      // Simula estado PENDIENTE con backoff cuando ALLEN no está conectado en este entorno
      const backoffMs = computeNextBackoffMs(nextAttempt);
      const [updated] = await db
        .update(eventoAula)
        .set({
          estado: nextAttempt >= MAX_OUTBOX_ATTEMPTS ? 'FALLIDO' : 'PENDIENTE',
          intentos: nextAttempt,
          ultimoError:
            'CRM ALLEN externo no configurado en variables de entorno (ALLEN_API_URL / AULA_HMAC_SECRET). Evento preservado en Outbox para reintento.',
          proximoIntento: backoffMs ? new Date(Date.now() + backoffMs) : null,
        })
        .where(and(eq(eventoAula.id, evt.id), eq(eventoAula.tenantId, tenantId)))
        .returning();
      return updated;
    }

    const endpoint =
      evt.tipo === 'mensaje.codigo'
        ? `${baseUrl.replace(/\/$/, '')}/integracion/mensaje`
        : `${baseUrl.replace(/\/$/, '')}/integracion/aula/nota`;

    const rawBody = JSON.stringify(evt.payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeHmacSignature(rawBody, secret);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Aula-Signature': signature,
          'X-Aula-Timestamp': timestamp,
        },
        body: rawBody,
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const [sent] = await db
          .update(eventoAula)
          .set({
            estado: 'ENVIADO',
            intentos: nextAttempt,
            ultimoError: null,
            proximoIntento: null,
            enviadoEn: new Date(),
          })
          .where(and(eq(eventoAula.id, evt.id), eq(eventoAula.tenantId, tenantId)))
          .returning();
        return sent;
      }

      const errText = `HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`;
      const backoffMs = computeNextBackoffMs(nextAttempt);
      const [failed] = await db
        .update(eventoAula)
        .set({
          estado: nextAttempt >= MAX_OUTBOX_ATTEMPTS ? 'FALLIDO' : 'PENDIENTE',
          intentos: nextAttempt,
          ultimoError: errText,
          proximoIntento: backoffMs ? new Date(Date.now() + backoffMs) : null,
        })
        .where(and(eq(eventoAula.id, evt.id), eq(eventoAula.tenantId, tenantId)))
        .returning();
      return failed;
    } catch (netError) {
      const backoffMs = computeNextBackoffMs(nextAttempt);
      const [failed] = await db
        .update(eventoAula)
        .set({
          estado: nextAttempt >= MAX_OUTBOX_ATTEMPTS ? 'FALLIDO' : 'PENDIENTE',
          intentos: nextAttempt,
          ultimoError:
            netError instanceof Error ? netError.message : 'Error de red comunicando con ALLEN',
          proximoIntento: backoffMs ? new Date(Date.now() + backoffMs) : null,
        })
        .where(and(eq(eventoAula.id, evt.id), eq(eventoAula.tenantId, tenantId)))
        .returning();
      return failed;
    }
  } catch (error) {
    console.error('Error dispatching outbox event:', error);
    throw new Error('No se pudo procesar el evento de sincronización.', { cause: error });
  }
}

export async function listOutboxEvents(tenantId: string) {
  try {
    return await db
      .select()
      .from(eventoAula)
      .where(eq(eventoAula.tenantId, tenantId))
      .orderBy(desc(eventoAula.createdAt))
      .limit(50);
  } catch (error) {
    console.error('Database error listing outbox events:', error);
    throw new Error('No se pudo cargar la cola de eventos.', { cause: error });
  }
}
