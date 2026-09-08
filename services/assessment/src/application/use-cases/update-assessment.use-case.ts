import type { AssessmentRepositoryPort } from '../../domain/ports/assessment.repository.port.js';
import {
  AssessmentNotFoundError,
  UnauthorizedAssessmentAccessError,
} from '../../domain/errors/assessment-domain.errors.js';
import type { UpdateAssessmentInput, AssessmentDTO } from '@platform/contracts';

export class UpdateAssessmentUseCase {
  constructor(private readonly assessmentRepo: AssessmentRepositoryPort) {}

  async execute(
    id: string,
    input: UpdateAssessmentInput,
    userId: string,
    userRole = 'INSTRUCTOR'
  ): Promise<AssessmentDTO> {
    const assessment = await this.assessmentRepo.findAssessmentById(id);
    if (!assessment) {
      throw new AssessmentNotFoundError(id);
    }

    if (userRole !== 'ADMIN' && assessment.ownerId !== userId) {
      throw new UnauthorizedAssessmentAccessError('Only the owner or an admin can update this assessment.');
    }

    assessment.updateDetails(
      input.title,
      input.description,
      input.primaryTopicNodeId,
      input.gradeNodeId
    );

    if (input.status) {
      assessment.transitionStatus(input.status);
    }

    const saved = await this.assessmentRepo.saveAssessment(assessment);
    return saved.toDTO();
  }
}
