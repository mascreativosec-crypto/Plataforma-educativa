export type AulaRol = 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE';

export interface AulaUsuario {
  sub: string;
  tenantId: string;
  rol: AulaRol;
  nombre: string;
  email: string;
  estudianteId?: string;
  provider: 'firebase' | 'sso' | 'estudiante' | 'demo';
}

export interface TenantInfo {
  id: string;
  nombre?: string | null;
  subdominio?: string | null;
}

export interface CursoItem {
  id: string;
  tenantId: string;
  nombre: string;
  descripcion: string | null;
  nivel: string | null;
  portadaUrl: string | null;
  estado: 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';
  horarioId: string | null;
  profesorId: string | null;
  profesorNombre: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  createdAt: string;
  estadisticas?: {
    inscritos: number;
    unidades: number;
    lecciones: number;
    tareas: number;
  };
  progresoPorcentaje?: number;
  leccionesPublicadas?: number;
  leccionesCompletadas?: number;
}

export type TipoMaterial = 'PDF' | 'VIDEO' | 'ENLACE' | 'IMAGEN' | 'AUDIO' | 'GOOGLE_DRIVE';

export interface MaterialItem {
  id: string;
  leccionId: string;
  tipo: TipoMaterial;
  titulo: string;
  descripcion: string | null;
  url: string;
  mimeType: string | null;
  tamanoBytes: number | null;
  orden: number;
}

export interface HistorialNotaCambio {
  fecha: string;
  actorId: string;
  actorNombre: string;
  actorRol: AulaRol;
  notaAnterior: number | null;
  notaNueva: number;
  motivo: string;
}

export interface EntregaItem {
  id: string;
  tareaId: string;
  estudianteId: string;
  archivoUrl: string | null;
  comentario: string | null;
  estado: 'PENDIENTE' | 'ENTREGADO' | 'TARDIO' | 'CALIFICADO' | 'DEVUELTO';
  nota: number | null;
  feedback: string | null;
  calificadoEn: string | null;
  notaAsentadaEn?: string | null;
  ultimoMotivoCambio?: string | null;
  historialNotas?: HistorialNotaCambio[];
  entregadoEn: string | null;
  tareaTitulo?: string;
  tipoTarea?: string;
  nivelMcer?: string | null;
  instrucciones?: string | null;
  notaMaxima?: number;
  estudiante?: EstudianteMirror;
}

export interface TareaItem {
  id: string;
  cursoId: string;
  leccionId: string | null;
  titulo: string;
  instrucciones: string | null;
  tipoTarea?: 'GENERAL' | 'WRITING' | string;
  nivelMcer?: string | null;
  minPalabras?: number | null;
  maxPalabras?: number | null;
  notaMaxima: number;
  venceEn: string | null;
  permiteTardio: boolean;
  publicada: boolean;
  miEntrega?: EntregaItem | null;
}

export type TipoPregunta =
  | 'OPCION_MULTIPLE'
  | 'SELECCION_MULTIPLE'
  | 'UNIR_PAREJAS'
  | 'COMPLETAR_ESPACIOS'
  | 'ORDENAR_PALABRAS'
  | 'ORDENAR_ORACIONES'
  | 'RELACIONAR_COLUMNAS'
  | 'COMPLETAR_OPCIONES'
  | 'VERDADERO_FALSO'
  | 'RESPUESTA_CORTA'
  | 'WRITING';

export type PoliticaSalidaExamen = 'SOLO_REGISTRO' | 'ADVERTENCIA_LIMITE' | 'ANULAR_CON_CERO';

export type EventoIntegridadTipo =
  | 'CAMBIO_PESTANA'
  | 'PERDIDA_FOCO'
  | 'INTENTO_SALIDA'
  | 'SALIDA_CONFIRMADA';

export interface EventoIntegridadExamen {
  tipo: EventoIntegridadTipo;
  timestamp: string;
  detalle?: string;
}

export interface PreguntaItem {
  id: string;
  quizId: string;
  orden: number;
  enunciado: string;
  tipo: TipoPregunta;
  opciones: unknown;
  respuestaCorrecta?: unknown;
  audioUrl?: string | null;
  videoUrl?: string | null;
  retroalimentacion?: string | null;
  minPalabras?: number | null;
  maxPalabras?: number | null;
  puntos: number;
}

