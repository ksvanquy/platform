import { Question, PublicQuestion, Quiz } from '../../domain/entities/quiz.js';
import { EvaluationResult } from '../../domain/scoring/scoring.factory.js';
import { QuizSession } from '../../domain/state-machine/quiz-session.js';

/**
 * 1. Thuật toán Fisher-Yates xáo trộn mảng an toàn (Không làm thay đổi mảng gốc)
 */
export function shuffleArray<T>(array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 2. Question & Quiz Sanitizer
 * Loại bỏ triệt để correctAnswer, barem chấm điểm nội bộ, và xáo trộn các danh sách lựa chọn/ghép cặp
 */
export class QuizSanitizer {
  static sanitizeQuestion(question: Question): PublicQuestion {
    // Tách bỏ hoàn toàn correctAnswer
    const { correctAnswer, ...rest } = question;

    if (!rest.metadata) {
      return { ...rest };
    }

    const metadataCopy: Record<string, unknown> = { ...rest.metadata };

    // Tước bỏ nội bộ cấu hình chấm điểm nếu có
    delete metadataCopy.scoringOptions;
    delete metadataCopy.explanation;
    delete metadataCopy.tolerance;

    // Loại bỏ thuộc tính isCorrect nếu nằm lọt trong options (ví dụ đề thi trắc nghiệm legacy)
    if (Array.isArray(metadataCopy.options)) {
      metadataCopy.options = (metadataCopy.options as Array<Record<string, unknown>>).map((opt) => {
        const { isCorrect, ...safeOpt } = opt;
        return safeOpt;
      });
    }

    // Câu hỏi MATCHING: Xáo trộn danh sách vế phải (hoặc pairs) để thí sinh không đoán được thứ tự
    if (Array.isArray(metadataCopy.pairs)) {
      const pairs = metadataCopy.pairs as Array<{ id: string; left: string; right: string }>;
      const shuffledRights = shuffleArray(pairs.map((p) => p.right));
      metadataCopy.pairs = pairs.map((p, idx) => ({
        id: p.id,
        left: p.left,
        right: shuffledRights[idx],
      }));
    }

    // Câu hỏi ORDERING: Xáo trộn thứ tự các bước trước khi gửi cho thí sinh sắp xếp
    if (Array.isArray(metadataCopy.itemsToOrder)) {
      metadataCopy.itemsToOrder = shuffleArray(
        metadataCopy.itemsToOrder as Array<{ id: string; content: string }>
      );
    }

    return {
      ...rest,
      metadata: metadataCopy,
    };
  }

  static sanitizeQuiz(quiz: Quiz): Omit<Quiz, 'questions'> & { questions: PublicQuestion[] } {
    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      durationMinutes: quiz.durationMinutes,
      passingPercentage: quiz.passingPercentage,
      questions: quiz.questions.map((q) => this.sanitizeQuestion(q)),
    };
  }
}

/**
 * 3. Session Access & Ownership Guard
 * Chống lỗ hổng IDOR (Insecure Direct Object Reference)
 */
export class SessionAccessGuard {
  static verifyOwnership(session: QuizSession, requestingUserId: string): void {
    if (!requestingUserId || requestingUserId.trim() === '') {
      throw new Error('Unauthorized: Missing userId.');
    }
    if (session.userId !== requestingUserId) {
      throw new Error(`Forbidden: You do not have permission to access session ${session.id}.`);
    }
  }
}

/**
 * 4. Deep Payload Inspection & Input Tampering Guard
 * Kiểm soát kiểu dữ liệu và giới hạn kích thước payload, chống Buffer Overflow / DoS / Injection
 */
export class AnswerPayloadValidator {
  static validateAndClean(questionType: string, rawAnswer: unknown): unknown {
    if (rawAnswer === undefined || rawAnswer === null) {
      return null;
    }

    const type = questionType.toUpperCase();

    switch (type) {
      case 'SINGLE': {
        if (typeof rawAnswer !== 'string' && typeof rawAnswer !== 'number') {
          throw new Error('Single choice answer must be a string or number.');
        }
        return String(rawAnswer).slice(0, 200).trim();
      }

      case 'MULTIPLE':
      case 'ORDERING': {
        if (!Array.isArray(rawAnswer)) {
          throw new Error(`${type} answer must be an array.`);
        }
        if (rawAnswer.length > 50) {
          throw new Error(`Payload too large: ${type} contains too many items (max 50).`);
        }
        return rawAnswer.map((item) => String(item).slice(0, 200).trim());
      }

      case 'FILL_IN': {
        if (typeof rawAnswer !== 'string') {
          throw new Error('Fill-in answer must be a text string.');
        }
        if (rawAnswer.length > 2000) {
          throw new Error('Fill-in answer exceeds maximum length of 2000 characters.');
        }
        return rawAnswer.trim();
      }

      case 'MATCHING': {
        if (typeof rawAnswer !== 'object' || Array.isArray(rawAnswer)) {
          throw new Error('Matching answer must be a key-value dictionary.');
        }
        const entries = Object.entries(rawAnswer as Record<string, unknown>);
        if (entries.length > 50) {
          throw new Error('Matching answer dictionary exceeds maximum allowed pairs.');
        }
        const cleaned: Record<string, string> = {};
        for (const [k, v] of entries) {
          if (typeof k === 'string' && v !== undefined && v !== null) {
            cleaned[k.slice(0, 100)] = String(v).slice(0, 200).trim();
          }
        }
        return cleaned;
      }

      case 'NUMERIC': {
        const num = Number(rawAnswer);
        if (isNaN(num) || !isFinite(num)) {
          throw new Error('Numeric answer must be a valid finite number.');
        }
        return num;
      }

      default:
        return rawAnswer;
    }
  }
}

/**
 * 5. Result Reveal Policy & Sanitizer
 * Kiểm soát mức độ công bố kết quả thi (Ẩn đáp án đúng trong kỳ thi chung)
 */
export interface ResultRevealPolicy {
  showTotalScoreOnly?: boolean;
  showPassFailOnly?: boolean;
  showDetails?: boolean;
}

export class ResultSanitizer {
  static sanitize(
    result: EvaluationResult,
    policy: ResultRevealPolicy = { showDetails: true }
  ): Partial<EvaluationResult> {
    if (policy.showPassFailOnly) {
      return {
        isPassed: result.isPassed,
      };
    }

    if (policy.showTotalScoreOnly) {
      return {
        totalScoreAwarded: result.totalScoreAwarded,
        totalMaxScore: result.totalMaxScore,
        percentage: result.percentage,
        isPassed: result.isPassed,
      };
    }

    return result;
  }
}
