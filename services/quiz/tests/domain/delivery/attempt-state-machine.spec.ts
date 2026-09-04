import { describe, it, expect } from 'vitest';
import { Attempt } from '../../../src/domain/delivery/attempt.aggregate.js';
import { AttemptManifest } from '../../../src/domain/delivery/attempt-manifest.js';
import {
  AttemptAlreadySubmittedError,
  AttemptTimeExpiredError,
  OutdatedAnswerTimestampError,
  InvalidAttemptStateTransitionError,
} from '../../../src/domain/errors/domain-errors.js';

describe('Delivery Sub-Domain: Attempt State Machine & Auto-Submit on Timeout', () => {
  const sampleManifest: AttemptManifest = {
    quizVersionId: 'ver_bio_1',
    questionIds: ['q1', 'q2', 'q3'],
    optionOrders: {
      q1: ['optA', 'optB'],
    },
    timeLimitMinutes: 10,
    startedAt: '2026-09-03T10:00:00.000Z',
    deadline: '2026-09-03T10:10:00.000Z',
  };

  it('should initialize Attempt in CREATED state', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    expect(attempt.status).toBe('CREATED');
    expect(attempt.startedAt).toBeUndefined();
    expect(attempt.deadline).toBeUndefined();
  });

  it('should transition from CREATED to IN_PROGRESS on start', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    const startTime = new Date('2026-09-03T10:00:00.000Z');
    attempt.start(startTime, sampleManifest);

    expect(attempt.status).toBe('IN_PROGRESS');
    expect(attempt.startedAt).toEqual(startTime);
    expect(attempt.deadline).toEqual(new Date('2026-09-03T10:10:00.000Z'));
  });

  it('should reject start if attempt is already IN_PROGRESS', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    const startTime = new Date('2026-09-03T10:00:00.000Z');
    attempt.start(startTime, sampleManifest);

    expect(() => attempt.start(startTime, sampleManifest)).toThrow(
      InvalidAttemptStateTransitionError
    );
  });

  it('should record answer with clientTimestamp in IN_PROGRESS state', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    const startTime = new Date('2026-09-03T10:00:00.000Z');
    attempt.start(startTime, sampleManifest);

    const answerTime = new Date('2026-09-03T10:02:00.000Z');
    attempt.recordAnswer('q1', { selectedOptionId: 'optB' }, 1000, answerTime);

    expect(attempt.answers['q1']).toBeDefined();
    expect(attempt.answers['q1'].answer).toEqual({ selectedOptionId: 'optB' });
    expect(attempt.answers['q1'].clientTimestamp).toBe(1000);
  });

  it('should reject outdated answer due to out-of-order network delay (Concurrency Defense)', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    attempt.start(new Date('2026-09-03T10:00:00.000Z'), sampleManifest);

    // First request arrived with clientTimestamp 2000
    attempt.recordAnswer('q1', 'option2', 2000, new Date('2026-09-03T10:02:00.000Z'));

    // Second delayed request arrives with clientTimestamp 1500 (older)
    expect(() => {
      attempt.recordAnswer('q1', 'option1', 1500, new Date('2026-09-03T10:02:05.000Z'));
    }).toThrow(OutdatedAnswerTimestampError);

    // Value remains option2
    expect(attempt.answers['q1'].answer).toBe('option2');
  });

  it('should reject answer if question is not in attempt manifest', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    attempt.start(new Date('2026-09-03T10:00:00.000Z'), sampleManifest);

    expect(() => {
      attempt.recordAnswer('alien_question', 'test', 100, new Date('2026-09-03T10:01:00.000Z'));
    }).toThrow('does not belong to this attempt manifest');
  });

  it('should transition to SUBMITTED when submitting on time', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    attempt.start(new Date('2026-09-03T10:00:00.000Z'), sampleManifest);
    attempt.recordAnswer('q1', 'optB', 100, new Date('2026-09-03T10:05:00.000Z'));

    const submitTime = new Date('2026-09-03T10:08:00.000Z'); // Within 10 minutes
    attempt.submit(submitTime);

    expect(attempt.status).toBe('SUBMITTED');
    expect(attempt.submittedAt).toEqual(submitTime);
  });

  it('should gracefully auto-submit on timeout (TIMED_OUT_GRADED) instead of losing candidate work', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    attempt.start(new Date('2026-09-03T10:00:00.000Z'), sampleManifest);
    attempt.recordAnswer('q1', 'optB', 100, new Date('2026-09-03T10:05:00.000Z'));

    // Deadline is 10:10:00, Grace period 15s -> expired at 10:10:16
    const overdueSubmitTime = new Date('2026-09-03T10:11:00.000Z');
    attempt.submit(overdueSubmitTime);

    expect(attempt.status).toBe('TIMED_OUT_GRADED');
    expect(attempt.submittedAt).toEqual(overdueSubmitTime);
    // Answers saved before timeout are preserved!
    expect(attempt.answers['q1'].answer).toBe('optB');
  });

  it('should allow grading a SUBMITTED attempt to GRADED', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    attempt.start(new Date('2026-09-03T10:00:00.000Z'), sampleManifest);
    attempt.submit(new Date('2026-09-03T10:05:00.000Z'));

    const scoreResult = {
      score: 10,
      maxScore: 10,
      percentage: 100,
      passed: true,
      evaluatedAt: new Date(),
    };

    attempt.grade(scoreResult);

    expect(attempt.status).toBe('GRADED');
    expect(attempt.scoreResult?.score).toBe(10);
    expect(attempt.scoreResult?.passed).toBe(true);
  });

  it('should allow grading a TIMED_OUT_GRADED attempt and preserve status', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    attempt.start(new Date('2026-09-03T10:00:00.000Z'), sampleManifest);
    attempt.submit(new Date('2026-09-03T10:12:00.000Z')); // Overdue

    expect(attempt.status).toBe('TIMED_OUT_GRADED');

    const scoreResult = {
      score: 5,
      maxScore: 10,
      percentage: 50,
      passed: false,
      evaluatedAt: new Date(),
    };

    attempt.grade(scoreResult);

    expect(attempt.status).toBe('TIMED_OUT_GRADED');
    expect(attempt.scoreResult?.score).toBe(5);
  });

  it('should lock edits and throw AttemptAlreadySubmittedError when trying to answer after submission', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    attempt.start(new Date('2026-09-03T10:00:00.000Z'), sampleManifest);
    attempt.submit(new Date('2026-09-03T10:05:00.000Z'));

    expect(() => {
      attempt.recordAnswer('q1', 'optA', 500, new Date('2026-09-03T10:06:00.000Z'));
    }).toThrow(AttemptAlreadySubmittedError);
  });

  it('should support idempotent submission without throwing errors', () => {
    const attempt = new Attempt({
      id: 'att_001',
      userId: 'user_456',
      quizId: 'quiz_bio',
      quizVersionId: 'ver_bio_1',
    });

    attempt.start(new Date('2026-09-03T10:00:00.000Z'), sampleManifest);
    const submitTime = new Date('2026-09-03T10:05:00.000Z');
    attempt.submit(submitTime);

    // Call submit a second time
    attempt.submit(new Date('2026-09-03T10:06:00.000Z'));

    expect(attempt.status).toBe('SUBMITTED');
    expect(attempt.submittedAt).toEqual(submitTime);
  });
});
