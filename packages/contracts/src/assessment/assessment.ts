import { QuestionDifficulty } from '../question/question.js';

export type AssessmentStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ARCHIVED';

export type ScoringStrategyType = 'STANDARD' | 'PARTIAL' | 'ALL_OR_NOTHING';

export interface ScoringPolicyConfig {
  strategyType: ScoringStrategyType;
  negativeMarkingPenalty?: number;
  roundingDecimal?: number;
  partialScoringThreshold?: number;
}

export interface AttemptPolicyConfig {
  durationMinutes: number;
  passingPercentage: number;
  maxAttempts: number;
  allowPause?: boolean;
  gracePeriodSeconds?: number;
}

export interface BlueprintCriterion {
  topicNodeId: string;
  difficulty: QuestionDifficulty;
  questionCount: number;
  pointsPerQuestion: number;
}

export interface BlueprintDTO {
  id: string;
  assessmentId: string;
  versionNumber: number;
  durationMinutes: number;
  passingPercentage: number;
  maxAttempts: number;
  criteria: BlueprintCriterion[];
  scoringPolicy: ScoringPolicyConfig;
  isLocked: boolean;
  createdAt: string;
}

export interface AssessmentDTO {
  id: string;
  code: string;
  title: string;
  description?: string;
  ownerId: string;
  primaryTopicNodeId?: string | null;
  gradeNodeId?: string | null;
  status: AssessmentStatus;
  currentBlueprint?: BlueprintDTO;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssessmentInput {
  code: string;
  title: string;
  description?: string;
  primaryTopicNodeId?: string | null;
  gradeNodeId?: string | null;
  durationMinutes?: number;
  passingPercentage?: number;
  maxAttempts?: number;
  criteria?: BlueprintCriterion[];
  scoringPolicy?: ScoringPolicyConfig;
}

export interface UpdateAssessmentInput {
  title?: string;
  description?: string;
  primaryTopicNodeId?: string | null;
  gradeNodeId?: string | null;
  status?: AssessmentStatus;
}

export interface UpdateBlueprintInput {
  durationMinutes?: number;
  passingPercentage?: number;
  maxAttempts?: number;
  criteria?: BlueprintCriterion[];
  scoringPolicy?: ScoringPolicyConfig;
  isLocked?: boolean;
}

export interface AssessmentFilterQuery {
  status?: AssessmentStatus;
  primaryTopicNodeId?: string;
  gradeNodeId?: string;
  ownerId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

