import { Router, Request, Response } from 'express';
import { DeliveryUseCases } from '../../application/use-cases/delivery/delivery.use-cases.js';
import { DomainError } from '../../domain/errors/domain-errors.js';

function getAuthenticatedUserId(req: Request, res: Response): string | null {
  const principal = req.principal;
  const userId = principal?.id || (req.headers['x-user-id'] as string);
  if (!userId) {
    res.status(401).json({
      success: false,
      message: 'Authentication required. Please provide a valid Bearer token.',
      errorCode: 'UNAUTHORIZED',
    });
    return null;
  }
  return userId;
}

export function createV1AttemptsRouter(delivery: DeliveryUseCases): Router {
  const router = Router();

  // POST /v1/attempts - Khởi tạo hoặc khôi phục lượt thi (Idempotent & Multi-tab defense)
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req, res);
      if (!userId) return;

      const { quizId } = req.body;
      if (!quizId) {
        return res.status(400).json({ success: false, message: 'quizId is required', errorCode: 'INVALID_INPUT' });
      }

      const { attempt, isExisting } = await delivery.createAttempt(
        {
          userId,
          quizId,
          tenantId: req.tenantContext?.tenantId,
        },
        req.principal,
        req.tenantContext
      );

      res.status(isExisting ? 200 : 201).json({
        success: true,
        data: attempt.toJSON(),
        isExisting,
      });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  // POST /v1/attempts/:id/start - Bắt đầu tính giờ và phát đề thi đã khử khuẩn
  router.post('/:id/start', async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req, res);
      if (!userId) return;

      const result = await delivery.startAttempt(
        {
          attemptId: String(req.params.id),
          userId,
        },
        req.principal,
        req.tenantContext
      );

      const now = new Date();
      res.status(200).json({
        success: true,
        data: {
          attempt: result.attempt.toJSON(now),
          manifest: result.manifest,
          questions: result.questions,
          serverTime: now.toISOString(),
          remainingSeconds: Math.floor(result.attempt.remainingTimeMs(now) / 1000),
        },
      });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  // GET /v1/attempts/:id - Lấy trạng thái phòng thi
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req, res);
      if (!userId) return;

      const now = new Date();
      const result = await delivery.getAttemptDetails(
        String(req.params.id),
        userId,
        now,
        15000,
        req.principal,
        req.tenantContext
      );
      res.status(200).json({
        success: true,
        data: {
          attempt: result.attempt.toJSON(now),
          questions: result.questions,
          serverTime: now.toISOString(),
          remainingSeconds: Math.floor(result.attempt.remainingTimeMs(now) / 1000),
        },
      });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 404;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  // POST /v1/attempts/:id/answers - Lưu câu trả lời (Hỗ trợ body { questionId, answer, sequenceNumber, clientTimestamp })
  router.post('/:id/answers', async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req, res);
      if (!userId) return;

      const { questionId, answer, sequenceNumber, clientTimestamp } = req.body;
      if (!questionId) {
        return res.status(400).json({ success: false, message: 'questionId is required', errorCode: 'INVALID_INPUT' });
      }

      await delivery.recordAnswer(
        {
          attemptId: String(req.params.id),
          userId,
          questionId: String(questionId),
          answer,
          sequenceNumber: sequenceNumber !== undefined ? Number(sequenceNumber) : undefined,
          clientTimestamp: clientTimestamp !== undefined ? Number(clientTimestamp) : undefined,
        },
        req.principal,
        req.tenantContext
      );

      res.status(200).json({ success: true, message: 'Answer recorded successfully' });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  // PUT /v1/attempts/:id/answers/:questionId - Lưu câu trả lời từng câu
  router.put('/:id/answers/:questionId', async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req, res);
      if (!userId) return;

      const { answer, sequenceNumber, clientTimestamp } = req.body;

      await delivery.recordAnswer(
        {
          attemptId: String(req.params.id),
          userId,
          questionId: String(req.params.questionId),
          answer,
          sequenceNumber: sequenceNumber !== undefined ? Number(sequenceNumber) : undefined,
          clientTimestamp: clientTimestamp !== undefined ? Number(clientTimestamp) : undefined,
        },
        req.principal,
        req.tenantContext
      );

      res.status(200).json({ success: true, message: 'Answer recorded successfully' });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  // POST /v1/attempts/:id/submit - Nộp bài thi
  router.post('/:id/submit', async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req, res);
      if (!userId) return;

      const result = await delivery.submitAttempt(
        {
          attemptId: String(req.params.id),
          userId,
        },
        req.principal,
        req.tenantContext
      );

      const now = new Date();
      res.status(200).json({
        success: true,
        data: {
          attempt: result.attempt.toJSON(now),
          scoreResult: result.scoreResult,
          serverTime: now.toISOString(),
        },
      });
    } catch (err: any) {
      const status = err instanceof DomainError ? err.statusCode : 400;
      res.status(status).json({ success: false, message: err.message, errorCode: err.errorCode });
    }
  });

  return router;
}
