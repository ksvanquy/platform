import type {
  AssessmentRepositoryPort,
  AssessmentFilterQuery,
} from '../../domain/ports/assessment.repository.port.js';
import type { AssessmentDTO } from '@platform/contracts';

export class ListAssessmentsUseCase {
  constructor(private readonly assessmentRepo: AssessmentRepositoryPort) {}

  async execute(filter: AssessmentFilterQuery): Promise<{ items: AssessmentDTO[]; total: number; limit: number; offset: number }> {
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    const { assessments, total } = await this.assessmentRepo.listAssessments(filter);

    return {
      items: assessments.map((a) => a.toDTO()),
      total,
      limit,
      offset,
    };
  }
}
