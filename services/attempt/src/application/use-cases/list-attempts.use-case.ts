import type { AttemptDTO } from '@platform/contracts';
import type {
  AttemptRepositoryPort,
  AttemptFilterQuery,
} from '../../domain/ports/attempt.repository.port.js';

export interface ListAttemptsInput extends AttemptFilterQuery {
  currentUserId?: string;
  currentUserRole?: string;
}

export interface ListAttemptsOutput {
  attempts: AttemptDTO[];
  total: number;
}

export class ListAttemptsUseCase {
  constructor(private readonly attemptRepo: AttemptRepositoryPort) {}

  async execute(input: ListAttemptsInput = {}): Promise<ListAttemptsOutput> {
    const { currentUserId, currentUserRole, ...filter } = input;

    // Candidates can only list their own attempts unless ADMIN or INSTRUCTOR
    if (currentUserRole !== 'ADMIN' && currentUserRole !== 'INSTRUCTOR' && currentUserId) {
      filter.userId = currentUserId;
    }

    const { attempts, total } = await this.attemptRepo.listAttempts(filter);

    return {
      attempts: attempts.map((a) => a.toDTO()),
      total,
    };
  }
}
