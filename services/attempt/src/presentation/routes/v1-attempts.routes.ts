import { Router } from 'express';
import { AttemptController } from '../controllers/attempt.controller.js';
import { extractAuth } from '../middlewares/auth.middleware.js';
import { CreateOrRecoverAttemptUseCase } from '../../application/use-cases/create-or-recover-attempt.use-case.js';
import { StartAttemptUseCase } from '../../application/use-cases/start-attempt.use-case.js';
import { SubmitAttemptUseCase } from '../../application/use-cases/submit-attempt.use-case.js';
import { GetAttemptUseCase } from '../../application/use-cases/get-attempt.use-case.js';
import { ListAttemptsUseCase } from '../../application/use-cases/list-attempts.use-case.js';
import { DrizzleAttemptRepository } from '../../infrastructure/repositories/drizzle-attempt.repository.js';
import { DirectExamClientAdapter } from '../../infrastructure/adapters/direct-exam-client.adapter.js';
import type {
  AttemptRepositoryPort,
  ExamClientPort,
} from '../../domain/ports/attempt.repository.port.js';

export interface AttemptRouterDependencies {
  attemptRepo?: AttemptRepositoryPort;
  examClient?: ExamClientPort;
}

export function createV1AttemptsRouter(deps: AttemptRouterDependencies = {}): Router {
  const router = Router();

  const attemptRepo = deps.attemptRepo || new DrizzleAttemptRepository();
  const examClient = deps.examClient || new DirectExamClientAdapter();

  const createOrRecoverAttemptUseCase = new CreateOrRecoverAttemptUseCase(attemptRepo, examClient);
  const startAttemptUseCase = new StartAttemptUseCase(attemptRepo, examClient);
  const submitAttemptUseCase = new SubmitAttemptUseCase(attemptRepo, examClient);
  const getAttemptUseCase = new GetAttemptUseCase(attemptRepo, examClient);
  const listAttemptsUseCase = new ListAttemptsUseCase(attemptRepo);

  const controller = new AttemptController(
    createOrRecoverAttemptUseCase,
    startAttemptUseCase,
    submitAttemptUseCase,
    getAttemptUseCase,
    listAttemptsUseCase
  );

  // Time Synchronization route (Cristian's algorithm target)
  router.get('/time', controller.getServerTime);

  // Attempt Lifecycle & Delivery Routes
  router.get('/', extractAuth, controller.listAttempts);
  router.post('/', extractAuth, controller.createOrRecover);
  router.post('/start', extractAuth, controller.createOrRecover);

  router.get('/:id', extractAuth, controller.getAttempt);
  router.post('/:id/start', extractAuth, controller.start);

  // Final Submission & Immediate Evaluation
  router.post('/:id/submit', extractAuth, controller.submit);
  router.get('/:id/result', extractAuth, controller.getResult);

  return router;
}
