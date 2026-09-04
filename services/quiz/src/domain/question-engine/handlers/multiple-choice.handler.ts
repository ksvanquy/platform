import { AuthoringQuestion } from '../../authoring/quiz-version.entity.js';
import { DeliveryQuestion, DeliveryQuestionOption } from '../../delivery/delivery-sanitizer.js';
import {
  QuestionTypeHandler,
  QuestionEvaluation,
  QuestionEvaluationContext,
} from '../question-handler.interface.js';

export interface MultipleChoiceAnswerPayload {
  selectedOptionIds: string[];
}

export class MultipleChoiceHandler
  implements QuestionTypeHandler<MultipleChoiceAnswerPayload | string[]> {
  readonly type = 'multiple-choice';

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

    let selectedIds: unknown;

    if (Array.isArray(answer)) {
      selectedIds = answer;
    } else if (typeof answer === 'object' && 'selectedOptionIds' in answer) {
      selectedIds = (answer as { selectedOptionIds: unknown }).selectedOptionIds;
    }

    if (!Array.isArray(selectedIds)) {
      return { valid: false, reason: 'Must specify selectedOptionIds as an array' };
    }

    const validOptionIds = new Set(question.options?.map((o) => o.id) ?? []);
    for (const id of selectedIds) {
      if (typeof id !== 'string' || !validOptionIds.has(id)) {
        return {
          valid: false,
          reason: `Option ID "${id}" is invalid or does not belong to question options`,
        };
      }
    }

    return { valid: true };
  }

  evaluate(
    question: AuthoringQuestion,
    answer: MultipleChoiceAnswerPayload | string[],
    context?: QuestionEvaluationContext
  ): QuestionEvaluation {
    const maxScore = question.points || 1;
    const selectedIds = Array.isArray(answer) ? answer : answer?.selectedOptionIds ?? [];

    const correctOptionIds = new Set(
      question.options?.filter((o) => o.isCorrect).map((o) => o.id) ?? []
    );
    const candidateSet = new Set(selectedIds);

    let correctSelected = 0;
    let wrongSelected = 0;

    for (const id of candidateSet) {
      if (correctOptionIds.has(id)) {
        correctSelected++;
      } else {
        wrongSelected++;
      }
    }

    const totalCorrectOptions = correctOptionIds.size;
    const isExactMatch =
      correctSelected === totalCorrectOptions &&
      wrongSelected === 0 &&
      candidateSet.size === totalCorrectOptions;

    if (context?.strategyType === 'exact-match' || !context?.strategyType) {
      if (isExactMatch) {
        return {
          isCorrect: true,
          scoreAwarded: maxScore,
          maxScore,
          feedback: 'Correct answer',
        };
      }
      return {
        isCorrect: false,
        scoreAwarded: 0,
        maxScore,
        feedback: 'Incorrect answer: exact match required',
      };
    }

    if (context.strategyType === 'partial-credit') {
      if (totalCorrectOptions === 0) {
        return { isCorrect: false, scoreAwarded: 0, maxScore };
      }

      const pointPerCorrect = maxScore / totalCorrectOptions;
      const rawScore = correctSelected * pointPerCorrect - wrongSelected * pointPerCorrect;
      const scoreAwarded = Math.max(0, Math.round(rawScore * 100) / 100);

      return {
        isCorrect: isExactMatch,
        scoreAwarded,
        maxScore,
        feedback: `Partial credit: ${correctSelected}/${totalCorrectOptions} correct, ${wrongSelected} incorrect`,
      };
    }

    if (context.strategyType === 'negative-marking') {
      if (isExactMatch) {
        return { isCorrect: true, scoreAwarded: maxScore, maxScore, feedback: 'Correct' };
      }
      const penaltyRate = context.negativeMarkingPenalty ?? 0.25;
      const penalty = Math.round(maxScore * penaltyRate * 100) / 100;
      return {
        isCorrect: false,
        scoreAwarded: -penalty,
        maxScore,
        feedback: `Incorrect. Deducted ${penalty} points`,
      };
    }

    return { isCorrect: isExactMatch, scoreAwarded: isExactMatch ? maxScore : 0, maxScore };
  }
}
