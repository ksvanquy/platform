import express, { Router } from 'express';
import { QuestionController } from '../controllers/question.controller.js';
import { CreateQuestionUseCase } from '../../application/use-cases/create-question.use-case.js';
import { GetQuestionUseCase } from '../../application/use-cases/get-question.use-case.js';
import { UpdateQuestionUseCase } from '../../application/use-cases/update-question.use-case.js';
import { ListQuestionsUseCase } from '../../application/use-cases/list-questions.use-case.js';
import { DeleteQuestionUseCase } from '../../application/use-cases/delete-question.use-case.js';
import { ManageRevisionsUseCase } from '../../application/use-cases/add-revision.use-case.js';
import { QuestionRepositoryPort } from '../../domain/ports/question.repository.port.js';
import { DrizzleQuestionRepository } from '../../infrastructure/repositories/drizzle-question.repository.js';
import { authContextMiddleware, requireAuthor } from '../middlewares/auth.middleware.js';

export function createQuestionRouter(repository?: QuestionRepositoryPort): Router {
  const router = express.Router();
  const repo = repository || new DrizzleQuestionRepository();

  const createQuestionUseCase = new CreateQuestionUseCase(repo);
  const getQuestionUseCase = new GetQuestionUseCase(repo);
  const updateQuestionUseCase = new UpdateQuestionUseCase(repo);
  const listQuestionsUseCase = new ListQuestionsUseCase(repo);
  const deleteQuestionUseCase = new DeleteQuestionUseCase(repo);
  const manageRevisionsUseCase = new ManageRevisionsUseCase(repo);

  const controller = new QuestionController(
    createQuestionUseCase,
    getQuestionUseCase,
    updateQuestionUseCase,
    listQuestionsUseCase,
    deleteQuestionUseCase,
    manageRevisionsUseCase
  );

  router.use(authContextMiddleware);

  // Question querying (available for authenticated users / candidates / instructors)
  router.get('/', (req, res) => controller.listQuestions(req, res));
  router.get('/:idOrCode', (req, res) => controller.getQuestion(req, res));
  router.get('/:id/revisions', (req, res) => controller.listRevisions(req, res));
  router.get('/:id/revisions/:revisionNumber', (req, res) => controller.getRevision(req, res));

  // Question authoring (requires Author or Admin role)
  router.post('/', requireAuthor, (req, res) => controller.createQuestion(req, res));
  router.put('/:id', requireAuthor, (req, res) => controller.updateQuestion(req, res));
  router.delete('/:id', requireAuthor, (req, res) => controller.deleteQuestion(req, res));
  router.post('/:id/revisions', requireAuthor, (req, res) => controller.addRevision(req, res));

  return router;
}
