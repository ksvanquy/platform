import { AuthoringQuestion } from '../authoring/quiz-version.entity.js';
import { AttemptManifest } from './attempt-manifest.js';

export interface DeliveryQuestionOption {
  readonly id: string;
  readonly text: string;
}

export interface DeliveryQuestion {
  readonly id: string;
  readonly type: string;
  readonly prompt: string;
  readonly points: number;
  readonly options?: readonly DeliveryQuestionOption[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class DeliverySanitizer {
  /**
   * Khử khuẩn câu hỏi (Sanitization Boundary):
   * 1. Loại bỏ triệt để: correctAnswer, isCorrect, explanation, rubric.
   * 2. Sắp xếp thứ tự câu hỏi và thứ tự lựa chọn chuẩn xác theo AttemptManifest.
   */
  static sanitizeQuestions(
    questions: readonly AuthoringQuestion[],
    manifest: AttemptManifest
  ): readonly DeliveryQuestion[] {
    const questionMap = new Map<string, AuthoringQuestion>();
    for (const q of questions) {
      questionMap.set(q.id, q);
    }

    const deliveryQuestions: DeliveryQuestion[] = [];

    for (const qId of manifest.questionIds) {
      const q = questionMap.get(qId);
      if (!q) {
        continue;
      }

      let sanitizedOptions: DeliveryQuestionOption[] | undefined;

      if (q.options && q.options.length > 0) {
        const optionMap = new Map(q.options.map((o) => [o.id, o]));
        const orderedOptionIds = manifest.optionOrders[q.id] || q.options.map((o) => o.id);

        sanitizedOptions = orderedOptionIds
          .map((optId) => {
            const opt = optionMap.get(optId);
            return opt ? { id: opt.id, text: opt.text } : undefined;
          })
          .filter((opt): opt is DeliveryQuestionOption => opt !== undefined);
      }

      deliveryQuestions.push(
        Object.freeze({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          options: sanitizedOptions ? Object.freeze(sanitizedOptions) : undefined,
          metadata: q.metadata ? Object.freeze({ ...q.metadata }) : undefined,
        })
      );
    }

    return Object.freeze(deliveryQuestions);
  }
}
