import { Request, Response } from 'express';
import { CreateOrRecoverAttemptUseCase } from '../../application/use-cases/create-or-recover-attempt.use-case.js';
import { StartAttemptUseCase } from '../../application/use-cases/start-attempt.use-case.js';
import { RecordAntiCheatEventUseCase } from '../../application/use-cases/record-anti-cheat-event.use-case.js';
import { SubmitAttemptUseCase } from '../../application/use-cases/submit-attempt.use-case.js';
import { GetAttemptUseCase } from '../../application/use-cases/get-attempt.use-case.js';
import { ListAttemptsUseCase } from '../../application/use-cases/list-attempts.use-case.js';
import { ListAttemptEventsUseCase } from '../../application/use-cases/list-attempt-events.use-case.js';
import { AttemptDomainError } from '../../domain/errors/attempt-domain.errors.js';
import { AttemptMetrics } from '../../infrastructure/metrics/attempt.metrics.js';

export class AttemptController {
  constructor(
    private readonly createOrRecoverAttemptUseCase: CreateOrRecoverAttemptUseCase,
    private readonly startAttemptUseCase: StartAttemptUseCase,
    private readonly recordAntiCheatEventUseCase: RecordAntiCheatEventUseCase,
    private readonly submitAttemptUseCase: SubmitAttemptUseCase,
    private readonly getAttemptUseCase: GetAttemptUseCase,
    private readonly listAttemptsUseCase: ListAttemptsUseCase,
    private readonly listAttemptEventsUseCase: ListAttemptEventsUseCase
  ) {}