export interface IntentoQuizItem {
  id: string;
  quizId: string;
  estudianteId: string;
  estado: 'EN_CURSO' | 'ENVIADO' | 'CALIFICADO';
  respuestas?: Record<string, unknown> | null;
  nota: number | null;
  requiereRevisionDocente?: boolean;
  calificacionManual?: Record<string, number> | null;
  feedbackDocente?: string | null;
  notaAsentadaEn?: string | null;
  calificadoPor?: string | null;
  ultimoMotivoCambio?: string | null;
  historialNotas?: HistorialNotaCambio[];
  eventosIntegridad?: EventoIntegridadExamen[] | null;
  cambiosPestanaCount?: number;
  anuladoPorSalida?: boolean;
  motivoAnulacion?: string | null;
  inicioEn: string;
  finEn: string | null;
}

export interface QuizItem {
  id: string;
  leccionId: string;
  titulo: string;
  descripcion?: string | null;
  intentosMax: number;
  notaMinima: number;
  tiempoLimiteMin?: number | null;
  abrirEn?: string | null;
  cerrarEn?: string | null;
  envioAutomatico?: boolean;
  modo?: 'EXAMEN' | 'PRACTICA' | string;
  mezclarPreguntas?: boolean;
  nivelMcer?: string | null;
  habilidadCambridge?: string | null;
  politicaSalida?: PoliticaSalidaExamen;
  maxCambiosPestana?: number;
  publicada: boolean;
  preguntas: PreguntaItem[];
  misIntentos?: IntentoQuizItem[];
}

export interface IntentoRevisionItem extends IntentoQuizItem {
  quizTitulo: string;
  nivelMcer: string | null;
  notaMinima: number;
  politicaSalida?: PoliticaSalidaExamen;
  maxCambiosPestana?: number;
  estudiante: EstudianteMirror;
  preguntasWriting: PreguntaItem[];
  totalPreguntas: number;
}

export interface ProgresoLeccionItem {
  id: string;
  leccionId: string;
  estado: 'NO_INICIADA' | 'EN_PROGRESO' | 'COMPLETADA';
  porcentaje: number;
  completadaEn: string | null;
}

export interface LeccionDetallada {
  id: string;
  unidadId: string;
  orden: number;
  titulo: string;
  contenido: string | null;
  publicada: boolean;
  materiales: MaterialItem[];
  tareas: TareaItem[];
  quizzes: QuizItem[];
  progreso: ProgresoLeccionItem | null;
}

export interface UnidadDetallada {
  id: string;
  cursoId: string;
  orden: number;
  titulo: string;
  descripcion: string | null;
  lecciones: LeccionDetallada[];
}

export interface AnuncioItem {
  id: string;
  cursoId: string;
  titulo: string;
  mensaje: string;
  esSaludo?: boolean;
  autorNombre: string;
  createdAt: string;
}

export interface CursoDetalleResponse {
  curso: CursoItem;
  unidades: UnidadDetallada[];
  tareas: TareaItem[];
  anuncios: AnuncioItem[];
  progresoCurso: number;
}

export interface EstudianteMirror {
  id: string;
  tenantId: string;
  nombres: string;
  apellidos: string;
  numeroContrato: string | null;
  email: string | null;
  estado: string;
  etiquetaEstado?: string | null;
}

export interface ParticipanteItem {
  inscripcionId: string;
  estado: 'PENDIENTE' | 'ACTIVO' | 'RETIRADO' | 'FINALIZADO';
  origen: string;
  fechaAlta: string;
  fechaBaja: string | null;
  estudiante: EstudianteMirror;
  progresoPorcentaje: number;
  leccionesCompletadas: number;
  leccionesTotales: number;
}

export interface CalificacionesResponse {
  tareas: TareaItem[];
  quizzes: QuizItem[];
  filas: Array<{
    estudiante: EstudianteMirror;
    notasTareas: Array<{
      tareaId: string;
      estado: string;
      nota: number | null;
      notaMaxima: number;
    }>;
    notasQuizzes: Array<{
      quizId: string;
      intentos: number;
      nota: number | null;
      notaMinima: number;
    }>;
    promedio: number | null;
  }>;
}

export interface OutboxEventItem {
  id: string;
  tenantId: string;
  tipo: string;
  payload: Record<string, unknown>;
  estado: 'PENDIENTE' | 'ENVIADO' | 'FALLIDO';
  intentos: number;
  ultimoError: string | null;
  proximoIntento: string | null;
  createdAt: string;
  enviadoEn: string | null;
}

