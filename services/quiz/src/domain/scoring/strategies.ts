import {
  ScoringStrategy,
  EvaluationDetail,
  normalizeText,
  roundToTwoDecimals,
} from './scoring.strategy.js';
import { Question, UserAnswerValue } from '../entities/quiz.js';

/**
 * 1. Trắc nghiệm 1 đáp án (SINGLE)
 * Chấm đúng/sai tuyệt đối, an toàn với kiểu string/number.
 */
export class SingleChoiceStrategy implements ScoringStrategy {
  evaluate(question: Question, userAnswer: UserAnswerValue): EvaluationDetail {
    const maxScore = question.points ?? 1;
    const safeUser =
      userAnswer !== undefined && userAnswer !== null
        ? String(userAnswer).trim()
        : undefined;
    const safeCorrect =
      question.correctAnswer !== undefined && question.correctAnswer !== null
        ? String(question.correctAnswer).trim()
        : '';

    const isCorrect = safeUser !== undefined && safeUser === safeCorrect;

    return {
      isCorrect,
      scoreAwarded: isCorrect ? maxScore : 0,
      maxScore,
      feedback: isCorrect ? 'Chính xác.' : 'Chưa chính xác.',
    };
  }
}

export interface MultipleChoiceMetadata {
  allowPartial?: boolean;
  penaltyRate?: number; // Hệ số trừ điểm nếu chọn đáp án sai (mặc định: 1)
  [key: string]: unknown;
}

/**
 * 2. Trắc nghiệm nhiều đáp án (MULTIPLE)
 * Hỗ trợ cả All-or-nothing (mặc định) và Chấm điểm từng phần có trừ điểm câu sai (allowPartial: true)
 */
export class MultipleChoiceStrategy implements ScoringStrategy {
  evaluate(question: Question, userAnswer: UserAnswerValue): EvaluationDetail {
    const maxScore = question.points ?? 1;
    const correctAnswers = Array.isArray(question.correctAnswer)
      ? (question.correctAnswer as unknown[]).map((v) => String(v).trim())
      : [];

    if (
      !Array.isArray(userAnswer) ||
      userAnswer.length === 0 ||
      correctAnswers.length === 0
    ) {
      return {
        isCorrect: false,
        scoreAwarded: 0,
        maxScore,
        feedback: 'Chưa chọn đáp án.',
      };
    }

    const correctSet = new Set(correctAnswers);
    const userSet = new Set(
      userAnswer.map((v) => String(v).trim())
    );

    const metadata = (question.metadata || {}) as MultipleChoiceMetadata;
    const allowPartial = metadata.allowPartial ?? false;

    // Chế độ All-or-nothing
    if (!allowPartial) {
      const isMatch =
        correctSet.size === userSet.size &&
        [...userSet].every((ans) => correctSet.has(ans));

      return {
        isCorrect: isMatch,
        scoreAwarded: isMatch ? maxScore : 0,
        maxScore,
        feedback: isMatch ? 'Chính xác.' : 'Chưa đúng hoặc chưa đủ đáp án.',
      };
    }

    // Chế độ Chấm từng phần có phạt đáp án sai
    let correctPicks = 0;
    let wrongPicks = 0;

    for (const ans of userSet) {
      if (correctSet.has(ans)) {
        correctPicks++;
      } else {
        wrongPicks++;
      }
    }

    const pointsPerCorrect = maxScore / correctSet.size;
    const penaltyRate = metadata.penaltyRate ?? 1;
    const penalty = wrongPicks * (pointsPerCorrect * penaltyRate);
    const rawScore = correctPicks * pointsPerCorrect - penalty;
    const scoreAwarded = roundToTwoDecimals(Math.max(0, rawScore));
    const isFullyCorrect = correctPicks === correctSet.size && wrongPicks === 0;

    return {
      isCorrect: isFullyCorrect,
      scoreAwarded,
      maxScore,
      feedback: `Đúng ${correctPicks}/${correctSet.size} đáp án, sai ${wrongPicks} đáp án.`,
    };
  }
}

export interface FillInMetadata {
  caseSensitive?: boolean;
  [key: string]: unknown;
}

/**
 * 3. Điền vào chỗ trống (FILL_IN)
 * Chuẩn hóa khoảng trắng, không phân biệt hoa/thường, hỗ trợ nhiều từ đồng nghĩa
 */
export class FillInStrategy implements ScoringStrategy {
  evaluate(question: Question, userAnswer: UserAnswerValue): EvaluationDetail {
    const maxScore = question.points ?? 1;

    if (userAnswer === undefined || userAnswer === null || typeof userAnswer !== 'string') {
      return {
        isCorrect: false,
        scoreAwarded: 0,
        maxScore,
        feedback: 'Chưa trả lời.',
      };
    }

    const metadata = (question.metadata || {}) as FillInMetadata;
    const caseSensitive = metadata.caseSensitive ?? false;

    const normalize = (text: string): string => {
      if (caseSensitive) {
        return text.trim().replace(/\s+/g, ' ');
      }
      return normalizeText(text);
    };

    const normalizedUser = normalize(userAnswer);

    // Hỗ trợ một mảng các đáp án đồng nghĩa được chấp nhận
    if (Array.isArray(question.correctAnswer)) {
      const isCorrect = (question.correctAnswer as unknown[]).some(
        (cand) => normalize(String(cand)) === normalizedUser
      );
      return {
        isCorrect,
        scoreAwarded: isCorrect ? maxScore : 0,
        maxScore,
        feedback: isCorrect ? 'Chính xác.' : 'Chưa chính xác.',
      };
    }

    const isCorrect =
      typeof question.correctAnswer === 'string' &&
      normalizedUser === normalize(question.correctAnswer);

    return {
      isCorrect,
      scoreAwarded: isCorrect ? maxScore : 0,
      maxScore,
      feedback: isCorrect ? 'Chính xác.' : 'Chưa chính xác.',
    };
  }
}

