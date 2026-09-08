import crypto from 'node:crypto';
import type { AssessmentRepositoryPort } from '../../domain/ports/assessment.repository.port.js';
import { Assessment, Blueprint } from '../../domain/entities/assessment.entity.js';
import {
  AssessmentCodeAlreadyExistsError,
  InvalidBlueprintCriteriaError,
} from '../../domain/errors/assessment-domain.errors.js';
import type { CreateAssessmentInput, AssessmentDTO } from '@platform/contracts';

export class CreateAssessmentUseCase {
  constructor(private readonly assessmentRepo: AssessmentRepositoryPort) {}

  async execute(input: CreateAssessmentInput, ownerId: string): Promise<AssessmentDTO> {
    if (!input.code || input.code.trim().length === 0) {
      throw new InvalidBlueprintCriteriaError('Assessment code is required');
    }
    if (!input.title || input.title.trim().length === 0) {
      throw new InvalidBlueprintCriteriaError('Assessment title is required');
    }

    const existing = await this.assessmentRepo.findAssessmentByCode(input.code.trim());
    if (existing) {
      throw new AssessmentCodeAlreadyExistsError(input.code.trim());
    }

    const assessmentId = `asm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const blueprintId = `bp_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date();

    const blueprint = new Blueprint({
      id: blueprintId,
      assessmentId,
      versionNumber: 1,
      durationMinutes: input.durationMinutes || 45,
      passingPercentage: input.passingPercentage ?? 50,
      maxAttempts: input.maxAttempts || 1,
      criteria: input.criteria || [],
      scoringPolicy: input.scoringPolicy || { strategyType: 'STANDARD', roundingDecimal: 2 },
      isLocked: false,
      createdAt: now,
      updatedAt: now,
    });

    const assessment = new Assessment({
      id: assessmentId,
      code: input.code.trim(),
      title: input.title.trim(),
      description: input.description,
      ownerId,
      primaryTopicNodeId: input.primaryTopicNodeId,
      gradeNodeId: input.gradeNodeId,
      status: 'DRAFT',
      currentBlueprintId: blueprintId,
      currentBlueprint: blueprint,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.assessmentRepo.saveAssessment(assessment, blueprint);
    return saved.toDTO();
  }
}
