import { Question, UserAnswerValue } from '../entities/quiz.js';

export interface EvaluationDetail {
  readonly isCorrect: boolean;
  readonly scoreAwarded: number; // Điểm thực tế đạt được
  readonly maxScore: number;     // Điểm tối đa của câu hỏi
  readonly feedback?: string;    // Nhận xét, lý do đúng/sai, số cặp/ý đúng
}

export type ScoreResult = EvaluationDetail;

export interface ScoringStrategy<TQuestion extends Question = Question, TAnswer = UserAnswerValue> {
  /**
   * Pure evaluation function: Zero external side effects, 100% deterministic.
   */
  evaluate(question: TQuestion, userAnswer: TAnswer): EvaluationDetail;
}

export const roundToTwoDecimals = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

export const normalizeText = (text: unknown): string => {
  if (typeof text !== 'string') return '';
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
};
