import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.ts';
import {
  actividadDiaria,
  canjeTienda,
  estudianteGamificacion,
  estudianteInsignia,
  estudianteRef,
  estudianteReto,
  gamificacionConfig,
  historialRacha,
  inscripcionCurso,
  insigniaDef,
  leccion,
  mascotaEstudiante,
  movimientoPuntos,
  notificacionAula,
  pregunta,
  progresoLeccion,
  quiz,
  retoDef,
  tiendaProducto,
  unidad,
} from '../../db/schema.ts';
import { ensureSeedData } from '../../db/seed.ts';
import {
  FALLBACK_REVIEW_QUESTIONS,
  isValidWorldPetSpecies,
  resolveWorldPetSpecies,
} from '../../lib/world-pets.ts';
import { requireAuth, requireRole, type AuthRequest } from '../../middleware/auth.ts';
import {
  computePetMood,
  computePetStageFromXp,
  DEFAULT_STREAK_MILESTONES,
  diffCalendarDays,
  evaluatePetStudyVitality,
  evaluateStreakStatus,
  getGuayaquilDateKey,
  getGuayaquilHour,
  type StreakMilestoneConfig,
} from '../services/gamificacion-engine.ts';
import {
  claimChallengeReward,
  completePetReviewGame,
  ensureStudentGamificationProfile,
  ensureTenantGamificationConfig,
  getRecentPointsLedger,
  interactWithPet,
  recoverLostStreak,
  redeemStoreProduct,
  reviewStoreRedemption,
  useStreakShield,
} from '../services/gamificacion.service.ts';

export const gamificacionRouter = Router();

// ============================================================================
// STUDENT GAMIFICATION HUB (Streaks, ALLEN POINTS, Pet, Badges, Challenges, Ranking)
// ============================================================================

