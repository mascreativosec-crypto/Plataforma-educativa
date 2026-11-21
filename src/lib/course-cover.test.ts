import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGoogleDriveImageId,
  resolveCourseCoverUrl,
  validateCourseDeletionReason,
} from './course-cover';

test('extractGoogleDriveImageId soporta enlaces /file/d/, ?id= y lh3', () => {
  assert.equal(
    extractGoogleDriveImageId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing'),
    '1AbCdEfGhIjKlMnOpQrStUvWxYz',
  );
  assert.equal(
    extractGoogleDriveImageId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz'),
    '1AbCdEfGhIjKlMnOpQrStUvWxYz',
  );
  assert.equal(
    extractGoogleDriveImageId('https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz'),
    '1AbCdEfGhIjKlMnOpQrStUvWxYz',
  );
  assert.equal(extractGoogleDriveImageId('https://example.com/photo.jpg'), null);
});

test('resolveCourseCoverUrl transforma enlaces de Google Drive y bloquea esquemas inseguros', () => {
  const driveRes = resolveCourseCoverUrl(
    'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing',
  );
  assert.equal(driveRes.valid, true);
  assert.equal(driveRes.source, 'drive');
  assert.equal(
    driveRes.previewUrl,
    'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz&sz=w1000',
  );

  const safeData = resolveCourseCoverUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  assert.equal(safeData.valid, true);
  assert.equal(safeData.source, 'upload');

  const svgXss = resolveCourseCoverUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
  assert.equal(svgXss.valid, false);

  const jsUrl = resolveCourseCoverUrl('javascript:alert(1)');
  assert.equal(jsUrl.valid, false);
});

test('validateCourseDeletionReason exige motivo descriptivo de al menos 4 caracteres', () => {
  assert.equal(validateCourseDeletionReason('').valid, false);
  assert.equal(validateCourseDeletionReason('abc').valid, false);
  assert.equal(validateCourseDeletionReason('El curso finalizó').valid, true);
});
