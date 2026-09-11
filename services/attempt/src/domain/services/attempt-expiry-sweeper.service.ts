import type { AttemptRepositoryPort, ExamClientPort } from '../ports/attempt.repository.port.js';
import { AttemptScoringEngine } from '../scoring/attempt-scoring.engine.js';
import { AttemptMetrics } from '../../infrastructure/metrics/attempt.metrics.js';

export const SWEEPER_LOCK_KEY = 987654321;

export interface SweepResult {
  sweptCount: number;
  sweptAttemptIds: string[];
  errors: string[];
  timestamp: string;
  skippedDueToLock?: boolean;
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

  async sweep(now: Date = new Date(), gracePeriodMs = 15000, batchLimit = 50): Promise<SweepResult> {
    if (this.isSweeping) {
      return {
        sweptCount: 0,
        sweptAttemptIds: [],
        errors: ['Sweeper is already running in parallel within this instance'],
        timestamp: now.toISOString(),
      };
    }

    this.isSweeping = true;
    this.lastRunAt = now;
    AttemptMetrics.incrementSweeperRuns();

    try {
      // Task CONC-4.1: Thử giành Distributed Advisory Lock (pg_try_advisory_xact_lock)
      // Nếu một replica khác đang chạy chu kỳ quét, lập tức bỏ qua chu kỳ này một cách an toàn mà không block
      const lockExecution = await this.attemptRepo.withAdvisoryLock(SWEEPER_LOCK_KEY, async () => {
        const result: SweepResult = {
          sweptCount: 0,
          sweptAttemptIds: [],
          errors: [],
          timestamp: now.toISOString(),
          skippedDueToLock: false,
        };

        // Task CONC-4.2: Tối ưu quét theo lô với FOR UPDATE SKIP LOCKED
        const expiredAttempts = await this.attemptRepo.findExpiredInProgressAttempts(now, gracePeriodMs, batchLimit);

        for (const attempt of expiredAttempts) {
          try {
            // Ép buộc nộp bài do quá hạn (TIMED_OUT_GRADED)
            attempt.submit(now, gracePeriodMs);

            // Lấy snapshot đề thi bất biến để chấm điểm
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

            // Tăng version và lưu trạng thái mới
            attempt.incrementVersion();
            await this.attemptRepo.saveAttempt(attempt);

            result.sweptCount++;
            result.sweptAttemptIds.push(attempt.id);
            this.totalSweptCount++;
          } catch (itemErr: any) {
            result.errors.push(`Attempt ${attempt.id}: ${itemErr.message}`);
          }
        }

        return result;
      });

      if (!lockExecution.acquired) {
        // Ghi nhận metrics replica bỏ qua quét do instance khác đang giữ lock
        AttemptMetrics.incrementSweeperLockedSkips();
        const skippedResult: SweepResult = {
          sweptCount: 0,
          sweptAttemptIds: [],
          errors: ['Skipped: Sweeper advisory lock held by another active replica'],
          timestamp: now.toISOString(),
          skippedDueToLock: true,
        };
        this.lastResult = skippedResult;
        return skippedResult;
      }

      const result = lockExecution.result!;
      this.lastResult = result;
      return result;
    } finally {
      this.isSweeping = false;
    }
  }
}
