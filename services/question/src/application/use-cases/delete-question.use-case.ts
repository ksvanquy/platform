import type { QuestionRepositoryPort } from '../../domain/ports/question.repository.port.js';
import {
  QuestionNotFoundError,
  UnauthorizedQuestionAccessError,
} from '../../domain/errors/question-domain.errors.js';

export class DeleteQuestionUseCase {
  constructor(private readonly questionRepo: QuestionRepositoryPort) {}

  async execute(id: string, userId: string, userRole = 'INSTRUCTOR'): Promise<boolean> {
    const question = await this.questionRepo.findById(id);
    if (!question) {
      throw new QuestionNotFoundError(id);
    }

    if (userRole !== 'ADMIN' && question.ownerId !== userId) {
      throw new UnauthorizedQuestionAccessError('Only the question owner or an admin can delete this question.');
    }

    return this.questionRepo.delete(id);
  }
}
