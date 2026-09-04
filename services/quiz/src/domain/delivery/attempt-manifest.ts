import { QuizVersion } from '../authoring/quiz-version.entity.js';

export interface AttemptManifest {
  readonly quizVersionId: string;
  readonly questionIds: readonly string[];                  // Thứ tự câu hỏi đã snapshot
  readonly optionOrders: Readonly<Record<string, readonly string[]>>; // questionId -> danh sách optionIds đã snapshot
  readonly timeLimitMinutes: number;
  readonly startedAt: string;
  readonly deadline: string;
}

/**
 * Thuật toán xáo trộn Fisher-Yates bất biến, hỗ trợ hàm sinh số ngẫu nhiên truyền vào (deterministic testing)
 */
function shuffleArray<T>(array: readonly T[], randomFn: () => number = Math.random): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class AttemptManifestFactory {
  /**
   * Tạo bản snapshot bất biến cho một lượt thi, đóng băng hoàn toàn thứ tự câu hỏi và đáp án.
   */
  static create(
    version: QuizVersion,
    startedAt: Date,
    randomFn: () => number = Math.random
  ): AttemptManifest {
    let questionIds = version.questions.map((q) => q.id);
    if (version.randomizationPolicy.shuffleQuestions) {
      questionIds = shuffleArray(questionIds, randomFn);
    }

    const optionOrders: Record<string, readonly string[]> = {};
    for (const q of version.questions) {
      if (q.options && q.options.length > 0) {
        let optIds = q.options.map((o) => o.id);
        if (version.randomizationPolicy.shuffleOptions) {
          optIds = shuffleArray(optIds, randomFn);
        }
        optionOrders[q.id] = Object.freeze(optIds);
      }
    }

    const deadlineDate = new Date(startedAt.getTime() + version.durationMinutes * 60 * 1000);

    return Object.freeze({
      quizVersionId: version.id,
      questionIds: Object.freeze(questionIds),
      optionOrders: Object.freeze(optionOrders),
      timeLimitMinutes: version.durationMinutes,
      startedAt: startedAt.toISOString(),
      deadline: deadlineDate.toISOString(),
    });
  }
}
