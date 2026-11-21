import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORLD_PETS_CATALOG,
  getWorldPetMeta,
  isValidWorldPetSpecies,
  resolveWorldPetSpecies,
} from '../../lib/world-pets.ts';
import {
  checkDailyPointsCap,
  computePetMood,
  computePetStageFromXp,
  computeReviewGameOutcome,
  evaluatePetStudyVitality,
  evaluateStreakStatus,
  validateRedemptionEligibility,
} from './gamificacion-engine.ts';

test('evaluateStreakStatus classifies ACTIVA, EN_RIESGO, PERDIDA and computes milestone progress', () => {
  const active = evaluateStreakStatus({
    rachaActual: 6,
    ultimaActividadFecha: '2026-11-20',
    rachaPerdidaValor: 0,
    rachaPerdidaFecha: null,
    comodinesRacha: 2,
    recuperacionesEsteMes: 0,
    recuperacionMesRef: '2026-11',
    maxRecuperacionesMes: 2,
    ventanaRecuperacionHoras: 48,
    hoyKey: '2026-11-20',
    horaLocal: 14,
  });
  assert.equal(active.estadoVisual, 'ACTIVA');
  assert.equal(active.completadoHoy, true);
  assert.equal(active.proximoHito?.dias, 7);
  assert.deepEqual(active.hitosAlcanzados, [3]);

  const atRisk = evaluateStreakStatus({
    rachaActual: 5,
    ultimaActividadFecha: '2026-11-19',
    rachaPerdidaValor: 0,
    rachaPerdidaFecha: null,
    comodinesRacha: 1,
    recuperacionesEsteMes: 0,
    recuperacionMesRef: '2026-11',
    maxRecuperacionesMes: 2,
    ventanaRecuperacionHoras: 48,
    hoyKey: '2026-11-20',
    horaLocal: 19,
  });
  assert.equal(atRisk.estadoVisual, 'EN_RIESGO');
  assert.equal(atRisk.puedeUsarComodin, true);
  assert.equal(atRisk.rachaVigente, 5);

  const lostRecoverable = evaluateStreakStatus({
    rachaActual: 0,
    ultimaActividadFecha: '2026-11-18',
    rachaPerdidaValor: 9,
    rachaPerdidaFecha: '2026-11-19',
    comodinesRacha: 0,
    recuperacionesEsteMes: 0,
    recuperacionMesRef: '2026-11',
    maxRecuperacionesMes: 2,
    ventanaRecuperacionHoras: 48,
    hoyKey: '2026-11-20',
    horaLocal: 10,
  });
  assert.equal(lostRecoverable.estadoVisual, 'PERDIDA');
  assert.equal(lostRecoverable.puedeRecuperar, true);
  assert.equal(lostRecoverable.rachaRecuperable, 9);

  // Respects monthly recovery cap
  const capped = evaluateStreakStatus({
    rachaActual: 0,
    ultimaActividadFecha: '2026-11-18',
    rachaPerdidaValor: 9,
    rachaPerdidaFecha: '2026-11-19',
    comodinesRacha: 0,
    recuperacionesEsteMes: 2,
    recuperacionMesRef: '2026-11',
    maxRecuperacionesMes: 2,
    ventanaRecuperacionHoras: 48,
    hoyKey: '2026-11-20',
    horaLocal: 10,
  });
  assert.equal(capped.puedeRecuperar, false);
});

test('computePetStageFromXp and computePetMood evolve stages and stay encouraging on lost streaks', () => {
  assert.equal(computePetStageFromXp(50).etapa, 1);
  assert.equal(computePetStageFromXp(250).etapa, 2);
  assert.equal(computePetStageFromXp(680).etapa, 3);
  assert.equal(computePetStageFromXp(1450).etapa, 4);

  const excited = computePetMood({
    streakState: 'RECUPERADA',
    energia: 90,
    felicidad: 92,
    saciedad: 85,
    ultimaReaccionTipo: 'RECUPERACION',
  });
  assert.equal(excited.mood, 'EMOCIONADA');

  const resting = computePetMood({
    streakState: 'ACTIVA',
    energia: 20,
    felicidad: 80,
    saciedad: 80,
  });
  assert.equal(resting.mood, 'DESCANSANDO');

  const lostStreak = computePetMood({
    streakState: 'PERDIDA',
    energia: 70,
    felicidad: 60,
    saciedad: 70,
  });
  assert.equal(lostStreak.mood, 'TRISTE');
  assert.ok(lostStreak.mensaje.includes('No pasa nada'));
});

