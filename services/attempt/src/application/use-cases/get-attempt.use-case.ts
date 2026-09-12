import type { AttemptDTO } from '@platform/contracts';
import type {
  AttemptRepositoryPort,
  ExamClientPort,
} from '../../domain/ports/attempt.repository.port.js';
import {
  AttemptNotFoundError,
  UnauthorizedAttemptAccessError,
} from '../../domain/errors/attempt-domain.errors.js';
import { AttemptScoringEngine } from '../../domain/scoring/attempt-scoring.engine.js';

export interface GetAttemptInput {
  attemptId: string;
  userId?: string;
  userRole?: string;
}

export interface GetAttemptOutput {
  attempt: AttemptDTO;
  remainingTimeMs: number;
  serverTime: string;
  serverTimestamp: number;
}

export class GetAttemptUseCase {
  constructor(
    private readonly attemptRepo: AttemptRepositoryPort,
    private readonly examClient: ExamClientPort
  ) {}

  async execute(input: GetAttemptInput): Promise<GetAttemptOutput> {
    const now = new Date();
    const { attemptId, userId, userRole } = input;

    const attempt = await this.attemptRepo.findAttemptById(attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }

    if (userId && attempt.userId !== userId && userRole !== 'ADMIN' && userRole !== 'INSTRUCTOR') {
      throw new UnauthorizedAttemptAccessError('You are not authorized to view this attempt');
    }

    const snapshot = await this.examClient.getExamSnapshot(attempt.examId, attempt.variantCode);
    const manifest = snapshot?.sanitizedManifest;

    // LAZY TIMEOUT: Khi thí sinh hoặc admin truy vấn bài thi đã hết hạn, tự động chốt TIMED_OUT_GRADED và chấm điểm
    if (attempt.status === 'IN_PROGRESS' && attempt.isAnswerTimeExpired(now)) {
      const gracePeriodMs = 15000;
      attempt.submit(now, gracePeriodMs);

      if (snapshot?.frozenPayload?.questions) {
        const scoreResult = AttemptScoringEngine.evaluate({
          questions: snapshot.frozenPayload.questions,
          answers: attempt.answers,
          scoringPolicy: snapshot.frozenPayload.scoringPolicy,
          passingScore: 0,
        });
        attempt.grade(scoreResult);
      }

      attempt.incrementVersion();
      await this.attemptRepo.saveAttempt(attempt);
    }

    return {
      attempt: attempt.toDTO(manifest),
      remainingTimeMs: attempt.remainingTimeMs(now),
      serverTime: now.toISOString(),
      serverTimestamp: now.getTime(),
    };
  }
}

