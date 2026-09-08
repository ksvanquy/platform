import type { AssessmentRepositoryPort } from '../../domain/ports/assessment.repository.port.js';
import type { AssessmentStatus, AssessmentDTO } from '@platform/contracts';
import {
  AssessmentNotFoundError,
  UnauthorizedAssessmentAccessError,
} from '../../domain/errors/assessment-domain.errors.js';

export class ChangeAssessmentStatusUseCase {
  constructor(private readonly assessmentRepo: AssessmentRepositoryPort) {}

  async execute(
    id: string,
    newStatus: AssessmentStatus,
    userId: string,
    userRole = 'INSTRUCTOR'
  ): Promise<AssessmentDTO> {
    const assessment = await this.assessmentRepo.findAssessmentById(id);
    if (!assessment) {
      throw new AssessmentNotFoundError(id);
    }

    if (userRole !== 'ADMIN' && assessment.ownerId !== userId) {
      throw new UnauthorizedAssessmentAccessError();
    }

    assessment.transitionStatus(newStatus);
    const saved = await this.assessmentRepo.saveAssessment(assessment, assessment.currentBlueprint);
    return saved.toDTO();
  }
}
