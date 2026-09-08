import { Request, Response } from 'express';
import { GenerateExamUseCase } from '../../application/use-cases/generate-exam.use-case.js';
import { GetExamUseCase } from '../../application/use-cases/get-exam.use-case.js';
import { ListExamsUseCase } from '../../application/use-cases/list-exams.use-case.js';
import { GetExamSnapshotUseCase } from '../../application/use-cases/get-exam-snapshot.use-case.js';
import { UpdateExamUseCase } from '../../application/use-cases/update-exam.use-case.js';
import { DeleteExamUseCase } from '../../application/use-cases/delete-exam.use-case.js';
import { GenerateVariantsUseCase } from '../../application/use-cases/generate-variants.use-case.js';
import {
  ExamNotFoundError,
  ExamSnapshotNotFoundError,
  ExamAlreadyExistsError,
  InvalidExamDataError,
  ExamMatrixResolutionError,
  ExamDomainError,
} from '../../domain/errors/exam-domain.errors.js';

export class ExamController {
  constructor(
    private generateExamUseCase: GenerateExamUseCase,
    private getExamUseCase: GetExamUseCase,
    private listExamsUseCase: ListExamsUseCase,
    private getExamSnapshotUseCase: GetExamSnapshotUseCase,
    private updateExamUseCase: UpdateExamUseCase,
    private deleteExamUseCase: DeleteExamUseCase,
    private generateVariantsUseCase: GenerateVariantsUseCase
  ) {}

  generateExam = async (req: Request, res: Response): Promise<void> => {
    try {
      const exam = await this.generateExamUseCase.execute(req.body);
      res.status(201).json({
        success: true,
        data: exam,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  getExam = async (req: Request, res: Response): Promise<void> => {
    try {
      const idOrCode = req.params.idOrCode as string;
      const exam = await this.getExamUseCase.execute(idOrCode);
      res.status(200).json({
        success: true,
        data: exam,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  listExams = async (req: Request, res: Response): Promise<void> => {
    try {
      const { assessmentId, status, isPublished, search, limit, offset } = req.query;

      const result = await this.listExamsUseCase.execute({
        assessmentId: assessmentId ? String(assessmentId) : undefined,
        status: status ? (String(status) as any) : undefined,
        isPublished: isPublished !== undefined ? isPublished === 'true' : undefined,
        search: search ? String(search) : undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.exams,
        total: result.total,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  updateExam = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const updated = await this.updateExamUseCase.execute(id, req.body);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  updateStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { status } = req.body;
      const updated = await this.updateExamUseCase.execute(id, { status });
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  publishExam = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const updated = await this.updateExamUseCase.publishExam(id);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  unpublishExam = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const updated = await this.updateExamUseCase.unpublishExam(id);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  deleteExam = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      await this.deleteExamUseCase.execute(id);
      res.status(200).json({
        success: true,
        message: `Exam ${id} successfully deleted.`,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  getSanitizedManifest = async (req: Request, res: Response): Promise<void> => {
    try {
      const idOrCode = String(req.params.idOrCode);
      const variantCode = req.params.variantCode ? String(req.params.variantCode) : 'DEFAULT';
      const manifest = await this.getExamSnapshotUseCase.getSanitizedManifest(
        idOrCode,
        variantCode
      );
      res.status(200).json({
        success: true,
        data: manifest,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  getFrozenSnapshot = async (req: Request, res: Response): Promise<void> => {
    try {
      const idOrCode = String(req.params.idOrCode);
      const variantCode = req.params.variantCode ? String(req.params.variantCode) : 'DEFAULT';
      const snapshot = await this.getExamSnapshotUseCase.getFrozenSnapshot(
        idOrCode,
        variantCode
      );
      res.status(200).json({
        success: true,
        data: snapshot,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  generateVariants = async (req: Request, res: Response): Promise<void> => {
    try {
      const idOrCode = req.params.idOrCode as string;
      const variantsCount = req.body.variantsCount ? Number(req.body.variantsCount) : 4;
      const updated = await this.generateVariantsUseCase.execute(idOrCode, variantsCount);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      this.handleError(res, err);
    }
  };

  private handleError(res: Response, err: unknown): void {
    if (err instanceof ExamNotFoundError || err instanceof ExamSnapshotNotFoundError) {
      res.status(404).json({
        success: false,
        message: err.message,
        errorCode: 'EXAM_NOT_FOUND',
      });
      return;
    }

    if (err instanceof ExamAlreadyExistsError) {
      res.status(409).json({
        success: false,
        message: err.message,
        errorCode: 'EXAM_ALREADY_EXISTS',
      });
      return;
    }

    if (err instanceof InvalidExamDataError || err instanceof ExamMatrixResolutionError) {
      res.status(400).json({
        success: false,
        message: err.message,
        errorCode: 'BAD_REQUEST',
      });
      return;
    }

    if (err instanceof ExamDomainError) {
      res.status(400).json({
        success: false,
        message: err.message,
        errorCode: 'DOMAIN_ERROR',
      });
      return;
    }

    console.error('Unhandled Exam Service Error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error in Exam Service.',
      errorCode: 'INTERNAL_ERROR',
    });
  }
}
