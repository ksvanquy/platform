import type {
  AttemptDTO,
  SanitizedExamManifest,
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

export interface StartAttemptInput {
  attemptId: string;
  userId: string;
  userRole?: string;
}

export interface StartAttemptOutput {
  attempt: AttemptDTO;
  manifest: SanitizedExamManifest;
  remainingTimeMs: number;
  serverTime: string;
  serverTimestamp: number;
}

export class StartAttemptUseCase {
  constructor(
    private readonly attemptRepo: AttemptRepositoryPort,
    private readonly examClient: ExamClientPort
  ) {}

  async execute(input: StartAttemptInput): Promise<StartAttemptOutput> {
    const now = new Date();
    const { attemptId, userId, userRole } = input;

    const attempt = await this.attemptRepo.findAttemptById(attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }

    if (attempt.userId !== userId && userRole !== 'ADMIN') {
      throw new UnauthorizedAttemptAccessError('You can only start your own exam attempt');
    }

    attempt.start(now);
    await this.attemptRepo.saveAttempt(attempt);

    const snapshot = await this.examClient.getExamSnapshot(attempt.examId, attempt.variantCode);
    if (!snapshot) {
      throw new ExamSnapshotNotFoundError(attempt.examId, attempt.variantCode);
    }

    return {
      attempt: attempt.toDTO(snapshot.sanitizedManifest),
      manifest: snapshot.sanitizedManifest,
      remainingTimeMs: attempt.remainingTimeMs(now),
      serverTime: now.toISOString(),
      serverTimestamp: now.getTime(),
    };
  }
}
