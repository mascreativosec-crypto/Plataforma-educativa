export type StreakVisualState = 'ACTIVA' | 'EN_RIESGO' | 'RECUPERADA' | 'PERDIDA' | 'SIN_INICIAR';

export type PetMood = 'EMOCIONADA' | 'FELIZ' | 'DESCANSANDO' | 'ESPERANDO' | 'TRISTE';

export type PetStage = 1 | 2 | 3 | 4;

export interface StreakMilestoneConfig {
  dias: number;
  puntos: number;
  titulo: string;
  insigniaCodigo?: string;
}

export const DEFAULT_STREAK_MILESTONES: StreakMilestoneConfig[] = [
  { dias: 3, puntos: 35, titulo: 'Chispa inicial (3 días)', insigniaCodigo: 'RACHA_3' },
  { dias: 7, puntos: 75, titulo: 'Semana constante (7 días)', insigniaCodigo: 'RACHA_7' },
  { dias: 14, puntos: 150, titulo: 'Quincena de fuego (14 días)', insigniaCodigo: 'RACHA_14' },
  { dias: 30, puntos: 300, titulo: 'Hábito mensual (30 días)', insigniaCodigo: 'RACHA_30' },
  { dias: 60, puntos: 500, titulo: 'Disciplina ALLEN (60 días)', insigniaCodigo: 'RACHA_60' },
  { dias: 100, puntos: 900, titulo: 'Centurión del inglés (100 días)', insigniaCodigo: 'RACHA_100' },
  { dias: 365, puntos: 2500, titulo: 'Leyenda anual (365 días)', insigniaCodigo: 'RACHA_365' },
];

export const PET_STAGE_META: Record<
  PetStage,
  { nombre: string; minXp: number; descripcion: string }
> = {
  1: { nombre: 'Polluelo Curioso', minXp: 0, descripcion: 'Recién comienza su aventura de inglés.' },
  2: { nombre: 'Aprendiz Activo', minXp: 200, descripcion: 'Domina los primeros retos y mantiene el ritmo.' },
  3: { nombre: 'Explorador Bilingüe', minXp: 600, descripcion: 'Brilla en tareas, evaluaciones y rachas largas.' },
  4: { nombre: 'Maestro Cambridge', minXp: 1300, descripcion: 'Evolución máxima de excelencia en ALLEN Aula.' },
};

/**
 * Returns YYYY-MM-DD in America/Guayaquil timezone.
 */
export function getGuayaquilDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

export function getGuayaquilHour(date: Date = new Date()): number {
  const raw = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guayaquil',
    hour: 'numeric',
    hour12: false,
  }).format(date);
  const n = Number(raw);
  return Number.isFinite(n) ? n % 24 : 12;
}

export function diffCalendarDays(dateKeyA: string, dateKeyB: string): number {
  const [ya, ma, da] = dateKeyA.split('-').map(Number);
  const [yb, mb, db] = dateKeyB.split('-').map(Number);
  const utcA = Date.UTC(ya, ma - 1, da);
  const utcB = Date.UTC(yb, mb - 1, db);
  return Math.round((utcB - utcA) / (24 * 60 * 60 * 1000));
}

export function addCalendarDays(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return next.toISOString().slice(0, 10);
}

export interface StreakEvaluationInput {
  rachaActual: number;
  ultimaActividadFecha: string | null;
  rachaPerdidaValor: number;
  rachaPerdidaFecha: string | null;
  comodinesRacha: number;
  recuperacionesEsteMes: number;
  recuperacionMesRef: string | null;
  maxRecuperacionesMes: number;
  ventanaRecuperacionHoras: number;
  ultimaActividadFueRecuperada?: boolean;
  hoyKey: string;
  horaLocal: number;
  milestones?: StreakMilestoneConfig[];
}

export interface StreakEvaluationResult {
  estadoVisual: StreakVisualState;
  rachaVigente: number;
  completadoHoy: boolean;
  puedeUsarComodin: boolean;
  puedeRecuperar: boolean;
  rachaRecuperable: number;
  diasSinActividad: number;
  proximoHito: StreakMilestoneConfig | null;
  progresoHitoPct: number;
  hitosAlcanzados: number[];
  alertaMensaje: string | null;
}