/**
 * 4. Ghép cặp - CÓ HỖ TRỢ CHẤM ĐIỂM MỘT PHẦN (MATCHING)
 */
export class MatchingStrategy implements ScoringStrategy {
  evaluate(question: Question, userAnswer: UserAnswerValue): EvaluationDetail {
    const maxScore = question.points ?? 1;
    const correctPairs = question.correctAnswer as Record<string, string>;

    if (
      typeof userAnswer !== 'object' ||
      userAnswer === null ||
      Array.isArray(userAnswer) ||
      !correctPairs
    ) {
      return { isCorrect: false, scoreAwarded: 0, maxScore, feedback: 'Chưa trả lời.' };
    }

    const userAnswers = userAnswer as Record<string, string>;
    const pairIds = Object.keys(correctPairs);
    const totalPairs = pairIds.length;

    if (totalPairs === 0) {
      return {
        isCorrect: true,
        scoreAwarded: maxScore,
        maxScore,
        feedback: 'Không có cặp nào cần nối.',
      };
    }

    let correctCount = 0;
    pairIds.forEach((pairId) => {
      if (
        userAnswers[pairId] !== undefined &&
        String(userAnswers[pairId]).trim() === String(correctPairs[pairId]).trim()
      ) {
        correctCount++;
      }
    });

    const scoreAwarded = roundToTwoDecimals((correctCount / totalPairs) * maxScore);
    const isCorrect = correctCount === totalPairs;

    return {
      isCorrect,
      scoreAwarded,
      maxScore,
      feedback: `Đúng ${correctCount}/${totalPairs} cặp.`,
    };
  }
}

/**
 * 5. Sắp xếp thứ tự quy trình / dòng thời gian (ORDERING)
 * So sánh vị trí chính xác của từng phần tử trong chuỗi
 */
export class OrderingStrategy implements ScoringStrategy {
  evaluate(question: Question, userAnswer: UserAnswerValue): EvaluationDetail {
    const maxScore = question.points ?? 1;
    const correctOrder = Array.isArray(question.correctAnswer)
      ? (question.correctAnswer as unknown[]).map((item) => String(item).trim())
      : [];

    if (
      !Array.isArray(userAnswer) ||
      userAnswer.length !== correctOrder.length ||
      correctOrder.length === 0
    ) {
      return {
        isCorrect: false,
        scoreAwarded: 0,
        maxScore,
        feedback: 'Chưa hoàn thành sắp xếp toàn bộ phần tử.',
      };
    }

    let correctPositions = 0;
    for (let i = 0; i < correctOrder.length; i++) {
      if (String(userAnswer[i]).trim() === correctOrder[i]) {
        correctPositions++;
      }
    }

    const isCorrect = correctPositions === correctOrder.length;
    const scoreAwarded = roundToTwoDecimals(
      (correctPositions / correctOrder.length) * maxScore
    );

    return {
      isCorrect,
      scoreAwarded,
      maxScore,
      feedback: `Sắp xếp đúng ${correctPositions}/${correctOrder.length} vị trí.`,
    };
  }
}

export interface NumericMetadata {
  tolerance?: number; // Sai số cho phép (ví dụ: ±0.05)
  [key: string]: unknown;
}

/**
 * 6. Tính toán số học có sai số dung sai (NUMERIC)
 */
export class NumericToleranceStrategy implements ScoringStrategy {
  evaluate(question: Question, userAnswer: UserAnswerValue): EvaluationDetail {
    const maxScore = question.points ?? 1;
    const numUser = Number(userAnswer);
    const numCorrect = Number(question.correctAnswer);

    if (userAnswer === undefined || userAnswer === null || isNaN(numUser) || isNaN(numCorrect)) {
      return {
        isCorrect: false,
        scoreAwarded: 0,
        maxScore,
        feedback: 'Giá trị số không hợp lệ.',
      };
    }

    const metadata = (question.metadata || {}) as NumericMetadata;
    const tolerance = Number(metadata.tolerance ?? 0);
    const diff = Math.abs(numUser - numCorrect);
    const isCorrect = diff <= tolerance;

    return {
      isCorrect,
      scoreAwarded: isCorrect ? maxScore : 0,
      maxScore,
      feedback: isCorrect
        ? 'Chính xác.'
        : `Sai lệch ${roundToTwoDecimals(diff)} (vượt mức sai số cho phép ±${tolerance}).`,
    };
  }
}
