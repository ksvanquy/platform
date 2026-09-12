import { eq, and, or, sql, inArray, lte, isNotNull, isNull } from 'drizzle-orm';
import { getAttemptDb } from '../db/connection.js';
import { attempts, attemptEvents } from '../db/schema.js';
import { Attempt } from '../../domain/entities/attempt.entity.js';
import { AttemptEvent } from '../../domain/entities/attempt-event.entity.js';
import type {
  AttemptRepositoryPort,
  AttemptFilterQuery,
} from '../../domain/ports/attempt.repository.port.js';
import type { AntiCheatEventType, AttemptStatus } from '@platform/contracts';
import {
  AttemptNotFoundError,
  AttemptDomainError,
} from '../../domain/errors/attempt-domain.errors.js';

export class DrizzleAttemptRepository implements AttemptRepositoryPort {
  constructor(private customDb?: any) {}

  private getDb() {
    return this.customDb || getAttemptDb();
  }

  async saveAttempt(attempt: Attempt): Promise<Attempt> {
    const db = this.getDb();

    await db
      .insert(attempts)
      .values({
        id: attempt.id,
        userId: attempt.userId,
        examId: attempt.examId,
        snapshotId: attempt.snapshotId,
        variantCode: attempt.variantCode,
        status: attempt.status,
        version: attempt.version,
        startedAt: attempt.startedAt,
        deadline: attempt.deadline,
        submittedAt: attempt.submittedAt,
        durationMinutes: attempt.durationMinutes,
        answers: attempt.answers,
        scoreResult: attempt.scoreResult,
        createdAt: attempt.createdAt,
        updatedAt: attempt.updatedAt,
      })
      .onConflictDoUpdate({
        target: attempts.id,
        set: {
          status: attempt.status,
          version: attempt.version,
          startedAt: attempt.startedAt,
          deadline: attempt.deadline,
          submittedAt: attempt.submittedAt,
          answers: attempt.answers,
          scoreResult: attempt.scoreResult,
          updatedAt: attempt.updatedAt,
        },
        where: ['SUBMITTED', 'GRADED', 'TIMED_OUT_GRADED'].includes(attempt.status)
          ? undefined
          : sql`${attempts.status} NOT IN ('SUBMITTED', 'GRADED', 'TIMED_OUT_GRADED')`,
      });

    return attempt;
  }

  /**
   * Task CONC-3.1: Row-Level Lock (FOR UPDATE) & Database Transaction cho Ca thi đang nộp
   */
  async withAttemptLock<T>(
    attemptId: string,
    operation: (attempt: Attempt, saveLocked: (updated: Attempt) => Promise<void>) => Promise<T>
  ): Promise<T> {
    const db = this.getDb();
    return await db.transaction(async (tx: any) => {
      // Khóa cứng hàng của Attempt đang nộp bằng SELECT ... FOR UPDATE (Row-Level Exclusive Lock)
      const rows = await tx
        .select()
        .from(attempts)
        .where(eq(attempts.id, attemptId))
        .for('update');

      if (rows.length === 0) {
        throw new AttemptNotFoundError(attemptId);
      }

      const attempt = this.mapToAttemptEntity(rows[0]);

      const saveLocked = async (updated: Attempt): Promise<void> => {
        // Chặn tuyệt đối State Regression khi ghi đè trong transaction
        await tx
          .update(attempts)
          .set({
            status: updated.status,
            version: updated.version,
            startedAt: updated.startedAt,
            deadline: updated.deadline,
            submittedAt: updated.submittedAt,
            answers: updated.answers,
            scoreResult: updated.scoreResult,
            updatedAt: updated.updatedAt,
          })
          .where(eq(attempts.id, updated.id));
      };

      return await operation(attempt, saveLocked);
    });
  }

  async findAttemptById(id: string): Promise<Attempt | null> {
    const db = this.getDb();
    const rows = await db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapToAttemptEntity(rows[0]);
  }

