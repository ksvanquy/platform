import { eq, and, sql, ilike, desc } from 'drizzle-orm';
import type { QuestionRepositoryPort } from '../../domain/ports/question.repository.port.js';
import { Question, QuestionRevision } from '../../domain/entities/question.entity.js';
import {
  questions,
  questionRevisions,
  type QuestionRow,
  type QuestionRevisionRow,
} from '../db/schema.js';
import { getQuestionDb } from '../db/connection.js';
import type { QuestionFilterQuery } from '@platform/contracts';

export class DrizzleQuestionRepository implements QuestionRepositoryPort {
  private db: any;

  constructor(db?: any) {
    this.db = db || getQuestionDb();
  }

  private mapRevisionToDomain(row: QuestionRevisionRow): QuestionRevision {
    return new QuestionRevision({
      id: row.id,
      questionId: row.questionId,
      revisionNumber: row.revisionNumber,
      prompt: row.prompt,
      options: row.options as any,
      pairs: (row.pairs as any) || undefined,
      explanation: row.explanation || undefined,
      rubric: (row.rubric as any) || undefined,
      mediaAssets: (row.mediaAssets as any) || undefined,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    });
  }

  private mapQuestionToDomain(row: QuestionRow, revisionRow?: QuestionRevisionRow | null): Question {
    const revision = revisionRow ? this.mapRevisionToDomain(revisionRow) : undefined;
    return new Question({
      id: row.id,
      code: row.code,
      type: row.type as any,
      topicNodeId: row.topicNodeId,
      gradeNodeId: row.gradeNodeId,
      difficulty: row.difficulty as any,
      defaultPoints: row.defaultPoints,
      status: row.status as any,
      currentRevisionId: row.currentRevisionId,
      ownerId: row.ownerId,
      currentRevision: revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async save(question: Question, revision?: QuestionRevision): Promise<Question> {
    const revToSave = revision || question.currentRevision;

    await this.db
      .insert(questions)
      .values({
        id: question.id,
        code: question.code,
        type: question.type,
        topicNodeId: question.topicNodeId,
        gradeNodeId: question.gradeNodeId,
        difficulty: question.difficulty,
        defaultPoints: question.defaultPoints,
        status: question.status,
        currentRevisionId: revToSave ? revToSave.id : question.currentRevisionId,
        ownerId: question.ownerId,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
      })
      .onConflictDoUpdate({
        target: questions.id,
        set: {
          code: question.code,
          type: question.type,
          topicNodeId: question.topicNodeId,
          gradeNodeId: question.gradeNodeId,
          difficulty: question.difficulty,
          defaultPoints: question.defaultPoints,
          status: question.status,
          currentRevisionId: revToSave ? revToSave.id : question.currentRevisionId,
          updatedAt: new Date(),
        },
      });

    if (revToSave) {
      await this.db
        .insert(questionRevisions)
        .values({
          id: revToSave.id,
          questionId: revToSave.questionId,
          revisionNumber: revToSave.revisionNumber,
          prompt: revToSave.prompt,
          options: revToSave.options as any,
          pairs: revToSave.pairs as any,
          explanation: revToSave.explanation,
          rubric: revToSave.rubric as any,
          mediaAssets: revToSave.mediaAssets as any,
          createdBy: revToSave.createdBy,
          createdAt: revToSave.createdAt,
        })
        .onConflictDoUpdate({
          target: [questionRevisions.questionId, questionRevisions.revisionNumber],
          set: {
            prompt: revToSave.prompt,
            options: revToSave.options as any,
            pairs: revToSave.pairs as any,
            explanation: revToSave.explanation,
            rubric: revToSave.rubric as any,
            mediaAssets: revToSave.mediaAssets as any,
          },
        });
    }

    return (await this.findById(question.id))!;
  }

  async findById(id: string): Promise<Question | null> {
    const rows = await this.db
      .select()
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const qRow = rows[0];

    let revRow: QuestionRevisionRow | null = null;
    if (qRow.currentRevisionId) {
      const revs = await this.db
        .select()
        .from(questionRevisions)
        .where(eq(questionRevisions.id, qRow.currentRevisionId))
        .limit(1);
      if (revs.length > 0) revRow = revs[0];
    }

    return this.mapQuestionToDomain(qRow, revRow);
  }

  async findByCode(code: string): Promise<Question | null> {
    const rows = await this.db
      .select()
      .from(questions)
      .where(eq(questions.code, code.trim()))
      .limit(1);

    if (rows.length === 0) return null;
    const qRow = rows[0];

    let revRow: QuestionRevisionRow | null = null;
    if (qRow.currentRevisionId) {
      const revs = await this.db
        .select()
        .from(questionRevisions)
        .where(eq(questionRevisions.id, qRow.currentRevisionId))
        .limit(1);
      if (revs.length > 0) revRow = revs[0];
    }

    return this.mapQuestionToDomain(qRow, revRow);
  }

  async findRevision(questionId: string, revisionNumber: number): Promise<QuestionRevision | null> {
    const rows = await this.db
      .select()
      .from(questionRevisions)
      .where(
        and(
          eq(questionRevisions.questionId, questionId),
          eq(questionRevisions.revisionNumber, revisionNumber)
        )
      )
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRevisionToDomain(rows[0]);
  }

  async listRevisions(questionId: string): Promise<QuestionRevision[]> {
    const rows = await this.db
      .select()
      .from(questionRevisions)
      .where(eq(questionRevisions.questionId, questionId))
      .orderBy(desc(questionRevisions.revisionNumber));

    return rows.map((r: QuestionRevisionRow) => this.mapRevisionToDomain(r));
  }

  async listQuestions(query: QuestionFilterQuery): Promise<{ questions: Question[]; total: number }> {
    const conditions = [];

    if (query.topicNodeId) {
      conditions.push(eq(questions.topicNodeId, query.topicNodeId));
    }
    if (query.gradeNodeId) {
      conditions.push(eq(questions.gradeNodeId, query.gradeNodeId));
    }
    if (query.difficulty) {
      conditions.push(eq(questions.difficulty, query.difficulty));
    }
    if (query.type) {
      conditions.push(eq(questions.type, query.type));
    }
    if (query.status) {
      conditions.push(eq(questions.status, query.status));
    }
    if (query.ownerId) {
      conditions.push(eq(questions.ownerId, query.ownerId));
    }
    if (query.search) {
      const pattern = `%${query.search.trim()}%`;
      conditions.push(ilike(questions.code, pattern));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countRes = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(whereClause);

    const total = Number(countRes[0]?.count || 0);

    const limit = query.limit && query.limit > 0 ? query.limit : 50;
    const offset = query.offset && query.offset >= 0 ? query.offset : 0;

    const rows = await this.db
      .select()
      .from(questions)
      .where(whereClause)
      .orderBy(desc(questions.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch current revisions for loaded questions
    const revisionIds = rows
      .map((r: QuestionRow) => r.currentRevisionId)
      .filter((id: string | null): id is string => Boolean(id));

    const revisionMap = new Map<string, QuestionRevisionRow>();
    if (revisionIds.length > 0) {
      const revRows = await this.db
        .select()
        .from(questionRevisions)
        .where(sql`${questionRevisions.id} IN ${revisionIds}`);
      for (const rev of revRows) {
        revisionMap.set(rev.id, rev);
      }
    }

    const domainQuestions = rows.map((r: QuestionRow) =>
      this.mapQuestionToDomain(r, r.currentRevisionId ? revisionMap.get(r.currentRevisionId) : null)
    );

    return { questions: domainQuestions, total };
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.delete(questions).where(eq(questions.id, id));
    return true;
  }
}
