import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  StartQuizUseCase,
  SaveAnswerUseCase,
  SubmitQuizUseCase,
} from '../../src/application/use-cases/quiz.use-cases.js';
import { setupTestQuizDb, TestQuizDbContext } from '../../tests/helpers/test-db.helper.js';

describe('Application Layer Use Cases Integration Tests (PostgreSQL via PGlite)', () => {
  let testCtx: TestQuizDbContext;
  let startQuizUseCase: StartQuizUseCase;
  let saveAnswerUseCase: SaveAnswerUseCase;
  let submitQuizUseCase: SubmitQuizUseCase;

  beforeEach(async () => {
    testCtx = await setupTestQuizDb();
    startQuizUseCase = new StartQuizUseCase(testCtx.legacyRepo);
    saveAnswerUseCase = new SaveAnswerUseCase(testCtx.legacyRepo);
    submitQuizUseCase = new SubmitQuizUseCase(testCtx.legacyRepo);
  });

  afterEach(async () => {
    await testCtx?.cleanup();
  });

  it('should start quiz and NEVER leak correctAnswer to Client', async () => {
    const result = await startQuizUseCase.execute({ userId: 'u1', quizId: 'quiz_demo' });

    expect(result.session.status).toBe('IN_PROGRESS');
    expect(result.questions[0].id).toBe('q1');
    // Đảm bảo correctAnswer đã bị loại bỏ an toàn
    expect((result.questions[0] as any).correctAnswer).toBeUndefined();
    expect((result.questions[0].metadata?.options?.[0] as any)?.isCorrect).toBeUndefined();
  });

  it('should complete full flow: Start -> Save -> Submit', async () => {
    // 1. Start
    const { session } = await startQuizUseCase.execute({ userId: 'u1', quizId: 'quiz_demo' });

    // 2. Save Answer
    await saveAnswerUseCase.execute({ sessionId: session.id, questionId: 'q1', answer: 'opt_1' });

    // 3. Submit
    const evalResult = await submitQuizUseCase.execute({ sessionId: session.id });

    expect(evalResult.totalScoreAwarded).toBe(2);

    const savedSession = await testCtx.legacyRepo.findSessionById(session.id);
    expect(savedSession?.status).toBe('SUBMITTED');
  });
});