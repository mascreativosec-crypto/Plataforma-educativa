import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const estadoCursoEnum = pgEnum('estado_curso', ['BORRADOR', 'PUBLICADO', 'ARCHIVADO']);
export const estadoInscripcionEnum = pgEnum('estado_inscripcion', [
  'PENDIENTE',
  'ACTIVO',
  'RETIRADO',
  'FINALIZADO',
]);
export const tipoMaterialEnum = pgEnum('tipo_material', [
  'PDF',
  'VIDEO',
  'ENLACE',
  'IMAGEN',
  'AUDIO',
  'GOOGLE_DRIVE',
]);
export const estadoEntregaEnum = pgEnum('estado_entrega', [
  'PENDIENTE',
  'ENTREGADO',
  'TARDIO',
  'CALIFICADO',
  'DEVUELTO',
]);
export const tipoPreguntaEnum = pgEnum('tipo_pregunta', [
  'OPCION_MULTIPLE',
  'SELECCION_MULTIPLE',
  'UNIR_PAREJAS',
  'COMPLETAR_ESPACIOS',
  'ORDENAR_PALABRAS',
  'ORDENAR_ORACIONES',
  'RELACIONAR_COLUMNAS',
  'COMPLETAR_OPCIONES',
  'VERDADERO_FALSO',
  'RESPUESTA_CORTA',
  'WRITING',
]);
export const estadoIntentoEnum = pgEnum('estado_intento', ['EN_CURSO', 'ENVIADO', 'CALIFICADO']);
export const estadoProgresoEnum = pgEnum('estado_progreso', ['NO_INICIADA', 'EN_PROGRESO', 'COMPLETADA']);
export const estadoEventoEnum = pgEnum('estado_evento', ['PENDIENTE', 'ENVIADO', 'FALLIDO']);

/// Vinculación de usuarios autenticados con Firebase Auth en Cloud SQL
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: varchar('email', { length: 200 }).notNull(),
    username: varchar('username', { length: 100 }),
    passwordHash: text('password_hash'),
    nombre: varchar('nombre', { length: 150 }).notNull(),
    tenantId: uuid('tenant_id').notNull(),
    rol: varchar('rol', { length: 30 }).notNull().default('PROFESOR'),
    activo: boolean('activo').notNull().default(true),
    etiquetaEstado: varchar('etiqueta_estado', { length: 80 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('users_tenant_idx').on(table.tenantId)],
);

/// Configuración de llave maestra hasheada para Administrador Total (primer inicio)
export const adminConfig = pgTable('admin_config', {
  tenantId: uuid('tenant_id').primaryKey(),
  adminEmail: varchar('admin_email', { length: 200 }).notNull(),
  adminNombre: varchar('admin_nombre', { length: 150 }).notNull().default('Administrador ALLEN'),
  masterKeyHash: text('master_key_hash').notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/// Espejo de solo lectura de la empresa de ALLEN. Se crea/actualiza al vuelo.
export const tenantRef = pgTable('tenant_ref', {
  id: uuid('id').primaryKey(),
  nombre: varchar('nombre', { length: 200 }),
  subdominio: varchar('subdominio', { length: 100 }),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).defaultNow().notNull(),
});

/// Espejo de solo lectura del estudiante de ALLEN. NUNCA se edita desde el Aula.
export const estudianteRef = pgTable(
  'estudiante_ref',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    nombres: varchar('nombres', { length: 150 }).notNull(),
    apellidos: varchar('apellidos', { length: 150 }).notNull(),
    numeroContrato: varchar('numero_contrato', { length: 40 }),
    email: varchar('email', { length: 200 }),
    estado: varchar('estado', { length: 20 }).notNull().default('ACTIVO'),
    etiquetaEstado: varchar('etiqueta_estado', { length: 80 }),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('estudiante_ref_tenant_idx').on(table.tenantId)],
);

/// Credencial propia del Aula para el alumno (usuario/correo + contraseña o código).
export const accesoEstudiante = pgTable(
  'acceso_estudiante',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    identificador: varchar('identificador', { length: 40 }).notNull(),
    codigoHash: text('codigo_hash').notNull(),
    passwordHash: text('password_hash'),
    codigoExpiraEn: timestamp('codigo_expira_en', { withTimezone: true }),
    activo: boolean('activo').notNull().default(true),
    debeCambiar: boolean('debe_cambiar').notNull().default(true),
    intentosFallidos: integer('intentos_fallidos').notNull().default(0),
    bloqueadoHasta: timestamp('bloqueado_hasta', { withTimezone: true }),
    ultimoAcceso: timestamp('ultimo_acceso', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('acceso_estudiante_tenant_identificador_uq').on(table.tenantId, table.identificador)],
);

