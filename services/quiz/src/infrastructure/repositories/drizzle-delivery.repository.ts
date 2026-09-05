import { eq, and, lte } from 'drizzle-orm';
import { getQuizDb } from '../db/connection.js';
import { attempts } from '../db/schema.js';
import { Attempt } from '../../domain/delivery/attempt.aggregate.js';
import { AttemptStatus } from '../../domain/delivery/attempt-status.js';
import { DeliveryRepositoryPort } from '../../domain/ports/assessment.repository.ports.js';

export class DrizzleDeliveryRepository implements DeliveryRepositoryPort {
  constructor(private customDb?: any) {}

  private get db() {
    return this.customDb || getQuizDb();
  }

  async saveAttempt(attempt: Attempt): Promise<void> {
    const raw = attempt.toJSON();
    await this.db
      .insert(attempts)
      .values({
        id: raw.id,
        userId: raw.userId,
        quizId: raw.quizId,
        quizVersionId: raw.quizVersionId,
        tenantId: raw.tenantId,
        status: raw.status,
        startedAt: raw.startedAt ? new Date(raw.startedAt) : null,
        deadline: raw.deadline ? new Date(raw.deadline) : null,
        submittedAt: raw.submittedAt ? new Date(raw.submittedAt) : null,
        manifest: raw.manifest || null,
        answers: raw.answers || {},
        scoreResult: raw.scoreResult || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: attempts.id,
        set: {
          status: raw.status,
          startedAt: raw.startedAt ? new Date(raw.startedAt) : null,
          deadline: raw.deadline ? new Date(raw.deadline) : null,
          submittedAt: raw.submittedAt ? new Date(raw.submittedAt) : null,
          manifest: raw.manifest || null,
          answers: raw.answers || {},
          scoreResult: raw.scoreResult || null,
          updatedAt: new Date(),
        },
      });
  }

  async findAttemptById(id: string): Promise<Attempt | null> {
    const rows = await this.db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToAttempt(rows[0]);
  }

  async listAttemptsByUser(userId: string, quizId?: string): Promise<Attempt[]> {
    const condition = quizId
      ? and(eq(attempts.userId, userId), eq(attempts.quizId, quizId))
      : eq(attempts.userId, userId);

    const rows = await this.db.select().from(attempts).where(condition);
    return rows.map((r: any) => this.mapRowToAttempt(r));
  }

  /**
   * Truy vấn các ca thi quá hạn đang ở trạng thái IN_PROGRESS
   * Sử dụng chỉ mục phức hợp idx_attempts_sweeper (status, deadline)
   * Ngưỡng tính toán: deadline < now - gracePeriodMs
   */
  async findExpiredInProgressAttempts(
    now: Date = new Date(),
    gracePeriodMs = 15000
  ): Promise<Attempt[]> {
    const cutoffDate = new Date(now.getTime() - gracePeriodMs);

    const rows = await this.db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.status, 'IN_PROGRESS'),
          lte(attempts.deadline, cutoffDate)
        )
      );

    return rows.map((r: any) => this.mapRowToAttempt(r));
  }

  private mapRowToAttempt(row: any): Attempt {
    return new Attempt({
      id: row.id,
      userId: row.userId,
      quizId: row.quizId,
      quizVersionId: row.quizVersionId,
      tenantId: row.tenantId,
      status: row.status as AttemptStatus,
      startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
      deadline: row.deadline ? new Date(row.deadline) : undefined,
      submittedAt: row.submittedAt ? new Date(row.submittedAt) : undefined,
      manifest: row.manifest || undefined,
      answers: row.answers || {},
      scoreResult: row.scoreResult
        ? {
            ...row.scoreResult,
            evaluatedAt: new Date(row.scoreResult.evaluatedAt),
          }
        : undefined,
    });
  }
}
