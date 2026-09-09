import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Express, Request, Response } from 'express';
import { createAssessmentRouter } from './routes/v1-assessments.routes.js';
import { loadEnvIfAvailable, isAssessmentDbConfigured } from '../infrastructure/db/connection.js';

loadEnvIfAvailable();

export function createAssessmentServer(): Express {
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
    res.status(200).json({ status: 'ok', service: 'Assessment Service', timestamp: new Date() });
  });

  app.use('/v1/assessments', createAssessmentRouter());

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
  const PORT = Number(process.env.ASSESSMENT_PORT) || 3004;
  const app = createAssessmentServer();

  if (isAssessmentDbConfigured()) {
    app.listen(PORT, () => {
      console.log(`🚀 Assessment Service running on http://localhost:${PORT}`);
    });
  } else {
    console.error('❌ Assessment Service failed to start: ASSESSMENT_DATABASE_URL not configured.');
    process.exit(1);
  }
}
