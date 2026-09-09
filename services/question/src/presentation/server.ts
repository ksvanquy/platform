import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Express, Request, Response } from 'express';
import { createQuestionRouter } from './routes/v1-questions.routes.js';
import { loadEnvIfAvailable, isQuestionDbConfigured } from '../infrastructure/db/connection.js';

loadEnvIfAvailable();

export function createQuestionServer(): Express {
  const app: Express = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-role');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'Question Service', timestamp: new Date() });
  });

  app.use('/v1/questions', createQuestionRouter());

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
  const PORT = Number(process.env.QUESTION_PORT) || 3003;
  const app = createQuestionServer();

  if (isQuestionDbConfigured()) {
    app.listen(PORT, () => {
      console.log(`🚀 Question Service running on http://localhost:${PORT}`);
    });
  } else {
    console.error('❌ Question Service failed to start: QUESTION_DATABASE_URL not configured.');
    process.exit(1);
  }
}
