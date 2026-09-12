import type {
  AttemptDTO,
  AttemptScoreResult,
} from '@platform/contracts';
import type {
  AttemptRepositoryPort,
  ExamClientPort,
} from '../../domain/ports/attempt.repository.port.js';
import {
  AttemptNotFoundError,
  UnauthorizedAttemptAccessError,
  ExamSnapshotNotFoundError,
} from '../../domain/errors/attempt-domain.errors.js';
import { AttemptScoringEngine } from '../../domain/scoring/attempt-scoring.engine.js';
import { AttemptMetrics } from '../../infrastructure/metrics/attempt.metrics.js';

export interface SubmitAttemptInput {
  attemptId: string;
  userId: string;
  userRole?: string;
  answers?: Record<string, unknown>;
  gracePeriodMs?: number;
}

export interface SubmitAttemptOutput {
  attempt: AttemptDTO;
  scoreResult: AttemptScoreResult | null;
  status: string;
  isDuplicateSubmission?: boolean;
}

export class SubmitAttemptUseCase {
  constructor(
    private readonly attemptRepo: AttemptRepositoryPort,
    private readonly examClient: ExamClientPort
  ) {}

  async execute(input: SubmitAttemptInput): Promise<SubmitAttemptOutput> {
    const now = new Date();
    const { attemptId, userId, userRole, answers, gracePeriodMs = 15000 } = input;

    // Task CONC-3.1: Thực thi trong Database Transaction với Row-Level Exclusive Lock (FOR UPDATE)
    return await this.attemptRepo.withAttemptLock(attemptId, async (attempt, saveLocked) => {
      // 1. Xác thực quyền sở hữu
      if (attempt.userId !== userId && userRole !== 'ADMIN') {
        throw new UnauthorizedAttemptAccessError('You can only submit your own attempt');
      }

      // Task CONC-3.2: Cơ chế Idempotent Submission Guard
      // Nếu ca thi đã ở trạng thái hoàn tất (SUBMITTED, GRADED, TIMED_OUT_GRADED), trả về ngay kết quả đã lưu mà không chấm lại
      if (attempt.isFinalized()) {
        AttemptMetrics.incrementDoubleSubmits();
        const snapshot = await this.examClient.getExamSnapshot(attempt.examId, attempt.variantCode);
        return {
          attempt: attempt.toDTO(snapshot?.sanitizedManifest),
          scoreResult: attempt.scoreResult,
          status: attempt.status,
          isDuplicateSubmission: true,
        };
      }

      // Cập nhật bảng câu trả lời từ single submission payload nếu có
      if (answers && typeof answers === 'object') {
        attempt.updateAnswers(answers, now);
      }

      // Task CONC-3.4: Xử lý Tranh chấp Giờ chót (Deadline vs. Grace Period Guard)
      // - now <= deadline + gracePeriodMs (15s): Chuyển thành SUBMITTED và được chấm điểm
      // - now > deadline + gracePeriodMs: Chuyển thành TIMED_OUT_GRADED
      attempt.submit(now, gracePeriodMs);

      // 2. Lấy snapshot để chấm thi tự động
      const snapshot = await this.examClient.getExamSnapshot(attempt.examId, attempt.variantCode);
      if (!snapshot) {
        throw new ExamSnapshotNotFoundError(attempt.examId, attempt.variantCode);
      }

      if (snapshot.frozenPayload?.questions) {
        const scoreResult = AttemptScoringEngine.evaluate({
          questions: snapshot.frozenPayload.questions,
          answers: attempt.answers,
          scoringPolicy: snapshot.frozenPayload.scoringPolicy,
          passingScore: 0,
        });

        attempt.grade(scoreResult);
      }

      // Tăng version OCC cho sự kiện nộp bài
      attempt.incrementVersion();

      // 3. Lưu attempt đã hoàn tất bên trong Transaction được khóa cứng
      await saveLocked(attempt);
      AttemptMetrics.incrementSubmissions();

      return {
        attempt: attempt.toDTO(snapshot.sanitizedManifest),
        scoreResult: attempt.scoreResult,
        status: attempt.status,
        isDuplicateSubmission: false,
      };
    });
  }
}
