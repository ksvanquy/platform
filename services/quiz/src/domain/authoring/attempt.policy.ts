import {
  AttemptAlreadyInProgressError,
  MaxAttemptsExceededError,
} from '../errors/domain-errors.js';

export interface ExistingAttemptSummary {
  id: string;
  userId: string;
  quizId: string;
  status: 'CREATED' | 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'TIMED_OUT_GRADED';
}

export class AttemptPolicy {
  /**
   * Kiểm tra và bảo vệ các quy chế thi:
   * 1. Chống gian lận mở nhiều tab (chỉ cho phép 1 lượt thi active cùng lúc trên 1 bài thi).
   * 2. Giới hạn số lần làm lại bài (maxAttempts).
   */
  static validateCanStart(
    userId: string,
    quizId: string,
    maxAttempts: number,
    existingAttempts: readonly ExistingAttemptSummary[]
  ): void {
    // 1. Kiểm tra lượt thi dở dang (ACTIVE)
    const activeAttempt = existingAttempts.find(
      (a) => a.userId === userId && a.quizId === quizId && (a.status === 'IN_PROGRESS' || a.status === 'CREATED')
    );

    if (activeAttempt) {
      throw new AttemptAlreadyInProgressError(userId, quizId, activeAttempt.id);
    }

    // 2. Kiểm tra số lần thi đã hoàn thành (nếu có giới hạn > 0)
    if (maxAttempts > 0) {
      const completedCount = existingAttempts.filter(
        (a) =>
          a.userId === userId &&
          a.quizId === quizId &&
          (a.status === 'SUBMITTED' || a.status === 'GRADED' || a.status === 'TIMED_OUT_GRADED')
      ).length;

      if (completedCount >= maxAttempts) {
        throw new MaxAttemptsExceededError(userId, quizId, maxAttempts);
      }
    }
  }
}
