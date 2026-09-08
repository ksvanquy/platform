import { eq, and, sql, ilike } from 'drizzle-orm';
import { getExamDb } from '../db/connection.js';
import { exams, examSnapshots } from '../db/schema.js';
import { Exam, ExamSnapshot } from '../../domain/entities/exam.entity.js';
import type {
  ExamRepositoryPort,
  ExamFilterQuery,
} from '../../domain/ports/exam.repository.port.js';
import type { ExamStatus } from '@platform/contracts';

export class DrizzleExamRepository implements ExamRepositoryPort {
  async saveExam(exam: Exam): Promise<Exam> {
    const db = getExamDb();
    await db
      .insert(exams)
      .values({
        id: exam.id,
        assessmentId: exam.assessmentId,
        code: exam.code,
        title: exam.title,
        startTime: exam.startTime,
        endTime: exam.endTime,
        durationMinutes: exam.durationMinutes,
        isPublished: exam.isPublished,
        randomizationSeedBase: exam.randomizationSeedBase,
        status: exam.status,
        createdAt: exam.createdAt,
      })
      .onConflictDoUpdate({
        target: exams.id,
        set: {
          title: exam.title,
          startTime: exam.startTime,
          endTime: exam.endTime,
          durationMinutes: exam.durationMinutes,
          isPublished: exam.isPublished,
          status: exam.status,
        },
      });

    return exam;
  }

  async findExamById(id: string): Promise<Exam | null> {
    const db = getExamDb();
    const rows = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapToExamEntity(rows[0]);
  }

  async findExamByCode(code: string): Promise<Exam | null> {
    const db = getExamDb();
    const rows = await db.select().from(exams).where(eq(exams.code, code)).limit(1);
    if (rows.length === 0) return null;
    return this.mapToExamEntity(rows[0]);
  }

  async listExams(filter: ExamFilterQuery = {}): Promise<{ exams: Exam[]; total: number }> {
    const db = getExamDb();
    const conditions = [];

    if (filter.assessmentId) {
      conditions.push(eq(exams.assessmentId, filter.assessmentId));
    }
    if (filter.status) {
      conditions.push(eq(exams.status, filter.status));
    }
    if (filter.isPublished !== undefined) {
      conditions.push(eq(exams.isPublished, filter.isPublished));
    }
    if (filter.search) {
      conditions.push(ilike(exams.title, `%${filter.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db.select().from(exams);
    if (whereClause) {
      query = query.where(whereClause) as any;
    }

    const rows = await query
      .orderBy(sql`${exams.createdAt} DESC`)
      .limit(filter.limit || 50)
      .offset(filter.offset || 0);

    const totalCountQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(exams);
    if (whereClause) {
      totalCountQuery.where(whereClause);
    }
    const totalCountRes = await totalCountQuery;
    const total = totalCountRes[0]?.count || 0;

    return {
      exams: rows.map((r) => this.mapToExamEntity(r)),
      total,
    };
  }

  async deleteExam(id: string): Promise<boolean> {
    const db = getExamDb();
    const res = await db.delete(exams).where(eq(exams.id, id));
    return (res as any).rowCount > 0;
  }

  async saveSnapshot(snapshot: ExamSnapshot): Promise<ExamSnapshot> {
    const db = getExamDb();
    await db
      .insert(examSnapshots)
      .values({
        id: snapshot.id,
        examId: snapshot.examId,
        variantCode: snapshot.variantCode,
        contentHash: snapshot.contentHash,
        frozenPayload: snapshot.frozenPayload,
        sanitizedManifest: snapshot.sanitizedManifest,
        createdAt: snapshot.createdAt,
      })
      .onConflictDoUpdate({
        target: [examSnapshots.examId, examSnapshots.variantCode],
        set: {
          contentHash: snapshot.contentHash,
          frozenPayload: snapshot.frozenPayload,
          sanitizedManifest: snapshot.sanitizedManifest,
        },
      });

    return snapshot;
  }

  async findSnapshotById(id: string): Promise<ExamSnapshot | null> {
    const db = getExamDb();
    const rows = await db.select().from(examSnapshots).where(eq(examSnapshots.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapToSnapshotEntity(rows[0]);
  }

  async findSnapshotByExamAndVariant(examId: string, variantCode: string): Promise<ExamSnapshot | null> {
    const db = getExamDb();
    const rows = await db
      .select()
      .from(examSnapshots)
      .where(and(eq(examSnapshots.examId, examId), eq(examSnapshots.variantCode, variantCode)))
      .limit(1);
    if (rows.length === 0) return null;
    return this.mapToSnapshotEntity(rows[0]);
  }

  async listSnapshotsByExamId(examId: string): Promise<ExamSnapshot[]> {
    const db = getExamDb();
    const rows = await db
      .select()
      .from(examSnapshots)
      .where(eq(examSnapshots.examId, examId))
      .orderBy(examSnapshots.variantCode);
    return rows.map((r) => this.mapToSnapshotEntity(r));
  }

  async deleteSnapshotsByExamId(examId: string): Promise<number> {
    const db = getExamDb();
    const res = await db.delete(examSnapshots).where(eq(examSnapshots.examId, examId));
    return (res as any).rowCount || 0;
  }

  private mapToExamEntity(row: typeof exams.$inferSelect): Exam {
    return new Exam({
      id: row.id,
      assessmentId: row.assessmentId,
      code: row.code,
      title: row.title,
      startTime: row.startTime ? new Date(row.startTime) : null,
      endTime: row.endTime ? new Date(row.endTime) : null,
      durationMinutes: row.durationMinutes,
      isPublished: row.isPublished,
      randomizationSeedBase: row.randomizationSeedBase,
      status: row.status as ExamStatus,
      createdAt: new Date(row.createdAt),
    });
  }

  private mapToSnapshotEntity(row: typeof examSnapshots.$inferSelect): ExamSnapshot {
    return new ExamSnapshot({
      id: row.id,
      examId: row.examId,
      variantCode: row.variantCode,
      contentHash: row.contentHash,
      frozenPayload: row.frozenPayload,
      sanitizedManifest: row.sanitizedManifest,
      createdAt: new Date(row.createdAt),
    });
  }
}
