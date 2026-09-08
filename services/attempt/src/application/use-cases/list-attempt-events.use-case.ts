import type { AntiCheatEventDTO } from '@platform/contracts';
import type { AttemptRepositoryPort } from '../../domain/ports/attempt.repository.port.js';
import {
  AttemptNotFoundError,
  UnauthorizedAttemptAccessError,
} from '../../domain/errors/attempt-domain.errors.js';

export interface ListAttemptEventsInput {
  attemptId: string;
  currentUserId?: string;
  currentUserRole?: string;
}

export class ListAttemptEventsUseCase {
  constructor(private readonly attemptRepo: AttemptRepositoryPort) {}

  async execute(input: ListAttemptEventsInput): Promise<AntiCheatEventDTO[]> {
    const { attemptId, currentUserId, currentUserRole } = input;

    const attempt = await this.attemptRepo.findAttemptById(attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }

    if (
      currentUserId &&
      attempt.userId !== currentUserId &&
      currentUserRole !== 'ADMIN' &&
      currentUserRole !== 'INSTRUCTOR'
    ) {
      throw new UnauthorizedAttemptAccessError('You are not authorized to view anti-cheat logs for this attempt');
    }

    const events = await this.attemptRepo.listEventsByAttemptId(attemptId);
    return events.map((e) => e.toDTO());
  }
}
