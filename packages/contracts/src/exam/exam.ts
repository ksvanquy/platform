import {
  QuestionType,
  QuestionOption,
  MatchingPair,
  MediaAsset,
} from '../question/question.js';
import { ScoringPolicyConfig } from '../assessment/assessment.js';

export type ExamStatus = 'READY' | 'ACTIVE' | 'CLOSED';

export interface SanitizedOption {
  id: string;
  content: string;
}

export interface SanitizedQuestionItem {
  id: string;
  type: QuestionType;
  prompt: string;
  options: SanitizedOption[];
  points: number;
  pairs?: Array<{ leftId: string; leftText: string; rightId: string; rightText: string }>;
  mediaAssets?: MediaAsset[];
}

export interface SanitizedExamManifest {
  examId: string;
  variantCode: string;
  title: string;
  durationMinutes: number;
  totalQuestions: number;
  totalPoints: number;
  questions: SanitizedQuestionItem[];
  serverTimestamp: number;
}

export interface FrozenQuestionItem {
  id: string;
  revisionId: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  pairs?: MatchingPair[];
  points: number;
  explanation?: string;
  rubric?: Record<string, unknown>;
}

export interface ExamSnapshotDTO {
  id: string;
  examId: string;
  variantCode: string;
  contentHash: string;
  frozenPayload: {
    questions: FrozenQuestionItem[];
    scoringPolicy: ScoringPolicyConfig;
  };
  sanitizedManifest: SanitizedExamManifest;
  createdAt: string;
}

export interface ExamVariantSummary {
  variantCode: string;
  contentHash: string;
  questionCount: number;
}

export interface ExamDTO {
  id: string;
  assessmentId: string;
  code: string;
  title: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes: number;
  isPublished: boolean;
  randomizationSeedBase: number;
  status: ExamStatus;
  variantsCount?: number;
  variants?: ExamVariantSummary[];
  createdAt: string;
}

export interface GenerateExamInput {
  assessmentId: string;
  code: string;
  title: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number;
  variantsCount?: number;
  seedBase?: number;
}

export interface UpdateExamInput {
  title?: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number;
  isPublished?: boolean;
  status?: ExamStatus;
}
