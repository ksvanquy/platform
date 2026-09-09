import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Express, Request, Response } from 'express';
import { createExamRouter } from './routes/v1-exams.routes.js';
import { loadEnvIfAvailable, isExamDbConfigured } from '../infrastructure/db/connection.js';

loadEnvIfAvailable();

export function createExamServer(): Express {
  const app: Express = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-role');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'Exam Service', timestamp: new Date() });
  });

  app.use('/v1/exams', createExamRouter());

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
  const PORT = Number(process.env.EXAM_PORT) || 3005;
  const app = createExamServer();

  if (isExamDbConfigured()) {
    app.listen(PORT, () => {
      console.log(`🚀 Exam Service running on http://localhost:${PORT}`);
    });
  } else {
    console.error('❌ Exam Service failed to start: EXAM_DATABASE_URL not configured.');
    process.exit(1);
  }
}
