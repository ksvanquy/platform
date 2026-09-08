export type QuestionType =
  | 'SINGLE'
  | 'MULTIPLE'
  | 'FILL_IN'
  | 'MATCHING'
  | 'ORDERING'
  | 'NUMERIC'
  | 'ESSAY';

export type QuestionDifficulty =
  | 'REMEMBER'
  | 'UNDERSTAND'
  | 'APPLY'
  | 'ANALYZE';

export type QuestionStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED';

export type MediaAssetType = 'IMAGE' | 'AUDIO' | 'VIDEO';

export interface MediaAsset {
  type: MediaAssetType;
  url: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface QuestionOption {
  id: string;
  content: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface MatchingPair {
  leftId: string;
  leftText: string;
  rightId: string;
  rightText: string;
}

export interface QuestionRevisionDTO {
  id: string;
  questionId: string;
  revisionNumber: number;
  prompt: string;
  options: QuestionOption[];
  pairs?: MatchingPair[];
  explanation?: string;
  rubric?: Record<string, unknown>;
  mediaAssets?: MediaAsset[];
  createdBy: string;
  createdAt: string;
}

export interface QuestionDTO {
  id: string;
  code: string;
  type: QuestionType;
  topicNodeId?: string | null;
  gradeNodeId?: string | null;
  difficulty: QuestionDifficulty;
  defaultPoints: number;
  status: QuestionStatus;
  currentRevisionId?: string | null;
  ownerId: string;
  currentRevision?: QuestionRevisionDTO;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuestionInput {
  code: string;
  type: QuestionType;
  topicNodeId?: string | null;
  gradeNodeId?: string | null;
  difficulty: QuestionDifficulty;
  defaultPoints?: number;
  prompt: string;
  options: QuestionOption[];
  pairs?: MatchingPair[];
  explanation?: string;
  rubric?: Record<string, unknown>;
  mediaAssets?: MediaAsset[];
}

export interface UpdateQuestionInput {
  difficulty?: QuestionDifficulty;
  defaultPoints?: number;
  status?: QuestionStatus;
  topicNodeId?: string | null;
  gradeNodeId?: string | null;
  prompt?: string;
  options?: QuestionOption[];
  pairs?: MatchingPair[];
  explanation?: string;
  rubric?: Record<string, unknown>;
  mediaAssets?: MediaAsset[];
}

export interface QuestionFilterQuery {
  topicNodeId?: string;
  gradeNodeId?: string;
  difficulty?: QuestionDifficulty;
  type?: QuestionType;
  status?: QuestionStatus;
  search?: string;
  ownerId?: string;
  limit?: number;
  offset?: number;
}
