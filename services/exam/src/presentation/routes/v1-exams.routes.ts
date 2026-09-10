import { Router } from 'express';
import { ExamController } from '../controllers/exam.controller.js';
import { extractAuth, requireAuthor } from '../middlewares/auth.middleware.js';
import { GenerateExamUseCase } from '../../application/use-cases/generate-exam.use-case.js';
import { GetExamUseCase } from '../../application/use-cases/get-exam.use-case.js';
import { ListExamsUseCase } from '../../application/use-cases/list-exams.use-case.js';
import { GetExamSnapshotUseCase } from '../../application/use-cases/get-exam-snapshot.use-case.js';
import { UpdateExamUseCase } from '../../application/use-cases/update-exam.use-case.js';
import { DeleteExamUseCase } from '../../application/use-cases/delete-exam.use-case.js';
import { GenerateVariantsUseCase } from '../../application/use-cases/generate-variants.use-case.js';
import { DrizzleExamRepository } from '../../infrastructure/repositories/drizzle-exam.repository.js';
import { DirectQuestionClientAdapter } from '../../infrastructure/adapters/direct-question-client.adapter.js';
import { DirectAssessmentClientAdapter } from '../../infrastructure/adapters/direct-assessment-client.adapter.js';
import type {
  ExamRepositoryPort,
  QuestionClientPort,
  AssessmentClientPort,
} from '../../domain/ports/exam.repository.port.js';

export interface ExamRouterDependencies {
  examRepo?: ExamRepositoryPort;
  questionClient?: QuestionClientPort;
  assessmentClient?: AssessmentClientPort;
}

export function createExamRouter(deps: ExamRouterDependencies = {}): Router {
  const router = Router();

  const examRepo = deps.examRepo || new DrizzleExamRepository();
  const questionClient = deps.questionClient || new DirectQuestionClientAdapter();
  const assessmentClient = deps.assessmentClient || new DirectAssessmentClientAdapter();

  const generateExamUseCase = new GenerateExamUseCase(examRepo, questionClient, assessmentClient);
  const getExamUseCase = new GetExamUseCase(examRepo, assessmentClient);
  const listExamsUseCase = new ListExamsUseCase(examRepo, assessmentClient);
  const getExamSnapshotUseCase = new GetExamSnapshotUseCase(examRepo);
  const updateExamUseCase = new UpdateExamUseCase(examRepo);
  const deleteExamUseCase = new DeleteExamUseCase(examRepo);
  const generateVariantsUseCase = new GenerateVariantsUseCase(examRepo, questionClient, assessmentClient);

  const controller = new ExamController(
    generateExamUseCase,
    getExamUseCase,
    listExamsUseCase,
    getExamSnapshotUseCase,
    updateExamUseCase,
    deleteExamUseCase,
    generateVariantsUseCase
  );

  // Manifest endpoint for candidate test runner (Zero answer leaks)
  router.get('/:idOrCode/variants/:variantCode/manifest', controller.getSanitizedManifest);
  router.get('/:idOrCode/manifest', (req: any, res: any) => {
    req.params.variantCode = 'DEFAULT';
    controller.getSanitizedManifest(req, res);
  });

  // Frozen snapshot endpoint for internal grading engine
  router.get('/:idOrCode/variants/:variantCode/frozen', extractAuth, requireAuthor, controller.getFrozenSnapshot);

  // Exam CRUD & Variant generation endpoints
  router.get('/', controller.listExams);
  router.post('/', extractAuth, requireAuthor, controller.generateExam);
  router.get('/:idOrCode', controller.getExam);
  router.put('/:id', extractAuth, requireAuthor, controller.updateExam);
  router.patch('/:id/status', extractAuth, requireAuthor, controller.updateStatus);
  router.post('/:id/publish', extractAuth, requireAuthor, controller.publishExam);
  router.post('/:id/unpublish', extractAuth, requireAuthor, controller.unpublishExam);
  router.delete('/:id', extractAuth, requireAuthor, controller.deleteExam);
  router.post('/:idOrCode/generate-variants', extractAuth, requireAuthor, controller.generateVariants);

  return router;
}