export function evaluateStreakStatus(input: StreakEvaluationInput): StreakEvaluationResult {
  const milestones = (input.milestones?.length ? input.milestones : DEFAULT_STREAK_MILESTONES)
    .slice()
    .sort((a, b) => a.dias - b.dias);

  const mesActual = input.hoyKey.slice(0, 7);
  const recupsMes =
    input.recuperacionMesRef === mesActual ? input.recuperacionesEsteMes : 0;
  const maxDiasRecuperacion = Math.max(1, Math.ceil(input.ventanaRecuperacionHoras / 24));

  let estadoVisual: StreakVisualState = 'SIN_INICIAR';
  let rachaVigente = input.rachaActual;
  let completadoHoy = false;
  let puedeUsarComodin = false;
  let puedeRecuperar = false;
  let rachaRecuperable = 0;
  let diasSinActividad = 0;
  let alertaMensaje: string | null = null;

  if (!input.ultimaActividadFecha && input.rachaPerdidaValor <= 0) {
    estadoVisual = 'SIN_INICIAR';
    rachaVigente = 0;
    alertaMensaje = 'Completa tu primera actividad hoy para encender tu racha.';
  } else if (input.ultimaActividadFecha) {
    diasSinActividad = Math.max(0, diffCalendarDays(input.ultimaActividadFecha, input.hoyKey));

    if (diasSinActividad === 0) {
      completadoHoy = true;
      estadoVisual = input.ultimaActividadFueRecuperada ? 'RECUPERADA' : 'ACTIVA';
    } else if (diasSinActividad === 1 && input.rachaActual > 0) {
      // Active yesterday, needs activity today before midnight
      estadoVisual = 'EN_RIESGO';
      rachaVigente = input.rachaActual;
      puedeUsarComodin = input.comodinesRacha > 0;
      alertaMensaje =
        input.horaLocal >= 17
          ? `¡Tu racha de ${input.rachaActual} días vence hoy! Completa una lección o usa un comodín.`
          : `Completa una actividad hoy para llevar tu racha a ${input.rachaActual + 1} días.`;
    } else {
      // Missed at least one full day
      estadoVisual = 'PERDIDA';
      const lostCandidate =
        input.rachaActual > 0 ? input.rachaActual : input.rachaPerdidaValor;
      rachaVigente = 0;

      const diasDesdePerdida = input.rachaPerdidaFecha
        ? Math.max(0, diffCalendarDays(input.rachaPerdidaFecha, input.hoyKey))
        : diasSinActividad - 1;

      if (lostCandidate > 0 && diasDesdePerdida <= maxDiasRecuperacion) {
        if (recupsMes < input.maxRecuperacionesMes) {
          puedeRecuperar = true;
          rachaRecuperable = lostCandidate;
        }
        if (diasSinActividad === 2 && input.comodinesRacha > 0) {
          puedeUsarComodin = true;
        }
      }

      alertaMensaje = puedeRecuperar
        ? `Perdiste una racha de ${lostCandidate} días, pero aún puedes recuperarla con ALLEN POINTS.`
        : 'Tu racha se pausó. ¡Hoy es un gran día para empezar una nueva!';
    }
  } else if (input.rachaPerdidaValor > 0) {
    estadoVisual = 'PERDIDA';
    rachaVigente = 0;
    const diasDesdePerdida = input.rachaPerdidaFecha
      ? Math.max(0, diffCalendarDays(input.rachaPerdidaFecha, input.hoyKey))
      : 1;
    if (diasDesdePerdida <= maxDiasRecuperacion && recupsMes < input.maxRecuperacionesMes) {
      puedeRecuperar = true;
      rachaRecuperable = input.rachaPerdidaValor;
      alertaMensaje = `Puedes recuperar tu racha de ${input.rachaPerdidaValor} días usando ALLEN POINTS.`;
    }
  }

  const hitosAlcanzados = milestones
    .filter((m) => rachaVigente >= m.dias)
    .map((m) => m.dias);

  const proximoHito = milestones.find((m) => m.dias > rachaVigente) || null;
  const hitoAnteriorDias =
    hitosAlcanzados.length > 0 ? hitosAlcanzados[hitosAlcanzados.length - 1] : 0;

  let progresoHitoPct = 100;
  if (proximoHito) {
    const span = Math.max(1, proximoHito.dias - hitoAnteriorDias);
    const done = Math.max(0, rachaVigente - hitoAnteriorDias);
    progresoHitoPct = Math.min(100, Math.round((done / span) * 100));
  }

  return {
    estadoVisual,
    rachaVigente,
    completadoHoy,
    puedeUsarComodin,
    puedeRecuperar,
    rachaRecuperable,
    diasSinActividad,
    proximoHito,
    progresoHitoPct,
    hitosAlcanzados,
    alertaMensaje,
  };
}

