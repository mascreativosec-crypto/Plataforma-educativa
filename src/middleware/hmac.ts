import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth.ts';
import { verifyHmacSignature } from '../server/services/grading.ts';

export const requireAllenHmac = (req: AuthRequest, res: Response, next: NextFunction) => {
  const secret = process.env.ALLEN_HMAC_SECRET || 'allen-dev-hmac-secret-2026';
  const signature = req.header('X-Aula-Signature');
  const timestamp = req.header('X-Aula-Timestamp');
  const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body || {}), 'utf8');

  const check = verifyHmacSignature(rawBody, signature, timestamp, secret);
  if (!check.valid) {
    return res.status(401).json({ error: check.reason || 'Firma HMAC inválida.' });
  }
  return next();
};
