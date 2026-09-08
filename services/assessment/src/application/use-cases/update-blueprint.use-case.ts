import type { AssessmentRepositoryPort } from '../../domain/ports/assessment.repository.port.js';
import {
  AssessmentNotFoundError,
  BlueprintNotFoundError,
  UnauthorizedAssessmentAccessError,
  BlueprintLockedError,
} from '../../domain/errors/assessment-domain.errors.js';
import type { UpdateBlueprintInput, BlueprintDTO } from '@platform/contracts';

export class UpdateBlueprintUseCase {
  constructor(private readonly assessmentRepo: AssessmentRepositoryPort) {}

  async execute(
    assessmentId: string,
    input: UpdateBlueprintInput,
    userId: string,
    userRole = 'INSTRUCTOR'
  ): Promise<BlueprintDTO> {
    const assessment = await this.assessmentRepo.findAssessmentById(assessmentId);
    if (!assessment) {
      throw new AssessmentNotFoundError(assessmentId);
    }

    if (userRole !== 'ADMIN' && assessment.ownerId !== userId) {
      throw new UnauthorizedAssessmentAccessError();
    }

    const blueprint = assessment.currentBlueprint;
    if (!blueprint) {
      throw new BlueprintNotFoundError(assessmentId);
    }

    if (blueprint.isLocked && !input.isLocked) {
      throw new BlueprintLockedError();
    }

    blueprint.updateCriteria(
      input.criteria || blueprint.criteria,
      input.scoringPolicy || blueprint.scoringPolicy,
      input.durationMinutes,
      input.passingPercentage,
      input.maxAttempts
    );

    if (input.isLocked) {
      blueprint.lock();
    }

    const saved = await this.assessmentRepo.saveBlueprint(blueprint);
    return saved.toDTO();
  }

  async lockBlueprint(
    assessmentId: string,
    userId: string,
    userRole = 'INSTRUCTOR'
  ): Promise<BlueprintDTO> {
    const assessment = await this.assessmentRepo.findAssessmentById(assessmentId);
    if (!assessment) {
      throw new AssessmentNotFoundError(assessmentId);
    }

    if (userRole !== 'ADMIN' && assessment.ownerId !== userId) {
      throw new UnauthorizedAssessmentAccessError();
    }

    const blueprint = assessment.currentBlueprint;
    if (!blueprint) {
      throw new BlueprintNotFoundError(assessmentId);
    }

    blueprint.lock();
    const saved = await this.assessmentRepo.saveBlueprint(blueprint);
    return saved.toDTO();
  }
}