export const curso = pgTable(
  'curso',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    nombre: varchar('nombre', { length: 200 }).notNull(),
    descripcion: text('descripcion'),
    nivel: varchar('nivel', { length: 20 }),
    portadaUrl: text('portada_url'),
    estado: estadoCursoEnum('estado').notNull().default('BORRADOR'),
    horarioId: uuid('horario_id'),
    profesorId: uuid('profesor_id'),
    profesorNombre: varchar('profesor_nombre', { length: 150 }),
    fechaInicio: date('fecha_inicio'),
    fechaFin: date('fecha_fin'),
    creadoPorId: uuid('creado_por_id').notNull(),
    creadoPorNombre: varchar('creado_por_nombre', { length: 150 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('curso_tenant_estado_idx').on(table.tenantId, table.estado),
    index('curso_tenant_horario_idx').on(table.tenantId, table.horarioId),
  ],
);

export const inscripcionCurso = pgTable(
  'inscripcion_curso',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    cursoId: uuid('curso_id')
      .notNull()
      .references(() => curso.id, { onDelete: 'cascade' }),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    estado: estadoInscripcionEnum('estado').notNull().default('ACTIVO'),
    origen: varchar('origen', { length: 20 }).notNull().default('ALLEN'),
    fechaAlta: timestamp('fecha_alta', { withTimezone: true }).defaultNow().notNull(),
    fechaBaja: timestamp('fecha_baja', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('inscripcion_curso_curso_estudiante_uq').on(table.cursoId, table.estudianteId),
    index('inscripcion_curso_tenant_estudiante_idx').on(table.tenantId, table.estudianteId),
  ],
);

export const unidad = pgTable(
  'unidad',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    cursoId: uuid('curso_id')
      .notNull()
      .references(() => curso.id, { onDelete: 'cascade' }),
    orden: integer('orden').notNull(),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    descripcion: text('descripcion'),
  },
  (table) => [uniqueIndex('unidad_curso_orden_uq').on(table.cursoId, table.orden)],
);

export const leccion = pgTable(
  'leccion',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    unidadId: uuid('unidad_id')
      .notNull()
      .references(() => unidad.id, { onDelete: 'cascade' }),
    orden: integer('orden').notNull(),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    contenido: text('contenido'),
    publicada: boolean('publicada').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('leccion_unidad_orden_uq').on(table.unidadId, table.orden)],
);

export const material = pgTable(
  'material',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    leccionId: uuid('leccion_id')
      .notNull()
      .references(() => leccion.id, { onDelete: 'cascade' }),
    tipo: tipoMaterialEnum('tipo').notNull(),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    descripcion: text('descripcion'),
    url: text('url').notNull(),
    mimeType: varchar('mime_type', { length: 120 }),
    tamanoBytes: bigint('tamano_bytes', { mode: 'number' }),
    orden: integer('orden').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('material_tenant_leccion_idx').on(table.tenantId, table.leccionId)],
);

export const tarea = pgTable(
  'tarea',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    cursoId: uuid('curso_id')
      .notNull()
      .references(() => curso.id, { onDelete: 'cascade' }),
    leccionId: uuid('leccion_id').references(() => leccion.id, { onDelete: 'set null' }),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    instrucciones: text('instrucciones'),
    tipoTarea: varchar('tipo_tarea', { length: 30 }).notNull().default('TAREA'),
    nivelMcer: varchar('nivel_mcer', { length: 20 }),
    minPalabras: integer('min_palabras'),
    maxPalabras: integer('max_palabras'),
    notaMaxima: doublePrecision('nota_maxima').notNull().default(100),
    abreEn: timestamp('abre_en', { withTimezone: true }),
    venceEn: timestamp('vence_en', { withTimezone: true }),
    permiteTardio: boolean('permite_tardio').notNull().default(false),
    publicada: boolean('publicada').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('tarea_tenant_curso_idx').on(table.tenantId, table.cursoId)],
);

