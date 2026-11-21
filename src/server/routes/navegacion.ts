import { and, desc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.ts';
import {
  anuncio,
  asistenciaRef,
  canjeTienda,
  curso,
  entrega,
  eventoAula,
  inscripcionCurso,
  intentoQuiz,
  leccion,
  notificacionAula,
  progresoLeccion,
  quiz,
  tarea,
  unidad,
} from '../../db/schema.ts';
import { ensureSeedData } from '../../db/seed.ts';
import { requireAuth, requireRole, type AuthRequest } from '../../middleware/auth.ts';
import { calculateAttendanceSummary, calculateCourseProgress } from '../services/grading.ts';

export const navegacionRouter = Router();

// GET /api/navegacion/resumen — Resumen real por tenant y rol para Dashboard, Sidebar y Próximos eventos
navegacionRouter.get(
  '/navegacion/resumen',
  requireAuth,
  requireRole('ADMIN', 'PROFESOR', 'ESTUDIANTE'),
  async (req: AuthRequest, res) => {
    try {
      await ensureSeedData();
      const { tenantId, rol, sub, estudianteId } = req.aulaUser!;
      const estId = estudianteId || sub;

      // 1. Determinar cursos accesibles para este usuario
      let visibleCursos: Array<typeof curso.$inferSelect> = [];
      if (rol === 'ESTUDIANTE') {
        const insc = await db
          .select({ cursoId: inscripcionCurso.cursoId })
          .from(inscripcionCurso)
          .where(
            and(
              eq(inscripcionCurso.tenantId, tenantId),
              eq(inscripcionCurso.estudianteId, estId),
              eq(inscripcionCurso.estado, 'ACTIVO'),
            ),
          );
        const ids = insc.map((i) => i.cursoId);
        if (ids.length > 0) {
          visibleCursos = await db
            .select()
            .from(curso)
            .where(
              and(
                eq(curso.tenantId, tenantId),
                inArray(curso.id, ids),
                eq(curso.estado, 'PUBLICADO'),
              ),
            )
            .orderBy(desc(curso.createdAt));
        }
      } else {
        const conditions = [eq(curso.tenantId, tenantId)];
        if (rol === 'PROFESOR') {
          conditions.push(eq(curso.profesorId, sub));
        }
        visibleCursos = await db
          .select()
          .from(curso)
          .where(and(...conditions))
          .orderBy(desc(curso.createdAt));
      }

      const cursoIds = visibleCursos.map((c) => c.id);
      const cursoNameMap = new Map(visibleCursos.map((c) => [c.id, c.nombre]));

      if (cursoIds.length === 0) {
        return res.json({
          badges: {
            entregasPendientes: 0,
            notificaciones: 0,
            actividadesPendientes: 0,
          },
          kpis: {
            cursosActivos: 0,
            estudiantesMatriculados: 0,
            entregasPendientes: 0,
            examenesActivos: 0,
            promedioAcademico: null,
            porcentajeAsistencia: 0,
            progresoPromedio: 0,
            outboxPendientes: 0,
          },
          proximosEventos: [],
          anunciosRecientes: [],
          tareasResumen: [],
          examenesResumen: [],
          entregasPendientesPorCurso: {},
        });
      }

      const [
        inscripcionesList,
        unidadesList,
        tareasList,
        anunciosList,
        asistenciasList,
        outboxPendList,
      ] = await Promise.all([
        db
          .select()
          .from(inscripcionCurso)
          .where(
            and(
              eq(inscripcionCurso.tenantId, tenantId),
              inArray(inscripcionCurso.cursoId, cursoIds),
              eq(inscripcionCurso.estado, 'ACTIVO'),
            ),
          ),
        db
          .select()
          .from(unidad)
          .where(and(eq(unidad.tenantId, tenantId), inArray(unidad.cursoId, cursoIds))),
        db
          .select()
          .from(tarea)
          .where(and(eq(tarea.tenantId, tenantId), inArray(tarea.cursoId, cursoIds)))
          .orderBy(desc(tarea.createdAt)),
        db
          .select()
          .from(anuncio)
          .where(and(eq(anuncio.tenantId, tenantId), inArray(anuncio.cursoId, cursoIds)))
          .orderBy(desc(anuncio.createdAt))
          .limit(12),
        rol === 'ESTUDIANTE'
          ? db
              .select()
              .from(asistenciaRef)
              .where(
                and(
                  eq(asistenciaRef.tenantId, tenantId),
                  inArray(asistenciaRef.cursoId, cursoIds),
                  eq(asistenciaRef.estudianteId, estId),
                ),
              )
          : db
              .select()
              .from(asistenciaRef)
              .where(
                and(
                  eq(asistenciaRef.tenantId, tenantId),
                  inArray(asistenciaRef.cursoId, cursoIds),
                ),
              ),
        rol !== 'ESTUDIANTE'
          ? db
              .select({ id: eventoAula.id })
              .from(eventoAula)
              .where(
                and(eq(eventoAula.tenantId, tenantId), eq(eventoAula.estado, 'PENDIENTE')),
              )
          : Promise.resolve([]),
      ]);

      const unidadIds = unidadesList.map((u) => u.id);
      const unidadToCurso = new Map(unidadesList.map((u) => [u.id, u.cursoId]));

      const leccionesList =
        unidadIds.length > 0
          ? await db
              .select()
              .from(leccion)
              .where(and(eq(leccion.tenantId, tenantId), inArray(leccion.unidadId, unidadIds)))
          : [];
      const leccionIds = leccionesList.map((l) => l.id);
      const leccionToCurso = new Map(
        leccionesList.map((l) => [l.id, unidadToCurso.get(l.unidadId) || '']),
      );

      const visibleTareas =
        rol === 'ESTUDIANTE' ? tareasList.filter((t) => t.publicada) : tareasList;
      const tareaIds = visibleTareas.map((t) => t.id);

      const [quizzesList, entregasList, progresosList] = await Promise.all([
        leccionIds.length > 0
          ? db
              .select()
              .from(quiz)
              .where(and(eq(quiz.tenantId, tenantId), inArray(quiz.leccionId, leccionIds)))
              .orderBy(desc(quiz.createdAt))
          : Promise.resolve([]),
        tareaIds.length > 0
          ? rol === 'ESTUDIANTE'
            ? db
                .select()
                .from(entrega)
                .where(
                  and(
                    eq(entrega.tenantId, tenantId),
                    inArray(entrega.tareaId, tareaIds),
                    eq(entrega.estudianteId, estId),
                  ),
                )
            : db
                .select()
                .from(entrega)
                .where(
                  and(eq(entrega.tenantId, tenantId), inArray(entrega.tareaId, tareaIds)),
                )
          : Promise.resolve([]),
        rol === 'ESTUDIANTE' && leccionIds.length > 0
          ? db
              .select()
              .from(progresoLeccion)
              .where(
                and(
                  eq(progresoLeccion.tenantId, tenantId),
                  eq(progresoLeccion.estudianteId, estId),
                  inArray(progresoLeccion.leccionId, leccionIds),
                ),
              )
          : Promise.resolve([]),
      ]);

      const visibleQuizzes =
        rol === 'ESTUDIANTE' ? quizzesList.filter((q) => q.publicada) : quizzesList;
      const quizIds = visibleQuizzes.map((q) => q.id);

      const intentosList =
        quizIds.length > 0
          ? rol === 'ESTUDIANTE'
            ? await db
                .select()
                .from(intentoQuiz)
                .where(
                  and(
                    eq(intentoQuiz.tenantId, tenantId),
                    inArray(intentoQuiz.quizId, quizIds),
                    eq(intentoQuiz.estudianteId, estId),
                  ),
                )
            : await db
                .select()
                .from(intentoQuiz)
                .where(
                  and(eq(intentoQuiz.tenantId, tenantId), inArray(intentoQuiz.quizId, quizIds)),
                )
          : [];

      const tareaToCurso = new Map(visibleTareas.map((t) => [t.id, t.cursoId]));

      // Entregas pendientes por curso (docente: enviadas sin calificar + intentos con writing pendiente; estudiante: tareas sin entregar)
      const entregasPendientesPorCurso: Record<string, number> = {};
      for (const id of cursoIds) {
        entregasPendientesPorCurso[id] = 0;
      }

      let entregasPendientesTotal = 0;
      if (rol === 'ESTUDIANTE') {
        const entregadasSet = new Set(entregasList.map((e) => e.tareaId));
        for (const t of visibleTareas) {
          if (!entregadasSet.has(t.id)) {
            entregasPendientesTotal += 1;
            entregasPendientesPorCurso[t.cursoId] =
              (entregasPendientesPorCurso[t.cursoId] || 0) + 1;
          }
        }
      } else {
        for (const e of entregasList) {
          if (e.estado === 'ENTREGADO' || e.estado === 'TARDIO') {
            entregasPendientesTotal += 1;
            const cId = tareaToCurso.get(e.tareaId);
            if (cId) {
              entregasPendientesPorCurso[cId] = (entregasPendientesPorCurso[cId] || 0) + 1;
            }
          }
        }
        for (const i of intentosList) {
          if (i.requiereRevisionDocente && i.estado === 'ENVIADO') {
            entregasPendientesTotal += 1;
            const foundQuiz = visibleQuizzes.find((q) => q.id === i.quizId);
            const cId = foundQuiz ? leccionToCurso.get(foundQuiz.leccionId) : null;
            if (cId) {
              entregasPendientesPorCurso[cId] = (entregasPendientesPorCurso[cId] || 0) + 1;
            }
          }
        }
      }

      // Promedio académico real
      const numericGrades = [
        ...entregasList.filter((e) => e.nota !== null).map((e) => Number(e.nota)),
        ...intentosList.filter((i) => i.nota !== null).map((i) => Number(i.nota)),
      ];
      const promedioAcademico =
        numericGrades.length > 0
          ? Math.round((numericGrades.reduce((a, b) => a + b, 0) / numericGrades.length) * 10) / 10
          : null;

      // Asistencia real
      const asistenciaSummary = calculateAttendanceSummary(asistenciasList);

      // Progreso promedio estudiante
      const publishedLeccionesIds = leccionesList.filter((l) => l.publicada).map((l) => l.id);
      const completedLeccionesIds = progresosList
        .filter((p) => p.estado === 'COMPLETADA')
        .map((p) => p.leccionId);
      const progresoPromedio =
        rol === 'ESTUDIANTE'
          ? calculateCourseProgress(publishedLeccionesIds, completedLeccionesIds)
          : 0;

      // Próximos eventos reales (tareas con venceEn + exámenes con cerrarEn/abrirEn)
      const proximosEventos: Array<{
        id: string;
        tipo: 'TAREA' | 'WRITING' | 'EXAMEN';
        titulo: string;
        cursoId: string;
        cursoNombre: string;
        fecha: string;
        leccionId: string | null;
      }> = [];

      for (const t of visibleTareas) {
        if (!t.venceEn) continue;
        proximosEventos.push({
          id: `tarea-${t.id}`,
          tipo: t.tipoTarea === 'WRITING' ? 'WRITING' : 'TAREA',
          titulo: t.titulo,
          cursoId: t.cursoId,
          cursoNombre: cursoNameMap.get(t.cursoId) || 'Curso',
          fecha: t.venceEn.toISOString(),
          leccionId: t.leccionId,
        });
      }

      for (const q of visibleQuizzes) {
        const fecha = q.cerrarEn || q.abrirEn;
        if (!fecha) continue;
        const cId = leccionToCurso.get(q.leccionId) || '';
        if (!cId) continue;
        proximosEventos.push({
          id: `quiz-${q.id}`,
          tipo: 'EXAMEN',
          titulo: q.titulo,
          cursoId: cId,
          cursoNombre: cursoNameMap.get(cId) || 'Curso',
          fecha: fecha.toISOString(),
          leccionId: q.leccionId,
        });
      }

      proximosEventos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

      // Estudiantes únicos matriculados
      const uniqueStudents = new Set(inscripcionesList.map((i) => i.estudianteId)).size;

      // Resumen de actividades y exámenes para las vistas globales
      const tareasResumen = visibleTareas.slice(0, 30).map((t) => {
        const myEntrega =
          rol === 'ESTUDIANTE' ? entregasList.find((e) => e.tareaId === t.id) || null : null;
        const entregadasCount =
          rol !== 'ESTUDIANTE' ? entregasList.filter((e) => e.tareaId === t.id).length : 0;
        const pendientesCount =
          rol !== 'ESTUDIANTE'
            ? entregasList.filter(
                (e) => e.tareaId === t.id && (e.estado === 'ENTREGADO' || e.estado === 'TARDIO'),
              ).length
            : 0;
        return {
          id: t.id,
          cursoId: t.cursoId,
          cursoNombre: cursoNameMap.get(t.cursoId) || 'Curso',
          leccionId: t.leccionId,
          titulo: t.titulo,
          tipoTarea: t.tipoTarea,
          nivelMcer: t.nivelMcer,
          notaMaxima: t.notaMaxima,
          venceEn: t.venceEn ? t.venceEn.toISOString() : null,
          publicada: t.publicada,
          miEstado: myEntrega?.estado || 'PENDIENTE',
          miNota: myEntrega?.nota ?? null,
          entregadasCount,
          pendientesCount,
        };
      });

      const examenesResumen = visibleQuizzes.slice(0, 30).map((q) => {
        const cId = leccionToCurso.get(q.leccionId) || '';
        const qIntentos = intentosList.filter((i) => i.quizId === q.id);
        return {
          id: q.id,
          cursoId: cId,
          cursoNombre: cursoNameMap.get(cId) || 'Curso',
          leccionId: q.leccionId,
          titulo: q.titulo,
          modo: q.modo,
          nivelMcer: q.nivelMcer,
          habilidadCambridge: q.habilidadCambridge,
          tiempoLimiteMin: q.tiempoLimiteMin,
          intentosMax: q.intentosMax,
          notaMinima: q.notaMinima,
          cerrarEn: q.cerrarEn ? q.cerrarEn.toISOString() : null,
          publicada: q.publicada,
          intentosCount: qIntentos.length,
          mejorNota:
            qIntentos.some((i) => i.nota !== null)
              ? Math.max(...qIntentos.filter((i) => i.nota !== null).map((i) => Number(i.nota)))
              : null,
        };
      });

      const anunciosRecientes = anunciosList.map((a) => ({
        ...a,
        cursoNombre: cursoNameMap.get(a.cursoId) || 'Curso',
      }));

      const destRol = rol === 'ESTUDIANTE' ? 'ESTUDIANTE' : 'DOCENTE';
      const destId = rol === 'ESTUDIANTE' ? estId : sub;
      const unreadNotifs = await db
        .select({ id: notificacionAula.id })
        .from(notificacionAula)
        .where(
          and(
            eq(notificacionAula.tenantId, tenantId),
            eq(notificacionAula.destinatarioRol, destRol),
            eq(notificacionAula.destinatarioId, destId),
            eq(notificacionAula.leida, false),
          ),
        );

      let canjesPendientes = 0;
      if (rol !== 'ESTUDIANTE') {
        const pendingCanjes = await db
          .select({ id: canjeTienda.id })
          .from(canjeTienda)
          .where(
            and(
              eq(canjeTienda.tenantId, tenantId),
              eq(canjeTienda.estado, 'PENDIENTE_APROBACION'),
            ),
          );
        canjesPendientes = pendingCanjes.length;
      }

      return res.json({
        badges: {
          entregasPendientes: entregasPendientesTotal,
          notificaciones: unreadNotifs.length,
          actividadesPendientes:
            rol === 'ESTUDIANTE' ? entregasPendientesTotal : 0,
          canjesPendientes,
        },
        kpis: {
          cursosActivos: visibleCursos.filter((c) => c.estado === 'PUBLICADO').length,
          totalCursos: visibleCursos.length,
          estudiantesMatriculados: uniqueStudents,
          entregasPendientes: entregasPendientesTotal,
          examenesActivos: visibleQuizzes.filter((q) => q.publicada).length,
          promedioAcademico,
          porcentajeAsistencia: asistenciaSummary.porcentaje,
          progresoPromedio,
          outboxPendientes: outboxPendList.length,
        },
        proximosEventos: proximosEventos.slice(0, 15),
        anunciosRecientes,
        tareasResumen,
        examenesResumen,
        entregasPendientesPorCurso,
      });
    } catch (error) {
      console.error('Error loading navegacion resumen:', error);
      return res.status(500).json({ error: 'No se pudo cargar el resumen del aula.' });
    }
  },
);
