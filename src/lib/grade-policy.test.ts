import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateGradeEditPermission,
  validateModificationReason,
} from './grade-policy';
import { isSafeHttpUrl, parseQuestionMediaUrl } from './media-embed';
import { CREATOR_QUESTION_TYPES_META, QUESTION_TYPE_LABELS } from './exam-questions';

test('Protocolo 48h: primera calificación permitida sin motivo obligatorio para PROFESOR y ADMIN', () => {
  const resProf = evaluateGradeEditPermission({
    rol: 'PROFESOR',
    existingNota: null,
    notaAsentadaEn: null,
  });
  assert.equal(resProf.isInitialGrade, true);
  assert.equal(resProf.canEdit, true);
  assert.equal(resProf.requiresReason, false);
  assert.equal(resProf.lockedAfter48h, false);

  const resEst = evaluateGradeEditPermission({
    rol: 'ESTUDIANTE',
    existingNota: null,
    notaAsentadaEn: null,
  });
  assert.equal(resEst.canEdit, false);
});

test('Protocolo 48h: modificación dentro de 48h permitida para PROFESOR pero requiere motivo', () => {
  const now = new Date('2026-05-10T12:00:00Z');
  const settled12hAgo = new Date('2026-05-10T00:00:00Z');

  const res = evaluateGradeEditPermission({
    rol: 'PROFESOR',
    existingNota: 85,
    notaAsentadaEn: settled12hAgo,
    now,
  });

  assert.equal(res.isInitialGrade, false);
  assert.equal(res.canEdit, true);
  assert.equal(res.requiresReason, true);
  assert.equal(res.lockedAfter48h, false);
  assert.equal(res.hoursRemaining, 36);
});

test('Protocolo 48h: pasadas 48h se bloquea para PROFESOR y solo ADMIN puede modificar con motivo', () => {
  const now = new Date('2026-05-12T13:00:00Z');
  const settled50hAgo = new Date('2026-05-10T11:00:00Z');

  const resProf = evaluateGradeEditPermission({
    rol: 'PROFESOR',
    existingNota: 80,
    notaAsentadaEn: settled50hAgo,
    now,
  });
  assert.equal(resProf.canEdit, false);
  assert.equal(resProf.lockedAfter48h, true);
  assert.equal(resProf.hoursRemaining, 0);

  const resAdmin = evaluateGradeEditPermission({
    rol: 'ADMIN',
    existingNota: 80,
    notaAsentadaEn: settled50hAgo,
    now,
  });
  assert.equal(resAdmin.canEdit, true);
  assert.equal(resAdmin.requiresReason, true);
  assert.equal(resAdmin.lockedAfter48h, true);
  assert.equal(resAdmin.isAdminOverride, true);
});

test('validateModificationReason exige mínimo 5 caracteres', () => {
  assert.equal(validateModificationReason('').valid, false);
  assert.equal(validateModificationReason('   ok ').valid, false);
  const ok = validateModificationReason('  Recalificación por revisión de rúbrica  ');
  assert.equal(ok.valid, true);
  assert.equal(ok.cleaned, 'Recalificación por revisión de rúbrica');
});

test('parseQuestionMediaUrl sanitiza protocolos peligrosos y resuelve YouTube, Vimeo, Drive y MP3/MP4', () => {
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>1</script>'), false);
  assert.equal(parseQuestionMediaUrl('javascript:alert(1)', 'video').valid, false);

  const yt = parseQuestionMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'video');
  assert.equal(yt.valid, true);
  assert.equal(yt.renderMode, 'iframe');
  assert.equal(yt.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');

  const driveAudio = parseQuestionMediaUrl(
    'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing',
    'audio',
  );
  assert.equal(driveAudio.valid, true);
  assert.equal(driveAudio.renderMode, 'iframe');
  assert.equal(driveAudio.src, 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview');

  const mp4 = parseQuestionMediaUrl('https://cdn.example.com/lesson1.mp4', 'video');
  assert.equal(mp4.valid, true);
  assert.equal(mp4.renderMode, 'video');

  const mp3 = parseQuestionMediaUrl('https://cdn.example.com/audio1.mp3', 'audio');
  assert.equal(mp3.valid, true);
  assert.equal(mp3.renderMode, 'audio');
});

test('Catálogo de creador de preguntas consolida Unir parejas y usa True / False', () => {
  const tipos = CREATOR_QUESTION_TYPES_META.map((t) => t.tipo);
  assert.equal(tipos.includes('UNIR_PAREJAS'), true);
  assert.equal(tipos.includes('RELACIONAR_COLUMNAS'), false);
  assert.equal(QUESTION_TYPE_LABELS.VERDADERO_FALSO, 'True / False');
});
