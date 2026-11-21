import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  accesoEstudiante,
  actividadDiaria,
  anuncio,
  asistenciaRef,
  canjeTienda,
  curso,
  entrega,
  estudianteGamificacion,
  estudianteInsignia,
  estudianteRef,
  estudianteReto,
  eventoAula,
  gamificacionConfig,
  historialRacha,
  inscripcionCurso,
  insigniaDef,
  intentoQuiz,
  leccion,
  mascotaEstudiante,
  material,
  movimientoPuntos,
  notificacionAula,
  pregunta,
  progresoLeccion,
  quiz,
  retoDef,
  tarea,
  tenantRef,
  tiendaProducto,
  unidad,
  users,
} from './schema.ts';
import {
  addCalendarDays,
  DEFAULT_STREAK_MILESTONES,
  getGuayaquilDateKey,
} from '../server/services/gamificacion-engine.ts';
import { DEFAULT_TENANT_ID } from './users.ts';

export const SECONDARY_TENANT_ID = '22222222-2222-4222-8222-222222222222';
export const DEMO_ADMIN_ID = '00000000-0000-4000-8000-000000000009';
export const DEMO_PROFESSOR_ID = '33333333-3333-4333-8333-333333333331';
export const DEMO_STUDENT_MATEO_ID = '44444444-4444-4444-8444-444444444401';

let seedPromise: Promise<void> | null = null;

