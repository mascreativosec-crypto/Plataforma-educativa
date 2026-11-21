import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCourseProgress, gradeQuizAttempt } from './grading';
import {
  countBlanksInTemplate,
  deterministicShuffle,
  evaluateIntegrityAction,
  isQuestionAnswered,
} from '../../lib/exam-questions';

test('gradeQuizAttempt scores mixed classic question types accurately', () => {
  const result = gradeQuizAttempt(
    [
      { id: 'q1', tipo: 'OPCION_MULTIPLE', respuestaCorrecta: 'am', puntos: 2 },
      { id: 'q2', tipo: 'VERDADERO_FALSO', respuestaCorrecta: true, puntos: 1 },
      { id: 'q3', tipo: 'RESPUESTA_CORTA', respuestaCorrecta: 'Ecuador|República del Ecuador', puntos: 2 },
    ],
    {
      q1: 'am',
      q2: true,
      q3: '  ecuador ',
    },
    70,
  );

  assert.equal(result.puntosObtenidos, 5);
  assert.equal(result.puntosTotales, 5);
  assert.equal(result.nota, 100);
  assert.equal(result.aprobado, true);
  assert.equal(result.requiereRevisionDocente, false);
});

test('gradeQuizAttempt auto-grades all 8 interactive English question formats', () => {
  const result = gradeQuizAttempt(
    [
      { id: 'q1', tipo: 'OPCION_MULTIPLE', respuestaCorrecta: 'goes', puntos: 1 },
      { id: 'q2', tipo: 'SELECCION_MULTIPLE', respuestaCorrecta: ['went', 'saw'], puntos: 2 },
      {
        id: 'q3',
        tipo: 'UNIR_PAREJAS',
        respuestaCorrecta: { p1: 'manzana', p2: 'libro' },
        puntos: 2,
      },
      {
        id: 'q4',
        tipo: 'COMPLETAR_ESPACIOS',
        respuestaCorrecta: ['am', 'studying|learning'],
        puntos: 2,
      },
      {
        id: 'q5',
        tipo: 'ORDENAR_PALABRAS',
        respuestaCorrecta: ['She', 'speaks', 'English', 'well'],
        puntos: 2,
      },
      {
        id: 'q6',
        tipo: 'ORDENAR_ORACIONES',
        respuestaCorrecta: ['First, wake up.', 'Then, have breakfast.', 'Finally, go to class.'],
        puntos: 2,
      },
      {
        id: 'q7',
        tipo: 'RELACIONAR_COLUMNAS',
        respuestaCorrecta: { c1: 'Past tense', c2: 'Future tense' },
        puntos: 2,
      },
      {
        id: 'q8',
        tipo: 'COMPLETAR_OPCIONES',
        respuestaCorrecta: ['plays', 'every'],
        puntos: 2,
      },
    ],
    {
      q1: 'goes',
      q2: ['saw', 'went'],
      q3: { p1: 'manzana', p2: 'libro' },
      q4: ['am', 'learning'],
      q5: ['She', 'speaks', 'English', 'well'],
      q6: ['First, wake up.', 'Then, have breakfast.', 'Finally, go to class.'],
      q7: { c1: 'Past tense', c2: 'Future tense' },
      q8: ['plays', 'every'],
    },
    70,
  );

  assert.equal(result.puntosObtenidos, 15);
  assert.equal(result.puntosTotales, 15);
  assert.equal(result.nota, 100);
  assert.equal(result.aprobado, true);
  assert.equal(result.detalle.every((d) => d.correcta), true);
});

test('gradeQuizAttempt awards partial credit on matching and penalizes extra wrong checkboxes', () => {
  const result = gradeQuizAttempt(
    [
      { id: 'q1', tipo: 'SELECCION_MULTIPLE', respuestaCorrecta: ['A', 'B'], puntos: 2 },
      { id: 'q2', tipo: 'UNIR_PAREJAS', respuestaCorrecta: { p1: 'uno', p2: 'dos' }, puntos: 2 },
      { id: 'q3', tipo: 'COMPLETAR_ESPACIOS', respuestaCorrecta: ['go', 'home'], puntos: 2 },
    ],
    {
      q1: ['A', 'B', 'C'], // 2 hits - 1 wrong = 1/2 => 1 pt
      q2: { p1: 'uno', p2: 'mal' }, // 1/2 => 1 pt
      q3: ['go', 'school'], // 1/2 => 1 pt
    },
    70,
  );

  assert.equal(result.puntosObtenidos, 3);
  assert.equal(result.puntosTotales, 6);
  assert.equal(result.nota, 50);
  assert.equal(result.aprobado, false);
});