export const entrega = pgTable(
  'entrega',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    tareaId: uuid('tarea_id')
      .notNull()
      .references(() => tarea.id, { onDelete: 'cascade' }),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    archivoUrl: text('archivo_url'),
    comentario: text('comentario'),
    estado: estadoEntregaEnum('estado').notNull().default('PENDIENTE'),
    nota: doublePrecision('nota'),
    feedback: text('feedback'),
    calificadoPor: uuid('calificado_por'),
    calificadoEn: timestamp('calificado_en', { withTimezone: true }),
    notaAsentadaEn: timestamp('nota_asentada_en', { withTimezone: true }),
    ultimoMotivoCambio: text('ultimo_motivo_cambio'),
    historialNotas: jsonb('historial_notas').default([]),
    entregadoEn: timestamp('entregado_en', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('entrega_tarea_estudiante_uq').on(table.tareaId, table.estudianteId),
    index('entrega_tenant_estudiante_idx').on(table.tenantId, table.estudianteId),
  ],
);

export const quiz = pgTable(
  'quiz',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    leccionId: uuid('leccion_id')
      .notNull()
      .references(() => leccion.id, { onDelete: 'cascade' }),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    descripcion: text('descripcion'),
    intentosMax: integer('intentos_max').notNull().default(1),
    notaMinima: doublePrecision('nota_minima').notNull().default(70),
    tiempoLimiteMin: integer('tiempo_limite_min'),
    abrirEn: timestamp('abrir_en', { withTimezone: true }),
    cerrarEn: timestamp('cerrar_en', { withTimezone: true }),
    envioAutomatico: boolean('envio_automatico').notNull().default(true),
    modo: varchar('modo', { length: 20 }).notNull().default('EXAMEN'),
    mezclarPreguntas: boolean('mezclar_preguntas').notNull().default(false),
    nivelMcer: varchar('nivel_mcer', { length: 20 }),
    habilidadCambridge: varchar('habilidad_cambridge', { length: 30 }),
    politicaSalida: varchar('politica_salida', { length: 30 }).notNull().default('ADVERTENCIA_LIMITE'),
    maxCambiosPestana: integer('max_cambios_pestana').notNull().default(3),
    publicada: boolean('publicada').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('quiz_tenant_leccion_idx').on(table.tenantId, table.leccionId)],
);

export const pregunta = pgTable(
  'pregunta',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quiz.id, { onDelete: 'cascade' }),
    orden: integer('orden').notNull(),
    enunciado: text('enunciado').notNull(),
    tipo: tipoPreguntaEnum('tipo').notNull(),
    opciones: jsonb('opciones'),
    respuestaCorrecta: jsonb('respuesta_correcta').notNull(),
    audioUrl: text('audio_url'),
    videoUrl: text('video_url'),
    retroalimentacion: text('retroalimentacion'),
    minPalabras: integer('min_palabras'),
    maxPalabras: integer('max_palabras'),
    puntos: doublePrecision('puntos').notNull().default(1),
  },
  (table) => [uniqueIndex('pregunta_quiz_orden_uq').on(table.quizId, table.orden)],
);

export const intentoQuiz = pgTable(
  'intento_quiz',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quiz.id, { onDelete: 'cascade' }),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    estado: estadoIntentoEnum('estado').notNull().default('EN_CURSO'),
    respuestas: jsonb('respuestas'),
    nota: doublePrecision('nota'),
    requiereRevisionDocente: boolean('requiere_revision_docente').notNull().default(false),
    calificacionManual: jsonb('calificacion_manual'),
    feedbackDocente: text('feedback_docente'),
    notaAsentadaEn: timestamp('nota_asentada_en', { withTimezone: true }),
    calificadoPor: uuid('calificado_por'),
    ultimoMotivoCambio: text('ultimo_motivo_cambio'),
    historialNotas: jsonb('historial_notas').default([]),
    eventosIntegridad: jsonb('eventos_integridad').default([]),
    cambiosPestanaCount: integer('cambios_pestana_count').notNull().default(0),
    anuladoPorSalida: boolean('anulado_por_salida').notNull().default(false),
    motivoAnulacion: text('motivo_anulacion'),
    inicioEn: timestamp('inicio_en', { withTimezone: true }).defaultNow().notNull(),
    finEn: timestamp('fin_en', { withTimezone: true }),
  },
  (table) => [index('intento_quiz_tenant_quiz_estudiante_idx').on(table.tenantId, table.quizId, table.estudianteId)],
);