export async function ensureSeedData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  try {
    const existingTenant = await db
      .select({ id: tenantRef.id })
      .from(tenantRef)
      .where(eq(tenantRef.id, DEFAULT_TENANT_ID))
      .limit(1);

    if (existingTenant.length > 0) {
      await ensureEnhancedSeedData();
      return;
    }

    // 1. Tenants (Matriz Quito + Sede Guayaquil para demostrar aislamiento multi-tenant)
    await db
      .insert(tenantRef)
      .values([
        {
          id: DEFAULT_TENANT_ID,
          nombre: 'All American English · Quito',
          subdominio: 'quito',
        },
        {
          id: SECONDARY_TENANT_ID,
          nombre: 'All American English · Guayaquil',
          subdominio: 'guayaquil',
        },
      ])
      .onConflictDoNothing();

    // 2. Espejos de estudiantes de ALLEN (solo lectura en el Aula)
    const students = [
      {
        id: DEMO_STUDENT_MATEO_ID,
        tenantId: DEFAULT_TENANT_ID,
        nombres: 'Mateo Alejandro',
        apellidos: 'Villa Huanca',
        numeroContrato: 'M210',
        email: 'mateo.villa@estudiantes.allen.edu.ec',
        estado: 'ACTIVO',
        identificador: '1724567890',
      },
      {
        id: '44444444-4444-4444-8444-444444444402',
        tenantId: DEFAULT_TENANT_ID,
        nombres: 'Camila Sofía',
        apellidos: 'Mendoza Paredes',
        numeroContrato: 'M214',
        email: 'camila.mendoza@estudiantes.allen.edu.ec',
        estado: 'ACTIVO',
        identificador: '1729876543',
      },
      {
        id: '44444444-4444-4444-8444-444444444403',
        tenantId: DEFAULT_TENANT_ID,
        nombres: 'Sebastián Andrés',
        apellidos: 'Proaño Viteri',
        numeroContrato: 'M218',
        email: 'sebastian.proano@estudiantes.allen.edu.ec',
        estado: 'ACTIVO',
        identificador: '1718234567',
      },
      {
        id: '44444444-4444-4444-8444-444444444404',
        tenantId: DEFAULT_TENANT_ID,
        nombres: 'Valentina Lucía',
        apellidos: 'Salazar Cevallos',
        numeroContrato: 'M221',
        email: 'valentina.salazar@estudiantes.allen.edu.ec',
        estado: 'ACTIVO',
        identificador: '1726345123',
      },
      {
        id: '44444444-4444-4444-8444-444444444405',
        tenantId: DEFAULT_TENANT_ID,
        nombres: 'Diego Fernando',
        apellidos: 'Jaramillo Torres',
        numeroContrato: 'M225',
        email: 'diego.jaramillo@estudiantes.allen.edu.ec',
        estado: 'ACTIVO',
        identificador: '1721122334',
      },
      {
        id: '44444444-4444-4444-8444-444444444406',
        tenantId: DEFAULT_TENANT_ID,
        nombres: 'Antonella María',
        apellidos: 'Benítez Ortega',
        numeroContrato: 'M230',
        email: 'antonella.benitez@estudiantes.allen.edu.ec',
        estado: 'ACTIVO',
        identificador: '1725566778',
      },
      {
        id: '44444444-4444-4444-8444-444444444499',
        tenantId: SECONDARY_TENANT_ID,
        nombres: 'Esteban Gabriel',
        apellidos: 'Cedeño Vera',
        numeroContrato: 'G041',
        email: 'esteban.cedeno@guayaquil.allen.edu.ec',
        estado: 'ACTIVO',
        identificador: '0924567891',
      },
    ];

    await db
      .insert(estudianteRef)
      .values(
        students.map(({ identificador: _id, ...rest }) => rest),
      )
      .onConflictDoNothing();

    // 3. Accesos de estudiantes (código demo 246810 hasheado con bcrypt 10 rondas)
    const demoCodeHash = await bcrypt.hash('246810', 10);
    await db
      .insert(accesoEstudiante)
      .values(
        students.map((s) => ({
          tenantId: s.tenantId,
          estudianteId: s.id,
          identificador: s.identificador,
          codigoHash: demoCodeHash,
          codigoExpiraEn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          activo: true,
          debeCambiar: false,
        })),
      )
      .onConflictDoNothing();

    // 4. Cursos (3 en tenant principal + 1 en tenant secundario para aislamiento)
    const cursoA2Id = '55555555-5555-4555-8555-555555555501';
    const cursoB2Id = '55555555-5555-4555-8555-555555555502';
    const cursoCambId = '55555555-5555-4555-8555-555555555503';
    const cursoOtherTenantId = '55555555-5555-4555-8555-555555555599';

    await db
      .insert(curso)
      .values([
        {
          id: cursoA2Id,
          tenantId: DEFAULT_TENANT_ID,
          nombre: 'Inglés General A2 — Horario Matutino',
          descripcion:
            'Consolidación de tiempos pasados y presentes perfectos, comprensión auditiva cotidiana y redacción de correos funcionales.',
          nivel: 'A2',
          portadaUrl: '/src/assets/images/course_english_a2_1795125510232.jpg',
          estado: 'PUBLICADO',
          horarioId: '77777777-7777-4777-8777-777777777701',
          profesorId: DEMO_PROFESSOR_ID,
          profesorNombre: 'Lcda. Carolina Andrade',
          fechaInicio: '2026-10-05',
          fechaFin: '2027-01-30',
          creadoPorId: DEMO_PROFESSOR_ID,
          creadoPorNombre: 'Lcda. Carolina Andrade',
        },
        {
          id: cursoB2Id,
          tenantId: DEFAULT_TENANT_ID,
          nombre: 'Business English B2 — Comunicación Ejecutiva',
          descripcion:
            'Presentaciones de impacto, negociación internacional, reportes escritos y vocabulario corporativo en inglés.',
          nivel: 'B2',
          portadaUrl: '/src/assets/images/course_english_b2_1795125510227.jpg',
          estado: 'PUBLICADO',
          horarioId: '77777777-7777-4777-8777-777777777702',
          profesorId: DEMO_PROFESSOR_ID,
          profesorNombre: 'Lcda. Carolina Andrade',
          fechaInicio: '2026-10-12',
          fechaFin: '2027-02-15',
          creadoPorId: DEMO_PROFESSOR_ID,
          creadoPorNombre: 'Lcda. Carolina Andrade',
        },
        {
          id: cursoCambId,
          tenantId: DEFAULT_TENANT_ID,
          nombre: 'Preparación Cambridge B1 Preliminary',
          descripcion:
            'Simulacros cronometrados de Reading, Writing, Listening y Speaking con retroalimentación rubricada por habilidad.',
          nivel: 'CAMBRIDGE',
          portadaUrl: '/src/assets/images/course_cambridge_prep_1795125510290.jpg',
          estado: 'BORRADOR',
          horarioId: '77777777-7777-4777-8777-777777777703',
          profesorId: DEMO_PROFESSOR_ID,
          profesorNombre: 'Lcda. Carolina Andrade',
          fechaInicio: '2026-11-25',
          fechaFin: '2027-03-20',
          creadoPorId: DEMO_PROFESSOR_ID,
          creadoPorNombre: 'Lcda. Carolina Andrade',
        },
        {
          id: cursoOtherTenantId,
          tenantId: SECONDARY_TENANT_ID,
          nombre: 'Inglés Intensivo C1 — Sede Guayaquil',
          descripcion: 'Curso exclusivo del tenant Guayaquil para pruebas de aislamiento.',
          nivel: 'C1',
          estado: 'PUBLICADO',
          profesorId: '33333333-3333-4333-8333-333333333399',
          profesorNombre: 'Prof. Ricardo Zambrano',
          creadoPorId: '33333333-3333-4333-8333-333333333399',
          creadoPorNombre: 'Prof. Ricardo Zambrano',
        },
      ])
      .onConflictDoNothing();

    // 5. Inscripciones sincronizadas desde ALLEN
    await db
      .insert(inscripcionCurso)
      .values([
        {
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          estudianteId: DEMO_STUDENT_MATEO_ID,
          estado: 'ACTIVO',
          origen: 'ALLEN',
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          estudianteId: '44444444-4444-4444-8444-444444444402',
          estado: 'ACTIVO',
          origen: 'ALLEN',
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          estudianteId: '44444444-4444-4444-8444-444444444403',
          estado: 'ACTIVO',
          origen: 'ALLEN',
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          estudianteId: '44444444-4444-4444-8444-444444444404',
          estado: 'ACTIVO',
          origen: 'ALLEN',
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoB2Id,
          estudianteId: DEMO_STUDENT_MATEO_ID,
          estado: 'ACTIVO',
          origen: 'ALLEN',
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoB2Id,
          estudianteId: '44444444-4444-4444-8444-444444444405',
          estado: 'ACTIVO',
          origen: 'MANUAL',
        },
        {
          tenantId: SECONDARY_TENANT_ID,
          cursoId: cursoOtherTenantId,
          estudianteId: '44444444-4444-4444-8444-444444444499',
          estado: 'ACTIVO',
          origen: 'ALLEN',
        },
      ])
      .onConflictDoNothing();

    // 6. Unidades del Curso A2 y Curso B2
    const u1Id = '66666666-6666-4666-8666-666666666601';
    const u2Id = '66666666-6666-4666-8666-666666666602';
    const u3Id = '66666666-6666-4666-8666-666666666603';
    const uB2_1Id = '66666666-6666-4666-8666-666666666604';

    await db
      .insert(unidad)
      .values([
        {
          id: u1Id,
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          orden: 1,
          titulo: 'Unidad 1 — Rutinas, Pasado Simple y Experiencias',
          descripcion: 'Repaso estructurado de verbos irregulares y narración de eventos pasados.',
        },
        {
          id: u2Id,
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          orden: 2,
          titulo: 'Unidad 2 — Present Perfect vs. Past Simple',
          descripcion: 'Uso de since, for, already, yet y diferenciación práctica en conversaciones reales.',
        },
        {
          id: u3Id,
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          orden: 3,
          titulo: 'Unidad 3 — Correo Electrónico y Comunicación Práctica',
          descripcion: 'Estructura formal e informal de correos electrónicos en inglés y respuestas rápidas.',
        },
        {
          id: uB2_1Id,
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoB2Id,
          orden: 1,
          titulo: 'Unidad 1 — Executive Presentations & Framing',
          descripcion: 'Apertura de presentaciones corporativas, transiciones y manejo de preguntas.',
        },
      ])
      .onConflictDoNothing();

    // 7. Lecciones
    const l1Id = '88888888-8888-4888-8888-888888888801';
    const l2Id = '88888888-8888-4888-8888-888888888802';
    const l3Id = '88888888-8888-4888-8888-888888888803';
    const l4Id = '88888888-8888-4888-8888-888888888804';
    const l5Id = '88888888-8888-4888-8888-888888888805';
    const lB2Id = '88888888-8888-4888-8888-888888888806';

    await db
      .insert(leccion)
      .values([
        {
          id: l1Id,
          tenantId: DEFAULT_TENANT_ID,
          unidadId: u1Id,
          orden: 1,
          titulo: '1.1 Verbos irregulares en contexto cotidiano',
          contenido:
            '<h3>Objetivo de la lección</h3><p>Identificar y conjugar los 30 verbos irregulares más frecuentes en conversaciones de viaje y trabajo.</p><ul><li><strong>Go → Went → Gone:</strong> We went to Cuenca last weekend.</li><li><strong>Speak → Spoke → Spoken:</strong> She spoke clearly during the interview.</li><li><strong>Write → Wrote → Written:</strong> They wrote a short report yesterday.</li></ul><p>Descarga la guía en PDF antes de completar los ejercicios.</p>',
          publicada: true,
        },
        {
          id: l2Id,
          tenantId: DEFAULT_TENANT_ID,
          unidadId: u1Id,
          orden: 2,
          titulo: '1.2 Comprensión auditiva: Entrevistas breves',
          contenido:
            '<h3>Práctica de Listening</h3><p>Escucha el audio dos veces. En la primera escucha identifica la idea principal; en la segunda anota fechas, lugares y verbos en pasado simple.</p>',
          publicada: true,
        },
        {
          id: l3Id,
          tenantId: DEFAULT_TENANT_ID,
          unidadId: u2Id,
          orden: 1,
          titulo: '2.1 Present Perfect: Experiencias sin tiempo específico',
          contenido:
            '<h3>Regla clave</h3><p>Usamos <strong>have / has + participio pasado</strong> cuando el momento exacto no es relevante o la acción continúa en el presente.</p><blockquote>I have studied English at ALLEN for eight months.</blockquote><p>Completa el quiz interactivo al final de esta lección para validar tu comprensión.</p>',
          publicada: true,
        },
        {
          id: l4Id,
          tenantId: DEFAULT_TENANT_ID,
          unidadId: u2Id,
          orden: 2,
          titulo: '2.2 Marcadores temporales: Since, For, Already, Yet',
          contenido:
            '<h3>Diferencia entre Since y For</h3><p><strong>For</strong> indica duración (for three years); <strong>Since</strong> indica punto de inicio (since 2024).</p>',
          publicada: true,
        },
        {
          id: l5Id,
          tenantId: DEFAULT_TENANT_ID,
          unidadId: u3Id,
          orden: 1,
          titulo: '3.1 Redacción de correos profesionales en inglés',
          contenido:
            '<h3>Borrador docente</h3><p>Esta lección aún no está visible para estudiantes hasta la próxima semana de clases.</p>',
          publicada: false,
        },
        {
          id: lB2Id,
          tenantId: DEFAULT_TENANT_ID,
          unidadId: uB2_1Id,
          orden: 1,
          titulo: '1.1 Structuring High-Impact Openings',
          contenido:
            '<h3>Executive Opening Framework</h3><p>Open with context, state the decision required, and preview three structured takeaways in under 45 seconds.</p>',
          publicada: true,
        },
      ])
      .onConflictDoNothing();

    // 8. Materiales
    await db
      .insert(material)
      .values([
        {
          tenantId: DEFAULT_TENANT_ID,
          leccionId: l1Id,
          tipo: 'PDF',
          titulo: 'Guía de 30 verbos irregulares A2.pdf',
          descripcion: 'Tabla descargable con pronunciación fonética y ejemplos.',
          url: 'demo://guia-verbos-irregulares-a2.pdf',
          mimeType: 'application/pdf',
          tamanoBytes: 428_500,
          orden: 1,
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          leccionId: l1Id,
          tipo: 'ENLACE',
          titulo: 'Diccionario Cambridge — Pronunciación de verbos',
          descripcion: 'Referencia interactiva de audio británico y americano.',
          url: 'https://dictionary.cambridge.org/',
          mimeType: 'text/html',
          orden: 2,
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          leccionId: l2Id,
          tipo: 'AUDIO',
          titulo: 'Audio_U1_Interview_Quito.mp3',
          descripcion: 'Diálogo de 2 minutos sobre rutinas laborales.',
          url: 'demo://audio-u1-interview.mp3',
          mimeType: 'audio/mpeg',
          tamanoBytes: 1_940_000,
          orden: 1,
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          leccionId: l3Id,
          tipo: 'PDF',
          titulo: 'Resumen visual Present Perfect vs Past Simple.pdf',
          descripcion: 'Cuadro comparativo para repaso antes del quiz.',
          url: 'demo://present-perfect-vs-past.pdf',
          mimeType: 'application/pdf',
          tamanoBytes: 315_200,
          orden: 1,
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          leccionId: lB2Id,
          tipo: 'PDF',
          titulo: 'Executive_Signposting_Phrases_B2.pdf',
          descripcion: 'Frases de transición y cierre para reuniones ejecutivas.',
          url: 'demo://executive-signposting-b2.pdf',
          mimeType: 'application/pdf',
          tamanoBytes: 512_000,
          orden: 1,
        },
      ])
      .onConflictDoNothing();

    // 9. Tareas
    const tarea1Id = '99999999-9999-4999-8999-999999999901';
    const tarea2Id = '99999999-9999-4999-8999-999999999902';

    await db
      .insert(tarea)
      .values([
        {
          id: tarea1Id,
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          leccionId: l1Id,
          titulo: 'UT1 · Redacción: My Last Holiday (120 palabras)',
          instrucciones:
            'Redacta un párrafo de 120 palabras describiendo tu último viaje usando al menos 8 verbos irregulares en pasado simple. Adjunta tu archivo o escribe tu texto en comentarios.',
          notaMaxima: 100,
          venceEn: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          permiteTardio: true,
          publicada: true,
        },
        {
          id: tarea2Id,
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          leccionId: l3Id,
          titulo: 'UT2 · Diálogo escrito con Present Perfect',
          instrucciones:
            'Escribe 6 preguntas y respuestas usando Have you ever...? y marcadores already / yet.',
          notaMaxima: 100,
          venceEn: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
          permiteTardio: false,
          publicada: true,
        },
      ])
      .onConflictDoNothing();

    // 10. Entregas
    const entrega1Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
    const entrega2Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02';
    const entrega3Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03';

    await db
      .insert(entrega)
      .values([
        {
          id: entrega1Id,
          tenantId: DEFAULT_TENANT_ID,
          tareaId: tarea1Id,
          estudianteId: DEMO_STUDENT_MATEO_ID,
          archivoUrl: 'demo://mateo-villa-last-holiday.pdf',
          comentario:
            'Last August I went to Baños with my family. We saw the waterfalls, ate local food, and spoke with travelers from Canada.',
          estado: 'CALIFICADO',
          nota: 92,
          feedback: 'Excelente uso de verbos irregulares y conectores temporales. Cuida el uso de artículos en "the local food".',
          calificadoPor: DEMO_PROFESSOR_ID,
          calificadoEn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          entregadoEn: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
        {
          id: entrega2Id,
          tenantId: DEFAULT_TENANT_ID,
          tareaId: tarea1Id,
          estudianteId: '44444444-4444-4444-8444-444444444402',
          archivoUrl: 'demo://camila-mendoza-holiday.pdf',
          comentario:
            'Last summer I flew to Galápagos. I swam with sea lions and took more than fifty photographs.',
          estado: 'ENTREGADO',
          entregadoEn: new Date(Date.now() - 10 * 60 * 60 * 1000),
        },
        {
          id: entrega3Id,
          tenantId: DEFAULT_TENANT_ID,
          tareaId: tarea1Id,
          estudianteId: '44444444-4444-4444-8444-444444444403',
          archivoUrl: 'demo://sebastian-proano-holiday.pdf',
          comentario:
            'In July I drove to Cotopaxi with my cousins. We drank hot chocolate and walked near Limpiopungo lagoon.',
          estado: 'ENTREGADO',
          entregadoEn: new Date(Date.now() - 4 * 60 * 60 * 1000),
        },
      ])
      .onConflictDoNothing();

    // 11. Quiz interactivo con los 3 tipos de pregunta
    const quiz1Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
    await db
      .insert(quiz)
      .values({
        id: quiz1Id,
        tenantId: DEFAULT_TENANT_ID,
        leccionId: l3Id,
        titulo: 'Quiz Unidad 2 · Present Perfect vs. Past Simple',
        intentosMax: 2,
        notaMinima: 70,
        publicada: true,
      })
      .onConflictDoNothing();

    await db
      .insert(pregunta)
      .values([
        {
          quizId: quiz1Id,
          orden: 1,
          enunciado: 'Completa la oración: "She ___ in Quito since 2022."',
          tipo: 'OPCION_MULTIPLE',
          opciones: ['lived', 'has lived', 'is living', 'was lived'],
          respuestaCorrecta: 'has lived',
          puntos: 25,
        },
        {
          quizId: quiz1Id,
          orden: 2,
          enunciado: 'Selecciona la forma correcta: "Did you ___ the email yesterday?"',
          tipo: 'OPCION_MULTIPLE',
          opciones: ['sent', 'sending', 'send', 'have sent'],
          respuestaCorrecta: 'send',
          puntos: 25,
        },
        {
          quizId: quiz1Id,
          orden: 3,
          enunciado: 'Verdadero o Falso: Usamos "for" para expresar una duración de tiempo (ej. for two years).',
          tipo: 'VERDADERO_FALSO',
          opciones: null,
          respuestaCorrecta: true,
          puntos: 25,
        },
        {
          quizId: quiz1Id,
          orden: 4,
          enunciado: 'Escribe el pasado participio del verbo "write" (una sola palabra en inglés):',
          tipo: 'RESPUESTA_CORTA',
          opciones: null,
          respuestaCorrecta: ['written'],
          puntos: 25,
        },
      ])
      .onConflictDoNothing();

    // 12. Progreso inicial de Mateo y Camila
    await db
      .insert(progresoLeccion)
      .values([
        {
          tenantId: DEFAULT_TENANT_ID,
          estudianteId: DEMO_STUDENT_MATEO_ID,
          leccionId: l1Id,
          estado: 'COMPLETADA',
          porcentaje: 100,
          completadaEn: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          estudianteId: DEMO_STUDENT_MATEO_ID,
          leccionId: l2Id,
          estado: 'COMPLETADA',
          porcentaje: 100,
          completadaEn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          estudianteId: '44444444-4444-4444-8444-444444444402',
          leccionId: l1Id,
          estado: 'COMPLETADA',
          porcentaje: 100,
          completadaEn: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        },
      ])
      .onConflictDoNothing();

    // 13. Anuncios del curso
    await db
      .insert(anuncio)
      .values([
        {
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          titulo: 'Recordatorio: Fecha límite Tarea UT1 y Quiz Unidad 2',
          mensaje:
            'Estimados estudiantes, recuerden subir su redacción "My Last Holiday" y completar el Quiz de la Unidad 2 antes del viernes a las 20:00 (hora Ecuador). Las notas se sincronizan automáticamente con su ficha académica en ALLEN.',
          autorId: DEMO_PROFESSOR_ID,
          autorNombre: 'Lcda. Carolina Andrade',
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          cursoId: cursoA2Id,
          titulo: 'Material complementario de pronunciación disponible',
          mensaje:
            'Ya se encuentra habilitada la guía PDF de verbos irregulares en la Unidad 1 con ejemplos para practicar en casa.',
          autorId: DEMO_PROFESSOR_ID,
          autorNombre: 'Lcda. Carolina Andrade',
        },
      ])
      .onConflictDoNothing();

    // 14. Evento Outbox de muestra ya sincronizado
    await db
      .insert(eventoAula)
      .values({
        tenantId: DEFAULT_TENANT_ID,
        tipo: 'nota.publicada',
        payload: {
          tenantId: DEFAULT_TENANT_ID,
          estudianteId: DEMO_STUDENT_MATEO_ID,
          claseId: null,
          tipo: 'EVALUACION',
          actividad: 'UT1 · Redacción: My Last Holiday (120 palabras)',
          fecha: new Date().toISOString().slice(0, 10),
          nota: 92,
          peso: 10,
          origen: 'AULA',
          origenId: entrega1Id,
        },
        estado: 'ENVIADO',
        intentos: 1,
        enviadoEn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing();

    await ensureEnhancedSeedData();
  } catch (error) {
    console.error('Error seeding ALLEN Aula data:', error);
    throw new Error('No se pudieron inicializar los datos base del aula.', { cause: error });
  }
}

async function ensureEnhancedSeedData(): Promise<void> {
  // Actualizar nombre institucional en tenants ya sembrados
  await db
    .update(tenantRef)
    .set({ nombre: 'All American English · Quito' })
    .where(eq(tenantRef.id, DEFAULT_TENANT_ID));
  await db
    .update(tenantRef)
    .set({ nombre: 'All American English · Guayaquil' })
    .where(eq(tenantRef.id, SECONDARY_TENANT_ID));

  const cursoA2Id = '55555555-5555-4555-8555-555555555501';
  const l1Id = '88888888-8888-4888-8888-888888888801';
  const l3Id = '88888888-8888-4888-8888-888888888803';
  const quiz1Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
  const quizCambridgeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';
  const driveMatId = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
  const greetingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';

  // 1. Enriquecer Quiz 1 existente con temporalización MCER Cambridge (15 min)
  await db
    .update(quiz)
    .set({
      descripcion:
        'Evaluación cronometrada estilo Cambridge A2 Key sobre Present Perfect vs. Past Simple. El envío se realiza automáticamente al finalizar el tiempo.',
      tiempoLimiteMin: 15,
      envioAutomatico: true,
      modo: 'EXAMEN',
      nivelMcer: 'A2',
      habilidadCambridge: 'USE_OF_ENGLISH',
    })
    .where(eq(quiz.id, quiz1Id));

  // 2. Recurso en Google Drive en Lección 1.1 (para descarga directa sin saturar el servidor)
  await db
    .insert(material)
    .values({
      id: driveMatId,
      tenantId: DEFAULT_TENANT_ID,
      leccionId: l1Id,
      tipo: 'GOOGLE_DRIVE',
      titulo: 'Cambridge A2 Key · Workbook & Audio Pack (Google Drive)',
      descripcion: 'Descarga directa desde Google Drive sin consumir almacenamiento del aula.',
      url: 'https://drive.google.com/file/d/1AllenCambridgeA2WorkbookPack2026/view?usp=sharing',
      mimeType: 'application/pdf',
      orden: 3,
    })
    .onConflictDoNothing();

  // 3. Saludo de bienvenida (Greeting) fijado en el curso A2
  await db
    .insert(anuncio)
    .values({
      id: greetingId,
      tenantId: DEFAULT_TENANT_ID,
      cursoId: cursoA2Id,
      titulo: 'Welcome to English A2! · Saludo de bienvenida del tutor',
      mensaje:
        'Hello everyone! Bienvenidos a su aula virtual ALLEN. Esta semana trabajaremos los tiempos pasados, comprensión auditiva y nuestro primer simulacro cronometrado estilo Cambridge A2 Key (con sección de Writing). Recuerden descargar el paquete de recursos desde Google Drive y usar el Asistente IA si tienen dudas gramaticales.',
      esSaludo: true,
      autorId: DEMO_PROFESSOR_ID,
      autorNombre: 'Lcda. Carolina Andrade',
    })
    .onConflictDoNothing();

  // 4. Examen cronometrado Cambridge A2 Key Mixto (Opción Múltiple + Short Answer + Writing CEFR)
  await db
    .insert(quiz)
    .values({
      id: quizCambridgeId,
      tenantId: DEFAULT_TENANT_ID,
      leccionId: l1Id,
      titulo: 'Simulacro Cambridge A2 Key · Reading, Use of English & Writing',
      descripcion:
        'Examen interactivo con límite de 25 minutos bajo metodología MCER Cambridge. Incluye reactivos autocalificables y una sección de Writing (60–100 palabras) evaluada con rúbrica Cambridge.',
      intentosMax: 2,
      notaMinima: 70,
      tiempoLimiteMin: 25,
      envioAutomatico: true,
      modo: 'EXAMEN',
      mezclarPreguntas: false,
      nivelMcer: 'A2',
      habilidadCambridge: 'MIXTO',
      publicada: true,
    })
    .onConflictDoNothing();

  await db
    .insert(pregunta)
    .values([
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01',
        quizId: quizCambridgeId,
        orden: 1,
        enunciado: 'Part 1 (Cambridge Dialogue): "Can I park my car here for a moment?"',
        tipo: 'OPCION_MULTIPLE',
        opciones: ['Sorry, I did that.', "It's the same place.", 'Only for half an hour.', 'Yes, I went yesterday.'],
        respuestaCorrecta: 'Only for half an hour.',
        retroalimentacion:
          'En respuestas funcionales Cambridge A2, "Only for half an hour" responde directamente a un permiso de tiempo.',
        puntos: 25,
      },
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02',
        quizId: quizCambridgeId,
        orden: 2,
        enunciado:
          'Part 2 (Open Cloze): Completa con una sola palabra en pasado simple — "Yesterday we ___ a fascinating museum in Quito." (verb: visit)',
        tipo: 'RESPUESTA_CORTA',
        opciones: null,
        respuestaCorrecta: ['visited'],
        retroalimentacion: 'El verbo regular "visit" forma su pasado simple agregando -ed: visited.',
        puntos: 25,
      },
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03',
        quizId: quizCambridgeId,
        orden: 3,
        enunciado:
          'Part 6 (Cambridge A2 Writing — Email): Write an email to your English friend Alex about your last weekend trip. Say where you went, who you went with, and what you enjoyed most.',
        tipo: 'WRITING',
        opciones: null,
        respuestaCorrecta:
          'Criterios Cambridge A2: Responder los 3 puntos (lugar, compañía, actividad favorita), saludo/despedida de email y uso correcto de Past Simple.',
        retroalimentacion:
          'Tu docente revisará este Writing aplicando los criterios Cambridge (Content, Organisation, Language).',
        minPalabras: 45,
        maxPalabras: 100,
        puntos: 50,
      },
    ])
    .onConflictDoNothing();

  // 5. Registros de asistencia de solo lectura sincronizados desde ALLEN CRM
  const attendanceSeed = [
    {
      estudianteId: DEMO_STUDENT_MATEO_ID,
      fecha: '2026-11-03',
      tema: 'Session 01 · Past Simple & Regular Verbs',
      estado: 'PRESENTE',
      observacion: 'Participación activa en speaking.',
    },
    {
      estudianteId: DEMO_STUDENT_MATEO_ID,
      fecha: '2026-11-05',
      tema: 'Session 02 · Irregular Verbs in Context',
      estado: 'PRESENTE',
      observacion: null,
    },
    {
      estudianteId: DEMO_STUDENT_MATEO_ID,
      fecha: '2026-11-10',
      tema: 'Session 03 · Listening Interviews',
      estado: 'TARDANZA',
      observacion: 'Ingreso 10 min tarde (registrado en ALLEN).',
    },
    {
      estudianteId: DEMO_STUDENT_MATEO_ID,
      fecha: '2026-11-12',
      tema: 'Session 04 · Present Perfect Introduction',
      estado: 'PRESENTE',
      observacion: null,
    },
    {
      estudianteId: DEMO_STUDENT_MATEO_ID,
      fecha: '2026-11-17',
      tema: 'Session 05 · Since, For, Already & Yet',
      estado: 'JUSTIFICADA',
      observacion: 'Certificado médico aprobado en recepción ALLEN.',
    },
    {
      estudianteId: DEMO_STUDENT_MATEO_ID,
      fecha: '2026-11-19',
      tema: 'Session 06 · Cambridge A2 Writing Workshop',
      estado: 'PRESENTE',
      observacion: 'Excelente práctica en clase.',
    },
    {
      estudianteId: '44444444-4444-4444-8444-444444444402',
      fecha: '2026-11-17',
      tema: 'Session 05 · Since, For, Already & Yet',
      estado: 'PRESENTE',
      observacion: null,
    },
    {
      estudianteId: '44444444-4444-4444-8444-444444444402',
      fecha: '2026-11-19',
      tema: 'Session 06 · Cambridge A2 Writing Workshop',
      estado: 'PRESENTE',
      observacion: null,
    },
    {
      estudianteId: '44444444-4444-4444-8444-444444444403',
      fecha: '2026-11-17',
      tema: 'Session 05 · Since, For, Already & Yet',
      estado: 'AUSENTE',
      observacion: 'Inasistencia sin justificación reportada en ALLEN.',
    },
    {
      estudianteId: '44444444-4444-4444-8444-444444444403',
      fecha: '2026-11-19',
      tema: 'Session 06 · Cambridge A2 Writing Workshop',
      estado: 'PRESENTE',
      observacion: null,
    },
  ];

  await db
    .insert(asistenciaRef)
    .values(
      attendanceSeed.map((a) => ({
        tenantId: DEFAULT_TENANT_ID,
        cursoId: cursoA2Id,
        horarioId: '77777777-7777-4777-8777-777777777701',
        estudianteId: a.estudianteId,
        fecha: a.fecha,
        tema: a.tema,
        estado: a.estado,
        observacion: a.observacion,
        origen: 'ALLEN',
      })),
    )
    .onConflictDoNothing();

  // Actualizar tarea 1 existente para marcarla como WRITING MCER A2
  await db
    .update(tarea)
    .set({
      tipoTarea: 'WRITING',
      nivelMcer: 'A2',
      minPalabras: 80,
      maxPalabras: 140,
    })
    .where(eq(tarea.id, '99999999-9999-4999-8999-999999999901'));

  await ensureGamificationSeedData();
}

