import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    return res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check DB error:', error);
    return res.status(503).json({ status: 'error', db: 'unavailable' });
  }
});
