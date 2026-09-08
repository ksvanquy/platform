import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Express, Request, Response } from 'express';
import { createV1AttemptsRouter } from './routes/v1-attempts.routes.js';
import { createV1InternalRouter } from './routes/v1-internal.routes.js';
import { AttemptExpirySweeperService } from '../domain/services/attempt-expiry-sweeper.service.js';
import { DrizzleAttemptRepository } from '../infrastructure/repositories/drizzle-attempt.repository.js';
import { DirectExamClientAdapter } from '../infrastructure/adapters/direct-exam-client.adapter.js';
import { loadEnvIfAvailable, isAttemptDbConfigured } from '../infrastructure/db/connection.js';
import { runAttemptMigrations } from '../infrastructure/db/migrate.js';
import { seedAttemptDatabase } from '../infrastructure/db/seed.js';

loadEnvIfAvailable();

export function createAttemptServer(): Express {
  const app: Express = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-role, x-internal-secret');
    res.header('Access-Control-Expose-Headers', 'X-Server-Time, X-Server-Timestamp');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // Server-Authoritative Clock Synchronization Middleware
  app.use((_req: Request, res: Response, next) => {
    const now = new Date();
    res.setHeader('X-Server-Time', now.toISOString());
    res.setHeader('X-Server-Timestamp', now.getTime().toString());
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'Attempt Service', timestamp: new Date() });
  });

  // Precision Time Sync endpoint (Cristian's algorithm)
  app.get('/v1/time', (_req: Request, res: Response) => {
    const now = new Date();
    res.status(200).json({
      success: true,
      serverTime: now.toISOString(),
      timestampMs: now.getTime(),
    });
  });

  const attemptRepo = new DrizzleAttemptRepository();
  const examClient = new DirectExamClientAdapter();
  const sweeperService = new AttemptExpirySweeperService(attemptRepo, examClient);

  app.use('/v1/attempts', createV1AttemptsRouter({ attemptRepo, examClient }));
  app.use('/v1/internal', createV1InternalRouter(sweeperService));

  return app;
}

const isDirectRun = Boolean(
  process.argv[1] &&
  path.normalize(fileURLToPath(import.meta.url)).toLowerCase() ===
    path.normalize(path.resolve(process.argv[1])).toLowerCase() &&
  process.env.NODE_ENV !== 'test' &&
  !process.env.VITEST
);

if (isDirectRun) {
  const PORT = Number(process.env.ATTEMPT_PORT) || 3006;
  const app = createAttemptServer();

  if (isAttemptDbConfigured()) {
    runAttemptMigrations()
      .then(() => seedAttemptDatabase())
      .then(() => {
        app.listen(PORT, () => {
          console.log(`🚀 Attempt Service running on http://localhost:${PORT}`);
        });
      })
      .catch((err) => {
        console.error('Failed to initialize Attempt Service:', err);
        process.exit(1);
      });
  } else {
    console.error('❌ Attempt Service failed to start: ATTEMPT_DATABASE_URL not configured.');
    process.exit(1);
  }
}
