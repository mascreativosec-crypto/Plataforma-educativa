import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  actividadDiaria,
  canjeTienda,
  estudianteGamificacion,
  estudianteInsignia,
  estudianteReto,
  gamificacionConfig,
  historialRacha,
  insigniaDef,
  mascotaEstudiante,
  movimientoPuntos,
  notificacionAula,
  retoDef,
  tiendaProducto,
} from '../../db/schema.ts';
import {
  addCalendarDays,
  checkDailyPointsCap,
  computePetMood,
  computePetStageFromXp,
  computeReviewGameOutcome,
  DEFAULT_STREAK_MILESTONES,
  diffCalendarDays,
  evaluatePetStudyVitality,
  evaluateStreakStatus,
  getGuayaquilDateKey,
  getGuayaquilHour,
  validateRedemptionEligibility,
  type StreakMilestoneConfig,
} from './gamificacion-engine.ts';

export async function ensureTenantGamificationConfig(tenantId: string) {
  const [existing] = await db
    .select()
    .from(gamificacionConfig)
    .where(eq(gamificacionConfig.tenantId, tenantId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(gamificacionConfig)
    .values({
      tenantId,
      hitosConfig: DEFAULT_STREAK_MILESTONES,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [reloaded] = await db
    .select()
    .from(gamificacionConfig)
    .where(eq(gamificacionConfig.tenantId, tenantId))
    .limit(1);

  return reloaded;
}

export async function ensureStudentGamificationProfile(tenantId: string, estudianteId: string) {
  let [profile] = await db
    .select()
    .from(estudianteGamificacion)
    .where(
      and(
        eq(estudianteGamificacion.tenantId, tenantId),
        eq(estudianteGamificacion.estudianteId, estudianteId),
      ),
    )
    .limit(1);

  if (!profile) {
    const [inserted] = await db
      .insert(estudianteGamificacion)
      .values({
        tenantId,
        estudianteId,
        puntosSaldo: 50,
        puntosTotales: 50,
        xpTotal: 50,
        comodinesRacha: 1,
      })
      .onConflictDoNothing()
      .returning();

    profile =
      inserted ||
      (
        await db
          .select()
          .from(estudianteGamificacion)
          .where(
            and(
              eq(estudianteGamificacion.tenantId, tenantId),
              eq(estudianteGamificacion.estudianteId, estudianteId),
            ),
          )
          .limit(1)
      )[0];
  }

  let [pet] = await db
    .select()
    .from(mascotaEstudiante)
    .where(
      and(
        eq(mascotaEstudiante.tenantId, tenantId),
        eq(mascotaEstudiante.estudianteId, estudianteId),
      ),
    )
    .limit(1);

  if (!pet) {
    const [insertedPet] = await db
      .insert(mascotaEstudiante)
      .values({
        tenantId,
        estudianteId,
        nombre: 'Allie',
        especie: 'BUHO_ALLEN',
        etapa: 1,
        nivel: 1,
        xp: 40,
        energia: 85,
        felicidad: 88,
        saciedad: 82,
        fondoHabitat: 'aula',
        accesoriosDesbloqueados: [],
        ultimaReaccion: '¡Hola! Soy tu compañero de aprendizaje en ALLEN Aula.',
        ultimaReaccionTipo: 'SALUDO',
      })
      .onConflictDoNothing()
      .returning();

    pet =
      insertedPet ||
      (
        await db
          .select()
          .from(mascotaEstudiante)
          .where(
            and(
              eq(mascotaEstudiante.tenantId, tenantId),
              eq(mascotaEstudiante.estudianteId, estudianteId),
            ),
          )
          .limit(1)
      )[0];
  }

  return { profile, pet };
}

export interface AwardAcademicActivityParams {
  tenantId: string;
  estudianteId: string;
  fuente: 'LECCION' | 'TAREA' | 'EXAMEN' | 'HABILIDAD_MCER';
  referenciaId: string;
  descripcion: string;
  habilidadMcer?: string | null;
  esWriting?: boolean;
  puntosOverride?: number;
}

export async function awardAcademicActivity(params: AwardAcademicActivityParams) {
  const { tenantId, estudianteId, fuente, referenciaId, descripcion } = params;
  const config = await ensureTenantGamificationConfig(tenantId);
  await ensureStudentGamificationProfile(tenantId, estudianteId);

  const hoyKey = getGuayaquilDateKey();
  const idempotencyKey = `${fuente}:${estudianteId}:${referenciaId}`;

  const basePoints =
    typeof params.puntosOverride === 'number'
      ? params.puntosOverride
      : fuente === 'LECCION'
        ? config.ptsLeccion
        : fuente === 'TAREA'
          ? config.ptsTareaATiempo
          : fuente === 'EXAMEN'
            ? config.ptsExamenAprobado
            : config.ptsHabilidadMcer;

  const bonusMcer =
    params.habilidadMcer && fuente !== 'HABILIDAD_MCER'
      ? Math.round(config.ptsHabilidadMcer * 0.5)
      : 0;
  const requestedAward = Math.max(0, basePoints + bonusMcer);

  return db.transaction(async (tx) => {
    // 1. Idempotency guard — never double-award the same academic action
    const existingMov = await tx
      .select({ id: movimientoPuntos.id })
      .from(movimientoPuntos)
      .where(
        and(
          eq(movimientoPuntos.tenantId, tenantId),
          eq(movimientoPuntos.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);

    if (existingMov.length > 0) {
      return { awarded: false, reason: 'ALREADY_AWARDED', puntosGanados: 0 };
    }

    const [profile] = await tx
      .select()
      .from(estudianteGamificacion)
      .where(
        and(
          eq(estudianteGamificacion.tenantId, tenantId),
          eq(estudianteGamificacion.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    const [pet] = await tx
      .select()
      .from(mascotaEstudiante)
      .where(
        and(
          eq(mascotaEstudiante.tenantId, tenantId),
          eq(mascotaEstudiante.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    // 2. Daily anti-abuse cap check
    const startOfToday = new Date(`${hoyKey}T00:00:00-05:00`);
    const [todaySumRow] = await tx
      .select({
        total: sql<number>`coalesce(sum(${movimientoPuntos.cantidad}), 0)`,
      })
      .from(movimientoPuntos)
      .where(
        and(
          eq(movimientoPuntos.tenantId, tenantId),
          eq(movimientoPuntos.estudianteId, estudianteId),
          eq(movimientoPuntos.tipo, 'GANADO'),
          gte(movimientoPuntos.createdAt, startOfToday),
        ),
      );

    const earnedToday = Number(todaySumRow?.total ?? 0);
    const capCheck = checkDailyPointsCap({
      earnedToday,
      awardAmount: requestedAward,
      dailyCap: config.limitePuntosDiarios,
    });

    // 3. Streak update
    let nextRacha = profile.rachaActual;
    let nextMax = profile.rachaMaxima;
    let nextUltimaFecha = profile.ultimaActividadFecha;
    let nextPerdidaVal = profile.rachaPerdidaValor;
    let nextPerdidaFecha = profile.rachaPerdidaFecha;
    let streakIncremented = false;
    let milestoneHit: StreakMilestoneConfig | null = null;

    const milestones: StreakMilestoneConfig[] = Array.isArray(config.hitosConfig)
      ? (config.hitosConfig as StreakMilestoneConfig[])
      : DEFAULT_STREAK_MILESTONES;

    if (!profile.ultimaActividadFecha) {
      nextRacha = 1;
      nextMax = Math.max(nextMax, 1);
      nextUltimaFecha = hoyKey;
      streakIncremented = true;
      await tx.insert(historialRacha).values({
        tenantId,
        estudianteId,
        tipoEvento: 'INICIO',
        rachaAntes: 0,
        rachaDespues: 1,
        nota: `Racha iniciada con: ${descripcion}`,
      });
    } else {
      const gap = diffCalendarDays(profile.ultimaActividadFecha, hoyKey);
      if (gap === 0) {
        // Already active today; keep streak
      } else if (gap === 1) {
        const before = profile.rachaActual;
        nextRacha = before + 1;
        nextMax = Math.max(nextMax, nextRacha);
        nextUltimaFecha = hoyKey;
        nextPerdidaVal = 0;
        nextPerdidaFecha = null;
        streakIncremented = true;
        await tx.insert(historialRacha).values({
          tenantId,
          estudianteId,
          tipoEvento: 'INCREMENTO',
          rachaAntes: before,
          rachaDespues: nextRacha,
          nota: `Día ${nextRacha} completado (${descripcion})`,
        });
      } else if (gap > 1) {
        // Previous streak was lost; start fresh at 1 today
        if (profile.rachaActual > 0) {
          nextPerdidaVal = profile.rachaActual;
          nextPerdidaFecha = addCalendarDays(profile.ultimaActividadFecha, 1);
          await tx.insert(historialRacha).values({
            tenantId,
            estudianteId,
            tipoEvento: 'PERDIDA',
            rachaAntes: profile.rachaActual,
            rachaDespues: 0,
            nota: 'Se pausó por inactividad antes de retomar hoy.',
          });
        }
        nextRacha = 1;
        nextMax = Math.max(nextMax, 1);
        nextUltimaFecha = hoyKey;
        streakIncremented = true;
        await tx.insert(historialRacha).values({
          tenantId,
          estudianteId,
          tipoEvento: 'INICIO',
          rachaAntes: 0,
          rachaDespues: 1,
          nota: `Nueva racha iniciada con: ${descripcion}`,
        });
      }
    }

    if (streakIncremented) {
      milestoneHit = milestones.find((m) => m.dias === nextRacha) || null;
    }

    const milestoneBonus = milestoneHit ? milestoneHit.puntos : 0;
    const totalPointsAdded = capCheck.allowedAmount + milestoneBonus;
    const nextSaldo = profile.puntosSaldo + totalPointsAdded;
    const nextTotales = profile.puntosTotales + totalPointsAdded;
    const xpAdded = Math.max(15, Math.round(totalPointsAdded * 0.9));
    const nextXp = profile.xpTotal + xpAdded;

    // 4. Ledger entries
    if (capCheck.allowedAmount > 0 || capCheck.suspicious) {
      await tx.insert(movimientoPuntos).values({
        tenantId,
        estudianteId,
        tipo: 'GANADO',
        fuente,
        cantidad: capCheck.allowedAmount,
        saldoDespues: profile.puntosSaldo + capCheck.allowedAmount,
        descripcion,
        referenciaId,
        idempotencyKey,
        sospechoso: capCheck.suspicious,
      });
    }

    if (milestoneHit && milestoneBonus > 0) {
      const milestoneKey = `RACHA_HITO:${estudianteId}:${milestoneHit.dias}:${hoyKey}`;
      await tx
        .insert(movimientoPuntos)
        .values({
          tenantId,
          estudianteId,
          tipo: 'GANADO',
          fuente: 'RACHA_HITO',
          cantidad: milestoneBonus,
          saldoDespues: nextSaldo,
          descripcion: `Hito de racha alcanzado: ${milestoneHit.titulo}`,
          referenciaId: String(milestoneHit.dias),
          idempotencyKey: milestoneKey,
          sospechoso: false,
        })
        .onConflictDoNothing();

      await tx.insert(historialRacha).values({
        tenantId,
        estudianteId,
        tipoEvento: 'HITO',
        rachaAntes: nextRacha - 1,
        rachaDespues: nextRacha,
        recompensaPuntos: milestoneBonus,
        nota: milestoneHit.titulo,
      });

      await tx.insert(notificacionAula).values({
        tenantId,
        destinatarioRol: 'ESTUDIANTE',
        destinatarioId: estudianteId,
        tipo: 'HITO',
        titulo: `¡Hito de ${milestoneHit.dias} días alcanzado!`,
        mensaje: `Ganaste +${milestoneBonus} ALLEN POINTS por completar "${milestoneHit.titulo}".`,
        accionNav: 'gamificacion',
      });

      // Unlock milestone badge if configured
      if (milestoneHit.insigniaCodigo) {
        const [badge] = await tx
          .select()
          .from(insigniaDef)
          .where(
            and(
              eq(insigniaDef.tenantId, tenantId),
              eq(insigniaDef.codigo, milestoneHit.insigniaCodigo),
            ),
          )
          .limit(1);
        if (badge) {
          await tx
            .insert(estudianteInsignia)
            .values({ tenantId, estudianteId, insigniaId: badge.id })
            .onConflictDoNothing();
        }
      }
    }

    // 5. Upsert daily activity calendar cell
    await tx
      .insert(actividadDiaria)
      .values({
        tenantId,
        estudianteId,
        fecha: hoyKey,
        tipo: 'ACTIVA',
        accionesCount: 1,
        puntosGanados: totalPointsAdded,
        detalle: descripcion,
      })
      .onConflictDoUpdate({
        target: [actividadDiaria.estudianteId, actividadDiaria.fecha],
        set: {
          accionesCount: sql`${actividadDiaria.accionesCount} + 1`,
          puntosGanados: sql`${actividadDiaria.puntosGanados} + ${totalPointsAdded}`,
          detalle: descripcion,
        },
      });

    // 6. Save gamification profile
    await tx
      .update(estudianteGamificacion)
      .set({
        puntosSaldo: nextSaldo,
        puntosTotales: nextTotales,
        xpTotal: nextXp,
        rachaActual: nextRacha,
        rachaMaxima: nextMax,
        ultimaActividadFecha: nextUltimaFecha,
        rachaPerdidaValor: nextPerdidaVal,
        rachaPerdidaFecha: nextPerdidaFecha,
        updatedAt: new Date(),
      })
      .where(eq(estudianteGamificacion.id, profile.id));

    // 7. Update virtual pet XP, evolution & mood reaction
    if (pet) {
      const nextPetXp = pet.xp + xpAdded;
      const stageInfo = computePetStageFromXp(nextPetXp);
      const reactionType = milestoneHit ? 'HITO' : 'ACTIVIDAD';
      const reactionText = milestoneHit
        ? `¡Guau! ¡${milestoneHit.dias} días de racha! Me siento imparable contigo.`
        : `¡Excelente! Ganaste +${totalPointsAdded} ALLEN POINTS con "${descripcion}".`;

      await tx
        .update(mascotaEstudiante)
        .set({
          xp: nextPetXp,
          nivel: stageInfo.nivel,
          etapa: stageInfo.etapa,
          energia: Math.min(100, pet.energia + 8),
          felicidad: Math.min(100, pet.felicidad + 10),
          saciedad: Math.min(100, pet.saciedad + 5),
          ultimaReaccion: reactionText,
          ultimaReaccionTipo: reactionType,
          ultimaInteraccionEn: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mascotaEstudiante.id, pet.id));
    }

    // 8. Progress matching active challenges
    const activeRetos = await tx
      .select()
      .from(retoDef)
      .where(and(eq(retoDef.tenantId, tenantId), eq(retoDef.activo, true)));

    for (const reto of activeRetos) {
      const matches =
        (reto.tipoObjetivo === 'LECCIONES' && fuente === 'LECCION') ||
        (reto.tipoObjetivo === 'TAREAS' && fuente === 'TAREA') ||
        (reto.tipoObjetivo === 'WRITING' && Boolean(params.esWriting)) ||
        (reto.tipoObjetivo === 'EXAMENES' && fuente === 'EXAMEN') ||
        (reto.tipoObjetivo === 'RACHA' && streakIncremented) ||
        reto.tipoObjetivo === 'PUNTOS';

      if (!matches) continue;

      const [existingProg] = await tx
        .select()
        .from(estudianteReto)
        .where(
          and(
            eq(estudianteReto.estudianteId, estudianteId),
            eq(estudianteReto.retoId, reto.id),
          ),
        )
        .limit(1);

      const delta =
        reto.tipoObjetivo === 'PUNTOS'
          ? totalPointsAdded
          : reto.tipoObjetivo === 'RACHA'
            ? nextRacha
            : 1;

      const currentVal = existingProg?.progresoActual ?? 0;
      const newVal =
        reto.tipoObjetivo === 'RACHA'
          ? Math.max(currentVal, delta)
          : currentVal + delta;
      const nowCompleted = newVal >= reto.metaValor;

      if (!existingProg) {
        await tx.insert(estudianteReto).values({
          tenantId,
          estudianteId,
          retoId: reto.id,
          progresoActual: newVal,
          completado: nowCompleted,
          completadoEn: nowCompleted ? new Date() : null,
        });
      } else if (!existingProg.reclamado) {
        await tx
          .update(estudianteReto)
          .set({
            progresoActual: newVal,
            completado: nowCompleted || existingProg.completado,
            completadoEn:
              nowCompleted && !existingProg.completado ? new Date() : existingProg.completadoEn,
            updatedAt: new Date(),
          })
          .where(eq(estudianteReto.id, existingProg.id));
      }
    }

    return {
      awarded: true,
      puntosGanados: totalPointsAdded,
      rachaActual: nextRacha,
      milestoneHit,
    };
  });
}

export async function useStreakShield(tenantId: string, estudianteId: string) {
  const config = await ensureTenantGamificationConfig(tenantId);
  await ensureStudentGamificationProfile(tenantId, estudianteId);
  const hoyKey = getGuayaquilDateKey();
  const horaLocal = getGuayaquilHour();

  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(estudianteGamificacion)
      .where(
        and(
          eq(estudianteGamificacion.tenantId, tenantId),
          eq(estudianteGamificacion.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    if (!profile || profile.comodinesRacha <= 0) {
      throw new Error('No tienes comodines de protección disponibles. Puedes adquirir uno en la Tienda.');
    }

    const evalRes = evaluateStreakStatus({
      rachaActual: profile.rachaActual,
      ultimaActividadFecha: profile.ultimaActividadFecha,
      rachaPerdidaValor: profile.rachaPerdidaValor,
      rachaPerdidaFecha: profile.rachaPerdidaFecha,
      comodinesRacha: profile.comodinesRacha,
      recuperacionesEsteMes: profile.recuperacionesEsteMes,
      recuperacionMesRef: profile.recuperacionMesRef,
      maxRecuperacionesMes: config.maxRecuperacionesMes,
      ventanaRecuperacionHoras: config.ventanaRecuperacionHoras,
      hoyKey,
      horaLocal,
    });

    if (!evalRes.puedeUsarComodin) {
      throw new Error('Tu racha ya está protegida hoy o no requiere comodín en este momento.');
    }

    const fechaProtegida =
      evalRes.diasSinActividad === 2 && profile.ultimaActividadFecha
        ? addCalendarDays(profile.ultimaActividadFecha, 1)
        : hoyKey;

    await tx
      .update(estudianteGamificacion)
      .set({
        comodinesRacha: profile.comodinesRacha - 1,
        ultimaActividadFecha: hoyKey,
        updatedAt: new Date(),
      })
      .where(eq(estudianteGamificacion.id, profile.id));

    await tx
      .insert(actividadDiaria)
      .values({
        tenantId,
        estudianteId,
        fecha: fechaProtegida,
        tipo: 'PROTEGIDA',
        accionesCount: 0,
        puntosGanados: 0,
        detalle: 'Día protegido con Comodín de Racha',
      })
      .onConflictDoUpdate({
        target: [actividadDiaria.estudianteId, actividadDiaria.fecha],
        set: { tipo: 'PROTEGIDA', detalle: 'Día protegido con Comodín de Racha' },
      });

    await tx.insert(historialRacha).values({
      tenantId,
      estudianteId,
      tipoEvento: 'COMODIN_USADO',
      rachaAntes: profile.rachaActual,
      rachaDespues: profile.rachaActual,
      nota: `Comodín aplicado para proteger el día ${fechaProtegida}.`,
    });

    await tx
      .update(mascotaEstudiante)
      .set({
        felicidad: sql`least(100, ${mascotaEstudiante.felicidad} + 8)`,
        ultimaReaccion: '¡Uf! Tu escudo protegió nuestra racha a tiempo.',
        ultimaReaccionTipo: 'SALUDO',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mascotaEstudiante.tenantId, tenantId),
          eq(mascotaEstudiante.estudianteId, estudianteId),
        ),
      );

    return { comodinesRestantes: profile.comodinesRacha - 1, rachaActual: profile.rachaActual };
  });
}

export async function recoverLostStreak(tenantId: string, estudianteId: string) {
  const config = await ensureTenantGamificationConfig(tenantId);
  await ensureStudentGamificationProfile(tenantId, estudianteId);
  const hoyKey = getGuayaquilDateKey();
  const mesActual = hoyKey.slice(0, 7);
  const horaLocal = getGuayaquilHour();

  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(estudianteGamificacion)
      .where(
        and(
          eq(estudianteGamificacion.tenantId, tenantId),
          eq(estudianteGamificacion.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    const evalRes = evaluateStreakStatus({
      rachaActual: profile.rachaActual,
      ultimaActividadFecha: profile.ultimaActividadFecha,
      rachaPerdidaValor: profile.rachaPerdidaValor,
      rachaPerdidaFecha: profile.rachaPerdidaFecha,
      comodinesRacha: profile.comodinesRacha,
      recuperacionesEsteMes: profile.recuperacionesEsteMes,
      recuperacionMesRef: profile.recuperacionMesRef,
      maxRecuperacionesMes: config.maxRecuperacionesMes,
      ventanaRecuperacionHoras: config.ventanaRecuperacionHoras,
      hoyKey,
      horaLocal,
    });

    if (!evalRes.puedeRecuperar || evalRes.rachaRecuperable <= 0) {
      throw new Error(
        'No tienes una racha recuperable dentro de la ventana permitida o alcanzaste el límite mensual.',
      );
    }

    const costo = config.costoRecuperarRacha;
    if (profile.puntosSaldo < costo) {
      throw new Error(
        `Necesitas ${costo} ALLEN POINTS para recuperar tu racha (tienes ${profile.puntosSaldo}).`,
      );
    }

    const nuevoSaldo = profile.puntosSaldo - costo;
    const recupsMes =
      profile.recuperacionMesRef === mesActual ? profile.recuperacionesEsteMes + 1 : 1;
    const rachaRestaurada = evalRes.rachaRecuperable;

    await tx
      .update(estudianteGamificacion)
      .set({
        puntosSaldo: nuevoSaldo,
        rachaActual: rachaRestaurada,
        rachaMaxima: Math.max(profile.rachaMaxima, rachaRestaurada),
        ultimaActividadFecha: hoyKey,
        rachaPerdidaValor: 0,
        rachaPerdidaFecha: null,
        recuperacionesEsteMes: recupsMes,
        recuperacionMesRef: mesActual,
        updatedAt: new Date(),
      })
      .where(eq(estudianteGamificacion.id, profile.id));

    await tx.insert(movimientoPuntos).values({
      tenantId,
      estudianteId,
      tipo: 'GASTADO',
      fuente: 'RECUPERACION_RACHA',
      cantidad: -costo,
      saldoDespues: nuevoSaldo,
      descripcion: `Recuperación de racha de ${rachaRestaurada} días`,
      idempotencyKey: `RECUP:${estudianteId}:${hoyKey}:${recupsMes}`,
    });

    await tx
      .insert(actividadDiaria)
      .values({
        tenantId,
        estudianteId,
        fecha: hoyKey,
        tipo: 'RECUPERADA',
        accionesCount: 1,
        puntosGanados: 0,
        detalle: `Racha de ${rachaRestaurada} días recuperada`,
      })
      .onConflictDoUpdate({
        target: [actividadDiaria.estudianteId, actividadDiaria.fecha],
        set: { tipo: 'RECUPERADA', detalle: `Racha de ${rachaRestaurada} días recuperada` },
      });

    await tx.insert(historialRacha).values({
      tenantId,
      estudianteId,
      tipoEvento: 'RECUPERADA',
      rachaAntes: 0,
      rachaDespues: rachaRestaurada,
      costoPuntos: costo,
      nota: `Racha recuperada con ${costo} ALLEN POINTS.`,
    });

    await tx
      .update(mascotaEstudiante)
      .set({
        felicidad: 100,
        energia: sql`least(100, ${mascotaEstudiante.energia} + 20)`,
        ultimaReaccion: `¡SÍ! ¡Recuperaste nuestra racha de ${rachaRestaurada} días! ¡A celebrar!`,
        ultimaReaccionTipo: 'RECUPERACION',
        ultimaInteraccionEn: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mascotaEstudiante.tenantId, tenantId),
          eq(mascotaEstudiante.estudianteId, estudianteId),
        ),
      );

    await tx.insert(notificacionAula).values({
      tenantId,
      destinatarioRol: 'ESTUDIANTE',
      destinatarioId: estudianteId,
      tipo: 'HITO',
      titulo: '¡Racha recuperada con éxito!',
      mensaje: `Tu racha de ${rachaRestaurada} días vuelve a estar activa. Tu mascota está celebrando.`,
      accionNav: 'gamificacion',
    });

    return { rachaActual: rachaRestaurada, puntosSaldo: nuevoSaldo };
  });
}

export async function claimChallengeReward(tenantId: string, estudianteId: string, retoId: string) {
  await ensureStudentGamificationProfile(tenantId, estudianteId);

  return db.transaction(async (tx) => {
    const [reto] = await tx
      .select()
      .from(retoDef)
      .where(and(eq(retoDef.id, retoId), eq(retoDef.tenantId, tenantId)))
      .limit(1);
    if (!reto) throw new Error('Reto no encontrado.');

    const [prog] = await tx
      .select()
      .from(estudianteReto)
      .where(
        and(
          eq(estudianteReto.tenantId, tenantId),
          eq(estudianteReto.estudianteId, estudianteId),
          eq(estudianteReto.retoId, retoId),
        ),
      )
      .limit(1);

    if (!prog || !prog.completado) {
      throw new Error('Aún no has completado la meta de este reto.');
    }
    if (prog.reclamado) {
      throw new Error('Ya reclamaste la recompensa de este reto.');
    }

    const [profile] = await tx
      .select()
      .from(estudianteGamificacion)
      .where(
        and(
          eq(estudianteGamificacion.tenantId, tenantId),
          eq(estudianteGamificacion.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    const nextSaldo = profile.puntosSaldo + reto.recompensaPuntos;
    const nextTotales = profile.puntosTotales + reto.recompensaPuntos;
    const nextXp = profile.xpTotal + reto.recompensaPuntos;

    await tx
      .update(estudianteReto)
      .set({ reclamado: true, updatedAt: new Date() })
      .where(eq(estudianteReto.id, prog.id));

    await tx
      .update(estudianteGamificacion)
      .set({
        puntosSaldo: nextSaldo,
        puntosTotales: nextTotales,
        xpTotal: nextXp,
        updatedAt: new Date(),
      })
      .where(eq(estudianteGamificacion.id, profile.id));

    await tx.insert(movimientoPuntos).values({
      tenantId,
      estudianteId,
      tipo: 'GANADO',
      fuente: 'RETO',
      cantidad: reto.recompensaPuntos,
      saldoDespues: nextSaldo,
      descripcion: `Reto completado: ${reto.titulo}`,
      referenciaId: reto.id,
      idempotencyKey: `RETO:${estudianteId}:${reto.id}`,
    });

    const [pet] = await tx
      .select()
      .from(mascotaEstudiante)
      .where(
        and(
          eq(mascotaEstudiante.tenantId, tenantId),
          eq(mascotaEstudiante.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    if (pet) {
      const nextPetXp = pet.xp + reto.recompensaPuntos;
      const stageInfo = computePetStageFromXp(nextPetXp);
      await tx
        .update(mascotaEstudiante)
        .set({
          xp: nextPetXp,
          nivel: stageInfo.nivel,
          etapa: stageInfo.etapa,
          felicidad: Math.min(100, pet.felicidad + 15),
          ultimaReaccion: `¡Reto superado! +${reto.recompensaPuntos} ALLEN POINTS para ti.`,
          ultimaReaccionTipo: 'RECOMPENSA',
          ultimaInteraccionEn: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mascotaEstudiante.id, pet.id));
    }

    return { puntosGanados: reto.recompensaPuntos, puntosSaldo: nextSaldo };
  });
}

export async function interactWithPet(
  tenantId: string,
  estudianteId: string,
  accion: 'ALIMENTAR' | 'JUGAR' | 'CUIDAR' | 'ESTUDIAR',
) {
  const config = await ensureTenantGamificationConfig(tenantId);
  await ensureStudentGamificationProfile(tenantId, estudianteId);
  const hoyKey = getGuayaquilDateKey();

  return db.transaction(async (tx) => {
    const [pet] = await tx
      .select()
      .from(mascotaEstudiante)
      .where(
        and(
          eq(mascotaEstudiante.tenantId, tenantId),
          eq(mascotaEstudiante.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    const [profile] = await tx
      .select()
      .from(estudianteGamificacion)
      .where(
        and(
          eq(estudianteGamificacion.tenantId, tenantId),
          eq(estudianteGamificacion.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    const sameDay = pet.interaccionesFecha === hoyKey;
    const countToday = sameDay ? pet.interaccionesHoy : 0;
    const grantsBonus = countToday < 3; // Anti-abuse: max 3 rewarded pet interactions/day
    const ptsGanados = grantsBonus ? config.ptsMascotaInteraccion : 0;
    const xpGanado = grantsBonus ? 12 : 4;

    let dSaciedad = 0;
    let dFelicidad = 0;
    let dEnergia = 0;
    let reaction = '';
    let reactionType = 'SALUDO';

    if (accion === 'ALIMENTAR') {
      dSaciedad = 24;
      dEnergia = 10;
      dFelicidad = 6;
      reaction = `¡Delicioso snack de vocabulario! ${pet.nombre} recargó energía.`;
      reactionType = 'ALIMENTAR';
    } else if (accion === 'JUGAR') {
      dFelicidad = 22;
      dEnergia = -6;
      dSaciedad = -4;
      reaction = `¡Qué divertido! Jugaron una ronda rápida de palabras en inglés.`;
      reactionType = 'JUGAR';
    } else if (accion === 'CUIDAR') {
      dEnergia = 22;
      dFelicidad = 12;
      reaction = `${pet.nombre} descansó y se siente renovado para la siguiente lección.`;
      reactionType = 'CUIDAR';
    } else {
      dFelicidad = 15;
      dEnergia = 8;
      dSaciedad = -3;
      reaction = `¡Gran sesión de repaso juntos! ${pet.nombre} sumó experiencia.`;
      reactionType = 'RECOMPENSA';
    }

    const nextXp = pet.xp + xpGanado;
    const stageInfo = computePetStageFromXp(nextXp);
    const nextEnergia = Math.max(10, Math.min(100, pet.energia + dEnergia));
    const nextFelicidad = Math.max(10, Math.min(100, pet.felicidad + dFelicidad));
    const nextSaciedad = Math.max(10, Math.min(100, pet.saciedad + dSaciedad));

    const [updatedPet] = await tx
      .update(mascotaEstudiante)
      .set({
        xp: nextXp,
        nivel: stageInfo.nivel,
        etapa: stageInfo.etapa,
        energia: nextEnergia,
        felicidad: nextFelicidad,
        saciedad: nextSaciedad,
        ultimaReaccion: reaction,
        ultimaReaccionTipo: reactionType,
        interaccionesHoy: countToday + 1,
        interaccionesFecha: hoyKey,
        ultimaInteraccionEn: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mascotaEstudiante.id, pet.id))
      .returning();

    let nextSaldo = profile.puntosSaldo;
    if (ptsGanados > 0) {
      nextSaldo = profile.puntosSaldo + ptsGanados;
      await tx
        .update(estudianteGamificacion)
        .set({
          puntosSaldo: nextSaldo,
          puntosTotales: profile.puntosTotales + ptsGanados,
          xpTotal: profile.xpTotal + xpGanado,
          updatedAt: new Date(),
        })
        .where(eq(estudianteGamificacion.id, profile.id));

      await tx.insert(movimientoPuntos).values({
        tenantId,
        estudianteId,
        tipo: 'GANADO',
        fuente: 'MASCOTA',
        cantidad: ptsGanados,
        saldoDespues: nextSaldo,
        descripcion: `Cuidado diario de ${pet.nombre} (${accion.toLowerCase()})`,
        idempotencyKey: `MASCOTA:${estudianteId}:${hoyKey}:${countToday + 1}`,
      });
    }

    const evalRes = evaluateStreakStatus({
      rachaActual: profile.rachaActual,
      ultimaActividadFecha: profile.ultimaActividadFecha,
      rachaPerdidaValor: profile.rachaPerdidaValor,
      rachaPerdidaFecha: profile.rachaPerdidaFecha,
      comodinesRacha: profile.comodinesRacha,
      recuperacionesEsteMes: profile.recuperacionesEsteMes,
      recuperacionMesRef: profile.recuperacionMesRef,
      maxRecuperacionesMes: config.maxRecuperacionesMes,
      ventanaRecuperacionHoras: config.ventanaRecuperacionHoras,
      hoyKey,
      horaLocal: getGuayaquilHour(),
    });

    return {
      pet: updatedPet,
      stageInfo,
      mood: computePetMood({
        streakState: evalRes.estadoVisual,
        energia: nextEnergia,
        felicidad: nextFelicidad,
        saciedad: nextSaciedad,
        ultimaReaccionTipo: reactionType,
      }),
      puntosGanados: ptsGanados,
      puntosSaldo: nextSaldo,
      interaccionesConPuntosRestantes: Math.max(0, 3 - (countToday + 1)),
    };
  });
}

export async function completePetReviewGame(params: {
  tenantId: string;
  estudianteId: string;
  aciertos: number;
  total: number;
  modoJuego: 'REPASO' | 'SIMULADOR' | 'MICRO_PRO';
}) {
  const { tenantId, estudianteId, aciertos, total, modoJuego } = params;
  const config = await ensureTenantGamificationConfig(tenantId);
  await ensureStudentGamificationProfile(tenantId, estudianteId);
  const hoyKey = getGuayaquilDateKey();

  const outcome = computeReviewGameOutcome({ aciertos, total, modoJuego });

  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(estudianteGamificacion)
      .where(
        and(
          eq(estudianteGamificacion.tenantId, tenantId),
          eq(estudianteGamificacion.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    const [pet] = await tx
      .select()
      .from(mascotaEstudiante)
      .where(
        and(
          eq(mascotaEstudiante.tenantId, tenantId),
          eq(mascotaEstudiante.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    // Check daily anti-abuse points cap
    const startOfToday = new Date(`${hoyKey}T00:00:00-05:00`);
    const [todaySumRow] = await tx
      .select({
        total: sql<number>`coalesce(sum(${movimientoPuntos.cantidad}), 0)`,
      })
      .from(movimientoPuntos)
      .where(
        and(
          eq(movimientoPuntos.tenantId, tenantId),
          eq(movimientoPuntos.estudianteId, estudianteId),
          eq(movimientoPuntos.tipo, 'GANADO'),
          gte(movimientoPuntos.createdAt, startOfToday),
        ),
      );

    const earnedToday = Number(todaySumRow?.total ?? 0);
    const capCheck = checkDailyPointsCap({
      earnedToday,
      awardAmount: outcome.puntosBase,
      dailyCap: config.limitePuntosDiarios,
    });

    // Update streak when review game reaches threshold
    let nextRacha = profile.rachaActual;
    let nextMax = profile.rachaMaxima;
    let nextUltimaFecha = profile.ultimaActividadFecha;
    let rachaActivadaHoy = false;

    if (outcome.activaRacha) {
      if (!profile.ultimaActividadFecha) {
        nextRacha = 1;
        nextMax = Math.max(nextMax, 1);
        nextUltimaFecha = hoyKey;
        rachaActivadaHoy = true;
      } else {
        const gap = diffCalendarDays(profile.ultimaActividadFecha, hoyKey);
        if (gap === 1) {
          nextRacha = profile.rachaActual + 1;
          nextMax = Math.max(nextMax, nextRacha);
          nextUltimaFecha = hoyKey;
          rachaActivadaHoy = true;
        } else if (gap > 1) {
          nextRacha = 1;
          nextMax = Math.max(nextMax, 1);
          nextUltimaFecha = hoyKey;
          rachaActivadaHoy = true;
        }
      }

      if (rachaActivadaHoy) {
        await tx.insert(historialRacha).values({
          tenantId,
          estudianteId,
          tipoEvento: nextRacha === 1 ? 'INICIO' : 'INCREMENTO',
          rachaAntes: profile.rachaActual,
          rachaDespues: nextRacha,
          nota:
            modoJuego === 'MICRO_PRO'
              ? `Micro-repaso ejecutivo completado (${aciertos}/${total})`
              : `Repaso interactivo con ${pet.nombre} (${aciertos}/${total})`,
        });
      }

      await tx
        .insert(actividadDiaria)
        .values({
          tenantId,
          estudianteId,
          fecha: hoyKey,
          tipo: 'ACTIVA',
          accionesCount: 1,
          puntosGanados: capCheck.allowedAmount,
          detalle:
            modoJuego === 'MICRO_PRO'
              ? `Micro-repaso profesional (${aciertos}/${total})`
              : modoJuego === 'SIMULADOR'
                ? `Simulador rápido con ${pet.nombre} (${aciertos}/${total})`
                : `Juego de repaso con ${pet.nombre} (${aciertos}/${total})`,
        })
        .onConflictDoUpdate({
          target: [actividadDiaria.estudianteId, actividadDiaria.fecha],
          set: {
            accionesCount: sql`${actividadDiaria.accionesCount} + 1`,
            puntosGanados: sql`${actividadDiaria.puntosGanados} + ${capCheck.allowedAmount}`,
            detalle:
              modoJuego === 'MICRO_PRO'
                ? `Micro-repaso profesional (${aciertos}/${total})`
                : `Repaso interactivo (${aciertos}/${total})`,
          },
        });
    }

    const nextSaldo = profile.puntosSaldo + capCheck.allowedAmount;
    const nextTotales = profile.puntosTotales + capCheck.allowedAmount;
    const nextXpTotal = profile.xpTotal + outcome.xpGanado;

    await tx
      .update(estudianteGamificacion)
      .set({
        puntosSaldo: nextSaldo,
        puntosTotales: nextTotales,
        xpTotal: nextXpTotal,
        rachaActual: nextRacha,
        rachaMaxima: nextMax,
        ultimaActividadFecha: nextUltimaFecha,
        updatedAt: new Date(),
      })
      .where(eq(estudianteGamificacion.id, profile.id));

    if (capCheck.allowedAmount > 0) {
      const labelModo =
        modoJuego === 'MICRO_PRO'
          ? 'Micro-repaso ejecutivo'
          : modoJuego === 'SIMULADOR'
            ? 'Simulador rápido'
            : `Juego de repaso con ${pet.nombre}`;
      await tx.insert(movimientoPuntos).values({
        tenantId,
        estudianteId,
        tipo: 'GANADO',
        fuente: modoJuego === 'MICRO_PRO' ? 'MICRO_REPASO' : 'JUEGO_REPASO',
        cantidad: capCheck.allowedAmount,
        saldoDespues: nextSaldo,
        descripcion: `${labelModo} (${aciertos}/${total} aciertos)`,
        idempotencyKey: `REPASO:${estudianteId}:${Date.now()}`,
        sospechoso: capCheck.suspicious,
      });
    }

    // Revitalize pet directly from study effort
    const nextPetXp = pet.xp + outcome.xpGanado;
    const stageInfo = computePetStageFromXp(nextPetXp);
    const nextEnergia = Math.min(100, pet.energia + outcome.deltaEnergia);
    const nextFelicidad = Math.min(100, pet.felicidad + outcome.deltaFelicidad);
    const nextSaciedad = Math.min(100, pet.saciedad + outcome.deltaSaciedad);
    const reactionText = outcome.aprobado
      ? `¡Brillante repaso (${aciertos}/${total})! ${pet.nombre} recargó energía y protegió tu racha.`
      : `¡Buen intento (${aciertos}/${total})! Practicar mantiene a ${pet.nombre} despierta contigo.`;

    const [updatedPet] = await tx
      .update(mascotaEstudiante)
      .set({
        xp: nextPetXp,
        nivel: stageInfo.nivel,
        etapa: stageInfo.etapa,
        energia: nextEnergia,
        felicidad: nextFelicidad,
        saciedad: nextSaciedad,
        ultimaReaccion: reactionText,
        ultimaReaccionTipo: outcome.aprobado ? 'RECOMPENSA' : 'ACTIVIDAD',
        ultimaInteraccionEn: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mascotaEstudiante.id, pet.id))
      .returning();

    const evalRes = evaluateStreakStatus({
      rachaActual: nextRacha,
      ultimaActividadFecha: nextUltimaFecha,
      rachaPerdidaValor: profile.rachaPerdidaValor,
      rachaPerdidaFecha: profile.rachaPerdidaFecha,
      comodinesRacha: profile.comodinesRacha,
      recuperacionesEsteMes: profile.recuperacionesEsteMes,
      recuperacionMesRef: profile.recuperacionMesRef,
      maxRecuperacionesMes: config.maxRecuperacionesMes,
      ventanaRecuperacionHoras: config.ventanaRecuperacionHoras,
      hoyKey,
      horaLocal: getGuayaquilHour(),
    });

    const vitalidad = evaluatePetStudyVitality({
      streakState: evalRes.estadoVisual,
      completadoHoy: evalRes.completadoHoy,
      energia: nextEnergia,
      felicidad: nextFelicidad,
      saciedad: nextSaciedad,
      rachaVigente: evalRes.rachaVigente,
    });

    return {
      aciertos,
      total,
      porcentaje: outcome.porcentaje,
      aprobado: outcome.aprobado,
      rachaActivada: outcome.activaRacha,
      rachaActual: evalRes.rachaVigente,
      puntosGanados: capCheck.allowedAmount,
      xpGanado: outcome.xpGanado,
      puntosSaldo: nextSaldo,
      mensaje: reactionText,
      pet: updatedPet,
      stageInfo,
      vitalidad,
    };
  });
}

export async function redeemStoreProduct(params: {
  tenantId: string;
  estudianteId: string;
  productoId: string;
  notaEstudiante?: string | null;
}) {
  const { tenantId, estudianteId, productoId, notaEstudiante } = params;
  const config = await ensureTenantGamificationConfig(tenantId);
  await ensureStudentGamificationProfile(tenantId, estudianteId);

  return db.transaction(async (tx) => {
    const [prod] = await tx
      .select()
      .from(tiendaProducto)
      .where(and(eq(tiendaProducto.id, productoId), eq(tiendaProducto.tenantId, tenantId)))
      .limit(1);

    if (!prod) throw new Error('Producto no encontrado en la tienda.');

    const [profile] = await tx
      .select()
      .from(estudianteGamificacion)
      .where(
        and(
          eq(estudianteGamificacion.tenantId, tenantId),
          eq(estudianteGamificacion.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    const [pet] = await tx
      .select()
      .from(mascotaEstudiante)
      .where(
        and(
          eq(mascotaEstudiante.tenantId, tenantId),
          eq(mascotaEstudiante.estudianteId, estudianteId),
        ),
      )
      .limit(1);

    const unlockedArr = Array.isArray(pet?.accesoriosDesbloqueados)
      ? (pet.accesoriosDesbloqueados as string[])
      : [];

    const existingCompleted = await tx
      .select({ id: canjeTienda.id })
      .from(canjeTienda)
      .where(
        and(
          eq(canjeTienda.tenantId, tenantId),
          eq(canjeTienda.estudianteId, estudianteId),
          eq(canjeTienda.productoId, prod.id),
        ),
      )
      .limit(1);

    const meta = (prod.metadata || {}) as Record<string, unknown>;
    const itemKey = typeof meta.itemKey === 'string' ? meta.itemKey : prod.codigo;
    const yaPoseeCodigo =
      unlockedArr.includes(itemKey) ||
      (prod.categoria === 'PERFIL_VISUAL' && existingCompleted.length > 0) ||
      (prod.categoria === 'INSIGNIA' && existingCompleted.length > 0);

    const check = validateRedemptionEligibility({
      puntosSaldo: profile.puntosSaldo,
      precioPuntos: prod.precioPuntos,
      stock: prod.stock,
      activo: prod.activo,
      categoria: prod.categoria,
      yaPoseeCodigo,
      comodinesActuales: profile.comodinesRacha,
      maxComodinesStock: config.maxComodinesStock,
    });

    if (!check.ok) {
      throw new Error(check.reason);
    }

    // Atomic balance deduction guard
    const [updatedProfile] = await tx
      .update(estudianteGamificacion)
      .set({
        puntosSaldo: sql`${estudianteGamificacion.puntosSaldo} - ${prod.precioPuntos}`,
        comodinesRacha:
          prod.categoria === 'COMODIN_RACHA'
            ? sql`${estudianteGamificacion.comodinesRacha} + 1`
            : estudianteGamificacion.comodinesRacha,
        perfilTema:
          prod.categoria === 'PERFIL_VISUAL' && typeof meta.tema === 'string'
            ? meta.tema
            : estudianteGamificacion.perfilTema,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(estudianteGamificacion.id, profile.id),
          gte(estudianteGamificacion.puntosSaldo, prod.precioPuntos),
        ),
      )
      .returning();

    if (!updatedProfile) {
      throw new Error('Saldo insuficiente para completar el canje.');
    }

    // Atomic inventory decrement when stock is finite
    if (prod.stock !== null) {
      const [updatedStock] = await tx
        .update(tiendaProducto)
        .set({ stock: sql`${tiendaProducto.stock} - 1` })
        .where(and(eq(tiendaProducto.id, prod.id), gte(tiendaProducto.stock, 1)))
        .returning();
      if (!updatedStock) {
        throw new Error('El producto se agotó justo antes de confirmar tu compra.');
      }
    }

    const estadoCanje = prod.requiereAprobacion ? 'PENDIENTE_APROBACION' : 'COMPLETADO';

    const [canje] = await tx
      .insert(canjeTienda)
      .values({
        tenantId,
        estudianteId,
        productoId: prod.id,
        precioPagado: prod.precioPuntos,
        estado: estadoCanje,
        notaEstudiante: notaEstudiante?.trim() || null,
      })
      .returning();

    await tx.insert(movimientoPuntos).values({
      tenantId,
      estudianteId,
      tipo: 'GASTADO',
      fuente: 'CANJE_TIENDA',
      cantidad: -prod.precioPuntos,
      saldoDespues: updatedProfile.puntosSaldo,
      descripcion: `Canje en tienda: ${prod.nombre}`,
      referenciaId: canje.id,
    });

    // Apply instant unlocks for accessories / badges / pet celebration
    if (pet) {
      const isPetCosmetic =
        prod.categoria === 'MASCOTA_ACCESORIO' ||
        prod.categoria === 'MASCOTA_VESTIMENTA' ||
        prod.categoria === 'PERFIL_VISUAL';

      const nextUnlocked =
        isPetCosmetic && !unlockedArr.includes(itemKey)
          ? [...unlockedArr, itemKey]
          : unlockedArr;

      const slot = typeof meta.slot === 'string' ? meta.slot : null;

      await tx
        .update(mascotaEstudiante)
        .set({
          accesoriosDesbloqueados: nextUnlocked,
          accesorioCabeza: slot === 'cabeza' ? itemKey : pet.accesorioCabeza,
          accesorioCuello: slot === 'cuello' ? itemKey : pet.accesorioCuello,
          fondoHabitat: slot === 'habitat' ? itemKey : pet.fondoHabitat,
          felicidad: Math.min(100, pet.felicidad + 12),
          ultimaReaccion: `¡Genial! Desbloqueaste "${prod.nombre}".`,
          ultimaReaccionTipo: 'RECOMPENSA',
          updatedAt: new Date(),
        })
        .where(eq(mascotaEstudiante.id, pet.id));
    }

    if (prod.categoria === 'INSIGNIA' && typeof meta.insigniaCodigo === 'string') {
      const [badge] = await tx
        .select()
        .from(insigniaDef)
        .where(
          and(
            eq(insigniaDef.tenantId, tenantId),
            eq(insigniaDef.codigo, meta.insigniaCodigo),
          ),
        )
        .limit(1);
      if (badge) {
        await tx
          .insert(estudianteInsignia)
          .values({ tenantId, estudianteId, insigniaId: badge.id })
          .onConflictDoNothing();
      }
    }

    await tx.insert(notificacionAula).values({
      tenantId,
      destinatarioRol: 'ESTUDIANTE',
      destinatarioId: estudianteId,
      tipo: 'CANJE',
      titulo: prod.requiereAprobacion
        ? `Solicitud de canje enviada: ${prod.nombre}`
        : `¡Recompensa desbloqueada: ${prod.nombre}!`,
      mensaje: prod.requiereAprobacion
        ? `Se reservaron ${prod.precioPuntos} ALLEN POINTS. Un docente o administrador validará tu canje pronto.`
        : `Disfruta tu recompensa. Saldo restante: ${updatedProfile.puntosSaldo} ALLEN POINTS.`,
      accionNav: 'tienda',
    });

    return { canje, puntosSaldo: updatedProfile.puntosSaldo, producto: prod };
  });
}

export async function reviewStoreRedemption(params: {
  tenantId: string;
  canjeId: string;
  adminId: string;
  aprobar: boolean;
  notaAdmin?: string | null;
}) {
  const { tenantId, canjeId, adminId, aprobar, notaAdmin } = params;

  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ canje: canjeTienda, producto: tiendaProducto })
      .from(canjeTienda)
      .innerJoin(tiendaProducto, eq(canjeTienda.productoId, tiendaProducto.id))
      .where(and(eq(canjeTienda.id, canjeId), eq(canjeTienda.tenantId, tenantId)))
      .limit(1);

    if (!found) throw new Error('Canje no encontrado.');
    if (found.canje.estado !== 'PENDIENTE_APROBACION') {
      throw new Error('Este canje ya fue procesado anteriormente.');
    }

    const nextEstado = aprobar ? 'APROBADO' : 'RECHAZADO';
    const [updated] = await tx
      .update(canjeTienda)
      .set({
        estado: nextEstado,
        notaAdmin: notaAdmin?.trim() || null,
        aprobadoPor: adminId,
        aprobadoEn: new Date(),
      })
      .where(eq(canjeTienda.id, canjeId))
      .returning();

    if (!aprobar) {
      // Atomic refund of ALLEN POINTS + stock restoration
      const [refundedProfile] = await tx
        .update(estudianteGamificacion)
        .set({
          puntosSaldo: sql`${estudianteGamificacion.puntosSaldo} + ${found.canje.precioPagado}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(estudianteGamificacion.tenantId, tenantId),
            eq(estudianteGamificacion.estudianteId, found.canje.estudianteId),
          ),
        )
        .returning();

      if (found.producto.stock !== null) {
        await tx
          .update(tiendaProducto)
          .set({ stock: sql`${tiendaProducto.stock} + 1` })
          .where(eq(tiendaProducto.id, found.producto.id));
      }

      if (refundedProfile) {
        await tx.insert(movimientoPuntos).values({
          tenantId,
          estudianteId: found.canje.estudianteId,
          tipo: 'AJUSTE_ADMIN',
          fuente: 'CANJE_TIENDA',
          cantidad: found.canje.precioPagado,
          saldoDespues: refundedProfile.puntosSaldo,
          descripcion: `Reembolso por canje rechazado: ${found.producto.nombre}`,
          referenciaId: found.canje.id,
        });
      }
    }

    await tx.insert(notificacionAula).values({
      tenantId,
      destinatarioRol: 'ESTUDIANTE',
      destinatarioId: found.canje.estudianteId,
      tipo: 'CANJE',
      titulo: aprobar
        ? `Canje aprobado: ${found.producto.nombre}`
        : `Canje devuelto: ${found.producto.nombre}`,
      mensaje: aprobar
        ? notaAdmin?.trim() || 'Tu solicitud fue aprobada por el equipo académico de ALLEN.'
        : `Tus ${found.canje.precioPagado} ALLEN POINTS fueron devueltos a tu saldo. ${notaAdmin?.trim() || ''}`,
      accionNav: 'tienda',
    });

    return updated;
  });
}

export async function getRecentPointsLedger(tenantId: string, estudianteId: string, limit = 25) {
  return db
    .select()
    .from(movimientoPuntos)
    .where(
      and(
        eq(movimientoPuntos.tenantId, tenantId),
        eq(movimientoPuntos.estudianteId, estudianteId),
      ),
    )
    .orderBy(desc(movimientoPuntos.createdAt))
    .limit(limit);
}