export function computePetStageFromXp(xp: number): {
  etapa: PetStage;
  nivel: number;
  xpNivelActual: number;
  xpSiguienteNivel: number;
  progresoNivelPct: number;
  etapaNombre: string;
} {
  const safeXp = Math.max(0, Math.floor(xp));
  const nivel = Math.floor(safeXp / 100) + 1;
  const xpNivelActual = safeXp % 100;
  const xpSiguienteNivel = 100;
  const progresoNivelPct = Math.min(100, Math.round((xpNivelActual / xpSiguienteNivel) * 100));

  let etapa: PetStage = 1;
  if (safeXp >= PET_STAGE_META[4].minXp) etapa = 4;
  else if (safeXp >= PET_STAGE_META[3].minXp) etapa = 3;
  else if (safeXp >= PET_STAGE_META[2].minXp) etapa = 2;

  return {
    etapa,
    nivel,
    xpNivelActual,
    xpSiguienteNivel,
    progresoNivelPct,
    etapaNombre: PET_STAGE_META[etapa].nombre,
  };
}

export function computePetMood(params: {
  streakState: StreakVisualState;
  energia: number;
  felicidad: number;
  saciedad: number;
  ultimaReaccionTipo?: string | null;
}): {
  mood: PetMood;
  etiqueta: string;
  mensaje: string;
} {
  const { streakState, energia, felicidad, saciedad, ultimaReaccionTipo } = params;

  if (
    ultimaReaccionTipo === 'HITO' ||
    ultimaReaccionTipo === 'RECUPERACION' ||
    ultimaReaccionTipo === 'RECOMPENSA' ||
    (streakState === 'RECUPERADA' && felicidad >= 70)
  ) {
    return {
      mood: 'EMOCIONADA',
      etiqueta: 'Emocionada',
      mensaje: '¡Increíble avance! Celebra tu esfuerzo y sigue sumando logros.',
    };
  }

  if (streakState === 'PERDIDA') {
    return {
      mood: 'TRISTE',
      etiqueta: 'Te extraña',
      mensaje: 'No pasa nada si descansaste un día. ¡Volvamos juntos hoy a tu ritmo!',
    };
  }

  if (energia < 35) {
    return {
      mood: 'DESCANSANDO',
      etiqueta: 'Descansando',
      mensaje: 'Está recargando energías. Un cuidado rápido o una lección le darán impulso.',
    };
  }

  if (streakState === 'EN_RIESGO' || saciedad < 45 || felicidad < 50) {
    return {
      mood: 'ESPERANDO',
      etiqueta: 'Esperando atención',
      mensaje: '¡Te está esperando para practicar inglés hoy y cuidar su racha!',
    };
  }

  return {
    mood: 'FELIZ',
    etiqueta: 'Feliz',
    mensaje: '¡Súper feliz con tu constancia! Lista para aprender algo nuevo contigo.',
  };
}

export interface RedemptionCheckInput {
  puntosSaldo: number;
  precioPuntos: number;
  stock: number | null;
  activo: boolean;
  categoria: string;
  yaPoseeCodigo?: boolean;
  comodinesActuales?: number;
  maxComodinesStock?: number;
}

export function validateRedemptionEligibility(
  input: RedemptionCheckInput,
): { ok: true } | { ok: false; reason: string } {
  if (!input.activo) {
    return { ok: false, reason: 'Esta recompensa no se encuentra disponible actualmente.' };
  }
  if (input.precioPuntos < 0) {
    return { ok: false, reason: 'Precio inválido.' };
  }
  if (input.puntosSaldo < input.precioPuntos) {
    return {
      ok: false,
      reason: `Necesitas ${input.precioPuntos - input.puntosSaldo} ALLEN POINTS adicionales.`,
    };
  }
  if (input.stock !== null && input.stock <= 0) {
    return { ok: false, reason: 'Sin inventario disponible por el momento.' };
  }
  if (
    input.yaPoseeCodigo &&
    (input.categoria === 'MASCOTA_ACCESORIO' ||
      input.categoria === 'MASCOTA_VESTIMENTA' ||
      input.categoria === 'PERFIL_VISUAL' ||
      input.categoria === 'INSIGNIA')
  ) {
    return { ok: false, reason: 'Ya desbloqueaste este elemento en tu colección.' };
  }
  if (
    input.categoria === 'COMODIN_RACHA' &&
    typeof input.comodinesActuales === 'number' &&
    typeof input.maxComodinesStock === 'number' &&
    input.comodinesActuales >= input.maxComodinesStock
  ) {
    return {
      ok: false,
      reason: `Ya tienes el máximo de ${input.maxComodinesStock} comodines acumulados.`,
    };
  }
  return { ok: true };
}