gamificacionRouter.get(
  '/gamificacion/mi-estado',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      await ensureSeedData();
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const estId = estudianteId || sub;

      const config = await ensureTenantGamificationConfig(tenantId);
      const { profile, pet } = await ensureStudentGamificationProfile(tenantId, estId);

      const hoyKey = getGuayaquilDateKey();
      const horaLocal = getGuayaquilHour();
      const milestones: StreakMilestoneConfig[] = Array.isArray(config.hitosConfig)
        ? (config.hitosConfig as StreakMilestoneConfig[])
        : DEFAULT_STREAK_MILESTONES;

      const [
        calendarioRows,
        historialRows,
        allBadges,
        earnedBadgeRows,
        activeChallenges,
        studentChallengeRows,
        ledgerRows,
        rankingRows,
      ] = await Promise.all([
        db
          .select()
          .from(actividadDiaria)
          .where(
            and(
              eq(actividadDiaria.tenantId, tenantId),
              eq(actividadDiaria.estudianteId, estId),
            ),
          )
          .orderBy(desc(actividadDiaria.fecha))
          .limit(45),
        db
          .select()
          .from(historialRacha)
          .where(
            and(
              eq(historialRacha.tenantId, tenantId),
              eq(historialRacha.estudianteId, estId),
            ),
          )
          .orderBy(desc(historialRacha.createdAt))
          .limit(20),
        db
          .select()
          .from(insigniaDef)
          .where(and(eq(insigniaDef.tenantId, tenantId), eq(insigniaDef.activa, true)))
          .orderBy(asc(insigniaDef.categoria), asc(insigniaDef.condicionValor)),
        db
          .select()
          .from(estudianteInsignia)
          .where(
            and(
              eq(estudianteInsignia.tenantId, tenantId),
              eq(estudianteInsignia.estudianteId, estId),
            ),
          ),
        db
          .select()
          .from(retoDef)
          .where(and(eq(retoDef.tenantId, tenantId), eq(retoDef.activo, true)))
          .orderBy(desc(retoDef.createdAt)),
        db
          .select()
          .from(estudianteReto)
          .where(
            and(
              eq(estudianteReto.tenantId, tenantId),
              eq(estudianteReto.estudianteId, estId),
            ),
          ),
        getRecentPointsLedger(tenantId, estId, 20),
        db
          .select({
            estudianteId: estudianteGamificacion.estudianteId,
            puntosTotales: estudianteGamificacion.puntosTotales,
            rachaActual: estudianteGamificacion.rachaActual,
            nombres: estudianteRef.nombres,
            apellidos: estudianteRef.apellidos,
          })
          .from(estudianteGamificacion)
          .innerJoin(estudianteRef, eq(estudianteGamificacion.estudianteId, estudianteRef.id))
          .where(eq(estudianteGamificacion.tenantId, tenantId))
          .orderBy(desc(estudianteGamificacion.puntosTotales))
          .limit(10),
      ]);

      const todayCell = calendarioRows.find((r) => r.fecha === hoyKey);
      const streakEval = evaluateStreakStatus({
        rachaActual: profile.rachaActual,
        ultimaActividadFecha: profile.ultimaActividadFecha,
        rachaPerdidaValor: profile.rachaPerdidaValor,
        rachaPerdidaFecha: profile.rachaPerdidaFecha,
        comodinesRacha: profile.comodinesRacha,
        recuperacionesEsteMes: profile.recuperacionesEsteMes,
        recuperacionMesRef: profile.recuperacionMesRef,
        maxRecuperacionesMes: config.maxRecuperacionesMes,
        ventanaRecuperacionHoras: config.ventanaRecuperacionHoras,
        ultimaActividadFueRecuperada: todayCell?.tipo === 'RECUPERADA',
        hoyKey,
        horaLocal,
        milestones,
      });

      const stageInfo = computePetStageFromXp(pet.xp);
      const petMood = computePetMood({
        streakState: streakEval.estadoVisual,
        energia: pet.energia,
        felicidad: pet.felicidad,
        saciedad: pet.saciedad,
        ultimaReaccionTipo: pet.ultimaReaccionTipo,
      });
      const petVitalidad = evaluatePetStudyVitality({
        streakState: streakEval.estadoVisual,
        completadoHoy: streakEval.completadoHoy,
        energia: pet.energia,
        felicidad: pet.felicidad,
        saciedad: pet.saciedad,
        rachaVigente: streakEval.rachaVigente,
      });

      const earnedMap = new Map(earnedBadgeRows.map((b) => [b.insigniaId, b.desbloqueadaEn]));
      const insignias = allBadges.map((b) => ({
        ...b,
        desbloqueada: earnedMap.has(b.id),
        desbloqueadaEn: earnedMap.get(b.id) || null,
      }));

      const progMap = new Map(studentChallengeRows.map((p) => [p.retoId, p]));
      const retos = activeChallenges.map((r) => {
        const p = progMap.get(r.id);
        const progresoActual = p?.progresoActual ?? (r.tipoObjetivo === 'RACHA' ? streakEval.rachaVigente : 0);
        const completado = p?.completado || progresoActual >= r.metaValor;
        return {
          ...r,
          progresoActual: Math.min(r.metaValor, progresoActual),
          completado,
          reclamado: p?.reclamado ?? false,
          porcentaje: Math.min(100, Math.round((progresoActual / Math.max(1, r.metaValor)) * 100)),
        };
      });

      const interaccionesHoy = pet.interaccionesFecha === hoyKey ? pet.interaccionesHoy : 0;
      const sesionesEstaSemana = calendarioRows.filter(
        (r) => diffCalendarDays(r.fecha, hoyKey) >= 0 && diffCalendarDays(r.fecha, hoyKey) < 7,
      ).length;

      return res.json({
        perfil: {
          puntosSaldo: profile.puntosSaldo,
          puntosTotales: profile.puntosTotales,
          xpTotal: profile.xpTotal,
          rachaActual: streakEval.rachaVigente,
          rachaMaxima: profile.rachaMaxima,
          comodinesRacha: profile.comodinesRacha,
          perfilTema: profile.perfilTema,
          perfilExperiencia:
            profile.perfilExperiencia === 'PROFESIONAL' ? 'PROFESIONAL' : 'JUVENIL',
          metaSemanalSesiones: profile.metaSemanalSesiones || 3,
          sesionesEstaSemana,
          recuperacionesEsteMes:
            profile.recuperacionMesRef === hoyKey.slice(0, 7) ? profile.recuperacionesEsteMes : 0,
        },
        racha: {
          ...streakEval,
          costoRecuperacion: config.costoRecuperarRacha,
          maxRecuperacionesMes: config.maxRecuperacionesMes,
          ventanaRecuperacionHoras: config.ventanaRecuperacionHoras,
          milestones,
        },
        mascota: {
          ...pet,
          especie: resolveWorldPetSpecies(pet.especie),
          accesoriosDesbloqueados: Array.isArray(pet.accesoriosDesbloqueados)
            ? pet.accesoriosDesbloqueados
            : [],
          stageInfo,
          mood: petMood,
          vitalidad: petVitalidad,
          interaccionesConPuntosRestantes: Math.max(0, 3 - interaccionesHoy),
        },
        calendarioActividad: calendarioRows,
        historialRacha: historialRows,
        insignias,
        retos,
        movimientos: ledgerRows,
        ranking: rankingRows.map((row, idx) => ({
          posicion: idx + 1,
          estudianteId: row.estudianteId,
          nombre: `${row.nombres} ${row.apellidos}`,
          puntosTotales: row.puntosTotales,
          rachaActual: row.rachaActual,
          esYo: row.estudianteId === estId,
        })),
        reglas: {
          ptsLeccion: config.ptsLeccion,
          ptsTareaATiempo: config.ptsTareaATiempo,
          ptsExamenAprobado: config.ptsExamenAprobado,
          ptsHabilidadMcer: config.ptsHabilidadMcer,
          limitePuntosDiarios: config.limitePuntosDiarios,
        },
      });
    } catch (error) {
      console.error('Error loading student gamification state:', error);
      return res.status(500).json({ error: 'No se pudo cargar tu progreso de gamificación.' });
    }
  },
);

// POST /api/gamificacion/racha/usar-comodin
gamificacionRouter.post(
  '/gamificacion/racha/usar-comodin',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const result = await useStreakShield(tenantId, estudianteId || sub);
      return res.json(result);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'No se pudo aplicar el comodín.',
      });
    }
  },
);

// POST /api/gamificacion/racha/recuperar
gamificacionRouter.post(
  '/gamificacion/racha/recuperar',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const result = await recoverLostStreak(tenantId, estudianteId || sub);
      return res.json(result);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'No se pudo recuperar la racha.',
      });
    }
  },
);

