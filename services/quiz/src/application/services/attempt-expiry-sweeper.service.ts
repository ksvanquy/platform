import { AuthoringRepositoryPort, DeliveryRepositoryPort } from '../../domain/ports/assessment.repository.ports.js';
import { AssessmentScoringEngine } from '../../domain/scoring/assessment-scoring.engine.js';
import { Attempt } from '../../domain/delivery/attempt.aggregate.js';

export interface SweptAttemptDetail {
  readonly attemptId: string;
  readonly userId: string;
  readonly quizId: string;
  readonly score: number;
  readonly maxScore: number;
  readonly passed: boolean;
  readonly submittedAt: string;
}

export interface SweepResult {
  readonly totalFound: number;
  readonly sweptCount: number;
  readonly sweptAttempts: readonly SweptAttemptDetail[];
  readonly timestamp: string;
}

export interface SweeperStatus {
  readonly isRunning: boolean;
  readonly intervalMs: number;
  readonly lastRunAt?: string;
  readonly totalSweptAllTime: number;
}

/**
 * AttemptExpirySweeperService
 *
 * Chịu trách nhiệm quét và cưỡng chế thu bài (Auto-Submit) các ca thi quá hạn:
 * 1. Chạy ngầm định kỳ (Background Daemon) hoặc qua trigger từ Cloud Scheduler.
 * 2. Tìm tất cả các attempt có trạng thái IN_PROGRESS nhưng đã vượt quá Official Deadline + Grace Period.
 * 3. Chuyển trạng thái sang TIMED_OUT_GRADED (Zero Tolerance cho làm thêm giờ).
 * 4. Tự động kích hoạt AssessmentScoringEngine để chấm điểm bài thi dựa trên các đáp án đã lưu trước đó.
 * 5. Lưu trạng thái hoàn tất vào Repository để thí sinh khi re-sync lập tức nhận được bảng điểm.
 */
export class AttemptExpirySweeperService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number = 30000;
  private lastRunAt?: Date;
  private totalSweptAllTime: number = 0;

  constructor(
    private readonly authoringRepo: AuthoringRepositoryPort,
    private readonly deliveryRepo: DeliveryRepositoryPort
  ) {}

  /**
   * Thực hiện một chu kỳ quét và tự động thu bài các ca thi quá hạn
   */
  async sweep(now: Date = new Date(), gracePeriodMs: number = 15000): Promise<SweepResult> {
    this.lastRunAt = now;
    const expiredAttempts = await this.deliveryRepo.findExpiredInProgressAttempts(now, gracePeriodMs);

    const sweptAttempts: SweptAttemptDetail[] = [];

    for (const attempt of expiredAttempts) {
      try {
        // 1. Chuyển đổi trạng thái sang TIMED_OUT_GRADED
        attempt.submit(now, gracePeriodMs);

        // 2. Chấm điểm bài làm
        const version = await this.authoringRepo.findVersionById(attempt.quizVersionId);
        let score = 0;
        let maxScore = 0;
        let passed = false;

        if (version) {
          const scoreResult = AssessmentScoringEngine.evaluate({
            questions: version.questions,
            answers: attempt.answers,
            scoringPolicy: version.scoringPolicy,
            passingScore: version.passingScore,
          });

          attempt.grade(scoreResult);
          score = scoreResult.score;
          maxScore = scoreResult.maxScore;
          passed = scoreResult.passed;
        }

        // 3. Lưu lại bản ghi đã hoàn tất
        await this.deliveryRepo.saveAttempt(attempt);

        sweptAttempts.push({
          attemptId: attempt.id,
          userId: attempt.userId,
          quizId: attempt.quizId,
          score,
          maxScore,
          passed,
          submittedAt: now.toISOString(),
        });
      } catch (err) {
        console.error(`[AttemptExpirySweeperService] Lỗi khi xử lý attempt ${attempt.id}:`, err);
      }
    }

    this.totalSweptAllTime += sweptAttempts.length;

    return {
      totalFound: expiredAttempts.length,
      sweptCount: sweptAttempts.length,
      sweptAttempts,
      timestamp: now.toISOString(),
    };
  }

  /**
   * Khởi chạy vòng lặp ngầm (Background Worker)
   */
  start(intervalMs: number = 30000): void {
    if (this.timer) {
      this.stop();
    }
    this.intervalMs = intervalMs;
    this.timer = setInterval(() => {
      this.sweep().catch((err) => {
        console.error('[AttemptExpirySweeperService] Lỗi trong background sweep cycle:', err);
      });
    }, this.intervalMs);

    // unref để không chặn tiến trình Node.js kết thúc trong test runner
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  /**
   * Dừng vòng lặp ngầm
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Kiểm tra trạng thái hoạt động của Sweeper
   */
  getStatus(): SweeperStatus {
    return {
      isRunning: this.timer !== null,
      intervalMs: this.intervalMs,
      lastRunAt: this.lastRunAt?.toISOString(),
      totalSweptAllTime: this.totalSweptAllTime,
    };
  }
}
