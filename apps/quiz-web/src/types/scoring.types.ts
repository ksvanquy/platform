export interface QuestionEvaluationDetail {
  readonly isCorrect: boolean;
  readonly scoreAwarded: number;
  readonly maxScore: number;
  readonly feedback?: string;
}

export interface EvaluationResult {
  readonly totalScoreAwarded: number;
  readonly totalMaxScore: number;
  readonly percentage: number;
  readonly isPassed?: boolean;
  readonly details?: Record<string, QuestionEvaluationDetail>;
}

export interface ResultRevealPolicy {
  readonly showDetails?: boolean;
  readonly showTotalScoreOnly?: boolean;
  readonly showPassFailOnly?: boolean;
}

export interface SubmitQuizPayload {
  readonly sessionId: string;
  readonly userId: string;
  readonly policy?: ResultRevealPolicy;
}

export interface SubmitQuizResponse {
  readonly success: boolean;
  readonly data: EvaluationResult;
}