// POST /api/gamificacion/retos/:id/reclamar
gamificacionRouter.post(
  '/gamificacion/retos/:id/reclamar',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const result = await claimChallengeReward(tenantId, estudianteId || sub, String(req.params.id));
      return res.json(result);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'No se pudo reclamar el reto.',
      });
    }
  },
);

// ============================================================================
// VIRTUAL PET INTERACTIONS & CUSTOMIZATION
// ============================================================================

gamificacionRouter.post(
  '/mascota/interactuar',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const accion = String(req.body?.accion || '').toUpperCase();
      if (!['ALIMENTAR', 'JUGAR', 'CUIDAR', 'ESTUDIAR'].includes(accion)) {
        return res.status(400).json({ error: 'Acción de mascota no válida.' });
      }
      const result = await interactWithPet(
        tenantId,
        estudianteId || sub,
        accion as 'ALIMENTAR' | 'JUGAR' | 'CUIDAR' | 'ESTUDIAR',
      );
      return res.json(result);
    } catch (error) {
      console.error('Error interacting with pet:', error);
      return res.status(400).json({ error: 'No se pudo interactuar con tu mascota.' });
    }
  },
);

gamificacionRouter.patch(
  '/mascota',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const estId = estudianteId || sub;
      const { pet } = await ensureStudentGamificationProfile(tenantId, estId);

      const unlocked = new Set<string>(
        Array.isArray(pet.accesoriosDesbloqueados) ? (pet.accesoriosDesbloqueados as string[]) : [],
      );
      unlocked.add('aula'); // default free habitat

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (typeof req.body?.nombre === 'string') {
        const cleanName = req.body.nombre.trim().slice(0, 32);
        if (cleanName.length < 2) {
          return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres.' });
        }
        updates.nombre = cleanName;
      }

      if (typeof req.body?.especie === 'string') {
        const esp = req.body.especie.trim().toUpperCase();
        if (isValidWorldPetSpecies(esp)) {
          updates.especie = esp;
        } else {
          return res.status(400).json({ error: 'Especie de mascota no válida.' });
        }
      }

      if (req.body?.accesorioCabeza !== undefined) {
        const val = req.body.accesorioCabeza ? String(req.body.accesorioCabeza) : null;
        if (val && !unlocked.has(val)) {
          return res.status(403).json({ error: 'Debes desbloquear este accesorio en la Tienda.' });
        }
        updates.accesorioCabeza = val;
      }

      if (req.body?.accesorioCuello !== undefined) {
        const val = req.body.accesorioCuello ? String(req.body.accesorioCuello) : null;
        if (val && !unlocked.has(val)) {
          return res.status(403).json({ error: 'Debes desbloquear este vestimenta en la Tienda.' });
        }
        updates.accesorioCuello = val;
      }

      if (req.body?.fondoHabitat !== undefined) {
        const val = String(req.body.fondoHabitat || 'aula');
        if (!unlocked.has(val)) {
          return res.status(403).json({ error: 'Debes desbloquear este hábitat en la Tienda.' });
        }
        updates.fondoHabitat = val;
      }

      const [updated] = await db
        .update(mascotaEstudiante)
        .set(updates)
        .where(eq(mascotaEstudiante.id, pet.id))
        .returning();

      return res.json({ mascota: updated });
    } catch (error) {
      console.error('Error customizing pet:', error);
      return res.status(500).json({ error: 'No se pudo actualizar tu mascota.' });
    }
  },
);

