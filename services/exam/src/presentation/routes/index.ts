import { Router } from 'express';
import { createExamRouter, ExamRouterDependencies } from './v1-exams.routes.js';

export function createApiRouter(deps: ExamRouterDependencies = {}): Router {
  const router = Router();
  router.use('/v1/exams', createExamRouter(deps));
  return router;
}

export * from './v1-exams.routes.js';
