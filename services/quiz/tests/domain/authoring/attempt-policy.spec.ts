import { describe, it, expect } from 'vitest';
import { AttemptPolicy } from '../../../src/domain/authoring/attempt.policy.js';
import {
  AttemptAlreadyInProgressError,
  MaxAttemptsExceededError,
} from '../../../src/domain/errors/domain-errors.js';

describe('Authoring Sub-Domain: AttemptPolicy & Concurrency Defense', () => {
  const userId = 'user_123';
  const quizId = 'quiz_math';

  it('should allow starting an attempt when user has no existing attempts', () => {
    expect(() => {
      AttemptPolicy.validateCanStart(userId, quizId, 2, []);
    }).not.toThrow();
  });

  it('should block starting a new attempt if user already has an IN_PROGRESS attempt (Multi-tab defense)', () => {
    const existing = [
      { id: 'att_1', userId, quizId, status: 'IN_PROGRESS' as const },
    ];

    expect(() => {
      AttemptPolicy.validateCanStart(userId, quizId, 3, existing);
    }).toThrow(AttemptAlreadyInProgressError);
  });

  it('should block starting a new attempt if user already has a CREATED attempt', () => {
    const existing = [
      { id: 'att_0', userId, quizId, status: 'CREATED' as const },
    ];

    expect(() => {
      AttemptPolicy.validateCanStart(userId, quizId, 3, existing);
    }).toThrow(AttemptAlreadyInProgressError);
  });

  it('should block starting a new attempt if user exceeded maxAttempts', () => {
    const existing = [
      { id: 'att_1', userId, quizId, status: 'GRADED' as const },
      { id: 'att_2', userId, quizId, status: 'TIMED_OUT_GRADED' as const },
    ];

    // maxAttempts is 2, user already has 2 completed attempts
    expect(() => {
      AttemptPolicy.validateCanStart(userId, quizId, 2, existing);
    }).toThrow(MaxAttemptsExceededError);
  });

  it('should allow retake when completed attempts is less than maxAttempts', () => {
    const existing = [
      { id: 'att_1', userId, quizId, status: 'GRADED' as const },
    ];

    // maxAttempts is 2, user only has 1 completed attempt
    expect(() => {
      AttemptPolicy.validateCanStart(userId, quizId, 2, existing);
    }).not.toThrow();
  });

  it('should allow unlimited attempts when maxAttempts is 0', () => {
    const existing = [
      { id: 'att_1', userId, quizId, status: 'GRADED' as const },
      { id: 'att_2', userId, quizId, status: 'GRADED' as const },
      { id: 'att_3', userId, quizId, status: 'SUBMITTED' as const },
    ];

    // maxAttempts = 0 (unlimited)
    expect(() => {
      AttemptPolicy.validateCanStart(userId, quizId, 0, existing);
    }).not.toThrow();
  });
});