// GET /api/mascota/juego-repaso — construye una ronda interactiva de 5 preguntas (cursos inscritos + banco práctico)
gamificacionRouter.get(
  '/mascota/juego-repaso',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const estId = estudianteId || sub;
      const modo = String(req.query.modo || 'REPASO').toUpperCase();

      const inscs = await db
        .select({ cursoId: inscripcionCurso.cursoId })
        .from(inscripcionCurso)
        .where(
          and(
            eq(inscripcionCurso.tenantId, tenantId),
            eq(inscripcionCurso.estudianteId, estId),
            eq(inscripcionCurso.estado, 'ACTIVO'),
          ),
        );

      const courseQuestions: Array<{
        id: string;
        enunciado: string;
        opciones: string[];
        respuestaCorrecta: string;
        explicacion: string;
        tema: string;
        origen: 'CURSO' | 'PRACTICA';
      }> = [];

      if (inscs.length > 0) {
        const cursoIds = inscs.map((i) => i.cursoId);
        const rows = await db
          .select({
            id: pregunta.id,
            enunciado: pregunta.enunciado,
            tipo: pregunta.tipo,
            opciones: pregunta.opciones,
            respuestaCorrecta: pregunta.respuestaCorrecta,
            retroalimentacion: pregunta.retroalimentacion,
            quizTitulo: quiz.titulo,
          })
          .from(pregunta)
          .innerJoin(quiz, eq(pregunta.quizId, quiz.id))
          .innerJoin(leccion, eq(quiz.leccionId, leccion.id))
          .innerJoin(unidad, eq(leccion.unidadId, unidad.id))
          .where(
            and(
              eq(quiz.tenantId, tenantId),
              eq(quiz.publicada, true),
              inArray(unidad.cursoId, cursoIds),
            ),
          )
          .limit(12);

        for (const row of rows) {
          if (row.tipo === 'OPCION_MULTIPLE' && Array.isArray(row.opciones) && row.opciones.length >= 2) {
            courseQuestions.push({
              id: row.id,
              enunciado: row.enunciado,
              opciones: (row.opciones as unknown[]).map((o) => String(o)),
              respuestaCorrecta: String(row.respuestaCorrecta ?? ''),
              explicacion:
                row.retroalimentacion || `Pregunta tomada de tu cuestionario "${row.quizTitulo}".`,
              tema: row.quizTitulo,
              origen: 'CURSO',
            });
          } else if (row.tipo === 'VERDADERO_FALSO') {
            const isTrue =
              row.respuestaCorrecta === true ||
              String(row.respuestaCorrecta).toLowerCase() === 'true' ||
              String(row.respuestaCorrecta).toLowerCase() === 'verdadero';
            courseQuestions.push({
              id: row.id,
              enunciado: row.enunciado,
              opciones: ['Verdadero', 'Falso'],
              respuestaCorrecta: isTrue ? 'Verdadero' : 'Falso',
              explicacion:
                row.retroalimentacion || `Repaso de "${row.quizTitulo}".`,
              tema: row.quizTitulo,
              origen: 'CURSO',
            });
          }
        }
      }

      const fallbackPool =
        modo === 'MICRO_PRO'
          ? [
              ...FALLBACK_REVIEW_QUESTIONS.filter((q) => q.perfil === 'PROFESIONAL'),
              ...FALLBACK_REVIEW_QUESTIONS.filter((q) => q.perfil !== 'PROFESIONAL'),
            ]
          : FALLBACK_REVIEW_QUESTIONS;

      const selected = [...courseQuestions.slice(0, 3)];
      for (const fq of fallbackPool) {
        if (selected.length >= 5) break;
        if (!selected.some((q) => q.enunciado === fq.enunciado)) {
          selected.push({
            id: fq.id,
            enunciado: fq.enunciado,
            opciones: fq.opciones,
            respuestaCorrecta: fq.respuestaCorrecta,
            explicacion: fq.explicacion,
            tema: fq.tema,
            origen: 'PRACTICA',
          });
        }
      }

      return res.json({ preguntas: selected.slice(0, 5) });
    } catch (error) {
      console.error('Error building review game questions:', error);
      return res.status(500).json({ error: 'No se pudo cargar la ronda de repaso.' });
    }
  },
);

// POST /api/mascota/juego-repaso/completar — registra el repaso, suma puntos/XP y mantiene activa racha y mascota
gamificacionRouter.post(
  '/mascota/juego-repaso/completar',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const aciertos = Number(req.body?.aciertos ?? 0);
      const total = Number(req.body?.total ?? 5);
      const rawModo = String(req.body?.modoJuego || 'REPASO').toUpperCase();
      const modoJuego: 'REPASO' | 'SIMULADOR' | 'MICRO_PRO' =
        rawModo === 'SIMULADOR' || rawModo === 'MICRO_PRO' ? rawModo : 'REPASO';

      if (!Number.isFinite(aciertos) || !Number.isFinite(total) || total < 1) {
        return res.status(400).json({ error: 'Resultado de repaso inválido.' });
      }

      const result = await completePetReviewGame({
        tenantId,
        estudianteId: estudianteId || sub,
        aciertos,
        total,
        modoJuego,
      });

      return res.json(result);
    } catch (error) {
      console.error('Error completing pet review game:', error);
      return res.status(500).json({ error: 'No se pudo guardar el resultado del repaso.' });
    }
  },
);

// PATCH /api/gamificacion/mi-perfil — cambia perfil de experiencia (JUVENIL <=18 vs PROFESIONAL +18) y meta semanal
gamificacionRouter.patch(
  '/gamificacion/mi-perfil',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const estId = estudianteId || sub;
      const { profile } = await ensureStudentGamificationProfile(tenantId, estId);

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (req.body?.perfilExperiencia === 'JUVENIL' || req.body?.perfilExperiencia === 'PROFESIONAL') {
        updates.perfilExperiencia = req.body.perfilExperiencia;
      }
      if (req.body?.metaSemanalSesiones !== undefined) {
        const meta = Math.round(Number(req.body.metaSemanalSesiones));
        if (Number.isFinite(meta) && meta >= 2 && meta <= 7) {
          updates.metaSemanalSesiones = meta;
        }
      }

      const [updated] = await db
        .update(estudianteGamificacion)
        .set(updates)
        .where(eq(estudianteGamificacion.id, profile.id))
        .returning();

      return res.json({
        perfilExperiencia: updated.perfilExperiencia,
        metaSemanalSesiones: updated.metaSemanalSesiones,
      });
    } catch (error) {
      console.error('Error updating experience profile:', error);
      return res.status(500).json({ error: 'No se pudo actualizar tu perfil de aprendizaje.' });
    }
  },
);

// ============================================================================
// REWARDS STORE (CATALOG, PURCHASE, HISTORY, ADMIN CRUD & APPROVALS)
// ============================================================================

