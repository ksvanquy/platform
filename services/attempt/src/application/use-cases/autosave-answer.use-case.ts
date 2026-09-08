import type { AttemptRepositoryPort } from '../../domain/ports/attempt.repository.port.js';
import {
  AttemptNotFoundError,
  UnauthorizedAttemptAccessError,
} from '../../domain/errors/attempt-domain.errors.js';

export interface AutosaveAnswerInput {
  attemptId: string;
  userId: string;
  questionId: string;
  answer: unknown;
  sequenceNumber: number;
  clientTimestamp?: number;
  userRole?: string;
  gracePeriodMs?: number;
}

export interface AutosaveAnswerOutput {
  success: boolean;
  attemptId: string;
  questionId: string;
  sequenceNumber: number;
  savedAt: string;
  remainingTimeMs: number;
}

export class AutosaveAnswerUseCase {
  constructor(private readonly attemptRepo: AttemptRepositoryPort) {}

  async execute(input: AutosaveAnswerInput): Promise<AutosaveAnswerOutput> {
    const now = new Date();
    const {
      attemptId,
      userId,
      questionId,
      answer,
      sequenceNumber,
      clientTimestamp,
      userRole,
      gracePeriodMs = 15000,
    } = input;

    // 1. Tải Attempt
    const attempt = await this.attemptRepo.findAttemptById(attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }

    // 2. Xác thực quyền sở hữu
    if (attempt.userId !== userId && userRole !== 'ADMIN') {
      throw new UnauthorizedAttemptAccessError('You can only record answers for your own attempt');
    }

    // 3. Ghi nhận câu trả lời vào Aggregate (kiểm tra FSM, Sequence Number, Deadline Tier 1 & Tier 2)
    attempt.recordAnswer(
      questionId,
      answer,
      sequenceNumber,
      clientTimestamp,
      now,
      gracePeriodMs
    );

    // 4. Lưu vào Database
    await this.attemptRepo.saveAttempt(attempt);

    return {
      success: true,
      attemptId: attempt.id,
      questionId,
      sequenceNumber,
      savedAt: now.toISOString(),
      remainingTimeMs: attempt.remainingTimeMs(now),
    };
  }
}
