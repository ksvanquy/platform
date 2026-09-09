import type { Assessment, Blueprint } from '../entities/assessment.entity.js';
import type { AssessmentStatus } from '@platform/contracts';

export interface AssessmentFilterQuery {
  status?: AssessmentStatus;
  primaryTopicNodeId?: string;
  gradeNodeId?: string;
  ownerId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AssessmentRepositoryPort {
  saveAssessment(assessment: Assessment, blueprint?: Blueprint): Promise<Assessment>;
  findAssessmentById(id: string): Promise<Assessment | null>;
  findAssessmentByCode(code: string): Promise<Assessment | null>;
  listAssessments(filter?: AssessmentFilterQuery): Promise<{ assessments: Assessment[]; total: number }>;
  deleteAssessment(id: string): Promise<boolean>;

  saveBlueprint(blueprint: Blueprint): Promise<Blueprint>;
  findBlueprintById(id: string): Promise<Blueprint | null>;
  findLatestBlueprintByAssessmentId(assessmentId: string): Promise<Blueprint | null>;
  listBlueprintsByAssessmentId(assessmentId: string): Promise<Blueprint[]>;
}
