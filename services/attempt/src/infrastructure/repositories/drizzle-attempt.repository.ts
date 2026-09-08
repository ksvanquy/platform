import { eq, and, sql, inArray } from 'drizzle-orm';
import { getAttemptDb } from '../db/connection.js';
import { attempts, attemptEvents } from '../db/schema.js';
import { Attempt } from '../../domain/entities/attempt.entity.js';
import { AttemptEvent } from '../../domain/entities/attempt-event.entity.js';
import type {
  AttemptRepositoryPort,
  AttemptFilterQuery,
} from '../../domain/ports/attempt.repository.port.js';
import type { AntiCheatEventType, AttemptStatus } from '@platform/contracts';

export class DrizzleAttemptRepository implements AttemptRepositoryPort {
  async saveAttempt(attempt: Attempt): Promise<Attempt> {
    const db = getAttemptDb();

    await db
      .insert(attempts)
      .values({
        id: attempt.id,
        userId: attempt.userId,
        examId: attempt.examId,
        snapshotId: attempt.snapshotId,
        variantCode: attempt.variantCode,
        status: attempt.status,
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
          startedAt: attempt.startedAt,
          deadline: attempt.deadline,
          submittedAt: attempt.submittedAt,
          answers: attempt.answers,
          scoreResult: attempt.scoreResult,
          updatedAt: attempt.updatedAt,
        },
      });

    return attempt;
  }

  async findAttemptById(id: string): Promise<Attempt | null> {
    const db = getAttemptDb();
    const rows = await db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapToAttemptEntity(rows[0]);
  }

  async findActiveAttempt(userId: string, examId: string): Promise<Attempt | null> {
    const db = getAttemptDb();
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
    const db = getAttemptDb();
    const conditions = [eq(attempts.userId, userId)];
    if (examId) {
      conditions.push(eq(attempts.examId, examId));
    }

    const rows = await db
      .select()
      .from(attempts)
      .where(and(...conditions))
      .orderBy(sql`${attempts.createdAt} DESC`);

    return rows.map((r) => this.mapToAttemptEntity(r));
  }

  async listAttempts(filter: AttemptFilterQuery = {}): Promise<{ attempts: Attempt[]; total: number }> {
    const db = getAttemptDb();
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
      attempts: rows.map((r) => this.mapToAttemptEntity(r)),
      total,
    };
  }

  async findExpiredInProgressAttempts(now: Date, gracePeriodMs: number): Promise<Attempt[]> {
    const db = getAttemptDb();
    const thresholdDate = new Date(now.getTime() - gracePeriodMs);

    const rows = await db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.status, 'IN_PROGRESS'),
          sql`${attempts.deadline} IS NOT NULL`,
          sql`${attempts.deadline} <= ${thresholdDate}`
        )
      );

    return rows.map((r) => this.mapToAttemptEntity(r));
  }

  async saveEvent(event: AttemptEvent): Promise<AttemptEvent> {
    const db = getAttemptDb();

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
    const db = getAttemptDb();

    const rows = await db
      .select()
      .from(attemptEvents)
      .where(eq(attemptEvents.attemptId, attemptId))
      .orderBy(sql`${attemptEvents.serverTimestamp} ASC`);

    return rows.map((r) => this.mapToEventEntity(r));
  }

  private mapToAttemptEntity(row: typeof attempts.$inferSelect): Attempt {
    return new Attempt({
      id: row.id,
      userId: row.userId,
      examId: row.examId,
      snapshotId: row.snapshotId,
      variantCode: row.variantCode,
      status: row.status as AttemptStatus,
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
