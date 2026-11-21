import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { ViteDevServer } from 'vite';
import type { AuthRequest } from './src/middleware/auth.ts';
import { createRateLimiter } from './src/middleware/rate-limit.ts';
import { adminRouter } from './src/server/routes/admin.ts';
import { authRouter } from './src/server/routes/auth.ts';
import { comunicacionRouter } from './src/server/routes/comunicacion.ts';
import { contenidoRouter } from './src/server/routes/contenido.ts';
import { cursosRouter } from './src/server/routes/cursos.ts';
import { evaluacionesRouter } from './src/server/routes/evaluaciones.ts';
import { gamificacionRouter } from './src/server/routes/gamificacion.ts';
import { healthRouter } from './src/server/routes/health.ts';
import { iaRouter } from './src/server/routes/ia.ts';
import { navegacionRouter } from './src/server/routes/navegacion.ts';

function resolvePort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const cliPort = Number(process.argv[portArgIndex + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) return cliPort;
  }
  if (process.env.DEFAULT_APP_PORT) {
    const defaultPort = Number(process.env.DEFAULT_APP_PORT);
    if (Number.isFinite(defaultPort) && defaultPort > 0) return defaultPort;
  }
  return Number(process.env.PORT) || 3000;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = resolvePort();
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  // Seguridad HTTP (compatible con iframe de AI Studio y popups OAuth)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );

  // CORS con lista blanca en producción
  const allowedOrigins = (process.env.CORS_ORIGENES || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (!isProd || allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Aula-Signature, X-Aula-Timestamp',
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(cookieParser());
  app.use(
    express.json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        (req as AuthRequest).rawBody = buf;
      },
    }),
  );

  // Rate limit global para /api (120 req/min por IP)
  app.use('/api', createRateLimiter(120, 60 * 1000));

  // API routers
  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', adminRouter);
  app.use('/api', cursosRouter);
  app.use('/api', contenidoRouter);
  app.use('/api', evaluacionesRouter);
  app.use('/api', comunicacionRouter);
  app.use('/api', iaRouter);
  app.use('/api', navegacionRouter);
  app.use('/api', gamificacionRouter);

  // Fallback 404 para rutas /api no existentes
  app.use('/api', (_req, res) => {
    return res.status(404).json({ error: 'Recurso de API no encontrado.' });
  });

  // Inicialización concurrente de Vite en desarrollo para abrir el puerto 3000 de inmediato
  let viteServer: ViteDevServer | null = null;
  let viteReadyPromise: Promise<ViteDevServer> | null = null;

  if (!isProd) {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    viteReadyPromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          allowedHosts: true,
          // Adjuntar HMR al httpServer evita colisiones en el puerto 24678
          hmr: disableHmr ? false : { server: httpServer },
          watch: disableHmr ? null : {},
        },
        appType: 'spa',
      }).then((vite) => {
        viteServer = vite;
        return vite;
      }),
    );

    viteReadyPromise.catch((err) => {
      console.error('Vite middleware initialization failed:', err);
    });

    app.use(async (req, res, next) => {
      try {
        const vite = viteServer || (await viteReadyPromise!);
        return vite.middlewares(req, res, next);
      } catch (err) {
        return next(err);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Filtro global de excepciones (no filtra stack al cliente)
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const tenantId = (req as AuthRequest).aulaUser?.tenantId || 'anonymous';
    console.error(`[${requestId}] [tenant:${tenantId}] Unhandled server error:`, err);
    return res.status(500).json({
      error: 'Ocurrió un error interno al procesar la solicitud.',
      requestId,
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ALLEN Aula server listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async () => {
    httpServer.close();
    if (viteServer) {
      await viteServer.close().catch(() => {});
    }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
