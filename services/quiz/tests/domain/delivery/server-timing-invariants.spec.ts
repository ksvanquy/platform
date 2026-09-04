import { describe, it, expect } from 'vitest';
import { Attempt } from '../../../src/domain/delivery/attempt.aggregate.js';
import { AttemptManifest } from '../../../src/domain/delivery/attempt-manifest.js';
import { AttemptTimeExpiredError } from '../../../src/domain/errors/domain-errors.js';

describe('Server Timing Hardening & Two-Tier Invariants (Zero-Trust Clock)', () => {
  const manifest: AttemptManifest = {
    quizVersionId: 'ver_exam_1',
    questionIds: ['q1', 'q2', 'q3'],
    optionOrders: {
      q1: ['optA', 'optB'],
    },
    timeLimitMinutes: 10,
    startedAt: '2026-09-04T10:00:00.000Z',
    deadline: '2026-09-04T10:10:00.000Z',
  };

  const createStartedAttempt = () => {
    const attempt = new Attempt({
      id: 'att_timer_test',
      userId: 'candidate_01',
      quizId: 'quiz_math',
      quizVersionId: 'ver_exam_1',
    });
    attempt.start(new Date('2026-09-04T10:00:00.000Z'), manifest);
    return attempt;
  };

  describe('Tier 1: Answer Window Enforcement (Zero Tolerance for Overtime Answers)', () => {
    it('should accept answer when submitted before deadline (now < deadline)', () => {
      const attempt = createStartedAttempt();
      const withinDeadline = new Date('2026-09-04T10:09:59.000Z');

      attempt.recordAnswer('q1', 'optA', 100, withinDeadline);

      expect(attempt.answers['q1']).toBeDefined();
      expect(attempt.answers['q1'].answer).toBe('optA');
      expect(attempt.status).toBe('IN_PROGRESS');
    });

    it('should REJECT recordAnswer when now > deadline EVEN IF within grace period (deadline < now <= deadline + 15s)', () => {
      const attempt = createStartedAttempt();
      // Deadline is 10:10:00.000Z. Here now is 10:10:05.000Z (5 seconds past deadline, within 15s grace period)
      const pastDeadlineWithinGrace = new Date('2026-09-04T10:10:05.000Z');

      expect(() => {
        attempt.recordAnswer('q1', 'optB', 200, pastDeadlineWithinGrace);
      }).toThrow(AttemptTimeExpiredError);

      // Verify the answer was NOT recorded
      expect(attempt.answers['q1']).toBeUndefined();
      // Status remains IN_PROGRESS because grace period for submission has not passed yet
      expect(attempt.status).toBe('IN_PROGRESS');
    });

    it('should transition to TIMED_OUT_GRADED and throw when recordAnswer arrives after deadline + gracePeriod', () => {
      const attempt = createStartedAttempt();
      // Deadline 10:10:00 + 15s grace = 10:10:15. Here now is 10:10:20 (past grace period)
      const afterGracePeriod = new Date('2026-09-04T10:10:20.000Z');

      expect(() => {
        attempt.recordAnswer('q1', 'optB', 300, afterGracePeriod);
      }).toThrow(AttemptTimeExpiredError);

      // Ca thi tự động chuyển thành TIMED_OUT_GRADED
      expect(attempt.status).toBe('TIMED_OUT_GRADED');
      expect(attempt.submittedAt).toEqual(afterGracePeriod);
    });
  });

  describe('Tier 2: Submission Window Enforcement (Transit Grace Period for Final Packet)', () => {
    it('should mark as SUBMITTED when candidate submits before deadline', () => {
      const attempt = createStartedAttempt();
      const submitTime = new Date('2026-09-04T10:09:50.000Z');

      attempt.submit(submitTime);

      expect(attempt.status).toBe('SUBMITTED');
      expect(attempt.submittedAt).toEqual(submitTime);
    });

    it('should ACCEPT submission as valid SUBMITTED during grace period (deadline < now <= deadline + 15s)', () => {
      const attempt = createStartedAttempt();
      // Candidate clicked submit at 10:09:59, network transit arrived at server at 10:10:08 (8s past deadline)
      const transitArrival = new Date('2026-09-04T10:10:08.000Z');

      attempt.submit(transitArrival, 15000);

      // Must be validly SUBMITTED, NOT timed out!
      expect(attempt.status).toBe('SUBMITTED');
      expect(attempt.submittedAt).toEqual(transitArrival);
    });

    it('should mark as TIMED_OUT_GRADED when submission arrives AFTER grace period (now > deadline + 15s)', () => {
      const attempt = createStartedAttempt();
      // Late submission arrival: 10:10:16 (16s past deadline, grace is 15s)
      const lateArrival = new Date('2026-09-04T10:10:16.000Z');

      attempt.submit(lateArrival, 15000);

      expect(attempt.status).toBe('TIMED_OUT_GRADED');
      expect(attempt.submittedAt).toEqual(lateArrival);
    });
  });

  describe('Domain Timing State Inspections', () => {
    it('should compute remainingTimeMs accurately', () => {
      const attempt = createStartedAttempt();
      const checkTime = new Date('2026-09-04T10:05:00.000Z'); // 5 minutes remaining

      expect(attempt.remainingTimeMs(checkTime)).toBe(5 * 60 * 1000);

      // After deadline
      const afterDeadline = new Date('2026-09-04T10:10:01.000Z');
      expect(attempt.remainingTimeMs(afterDeadline)).toBe(0);
    });

    it('should separate isAnswerTimeExpired and isSubmissionTimeExpired correctly', () => {
      const attempt = createStartedAttempt();
      const beforeDeadline = new Date('2026-09-04T10:09:59.000Z');
      const inGrace = new Date('2026-09-04T10:10:05.000Z');
      const afterGrace = new Date('2026-09-04T10:10:20.000Z');

      // Before deadline
      expect(attempt.isAnswerTimeExpired(beforeDeadline)).toBe(false);
      expect(attempt.isSubmissionTimeExpired(beforeDeadline)).toBe(false);

      // During grace period (10:10:05)
      expect(attempt.isAnswerTimeExpired(inGrace)).toBe(true); // Answer window closed!
      expect(attempt.isSubmissionTimeExpired(inGrace)).toBe(false); // Submission window still open!

      // After grace period (10:10:20)
      expect(attempt.isAnswerTimeExpired(afterGrace)).toBe(true);
      expect(attempt.isSubmissionTimeExpired(afterGrace)).toBe(true);
    });

    it('should include server-authoritative timing metadata in toJSON()', () => {
      const attempt = createStartedAttempt();
      const now = new Date('2026-09-04T10:02:30.000Z');

      const json = attempt.toJSON(now, 15000);

      expect(json.deadline).toBe('2026-09-04T10:10:00.000Z');
      expect(json.submissionDeadline).toBe('2026-09-04T10:10:15.000Z');
      // 10:10:00 - 10:02:30 = 7 minutes 30 seconds = 450 seconds
      expect(json.remainingSeconds).toBe(450);
    });
  });
});
