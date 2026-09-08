import express, { Router } from 'express';
import { AssessmentController } from '../controllers/assessment.controller.js';
import { CreateAssessmentUseCase } from '../../application/use-cases/create-assessment.use-case.js';
import { GetAssessmentUseCase } from '../../application/use-cases/get-assessment.use-case.js';
import { UpdateAssessmentUseCase } from '../../application/use-cases/update-assessment.use-case.js';
import { UpdateBlueprintUseCase } from '../../application/use-cases/update-blueprint.use-case.js';
import { ListAssessmentsUseCase } from '../../application/use-cases/list-assessments.use-case.js';
import { ChangeAssessmentStatusUseCase } from '../../application/use-cases/change-assessment-status.use-case.js';
import { AssessmentRepositoryPort } from '../../domain/ports/assessment.repository.port.js';
import { DrizzleAssessmentRepository } from '../../infrastructure/repositories/drizzle-assessment.repository.js';
import { authContextMiddleware, requireAuthor } from '../middlewares/auth.middleware.js';

export function createAssessmentRouter(repository?: AssessmentRepositoryPort): Router {
  const router = express.Router();
  const repo = repository || new DrizzleAssessmentRepository();

  const createAssessmentUseCase = new CreateAssessmentUseCase(repo);
  const getAssessmentUseCase = new GetAssessmentUseCase(repo);
  const updateAssessmentUseCase = new UpdateAssessmentUseCase(repo);
  const updateBlueprintUseCase = new UpdateBlueprintUseCase(repo);
  const listAssessmentsUseCase = new ListAssessmentsUseCase(repo);
  const changeStatusUseCase = new ChangeAssessmentStatusUseCase(repo);

  const controller = new AssessmentController(
    createAssessmentUseCase,
    getAssessmentUseCase,
    updateAssessmentUseCase,
    updateBlueprintUseCase,
    listAssessmentsUseCase,
    changeStatusUseCase
  );

  router.use(authContextMiddleware);

  // Queries
  router.get('/', (req, res) => controller.listAssessments(req, res));
  router.get('/:idOrCode', (req, res) => controller.getAssessment(req, res));

  // Commands
  router.post('/', requireAuthor, (req, res) => controller.createAssessment(req, res));
  router.put('/:id', requireAuthor, (req, res) => controller.updateAssessment(req, res));
  router.patch('/:id/status', requireAuthor, (req, res) => controller.updateStatus(req, res));
  router.put('/:id/blueprint', requireAuthor, (req, res) => controller.updateBlueprint(req, res));
  router.post('/:id/blueprint/lock', requireAuthor, (req, res) => controller.lockBlueprint(req, res));

  return router;
}
