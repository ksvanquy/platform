import { Request, Response } from 'express';
import { CreateAssessmentUseCase } from '../../application/use-cases/create-assessment.use-case.js';
import { GetAssessmentUseCase } from '../../application/use-cases/get-assessment.use-case.js';
import { UpdateAssessmentUseCase } from '../../application/use-cases/update-assessment.use-case.js';
import { UpdateBlueprintUseCase } from '../../application/use-cases/update-blueprint.use-case.js';
import { ListAssessmentsUseCase } from '../../application/use-cases/list-assessments.use-case.js';
import { ChangeAssessmentStatusUseCase } from '../../application/use-cases/change-assessment-status.use-case.js';
import {
  AssessmentNotFoundError,
  AssessmentCodeAlreadyExistsError,
  InvalidBlueprintCriteriaError,
  BlueprintNotFoundError,
  BlueprintLockedError,
  UnauthorizedAssessmentAccessError,
} from '../../domain/errors/assessment-domain.errors.js';

export class AssessmentController {
  constructor(
    private readonly createAssessmentUseCase: CreateAssessmentUseCase,
    private readonly getAssessmentUseCase: GetAssessmentUseCase,
    private readonly updateAssessmentUseCase: UpdateAssessmentUseCase,
    private readonly updateBlueprintUseCase: UpdateBlueprintUseCase,
    private readonly listAssessmentsUseCase: ListAssessmentsUseCase,
    private readonly changeStatusUseCase: ChangeAssessmentStatusUseCase
  ) {}

  async listAssessments(req: Request, res: Response): Promise<void> {
    try {
      const { status, primaryTopicNodeId, gradeNodeId, ownerId, search, limit, offset } = req.query;

      const result = await this.listAssessmentsUseCase.execute({
        status: status ? (String(status) as any) : undefined,
        primaryTopicNodeId: primaryTopicNodeId ? String(primaryTopicNodeId) : undefined,
        gradeNodeId: gradeNodeId ? String(gradeNodeId) : undefined,
        ownerId: ownerId ? String(ownerId) : undefined,
        search: search ? String(search) : undefined,
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

  async getAssessment(req: Request, res: Response): Promise<void> {
    try {
      const { idOrCode } = req.params;
      const assessment = idOrCode.startsWith('asm_')
        ? await this.getAssessmentUseCase.executeById(idOrCode)
        : await this.getAssessmentUseCase.executeByCode(idOrCode);

      res.status(200).json({ success: true, data: assessment });
    } catch (err: any) {
      if (err instanceof AssessmentNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async createAssessment(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = req.principal?.id || 'usr_anonymous_instructor';
      const assessment = await this.createAssessmentUseCase.execute(req.body, ownerId);
      res.status(201).json({ success: true, data: assessment });
    } catch (err: any) {
      if (err instanceof AssessmentCodeAlreadyExistsError) {
        res.status(409).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof InvalidBlueprintCriteriaError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateAssessment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.principal?.id || 'usr_anonymous';
      const userRole = req.principal?.roles?.includes('ADMIN') ? 'ADMIN' : 'INSTRUCTOR';

      const updated = await this.updateAssessmentUseCase.execute(id, req.body, userId, userRole);
      res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      if (err instanceof AssessmentNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof UnauthorizedAssessmentAccessError) {
        res.status(403).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof InvalidBlueprintCriteriaError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.principal?.id || 'usr_anonymous';
      const userRole = req.principal?.roles?.includes('ADMIN') ? 'ADMIN' : 'INSTRUCTOR';

      const updated = await this.changeStatusUseCase.execute(id, status, userId, userRole);
      res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      if (err instanceof AssessmentNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof UnauthorizedAssessmentAccessError) {
        res.status(403).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof InvalidBlueprintCriteriaError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateBlueprint(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.principal?.id || 'usr_anonymous';
      const userRole = req.principal?.roles?.includes('ADMIN') ? 'ADMIN' : 'INSTRUCTOR';

      const updatedBp = await this.updateBlueprintUseCase.execute(id, req.body, userId, userRole);
      res.status(200).json({ success: true, data: updatedBp });
    } catch (err: any) {
      if (err instanceof AssessmentNotFoundError || err instanceof BlueprintNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof BlueprintLockedError) {
        res.status(422).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof UnauthorizedAssessmentAccessError) {
        res.status(403).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof InvalidBlueprintCriteriaError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async lockBlueprint(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.principal?.id || 'usr_anonymous';
      const userRole = req.principal?.roles?.includes('ADMIN') ? 'ADMIN' : 'INSTRUCTOR';

      const lockedBp = await this.updateBlueprintUseCase.lockBlueprint(id, userId, userRole);
      res.status(200).json({ success: true, data: lockedBp });
    } catch (err: any) {
      if (err instanceof AssessmentNotFoundError || err instanceof BlueprintNotFoundError) {
        res.status(404).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof UnauthorizedAssessmentAccessError) {
        res.status(403).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
