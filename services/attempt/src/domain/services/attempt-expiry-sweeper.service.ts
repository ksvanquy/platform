import type { AttemptRepositoryPort, ExamClientPort } from '../ports/attempt.repository.port.js';
import { AttemptScoringEngine } from '../scoring/attempt-scoring.engine.js';

export interface SweepResult {
  sweptCount: number;
  sweptAttemptIds: string[];
  errors: string[];
  timestamp: string;
}

export interface SweeperDaemonStatus {
  isRunning: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  totalSweptCount: number;
  lastResult: SweepResult | null;
}

export class AttemptExpirySweeperService {
  private timer: NodeJS.Timeout | null = null;
  private isSweeping = false;
  private intervalMs = 30000;
  private lastRunAt: Date | null = null;
  private totalSweptCount = 0;
  private lastResult: SweepResult | null = null;

  constructor(
    private readonly attemptRepo: AttemptRepositoryPort,
    private readonly examClient: ExamClientPort
  ) {}

  start(intervalMs = 30000): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.intervalMs = intervalMs;
    this.timer = setInterval(() => {
      this.sweep().catch((err) => {
        console.error('⚠️ Error during automated attempt sweep daemon execution:', err);
      });
    }, this.intervalMs);
    console.log(`🧹 AttemptExpirySweeperService daemon started (polling every ${intervalMs / 1000}s).`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('🛑 AttemptExpirySweeperService daemon stopped.');
    }
  }

  getStatus(): SweeperDaemonStatus {
    return {
      isRunning: this.timer !== null,
      intervalMs: this.intervalMs,
      lastRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
      totalSweptCount: this.totalSweptCount,
      lastResult: this.lastResult,
    };
  }

  async sweep(now: Date = new Date(), gracePeriodMs = 60000): Promise<SweepResult> {
    if (this.isSweeping) {
      return {
        sweptCount: 0,
        sweptAttemptIds: [],
        errors: ['Sweeper is already running in parallel'],
        timestamp: now.toISOString(),
      };
    }

    this.isSweeping = true;
    this.lastRunAt = now;

    const result: SweepResult = {
      sweptCount: 0,
      sweptAttemptIds: [],
      errors: [],
      timestamp: now.toISOString(),
    };

    try {
      // 1. Tìm các bài thi đang làm dở đã quá hạn (deadline + gracePeriodMs < now)
      const expiredAttempts = await this.attemptRepo.findExpiredInProgressAttempts(now, gracePeriodMs);

      for (const attempt of expiredAttempts) {
        try {
          // 2. Ép buộc nộp bài do quá hạn (TIMED_OUT_GRADED)
          attempt.submit(now, gracePeriodMs);

          // 3. Lấy snapshot đề thi bất biến để chấm điểm
          const snapshot = await this.examClient.getExamSnapshot(attempt.examId, attempt.variantCode);
          if (snapshot && snapshot.frozenPayload?.questions) {
            const scoreResult = AttemptScoringEngine.evaluate({
              questions: snapshot.frozenPayload.questions,
              answers: attempt.answers,
              scoringPolicy: snapshot.frozenPayload.scoringPolicy,
              passingScore: 0,
            });
            attempt.grade(scoreResult);
          }

          // 4. Lưu trạng thái mới vào database
          await this.attemptRepo.saveAttempt(attempt);

          result.sweptCount++;
          result.sweptAttemptIds.push(attempt.id);
          this.totalSweptCount++;
        } catch (itemErr: any) {
          result.errors.push(`Attempt ${attempt.id}: ${itemErr.message}`);
        }
      }

      this.lastResult = result;
      return result;
    } finally {
      this.isSweeping = false;
    }
  }
}
