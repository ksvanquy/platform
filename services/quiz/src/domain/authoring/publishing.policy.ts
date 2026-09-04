import { QuizVersion, AuthoringQuestion } from './quiz-version.entity.js';
import { QuizPublishInvariantViolationError } from '../errors/domain-errors.js';

export class PublishingPolicy {
  /**
   * Domain Invariants: Xác thực tính toàn vẹn và hợp lệ tuyệt đối của đề thi trước khi xuất bản.
   */
  static validate(version: QuizVersion): void {
    if (!version.questions || version.questions.length === 0) {
      throw new QuizPublishInvariantViolationError(
        'A quiz must have at least one question before it can be published',
        { code: 'EMPTY_QUESTIONS' }
      );
    }

    if (version.totalPoints <= 0) {
      throw new QuizPublishInvariantViolationError(
        'Total points of all questions must be greater than 0',
        { code: 'ZERO_TOTAL_POINTS', totalPoints: version.totalPoints }
      );
    }

    if (version.durationMinutes <= 0) {
      throw new QuizPublishInvariantViolationError(
        'Quiz duration must be greater than 0 minutes',
        { code: 'INVALID_DURATION', duration: version.durationMinutes }
      );
    }

    const seenQuestionIds = new Set<string>();

    for (let i = 0; i < version.questions.length; i++) {
      const q = version.questions[i];
      const questionIndex = i + 1;

      if (!q.id || q.id.trim() === '') {
        throw new QuizPublishInvariantViolationError(
          `Question at index ${questionIndex} is missing an ID`,
          { code: 'MISSING_QUESTION_ID', questionIndex }
        );
      }

      if (seenQuestionIds.has(q.id)) {
        throw new QuizPublishInvariantViolationError(
          `Duplicate question ID "${q.id}" detected at index ${questionIndex}`,
          { code: 'DUPLICATE_QUESTION_ID', questionId: q.id, questionIndex }
        );
      }
      seenQuestionIds.add(q.id);

      if (!q.prompt || q.prompt.trim() === '') {
        throw new QuizPublishInvariantViolationError(
          `Question "${q.id}" has an empty prompt`,
          { code: 'EMPTY_PROMPT', questionId: q.id }
        );
      }

      if (q.points <= 0) {
        throw new QuizPublishInvariantViolationError(
          `Question "${q.id}" points must be greater than 0 (found ${q.points})`,
          { code: 'INVALID_POINTS', questionId: q.id, points: q.points }
        );
      }

      this.validateQuestionByType(q);
    }
  }

  private static validateQuestionByType(q: AuthoringQuestion): void {
    switch (q.type) {
      case 'single-choice': {
        if (!q.options || q.options.length < 2) {
          throw new QuizPublishInvariantViolationError(
            `Single-choice question "${q.id}" must contain at least 2 options`,
            { code: 'INSUFFICIENT_OPTIONS', questionId: q.id, count: q.options?.length ?? 0 }
          );
        }

        const optionIds = new Set<string>();
        let correctCount = 0;

        for (const opt of q.options) {
          if (!opt.id || opt.id.trim() === '') {
            throw new QuizPublishInvariantViolationError(
              `Question "${q.id}" has an option with missing ID`,
              { code: 'MISSING_OPTION_ID', questionId: q.id }
            );
          }
          if (optionIds.has(opt.id)) {
            throw new QuizPublishInvariantViolationError(
              `Question "${q.id}" contains duplicate option ID "${opt.id}"`,
              { code: 'DUPLICATE_OPTION_ID', questionId: q.id, optionId: opt.id }
            );
          }
          optionIds.add(opt.id);

          if (!opt.text || opt.text.trim() === '') {
            throw new QuizPublishInvariantViolationError(
              `Question "${q.id}" option "${opt.id}" text cannot be empty`,
              { code: 'EMPTY_OPTION_TEXT', questionId: q.id, optionId: opt.id }
            );
          }

          if (opt.isCorrect) {
            correctCount++;
          }
        }

        if (correctCount !== 1) {
          throw new QuizPublishInvariantViolationError(
            `Single-choice question "${q.id}" must have exactly 1 correct option (found ${correctCount})`,
            { code: 'INVALID_CORRECT_COUNT', questionId: q.id, correctCount }
          );
        }
        break;
      }

      case 'multiple-choice': {
        if (!q.options || q.options.length < 2) {
          throw new QuizPublishInvariantViolationError(
            `Multiple-choice question "${q.id}" must contain at least 2 options`,
            { code: 'INSUFFICIENT_OPTIONS', questionId: q.id, count: q.options?.length ?? 0 }
          );
        }

        const optionIds = new Set<string>();
        let correctCount = 0;

        for (const opt of q.options) {
          if (!opt.id || opt.id.trim() === '') {
            throw new QuizPublishInvariantViolationError(
              `Question "${q.id}" has an option with missing ID`,
              { code: 'MISSING_OPTION_ID', questionId: q.id }
            );
          }
          if (optionIds.has(opt.id)) {
            throw new QuizPublishInvariantViolationError(
              `Question "${q.id}" contains duplicate option ID "${opt.id}"`,
              { code: 'DUPLICATE_OPTION_ID', questionId: q.id, optionId: opt.id }
            );
          }
          optionIds.add(opt.id);

          if (!opt.text || opt.text.trim() === '') {
            throw new QuizPublishInvariantViolationError(
              `Question "${q.id}" option "${opt.id}" text cannot be empty`,
              { code: 'EMPTY_OPTION_TEXT', questionId: q.id, optionId: opt.id }
            );
          }

          if (opt.isCorrect) {
            correctCount++;
          }
        }

        if (correctCount < 1) {
          throw new QuizPublishInvariantViolationError(
            `Multiple-choice question "${q.id}" must have at least 1 correct option`,
            { code: 'NO_CORRECT_OPTION', questionId: q.id }
          );
        }
        break;
      }

      case 'true-false': {
        if (typeof q.correctAnswer !== 'boolean') {
          throw new QuizPublishInvariantViolationError(
            `True/False question "${q.id}" must specify a boolean correctAnswer (received ${typeof q.correctAnswer})`,
            { code: 'INVALID_TRUE_FALSE_ANSWER', questionId: q.id }
          );
        }
        break;
      }

      default:
        // Future extensible question types
        break;
    }
  }
}
