import { describe, it, expect, beforeEach } from 'vitest';
import { QuizRepositoryPort } from '../../src/domain/ports/quiz.repository.port.js';
import { Quiz, Question } from '../../src/domain/entities/quiz.js';
import { QuizSession } from '../../src/domain/state-machine/quiz-session.js';
import {
  StartQuizUseCase,
  SaveAnswerUseCase,
  SubmitQuizUseCase,
} from '../../src/application/use-cases/quiz.use-cases.js';

// In-Memory Repository giả lập Database
class InMemoryQuizRepository implements QuizRepositoryPort {
  public quizzes: Map<string, Quiz> = new Map();
  public sessions: Map<string, QuizSession> = new Map();

  async findQuizById(id: string): Promise<Quiz | null> {
    return this.quizzes.get(id) || null;
  }
  async findQuestionById(questionId: string): Promise<Question | null> {
    return null;
  }
  async saveSession(session: QuizSession): Promise<void> {
    this.sessions.set(session.id, session);
  }
  async findSessionById(sessionId: string): Promise<QuizSession | null> {
    return this.sessions.get(sessionId) || null;
  }
}

describe('Application Layer Use Cases Integration Tests', () => {
  let repo: InMemoryQuizRepository;
  let startQuizUseCase: StartQuizUseCase;
  let saveAnswerUseCase: SaveAnswerUseCase;
  let submitQuizUseCase: SubmitQuizUseCase;

  const mockQuiz: Quiz = {
    id: 'quiz_01',
    title: 'Bài thi thử',
    durationMinutes: 15,
    questions: [
      { id: 'q1', type: 'SINGLE', prompt: '1 + 1 = ?', points: 1, correctAnswer: '2' },
    ],
  };

  beforeEach(() => {
    repo = new InMemoryQuizRepository();
    repo.quizzes.set(mockQuiz.id, mockQuiz);

    startQuizUseCase = new StartQuizUseCase(repo);
    saveAnswerUseCase = new SaveAnswerUseCase(repo);
    submitQuizUseCase = new SubmitQuizUseCase(repo);
  });

  it('should start quiz and NEVER leak correctAnswer to Client', async () => {
    const result = await startQuizUseCase.execute({ userId: 'u1', quizId: 'quiz_01' });

    expect(result.session.status).toBe('IN_PROGRESS');
    expect(result.questions[0].id).toBe('q1');
    // Đảm bảo correctAnswer đã bị loại bỏ an toàn
    expect((result.questions[0] as any).correctAnswer).toBeUndefined();
  });

  it('should complete full flow: Start -> Save -> Submit', async () => {
    // 1. Start
    const { session } = await startQuizUseCase.execute({ userId: 'u1', quizId: 'quiz_01' });

    // 2. Save Answer
    await saveAnswerUseCase.execute({ sessionId: session.id, questionId: 'q1', answer: '2' });

    // 3. Submit
    const evalResult = await submitQuizUseCase.execute({ sessionId: session.id });

    expect(evalResult.totalScoreAwarded).toBe(1);
    expect(evalResult.percentage).toBe(100);

    const savedSession = await repo.findSessionById(session.id);
    expect(savedSession?.status).toBe('SUBMITTED');
  });
});