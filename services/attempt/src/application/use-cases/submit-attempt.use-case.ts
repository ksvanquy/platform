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

export interface SubmitAttemptInput {
  attemptId: string;
  userId: string;
  userRole?: string;
  gracePeriodMs?: number;
}

export interface SubmitAttemptOutput {
  attempt: AttemptDTO;
  scoreResult: AttemptScoreResult | null;
  status: string;
}

export class SubmitAttemptUseCase {
  constructor(
    private readonly attemptRepo: AttemptRepositoryPort,
    private readonly examClient: ExamClientPort
  ) {}

  async execute(input: SubmitAttemptInput): Promise<SubmitAttemptOutput> {
    const now = new Date();
    const { attemptId, userId, userRole, gracePeriodMs = 15000 } = input;

    const attempt = await this.attemptRepo.findAttemptById(attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }

    if (attempt.userId !== userId && userRole !== 'ADMIN') {
      throw new UnauthorizedAttemptAccessError('You can only submit your own attempt');
    }

    // 1. Chuyển trạng thái nộp bài (SUBMITTED hoặc TIMED_OUT_GRADED)
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

    // 3. Lưu attempt đã hoàn thành vào database
    await this.attemptRepo.saveAttempt(attempt);

    return {
      attempt: attempt.toDTO(snapshot.sanitizedManifest),
      scoreResult: attempt.scoreResult,
      status: attempt.status,
    };
  }
}