export const progresoLeccion = pgTable(
  'progreso_leccion',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    leccionId: uuid('leccion_id')
      .notNull()
      .references(() => leccion.id, { onDelete: 'cascade' }),
    estado: estadoProgresoEnum('estado').notNull().default('NO_INICIADA'),
    porcentaje: integer('porcentaje').notNull().default(0),
    completadaEn: timestamp('completada_en', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('progreso_leccion_estudiante_leccion_uq').on(table.estudianteId, table.leccionId),
    index('progreso_leccion_tenant_estudiante_idx').on(table.tenantId, table.estudianteId),
  ],
);

export const anuncio = pgTable(
  'anuncio',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    cursoId: uuid('curso_id')
      .notNull()
      .references(() => curso.id, { onDelete: 'cascade' }),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    mensaje: text('mensaje').notNull(),
    esSaludo: boolean('es_saludo').notNull().default(false),
    autorId: uuid('autor_id').notNull(),
    autorNombre: varchar('autor_nombre', { length: 150 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('anuncio_tenant_curso_created_idx').on(table.tenantId, table.cursoId, table.createdAt)],
);

/// Espejo de solo lectura de asistencias enviadas por ALLEN CRM hacia ALLEN Aula.
export const asistenciaRef = pgTable(
  'asistencia_ref',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    cursoId: uuid('curso_id')
      .notNull()
      .references(() => curso.id, { onDelete: 'cascade' }),
    horarioId: uuid('horario_id'),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    fecha: date('fecha').notNull(),
    tema: varchar('tema', { length: 200 }),
    estado: varchar('estado', { length: 20 }).notNull(), // PRESENTE | TARDANZA | AUSENTE | JUSTIFICADA
    observacion: text('observacion'),
    origen: varchar('origen', { length: 20 }).notNull().default('ALLEN'),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('asistencia_ref_curso_estudiante_fecha_uq').on(
      table.cursoId,
      table.estudianteId,
      table.fecha,
    ),
    index('asistencia_ref_tenant_estudiante_idx').on(table.tenantId, table.estudianteId),
  ],
);

/// Outbox: todo lo que sale hacia ALLEN (notas, avisos) pasa por aquí. Garantiza reintento.
export const eventoAula = pgTable(
  'evento_aula',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    tipo: varchar('tipo', { length: 60 }).notNull(),
    payload: jsonb('payload').notNull(),
    estado: estadoEventoEnum('estado').notNull().default('PENDIENTE'),
    intentos: integer('intentos').notNull().default(0),
    ultimoError: text('ultimo_error'),
    proximoIntento: timestamp('proximo_intento', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    enviadoEn: timestamp('enviado_en', { withTimezone: true }),
  },
  (table) => [index('evento_aula_estado_proximo_idx').on(table.estado, table.proximoIntento)],
);

// Relations
export const estudianteRefRelations = relations(estudianteRef, ({ many }) => ({
  inscripciones: many(inscripcionCurso),
  entregas: many(entrega),
  intentos: many(intentoQuiz),
  progresos: many(progresoLeccion),
  accesos: many(accesoEstudiante),
}));

export const cursoRelations = relations(curso, ({ many }) => ({
  unidades: many(unidad),
  inscripciones: many(inscripcionCurso),
  tareas: many(tarea),
  anuncios: many(anuncio),
}));

export const unidadRelations = relations(unidad, ({ one, many }) => ({
  curso: one(curso, { fields: [unidad.cursoId], references: [curso.id] }),
  lecciones: many(leccion),
}));

export const leccionRelations = relations(leccion, ({ one, many }) => ({
  unidad: one(unidad, { fields: [leccion.unidadId], references: [unidad.id] }),
  materiales: many(material),
  tareas: many(tarea),
  quizzes: many(quiz),
  progresos: many(progresoLeccion),
}));

export const quizRelations = relations(quiz, ({ one, many }) => ({
  leccion: one(leccion, { fields: [quiz.leccionId], references: [leccion.id] }),
  preguntas: many(pregunta),
  intentos: many(intentoQuiz),
}));

// ============================================================================
// GAMIFICACIÓN, RACHAS, MASCOTA VIRTUAL, TIENDA DE CANJES Y NOTIFICACIONES
// ============================================================================

