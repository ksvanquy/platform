import { AuthoringQuestion } from '../../authoring/quiz-version.entity.js';
import { DeliveryQuestion } from '../../delivery/delivery-sanitizer.js';
import {
  QuestionTypeHandler,
  QuestionEvaluation,
  QuestionEvaluationContext,
} from '../question-handler.interface.js';

export interface TrueFalseAnswerPayload {
  booleanValue: boolean;
}

export class TrueFalseHandler
  implements QuestionTypeHandler<TrueFalseAnswerPayload | boolean> {
  readonly type = 'true-false';

  sanitizeForDelivery(
    question: AuthoringQuestion,
    _orderedOptionIds?: readonly string[]
  ): DeliveryQuestion {
    return Object.freeze({
      id: question.id,
      type: this.type,
      prompt: question.prompt,
      points: question.points,
      metadata: question.metadata ? Object.freeze({ ...question.metadata }) : undefined,
    });
  }

  validateAnswerPayload(
    _question: AuthoringQuestion,
    answer: unknown
  ): { valid: boolean; reason?: string } {
    if (answer === null || answer === undefined) {
      return { valid: false, reason: 'Answer payload cannot be null or undefined' };
    }

    let val: unknown;
    if (typeof answer === 'boolean') {
      val = answer;
    } else if (typeof answer === 'string' && (answer === 'true' || answer === 'false')) {
      val = answer === 'true';
    } else if (typeof answer === 'object' && answer !== null && 'booleanValue' in answer) {
      val = (answer as { booleanValue: unknown }).booleanValue;
    }

    if (typeof val !== 'boolean') {
      return { valid: false, reason: 'Must specify booleanValue as true or false' };
    }

    return { valid: true };
  }

  evaluate(
    question: AuthoringQuestion,
    answer: TrueFalseAnswerPayload | boolean | string,
    context?: QuestionEvaluationContext
  ): QuestionEvaluation {
    const maxScore = question.points || 1;
    let candidateVal: boolean | undefined;
    if (typeof answer === 'boolean') {
      candidateVal = answer;
    } else if (typeof answer === 'string') {
      candidateVal = answer === 'true';
    } else if (typeof answer === 'object' && answer !== null && 'booleanValue' in answer) {
      candidateVal = typeof answer.booleanValue === 'boolean' ? answer.booleanValue : answer.booleanValue === 'true';
    }

    const isCorrect = question.correctAnswer === candidateVal;

    if (isCorrect) {
      return {
        isCorrect: true,
        scoreAwarded: maxScore,
        maxScore,
        feedback: 'Correct',
      };
    }

    if (context?.strategyType === 'negative-marking') {
      const penaltyRate = context.negativeMarkingPenalty ?? 0.25;
      const penalty = Math.round(maxScore * penaltyRate * 100) / 100;
      return {
        isCorrect: false,
        scoreAwarded: -penalty,
        maxScore,
        feedback: `Incorrect. Deducted ${penalty} points`,
      };
    }

    return {
      isCorrect: false,
      scoreAwarded: 0,
      maxScore,
      feedback: 'Incorrect',
    };
  }
}
