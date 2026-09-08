import { Request, Response } from 'express';
import { CreateQuestionUseCase } from '../../application/use-cases/create-question.use-case.js';
import { GetQuestionUseCase } from '../../application/use-cases/get-question.use-case.js';
import { UpdateQuestionUseCase } from '../../application/use-cases/update-question.use-case.js';
import { ListQuestionsUseCase } from '../../application/use-cases/list-questions.use-case.js';
import { DeleteQuestionUseCase } from '../../application/use-cases/delete-question.use-case.js';
import { ManageRevisionsUseCase } from '../../application/use-cases/add-revision.use-case.js';
import {
  QuestionNotFoundError,
  QuestionCodeAlreadyExistsError,
  InvalidQuestionDataError,
  UnauthorizedQuestionAccessError,
  QuestionRevisionNotFoundError,
} from '../../domain/errors/question-domain.errors.js';

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

export class QuestionController {
  constructor(
    private readonly createQuestionUseCase: CreateQuestionUseCase,
    private readonly getQuestionUseCase: GetQuestionUseCase,
    private readonly updateQuestionUseCase: UpdateQuestionUseCase,
    private readonly listQuestionsUseCase: ListQuestionsUseCase,
    private readonly deleteQuestionUseCase: DeleteQuestionUseCase,
    private readonly manageRevisionsUseCase: ManageRevisionsUseCase
  ) {}

  async listQuestions(req: Request, res: Response): Promise<void> {
    try {
      const {
        topicNodeId,
        gradeNodeId,
        difficulty,
        type,
        status,
        search,
        ownerId,
        limit,
        offset,
      } = req.query;

      const result = await this.listQuestionsUseCase.execute({
        topicNodeId: topicNodeId ? String(topicNodeId) : undefined,
        gradeNodeId: gradeNodeId ? String(gradeNodeId) : undefined,
        difficulty: difficulty ? (String(difficulty) as any) : undefined,
        type: type ? (String(type) as any) : undefined,
        status: status ? (String(status) as any) : undefined,
        search: search ? String(search) : undefined,
        ownerId: ownerId ? String(ownerId) : undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.items,
        meta: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getQuestion(req: Request, res: Response): Promise<void> {
    try {
      const idOrCode = getParam(req.params.idOrCode);
      const question = idOrCode.startsWith('q_')
        ? await this.getQuestionUseCase.executeById(idOrCode)
        : await this.getQuestionUseCase.executeByCode(idOrCode);

      res.status(200).json({ success: true, data: question });
    } catch (err: any) {
      if (err instanceof QuestionNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async createQuestion(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = req.principal?.id || 'usr_anonymous_instructor';
      const question = await this.createQuestionUseCase.execute(req.body, ownerId);
      res.status(201).json({ success: true, data: question });
    } catch (err: any) {
      if (err instanceof QuestionCodeAlreadyExistsError) {
        res.status(409).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof InvalidQuestionDataError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateQuestion(req: Request, res: Response): Promise<void> {
    try {
      const id = getParam(req.params.id);
      const userId = req.principal?.id || 'usr_anonymous';
      const userRole = req.principal?.roles?.includes('ADMIN') ? 'ADMIN' : 'INSTRUCTOR';

      const updated = await this.updateQuestionUseCase.execute(id, req.body, userId, userRole);
      res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      if (err instanceof QuestionNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof UnauthorizedQuestionAccessError) {
        res.status(403).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof InvalidQuestionDataError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async deleteQuestion(req: Request, res: Response): Promise<void> {
    try {
      const id = getParam(req.params.id);
      const userId = req.principal?.id || 'usr_anonymous';
      const userRole = req.principal?.roles?.includes('ADMIN') ? 'ADMIN' : 'INSTRUCTOR';

      await this.deleteQuestionUseCase.execute(id, userId, userRole);
      res.status(200).json({ success: true, message: 'Question deleted successfully.' });
    } catch (err: any) {
      if (err instanceof QuestionNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof UnauthorizedQuestionAccessError) {
        res.status(403).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async listRevisions(req: Request, res: Response): Promise<void> {
    try {
      const id = getParam(req.params.id);
      const revisions = await this.manageRevisionsUseCase.listRevisions(id);
      res.status(200).json({ success: true, data: revisions });
    } catch (err: any) {
      if (err instanceof QuestionNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getRevision(req: Request, res: Response): Promise<void> {
    try {
      const id = getParam(req.params.id);
      const revisionNumber = getParam(req.params.revisionNumber);
      const revision = await this.manageRevisionsUseCase.getRevision(id, Number(revisionNumber));
      res.status(200).json({ success: true, data: revision });
    } catch (err: any) {
      if (err instanceof QuestionRevisionNotFoundError || err instanceof QuestionNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async addRevision(req: Request, res: Response): Promise<void> {
    try {
      const id = getParam(req.params.id);
      const userId = req.principal?.id || 'usr_anonymous';
      const userRole = req.principal?.roles?.includes('ADMIN') ? 'ADMIN' : 'INSTRUCTOR';

      const revision = await this.manageRevisionsUseCase.addRevision(id, req.body, userId, userRole);
      res.status(201).json({ success: true, data: revision });
    } catch (err: any) {
      if (err instanceof QuestionNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof UnauthorizedQuestionAccessError) {
        res.status(403).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof InvalidQuestionDataError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