gamificacionRouter.get('/tienda', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeedData();
    const { tenantId, rol, estudianteId, sub } = req.aulaUser!;
    const isDocente = rol === 'ADMIN' || rol === 'PROFESOR';

    const productos = await db
      .select()
      .from(tiendaProducto)
      .where(
        isDocente
          ? eq(tiendaProducto.tenantId, tenantId)
          : and(eq(tiendaProducto.tenantId, tenantId), eq(tiendaProducto.activo, true)),
      )
      .orderBy(asc(tiendaProducto.categoria), asc(tiendaProducto.precioPuntos));

    if (!isDocente) {
      const estId = estudianteId || sub;
      const { profile, pet } = await ensureStudentGamificationProfile(tenantId, estId);
      const misCanjes = await db
        .select({
          canje: canjeTienda,
          productoNombre: tiendaProducto.nombre,
          productoCategoria: tiendaProducto.categoria,
          productoImagenKey: tiendaProducto.imagenKey,
        })
        .from(canjeTienda)
        .innerJoin(tiendaProducto, eq(canjeTienda.productoId, tiendaProducto.id))
        .where(and(eq(canjeTienda.tenantId, tenantId), eq(canjeTienda.estudianteId, estId)))
        .orderBy(desc(canjeTienda.createdAt))
        .limit(30);

      const movimientos = await getRecentPointsLedger(tenantId, estId, 20);
      const ownedItems = Array.isArray(pet.accesoriosDesbloqueados)
        ? (pet.accesoriosDesbloqueados as string[])
        : [];
      const ownedProdIds = new Set(
        misCanjes.filter((c) => c.canje.estado !== 'RECHAZADO').map((c) => c.canje.productoId),
      );

      return res.json({
        puntosSaldo: profile.puntosSaldo,
        comodinesRacha: profile.comodinesRacha,
        productos: productos.map((p) => {
          const meta = (p.metadata || {}) as Record<string, unknown>;
          const itemKey = typeof meta.itemKey === 'string' ? meta.itemKey : p.codigo;
          const yaPosee =
            ownedItems.includes(itemKey) ||
            ((p.categoria === 'PERFIL_VISUAL' || p.categoria === 'INSIGNIA') &&
              ownedProdIds.has(p.id));
          return { ...p, yaPosee };
        }),
        canjes: misCanjes.map((c) => ({
          ...c.canje,
          productoNombre: c.productoNombre,
          productoCategoria: c.productoCategoria,
          productoImagenKey: c.productoImagenKey,
        })),
        movimientos,
      });
    }

    // Admin / Docente view: catalog + all tenant redemptions
    const allCanjes = await db
      .select({
        canje: canjeTienda,
        productoNombre: tiendaProducto.nombre,
        productoCategoria: tiendaProducto.categoria,
        estudianteNombres: estudianteRef.nombres,
        estudianteApellidos: estudianteRef.apellidos,
      })
      .from(canjeTienda)
      .innerJoin(tiendaProducto, eq(canjeTienda.productoId, tiendaProducto.id))
      .innerJoin(estudianteRef, eq(canjeTienda.estudianteId, estudianteRef.id))
      .where(eq(canjeTienda.tenantId, tenantId))
      .orderBy(desc(canjeTienda.createdAt))
      .limit(50);

    return res.json({
      productos,
      canjes: allCanjes.map((c) => ({
        ...c.canje,
        productoNombre: c.productoNombre,
        productoCategoria: c.productoCategoria,
        estudianteNombre: `${c.estudianteNombres} ${c.estudianteApellidos}`,
      })),
    });
  } catch (error) {
    console.error('Error loading store:', error);
    return res.status(500).json({ error: 'No se pudo cargar la tienda de canjes.' });
  }
});

gamificacionRouter.post(
  '/tienda/canjear',
  requireAuth,
  requireRole('ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, estudianteId, sub } = req.aulaUser!;
      const productoId = String(req.body?.productoId || '');
      if (!productoId) return res.status(400).json({ error: 'Selecciona un producto.' });
      const notaEstudiante =
        typeof req.body?.notaEstudiante === 'string' ? req.body.notaEstudiante : null;
      const result = await redeemStoreProduct({
        tenantId,
        estudianteId: estudianteId || sub,
        productoId,
        notaEstudiante,
      });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'No se pudo completar el canje.',
      });
    }
  },
);

gamificacionRouter.post(
  '/tienda/productos',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const nombre = String(req.body?.nombre || '').trim();
      const descripcion = String(req.body?.descripcion || '').trim();
      const categoria = String(req.body?.categoria || 'PREMIO_ALLEN').trim();
      const precioPuntos = Math.max(10, Math.round(Number(req.body?.precioPuntos || 100)));
      const stockRaw = req.body?.stock;
      const stock =
        stockRaw === '' || stockRaw === null || stockRaw === undefined
          ? null
          : Math.max(0, Math.round(Number(stockRaw)));
      const requiereAprobacion = Boolean(req.body?.requiereAprobacion);
      const condiciones =
        typeof req.body?.condiciones === 'string' ? req.body.condiciones.trim() : null;
      const imagenKey = typeof req.body?.imagenKey === 'string' ? req.body.imagenKey : 'gift';

      if (nombre.length < 3 || descripcion.length < 5) {
        return res.status(400).json({ error: 'Ingresa un nombre y descripción válidos.' });
      }

      const codigo = `PROD_${Date.now().toString(36).toUpperCase()}`;
      const [created] = await db
        .insert(tiendaProducto)
        .values({
          tenantId,
          codigo,
          nombre,
          descripcion,
          categoria,
          precioPuntos,
          stock,
          requiereAprobacion,
          imagenKey,
          condiciones,
          activo: true,
        })
        .returning();

      return res.status(201).json({ producto: created });
    } catch (error) {
      console.error('Error creating store product:', error);
      return res.status(500).json({ error: 'No se pudo crear el producto en la tienda.' });
    }
  },
);

