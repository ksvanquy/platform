import { eq } from 'drizzle-orm';
import { QuizRepositoryPort } from '../../domain/ports/quiz.repository.port.js';
import { Quiz, Question } from '../../domain/entities/quiz.js';
import { QuizSession } from '../../domain/state-machine/quiz-session.js';
import { quizzes, quizVersions, attempts } from '../db/schema.js';
import { getQuizDb } from '../db/connection.js';

export class DrizzleQuizLegacyRepository implements QuizRepositoryPort {
  constructor(private customDb?: any) {}

  private get db() {
    return this.customDb || getQuizDb();
  }

  async findQuizById(id: string): Promise<Quiz | null> {
    const qRows = await this.db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
    if (qRows.length === 0) return null;
    const q = qRows[0];

    // Lấy phiên bản mới nhất hoặc phiên bản publish
    let vRows = [];
    if (q.currentPublishedVersionId) {
      vRows = await this.db.select().from(quizVersions).where(eq(quizVersions.id, q.currentPublishedVersionId)).limit(1);
    }
    if (vRows.length === 0) {
      vRows = await this.db.select().from(quizVersions).where(eq(quizVersions.quizId, id)).limit(1);
    }

    const version = vRows[0];
    const durationMinutes = version ? version.durationMinutes : 15;
    const questions: Question[] = version && Array.isArray(version.questions)
      ? version.questions.map((qItem: any) => ({
          id: qItem.id,
          type: qItem.type === 'single-choice' ? 'SINGLE' : (qItem.type || 'SINGLE'),
          prompt: qItem.prompt,
          points: qItem.points ?? 1,
          correctAnswer: qItem.correctAnswer ?? qItem.options?.find((o: any) => o.isCorrect)?.id,
          metadata: {
            options: qItem.options?.map((o: any) => ({ id: o.id, content: o.text || o.content })),
          },
        }))
      : [];

    return {
      id: q.id,
      title: q.title,
      description: q.description || undefined,
      durationMinutes,
      questions,
    };
  }

  async findQuestionById(questionId: string): Promise<Question | null> {
    const vRows = await this.db.select().from(quizVersions);
    for (const v of vRows) {
      if (Array.isArray(v.questions)) {
        const found = v.questions.find((q: any) => q.id === questionId);
        if (found) {
          return {
            id: found.id,
            type: found.type === 'single-choice' ? 'SINGLE' : (found.type || 'SINGLE'),
            prompt: found.prompt,
            points: found.points ?? 1,
            correctAnswer: found.correctAnswer ?? found.options?.find((o: any) => o.isCorrect)?.id,
            metadata: {
              options: found.options?.map((o: any) => ({ id: o.id, content: o.text || o.content })),
            },
          };
        }
      }
    }
    return null;
  }

  async saveSession(session: QuizSession): Promise<void> {
    // Lưu vào bảng attempts để đồng bộ với PostgreSQL
    const startedAt = session.startedAt ? new Date(session.startedAt) : new Date();
    const deadline = session.startedAt && session.durationMinutes
      ? new Date(startedAt.getTime() + session.durationMinutes * 60000)
      : null;

    // Convert answers to CandidateAnswerRecord format
    const answersRecord: Record<string, any> = {};
    for (const [qId, val] of Object.entries(session.answers)) {
      answersRecord[qId] = {
        questionId: qId,
        answer: val,
        receivedAt: new Date().toISOString(),
        clientTimestamp: Date.now(),
        sequenceNumber: 1,
      };
    }

    await this.db
      .insert(attempts)
      .values({
        id: session.id,
        userId: session.userId,
        quizId: session.quizId,
        quizVersionId: 'ver_demo_v1',
        status: session.status,
        startedAt,
        deadline,
        answers: answersRecord,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: attempts.id,
        set: {
          status: session.status,
          answers: answersRecord,
          updatedAt: new Date(),
        },
      });
  }

  async findSessionById(sessionId: string): Promise<QuizSession | null> {
    const rows = await this.db.select().from(attempts).where(eq(attempts.id, sessionId)).limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];

    const simpleAnswers: Record<string, any> = {};
    if (row.answers && typeof row.answers === 'object') {
      for (const [k, v] of Object.entries(row.answers as Record<string, any>)) {
        simpleAnswers[k] = v?.answer ?? v;
      }
    }

    return new QuizSession({
      id: row.id,
      userId: row.userId,
      quizId: row.quizId,
      durationMinutes: 15,
      allowedQuestionIds: ['q1', 'q2', 'q3'],
      status: row.status as any,
      startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
      answers: simpleAnswers,
    });
  }
}
