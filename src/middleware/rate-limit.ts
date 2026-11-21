import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const existing = buckets.get(ip);

    if (!existing || now > existing.resetAt) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (existing.count >= maxRequests) {
      const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'Demasiadas solicitudes. Espera unos instantes antes de volver a intentar.',
      });
    }

    existing.count += 1;
    return next();
  };
}
