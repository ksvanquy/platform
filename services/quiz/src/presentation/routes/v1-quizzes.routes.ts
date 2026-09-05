import { Router, Request, Response } from 'express';
import { AuthoringUseCases } from '../../application/use-cases/authoring/authoring.use-cases.js';
import { DomainError } from '../../domain/errors/domain-errors.js';
import { requireRole } from '../middlewares/rbac.middleware.js';

export function createV1QuizzesRouter(authoring: AuthoringUseCases): Router {
  const router = Router();

  // GET /v1/quizzes - Danh mục đề thi đã xuất bản
  router.get('/', async (req: Request, res: Response) => {
    try {
      const activeTenantId =
        req.tenantContext?.tenantId ||
        (req.headers['x-tenant-id'] as string) ||
        (req.query.tenantId as string) ||
        undefined;
      const quizzes = await authoring.getPublishedQuizzes(activeTenantId);
      res.status(200).json({
        success: true,
        data: quizzes.map((q) => ({
          id: q.id,
          code: q.code,
          title: q.title,
          description: q.description,
          status: q.status,
          tenantId: q.tenantId,
          isPublic: q.isPublic,
          currentPublishedVersionId: q.currentPublishedVersionId,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

    // POST /v1/quizzes - Khởi tạo đề thi mới (DRAFT) - Yêu cầu INSTRUCTOR hoặc ADMIN
  router.post('/', requireRole('INSTRUCTOR', 'ADMIN'), async (req: Request, res: Response) => {
    try {
      const principal = req.principal;
      const { code, title, description, isPublic } = req.body;

      const quiz = await authoring.createQuiz(
        {
          code,
          title,
          description,
          ownerId: principal?.id || 'anonymous_author',
          tenantId: req.tenantContext?.tenantId,
          isPublic: isPublic !== undefined ? Boolean(isPublic) : undefined,
        },
        principal,
        req.tenantContext
      );

      res.status(201).json({ success: true, data: quiz });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  // GET /v1/quizzes/:id - Xem chi tiết đề thi
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const details = await authoring.getQuizDetails(String(req.params.id), req.principal, req.tenantContext);
      res.status(200).json({ success: true, data: details });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 404;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  // PUT /v1/quizzes/:id - Cập nhật thông tin đề thi (Chỉ chủ sở hữu hoặc ADMIN)
  router.put('/:id', requireRole('INSTRUCTOR', 'ADMIN'), async (req: Request, res: Response) => {
    try {
      const { title, description, isPublic } = req.body;
      const quiz = await authoring.updateQuiz(
        {
          quizId: String(req.params.id),
          title,
          description,
          isPublic: isPublic !== undefined ? Boolean(isPublic) : undefined,
        },
        req.principal,
        req.tenantContext
      );

      res.status(200).json({ success: true, data: quiz });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  // POST /v1/quizzes/:id/versions - Thêm phiên bản mới - Yêu cầu INSTRUCTOR hoặc ADMIN
  router.post('/:id/versions', requireRole('INSTRUCTOR', 'ADMIN'), async (req: Request, res: Response) => {
    try {
      const { durationMinutes, passingScore, maxAttempts, questions, scoringPolicy, randomizationPolicy } = req.body;
      const version = await authoring.addVersion(
        {
          quizId: String(req.params.id),
          durationMinutes,
          passingScore,
          maxAttempts,
          questions,
          scoringPolicy,
          randomizationPolicy: randomizationPolicy || { shuffleQuestions: false, shuffleOptions: false },
        },
        req.principal,
        req.tenantContext
      );

      res.status(201).json({ success: true, data: version });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  // POST /v1/quizzes/:id/publish - Xuất bản đề thi - Yêu cầu INSTRUCTOR hoặc ADMIN
  router.post('/:id/publish', requireRole('INSTRUCTOR', 'ADMIN'), async (req: Request, res: Response) => {
    try {
      const { versionId } = req.body;
      const result = await authoring.publishQuiz(
        {
          quizId: String(req.params.id),
          versionId,
        },
        req.principal,
        req.tenantContext
      );

      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 422;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  return router;
}