test('validateRedemptionEligibility enforces balance, stock, duplicate cosmetics, and shield caps', () => {
  assert.equal(
    validateRedemptionEligibility({
      puntosSaldo: 100,
      precioPuntos: 120,
      stock: 5,
      activo: true,
      categoria: 'PREMIO_ALLEN',
    }).ok,
    false,
  );

  assert.equal(
    validateRedemptionEligibility({
      puntosSaldo: 300,
      precioPuntos: 120,
      stock: 0,
      activo: true,
      categoria: 'PREMIO_ALLEN',
    }).ok,
    false,
  );

  assert.equal(
    validateRedemptionEligibility({
      puntosSaldo: 300,
      precioPuntos: 100,
      stock: null,
      activo: true,
      categoria: 'MASCOTA_ACCESORIO',
      yaPoseeCodigo: true,
    }).ok,
    false,
  );

  assert.equal(
    validateRedemptionEligibility({
      puntosSaldo: 300,
      precioPuntos: 100,
      stock: null,
      activo: true,
      categoria: 'COMODIN_RACHA',
      comodinesActuales: 5,
      maxComodinesStock: 5,
    }).ok,
    false,
  );

  assert.equal(
    validateRedemptionEligibility({
      puntosSaldo: 300,
      precioPuntos: 100,
      stock: 3,
      activo: true,
      categoria: 'BENEFICIO_ACADEMICO',
    }).ok,
    true,
  );
});

test('checkDailyPointsCap prevents abuse and flags capped bursts as suspicious', () => {
  const normal = checkDailyPointsCap({ earnedToday: 120, awardAmount: 40, dailyCap: 400 });
  assert.equal(normal.allowedAmount, 40);
  assert.equal(normal.suspicious, false);

  const partial = checkDailyPointsCap({ earnedToday: 380, awardAmount: 60, dailyCap: 400 });
  assert.equal(partial.allowedAmount, 20);
  assert.equal(partial.capped, true);
  assert.equal(partial.suspicious, true);

  const blocked = checkDailyPointsCap({ earnedToday: 400, awardAmount: 50, dailyCap: 400 });
  assert.equal(blocked.allowedAmount, 0);
  assert.equal(blocked.suspicious, true);
});

test('world pets catalog covers 8 distinct species and resolves legacy species cleanly', () => {
  assert.equal(WORLD_PETS_CATALOG.length, 8);
  assert.equal(isValidWorldPetSpecies('CONDOR_ANDES'), true);
  assert.equal(isValidWorldPetSpecies('PANDA_ROJO'), true);
  assert.equal(isValidWorldPetSpecies('UNKNOWN_PET'), false);

  assert.equal(resolveWorldPetSpecies('ZORRO_ESTUDIO'), 'ZORRO_ARTICO');
  assert.equal(resolveWorldPetSpecies('DRAGON_LINGUA'), 'PANDA_ROJO');
  assert.equal(resolveWorldPetSpecies('shiba_tokio'), 'SHIBA_TOKIO');

  const meta = getWorldPetMeta('TORTUGA_GALAPAGOS');
  assert.equal(meta.region, 'América');
  assert.equal(meta.nombreSugerido, 'Darwin');
});

test('evaluatePetStudyVitality ties pet state directly to daily study activity and streak', () => {
  const radiant = evaluatePetStudyVitality({
    streakState: 'ACTIVA',
    completadoHoy: true,
    energia: 90,
    felicidad: 92,
    saciedad: 88,
    rachaVigente: 5,
  });
  assert.equal(radiant.nivelVital, 'RADIANTE');
  assert.ok(radiant.porcentaje >= 85);

  const needsReview = evaluatePetStudyVitality({
    streakState: 'EN_RIESGO',
    completadoHoy: false,
    energia: 60,
    felicidad: 65,
    saciedad: 60,
    rachaVigente: 4,
  });
  assert.equal(needsReview.nivelVital, 'NECESITA_REPASO');

  const resting = evaluatePetStudyVitality({
    streakState: 'PERDIDA',
    completadoHoy: false,
    energia: 40,
    felicidad: 45,
    saciedad: 40,
    rachaVigente: 0,
  });
  assert.equal(resting.nivelVital, 'EN_REPOSO');
});

test('computeReviewGameOutcome calculates accuracy, streak activation, and simulator bonus', () => {
  const repaso = computeReviewGameOutcome({ aciertos: 4, total: 5, modoJuego: 'REPASO' });
  assert.equal(repaso.porcentaje, 80);
  assert.equal(repaso.aprobado, true);
  assert.equal(repaso.activaRacha, true);
  assert.ok(repaso.puntosBase > 0 && repaso.xpGanado > 0);

  const sim = computeReviewGameOutcome({ aciertos: 5, total: 5, modoJuego: 'SIMULADOR' });
  assert.equal(sim.porcentaje, 100);
  assert.ok(sim.puntosBase > repaso.puntosBase);

  const lowScore = computeReviewGameOutcome({ aciertos: 1, total: 5, modoJuego: 'REPASO' });
  assert.equal(lowScore.aprobado, false);
  assert.equal(lowScore.activaRacha, false);
});

