import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../../middleware/auth.ts';

const PRIVATE_STORAGE_ROOT = '/tmp/allen-aula-storage';

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.pptx',
  '.jpg',
  '.jpeg',
  '.png',
  '.mp4',
  '.mp3',
  '.txt',
]);

export function sanitizeExtension(filename: string): string {
  const ext = path.extname(filename || '').toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) ? ext : '.bin';
}

export function buildStorageKey(tenantId: string, cursoId: string, filename: string): string {
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9-]/g, '');
  const safeCurso = cursoId.replace(/[^a-zA-Z0-9-]/g, '');
  const ext = sanitizeExtension(filename);
  return `tenant/${safeTenant}/curso/${safeCurso}/${crypto.randomUUID()}${ext}`;
}

export function resolvePrivatePath(storageKey: string): string {
  const normalized = path.normalize(storageKey).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.resolve(PRIVATE_STORAGE_ROOT, normalized);
  if (!fullPath.startsWith(PRIVATE_STORAGE_ROOT)) {
    throw new Error('Ruta de archivo inválida.');
  }
  return fullPath;
}

export function savePrivateBuffer(storageKey: string, data: Buffer): number {
  const fullPath = resolvePrivatePath(storageKey);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, data);
  return data.byteLength;
}

export function readPrivateFile(storageKey: string): Buffer | null {
  const fullPath = resolvePrivatePath(storageKey);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

export function signUploadToken(payload: {
  tenantId: string;
  cursoId: string;
  storageKey: string;
  mimeType: string;
}): string {
  return jwt.sign({ ...payload, kind: 'upload' }, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: '5m',
  });
}

export function verifyUploadToken(token: string) {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as {
    kind: string;
    tenantId: string;
    cursoId: string;
    storageKey: string;
    mimeType: string;
  };
  if (decoded.kind !== 'upload') throw new Error('Token de subida inválido');
  return decoded;
}

export function signDownloadToken(payload: {
  tenantId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
}): string {
  return jwt.sign({ ...payload, kind: 'download' }, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: '10m',
  });
}

export function verifyDownloadToken(token: string) {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as {
    kind: string;
    tenantId: string;
    storageKey: string;
    filename: string;
    mimeType: string;
  };
  if (decoded.kind !== 'download') throw new Error('Token de descarga inválido');
  return decoded;
}

export function generateDemoFileBuffer(titulo: string, storageKey: string): Buffer {
  const content = [
    `ALLEN Aula — Material Académico Oficial`,
    `=======================================`,
    `Recurso: ${titulo}`,
    `Clave privada: ${storageKey}`,
    `Fecha de generación: ${new Date().toISOString()}`,
    ``,
    `Este archivo fue descargado mediante un enlace temporal firmado con vigencia de 10 minutos`,
    `(conforme a la política de protección de datos LOPDP Ecuador — sin URLs públicas permanentes).`,
  ].join('\n');
  return Buffer.from(content, 'utf8');
}