export function checkDailyPointsCap(params: {
  earnedToday: number;
  awardAmount: number;
  dailyCap: number;
}): { allowedAmount: number; capped: boolean; suspicious: boolean } {
  const remaining = Math.max(0, params.dailyCap - params.earnedToday);
  if (params.awardAmount <= 0) {
    return { allowedAmount: 0, capped: false, suspicious: false };
  }
  if (remaining <= 0) {
    return { allowedAmount: 0, capped: true, suspicious: true };
  }
  if (params.awardAmount > remaining) {
    return { allowedAmount: remaining, capped: true, suspicious: true };
  }
  return { allowedAmount: params.awardAmount, capped: false, suspicious: false };
}

export type PetVitalityLevel = 'RADIANTE' | 'ACTIVA' | 'NECESITA_REPASO' | 'EN_REPOSO';

export interface PetVitalityStatus {
  nivelVital: PetVitalityLevel;
  porcentaje: number;
  etiqueta: string;
  resumen: string;
  accionSugerida: string;
}

/**
 * Conecta el estado vital de la mascota directamente con la constancia académica
 * (racha activa, repasos, tareas y exámenes) en lugar de clics vacíos.
 */
export function evaluatePetStudyVitality(params: {
  streakState: StreakVisualState;
  completadoHoy: boolean;
  energia: number;
  felicidad: number;
  saciedad: number;
  rachaVigente: number;
}): PetVitalityStatus {
  const avgStats = Math.round((params.energia + params.felicidad + params.saciedad) / 3);

  if (params.streakState === 'PERDIDA') {
    const pct = Math.max(20, Math.min(48, Math.round(avgStats * 0.55)));
    return {
      nivelVital: 'EN_REPOSO',
      porcentaje: pct,
      etiqueta: 'En reposo · Te espera',
      resumen: 'Sin actividad reciente. Una ronda de repaso o lección la despierta al instante.',
      accionSugerida: 'Jugar una ronda de repaso hoy',
    };
  }

  if (params.streakState === 'EN_RIESGO' || !params.completadoHoy) {
    const pct = Math.max(45, Math.min(74, Math.round(avgStats * 0.8)));
    return {
      nivelVital: 'NECESITA_REPASO',
      porcentaje: pct,
      etiqueta: 'Necesita repaso hoy',
      resumen:
        params.rachaVigente > 0
          ? `Tu racha de ${params.rachaVigente} días está en juego. Repasa, entrega una tarea o rinde un examen para mantenerla activa.`
          : 'Completa una lección o juega un repaso rápido para activar tu racha hoy.',
      accionSugerida: 'Repasar ahora para proteger tu racha',
    };
  }

  if (avgStats >= 82 && params.rachaVigente >= 3) {
    return {
      nivelVital: 'RADIANTE',
      porcentaje: Math.min(100, Math.max(88, avgStats)),
      etiqueta: 'Radiante y activa',
      resumen: `¡Tu constancia de ${params.rachaVigente} días mantiene a tu mascota llena de energía!`,
      accionSugerida: 'Seguir sumando XP con cursos o simuladores',
    };
  }

  return {
    nivelVital: 'ACTIVA',
    porcentaje: Math.min(95, Math.max(72, avgStats)),
    etiqueta: 'Activa hoy',
    resumen: 'Actividad académica registrada hoy. Tus tareas y repasos fortalecen su evolución.',
    accionSugerida: 'Completar un simulador o lección para subir de etapa',
  };
}

export function computeReviewGameOutcome(params: {
  aciertos: number;
  total: number;
  modoJuego: 'REPASO' | 'SIMULADOR' | 'MICRO_PRO';
}): {
  porcentaje: number;
  aprobado: boolean;
  activaRacha: boolean;
  puntosBase: number;
  xpGanado: number;
  deltaEnergia: number;
  deltaFelicidad: number;
  deltaSaciedad: number;
} {
  const safeTotal = Math.max(1, Math.min(20, Math.round(params.total)));
  const safeAciertos = Math.max(0, Math.min(safeTotal, Math.round(params.aciertos)));
  const porcentaje = Math.round((safeAciertos / safeTotal) * 100);
  const aprobado = porcentaje >= 60;
  const activaRacha = safeAciertos >= Math.max(2, Math.ceil(safeTotal * 0.5));

  const multiplier = params.modoJuego === 'SIMULADOR' ? 1.3 : params.modoJuego === 'MICRO_PRO' ? 1.15 : 1;
  const puntosBase = Math.round((10 + safeAciertos * 6 + (porcentaje === 100 ? 10 : 0)) * multiplier);
  const xpGanado = Math.round(15 + safeAciertos * 8 + (aprobado ? 10 : 0));

  return {
    porcentaje,
    aprobado,
    activaRacha,
    puntosBase,
    xpGanado,
    deltaEnergia: aprobado ? 22 : 12,
    deltaFelicidad: aprobado ? 25 : 14,
    deltaSaciedad: aprobado ? 18 : 10,
  };
}