export const gamificacionConfig = pgTable('gamificacion_config', {
  tenantId: uuid('tenant_id').primaryKey(),
  ptsLeccion: integer('pts_leccion').notNull().default(25),
  ptsTareaATiempo: integer('pts_tarea_a_tiempo').notNull().default(40),
  ptsExamenAprobado: integer('pts_examen_aprobado').notNull().default(60),
  ptsHabilidadMcer: integer('pts_habilidad_mcer').notNull().default(30),
  ptsMascotaInteraccion: integer('pts_mascota_interaccion').notNull().default(5),
  costoRecuperarRacha: integer('costo_recuperar_racha').notNull().default(120),
  ventanaRecuperacionHoras: integer('ventana_recuperacion_horas').notNull().default(48),
  maxRecuperacionesMes: integer('max_recuperaciones_mes').notNull().default(2),
  maxComodinesStock: integer('max_comodines_stock').notNull().default(5),
  limitePuntosDiarios: integer('limite_puntos_diarios').notNull().default(400),
  hitosConfig: jsonb('hitos_config').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const estudianteGamificacion = pgTable(
  'estudiante_gamificacion',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    puntosSaldo: integer('puntos_saldo').notNull().default(0),
    puntosTotales: integer('puntos_totales').notNull().default(0),
    xpTotal: integer('xp_total').notNull().default(0),
    rachaActual: integer('racha_actual').notNull().default(0),
    rachaMaxima: integer('racha_maxima').notNull().default(0),
    ultimaActividadFecha: varchar('ultima_actividad_fecha', { length: 10 }),
    rachaPerdidaValor: integer('racha_perdida_valor').notNull().default(0),
    rachaPerdidaFecha: varchar('racha_perdida_fecha', { length: 10 }),
    recuperacionesEsteMes: integer('recuperaciones_este_mes').notNull().default(0),
    recuperacionMesRef: varchar('recuperacion_mes_ref', { length: 7 }),
    comodinesRacha: integer('comodines_racha').notNull().default(1),
    perfilTema: varchar('perfil_tema', { length: 40 }).notNull().default('institucional'),
    perfilExperiencia: varchar('perfil_experiencia', { length: 20 }).notNull().default('JUVENIL'), // JUVENIL (<=18 con mascota) | PROFESIONAL (+18 enfoque ejecutivo)
    metaSemanalSesiones: integer('meta_semanal_sesiones').notNull().default(3),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('est_gamif_tenant_est_uq').on(table.tenantId, table.estudianteId),
    index('est_gamif_tenant_pts_idx').on(table.tenantId, table.puntosTotales),
  ],
);

export const actividadDiaria = pgTable(
  'actividad_diaria',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    fecha: varchar('fecha', { length: 10 }).notNull(),
    tipo: varchar('tipo', { length: 20 }).notNull().default('ACTIVA'), // ACTIVA | PROTEGIDA | RECUPERADA
    accionesCount: integer('acciones_count').notNull().default(1),
    puntosGanados: integer('puntos_ganados').notNull().default(0),
    detalle: text('detalle'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('act_diaria_est_fecha_uq').on(table.estudianteId, table.fecha),
    index('act_diaria_tenant_est_idx').on(table.tenantId, table.estudianteId),
  ],
);

export const historialRacha = pgTable(
  'historial_racha',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    tipoEvento: varchar('tipo_evento', { length: 30 }).notNull(), // INICIO | INCREMENTO | HITO | COMODIN_USADO | RECUPERADA | PERDIDA
    rachaAntes: integer('racha_antes').notNull().default(0),
    rachaDespues: integer('racha_despues').notNull().default(0),
    costoPuntos: integer('costo_puntos').notNull().default(0),
    recompensaPuntos: integer('recompensa_puntos').notNull().default(0),
    nota: text('nota'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('hist_racha_tenant_est_idx').on(table.tenantId, table.estudianteId, table.createdAt)],
);

export const movimientoPuntos = pgTable(
  'movimiento_puntos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    tipo: varchar('tipo', { length: 20 }).notNull(), // GANADO | GASTADO | AJUSTE_ADMIN
    fuente: varchar('fuente', { length: 40 }).notNull(),
    cantidad: integer('cantidad').notNull(),
    saldoDespues: integer('saldo_despues').notNull(),
    descripcion: text('descripcion').notNull(),
    referenciaId: varchar('referencia_id', { length: 120 }),
    idempotencyKey: varchar('idempotency_key', { length: 160 }),
    sospechoso: boolean('sospechoso').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('mov_pts_tenant_idempotency_uq').on(table.tenantId, table.idempotencyKey),
    index('mov_pts_tenant_est_created_idx').on(table.tenantId, table.estudianteId, table.createdAt),
  ],
);

