import { describe, it, expect } from 'vitest';
import { ScoringFactory } from '../../src/domain/scoring/scoring.factory.js';
import {
  SingleChoiceStrategy,
  MultipleChoiceStrategy,
  FillInStrategy,
  MatchingStrategy,
  OrderingStrategy,
  NumericToleranceStrategy,
} from '../../src/domain/scoring/strategies.js';
import { QuizSession } from '../../src/domain/state-machine/quiz-session.js';
import { Question } from '../../src/domain/entities/quiz.js';

describe('Trụ Cột 2: Scoring Engine & Strategies Tests', () => {
  describe('1. SingleChoiceStrategy', () => {
    const strategy = new SingleChoiceStrategy();

    it('should evaluate correct answer with exact match', () => {
      const q: Question = { id: 'q1', type: 'SINGLE', prompt: '', points: 5, correctAnswer: 'opt_A' };
      const res = strategy.evaluate(q, 'opt_A');
      expect(res.isCorrect).toBe(true);
      expect(res.scoreAwarded).toBe(5);
    });

    it('should safely coerce and compare numbers and strings', () => {
      const q: Question = { id: 'q1', type: 'SINGLE', prompt: '', points: 2, correctAnswer: 1 };
      const res = strategy.evaluate(q, '1');
      expect(res.isCorrect).toBe(true);
      expect(res.scoreAwarded).toBe(2);
    });

    it('should award 0 for wrong answer', () => {
      const q: Question = { id: 'q1', type: 'SINGLE', prompt: '', points: 5, correctAnswer: 'opt_A' };
      const res = strategy.evaluate(q, 'opt_B');
      expect(res.isCorrect).toBe(false);
      expect(res.scoreAwarded).toBe(0);
    });
  });

  describe('2. MultipleChoiceStrategy', () => {
    const strategy = new MultipleChoiceStrategy();

    it('should evaluate All-or-nothing correctly by default', () => {
      const q: Question = {
        id: 'q2',
        type: 'MULTIPLE',
        prompt: '',
        points: 4,
        correctAnswer: ['A', 'C'],
      };

      // Full match
      const res1 = strategy.evaluate(q, ['A', 'C']);
      expect(res1.isCorrect).toBe(true);
      expect(res1.scoreAwarded).toBe(4);

      // Incomplete match
      const res2 = strategy.evaluate(q, ['A']);
      expect(res2.isCorrect).toBe(false);
      expect(res2.scoreAwarded).toBe(0);

      // Extra wrong choice
      const res3 = strategy.evaluate(q, ['A', 'B', 'C']);
      expect(res3.isCorrect).toBe(false);
      expect(res3.scoreAwarded).toBe(0);
    });

    it('should support partial scoring with penalty when allowPartial is true', () => {
      const q: Question = {
        id: 'q2',
        type: 'MULTIPLE',
        prompt: '',
        points: 10, // 2 correct answers: A, B => 5 pts each
        correctAnswer: ['A', 'B'],
        metadata: { allowPartial: true, penaltyRate: 1 },
      };

      // Selects 1 correct (A): gets 5 pts
      const resPartial = strategy.evaluate(q, ['A']);
      expect(resPartial.scoreAwarded).toBe(5);
      expect(resPartial.isCorrect).toBe(false);

      // Selects 1 correct (A) + 1 wrong (C): 5 - 5 = 0 pts
      const resPenalty = strategy.evaluate(q, ['A', 'C']);
      expect(resPenalty.scoreAwarded).toBe(0);
      expect(resPenalty.isCorrect).toBe(false);

      // Selects all wrong: never negative
      const resNegative = strategy.evaluate(q, ['X', 'Y', 'Z']);
      expect(resNegative.scoreAwarded).toBe(0);
    });
  });

  describe('3. FillInStrategy', () => {
    const strategy = new FillInStrategy();

    it('should normalize space and case', () => {
      const q: Question = {
        id: 'q3',
        type: 'FILL_IN',
        prompt: '',
        points: 3,
        correctAnswer: 'TypeScript',
      };
      const res = strategy.evaluate(q, '   typescript   ');
      expect(res.isCorrect).toBe(true);
      expect(res.scoreAwarded).toBe(3);
    });

    it('should support multiple synonyms as correct answers', () => {
      const q: Question = {
        id: 'q3',
        type: 'FILL_IN',
        prompt: '',
        points: 2,
        correctAnswer: ['Việt Nam', 'Vietnam', 'VN'],
      };
      const res = strategy.evaluate(q, 'vn');
      expect(res.isCorrect).toBe(true);
      expect(res.scoreAwarded).toBe(2);
    });
  });

  describe('4. MatchingStrategy', () => {
    const strategy = new MatchingStrategy();

    it('should calculate proportional partial score for matching pairs', () => {
      const q: Question = {
        id: 'q4',
        type: 'MATCHING',
        prompt: '',
        points: 6,
        correctAnswer: { p1: 'A', p2: 'B', p3: 'C' },
      };

      // 2 out of 3 pairs correct => (2/3) * 6 = 4 points
      const res = strategy.evaluate(q, { p1: 'A', p2: 'B', p3: 'WRONG' });
      expect(res.isCorrect).toBe(false);
      expect(res.scoreAwarded).toBe(4);
      expect(res.feedback).toBe('Đúng 2/3 cặp.');
    });
  });

  describe('5. OrderingStrategy', () => {
    const strategy = new OrderingStrategy();

    it('should award full score when entire sequence matches', () => {
      const q: Question = {
        id: 'q5',
        type: 'ORDERING',
        prompt: '',
        points: 6,
        correctAnswer: ['step1', 'step2', 'step3'],
      };
      const res = strategy.evaluate(q, ['step1', 'step2', 'step3']);
      expect(res.isCorrect).toBe(true);
      expect(res.scoreAwarded).toBe(6);
    });

    it('should award partial score based on correct positions', () => {
      const q: Question = {
        id: 'q5',
        type: 'ORDERING',
        prompt: '',
        points: 6,
        correctAnswer: ['step1', 'step2', 'step3'],
      };
      // step1 correct, step3 and step2 swapped => 1 out of 3 correct positions => 2 points
      const res = strategy.evaluate(q, ['step1', 'step3', 'step2']);
      expect(res.isCorrect).toBe(false);
      expect(res.scoreAwarded).toBe(2);
    });
  });

  describe('6. NumericToleranceStrategy', () => {
    const strategy = new NumericToleranceStrategy();

    it('should accept values within tolerance limit', () => {
      const q: Question = {
        id: 'q6',
        type: 'NUMERIC',
        prompt: '',
        points: 5,
        correctAnswer: 3.14,
        metadata: { tolerance: 0.02 },
      };
      const res = strategy.evaluate(q, 3.15);
      expect(res.isCorrect).toBe(true);
      expect(res.scoreAwarded).toBe(5);
    });

    it('should reject values outside tolerance limit', () => {
      const q: Question = {
        id: 'q6',
        type: 'NUMERIC',
        prompt: '',
        points: 5,
        correctAnswer: 3.14,
        metadata: { tolerance: 0.02 },
      };
      const res = strategy.evaluate(q, 3.18);
      expect(res.isCorrect).toBe(false);
      expect(res.scoreAwarded).toBe(0);
    });
  });

  describe('Extensibility & Engine Aggregation', () => {
    it('should support registering custom strategies dynamically (OCP)', () => {
      ScoringFactory.register('CUSTOM_ECHO', {
        evaluate(question, userAnswer) {
          const isCorrect = userAnswer === 'pass';
          const max = question.points ?? 1;
          return {
            isCorrect,
            scoreAwarded: isCorrect ? max : 0,
            maxScore: max,
            feedback: 'Custom evaluated',
          };
        },
      });

      expect(ScoringFactory.hasStrategy('CUSTOM_ECHO')).toBe(true);

      const q: Question = { id: 'cust1', type: 'CUSTOM_ECHO', prompt: '', points: 10 };
      const res = ScoringFactory.evaluateQuestion(q, 'pass');
      expect(res.isCorrect).toBe(true);
      expect(res.scoreAwarded).toBe(10);
    });

    it('should aggregate total scores and determine isPassed', () => {
      const questions: Question[] = [
        { id: 'q1', type: 'SINGLE', prompt: '', points: 2, correctAnswer: 'A' },
        { id: 'q2', type: 'FILL_IN', prompt: '', points: 3, correctAnswer: 'typescript' },
        {
          id: 'q3',
          type: 'MULTIPLE',
          prompt: '',
          points: 4,
          correctAnswer: ['opt1', 'opt2'],
          metadata: { allowPartial: true },
        },
        {
          id: 'q4',
          type: 'ORDERING',
          prompt: '',
          points: 3,
          correctAnswer: ['1', '2', '3'],
        },
      ];

      const userAnswers = {
        q1: 'A', // 2/2
        q2: '  TypeScript  ', // 3/3
        q3: ['opt1'], // 1/2 correct => 2/4
        q4: ['1', '3', '2'], // 1/3 correct position => 1/3
      };

      // Total = 2 + 3 + 2 + 1 = 8 / 12 => 67%
      const result = ScoringFactory.calculateScore(questions, userAnswers, 70);
      expect(result.totalMaxScore).toBe(12);
      expect(result.totalScoreAwarded).toBe(8);
      expect(result.percentage).toBe(67);
      expect(result.isPassed).toBe(false);
    });
  });

  describe('Session State Expiration Guard', () => {
    it('should block answering and mark session EXPIRED when time is up', () => {
      const startTime = new Date('2026-01-01T10:00:00Z');
      const expiredTime = new Date('2026-01-01T10:31:00Z'); // Quá 30 phút

      const session = new QuizSession({
        id: 'session_01',
        userId: 'user_99',
        quizId: 'quiz_mvp',
        durationMinutes: 30,
        startedAt: startTime,
      });

      expect(() => {
        session.answerQuestion('q1', 'opt_1', expiredTime);
      }).toThrow('Session has expired.');

      expect(session.status).toBe('EXPIRED');
    });
  });
});