gamificacionRouter.patch(
  '/tienda/productos/:id',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const id = String(req.params.id);
      const updates: Record<string, unknown> = {};
      if (typeof req.body?.nombre === 'string' && req.body.nombre.trim().length >= 3) {
        updates.nombre = req.body.nombre.trim();
      }
      if (typeof req.body?.precioPuntos === 'number' && req.body.precioPuntos >= 0) {
        updates.precioPuntos = Math.round(req.body.precioPuntos);
      }
      if (req.body?.stock !== undefined) {
        updates.stock =
          req.body.stock === null || req.body.stock === ''
            ? null
            : Math.max(0, Math.round(Number(req.body.stock)));
      }
      if (typeof req.body?.activo === 'boolean') {
        updates.activo = req.body.activo;
      }

      const [updated] = await db
        .update(tiendaProducto)
        .set(updates)
        .where(and(eq(tiendaProducto.id, id), eq(tiendaProducto.tenantId, tenantId)))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Producto no encontrado.' });
      return res.json({ producto: updated });
    } catch (error) {
      console.error('Error updating store product:', error);
      return res.status(500).json({ error: 'No se pudo actualizar el producto.' });
    }
  },
);

gamificacionRouter.patch(
  '/tienda/canjes/:id/validar',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, sub } = req.aulaUser!;
      const aprobar = Boolean(req.body?.aprobar);
      const notaAdmin = typeof req.body?.notaAdmin === 'string' ? req.body.notaAdmin : null;
      const updated = await reviewStoreRedemption({
        tenantId,
        canjeId: String(req.params.id),
        adminId: sub,
        aprobar,
        notaAdmin,
      });
      return res.json({ canje: updated });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'No se pudo procesar la validación.',
      });
    }
  },
);

// ============================================================================
// ADMIN & DOCENTE GAMIFICATION CONTROL PANEL + ANALYTICS
// ============================================================================