export const insigniaDef = pgTable(
  'insignia_def',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    codigo: varchar('codigo', { length: 50 }).notNull(),
    nombre: varchar('nombre', { length: 120 }).notNull(),
    descripcion: text('descripcion').notNull(),
    icono: varchar('icono', { length: 40 }).notNull().default('award'),
    categoria: varchar('categoria', { length: 30 }).notNull().default('ACADEMICO'), // RACHA | ACADEMICO | MCER | MASCOTA | ESPECIAL
    puntosBonus: integer('puntos_bonus').notNull().default(25),
    condicionTipo: varchar('condicion_tipo', { length: 40 }).notNull(),
    condicionValor: integer('condicion_valor').notNull().default(1),
    activa: boolean('activa').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('insignia_def_tenant_codigo_uq').on(table.tenantId, table.codigo)],
);

export const estudianteInsignia = pgTable(
  'estudiante_insignia',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    insigniaId: uuid('insignia_id')
      .notNull()
      .references(() => insigniaDef.id, { onDelete: 'cascade' }),
    desbloqueadaEn: timestamp('desbloqueada_en', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('est_insignia_uq').on(table.estudianteId, table.insigniaId)],
);

export const retoDef = pgTable(
  'reto_def',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    titulo: varchar('titulo', { length: 160 }).notNull(),
    descripcion: text('descripcion').notNull(),
    tipoObjetivo: varchar('tipo_objetivo', { length: 30 }).notNull(), // LECCIONES | TAREAS | EXAMENES | RACHA | PUNTOS | WRITING
    metaValor: integer('meta_valor').notNull().default(3),
    recompensaPuntos: integer('recompensa_puntos').notNull().default(80),
    habilidadMcer: varchar('habilidad_mcer', { length: 30 }),
    fechaInicio: date('fecha_inicio'),
    fechaFin: date('fecha_fin'),
    activo: boolean('activo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('reto_def_tenant_activo_idx').on(table.tenantId, table.activo)],
);

export const estudianteReto = pgTable(
  'estudiante_reto',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    retoId: uuid('reto_id')
      .notNull()
      .references(() => retoDef.id, { onDelete: 'cascade' }),
    progresoActual: integer('progreso_actual').notNull().default(0),
    completado: boolean('completado').notNull().default(false),
    reclamado: boolean('reclamado').notNull().default(false),
    completadoEn: timestamp('completado_en', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('est_reto_uq').on(table.estudianteId, table.retoId)],
);

export const mascotaEstudiante = pgTable(
  'mascota_estudiante',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    nombre: varchar('nombre', { length: 60 }).notNull().default('Allie'),
    especie: varchar('especie', { length: 30 }).notNull().default('BUHO_ALLEN'), // BUHO_ALLEN | ZORRO_ESTUDIO | DRAGON_LINGUA
    etapa: integer('etapa').notNull().default(1), // 1..4
    nivel: integer('nivel').notNull().default(1),
    xp: integer('xp').notNull().default(0),
    energia: integer('energia').notNull().default(85),
    felicidad: integer('felicidad').notNull().default(85),
    saciedad: integer('saciedad').notNull().default(80),
    accesorioCabeza: varchar('accesorio_cabeza', { length: 50 }),
    accesorioCuello: varchar('accesorio_cuello', { length: 50 }),
    fondoHabitat: varchar('fondo_habitat', { length: 50 }).notNull().default('aula'),
    accesoriosDesbloqueados: jsonb('accesorios_desbloqueados').notNull().default([]),
    ultimaReaccion: text('ultima_reaccion'),
    ultimaReaccionTipo: varchar('ultima_reaccion_tipo', { length: 30 }).default('SALUDO'),
    interaccionesHoy: integer('interacciones_hoy').notNull().default(0),
    interaccionesFecha: varchar('interacciones_fecha', { length: 10 }),
    ultimaInteraccionEn: timestamp('ultima_interaccion_en', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('mascota_tenant_est_uq').on(table.tenantId, table.estudianteId)],
);

export const tiendaProducto = pgTable(
  'tienda_producto',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    codigo: varchar('codigo', { length: 60 }).notNull(),
    nombre: varchar('nombre', { length: 160 }).notNull(),
    descripcion: text('descripcion').notNull(),
    categoria: varchar('categoria', { length: 40 }).notNull(), // MASCOTA_ACCESORIO | MASCOTA_VESTIMENTA | PERFIL_VISUAL | INSIGNIA | COMODIN_RACHA | BENEFICIO_ACADEMICO | PREMIO_ALLEN
    precioPuntos: integer('precio_puntos').notNull(),
    stock: integer('stock'), // null = ilimitado
    requiereAprobacion: boolean('requiere_aprobacion').notNull().default(false),
    imagenKey: varchar('imagen_key', { length: 60 }).notNull().default('gift'),
    condiciones: text('condiciones'),
    metadata: jsonb('metadata'),
    activo: boolean('activo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('tienda_prod_tenant_codigo_uq').on(table.tenantId, table.codigo),
    index('tienda_prod_tenant_cat_idx').on(table.tenantId, table.categoria, table.activo),
  ],
);

export const canjeTienda = pgTable(
  'canje_tienda',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudianteRef.id, { onDelete: 'cascade' }),
    productoId: uuid('producto_id')
      .notNull()
      .references(() => tiendaProducto.id, { onDelete: 'cascade' }),
    precioPagado: integer('precio_pagado').notNull(),
    estado: varchar('estado', { length: 30 }).notNull().default('COMPLETADO'), // COMPLETADO | PENDIENTE_APROBACION | APROBADO | RECHAZADO
    notaEstudiante: text('nota_estudiante'),
    notaAdmin: text('nota_admin'),
    aprobadoPor: uuid('aprobado_por'),
    aprobadoEn: timestamp('aprobado_en', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('canje_tenant_est_created_idx').on(table.tenantId, table.estudianteId, table.createdAt)],
);