  /**
   * POST /v1/attempts
   * Tạo ca thi mới hoặc phục hồi ca thi đang dở (Multi-tab Recovery)
   */
  createOrRecover = async (req: Request, res: Response): Promise<void> => {
    try {
      const principal = req.principal;
      const userId = principal?.id || (req.body && req.body.userId);
      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'User authentication or userId in body is required to start an attempt',
        });
        return;
      }

      const examIdOrCode = req.body.examId || req.body.examCode || req.body.quizId || req.body.quizCode;
      if (!examIdOrCode) {
        res.status(400).json({
          success: false,
          message: 'examId or examCode is required',
        });
        return;
      }

      const variantCode = req.body.variantCode || 'DEFAULT';
      const autoStart = req.body.autoStart !== undefined ? Boolean(req.body.autoStart) : true;

      const result = await this.createOrRecoverAttemptUseCase.execute({
        userId,
        examIdOrCode,
        variantCode,
        autoStart,
      });

      res.status(result.isRecovered ? 200 : 201).json({
        success: true,
        data: result.attempt,
        manifest: result.manifest,
        isRecovered: result.isRecovered,
        serverTime: result.serverTime,
        serverTimestamp: result.serverTimestamp,
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  };

  /**
   * POST /v1/attempts/:id/start
   * Bắt đầu tính giờ ca thi
   */
  start = async (req: Request, res: Response): Promise<void> => {
    try {
      const attemptId = req.params.id as string;
      const principal = req.principal;
      const userId = principal?.id || (req.body && req.body.userId);
      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const result = await this.startAttemptUseCase.execute({
        attemptId,
        userId,
        userRole: principal?.roles?.[0],
      });

      res.status(200).json({
        success: true,
        data: result.attempt,
        manifest: result.manifest,
        remainingTimeMs: result.remainingTimeMs,
        serverTime: result.serverTime,
        serverTimestamp: result.serverTimestamp,
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  };

  /**
   * GET /v1/attempts/:id
   * Lấy thông tin ca thi và đề thi đã làm sạch
   */
  getAttempt = async (req: Request, res: Response): Promise<void> => {
    try {
      const attemptId = req.params.id as string;
      const principal = req.principal;

      const result = await this.getAttemptUseCase.execute({
        attemptId,
        userId: principal?.id,
        userRole: principal?.roles?.[0],
      });

      res.status(200).json({
        success: true,
        data: result.attempt,
        remainingTimeMs: result.remainingTimeMs,
        serverTime: result.serverTime,
        serverTimestamp: result.serverTimestamp,
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  };

  /**
   * POST /v1/attempts/:id/events
   * Ghi nhận sự kiện telemetry chống gian lận (Tab Switch, Fullscreen Exit, v.v.)
   */
  recordEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      const attemptId = req.params.id as string;
      const principal = req.principal;
      const userId = principal?.id || req.body.userId;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const eventType = req.body.eventType || req.body.type;
      if (!eventType) {
        res.status(400).json({ success: false, message: 'eventType is required' });
        return;
      }

      const event = await this.recordAntiCheatEventUseCase.execute({
        attemptId,
        userId,
        eventType,
        clientTimestamp: req.body.clientTimestamp,
        metadata: req.body.metadata,
      });

      res.status(201).json({
        success: true,
        data: event,
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  };

  /**
   * GET /v1/attempts/:id/events
   * Xem lịch sử audit giám sát thi
   */
  listEvents = async (req: Request, res: Response): Promise<void> => {
    try {
      const attemptId = req.params.id as string;
      const principal = req.principal;

      const events = await this.listAttemptEventsUseCase.execute({
        attemptId,
        currentUserId: principal?.id,
        currentUserRole: principal?.roles?.[0],
      });

      res.status(200).json({
        success: true,
        data: events,
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  };

  /**
   * POST /v1/attempts/:id/submit
   * Nộp bài thi và kích hoạt chấm điểm tức thời
   */
  submit = async (req: Request, res: Response): Promise<void> => {
    try {
      const attemptId = req.params.id as string;
      const principal = req.principal;
      const userId = principal?.id || req.body.userId;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const answers = req.body.answers;

      const result = await this.submitAttemptUseCase.execute({
        attemptId,
        userId,
        userRole: principal?.roles?.[0],
        answers,
      });

      res.status(200).json({
        success: true,
        data: result.attempt,
        scoreResult: result.scoreResult,
        status: result.status,
        isDuplicateSubmission: result.isDuplicateSubmission ?? false,
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  };

  /**
   * GET /v1/attempts/:id/result
   * Xem kết quả chấm điểm chi tiết
   */
  getResult = async (req: Request, res: Response): Promise<void> => {
    try {
      const attemptId = req.params.id as string;
      const principal = req.principal;

      const result = await this.getAttemptUseCase.execute({
        attemptId,
        userId: principal?.id,
        userRole: principal?.roles?.[0],
      });

      res.status(200).json({
        success: true,
        data: {
          attemptId: result.attempt.id,
          status: result.attempt.status,
          scoreResult: result.attempt.scoreResult,
          submittedAt: result.attempt.submittedAt,
        },
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  };

  /**
   * GET /v1/attempts
   * Danh sách bài thi của thí sinh hoặc bộ lọc cho Giám thị / Quản trị viên
   */
  listAttempts = async (req: Request, res: Response): Promise<void> => {
    try {
      const principal = req.principal;
      const userId = (req.query.userId as string) || principal?.id;
      const examId = req.query.examId as string;
      const status = req.query.status as any;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const offset = req.query.offset ? Number(req.query.offset) : 0;

      const result = await this.listAttemptsUseCase.execute({
        userId,
        examId,
        status,
        limit,
        offset,
        currentUserId: principal?.id,
        currentUserRole: principal?.roles?.[0],
      });

      res.status(200).json({
        success: true,
        data: result.attempts,
        total: result.total,
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  };

  /**
   * GET /v1/time
   * Đồng bộ đồng hồ máy chủ (Cristian's Precision Algorithm)
   */
  getServerTime = (_req: Request, res: Response): void => {
    const now = new Date();
    res.setHeader('X-Server-Time', now.toISOString());
    res.setHeader('X-Server-Timestamp', now.getTime().toString());
    res.status(200).json({
      success: true,
      serverTime: now.toISOString(),
      timestampMs: now.getTime(),
    });
  };

  private handleError(err: any, res: Response): void {
    if (err instanceof AttemptDomainError) {
      if (err.errorCode === 'ATTEMPT_CONCURRENCY_CONFLICT' || err.errorCode === 'OUTDATED_ANSWER_SEQUENCE') {
        AttemptMetrics.incrementOccConflicts();
      }

      res.status(err.statusCode).json({
        success: false,
        message: err.message,
        errorCode: err.errorCode,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: err?.message || 'Internal server error occurred',
    });
  }
}
