import type { AssessmentRepositoryPort } from '../../domain/ports/assessment.repository.port.js';
import { AssessmentNotFoundError } from '../../domain/errors/assessment-domain.errors.js';
import type { AssessmentDTO } from '@platform/contracts';

export class GetAssessmentUseCase {
  constructor(private readonly assessmentRepo: AssessmentRepositoryPort) {}

  async executeById(id: string): Promise<AssessmentDTO> {
    const assessment = await this.assessmentRepo.findAssessmentById(id);
    if (!assessment) {
      throw new AssessmentNotFoundError(id);
    }
    return assessment.toDTO();
  }

  async executeByCode(code: string): Promise<AssessmentDTO> {
    const assessment = await this.assessmentRepo.findAssessmentByCode(code);
    if (!assessment) {
      throw new AssessmentNotFoundError(code);
    }
    return assessment.toDTO();
  }
}
