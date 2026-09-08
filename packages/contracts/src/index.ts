export * from './auth/principal.js';
export * from './auth/ownership.js';
export * from './taxonomy/taxonomy.js';

// Specialized Microservices Domain Contracts (DDD)
export * from './question/index.js';
export * from './assessment/index.js';
export * from './exam/index.js';
export * from './attempt/index.js';

// Legacy Quiz Contracts for backward compatibility
export * from './quiz/quiz.js';
export type { QuizAttempt } from './quiz/attempt.js';

export type SessionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'SUBMITTED' | 'EXPIRED';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
