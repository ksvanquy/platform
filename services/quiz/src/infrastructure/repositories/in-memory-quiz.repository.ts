import { QuizRepositoryPort } from '../../domain/ports/quiz.repository.port.js';
import { Quiz, Question } from '../../domain/entities/quiz.js';
import { QuizSession } from '../../domain/state-machine/quiz-session.js';

export class InMemoryQuizRepository implements QuizRepositoryPort {
  private quizzes: Map<string, Quiz> = new Map();
  private sessions: Map<string, QuizSession> = new Map();

  constructor() {
    // Seed dữ liệu bài thi mẫu
    this.seedMockData();
  }

  async findQuizById(id: string): Promise<Quiz | null> {
    return this.quizzes.get(id) || null;
  }

  async findQuestionById(questionId: string): Promise<Question | null> {
    for (const quiz of this.quizzes.values()) {
      const q = quiz.questions.find((item) => item.id === questionId);
      if (q) return q;
    }
    return null;
  }

  async saveSession(session: QuizSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async findSessionById(sessionId: string): Promise<QuizSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  private seedMockData() {
    const mockQuiz: Quiz = {
      id: 'quiz_demo',
      title: 'Bài Thi Thử Kiến Trúc Core',
      description: 'Kiểm tra tổng hợp các loại câu hỏi',
      durationMinutes: 15,
      questions: [
        {
          id: 'q1',
          type: 'SINGLE',
          prompt: 'ReactJS là gì?',
          points: 2,
          correctAnswer: 'opt_1',
          metadata: {
            options: [
              { id: 'opt_1', content: 'Thư viện UI' },
              { id: 'opt_2', content: 'Database' },
            ],
          },
        },
        {
          id: 'q2',
          type: 'FILL_IN',
          prompt: 'Từ khóa khai báo định dạng Object trong TypeScript?',
          points: 1,
          correctAnswer: 'interface',
        },
      ],
    };

    this.quizzes.set(mockQuiz.id, mockQuiz);
  }
}