export const notificacionAula = pgTable(
  'notificacion_aula',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    destinatarioRol: varchar('destinatario_rol', { length: 20 }).notNull(), // ESTUDIANTE | DOCENTE
    destinatarioId: uuid('destinatario_id').notNull(),
    tipo: varchar('tipo', { length: 40 }).notNull(), // RACHA_RIESGO | HITO | RECOMPENSA | CANJE | MASCOTA | ACADEMICO
    titulo: varchar('titulo', { length: 180 }).notNull(),
    mensaje: text('mensaje').notNull(),
    leida: boolean('leida').notNull().default(false),
    accionNav: varchar('accion_nav', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('notif_tenant_dest_leida_idx').on(table.tenantId, table.destinatarioId, table.leida),
  ],
);

/// Invitaciones por correo emitidas por el Administrador Total para estudiantes o docentes
export const invitacionAula = pgTable(
  'invitacion_aula',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    email: varchar('email', { length: 200 }).notNull(),
    nombre: varchar('nombre', { length: 150 }).notNull(),
    rol: varchar('rol', { length: 30 }).notNull().default('ESTUDIANTE'), // ESTUDIANTE | PROFESOR
    cursoId: uuid('curso_id').references(() => curso.id, { onDelete: 'set null' }),
    estudianteId: uuid('estudiante_id').references(() => estudianteRef.id, { onDelete: 'cascade' }),
    codigoAcceso: varchar('codigo_acceso', { length: 20 }),
    token: varchar('token', { length: 80 }).notNull().unique(),
    estado: varchar('estado', { length: 20 }).notNull().default('ENVIADA'), // ENVIADA | ACEPTADA | REVOCADA
    enviadoPor: uuid('enviado_por'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    aceptadaEn: timestamp('aceptada_en', { withTimezone: true }),
  },
  (table) => [
    index('invitacion_aula_tenant_email_idx').on(table.tenantId, table.email),
  ],
);

/// Respaldo completo automático antes de eliminar un curso (con motivo obligatorio)
export const cursoBackup = pgTable(
  'curso_backup',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    cursoOriginalId: uuid('curso_original_id').notNull(),
    cursoNombre: varchar('curso_nombre', { length: 200 }).notNull(),
    cursoNivel: varchar('curso_nivel', { length: 20 }),
    motivo: text('motivo').notNull(),
    eliminadoPorId: uuid('eliminado_por_id').notNull(),
    eliminadoPorNombre: varchar('eliminado_por_nombre', { length: 150 }).notNull(),
    snapshot: jsonb('snapshot').notNull(),
    restauradoEn: timestamp('restaurado_en', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('curso_backup_tenant_idx').on(table.tenantId, table.createdAt)],
);