gamificacionRouter.get(
  '/gamificacion/admin/resumen',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      await ensureSeedData();
      const { tenantId } = req.aulaUser!;
      const config = await ensureTenantGamificationConfig(tenantId);
      const hoyKey = getGuayaquilDateKey();
      const horaLocal = getGuayaquilHour();
      const milestones: StreakMilestoneConfig[] = Array.isArray(config.hitosConfig)
        ? (config.hitosConfig as StreakMilestoneConfig[])
        : DEFAULT_STREAK_MILESTONES;

      const [
        estudiantesRows,
        gamifRows,
        mascotaRows,
        insigniasList,
        estInsigniasRows,
        retosList,
        canjesRows,
        movimientosRows,
        progresoRows,
        inscripcionesRows,
      ] = await Promise.all([
        db.select().from(estudianteRef).where(eq(estudianteRef.tenantId, tenantId)),
        db.select().from(estudianteGamificacion).where(eq(estudianteGamificacion.tenantId, tenantId)),
        db.select().from(mascotaEstudiante).where(eq(mascotaEstudiante.tenantId, tenantId)),
        db.select().from(insigniaDef).where(eq(insigniaDef.tenantId, tenantId)),
        db.select().from(estudianteInsignia).where(eq(estudianteInsignia.tenantId, tenantId)),
        db
          .select()
          .from(retoDef)
          .where(eq(retoDef.tenantId, tenantId))
          .orderBy(desc(retoDef.createdAt)),
        db
          .select({
            canje: canjeTienda,
            productoNombre: tiendaProducto.nombre,
            estudianteNombres: estudianteRef.nombres,
            estudianteApellidos: estudianteRef.apellidos,
          })
          .from(canjeTienda)
          .innerJoin(tiendaProducto, eq(canjeTienda.productoId, tiendaProducto.id))
          .innerJoin(estudianteRef, eq(canjeTienda.estudianteId, estudianteRef.id))
          .where(eq(canjeTienda.tenantId, tenantId))
          .orderBy(desc(canjeTienda.createdAt))
          .limit(30),
        db
          .select({
            mov: movimientoPuntos,
            estudianteNombres: estudianteRef.nombres,
            estudianteApellidos: estudianteRef.apellidos,
          })
          .from(movimientoPuntos)
          .innerJoin(estudianteRef, eq(movimientoPuntos.estudianteId, estudianteRef.id))
          .where(eq(movimientoPuntos.tenantId, tenantId))
          .orderBy(desc(movimientoPuntos.createdAt))
          .limit(40),
        db.select().from(progresoLeccion).where(eq(progresoLeccion.tenantId, tenantId)),
        db
          .select()
          .from(inscripcionCurso)
          .where(and(eq(inscripcionCurso.tenantId, tenantId), eq(inscripcionCurso.estado, 'ACTIVO'))),
      ]);

      const gamifMap = new Map(gamifRows.map((g) => [g.estudianteId, g]));
      const petMap = new Map(mascotaRows.map((m) => [m.estudianteId, m]));
      const badgeCountMap = new Map<string, number>();
      for (const ei of estInsigniasRows) {
        badgeCountMap.set(ei.estudianteId, (badgeCountMap.get(ei.estudianteId) || 0) + 1);
      }
      const completedLessonsMap = new Map<string, number>();
      for (const p of progresoRows) {
        if (p.estado === 'COMPLETADA') {
          completedLessonsMap.set(p.estudianteId, (completedLessonsMap.get(p.estudianteId) || 0) + 1);
        }
      }
      const enrolledCoursesMap = new Map<string, number>();
      for (const ins of inscripcionesRows) {
        enrolledCoursesMap.set(ins.estudianteId, (enrolledCoursesMap.get(ins.estudianteId) || 0) + 1);
      }

      const estudiantes = estudiantesRows
        .map((est) => {
          const g = gamifMap.get(est.id);
          const p = petMap.get(est.id);
          const streak = evaluateStreakStatus({
            rachaActual: g?.rachaActual ?? 0,
            ultimaActividadFecha: g?.ultimaActividadFecha ?? null,
            rachaPerdidaValor: g?.rachaPerdidaValor ?? 0,
            rachaPerdidaFecha: g?.rachaPerdidaFecha ?? null,
            comodinesRacha: g?.comodinesRacha ?? 0,
            recuperacionesEsteMes: g?.recuperacionesEsteMes ?? 0,
            recuperacionMesRef: g?.recuperacionMesRef ?? null,
            maxRecuperacionesMes: config.maxRecuperacionesMes,
            ventanaRecuperacionHoras: config.ventanaRecuperacionHoras,
            hoyKey,
            horaLocal,
            milestones,
          });
          const stage = computePetStageFromXp(p?.xp ?? 0);
          return {
            estudianteId: est.id,
            nombre: `${est.nombres} ${est.apellidos}`,
            email: est.email,
            cursosInscritos: enrolledCoursesMap.get(est.id) || 0,
            leccionesCompletadas: completedLessonsMap.get(est.id) || 0,
            puntosSaldo: g?.puntosSaldo ?? 0,
            puntosTotales: g?.puntosTotales ?? 0,
            rachaActual: streak.rachaVigente,
            rachaMaxima: g?.rachaMaxima ?? 0,
            estadoRacha: streak.estadoVisual,
            comodinesRacha: g?.comodinesRacha ?? 0,
            insigniasCount: badgeCountMap.get(est.id) || 0,
            mascotaNombre: p?.nombre || 'Allie',
            mascotaEtapa: stage.etapaNombre,
            mascotaNivel: stage.nivel,
          };
        })
        .sort((a, b) => b.puntosTotales - a.puntosTotales);

      const rachasActivas = estudiantes.filter(
        (e) => e.estadoRacha === 'ACTIVA' || e.estadoRacha === 'RECUPERADA',
      ).length;
      const rachasEnRiesgo = estudiantes.filter((e) => e.estadoRacha === 'EN_RIESGO').length;
      const rachasPerdidas = estudiantes.filter((e) => e.estadoRacha === 'PERDIDA').length;
      const totalPuntosEmitidos = estudiantes.reduce((s, e) => s + e.puntosTotales, 0);
      const canjesPendientes = canjesRows.filter(
        (c) => c.canje.estado === 'PENDIENTE_APROBACION',
      ).length;
      const alertasIrregulares = movimientosRows.filter((m) => m.mov.sospechoso).length;

      return res.json({
        config,
        resumen: {
          totalEstudiantes: estudiantes.length,
          rachasActivas,
          rachasEnRiesgo,
          rachasPerdidas,
          totalPuntosEmitidos,
          canjesPendientes,
          alertasIrregulares,
          promedioRacha:
            estudiantes.length > 0
              ? Number(
                  (
                    estudiantes.reduce((s, e) => s + e.rachaActual, 0) / estudiantes.length
                  ).toFixed(1),
                )
              : 0,
        },
        estudiantes,
        insignias: insigniasList,
        retos: retosList,
        canjes: canjesRows.map((c) => ({
          ...c.canje,
          productoNombre: c.productoNombre,
          estudianteNombre: `${c.estudianteNombres} ${c.estudianteApellidos}`,
        })),
        movimientos: movimientosRows.map((m) => ({
          ...m.mov,
          estudianteNombre: `${m.estudianteNombres} ${m.estudianteApellidos}`,
        })),
      });
    } catch (error) {
      console.error('Error loading admin gamification panel:', error);
      return res.status(500).json({ error: 'No se pudo cargar el panel de gamificación.' });
    }
  },
);

