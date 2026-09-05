import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestQuizDb, TestQuizDbContext } from '../helpers/test-db.helper.js';
import { Quiz } from '../../src/domain/authoring/quiz.entity.js';
import { QuizVersion } from '../../src/domain/authoring/quiz-version.entity.js';
import { Attempt } from '../../src/domain/delivery/attempt.aggregate.js';

describe('Gói WP-8: Drizzle Assessment Persistence Integration Tests (PostgreSQL 100%)', () => {
  let testCtx: TestQuizDbContext;

  beforeEach(async () => {
    testCtx = await setupTestQuizDb();
  });

  afterEach(async () => {
    await testCtx?.cleanup();
  });

  describe('1. Authoring Repository Persistence & JSONB Serialization', () => {
    it('should correctly persist and retrieve Quiz and QuizVersion with JSONB fields', async () => {
      const quiz = new Quiz({
        id: 'quiz_psql_test',
        code: 'PSQL_101',
        title: 'PostgreSQL Mastery Exam',
        description: 'Comprehensive test for Drizzle + PostgreSQL',
        ownerId: 'inst_expert',
        tenantId: 'tenant_engineering',
        status: 'PUBLISHED',
        currentPublishedVersionId: 'ver_psql_v1',
      });

      const version = new QuizVersion({
        id: 'ver_psql_v1',
        quizId: 'quiz_psql_test',
        versionNumber: 1,
        durationMinutes: 45,
        passingScore: 8,
        maxAttempts: 2,
        questions: [
          {
            id: 'q_jsonb_1',
            type: 'single-choice',
            prompt: 'Drizzle ORM hỗ trợ PostgreSQL native types nào?',
            points: 4,
            options: [
              { id: 'opt_1', text: 'jsonb & timestamp with timezone', isCorrect: true },
              { id: 'opt_2', text: 'Chỉ hỗ trợ text', isCorrect: false },
            ],
          },
          {
            id: 'q_jsonb_2',
            type: 'multiple-choice',
            prompt: 'Những chỉ mục nào tối ưu cho sweeper background?',
            points: 4,
            options: [
              { id: 'opt_idx_status', text: 'status', isCorrect: true },
              { id: 'opt_idx_deadline', text: 'deadline', isCorrect: true },
            ],
          },
        ],
        scoringPolicy: { strategyType: 'exact-match' },
        randomizationPolicy: { shuffleQuestions: true, shuffleOptions: false },
      });

      // Lưu quiz trước rồi đến version theo thứ tự Foreign Key
      await testCtx.authoringRepo.saveQuiz(quiz);
      await testCtx.authoringRepo.saveVersion(version);

      // Đọc lại từ database qua repo
      const retrievedQuiz = await testCtx.authoringRepo.findQuizById('quiz_psql_test');
      expect(retrievedQuiz).toBeDefined();
      expect(retrievedQuiz?.code).toBe('PSQL_101');
      expect(retrievedQuiz?.title).toBe('PostgreSQL Mastery Exam');
      expect(retrievedQuiz?.tenantId).toBe('tenant_engineering');
      expect(retrievedQuiz?.status).toBe('PUBLISHED');

      const retrievedVersion = await testCtx.authoringRepo.findVersionById('ver_psql_v1');
      expect(retrievedVersion).toBeDefined();
      expect(retrievedVersion?.questions.length).toBe(2);
      expect(retrievedVersion?.questions[0].id).toBe('q_jsonb_1');
      expect(retrievedVersion?.questions[0].options?.[0].text).toBe('jsonb & timestamp with timezone');
      expect(retrievedVersion?.scoringPolicy).toEqual({ strategyType: 'exact-match' });
      expect(retrievedVersion?.randomizationPolicy).toEqual({ shuffleQuestions: true, shuffleOptions: false });
    });
  });

  describe('2. Delivery Repository Persistence & Monotonic Concurrency', () => {
    it('should save and update candidate answers and score results accurately in PostgreSQL', async () => {
      const now = new Date();
      const deadline = new Date(now.getTime() + 30 * 60000);

      const attempt = new Attempt({
        id: 'att_psql_001',
        userId: 'candidate_elena',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
        tenantId: 'tenant_default',
        status: 'IN_PROGRESS',
        startedAt: now,
        deadline,
      });

      // Record answer với sequence number
      attempt.recordAnswer('q1', 'opt_1', Date.now(), new Date(), 1);
      await testCtx.deliveryRepo.saveAttempt(attempt);

      const savedAttempt = await testCtx.deliveryRepo.findAttemptById('att_psql_001');
      expect(savedAttempt).toBeDefined();
      expect(savedAttempt?.answers['q1']).toBeDefined();
      expect(savedAttempt?.answers['q1'].answer).toBe('opt_1');
      expect(savedAttempt?.answers['q1'].sequenceNumber).toBe(1);

      // Cập nhật với sequence number cao hơn (2)
      savedAttempt!.recordAnswer('q1', 'opt_1_updated', Date.now(), new Date(), 2);
      await testCtx.deliveryRepo.saveAttempt(savedAttempt!);

      const updatedAttempt = await testCtx.deliveryRepo.findAttemptById('att_psql_001');
      expect(updatedAttempt?.answers['q1'].answer).toBe('opt_1_updated');
      expect(updatedAttempt?.answers['q1'].sequenceNumber).toBe(2);
    });

    it('should accurately query expired in-progress attempts via findExpiredInProgressAttempts()', async () => {
      const currentTime = new Date();
      const pastDeadline = new Date(currentTime.getTime() - 60000); // 1 phút trước

      const expiredAttempt = new Attempt({
        id: 'att_expired_psql',
        userId: 'student_slow',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
        tenantId: 'tenant_default',
        status: 'IN_PROGRESS',
        startedAt: new Date(currentTime.getTime() - 120000),
        deadline: pastDeadline,
      });
      await testCtx.deliveryRepo.saveAttempt(expiredAttempt);

      // Quét các attempt quá hạn với grace period 15 giây
      const expiredList = await testCtx.deliveryRepo.findExpiredInProgressAttempts(currentTime, 15000);
      expect(expiredList.length).toBeGreaterThanOrEqual(1);
      const found = expiredList.find((a) => a.id === 'att_expired_psql');
      expect(found).toBeDefined();
      expect(found?.status).toBe('IN_PROGRESS');

      // Chuyển sang TIMED_OUT_GRADED và cập nhật điểm
      found!.status = 'TIMED_OUT_GRADED';
      found!.submittedAt = currentTime;
      found!.scoreResult = {
        score: 5,
        totalPoints: 10,
        percentage: 50,
        passed: false,
        evaluatedAt: currentTime,
        feedback: 'Auto-graded upon expiration',
      };
      await testCtx.deliveryRepo.saveAttempt(found!);

      const graded = await testCtx.deliveryRepo.findAttemptById('att_expired_psql');
      expect(graded?.status).toBe('TIMED_OUT_GRADED');
      expect(graded?.scoreResult?.score).toBe(5);
      expect(graded?.scoreResult?.passed).toBe(false);

      // Lần quét tiếp theo không còn thấy attempt này vì status đã là TIMED_OUT_GRADED
      const postSweepList = await testCtx.deliveryRepo.findExpiredInProgressAttempts(currentTime, 15000);
      const stillFound = postSweepList.find((a) => a.id === 'att_expired_psql');
      expect(stillFound).toBeUndefined();
    });
  });
});