export interface EstudianteProgresoResponse {
  estudiante: EstudianteMirror;
  cursos: Array<CursoItem & { estadoInscripcion: string; origen: string }>;
  progresos: Array<ProgresoLeccionItem & { leccionTitulo: string }>;
  entregas: Array<EntregaItem & { tareaTitulo: string; notaMaxima: number }>;
  intentos: Array<IntentoQuizItem & { quizTitulo: string; notaMinima: number }>;
}

export interface AsistenciaRegistro {
  id: string;
  cursoId: string;
  estudianteId: string;
  fecha: string;
  tema: string | null;
  estado: 'PRESENTE' | 'TARDANZA' | 'AUSENTE' | 'JUSTIFICADA' | string;
  observacion: string | null;
  origen: string;
  estudianteNombre?: string;
}

export interface AsistenciaResumen {
  total: number;
  presentes: number;
  tardanzas: number;
  justificadas: number;
  ausentes: number;
  porcentajeAsistencia: number;
}

export interface AsistenciaResponse {
  origen: string;
  resumen?: AsistenciaResumen;
  resumenGlobal?: AsistenciaResumen;
  resumenPorEstudiante?: Array<{
    estudiante: EstudianteMirror;
    resumen: AsistenciaResumen;
    ultimoRegistro: AsistenciaRegistro | null;
  }>;
  registros: AsistenciaRegistro[];
}

export interface ProximoEventoItem {
  id: string;
  tipo: 'TAREA' | 'WRITING' | 'EXAMEN';
  titulo: string;
  cursoId: string;
  cursoNombre: string;
  fecha: string;
  leccionId: string | null;
}

export interface TareaResumenGlobal {
  id: string;
  cursoId: string;
  cursoNombre: string;
  leccionId: string | null;
  titulo: string;
  tipoTarea: string;
  nivelMcer: string | null;
  notaMaxima: number;
  venceEn: string | null;
  publicada: boolean;
  miEstado: string;
  miNota: number | null;
  entregadasCount: number;
  pendientesCount: number;
}

export interface ExamenResumenGlobal {
  id: string;
  cursoId: string;
  cursoNombre: string;
  leccionId: string;
  titulo: string;
  modo: string;
  nivelMcer: string | null;
  habilidadCambridge: string | null;
  tiempoLimiteMin: number | null;
  intentosMax: number;
  notaMinima: number;
  cerrarEn: string | null;
  publicada: boolean;
  intentosCount: number;
  mejorNota: number | null;
}

export interface AnuncioResumenGlobal extends AnuncioItem {
  cursoNombre: string;
}

export interface NavegacionResumenResponse {
  badges: {
    entregasPendientes: number;
    notificaciones: number;
    actividadesPendientes: number;
    canjesPendientes?: number;
  };
  kpis: {
    cursosActivos: number;
    totalCursos?: number;
    estudiantesMatriculados: number;
    entregasPendientes: number;
    examenesActivos: number;
    promedioAcademico: number | null;
    porcentajeAsistencia: number;
    progresoPromedio: number;
    outboxPendientes: number;
  };
  proximosEventos: ProximoEventoItem[];
  anunciosRecientes: AnuncioResumenGlobal[];
  tareasResumen: TareaResumenGlobal[];
  examenesResumen: ExamenResumenGlobal[];
  entregasPendientesPorCurso: Record<string, number>;
}

// ============================================================================
// GAMIFICACIÓN, RACHAS, MASCOTA VIRTUAL, TIENDA Y NOTIFICACIONES
// ============================================================================

export type StreakVisualState = 'ACTIVA' | 'EN_RIESGO' | 'RECUPERADA' | 'PERDIDA' | 'SIN_INICIAR';
export type PetMood = 'EMOCIONADA' | 'FELIZ' | 'DESCANSANDO' | 'ESPERANDO' | 'TRISTE';
export type LearningExperienceMode = 'JUVENIL' | 'PROFESIONAL';
export type PetSpecies =
  | 'CONDOR_ANDES'
  | 'TORTUGA_GALAPAGOS'
  | 'PANDA_ROJO'
  | 'KOALA_AUSSIE'
  | 'ZORRO_ARTICO'
  | 'PINGUINO_SUR'
  | 'SHIBA_TOKIO'
  | 'BUHO_ALLEN'
  | 'ZORRO_ESTUDIO'
  | 'DRAGON_LINGUA';

export interface StreakMilestone {
  dias: number;
  puntos: number;
  titulo: string;
  insigniaCodigo?: string;
}