async function ensureGamificationSeedData(): Promise<void> {
  const hoy = getGuayaquilDateKey();
  const ayer = addCalendarDays(hoy, -1);
  const hace2Dias = addCalendarDays(hoy, -2);
  const mesRef = hoy.slice(0, 7);

  const estCamila = '44444444-4444-4444-8444-444444444402';
  const estSebastian = '44444444-4444-4444-8444-444444444403';
  const estValentina = '44444444-4444-4444-8444-444444444404';
  const estDiego = '44444444-4444-4444-8444-444444444405';
  const estAntonella = '44444444-4444-4444-8444-444444444406';

  // 1. Configuración de gamificación del tenant Quito
  await db
    .insert(gamificacionConfig)
    .values({
      tenantId: DEFAULT_TENANT_ID,
      ptsLeccion: 25,
      ptsTareaATiempo: 40,
      ptsExamenAprobado: 60,
      ptsHabilidadMcer: 30,
      ptsMascotaInteraccion: 5,
      costoRecuperarRacha: 120,
      ventanaRecuperacionHoras: 48,
      maxRecuperacionesMes: 2,
      maxComodinesStock: 5,
      limitePuntosDiarios: 400,
      hitosConfig: DEFAULT_STREAK_MILESTONES,
    })
    .onConflictDoNothing();

  // 2. Perfiles de gamificación de los 6 estudiantes (variados para probar rankings, racha activa, en riesgo y perdida recuperable)
  await db
    .insert(estudianteGamificacion)
    .values([
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        puntosSaldo: 580,
        puntosTotales: 840,
        xpTotal: 520,
        rachaActual: 6,
        rachaMaxima: 9,
        ultimaActividadFecha: hoy,
        rachaPerdidaValor: 0,
        rachaPerdidaFecha: null,
        recuperacionesEsteMes: 1,
        recuperacionMesRef: mesRef,
        comodinesRacha: 2,
        perfilTema: 'institucional',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estCamila,
        puntosSaldo: 720,
        puntosTotales: 1180,
        xpTotal: 890,
        rachaActual: 14,
        rachaMaxima: 14,
        ultimaActividadFecha: hoy,
        rachaPerdidaValor: 0,
        rachaPerdidaFecha: null,
        recuperacionesEsteMes: 0,
        recuperacionMesRef: mesRef,
        comodinesRacha: 3,
        perfilTema: 'londres',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estSebastian,
        puntosSaldo: 310,
        puntosTotales: 490,
        xpTotal: 340,
        rachaActual: 0,
        rachaMaxima: 8,
        ultimaActividadFecha: addCalendarDays(hoy, -3),
        rachaPerdidaValor: 5,
        rachaPerdidaFecha: ayer,
        recuperacionesEsteMes: 0,
        recuperacionMesRef: mesRef,
        comodinesRacha: 0,
        perfilTema: 'institucional',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estValentina,
        puntosSaldo: 465,
        puntosTotales: 745,
        xpTotal: 610,
        rachaActual: 8,
        rachaMaxima: 11,
        ultimaActividadFecha: ayer, // En riesgo hoy
        rachaPerdidaValor: 0,
        rachaPerdidaFecha: null,
        recuperacionesEsteMes: 0,
        recuperacionMesRef: mesRef,
        comodinesRacha: 1,
        perfilTema: 'biblioteca',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estDiego,
        puntosSaldo: 290,
        puntosTotales: 410,
        xpTotal: 270,
        rachaActual: 3,
        rachaMaxima: 5,
        ultimaActividadFecha: hoy,
        rachaPerdidaValor: 0,
        rachaPerdidaFecha: null,
        recuperacionesEsteMes: 0,
        recuperacionMesRef: mesRef,
        comodinesRacha: 1,
        perfilTema: 'institucional',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estAntonella,
        puntosSaldo: 185,
        puntosTotales: 245,
        xpTotal: 150,
        rachaActual: 1,
        rachaMaxima: 4,
        ultimaActividadFecha: hoy,
        rachaPerdidaValor: 0,
        rachaPerdidaFecha: null,
        recuperacionesEsteMes: 0,
        recuperacionMesRef: mesRef,
        comodinesRacha: 1,
        perfilTema: 'institucional',
      },
    ])
    .onConflictDoNothing();

  // 3. Mascotas virtuales personalizadas para cada estudiante
  await db
    .insert(mascotaEstudiante)
    .values([
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        nombre: 'Nova',
        especie: 'BUHO_ALLEN',
        etapa: 2,
        nivel: 5,
        xp: 440,
        energia: 86,
        felicidad: 92,
        saciedad: 78,
        accesorioCabeza: 'lentes',
        accesorioCuello: 'bufanda_allen',
        fondoHabitat: 'aula',
        accesoriosDesbloqueados: ['lentes', 'bufanda_allen'],
        ultimaReaccion: '¡6 días seguidos! Mañana alcanzamos el hito de 7 días juntos.',
        ultimaReaccionTipo: 'ACTIVIDAD',
        interaccionesHoy: 0,
        interaccionesFecha: ayer,
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estCamila,
        nombre: 'Spark',
        especie: 'ZORRO_ESTUDIO',
        etapa: 3,
        nivel: 9,
        xp: 850,
        energia: 95,
        felicidad: 98,
        saciedad: 90,
        accesorioCabeza: 'birrete',
        accesorioCuello: 'capa_maestro',
        fondoHabitat: 'londres',
        accesoriosDesbloqueados: ['birrete', 'capa_maestro', 'londres'],
        ultimaReaccion: '¡14 días de racha! Quincena de fuego desbloqueada.',
        ultimaReaccionTipo: 'HITO',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estSebastian,
        nombre: 'Kiko',
        especie: 'DRAGON_LINGUA',
        etapa: 2,
        nivel: 3,
        xp: 260,
        energia: 64,
        felicidad: 58,
        saciedad: 65,
        fondoHabitat: 'aula',
        accesoriosDesbloqueados: [],
        ultimaReaccion: '¡Te extrañé! Podemos retomar hoy cuando estés listo.',
        ultimaReaccionTipo: 'SALUDO',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estValentina,
        nombre: 'Milo',
        especie: 'BUHO_ALLEN',
        etapa: 3,
        nivel: 6,
        xp: 610,
        energia: 76,
        felicidad: 82,
        saciedad: 74,
        accesorioCabeza: 'lentes',
        fondoHabitat: 'biblioteca',
        accesoriosDesbloqueados: ['lentes', 'biblioteca'],
        ultimaReaccion: '¡No olvides nuestra práctica de hoy para llegar a 9 días!',
        ultimaReaccionTipo: 'SALUDO',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estDiego,
        nombre: 'Pip',
        especie: 'ZORRO_ESTUDIO',
        etapa: 2,
        nivel: 3,
        xp: 230,
        energia: 82,
        felicidad: 84,
        saciedad: 80,
        fondoHabitat: 'aula',
        accesoriosDesbloqueados: [],
        ultimaReaccion: '¡3 días de racha! Vamos por el hito semanal.',
        ultimaReaccionTipo: 'HITO',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estAntonella,
        nombre: 'Lumi',
        especie: 'DRAGON_LINGUA',
        etapa: 1,
        nivel: 2,
        xp: 120,
        energia: 90,
        felicidad: 88,
        saciedad: 85,
        fondoHabitat: 'aula',
        accesoriosDesbloqueados: [],
        ultimaReaccion: '¡Qué buen inicio! Sigamos explorando nuevas lecciones.',
        ultimaReaccionTipo: 'SALUDO',
      },
    ])
    .onConflictDoNothing();

  // 4. Calendario de actividad diaria de Mateo (últimos 14 días con días activos, 1 protegido y 1 recuperado)
  const mateoDays = [
    { delta: -12, tipo: 'ACTIVA', acciones: 2, pts: 65, detalle: 'Lección 1.1 y práctica de verbos' },
    { delta: -11, tipo: 'ACTIVA', acciones: 1, pts: 40, detalle: 'Entrega Tarea UT1 Writing' },
    { delta: -10, tipo: 'PROTEGIDA', acciones: 0, pts: 0, detalle: 'Día protegido con Comodín de Racha' },
    { delta: -9, tipo: 'ACTIVA', acciones: 2, pts: 55, detalle: 'Listening entrevistas breves' },
    { delta: -7, tipo: 'RECUPERADA', acciones: 1, pts: 0, detalle: 'Racha recuperada con ALLEN POINTS' },
    { delta: -5, tipo: 'ACTIVA', acciones: 1, pts: 25, detalle: 'Lección 1.2 completada' },
    { delta: -4, tipo: 'ACTIVA', acciones: 2, pts: 85, detalle: 'Quiz Present Perfect + Writing' },
    { delta: -3, tipo: 'ACTIVA', acciones: 1, pts: 40, detalle: 'Repaso irregular verbs + hito 3 días' },
    { delta: -2, tipo: 'ACTIVA', acciones: 2, pts: 60, detalle: 'Simulacro Cambridge A2 Listening' },
    { delta: -1, tipo: 'ACTIVA', acciones: 1, pts: 45, detalle: 'Práctica Reading & Vocabulary' },
    { delta: 0, tipo: 'ACTIVA', acciones: 2, pts: 70, detalle: 'Lección 2.1 + Cuidado de Nova' },
  ];

  await db
    .insert(actividadDiaria)
    .values(
      mateoDays.map((d) => ({
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        fecha: addCalendarDays(hoy, d.delta),
        tipo: d.tipo,
        accionesCount: d.acciones,
        puntosGanados: d.pts,
        detalle: d.detalle,
      })),
    )
    .onConflictDoNothing();

  // 5. Historial de rachas y recuperaciones de Mateo (solo si está vacío)
  const existingHist = await db
    .select({ id: historialRacha.id })
    .from(historialRacha)
    .where(eq(historialRacha.estudianteId, DEMO_STUDENT_MATEO_ID))
    .limit(1);

  if (existingHist.length === 0) {
    await db.insert(historialRacha).values([
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        tipoEvento: 'COMODIN_USADO',
        rachaAntes: 3,
        rachaDespues: 3,
        nota: 'Escudo protector usado automáticamente para conservar el hábito.',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        tipoEvento: 'RECUPERADA',
        rachaAntes: 0,
        rachaDespues: 4,
        costoPuntos: 120,
        nota: 'Racha recuperada dentro de la ventana de 48 horas con 120 ALLEN POINTS.',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        tipoEvento: 'HITO',
        rachaAntes: 2,
        rachaDespues: 3,
        recompensaPuntos: 35,
        nota: 'Hito alcanzado: Chispa inicial (3 días).',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        tipoEvento: 'INCREMENTO',
        rachaAntes: 5,
        rachaDespues: 6,
        recompensaPuntos: 25,
        nota: 'Día 6 completado — ¡A 1 día del hito semanal de 7 días!',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ]);
  }

  // 6. Catálogo de Insignias (10 insignias institucionales y MCER)
  const badgesData = [
    {
      id: 'f1000000-0000-4000-8000-000000000001',
      codigo: 'RACHA_3',
      nombre: 'Chispa Inicial',
      descripcion: 'Mantén una racha activa de 3 días consecutivos.',
      icono: 'flame',
      categoria: 'RACHA',
      puntosBonus: 35,
      condicionTipo: 'RACHA',
      condicionValor: 3,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000002',
      codigo: 'RACHA_7',
      nombre: 'Semana de Fuego',
      descripcion: 'Completa 7 días consecutivos de estudio en ALLEN Aula.',
      icono: 'flame',
      categoria: 'RACHA',
      puntosBonus: 75,
      condicionTipo: 'RACHA',
      condicionValor: 7,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000003',
      codigo: 'RACHA_14',
      nombre: 'Quincena Imparable',
      descripcion: 'Alcanza 14 días consecutivos aprendiendo inglés.',
      icono: 'zap',
      categoria: 'RACHA',
      puntosBonus: 150,
      condicionTipo: 'RACHA',
      condicionValor: 14,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000004',
      codigo: 'RACHA_30',
      nombre: 'Hábito Mensual',
      descripcion: '30 días consecutivos de constancia académica.',
      icono: 'crown',
      categoria: 'RACHA',
      puntosBonus: 300,
      condicionTipo: 'RACHA',
      condicionValor: 30,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000005',
      codigo: 'PRIMERA_LECCION',
      nombre: 'Primer Paso MCER',
      descripcion: 'Completa tu primera lección en un curso de inglés.',
      icono: 'book',
      categoria: 'ACADEMICO',
      puntosBonus: 25,
      condicionTipo: 'LECCIONES',
      condicionValor: 1,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000006',
      codigo: 'WRITER_A2',
      nombre: 'Pluma Cambridge',
      descripcion: 'Entrega una redacción Writing evaluada con éxito.',
      icono: 'pen',
      categoria: 'MCER',
      puntosBonus: 50,
      condicionTipo: 'WRITING',
      condicionValor: 1,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000007',
      codigo: 'LISTENING_PRO',
      nombre: 'Oído Bilingüe',
      descripcion: 'Completa actividades de comprensión auditiva.',
      icono: 'headphones',
      categoria: 'MCER',
      puntosBonus: 45,
      condicionTipo: 'LISTENING',
      condicionValor: 2,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000008',
      codigo: 'AMIGO_FIEL',
      nombre: 'Compañero Fiel',
      descripcion: 'Evoluciona tu mascota virtual a la etapa Aprendiz.',
      icono: 'heart',
      categoria: 'MASCOTA',
      puntosBonus: 40,
      condicionTipo: 'MASCOTA_ETAPA',
      condicionValor: 2,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000009',
      codigo: 'EXAMEN_90',
      nombre: 'Excelencia Cambridge',
      descripcion: 'Aprueba un examen cronometrado con nota superior a 90.',
      icono: 'trophy',
      categoria: 'ACADEMICO',
      puntosBonus: 80,
      condicionTipo: 'EXAMEN',
      condicionValor: 90,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000010',
      codigo: 'EMBAJADOR_ALLEN',
      nombre: 'Embajador ALLEN',
      descripcion: 'Insignia especial obtenida mediante canje en la tienda oficial.',
      icono: 'star',
      categoria: 'ESPECIAL',
      puntosBonus: 0,
      condicionTipo: 'TIENDA',
      condicionValor: 1,
    },
  ];

  await db
    .insert(insigniaDef)
    .values(badgesData.map((b) => ({ ...b, tenantId: DEFAULT_TENANT_ID, activa: true })))
    .onConflictDoNothing();

  // Insignias desbloqueadas para Mateo y Camila
  await db
    .insert(estudianteInsignia)
    .values([
      { tenantId: DEFAULT_TENANT_ID, estudianteId: DEMO_STUDENT_MATEO_ID, insigniaId: badgesData[0].id },
      { tenantId: DEFAULT_TENANT_ID, estudianteId: DEMO_STUDENT_MATEO_ID, insigniaId: badgesData[4].id },
      { tenantId: DEFAULT_TENANT_ID, estudianteId: DEMO_STUDENT_MATEO_ID, insigniaId: badgesData[5].id },
      { tenantId: DEFAULT_TENANT_ID, estudianteId: DEMO_STUDENT_MATEO_ID, insigniaId: badgesData[7].id },
      { tenantId: DEFAULT_TENANT_ID, estudianteId: estCamila, insigniaId: badgesData[0].id },
      { tenantId: DEFAULT_TENANT_ID, estudianteId: estCamila, insigniaId: badgesData[1].id },
      { tenantId: DEFAULT_TENANT_ID, estudianteId: estCamila, insigniaId: badgesData[2].id },
      { tenantId: DEFAULT_TENANT_ID, estudianteId: estCamila, insigniaId: badgesData[4].id },
      { tenantId: DEFAULT_TENANT_ID, estudianteId: estCamila, insigniaId: badgesData[8].id },
    ])
    .onConflictDoNothing();

  // 7. Retos y desafíos activos (5 retos)
  const retosData = [
    {
      id: 'f2000000-0000-4000-8000-000000000001',
      titulo: 'Maratón de Lecciones Semanales',
      descripcion: 'Completa 2 lecciones publicadas de tu curso esta semana.',
      tipoObjetivo: 'LECCIONES',
      metaValor: 2,
      recompensaPuntos: 80,
      habilidadMcer: 'READING',
      fechaInicio: addCalendarDays(hoy, -5),
      fechaFin: addCalendarDays(hoy, 7),
    },
    {
      id: 'f2000000-0000-4000-8000-000000000002',
      titulo: 'Desafío Semana de Fuego',
      descripcion: 'Alcanza una racha activa de 7 días consecutivos.',
      tipoObjetivo: 'RACHA',
      metaValor: 7,
      recompensaPuntos: 120,
      habilidadMcer: null,
      fechaInicio: addCalendarDays(hoy, -7),
      fechaFin: addCalendarDays(hoy, 14),
    },
    {
      id: 'f2000000-0000-4000-8000-000000000003',
      titulo: 'Reto Writing Cambridge A2',
      descripcion: 'Envía 2 tareas de redacción en inglés dentro del plazo.',
      tipoObjetivo: 'WRITING',
      metaValor: 2,
      recompensaPuntos: 100,
      habilidadMcer: 'WRITING',
      fechaInicio: addCalendarDays(hoy, -4),
      fechaFin: addCalendarDays(hoy, 10),
    },
    {
      id: 'f2000000-0000-4000-8000-000000000004',
      titulo: 'Simulacro sin Miedo',
      descripcion: 'Completa 1 examen cronometrado MCER en tu aula.',
      tipoObjetivo: 'EXAMENES',
      metaValor: 1,
      recompensaPuntos: 90,
      habilidadMcer: 'USE_OF_ENGLISH',
      fechaInicio: addCalendarDays(hoy, -3),
      fechaFin: addCalendarDays(hoy, 12),
    },
    {
      id: 'f2000000-0000-4000-8000-000000000005',
      titulo: 'Coleccionista ALLEN POINTS',
      descripcion: 'Acumula 250 ALLEN POINTS mediante actividades académicas.',
      tipoObjetivo: 'PUNTOS',
      metaValor: 250,
      recompensaPuntos: 75,
      habilidadMcer: null,
      fechaInicio: addCalendarDays(hoy, -10),
      fechaFin: addCalendarDays(hoy, 15),
    },
  ];

  await db
    .insert(retoDef)
    .values(retosData.map((r) => ({ ...r, tenantId: DEFAULT_TENANT_ID, activo: true })))
    .onConflictDoNothing();

  // Progreso de Mateo en los retos (el Reto 1 ya está completado y listo para reclamar!)
  await db
    .insert(estudianteReto)
    .values([
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        retoId: retosData[0].id,
        progresoActual: 2,
        completado: true,
        reclamado: false,
        completadoEn: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        retoId: retosData[1].id,
        progresoActual: 6,
        completado: false,
        reclamado: false,
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        retoId: retosData[2].id,
        progresoActual: 1,
        completado: false,
        reclamado: false,
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        retoId: retosData[3].id,
        progresoActual: 0,
        completado: false,
        reclamado: false,
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        retoId: retosData[4].id,
        progresoActual: 195,
        completado: false,
        reclamado: false,
      },
    ])
    .onConflictDoNothing();

  // 8. Tienda de Canjes (10 productos cubriendo las 7 categorías solicitadas)
  const storeData = [
    {
      id: 'f3000000-0000-4000-8000-000000000001',
      codigo: 'COMODIN_ESCUDO',
      nombre: 'Escudo Protector de Racha',
      descripcion: 'Protege automáticamente tu racha por 1 día si no puedes conectarte.',
      categoria: 'COMODIN_RACHA',
      precioPuntos: 100,
      stock: null,
      requiereAprobacion: false,
      imagenKey: 'shield',
      condiciones: 'Máximo 5 escudos acumulados simultáneamente.',
      metadata: { comodinCantidad: 1 },
    },
    {
      id: 'f3000000-0000-4000-8000-000000000002',
      codigo: 'ACC_BIRRETE',
      nombre: 'Birrete Cambridge para Mascota',
      descripcion: 'Birrete académico azul institucional con borla dorada para tu compañero.',
      categoria: 'MASCOTA_ACCESORIO',
      precioPuntos: 120,
      stock: null,
      requiereAprobacion: false,
      imagenKey: 'grad_cap',
      condiciones: 'Desbloqueo permanente equipable en Mi Mascota.',
      metadata: { slot: 'cabeza', itemKey: 'birrete' },
    },
    {
      id: 'f3000000-0000-4000-8000-000000000003',
      codigo: 'ACC_CORONA',
      nombre: 'Corona Dorada de Excelencia',
      descripcion: 'Corona brillante reservada para estudiantes constantes de ALLEN Aula.',
      categoria: 'MASCOTA_ACCESORIO',
      precioPuntos: 260,
      stock: null,
      requiereAprobacion: false,
      imagenKey: 'crown',
      condiciones: 'Desbloqueo permanente equipable en cabeza.',
      metadata: { slot: 'cabeza', itemKey: 'corona' },
    },
    {
      id: 'f3000000-0000-4000-8000-000000000004',
      codigo: 'ACC_AUDIFONOS',
      nombre: 'Audífonos Listening Pro',
      descripcion: 'Audífonos rojos ALLEN ideales para sesiones de Listening & Speaking.',
      categoria: 'MASCOTA_ACCESORIO',
      precioPuntos: 110,
      stock: null,
      requiereAprobacion: false,
      imagenKey: 'headphones',
      condiciones: 'Desbloqueo permanente equipable en cabeza.',
      metadata: { slot: 'cabeza', itemKey: 'audifonos' },
    },
    {
      id: 'f3000000-0000-4000-8000-000000000005',
      codigo: 'VEST_CAPA',
      nombre: 'Capa de Maestro Bilingüe',
      descripcion: 'Vestimenta institucional roja y azul marino para tu mascota.',
      categoria: 'MASCOTA_VESTIMENTA',
      precioPuntos: 190,
      stock: null,
      requiereAprobacion: false,
      imagenKey: 'cape',
      condiciones: 'Equipable en el cuello/vestimenta de tu mascota.',
      metadata: { slot: 'cuello', itemKey: 'capa_maestro' },
    },
    {
      id: 'f3000000-0000-4000-8000-000000000006',
      codigo: 'HABITAT_LONDRES',
      nombre: 'Hábitat Londres & Big Ben',
      descripcion: 'Fondo visual temático británico para el hábitat de tu mascota y perfil.',
      categoria: 'PERFIL_VISUAL',
      precioPuntos: 150,
      stock: null,
      requiereAprobacion: false,
      imagenKey: 'london',
      condiciones: 'Aplica a tu mascota y tarjeta de perfil.',
      metadata: { slot: 'habitat', itemKey: 'londres', tema: 'londres' },
    },
    {
      id: 'f3000000-0000-4000-8000-000000000007',
      codigo: 'HABITAT_BIBLIOTECA',
      nombre: 'Hábitat Biblioteca Nocturna',
      descripcion: 'Ambiente cálido de biblioteca Cambridge para tus sesiones de estudio.',
      categoria: 'PERFIL_VISUAL',
      precioPuntos: 110,
      stock: null,
      requiereAprobacion: false,
      imagenKey: 'library',
      condiciones: 'Desbloqueo inmediato y permanente.',
      metadata: { slot: 'habitat', itemKey: 'biblioteca', tema: 'biblioteca' },
    },
    {
      id: 'f3000000-0000-4000-8000-000000000008',
      codigo: 'INSIGNIA_EMBAJADOR',
      nombre: 'Insignia Embajador ALLEN',
      descripcion: 'Distintivo especial visible en el ranking y en tu vitrina de logros.',
      categoria: 'INSIGNIA',
      precioPuntos: 200,
      stock: 25,
      requiereAprobacion: false,
      imagenKey: 'star',
      condiciones: 'Edición limitada por periodo académico.',
      metadata: { insigniaCodigo: 'EMBAJADOR_ALLEN' },
    },
    {
      id: 'f3000000-0000-4000-8000-000000000009',
      codigo: 'BEN_PRORROGA',
      nombre: '+24h de Prórroga en Tarea',
      descripcion: 'Solicita un día extra sin penalización en una tarea semanal elegida.',
      categoria: 'BENEFICIO_ACADEMICO',
      precioPuntos: 180,
      stock: 20,
      requiereAprobacion: true,
      imagenKey: 'clock',
      condiciones: 'Requiere validación del docente antes de la fecha límite.',
      metadata: { tipoBeneficio: 'PRORROGA_24H' },
    },
    {
      id: 'f3000000-0000-4000-8000-000000000010',
      codigo: 'PREMIO_TERMO_ALLEN',
      nombre: 'Termo Oficial All American English',
      descripcion: 'Termo térmico metálico azul marino con logo grabado de ALLEN.',
      categoria: 'PREMIO_ALLEN',
      precioPuntos: 450,
      stock: 8,
      requiereAprobacion: true,
      imagenKey: 'gift',
      condiciones: 'Retiro presencial en recepción de sede tras aprobación.',
      metadata: { fisico: true },
    },
  ];

  await db
    .insert(tiendaProducto)
    .values(storeData.map((p) => ({ ...p, tenantId: DEFAULT_TENANT_ID, activo: true })))
    .onConflictDoNothing();

  // 9. Movimientos de puntos de ejemplo para Mateo (idempotentes)
  const sampleMovements = [
    {
      idempotencyKey: `SEED:MATEO:1`,
      tipo: 'GANADO',
      fuente: 'LECCION',
      cantidad: 25,
      saldoDespues: 460,
      descripcion: 'Lección completada: 1.1 Verbos irregulares',
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
    {
      idempotencyKey: `SEED:MATEO:2`,
      tipo: 'GANADO',
      fuente: 'TAREA',
      cantidad: 55,
      saldoDespues: 515,
      descripcion: 'Tarea a tiempo + bonus Writing A2: My Last Holiday',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      idempotencyKey: `SEED:MATEO:3`,
      tipo: 'GANADO',
      fuente: 'RACHA_HITO',
      cantidad: 35,
      saldoDespues: 550,
      descripcion: 'Hito de racha alcanzado: Chispa inicial (3 días)',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      idempotencyKey: `SEED:MATEO:4`,
      tipo: 'GASTADO',
      fuente: 'CANJE_TIENDA',
      cantidad: -180,
      saldoDespues: 520,
      descripcion: 'Canje en tienda: +24h de Prórroga en Tarea',
      createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000),
    },
    {
      idempotencyKey: `SEED:MATEO:5`,
      tipo: 'GANADO',
      fuente: 'EXAMEN',
      cantidad: 60,
      saldoDespues: 580,
      descripcion: 'Práctica aprobada: Present Perfect vs Past Simple',
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
  ];

  for (const mov of sampleMovements) {
    await db
      .insert(movimientoPuntos)
      .values({
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        tipo: mov.tipo,
        fuente: mov.fuente,
        cantidad: mov.cantidad,
        saldoDespues: mov.saldoDespues,
        descripcion: mov.descripcion,
        idempotencyKey: mov.idempotencyKey,
        sospechoso: false,
        createdAt: mov.createdAt,
      })
      .onConflictDoNothing();
  }

  // 10. Canje pendiente de aprobación (para que Docente/Admin pruebe el flujo de validación real)
  const existingCanje = await db
    .select({ id: canjeTienda.id })
    .from(canjeTienda)
    .where(eq(canjeTienda.tenantId, DEFAULT_TENANT_ID))
    .limit(1);

  if (existingCanje.length === 0) {
    await db.insert(canjeTienda).values([
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: DEMO_STUDENT_MATEO_ID,
        productoId: storeData[8].id, // +24h Prórroga
        precioPagado: 180,
        estado: 'PENDIENTE_APROBACION',
        notaEstudiante: 'Para aplicar en la tarea UT2 Diálogo Present Perfect si fuera necesario.',
        createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000),
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estCamila,
        productoId: storeData[9].id, // Termo Oficial ALLEN
        precioPagado: 450,
        estado: 'PENDIENTE_APROBACION',
        notaEstudiante: 'Retiro en recepción sede Quito el viernes por la mañana.',
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        estudianteId: estCamila,
        productoId: storeData[1].id, // Birrete Cambridge
        precioPagado: 120,
        estado: 'COMPLETADO',
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
    ]);
  }

  // 11. Notificaciones reales persistentes (Estudiante + Docente)
  const existingNotifs = await db
    .select({ id: notificacionAula.id })
    .from(notificacionAula)
    .where(eq(notificacionAula.tenantId, DEFAULT_TENANT_ID))
    .limit(1);

  if (existingNotifs.length === 0) {
    await db.insert(notificacionAula).values([
      {
        tenantId: DEFAULT_TENANT_ID,
        destinatarioRol: 'ESTUDIANTE',
        destinatarioId: DEMO_STUDENT_MATEO_ID,
        tipo: 'RECOMPENSA',
        titulo: '¡Reto listo para reclamar (+80 pts)!',
        mensaje: 'Completaste "Maratón de Lecciones Semanales". Reclama tus ALLEN POINTS ahora.',
        leida: false,
        accionNav: 'gamificacion',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        destinatarioRol: 'ESTUDIANTE',
        destinatarioId: DEMO_STUDENT_MATEO_ID,
        tipo: 'HITO',
        titulo: '¡A 1 día del hito de 7 días!',
        mensaje: 'Nova está emocionada: completa una actividad mañana para ganar +75 ALLEN POINTS.',
        leida: false,
        accionNav: 'gamificacion',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        destinatarioRol: 'DOCENTE',
        destinatarioId: DEMO_PROFESSOR_ID,
        tipo: 'CANJE',
        titulo: '2 solicitudes de canje pendientes',
        mensaje: 'Mateo Villa y Camila Mendoza solicitaron canjes que requieren aprobación.',
        leida: false,
        accionNav: 'tienda',
      },
      {
        tenantId: DEFAULT_TENANT_ID,
        destinatarioRol: 'DOCENTE',
        destinatarioId: DEMO_PROFESSOR_ID,
        tipo: 'RACHA_RIESGO',
        titulo: 'Seguimiento de hábitos en Inglés A2',
        mensaje: 'Valentina Salazar tiene racha en riesgo hoy (8 días) y Sebastián Proaño puede recuperar su racha.',
        leida: false,
        accionNav: 'gamificacion',
      },
    ]);
  }

  // Ensure hace2Dias is referenced cleanly if needed
  void hace2Dias;

  await ensureInteractiveExamAndTestFixtures();
}

