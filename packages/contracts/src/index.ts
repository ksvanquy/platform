export * from './auth/principal.js';
export * from './auth/ownership.js';
export * from './quiz/quiz.js';
export * from './quiz/attempt.js';
export * from './taxonomy/taxonomy.js';

export type QuestionType =
  | 'SINGLE'
  | 'MULTIPLE'
  | 'FILL_IN'
  | 'MATCHING'
  | 'ORDERING'
  | 'NUMERIC';

export type SessionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'SUBMITTED' | 'EXPIRED';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
