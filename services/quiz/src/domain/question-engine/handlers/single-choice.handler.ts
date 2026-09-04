import { AuthoringQuestion } from '../../authoring/quiz-version.entity.js';
import { DeliveryQuestion, DeliveryQuestionOption } from '../../delivery/delivery-sanitizer.js';
import {
  QuestionTypeHandler,
  QuestionEvaluation,
  QuestionEvaluationContext,
} from '../question-handler.interface.js';

export interface SingleChoiceAnswerPayload {
  selectedOptionId: string;
}

export class SingleChoiceHandler implements QuestionTypeHandler<SingleChoiceAnswerPayload | string> {
  readonly type = 'single-choice';

  sanitizeForDelivery(
    question: AuthoringQuestion,
    orderedOptionIds?: readonly string[]
  ): DeliveryQuestion {
    let sanitizedOptions: DeliveryQuestionOption[] | undefined;

    if (question.options && question.options.length > 0) {
      const optionMap = new Map(question.options.map((o) => [o.id, o]));
      const idsToUse = orderedOptionIds && orderedOptionIds.length > 0
        ? orderedOptionIds
        : question.options.map((o) => o.id);

      sanitizedOptions = idsToUse
        .map((id) => {
          const opt = optionMap.get(id);
          return opt ? { id: opt.id, text: opt.text } : undefined;
        })
        .filter((opt): opt is DeliveryQuestionOption => opt !== undefined);
    }

    return Object.freeze({
      id: question.id,
      type: this.type,
      prompt: question.prompt,
      points: question.points,
      options: sanitizedOptions ? Object.freeze(sanitizedOptions) : undefined,
      metadata: question.metadata ? Object.freeze({ ...question.metadata }) : undefined,
    });
  }

  validateAnswerPayload(
    question: AuthoringQuestion,
    answer: unknown
  ): { valid: boolean; reason?: string } {
    if (answer === null || answer === undefined) {
      return { valid: false, reason: 'Answer payload cannot be null or undefined' };
    }

    let selectedId: string | undefined;

    if (typeof answer === 'string') {
      selectedId = answer;
    } else if (typeof answer === 'object' && 'selectedOptionId' in answer) {
      selectedId = (answer as { selectedOptionId: unknown }).selectedOptionId as string;
    }

    if (!selectedId || typeof selectedId !== 'string' || selectedId.trim() === '') {
      return { valid: false, reason: 'Must specify a valid selectedOptionId string' };
    }

    const validOptionIds = question.options?.map((o) => o.id) ?? [];
    if (!validOptionIds.includes(selectedId)) {
      return {
        valid: false,
        reason: `Selected option "${selectedId}" does not exist in question options`,
      };
    }

    return { valid: true };
  }

  evaluate(
    question: AuthoringQuestion,
    answer: SingleChoiceAnswerPayload | string,
    context?: QuestionEvaluationContext
  ): QuestionEvaluation {
    const maxScore = question.points || 1;
    const selectedId = typeof answer === 'string' ? answer : answer?.selectedOptionId;

    const correctOption = question.options?.find((o) => o.isCorrect);
    const isCorrect = !!correctOption && correctOption.id === selectedId;

    if (isCorrect) {
      return {
        isCorrect: true,
        scoreAwarded: maxScore,
        maxScore,
        feedback: 'Correct answer',
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
      feedback: 'Incorrect answer',
    };
  }
}
