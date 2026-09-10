import type { AssessmentClientPort } from '../../domain/ports/exam.repository.port.js';
import type { AssessmentDTO, BlueprintDTO } from '@platform/contracts';
import { DrizzleAssessmentRepository } from '@platform/assessment-service';

export class DirectAssessmentClientAdapter implements AssessmentClientPort {
  private assessmentRepo: DrizzleAssessmentRepository;

  constructor(customRepo?: DrizzleAssessmentRepository) {
    this.assessmentRepo = customRepo || new DrizzleAssessmentRepository();
  }

  async getAssessment(assessmentIdOrCode: string): Promise<AssessmentDTO | null> {
    try {
      let assessment = await this.assessmentRepo.findAssessmentById(assessmentIdOrCode);
      if (!assessment) {
        assessment = await this.assessmentRepo.findAssessmentByCode(assessmentIdOrCode);
      }
      return assessment ? assessment.toDTO() : null;
    } catch {
      return null;
    }
  }

  async getAssessmentWithBlueprint(assessmentIdOrCode: string): Promise<{
    assessment: AssessmentDTO;
    blueprint: BlueprintDTO;
  } | null> {
    let assessment = await this.assessmentRepo.findAssessmentById(assessmentIdOrCode);
    if (!assessment) {
      assessment = await this.assessmentRepo.findAssessmentByCode(assessmentIdOrCode);
    }
    if (!assessment) {
      return null;
    }

    let blueprint = assessment.currentBlueprint;
    if (!blueprint) {
      const latestBp = await this.assessmentRepo.findLatestBlueprintByAssessmentId(assessment.id);
      if (latestBp) {
        blueprint = latestBp;
      }
    }

    if (!blueprint) {
      return null;
    }

    return {
      assessment: assessment.toDTO(),
      blueprint: blueprint.toDTO(),
    };
  }
}
