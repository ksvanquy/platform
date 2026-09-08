import type { QuestionRepositoryPort } from '../../domain/ports/question.repository.port.js';
import type { QuestionFilterQuery, QuestionDTO } from '@platform/contracts';

export class ListQuestionsUseCase {
  constructor(private readonly questionRepo: QuestionRepositoryPort) {}

  async execute(query: QuestionFilterQuery): Promise<{ items: QuestionDTO[]; total: number; limit: number; offset: number }> {
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const { questions, total } = await this.questionRepo.listQuestions(query);

    return {
      items: questions.map((q) => q.toDTO()),
      total,
      limit,
      offset,
    };
  }
}