  async findActiveAttempt(userId: string, examId: string): Promise<Attempt | null> {
    const db = this.getDb();
    const rows = await db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, userId),
          eq(attempts.examId, examId),
          inArray(attempts.status, ['CREATED', 'IN_PROGRESS', 'PAUSED'])
        )
      )
      .orderBy(sql`${attempts.createdAt} DESC`)
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapToAttemptEntity(rows[0]);
  }

  async listAttemptsByUser(userId: string, examId?: string): Promise<Attempt[]> {
    const db = this.getDb();
    const conditions = [eq(attempts.userId, userId)];
    if (examId) {
      conditions.push(eq(attempts.examId, examId));
    }

    const rows = await db
      .select()
      .from(attempts)
      .where(and(...conditions))
      .orderBy(sql`${attempts.createdAt} DESC`);

    return (rows as any[]).map((r: any) => this.mapToAttemptEntity(r));
  }

  async listAttempts(filter: AttemptFilterQuery = {}): Promise<{ attempts: Attempt[]; total: number }> {
    const db = this.getDb();
    const conditions = [];

    if (filter.userId) {
      conditions.push(eq(attempts.userId, filter.userId));
    }
    if (filter.examId) {
      conditions.push(eq(attempts.examId, filter.examId));
    }
    if (filter.status) {
      conditions.push(eq(attempts.status, filter.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db.select().from(attempts);
    if (whereClause) {
      query = query.where(whereClause) as any;
    }

    const rows = await query
      .orderBy(sql`${attempts.createdAt} DESC`)
      .limit(filter.limit || 50)
      .offset(filter.offset || 0);

    const totalCountQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(attempts);
    if (whereClause) {
      totalCountQuery.where(whereClause);
    }
    const totalCountRes = await totalCountQuery;
    const total = totalCountRes[0]?.count || 0;

    return {
      attempts: (rows as any[]).map((r: any) => this.mapToAttemptEntity(r)),
      total,
    };
  }

  /**
   * Task CONC-4.1: Distributed PostgreSQL Advisory Lock (Transaction-scoped)
   * Sử dụng pg_try_advisory_xact_lock để đảm bảo chỉ duy nhất 1 replica thực thi tác vụ nền
   */
  async withAdvisoryLock<T>(
    lockKey: number,
    operation: () => Promise<T>
  ): Promise<{ acquired: boolean; result?: T }> {
    const db = this.getDb();
    return await db.transaction(async (tx: any) => {
      const lockRes: any = await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(${lockKey}) AS acquired`
      );
      const acquired = Boolean(
        lockRes?.[0]?.acquired ??
        lockRes?.rows?.[0]?.acquired ??
        lockRes?.[0]?.rows?.[0]?.acquired
      );

      if (!acquired) {
        return { acquired: false };
      }

      const result = await operation();
      return { acquired: true, result };
    });
  }

  /**
   * Task CONC-4.2: Tối ưu Quét Theo Lô (Batching) với FOR UPDATE SKIP LOCKED
   * Tự động bỏ qua các ca thi đang bị thí sinh nộp bài hoặc transaction khác khóa, loại bỏ deadlock
   */
  async findExpiredInProgressAttempts(now: Date, gracePeriodMs: number, limit = 50): Promise<Attempt[]> {
    const db = this.getDb();
    const thresholdDate = new Date(now.getTime() - gracePeriodMs);

    const rows = await db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.status, 'IN_PROGRESS'),
          isNotNull(attempts.deadline),
          lte(attempts.deadline, thresholdDate)
        )
      )
      .orderBy(sql`${attempts.deadline} ASC`)
      .limit(limit)
      .for('update', { skipLocked: true });

    return (rows as any[]).map((r: any) => this.mapToAttemptEntity(r));
  }

  async saveEvent(event: AttemptEvent): Promise<AttemptEvent> {
    const db = this.getDb();

    await db.insert(attemptEvents).values({
      id: event.id,
      attemptId: event.attemptId,
      userId: event.userId,
      eventType: event.eventType,
      clientTimestamp: event.clientTimestamp,
      serverTimestamp: event.serverTimestamp,
      metadata: event.metadata,
    });

    return event;
  }

  async listEventsByAttemptId(attemptId: string): Promise<AttemptEvent[]> {
    const db = this.getDb();

    const rows = await db
      .select()
      .from(attemptEvents)
      .where(eq(attemptEvents.attemptId, attemptId))
      .orderBy(sql`${attemptEvents.serverTimestamp} ASC`);

    return (rows as any[]).map((r: any) => this.mapToEventEntity(r));
  }

  private mapToAttemptEntity(row: typeof attempts.$inferSelect): Attempt {
    return new Attempt({
      id: row.id,
      userId: row.userId,
      examId: row.examId,
      snapshotId: row.snapshotId,
      variantCode: row.variantCode,
      status: row.status as AttemptStatus,
      version: row.version ?? 1,
      startedAt: row.startedAt,
      deadline: row.deadline,
      submittedAt: row.submittedAt,
      durationMinutes: row.durationMinutes,
      answers: row.answers,
      scoreResult: row.scoreResult,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private mapToEventEntity(row: typeof attemptEvents.$inferSelect): AttemptEvent {
    return new AttemptEvent({
      id: row.id,
      attemptId: row.attemptId,
      userId: row.userId,
      eventType: row.eventType as AntiCheatEventType,
      clientTimestamp: row.clientTimestamp,
      serverTimestamp: row.serverTimestamp,
      metadata: row.metadata,
    });
  }
}