export interface PetVitalityInfo {
  nivelVital: 'RADIANTE' | 'ACTIVA' | 'NECESITA_REPASO' | 'EN_REPOSO';
  porcentaje: number;
  etiqueta: string;
  resumen: string;
  accionSugerida: string;
}

export interface MascotaState {
  id: string;
  nombre: string;
  especie: PetSpecies;
  etapa: 1 | 2 | 3 | 4;
  nivel: number;
  xp: number;
  energia: number;
  felicidad: number;
  saciedad: number;
  accesorioCabeza: string | null;
  accesorioCuello: string | null;
  fondoHabitat: string;
  accesoriosDesbloqueados: string[];
  ultimaReaccion: string | null;
  ultimaReaccionTipo: string | null;
  interaccionesConPuntosRestantes: number;
  stageInfo: {
    etapa: 1 | 2 | 3 | 4;
    nivel: number;
    xpNivelActual: number;
    xpSiguienteNivel: number;
    progresoNivelPct: number;
    etapaNombre: string;
  };
  mood: {
    mood: PetMood;
    etiqueta: string;
    mensaje: string;
  };
  vitalidad?: PetVitalityInfo;
}

export interface ReviewGameQuestion {
  id: string;
  enunciado: string;
  opciones: string[];
  respuestaCorrecta: string;
  explicacion: string;
  tema: string;
  origen: 'CURSO' | 'PRACTICA';
}

export interface ActividadDiariaItem {
  id: string;
  fecha: string;
  tipo: 'ACTIVA' | 'PROTEGIDA' | 'RECUPERADA';
  accionesCount: number;
  puntosGanados: number;
  detalle: string | null;
}

export interface HistorialRachaItem {
  id: string;
  tipoEvento: string;
  rachaAntes: number;
  rachaDespues: number;
  costoPuntos: number;
  recompensaPuntos: number;
  nota: string | null;
  createdAt: string;
}

export interface InsigniaItem {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  icono: string;
  categoria: string;
  puntosBonus: number;
  condicionTipo: string;
  condicionValor: number;
  desbloqueada?: boolean;
  desbloqueadaEn?: string | null;
}

export interface RetoItem {
  id: string;
  titulo: string;
  descripcion: string;
  tipoObjetivo: string;
  metaValor: number;
  recompensaPuntos: number;
  habilidadMcer: string | null;
  fechaFin: string | null;
  activo?: boolean;
  progresoActual?: number;
  completado?: boolean;
  reclamado?: boolean;
  porcentaje?: number;
}

export interface MovimientoPuntosItem {
  id: string;
  estudianteId?: string;
  estudianteNombre?: string;
  tipo: 'GANADO' | 'GASTADO' | 'AJUSTE_ADMIN';
  fuente: string;
  cantidad: number;
  saldoDespues: number;
  descripcion: string;
  sospechoso: boolean;
  createdAt: string;
}

export interface RankingEntry {
  posicion: number;
  estudianteId: string;
  nombre: string;
  puntosTotales: number;
  rachaActual: number;
  esYo: boolean;
}

export interface StudentGamificationState {
  perfil: {
    puntosSaldo: number;
    puntosTotales: number;
    xpTotal: number;
    rachaActual: number;
    rachaMaxima: number;
    comodinesRacha: number;
    perfilTema: string;
    perfilExperiencia: LearningExperienceMode;
    metaSemanalSesiones: number;
    sesionesEstaSemana: number;
    recuperacionesEsteMes: number;
  };
  racha: {
    estadoVisual: StreakVisualState;
    rachaVigente: number;
    completadoHoy: boolean;
    puedeUsarComodin: boolean;
    puedeRecuperar: boolean;
    rachaRecuperable: number;
    diasSinActividad: number;
    proximoHito: StreakMilestone | null;
    progresoHitoPct: number;
    hitosAlcanzados: number[];
    alertaMensaje: string | null;
    costoRecuperacion: number;
    maxRecuperacionesMes: number;
    ventanaRecuperacionHoras: number;
    milestones: StreakMilestone[];
  };
  mascota: MascotaState;
  calendarioActividad: ActividadDiariaItem[];
  historialRacha: HistorialRachaItem[];
  insignias: InsigniaItem[];
  retos: RetoItem[];
  movimientos: MovimientoPuntosItem[];
  ranking: RankingEntry[];
  reglas: {
    ptsLeccion: number;
    ptsTareaATiempo: number;
    ptsExamenAprobado: number;
    ptsHabilidadMcer: number;
    limitePuntosDiarios: number;
  };
}

