import { AuthoringQuestion } from '../authoring/quiz-version.entity.js';
import { DeliveryQuestion } from '../delivery/delivery-sanitizer.js';

export interface QuestionEvaluation {
  readonly isCorrect: boolean;
  readonly scoreAwarded: number;
  readonly maxScore: number;
  readonly feedback?: string;
}

export interface QuestionEvaluationContext {
  readonly strategyType?: 'exact-match' | 'partial-credit' | 'negative-marking';
  readonly negativeMarkingPenalty?: number;
}

export interface QuestionTypeHandler<TAnswer = unknown> {
  readonly type: string;
  sanitizeForDelivery(question: AuthoringQuestion, orderedOptionIds?: readonly string[]): DeliveryQuestion;
  validateAnswerPayload(question: AuthoringQuestion, answer: unknown): { valid: boolean; reason?: string };
  evaluate(
    question: AuthoringQuestion,
    answer: TAnswer,
    context?: QuestionEvaluationContext
  ): QuestionEvaluation;
}
