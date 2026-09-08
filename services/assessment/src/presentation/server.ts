import express, { Express, Request, Response } from 'express';
import { createAssessmentRouter } from './routes/v1-assessments.routes.js';
import { loadEnvIfAvailable, isAssessmentDbConfigured } from '../infrastructure/db/connection.js';
import { runAssessmentMigrations } from '../infrastructure/db/migrate.js';
import { seedAssessmentDatabase } from '../infrastructure/db/seed.js';

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

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const PORT = Number(process.env.ASSESSMENT_PORT) || 3004;
  const app = createAssessmentServer();

  if (isAssessmentDbConfigured()) {
    runAssessmentMigrations()
      .then(() => seedAssessmentDatabase())
      .then(() => {
        app.listen(PORT, () => {
          console.log(`🚀 Assessment Service running on http://localhost:${PORT}`);
        });
      })
      .catch((err) => {
        console.error('Failed to initialize Assessment Service:', err);
        process.exit(1);
      });
  } else {
    console.error('❌ Assessment Service failed to start: ASSESSMENT_DATABASE_URL not configured.');
    process.exit(1);
  }
}
