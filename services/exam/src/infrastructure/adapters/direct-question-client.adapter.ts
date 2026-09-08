import type { QuestionClientPort } from '../../domain/ports/exam.repository.port.js';
import type { QuestionDTO, QuestionFilterQuery } from '@platform/contracts';
import { DrizzleQuestionRepository } from '@platform/question-service';

export class DirectQuestionClientAdapter implements QuestionClientPort {
  private questionRepo: DrizzleQuestionRepository;

  constructor(customRepo?: DrizzleQuestionRepository) {
    this.questionRepo = customRepo || new DrizzleQuestionRepository();
  }

  async getQuestions(filter?: {
    topicNodeId?: string;
    gradeNodeId?: string;
    difficulty?: string;
    status?: string;
  }): Promise<QuestionDTO[]> {
    const query: QuestionFilterQuery = {
      topicNodeId: filter?.topicNodeId,
      gradeNodeId: filter?.gradeNodeId,
      difficulty: filter?.difficulty as any,
      status: (filter?.status as any) || 'ACTIVE',
      limit: 500, // Fetch ample candidates for matrix solving
    };

    const { questions } = await this.questionRepo.listQuestions(query);
    return questions.map((q) => q.toDTO());
  }
}
