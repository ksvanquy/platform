import type { AttemptRepositoryPort } from '../../domain/ports/attempt.repository.port.js';
import type { CandidateAnswerRecord } from '@platform/contracts';
import { AttemptMetrics } from '../../infrastructure/metrics/attempt.metrics.js';
import { AttemptNotFoundError, UnauthorizedAttemptAccessError } from '../../domain/errors/attempt-domain.errors.js';

export interface AutosaveAnswerInput {
  attemptId: string;
  userId: string;
  questionId: string;
  answer: unknown;
  sequenceNumber: number;
  clientTimestamp?: number;
  userRole?: string;
  gracePeriodMs?: number;
  expectedVersion?: number;
}

export interface AutosaveAnswerOutput {
  success: boolean;
  attemptId: string;
  questionId: string;
  sequenceNumber: number;
  savedAt: string;
  remainingTimeMs: number;
  version?: number;
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
      expectedVersion,
    } = input;

    const answerRecord: CandidateAnswerRecord = {
      answer,
      sequenceNumber,
      clientTimestamp,
      answeredAt: now.toISOString(),
    };

    // Task CONC-4.4: Kiểm tra cờ rollback FEATURE_FLAG_ATOMIC_AUTOSAVE
    const isAtomicEnabled = process.env.FEATURE_FLAG_ATOMIC_AUTOSAVE !== 'false';

    if (isAtomicEnabled) {
      // Gọi atomic patching tại tầng repository (Zero Lost Updates, sub-20ms SLA, loại bỏ full-row overwrite)
      const result = await this.attemptRepo.patchAnswerAtomic(
        attemptId,
        questionId,
        answerRecord,
        expectedVersion,
        userId,
        userRole
      );

      AttemptMetrics.incrementAtomicPatch();

      return {
        success: true,
        attemptId,
        questionId,
        sequenceNumber,
        savedAt: now.toISOString(),
        remainingTimeMs: result.remainingTimeMs,
        version: result.newVersion,
      };
    }

    // Kịch bản Rollback (Fallback sang load-modify-save an toàn)
    const attempt = await this.attemptRepo.findAttemptById(attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }
    if (attempt.userId !== userId && userRole !== 'ADMIN') {
      throw new UnauthorizedAttemptAccessError('You can only save answers to your own attempt');
    }

    attempt.recordAnswer(questionId, answer, sequenceNumber, clientTimestamp);
    await this.attemptRepo.saveAttempt(attempt);

    return {
      success: true,
      attemptId,
      questionId,
      sequenceNumber,
      savedAt: now.toISOString(),
      remainingTimeMs: attempt.remainingTimeMs(now),
      version: attempt.version,
    };
  }
}
