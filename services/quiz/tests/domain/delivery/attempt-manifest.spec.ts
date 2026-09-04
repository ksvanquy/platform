import { describe, it, expect } from 'vitest';
import { QuizVersion, AuthoringQuestion } from '../../../src/domain/authoring/quiz-version.entity.js';
import { AttemptManifestFactory } from '../../../src/domain/delivery/attempt-manifest.js';
import { DeliverySanitizer } from '../../../src/domain/delivery/delivery-sanitizer.js';

describe('Delivery Sub-Domain: AttemptManifest & DeliverySanitizer Snapshot', () => {
  const sampleQuestions: AuthoringQuestion[] = [
    {
      id: 'q1',
      type: 'single-choice',
      prompt: 'What is the capital of France?',
      points: 1,
      options: [
        { id: 'opt_a', text: 'London', isCorrect: false },
        { id: 'opt_b', text: 'Paris', isCorrect: true },
        { id: 'opt_c', text: 'Berlin', isCorrect: false },
      ],
      explanation: 'Paris is the capital of France',
    },
    {
      id: 'q2',
      type: 'true-false',
      prompt: 'Lightning never strikes the same place twice',
      points: 1,
      correctAnswer: false,
      explanation: 'It frequently strikes the same place multiple times',
    },
  ];

  const version = new QuizVersion({
    id: 'ver_geo_1',
    quizId: 'quiz_geo',
    versionNumber: 1,
    durationMinutes: 15,
    passingScore: 2,
    questions: sampleQuestions,
    scoringPolicy: { strategyType: 'exact-match' },
    randomizationPolicy: { shuffleQuestions: true, shuffleOptions: true },
  });

  it('should freeze and preserve exact manifest snapshot', () => {
    const startedAt = new Date('2026-09-03T10:00:00.000Z');
    const manifest = AttemptManifestFactory.create(version, startedAt);

    expect(manifest.quizVersionId).toBe('ver_geo_1');
    expect(manifest.timeLimitMinutes).toBe(15);
    expect(manifest.startedAt).toBe('2026-09-03T10:00:00.000Z');
    expect(manifest.deadline).toBe('2026-09-03T10:15:00.000Z');
    expect(manifest.questionIds.length).toBe(2);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.questionIds)).toBe(true);
  });

  it('should sanitize delivery questions to prevent answer leakage', () => {
    const startedAt = new Date('2026-09-03T10:00:00.000Z');
    const manifest = AttemptManifestFactory.create(version, startedAt);

    const deliveryQuestions = DeliverySanitizer.sanitizeQuestions(version.questions, manifest);

    expect(deliveryQuestions.length).toBe(2);

    // Assert questions are ordered according to manifest
    expect(deliveryQuestions.map((q) => q.id)).toEqual([...manifest.questionIds]);

    for (const dq of deliveryQuestions) {
      // Must not leak correctAnswer or explanation
      expect((dq as any).correctAnswer).toBeUndefined();
      expect((dq as any).explanation).toBeUndefined();

      if (dq.options) {
        for (const opt of dq.options) {
          // Must not leak isCorrect
          expect((opt as any).isCorrect).toBeUndefined();
        }

        // Option order must match manifest optionOrders
        const expectedOrder = manifest.optionOrders[dq.id];
        if (expectedOrder) {
          expect(dq.options.map((o) => o.id)).toEqual([...expectedOrder]);
        }
      }
    }
  });
});
