import { describe, it, expect } from 'vitest';
import {
  QuizSanitizer,
  SessionAccessGuard,
  AnswerPayloadValidator,
  ResultSanitizer,
  shuffleArray,
} from '../../src/application/dtos/quiz.dto.js';
import { Question, Quiz } from '../../src/domain/entities/quiz.js';
import { QuizSession } from '../../src/domain/state-machine/quiz-session.js';
import { EvaluationResult } from '../../src/domain/scoring/scoring.factory.js';

describe('Trụ Cột 3: Data Sanitization & Security Boundary Tests', () => {
  describe('1. Zero-Leakage Sanitizer (Lọc rò rỉ đáp án)', () => {
    it('should strip correctAnswer and internal scoring options from question', () => {
      const sensitiveQuestion: Question = {
        id: 'q1',
        type: 'SINGLE',
        prompt: 'Thủ đô của Pháp?',
        points: 2,
        correctAnswer: 'Paris',
        metadata: {
          explanation: 'Paris là thủ đô nước Pháp.',
          scoringOptions: { penalty: 1 },
          tolerance: 0.5,
          options: [
            { id: 'opt1', content: 'Paris', isCorrect: true },
            { id: 'opt2', content: 'London', isCorrect: false },
          ],
        },
      };

      const sanitized = QuizSanitizer.sanitizeQuestion(sensitiveQuestion);

      expect((sanitized as any).correctAnswer).toBeUndefined();
      expect(sanitized.metadata?.scoringOptions).toBeUndefined();
      expect(sanitized.metadata?.explanation).toBeUndefined();
      expect(sanitized.metadata?.tolerance).toBeUndefined();

      // Kiểm tra mảng options đã bị tước isCorrect
      const options = sanitized.metadata?.options as any[];
      expect(options[0].isCorrect).toBeUndefined();
      expect(options[0].content).toBe('Paris');
      expect(options[1].isCorrect).toBeUndefined();
    });

    it('should shuffle pairs right side in MATCHING questions', () => {
      const matchingQuestion: Question = {
        id: 'm1',
        type: 'MATCHING',
        prompt: 'Ghép cặp:',
        correctAnswer: { p1: 'R1', p2: 'R2', p3: 'R3', p4: 'R4', p5: 'R5' },
        metadata: {
          pairs: [
            { id: 'p1', left: 'L1', right: 'R1' },
            { id: 'p2', left: 'L2', right: 'R2' },
            { id: 'p3', left: 'L3', right: 'R3' },
            { id: 'p4', left: 'L4', right: 'R4' },
            { id: 'p5', left: 'L5', right: 'R5' },
          ],
        },
      };

      const sanitized = QuizSanitizer.sanitizeQuestion(matchingQuestion);
      expect((sanitized as any).correctAnswer).toBeUndefined();
      const pairs = sanitized.metadata?.pairs as Array<{ id: string; left: string; right: string }>;
      expect(pairs).toHaveLength(5);
      // Đảm bảo các vế trái giữ nguyên vị trí
      expect(pairs.map((p) => p.left)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    });

    it('should shuffle itemsToOrder in ORDERING questions', () => {
      const orderingQuestion: Question = {
        id: 'o1',
        type: 'ORDERING',
        prompt: 'Sắp xếp quy trình:',
        correctAnswer: ['step1', 'step2', 'step3', 'step4'],
        metadata: {
          itemsToOrder: [
            { id: 'step1', content: 'Bước 1' },
            { id: 'step2', content: 'Bước 2' },
            { id: 'step3', content: 'Bước 3' },
            { id: 'step4', content: 'Bước 4' },
          ],
        },
      };

      const sanitized = QuizSanitizer.sanitizeQuestion(orderingQuestion);
      expect((sanitized as any).correctAnswer).toBeUndefined();
      const items = sanitized.metadata?.itemsToOrder as Array<{ id: string; content: string }>;
      expect(items).toHaveLength(4);
    });
  });

  describe('2. Session Ownership & Access Guard (Chống IDOR)', () => {
    const session = new QuizSession({
      id: 'sess_secret_123',
      userId: 'user_alice',
      quizId: 'quiz_math',
      durationMinutes: 20,
    });

    it('should allow genuine owner to access session', () => {
      expect(() => {
        SessionAccessGuard.verifyOwnership(session, 'user_alice');
      }).not.toThrow();
    });

    it('should reject unauthorized user trying to hijack session', () => {
      expect(() => {
        SessionAccessGuard.verifyOwnership(session, 'attacker_bob');
      }).toThrow('Forbidden: You do not have permission to access session sess_secret_123.');
    });

    it('should reject empty or missing userId', () => {
      expect(() => {
        SessionAccessGuard.verifyOwnership(session, '');
      }).toThrow('Unauthorized: Missing userId.');
    });
  });

  describe('3. Answer Payload Validator & Tampering Guard (Kiểm soát dữ liệu đầu vào)', () => {
    it('SINGLE: should trim and truncate overly long string', () => {
      const clean = AnswerPayloadValidator.validateAndClean('SINGLE', '   opt_A   ');
      expect(clean).toBe('opt_A');

      const longStr = 'a'.repeat(300);
      const truncated = AnswerPayloadValidator.validateAndClean('SINGLE', longStr) as string;
      expect(truncated).toHaveLength(200);
    });

    it('SINGLE: should reject non-string and non-number types', () => {
      expect(() => {
        AnswerPayloadValidator.validateAndClean('SINGLE', { evil: true });
      }).toThrow('Single choice answer must be a string or number.');
    });

    it('MULTIPLE: should reject invalid arrays or oversized array payloads', () => {
      expect(() => {
        AnswerPayloadValidator.validateAndClean('MULTIPLE', 'not_an_array');
      }).toThrow('MULTIPLE answer must be an array.');

      const hugeArray = new Array(60).fill('item');
      expect(() => {
        AnswerPayloadValidator.validateAndClean('MULTIPLE', hugeArray);
      }).toThrow(/Payload too large/);
    });

    it('FILL_IN: should enforce string type and maximum character limit', () => {
      const hugeText = 'x'.repeat(2500);
      expect(() => {
        AnswerPayloadValidator.validateAndClean('FILL_IN', hugeText);
      }).toThrow('Fill-in answer exceeds maximum length of 2000 characters.');

      expect(() => {
        AnswerPayloadValidator.validateAndClean('FILL_IN', 12345);
      }).toThrow('Fill-in answer must be a text string.');
    });

    it('MATCHING: should sanitize dictionary and ignore non-string keys', () => {
      const payload = {
        left_1: 'right_1',
        left_2: '   right_2   ',
      };
      const clean = AnswerPayloadValidator.validateAndClean('MATCHING', payload) as Record<string, string>;
      expect(clean['left_1']).toBe('right_1');
      expect(clean['left_2']).toBe('right_2');
    });

    it('NUMERIC: should enforce finite numbers and reject NaN / Infinity', () => {
      expect(AnswerPayloadValidator.validateAndClean('NUMERIC', '3.14')).toBe(3.14);
      expect(AnswerPayloadValidator.validateAndClean('NUMERIC', 42)).toBe(42);

      expect(() => {
        AnswerPayloadValidator.validateAndClean('NUMERIC', 'invalid_number');
      }).toThrow('Numeric answer must be a valid finite number.');

      expect(() => {
        AnswerPayloadValidator.validateAndClean('NUMERIC', Infinity);
      }).toThrow('Numeric answer must be a valid finite number.');
    });
  });

  describe('4. Result Reveal Policy & Sanitizer (Chính sách công bố kết quả)', () => {
    const fullResult: EvaluationResult = {
      totalScoreAwarded: 9,
      totalMaxScore: 10,
      percentage: 90,
      isPassed: true,
      details: {
        q1: { isCorrect: true, scoreAwarded: 5, maxScore: 5, feedback: 'OK' },
        q2: { isCorrect: true, scoreAwarded: 4, maxScore: 5, feedback: 'OK' },
      },
    };

    it('should reveal full details when policy allows', () => {
      const res = ResultSanitizer.sanitize(fullResult, { showDetails: true });
      expect(res.details).toBeDefined();
      expect(res.totalScoreAwarded).toBe(9);
    });

    it('should hide question details when showTotalScoreOnly is true', () => {
      const res = ResultSanitizer.sanitize(fullResult, { showTotalScoreOnly: true });
      expect(res.totalScoreAwarded).toBe(9);
      expect(res.percentage).toBe(90);
      expect(res.isPassed).toBe(true);
      expect(res.details).toBeUndefined();
    });

    it('should show only Pass/Fail when showPassFailOnly is true', () => {
      const res = ResultSanitizer.sanitize(fullResult, { showPassFailOnly: true });
      expect(res.isPassed).toBe(true);
      expect(res.totalScoreAwarded).toBeUndefined();
      expect(res.details).toBeUndefined();
    });
  });
});