test('gradeQuizAttempt marks WRITING questions for teacher review until manually graded', () => {
  const pending = gradeQuizAttempt(
    [
      { id: 'q1', tipo: 'OPCION_MULTIPLE', respuestaCorrecta: 'is', puntos: 2 },
      { id: 'q2', tipo: 'WRITING', respuestaCorrecta: '', puntos: 8 },
    ],
    { q1: 'is', q2: 'My favorite city is Guayaquil because of its riverfront.' },
    70,
  );
  assert.equal(pending.requiereRevisionDocente, true);
  assert.equal(pending.aprobado, false);

  const graded = gradeQuizAttempt(
    [
      { id: 'q1', tipo: 'OPCION_MULTIPLE', respuestaCorrecta: 'is', puntos: 2 },
      { id: 'q2', tipo: 'WRITING', respuestaCorrecta: '', puntos: 8 },
    ],
    { q1: 'is', q2: 'My favorite city is Guayaquil because of its riverfront.' },
    70,
    { q2: 7 },
  );
  assert.equal(graded.requiereRevisionDocente, false);
  assert.equal(graded.nota, 90);
  assert.equal(graded.aprobado, true);
});

test('evaluateIntegrityAction never auto-voids on a single focus loss or first tab switch', () => {
  const focusLoss = evaluateIntegrityAction({
    politicaSalida: 'ANULAR_CON_CERO',
    maxCambiosPestana: 3,
    eventType: 'PERDIDA_FOCO',
    currentTabSwitches: 0,
  });
  assert.equal(focusLoss.shouldVoidWithZero, false);
  assert.equal(focusLoss.nextTabSwitches, 0);

  const firstSwitch = evaluateIntegrityAction({
    politicaSalida: 'ANULAR_CON_CERO',
    maxCambiosPestana: 3,
    eventType: 'CAMBIO_PESTANA',
    currentTabSwitches: 0,
  });
  assert.equal(firstSwitch.shouldVoidWithZero, false);
  assert.equal(firstSwitch.shouldWarn, true);
  assert.equal(firstSwitch.nextTabSwitches, 1);

  const fourthSwitch = evaluateIntegrityAction({
    politicaSalida: 'ANULAR_CON_CERO',
    maxCambiosPestana: 3,
    eventType: 'CAMBIO_PESTANA',
    currentTabSwitches: 3,
  });
  assert.equal(fourthSwitch.shouldVoidWithZero, true);
  assert.ok(fourthSwitch.voidReason);

  const confirmedExit = evaluateIntegrityAction({
    politicaSalida: 'ANULAR_CON_CERO',
    maxCambiosPestana: 3,
    eventType: 'SALIDA_CONFIRMADA',
    currentTabSwitches: 0,
    confirmedExit: true,
  });
  assert.equal(confirmedExit.shouldVoidWithZero, true);

  const soloRegistroExit = evaluateIntegrityAction({
    politicaSalida: 'SOLO_REGISTRO',
    maxCambiosPestana: 3,
    eventType: 'SALIDA_CONFIRMADA',
    currentTabSwitches: 5,
    confirmedExit: true,
  });
  assert.equal(soloRegistroExit.shouldVoidWithZero, false);
});

test('exam question helpers detect blanks, shuffle deterministically, and validate completion', () => {
  assert.equal(countBlanksInTemplate('She ___ to school and ___ English.'), 2);
  const s1 = deterministicShuffle(['A', 'B', 'C', 'D'], 'q-seed-1');
  const s2 = deterministicShuffle(['A', 'B', 'C', 'D'], 'q-seed-1');
  assert.deepEqual(s1, s2);
  assert.equal(s1.length, 4);

  assert.equal(
    isQuestionAnswered(
      { tipo: 'COMPLETAR_ESPACIOS', enunciado: 'I ___ happy and ___ ready.', opciones: null },
      ['am', ''],
    ),
    false,
  );
  assert.equal(
    isQuestionAnswered(
      { tipo: 'COMPLETAR_ESPACIOS', enunciado: 'I ___ happy and ___ ready.', opciones: null },
      ['am', 'feel'],
    ),
    true,
  );
});

test('calculateCourseProgress handles bounds and rounding', () => {
  assert.equal(calculateCourseProgress([], []), 0);
  assert.equal(calculateCourseProgress(['l1', 'l2', 'l3', 'l4'], ['l1']), 25);
  assert.equal(calculateCourseProgress(['l1', 'l2', 'l3'], ['l1', 'l3']), 67);
  assert.equal(calculateCourseProgress(['l1', 'l2'], ['l1', 'l2', 'extra']), 100);
});