const INTERACTIVE_DEMO_QUIZ_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb09';
const DEMO_COURSE_A2_ID = '55555555-5555-4555-8555-555555555501';
const DEMO_LESSON_1_ID = '88888888-8888-4888-8888-888888888801';
const DEMO_TAREA_1_ID = '99999999-9999-4999-8999-999999999901';
const DEMO_ENTREGA_1_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const DEMO_ENTREGA_RECENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04';
const DEMO_STUDENT_VALENTINA_ID = '44444444-4444-4444-8444-444444444404';
const DEMO_STUDENT_ANTONELLA_ID = '44444444-4444-4444-8444-444444444406';

async function ensureInteractiveExamAndTestFixtures(): Promise<void> {
  // 1. Cuentas con usuario y contraseña para Administrador y Docentes (All American English · Sistema ALLEN)
  const [adminPassHash, profPassHash, studentPassHash] = await Promise.all([
    bcrypt.hash('Admin2026!', 10),
    bcrypt.hash('Docente2026!', 10),
    bcrypt.hash('Estudiante2026!', 10),
  ]);

  await db
    .insert(users)
    .values([
      {
        uid: DEMO_ADMIN_ID,
        username: 'admin',
        email: 'admin@allamericanenglish.edu.ec',
        nombre: 'Administrador All American English',
        passwordHash: adminPassHash,
        tenantId: DEFAULT_TENANT_ID,
        rol: 'ADMIN',
        activo: true,
        etiquetaEstado: 'Activo',
      },
      {
        uid: 'demo-prof-carolina',
        username: 'carolina.andrade',
        email: 'carolina.andrade@allamericanenglish.edu.ec',
        nombre: 'Lcda. Carolina Andrade',
        passwordHash: profPassHash,
        tenantId: DEFAULT_TENANT_ID,
        rol: 'PROFESOR',
        activo: true,
        etiquetaEstado: 'Activo',
      },
      {
        uid: 'demo-prof-martin',
        username: 'martin.cevallos',
        email: 'martin.cevallos@allamericanenglish.edu.ec',
        nombre: 'Prof. Martín Cevallos',
        passwordHash: profPassHash,
        tenantId: DEFAULT_TENANT_ID,
        rol: 'PROFESOR',
        activo: true,
        etiquetaEstado: 'Activo',
      },
    ])
    .onConflictDoNothing();

  // Asegurar username y passwordHash en cuentas demo preexistentes sin sobrescribir cambios posteriores
  const existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.tenantId, DEFAULT_TENANT_ID));

  for (const u of existingUsers) {
    if (!u.passwordHash || !u.username) {
      const fallbackUsername =
        u.username ||
        (u.uid === DEMO_ADMIN_ID
          ? 'admin'
          : u.uid === 'demo-prof-carolina'
            ? 'carolina.andrade'
            : u.uid === 'demo-prof-martin'
              ? 'martin.cevallos'
              : u.email.split('@')[0]);
      const fallbackHash = u.passwordHash || (u.rol === 'ADMIN' ? adminPassHash : profPassHash);
      await db
        .update(users)
        .set({
          username: fallbackUsername,
          passwordHash: fallbackHash,
          etiquetaEstado: u.etiquetaEstado || (u.activo ? 'Activo' : 'Inactivo'),
        })
        .where(eq(users.id, u.id));
    }
  }

  // Asegurar contraseña inicial en accesos de estudiantes y etiquetaEstado por defecto
  const accesosSinPass = await db
    .select()
    .from(accesoEstudiante)
    .where(eq(accesoEstudiante.tenantId, DEFAULT_TENANT_ID));

  for (const acc of accesosSinPass) {
    if (!acc.passwordHash) {
      await db
        .update(accesoEstudiante)
        .set({ passwordHash: studentPassHash })
        .where(eq(accesoEstudiante.id, acc.id));
    }
  }

  const estSinEtiqueta = await db
    .select()
    .from(estudianteRef)
    .where(eq(estudianteRef.tenantId, DEFAULT_TENANT_ID));

  for (const est of estSinEtiqueta) {
    if (!est.etiquetaEstado) {
      await db
        .update(estudianteRef)
        .set({ etiquetaEstado: est.estado === 'ACTIVO' ? 'Al día' : 'Inactivo' })
        .where(eq(estudianteRef.id, est.id));
    }
  }

  // 2. Examen interactivo listo para pruebas (Unir parejas con flechas, True/False, Audio, Video, Completar espacios y Ordenar palabras)
  await db
    .insert(quiz)
    .values({
      id: INTERACTIVE_DEMO_QUIZ_ID,
      tenantId: DEFAULT_TENANT_ID,
      leccionId: DEMO_LESSON_1_ID,
      titulo: 'Evaluación Interactiva A2 · Audio, Video y Unir parejas',
      descripcion:
        'Prueba completa para validar unión visual con flechas, True/False, reproducción de audio/video embebido y preguntas interactivas.',
      intentosMax: 5,
      notaMinima: 70,
      tiempoLimiteMin: 20,
      envioAutomatico: true,
      modo: 'EXAMEN',
      mezclarPreguntas: false,
      politicaSalida: 'ADVERTENCIA_LIMITE',
      maxCambiosPestana: 3,
      publicada: true,
    })
    .onConflictDoNothing();

  await db
    .insert(pregunta)
    .values([
      {
        quizId: INTERACTIVE_DEMO_QUIZ_ID,
        orden: 1,
        enunciado: 'Une cada verbo en presente con su forma correcta en pasado simple arrastrando o tocando para trazar la flecha:',
        tipo: 'UNIR_PAREJAS',
        opciones: {
          pairs: [
            { id: 'p1', left: 'Go', right: 'Went' },
            { id: 'p2', left: 'Speak', right: 'Spoke' },
            { id: 'p3', left: 'Write', right: 'Wrote' },
            { id: 'p4', left: 'Drink', right: 'Drank' },
          ],
        },
        respuestaCorrecta: {
          p1: 'Went',
          p2: 'Spoke',
          p3: 'Wrote',
          p4: 'Drank',
        },
        retroalimentacion: 'Recuerda los verbos irregulares clave: go→went, speak→spoke, write→wrote, drink→drank.',
        puntos: 25,
      },
      {
        quizId: INTERACTIVE_DEMO_QUIZ_ID,
        orden: 2,
        enunciado:
          'Escucha el audio de referencia y responde (True / False): En inglés, el verbo auxiliar "did" se utiliza seguido del verbo principal en forma base (ej. "Did you go?").',
        tipo: 'VERDADERO_FALSO',
        opciones: null,
        respuestaCorrecta: true,
        audioUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg',
        retroalimentacion: 'Correcto (True): después de "did" o "didn\'t", el verbo vuelve a su forma base.',
        puntos: 20,
      },
      {
        quizId: INTERACTIVE_DEMO_QUIZ_ID,
        orden: 3,
        enunciado:
          'Observa el recurso de video y elige la oración gramaticalmente correcta en Present Perfect:',
        tipo: 'OPCION_MULTIPLE',
        opciones: [
          'She has lived in Quito since 2022.',
          'She have lived in Quito since 2022.',
          'She has live in Quito for 2022.',
          'She lived in Quito since 2022 yet.',
        ],
        respuestaCorrecta: 'She has lived in Quito since 2022.',
        videoUrl: 'https://www.youtube.com/watch?v=d0yGdNEWdn0',
        retroalimentacion: 'Con tercera persona singular (she/he/it) se usa "has" + participio pasado y "since" para un año específico.',
        puntos: 20,
      },
      {
        quizId: INTERACTIVE_DEMO_QUIZ_ID,
        orden: 4,
        enunciado: 'Completa los espacios en pasado simple: "Yesterday we ___ to the museum and ___ dinner downtown."',
        tipo: 'COMPLETAR_ESPACIOS',
        opciones: { blanksCount: 2, hint: 'Usa pasado simple de go y eat/have' },
        respuestaCorrecta: ['went', 'ate|had'],
        retroalimentacion: 'Las formas correctas son "went" (go) y "ate" o "had" (eat/have).',
        puntos: 20,
      },
      {
        quizId: INTERACTIVE_DEMO_QUIZ_ID,
        orden: 5,
        enunciado: 'Ordena las palabras para formar una oración correcta:',
        tipo: 'ORDENAR_PALABRAS',
        opciones: { words: ['She', 'has', 'studied', 'English', 'at', 'ALLEN'] },
        respuestaCorrecta: ['She', 'has', 'studied', 'English', 'at', 'ALLEN'],
        retroalimentacion: 'Estructura: Sujeto + has + participio + complemento.',
        puntos: 15,
      },
    ])
    .onConflictDoNothing();

  // 3. Fixtures para protocolo de 48 horas en calificaciones:
  //    - Entrega de Mateo asentada hace 72 horas (bloqueada para docente, editable solo por Administrador Total)
  //    - Entrega de Valentina asentada hace 2 horas (editable por docente con comentario obligatorio)
  const hace72h = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const [mateoEnt] = await db
    .select()
    .from(entrega)
    .where(eq(entrega.id, DEMO_ENTREGA_1_ID))
    .limit(1);

  if (mateoEnt && !mateoEnt.notaAsentadaEn) {
    await db
      .update(entrega)
      .set({
        calificadoEn: hace72h,
        notaAsentadaEn: hace72h,
        historialNotas: [
          {
            fecha: hace72h.toISOString(),
            actorId: DEMO_PROFESSOR_ID,
            actorNombre: 'Lcda. Carolina Andrade',
            actorRol: 'PROFESOR',
            notaAnterior: null,
            notaNueva: mateoEnt.nota ?? 92,
            motivo: 'Calificación inicial registrada.',
          },
        ],
      })
      .where(eq(entrega.id, DEMO_ENTREGA_1_ID));
  }

  await db
    .insert(entrega)
    .values({
      id: DEMO_ENTREGA_RECENT_ID,
      tenantId: DEFAULT_TENANT_ID,
      tareaId: DEMO_TAREA_1_ID,
      estudianteId: DEMO_STUDENT_VALENTINA_ID,
      archivoUrl: 'demo://valentina-salazar-last-holiday.pdf',
      comentario:
        'Last winter I visited Cuenca with my sister. We walked along Tomebamba river, bought handmade crafts, and spoke with local artists.',
      estado: 'CALIFICADO',
      nota: 84,
      feedback: 'Muy buena redacción. Refuerza conectores de secuencia al cerrar el párrafo.',
      calificadoPor: DEMO_PROFESSOR_ID,
      calificadoEn: hace2h,
      notaAsentadaEn: hace2h,
      historialNotas: [
        {
          fecha: hace2h.toISOString(),
          actorId: DEMO_PROFESSOR_ID,
          actorNombre: 'Lcda. Carolina Andrade',
          actorRol: 'PROFESOR',
          notaAnterior: null,
          notaNueva: 84,
          motivo: 'Calificación inicial registrada.',
        },
      ],
      entregadoEn: new Date(Date.now() - 5 * 60 * 60 * 1000),
    })
    .onConflictDoNothing();

  // 4. Matrícula pendiente de aprobación por el docente en Curso A2
  await db
    .insert(inscripcionCurso)
    .values({
      tenantId: DEFAULT_TENANT_ID,
      cursoId: DEMO_COURSE_A2_ID,
      estudianteId: DEMO_STUDENT_ANTONELLA_ID,
      estado: 'PENDIENTE',
      origen: 'ADMIN',
    })
    .onConflictDoNothing();
}

