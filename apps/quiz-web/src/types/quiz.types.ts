export type QuestionType =
  | 'SINGLE'
  | 'MULTIPLE'
  | 'FILL_IN'
  | 'MATCHING'
  | 'ORDERING'
  | 'NUMERIC';

export interface QuestionOption {
  readonly id: string;
  readonly content: string;
}

export interface MatchingPair {
  readonly id: string;
  readonly left: string;
  readonly right: string;
}

export interface OrderItem {
  readonly id: string;
  readonly content: string;
}

export interface QuestionMetadata {
  readonly options?: readonly QuestionOption[];
  readonly pairs?: readonly MatchingPair[];
  readonly itemsToOrder?: readonly OrderItem[];
  readonly [key: string]: unknown;
}

export interface QuestionDTO {
  readonly id: string;
  readonly type: QuestionType;
  readonly prompt: string;
  readonly points: number;
  readonly metadata?: QuestionMetadata;
}

export type SessionStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'SUBMITTED'
  | 'TIMED_OUT_GRADED'
  | 'GRADED'
  | 'EXPIRED';

export interface SessionDTO {
  readonly id: string;
  readonly userId: string;
  readonly quizId: string;
  readonly durationMinutes: number;
  readonly status: SessionStatus;
  readonly startedAt: string;
  readonly deadline?: string;
  readonly submissionDeadline?: string;
  readonly remainingSeconds?: number;
  readonly serverTime?: string;
  readonly answers?: Record<string, unknown>;
}

export interface StartQuizResponse {
  readonly success: boolean;
  readonly data: {
    readonly session: SessionDTO;
    readonly questions: readonly QuestionDTO[];
  };
}

export interface SaveAnswerPayload {
  readonly sessionId: string;
  readonly userId: string;
  readonly questionId: string;
  readonly answer: unknown;
  readonly sequenceNumber?: number;
}

export interface SaveAnswerResponse {
  readonly success: boolean;
  readonly message: string;
}