export interface TiendaProductoItem {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  precioPuntos: number;
  stock: number | null;
  requiereAprobacion: boolean;
  imagenKey: string;
  condiciones: string | null;
  metadata?: Record<string, unknown> | null;
  activo: boolean;
  yaPosee?: boolean;
}

export interface CanjeTiendaItem {
  id: string;
  estudianteId: string;
  estudianteNombre?: string;
  productoId: string;
  productoNombre: string;
  productoCategoria?: string;
  productoImagenKey?: string;
  precioPagado: number;
  estado: 'COMPLETADO' | 'PENDIENTE_APROBACION' | 'APROBADO' | 'RECHAZADO';
  notaEstudiante: string | null;
  notaAdmin: string | null;
  createdAt: string;
}

export interface StoreResponse {
  puntosSaldo?: number;
  comodinesRacha?: number;
  productos: TiendaProductoItem[];
  canjes: CanjeTiendaItem[];
  movimientos?: MovimientoPuntosItem[];
}

export interface GamificacionConfigData {
  tenantId: string;
  ptsLeccion: number;
  ptsTareaATiempo: number;
  ptsExamenAprobado: number;
  ptsHabilidadMcer: number;
  ptsMascotaInteraccion: number;
  costoRecuperarRacha: number;
  ventanaRecuperacionHoras: number;
  maxRecuperacionesMes: number;
  maxComodinesStock: number;
  limitePuntosDiarios: number;
  hitosConfig: StreakMilestone[];
}

export interface AdminGamificationSummary {
  config: GamificacionConfigData;
  resumen: {
    totalEstudiantes: number;
    rachasActivas: number;
    rachasEnRiesgo: number;
    rachasPerdidas: number;
    totalPuntosEmitidos: number;
    canjesPendientes: number;
    alertasIrregulares: number;
    promedioRacha: number;
  };
  estudiantes: Array<{
    estudianteId: string;
    nombre: string;
    email: string | null;
    cursosInscritos: number;
    leccionesCompletadas: number;
    puntosSaldo: number;
    puntosTotales: number;
    rachaActual: number;
    rachaMaxima: number;
    estadoRacha: StreakVisualState;
    comodinesRacha: number;
    insigniasCount: number;
    mascotaNombre: string;
    mascotaEtapa: string;
    mascotaNivel: number;
  }>;
  insignias: InsigniaItem[];
  retos: RetoItem[];
  canjes: CanjeTiendaItem[];
  movimientos: MovimientoPuntosItem[];
}

export interface NotificacionAulaItem {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  accionNav: string | null;
  createdAt: string;
}

// ============================================================================
// ADMINISTRACIÓN TOTAL (PROFESORES, ESTUDIANTES E INVITACIONES)
// ============================================================================

export interface ProfesorAdminItem {
  id: number;
  uid: string;
  username?: string | null;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
  etiquetaEstado?: string | null;
  hasPassword?: boolean;
  cursosAsignados: number;
  createdAt: string;
}

export interface EstudianteAdminItem extends EstudianteMirror {
  identificadorAcceso: string | null;
  accesoActivo?: boolean;
  hasPassword?: boolean;
  inscripciones: Array<{
    inscripcionId: string;
    cursoId: string;
    cursoNombre: string;
    estado: 'PENDIENTE' | 'ACTIVO' | 'RETIRADO' | 'FINALIZADO';
  }>;
}

export interface InvitacionAulaItem {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  cursoId: string | null;
  cursoNombre?: string | null;
  codigoAcceso: string | null;
  token: string;
  estado: string;
  createdAt: string;
  aceptadaEn: string | null;
}

export interface AdminUsuariosResponse {
  profesores: ProfesorAdminItem[];
  estudiantes: EstudianteAdminItem[];
  invitaciones: InvitacionAulaItem[];
  cursos: Array<{ id: string; nombre: string; nivel: string | null; profesorNombre: string | null }>;
}

export interface CursoBackupItem {
  id: string;
  cursoOriginalId: string;
  cursoNombre: string;
  cursoNivel: string | null;
  motivo: string;
  eliminadoPorId: string;
  eliminadoPorNombre: string;
  restauradoEn: string | null;
  createdAt: string;
  resumen: {
    unidades: number;
    lecciones: number;
    tareas: number;
    examenes: number;
  };
  snapshot?: Record<string, unknown>;
}