/**
 * Recarga los datos de prueba para testear exámenes interactivos, el protocolo de 48h y aprobaciones de matrícula.
 */
export async function resetDemoExamTestData(): Promise<{
  intentosEliminados: number;
  quizInteractivoId: string;
}> {
  await ensureSeedData();

  // Limpiar intentos de Mateo para que tenga intentos frescos en todos los exámenes demo
  const deleted = await db
    .delete(intentoQuiz)
    .where(
      and(
        eq(intentoQuiz.tenantId, DEFAULT_TENANT_ID),
        eq(intentoQuiz.estudianteId, DEMO_STUDENT_MATEO_ID),
      ),
    )
    .returning({ id: intentoQuiz.id });

  // Asegurar intentos disponibles y publicación activa en los exámenes demo
  await db
    .update(quiz)
    .set({ publicada: true, intentosMax: 5 })
    .where(eq(quiz.tenantId, DEFAULT_TENANT_ID));

  // Restablecer timestamps del protocolo de 48 horas en las dos entregas de ejemplo
  const hace72h = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000);

  await db
    .update(entrega)
    .set({
      nota: 92,
      estado: 'CALIFICADO',
      calificadoEn: hace72h,
      notaAsentadaEn: hace72h,
      ultimoMotivoCambio: null,
      historialNotas: [
        {
          fecha: hace72h.toISOString(),
          actorId: DEMO_PROFESSOR_ID,
          actorNombre: 'Lcda. Carolina Andrade',
          actorRol: 'PROFESOR',
          notaAnterior: null,
          notaNueva: 92,
          motivo: 'Calificación inicial registrada.',
        },
      ],
    })
    .where(eq(entrega.id, DEMO_ENTREGA_1_ID));

  await db
    .update(entrega)
    .set({
      nota: 84,
      estado: 'CALIFICADO',
      calificadoEn: hace2h,
      notaAsentadaEn: hace2h,
      ultimoMotivoCambio: null,
      historialNotas: [
        {
          fecha: hace2h.toISOString(),
          actorId: DEMO_PROFESSOR_ID,
          actorNombre: 'Lcda. Carolina Andrade',
          actorRol: 'PROFESOR',
          notaAnterior: null,
          notaNueva: 84,
          motivo: 'Calificación inicial registrada.',
        },
      ],
    })
    .where(eq(entrega.id, DEMO_ENTREGA_RECENT_ID));

  await ensureInteractiveExamAndTestFixtures();

  return {
    intentosEliminados: deleted.length,
    quizInteractivoId: INTERACTIVE_DEMO_QUIZ_ID,
  };
}


