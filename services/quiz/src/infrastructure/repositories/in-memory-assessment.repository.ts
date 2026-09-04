import { Quiz } from '../../domain/authoring/quiz.entity.js';
import { QuizVersion } from '../../domain/authoring/quiz-version.entity.js';
import { Attempt } from '../../domain/delivery/attempt.aggregate.js';
import {
  AuthoringRepositoryPort,
  DeliveryRepositoryPort,
} from '../../domain/ports/assessment.repository.ports.js';

export class InMemoryAssessmentRepository
  implements AuthoringRepositoryPort, DeliveryRepositoryPort {
  private quizzes: Map<string, Quiz> = new Map();
  private versions: Map<string, QuizVersion> = new Map();
  private attempts: Map<string, Attempt> = new Map();

  constructor() {
    this.seedDefaults();
  }

  // Authoring
  async saveQuiz(quiz: Quiz): Promise<void> {
    this.quizzes.set(quiz.id, quiz);
  }

  async findQuizById(id: string): Promise<Quiz | null> {
    return this.quizzes.get(id) || null;
  }

  async findQuizByCode(code: string): Promise<Quiz | null> {
    for (const q of this.quizzes.values()) {
      if (q.code === code) return q;
    }
    return null;
  }

  async listPublishedQuizzes(): Promise<Quiz[]> {
    return Array.from(this.quizzes.values()).filter((q) => q.status === 'PUBLISHED');
  }

  async saveVersion(version: QuizVersion): Promise<void> {
    this.versions.set(version.id, version);
  }

  async findVersionById(id: string): Promise<QuizVersion | null> {
    return this.versions.get(id) || null;
  }

  async findLatestVersionByQuizId(quizId: string): Promise<QuizVersion | null> {
    const list = await this.listVersionsByQuizId(quizId);
    if (list.length === 0) return null;
    return list.sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }

  async listVersionsByQuizId(quizId: string): Promise<QuizVersion[]> {
    return Array.from(this.versions.values()).filter((v) => v.quizId === quizId);
  }

  // Delivery
  async saveAttempt(attempt: Attempt): Promise<void> {
    this.attempts.set(attempt.id, attempt);
  }

  async findAttemptById(id: string): Promise<Attempt | null> {
    return this.attempts.get(id) || null;
  }

  async listAttemptsByUser(userId: string, quizId?: string): Promise<Attempt[]> {
    return Array.from(this.attempts.values()).filter(
      (a) => a.userId === userId && (!quizId || a.quizId === quizId)
    );
  }

  private seedDefaults(): void {
    const quizId = 'quiz_demo';
    const versionId = 'ver_demo_v1';

    const version = new QuizVersion({
      id: versionId,
      quizId,
      versionNumber: 1,
      durationMinutes: 15,
      passingScore: 3,
      maxAttempts: 3,
      questions: [
        {
          id: 'q1',
          type: 'single-choice',
          prompt: 'ReactJS là gì?',
          points: 2,
          options: [
            { id: 'opt_1', text: 'Thư viện UI', isCorrect: true },
            { id: 'opt_2', text: 'Database', isCorrect: false },
            { id: 'opt_3', text: 'Hệ điều hành', isCorrect: false },
          ],
        },
        {
          id: 'q2',
          type: 'multiple-choice',
          prompt: 'Những từ khóa nào được dùng khai báo biến trong JS hiện đại?',
          points: 2,
          options: [
            { id: 'opt_let', text: 'let', isCorrect: true },
            { id: 'opt_const', text: 'const', isCorrect: true },
            { id: 'opt_goto', text: 'goto', isCorrect: false },
          ],
        },
        {
          id: 'q3',
          type: 'true-false',
          prompt: 'TypeScript hỗ trợ Type System tại thời điểm compile-time',
          points: 1,
          correctAnswer: true,
        },
      ],
      scoringPolicy: { strategyType: 'exact-match' },
      randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
    });

    const quiz = new Quiz({
      id: quizId,
      code: 'REACT_CORE',
      title: 'Bài Thi Thử Kiến Trúc Core',
      description: 'Kiểm tra tổng hợp các loại câu hỏi',
      ownerId: 'admin_master',
      status: 'PUBLISHED',
      currentPublishedVersionId: versionId,
    });

    this.saveVersion(version);
    this.saveQuiz(quiz);
  }
}
