import type { QuestionRepositoryPort } from '../../domain/ports/question.repository.port.js';
import { QuestionNotFoundError } from '../../domain/errors/question-domain.errors.js';
import type { QuestionDTO } from '@platform/contracts';

export class GetQuestionUseCase {
  constructor(private readonly questionRepo: QuestionRepositoryPort) {}

  async executeById(id: string): Promise<QuestionDTO> {
    const question = await this.questionRepo.findById(id);
    if (!question) {
      throw new QuestionNotFoundError(id);
    }
    return question.toDTO();
  }

  async executeByCode(code: string): Promise<QuestionDTO> {
    const question = await this.questionRepo.findByCode(code);
    if (!question) {
      throw new QuestionNotFoundError(code);
    }
    return question.toDTO();
  }
}
