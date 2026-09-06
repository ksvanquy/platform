import { eq, desc } from 'drizzle-orm';
import { getQuizDb } from '../db/connection.js';
import { quizzes, quizVersions } from '../db/schema.js';
import { Quiz, QuizStatus } from '../../domain/authoring/quiz.entity.js';
import { QuizVersion } from '../../domain/authoring/quiz-version.entity.js';
import { AuthoringRepositoryPort } from '../../domain/ports/assessment.repository.ports.js';

export class DrizzleAuthoringRepository implements AuthoringRepositoryPort {
  constructor(private customDb?: any) {}

  private get db() {
    return this.customDb || getQuizDb();
  }

  // --- QUẢN LÝ ĐỀ THI (QUIZ) ---

  async saveQuiz(quiz: Quiz): Promise<void> {
    const raw = quiz.toJSON();
    await this.db
      .insert(quizzes)
      .values({
        id: raw.id,
        code: raw.code,
        title: raw.title,
        description: raw.description,
        ownerId: raw.ownerId,
        isPublic: raw.isPublic,
        currentPublishedVersionId: raw.currentPublishedVersionId,
        status: raw.status,
        createdAt: new Date(raw.createdAt),
        updatedAt: new Date(raw.updatedAt),
      })
      .onConflictDoUpdate({
        target: quizzes.id,
        set: {
          code: raw.code,
          title: raw.title,
          description: raw.description,
          ownerId: raw.ownerId,
          isPublic: raw.isPublic,
          currentPublishedVersionId: raw.currentPublishedVersionId,
          status: raw.status,
          updatedAt: new Date(raw.updatedAt),
        },
      });
  }

  async findQuizById(id: string): Promise<Quiz | null> {
    const rows = await this.db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToQuiz(rows[0]);
  }

  async findQuizByCode(code: string): Promise<Quiz | null> {
    const rows = await this.db.select().from(quizzes).where(eq(quizzes.code, code)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToQuiz(rows[0]);
  }

  async listPublishedQuizzes(): Promise<Quiz[]> {
    const rows = await this.db.select().from(quizzes).where(eq(quizzes.status, 'PUBLISHED'));
    return rows.map((r: any) => this.mapRowToQuiz(r));
  }

  // --- QUẢN LÝ PHIÊN BẢN (VERSION) ---

  async saveVersion(version: QuizVersion): Promise<void> {
    await this.db
      .insert(quizVersions)
      .values({
        id: version.id,
        quizId: version.quizId,
        versionNumber: version.versionNumber,
        durationMinutes: version.durationMinutes,
        passingScore: version.passingScore.toString(),
        maxAttempts: version.maxAttempts,
        questions: version.questions,
        scoringPolicy: version.scoringPolicy,
        randomizationPolicy: version.randomizationPolicy,
        createdAt: version.createdAt,
      })
      .onConflictDoUpdate({
        target: quizVersions.id,
        set: {
          versionNumber: version.versionNumber,
          durationMinutes: version.durationMinutes,
          passingScore: version.passingScore.toString(),
          maxAttempts: version.maxAttempts,
          questions: version.questions,
          scoringPolicy: version.scoringPolicy,
          randomizationPolicy: version.randomizationPolicy,
        },
      });
  }

  async findVersionById(id: string): Promise<QuizVersion | null> {
    const rows = await this.db.select().from(quizVersions).where(eq(quizVersions.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToVersion(rows[0]);
  }

  async findLatestVersionByQuizId(quizId: string): Promise<QuizVersion | null> {
    const rows = await this.db
      .select()
      .from(quizVersions)
      .where(eq(quizVersions.quizId, quizId))
      .orderBy(desc(quizVersions.versionNumber))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRowToVersion(rows[0]);
  }

  async listVersionsByQuizId(quizId: string): Promise<QuizVersion[]> {
    const rows = await this.db
      .select()
      .from(quizVersions)
      .where(eq(quizVersions.quizId, quizId))
      .orderBy(desc(quizVersions.versionNumber));

    return rows.map((r: any) => this.mapRowToVersion(r));
  }

  private mapRowToQuiz(row: any): Quiz {
    return new Quiz({
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description || undefined,
      ownerId: row.ownerId,
      isPublic: Boolean(row.isPublic),
      currentPublishedVersionId: row.currentPublishedVersionId || undefined,
      status: row.status as QuizStatus,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
    });
  }

  private mapRowToVersion(row: any): QuizVersion {
    return new QuizVersion({
      id: row.id,
      quizId: row.quizId,
      versionNumber: row.versionNumber,
      durationMinutes: row.durationMinutes,
      passingScore: Number(row.passingScore),
      maxAttempts: row.maxAttempts,
      questions: row.questions,
      scoringPolicy: row.scoringPolicy,
      randomizationPolicy: row.randomizationPolicy,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    });
  }
}
