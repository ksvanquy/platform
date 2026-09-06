export interface QuizSummary {
  id: string;
  code?: string;
  title: string;
  description?: string;
  durationMinutes: number;
  passingPercentage?: number;
  totalQuestions?: number;
  isPublic?: boolean;
  status?: string;
  primaryNodeId?: string | null;
  currentPublishedVersionId?: string | null;
}

export interface QuizDetailDTO extends QuizSummary {
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateQuizInput {
  code: string;
  title: string;
  description?: string;
  durationMinutes?: number;
  passingPercentage?: number;
  isPublic?: boolean;
  primaryNodeId?: string | null;
}

export interface UpdateQuizInput {
  title?: string;
  description?: string;
  isPublic?: boolean;
  primaryNodeId?: string | null;
}
