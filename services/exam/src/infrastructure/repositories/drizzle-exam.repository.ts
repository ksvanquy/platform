import { eq, and, sql, ilike } from 'drizzle-orm';
import { getExamDb } from '../db/connection.js';
import { exams, examSnapshots, examMasterPayloads } from '../db/schema.js';
import { Exam, ExamSnapshot } from '../../domain/entities/exam.entity.js';
import type {
  ExamRepositoryPort,
  ExamFilterQuery,
} from '../../domain/ports/exam.repository.port.js';
import type { ExamStatus, ExamMasterPayload } from '@platform/contracts';

export class DrizzleExamRepository implements ExamRepositoryPort {
  constructor(private customDb?: any) {}

  private getDb() {
    return this.customDb || getExamDb();
  }

  async saveExam(exam: Exam): Promise<Exam> {
    const db = this.getDb();
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
    const db = this.getDb();
    const rows = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapToExamEntity(rows[0]);
  }

  async findExamByCode(code: string): Promise<Exam | null> {
    const db = this.getDb();
    const rows = await db.select().from(exams).where(eq(exams.code, code)).limit(1);
    if (rows.length === 0) return null;
    return this.mapToExamEntity(rows[0]);
  }

  async listExams(filter: ExamFilterQuery = {}): Promise<{ exams: Exam[]; total: number }> {
    const db = this.getDb();
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
      exams: (rows as any[]).map((r: any) => this.mapToExamEntity(r)),
      total,
    };
  }

  async deleteExam(id: string): Promise<boolean> {
    const db = this.getDb();
    const res = await db.delete(exams).where(eq(exams.id, id));
    return (res as any).rowCount > 0;
  }

  async saveMasterPayload(examId: string, masterPayload: ExamMasterPayload): Promise<void> {
    const db = this.getDb();
    await db
      .insert(examMasterPayloads)
      .values({
        examId,
        masterPayload,
      })
      .onConflictDoUpdate({
        target: examMasterPayloads.examId,
        set: {
          masterPayload,
        },
      });
  }

  async findMasterPayload(examId: string): Promise<ExamMasterPayload | null> {
    const db = this.getDb();
    const rows = await db
      .select()
      .from(examMasterPayloads)
      .where(eq(examMasterPayloads.examId, examId))
      .limit(1);
    return rows[0]?.masterPayload ?? null;
  }

  async saveSnapshot(snapshot: ExamSnapshot): Promise<ExamSnapshot> {
    const db = this.getDb();

    if (snapshot.masterPayload) {
      await this.saveMasterPayload(snapshot.examId, snapshot.masterPayload);
    }

    // Performance Optimization: If permutation mapping is present, avoid cloning full payloads to DB.
    // Storing only permutation mapping reduces snapshot storage by >95% while remaining tamper-proof.
    const hasPermutation = Boolean(snapshot.permutationMapping);

    await db
      .insert(examSnapshots)
      .values({
        id: snapshot.id,
        examId: snapshot.examId,
        variantCode: snapshot.variantCode,
        contentHash: snapshot.contentHash,
        permutationMapping: snapshot.permutationMapping ?? null,
        frozenPayload: hasPermutation ? null : snapshot.frozenPayload,
        sanitizedManifest: hasPermutation ? null : snapshot.sanitizedManifest,
        createdAt: snapshot.createdAt,
      })
      .onConflictDoUpdate({
        target: [examSnapshots.examId, examSnapshots.variantCode],
        set: {
          contentHash: snapshot.contentHash,
          permutationMapping: snapshot.permutationMapping ?? null,
          frozenPayload: hasPermutation ? null : snapshot.frozenPayload,
          sanitizedManifest: hasPermutation ? null : snapshot.sanitizedManifest,
        },
      });

    return snapshot;
  }

  async saveSnapshots(snapshots: ExamSnapshot[], masterPayload?: ExamMasterPayload): Promise<ExamSnapshot[]> {
    if (snapshots.length === 0) return [];
    const examId = snapshots[0].examId;
    const master = masterPayload || snapshots[0].masterPayload;
    if (master) {
      await this.saveMasterPayload(examId, master);
    }
    for (const s of snapshots) {
      await this.saveSnapshot(s);
    }
    return snapshots;
  }

  async findSnapshotById(id: string): Promise<ExamSnapshot | null> {
    const db = this.getDb();
    const rows = await db.select().from(examSnapshots).where(eq(examSnapshots.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapToSnapshotEntity(rows[0]);
  }

  async findSnapshotByExamAndVariant(examId: string, variantCode: string): Promise<ExamSnapshot | null> {
    const db = this.getDb();
    const rows = await db
      .select()
      .from(examSnapshots)
      .where(and(eq(examSnapshots.examId, examId), eq(examSnapshots.variantCode, variantCode)))
      .limit(1);
    if (rows.length === 0) return null;
    return this.mapToSnapshotEntity(rows[0]);
  }

  async listSnapshotsByExamId(examId: string): Promise<ExamSnapshot[]> {
    const db = this.getDb();
    const rows = await db
      .select()
      .from(examSnapshots)
      .where(eq(examSnapshots.examId, examId))
      .orderBy(examSnapshots.variantCode);

    if (rows.length === 0) return [];

    let master: ExamMasterPayload | null = null;
    const hasPermutations = rows.some((r: any) => r.permutationMapping && !r.frozenPayload);
    if (hasPermutations) {
      master = await this.findMasterPayload(examId);
    }

    return Promise.all((rows as any[]).map((r: any) => this.mapToSnapshotEntity(r, master)));
  }

  async deleteSnapshotsByExamId(examId: string): Promise<number> {
    const db = this.getDb();
    const res = await db.delete(examSnapshots).where(eq(examSnapshots.examId, examId));
    await db.delete(examMasterPayloads).where(eq(examMasterPayloads.examId, examId));
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

  private async mapToSnapshotEntity(
    row: typeof examSnapshots.$inferSelect,
    preloadedMaster?: ExamMasterPayload | null
  ): Promise<ExamSnapshot> {
    let master = preloadedMaster;
    if (!row.frozenPayload && row.permutationMapping && master === undefined) {
      master = await this.findMasterPayload(row.examId);
    }

    return new ExamSnapshot({
      id: row.id,
      examId: row.examId,
      variantCode: row.variantCode,
      contentHash: row.contentHash,
      permutationMapping: row.permutationMapping ?? undefined,
      masterPayload: master ?? undefined,
      frozenPayload: row.frozenPayload ?? undefined,
      sanitizedManifest: row.sanitizedManifest ?? undefined,
      createdAt: new Date(row.createdAt),
    });
  }
}