gamificacionRouter.patch(
  '/gamificacion/admin/config',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      await ensureTenantGamificationConfig(tenantId);

      const clampInt = (v: unknown, min: number, max: number) =>
        typeof v === 'number' && Number.isFinite(v)
          ? Math.max(min, Math.min(max, Math.round(v)))
          : undefined;

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const fields: Array<[string, number, number]> = [
        ['ptsLeccion', 5, 500],
        ['ptsTareaATiempo', 5, 500],
        ['ptsExamenAprobado', 5, 1000],
        ['ptsHabilidadMcer', 5, 500],
        ['ptsMascotaInteraccion', 0, 50],
        ['costoRecuperarRacha', 20, 2000],
        ['ventanaRecuperacionHoras', 12, 168],
        ['maxRecuperacionesMes', 0, 10],
        ['maxComodinesStock', 1, 20],
        ['limitePuntosDiarios', 50, 5000],
      ];

      for (const [key, min, max] of fields) {
        const val = clampInt(req.body?.[key], min, max);
        if (val !== undefined) updates[key] = val;
      }

      if (Array.isArray(req.body?.hitosConfig) && req.body.hitosConfig.length > 0) {
        updates.hitosConfig = req.body.hitosConfig;
      }

      const [saved] = await db
        .update(gamificacionConfig)
        .set(updates)
        .where(eq(gamificacionConfig.tenantId, tenantId))
        .returning();

      return res.json({ config: saved });
    } catch (error) {
      console.error('Error saving gamification config:', error);
      return res.status(500).json({ error: 'No se pudo guardar la configuración.' });
    }
  },
);

gamificacionRouter.post(
  '/gamificacion/admin/retos',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const titulo = String(req.body?.titulo || '').trim();
      const descripcion = String(req.body?.descripcion || '').trim();
      const tipoObjetivo = String(req.body?.tipoObjetivo || 'LECCIONES').toUpperCase();
      const metaValor = Math.max(1, Math.round(Number(req.body?.metaValor || 3)));
      const recompensaPuntos = Math.max(10, Math.round(Number(req.body?.recompensaPuntos || 80)));
      const habilidadMcer =
        typeof req.body?.habilidadMcer === 'string' && req.body.habilidadMcer.trim()
          ? req.body.habilidadMcer.trim()
          : null;

      if (titulo.length < 3 || descripcion.length < 5) {
        return res.status(400).json({ error: 'Completa el título y la descripción del reto.' });
      }

      const [created] = await db
        .insert(retoDef)
        .values({
          tenantId,
          titulo,
          descripcion,
          tipoObjetivo,
          metaValor,
          recompensaPuntos,
          habilidadMcer,
          fechaInicio: getGuayaquilDateKey(),
          activo: true,
        })
        .returning();

      return res.status(201).json({ reto: created });
    } catch (error) {
      console.error('Error creating challenge:', error);
      return res.status(500).json({ error: 'No se pudo crear el reto.' });
    }
  },
);

gamificacionRouter.post(
  '/gamificacion/admin/insignias',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.aulaUser!;
      const nombre = String(req.body?.nombre || '').trim();
      const descripcion = String(req.body?.descripcion || '').trim();
      const categoria = String(req.body?.categoria || 'ACADEMICO').toUpperCase();
      const puntosBonus = Math.max(0, Math.round(Number(req.body?.puntosBonus || 30)));
      const icono = String(req.body?.icono || 'award');

      if (nombre.length < 3 || descripcion.length < 5) {
        return res.status(400).json({ error: 'Completa el nombre y descripción de la insignia.' });
      }

      const codigo = `INS_${Date.now().toString(36).toUpperCase()}`;
      const [created] = await db
        .insert(insigniaDef)
        .values({
          tenantId,
          codigo,
          nombre,
          descripcion,
          icono,
          categoria,
          puntosBonus,
          condicionTipo: 'MANUAL',
          condicionValor: 1,
          activa: true,
        })
        .returning();

      return res.status(201).json({ insignia: created });
    } catch (error) {
      console.error('Error creating badge:', error);
      return res.status(500).json({ error: 'No se pudo crear la insignia.' });
    }
  },
);

// ============================================================================
// PERSISTENT NOTIFICATIONS (READ & MARK AS READ)
// ============================================================================

gamificacionRouter.get('/notificaciones', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeedData();
    const { tenantId, rol, estudianteId, sub } = req.aulaUser!;
    const isDocente = rol === 'ADMIN' || rol === 'PROFESOR';
    const destRol = isDocente ? 'DOCENTE' : 'ESTUDIANTE';
    const destId = isDocente ? sub : estudianteId || sub;

    const rows = await db
      .select()
      .from(notificacionAula)
      .where(
        and(
          eq(notificacionAula.tenantId, tenantId),
          eq(notificacionAula.destinatarioRol, destRol),
          eq(notificacionAula.destinatarioId, destId),
        ),
      )
      .orderBy(desc(notificacionAula.createdAt))
      .limit(25);

    const noLeidas = rows.filter((n) => !n.leida).length;
    return res.json({ notificaciones: rows, noLeidas });
  } catch (error) {
    console.error('Error loading notifications:', error);
    return res.status(500).json({ error: 'No se pudieron cargar las notificaciones.' });
  }
});

gamificacionRouter.patch('/notificaciones/leer-todas', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { tenantId, rol, estudianteId, sub } = req.aulaUser!;
    const isDocente = rol === 'ADMIN' || rol === 'PROFESOR';
    const destRol = isDocente ? 'DOCENTE' : 'ESTUDIANTE';
    const destId = isDocente ? sub : estudianteId || sub;

    await db
      .update(notificacionAula)
      .set({ leida: true })
      .where(
        and(
          eq(notificacionAula.tenantId, tenantId),
          eq(notificacionAula.destinatarioRol, destRol),
          eq(notificacionAula.destinatarioId, destId),
          eq(notificacionAula.leida, false),
        ),
      );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    return res.status(500).json({ error: 'No se pudieron actualizar las notificaciones.' });
  }
});
