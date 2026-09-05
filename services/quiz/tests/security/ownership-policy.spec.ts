import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import type { Principal, TenantContext } from '@platform/contracts';
import { AuthoringUseCases } from '../../src/application/use-cases/authoring/authoring.use-cases.js';
import { DeliveryUseCases } from '../../src/application/use-cases/delivery/delivery.use-cases.js';
import { createV1QuizzesRouter } from '../../src/presentation/routes/v1-quizzes.routes.js';
import { createV1AttemptsRouter } from '../../src/presentation/routes/v1-attempts.routes.js';
import { authContextMiddleware } from '../../src/presentation/middlewares/auth.middleware.js';
import { OwnershipDomainError } from '../../src/domain/errors/domain-errors.js';
import { setupTestQuizDb, TestQuizDbContext } from '../helpers/test-db.helper.js';

describe('Gói WP-6: Áp dụng Ownership Policy tại Quiz Service (ABAC Lightweight)', () => {
  let testCtx: TestQuizDbContext;
  let authoringUseCases: AuthoringUseCases;
  let deliveryUseCases: DeliveryUseCases;
  let app: Express;

  const tenantCore: TenantContext = { tenantId: 'tenant_core' };
  const tenantForeign: TenantContext = { tenantId: 'tenant_foreign' };

  const instructorA: Principal = {
    id: 'usr_inst_a',
    roles: ['INSTRUCTOR'],
    permissions: ['quiz:create', 'quiz:read', 'quiz:update', 'quiz:publish', 'quiz:delete', 'attempt:review'],
  };

  const instructorB: Principal = {
    id: 'usr_inst_b',
    roles: ['INSTRUCTOR'],
    permissions: ['quiz:create', 'quiz:read', 'quiz:update', 'quiz:publish', 'quiz:delete', 'attempt:review'],
  };

  const instructorForeignTenant: Principal = {
    id: 'usr_inst_c',
    roles: ['INSTRUCTOR'],
    permissions: ['quiz:create', 'quiz:read', 'quiz:update', 'quiz:publish', 'quiz:delete'],
  };

  const adminPrincipal: Principal = {
    id: 'usr_admin_01',
    roles: ['ADMIN'],
    permissions: ['*'],
  };

  const studentA: Principal = {
    id: 'usr_student_a',
    roles: ['STUDENT'],
    permissions: ['attempt:create', 'attempt:start', 'attempt:record_answer', 'attempt:submit', 'attempt:read_own'],
  };

  const studentB: Principal = {
    id: 'usr_student_b',
    roles: ['STUDENT'],
    permissions: ['attempt:create', 'attempt:start', 'attempt:record_answer', 'attempt:submit', 'attempt:read_own'],
  };

  beforeEach(async () => {
    testCtx = await setupTestQuizDb();
    authoringUseCases = new AuthoringUseCases(testCtx.authoringRepo);
    deliveryUseCases = new DeliveryUseCases(testCtx.authoringRepo, testCtx.deliveryRepo);

    app = express();
    app.use(express.json());
    app.use(authContextMiddleware);
    app.use('/v1/quizzes', createV1QuizzesRouter(authoringUseCases));
    app.use('/v1/attempts', createV1AttemptsRouter(deliveryUseCases));
  }, 30000);

  afterEach(async () => {
    await testCtx?.cleanup();
  }, 30000);

  describe('1. Authoring Use Cases - Quiz Ownership Policy', () => {
    it('Instructor A can create and own a quiz', async () => {
      const quiz = await authoringUseCases.createQuiz(
        {
          code: 'MATH_101',
          title: 'Toán Học 101',
          description: 'Khóa cơ bản',
          ownerId: instructorA.id,
        },
        instructorA,
        tenantCore
      );

      expect(quiz.id).toBeDefined();
      expect(quiz.ownerId).toBe(instructorA.id);
      expect(quiz.tenantId).toBe('tenant_core');
    });

    it('Instructor A (owner) can add version, update, and publish their own quiz', async () => {
      const quiz = await authoringUseCases.createQuiz(
        {
          code: 'MATH_102',
          title: 'Toán Học 102',
          ownerId: instructorA.id,
        },
        instructorA,
        tenantCore
      );

      // Add version
      const version = await authoringUseCases.addVersion(
        {
          quizId: quiz.id,
          durationMinutes: 30,
          passingScore: 5,
          questions: [
            {
              id: 'q1',
              type: 'single-choice',
              prompt: '1 + 1 = ?',
              points: 10,
              options: [
                { id: 'opt_1', text: '2', isCorrect: true },
                { id: 'opt_2', text: '3', isCorrect: false },
              ],
            },
          ],
          scoringPolicy: { strategyType: 'exact-match' },
          randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
        },
        instructorA,
        tenantCore
      );
      expect(version.versionNumber).toBe(1);

      // Update quiz
      const updated = await authoringUseCases.updateQuiz(
        {
          quizId: quiz.id,
          title: 'Toán Học 102 - Nâng Cao',
        },
        instructorA,
        tenantCore
      );
      expect(updated.title).toBe('Toán Học 102 - Nâng Cao');

      // Publish quiz
      const published = await authoringUseCases.publishQuiz(
        {
          quizId: quiz.id,
          versionId: version.id,
        },
        instructorA,
        tenantCore
      );
      expect(published.quiz.status).toBe('PUBLISHED');
      expect(published.quiz.currentPublishedVersionId).toBe(version.id);
    });

    it('Instructor B is blocked with OwnershipDomainError (FORBIDDEN_OWNERSHIP_MISMATCH) when modifying Instructor A quiz', async () => {
      const quiz = await authoringUseCases.createQuiz(
        {
          code: 'PHYS_201',
          title: 'Vật Lý Đại Cương',
          ownerId: instructorA.id,
        },
        instructorA,
        tenantCore
      );

      // Instructor B tries to add version
      await expect(
        authoringUseCases.addVersion(
          {
            quizId: quiz.id,
            durationMinutes: 45,
            passingScore: 5,
            questions: [],
            scoringPolicy: { strategyType: 'exact-match' },
            randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
          },
          instructorB,
          tenantCore
        )
      ).rejects.toThrow(OwnershipDomainError);

      // Instructor B tries to update details
      await expect(
        authoringUseCases.updateQuiz(
          {
            quizId: quiz.id,
            title: 'Hacked Title',
          },
          instructorB,
          tenantCore
        )
      ).rejects.toThrow(OwnershipDomainError);

      // Instructor B tries to delete
      await expect(
        authoringUseCases.deleteQuiz(quiz.id, instructorB, tenantCore)
      ).rejects.toThrow(OwnershipDomainError);
    });

    it('Admin with quiz:manage_all can modify and publish any quiz (Admin Bypass)', async () => {
      const quiz = await authoringUseCases.createQuiz(
        {
          code: 'CHEM_301',
          title: 'Hóa Học 301',
          ownerId: instructorA.id,
        },
        instructorA,
        tenantCore
      );

      // Admin adds version
      const version = await authoringUseCases.addVersion(
        {
          quizId: quiz.id,
          durationMinutes: 20,
          passingScore: 5,
          questions: [
            {
              id: 'q_admin_1',
              type: 'true-false',
              prompt: 'Is Admin allowed to manage all?',
              points: 10,
              correctAnswer: true,
            },
          ],
          scoringPolicy: { strategyType: 'exact-match' },
          randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
        },
        adminPrincipal,
        tenantCore
      );
      expect(version).toBeDefined();

      // Admin publishes
      const result = await authoringUseCases.publishQuiz(
        {
          quizId: quiz.id,
          versionId: version.id,
        },
        adminPrincipal,
        tenantCore
      );
      expect(result.quiz.status).toBe('PUBLISHED');
    });

    it('Instructor from foreign tenant is blocked by tenant boundary', async () => {
      const quiz = await authoringUseCases.createQuiz(
        {
          code: 'BIO_101',
          title: 'Sinh Học 101',
          ownerId: instructorA.id,
        },
        instructorA,
        tenantCore
      );

      await expect(
        authoringUseCases.addVersion(
          {
            quizId: quiz.id,
            durationMinutes: 15,
            passingScore: 1,
            questions: [],
            scoringPolicy: { strategyType: 'exact-match' },
            randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
          },
          instructorA,
          tenantForeign
        )
      ).rejects.toThrow(OwnershipDomainError);
    });
  });

  describe('2. Delivery Use Cases - Attempt Ownership Policy', () => {
    let publishedQuizId: string;

    beforeEach(async () => {
      // Create and publish a quiz as Instructor A
      const quiz = await authoringUseCases.createQuiz(
        {
          code: 'DELIVERY_TEST',
          title: 'Delivery Test Quiz',
          ownerId: instructorA.id,
        },
        instructorA,
        tenantCore
      );
      const version = await authoringUseCases.addVersion(
        {
          quizId: quiz.id,
          durationMinutes: 60,
          passingScore: 5,
          questions: [
            {
              id: 'q_del_1',
              type: 'single-choice',
              prompt: 'Capital of France?',
              points: 10,
              options: [
                { id: 'opt_paris', text: 'Paris', isCorrect: true },
                { id: 'opt_rome', text: 'Rome', isCorrect: false },
              ],
            },
          ],
          scoringPolicy: { strategyType: 'exact-match' },
          randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
        },
        instructorA,
        tenantCore
      );
      await authoringUseCases.publishQuiz(
        {
          quizId: quiz.id,
          versionId: version.id,
        },
        instructorA,
        tenantCore
      );
      publishedQuizId = quiz.id;
    });

    it('Student A cannot create an attempt masquerading as Student B', async () => {
      await expect(
        deliveryUseCases.createAttempt(
          {
            userId: studentB.id,
            quizId: publishedQuizId,
          },
          studentA,
          tenantCore
        )
      ).rejects.toThrow(OwnershipDomainError);
    });

    it('Student A can start, record answers, view, and submit their own attempt', async () => {
      const { attempt } = await deliveryUseCases.createAttempt(
        {
          userId: studentA.id,
          quizId: publishedQuizId,
        },
        studentA,
        tenantCore
      );
      expect(attempt.userId).toBe(studentA.id);

      // Start attempt
      const startResult = await deliveryUseCases.startAttempt(
        {
          attemptId: attempt.id,
          userId: studentA.id,
        },
        studentA,
        tenantCore
      );
      expect(startResult.attempt.status).toBe('IN_PROGRESS');

      // Record answer
      await expect(
        deliveryUseCases.recordAnswer(
          {
            attemptId: attempt.id,
            userId: studentA.id,
            questionId: 'q_del_1',
            answer: 'opt_paris',
          },
          studentA,
          tenantCore
        )
      ).resolves.not.toThrow();

      // Get details
      const details = await deliveryUseCases.getAttemptDetails(
        attempt.id,
        studentA.id,
        new Date(),
        15000,
        studentA,
        tenantCore
      );
      expect(details.attempt.id).toBe(attempt.id);

      // Submit attempt
      const submitResult = await deliveryUseCases.submitAttempt(
        {
          attemptId: attempt.id,
          userId: studentA.id,
        },
        studentA,
        tenantCore
      );
      expect(['GRADED', 'SUBMITTED_GRADED']).toContain(submitResult.attempt.status);
      expect(submitResult.scoreResult.score).toBe(10);
    });

    it('Student B is blocked with OwnershipDomainError from tampering with Student A attempt', async () => {
      const { attempt } = await deliveryUseCases.createAttempt(
        {
          userId: studentA.id,
          quizId: publishedQuizId,
        },
        studentA,
        tenantCore
      );

      // Student B attempts to start Student A attempt
      await expect(
        deliveryUseCases.startAttempt(
          {
            attemptId: attempt.id,
            userId: studentB.id,
          },
          studentB,
          tenantCore
        )
      ).rejects.toThrow(OwnershipDomainError);

      // Student A starts their attempt
      await deliveryUseCases.startAttempt(
        {
          attemptId: attempt.id,
          userId: studentA.id,
        },
        studentA,
        tenantCore
      );

      // Student B attempts to record answer
      await expect(
        deliveryUseCases.recordAnswer(
          {
            attemptId: attempt.id,
            userId: studentB.id,
            questionId: 'q_del_1',
            answer: 'opt_rome',
          },
          studentB,
          tenantCore
        )
      ).rejects.toThrow(OwnershipDomainError);

      // Student B attempts to submit Student A attempt
      await expect(
        deliveryUseCases.submitAttempt(
          {
            attemptId: attempt.id,
            userId: studentB.id,
          },
          studentB,
          tenantCore
        )
      ).rejects.toThrow(OwnershipDomainError);

      // Student B attempts to view Student A attempt
      await expect(
        deliveryUseCases.getAttemptDetails(
          attempt.id,
          studentB.id,
          new Date(),
          15000,
          studentB,
          tenantCore
        )
      ).rejects.toThrow(OwnershipDomainError);
    });

    it('Instructor A (quiz owner) and Admin can review Student A attempt details', async () => {
      const { attempt } = await deliveryUseCases.createAttempt(
        {
          userId: studentA.id,
          quizId: publishedQuizId,
        },
        studentA,
        tenantCore
      );

      // Instructor A (owns the quiz) reviews attempt
      const reviewAsInstructor = await deliveryUseCases.getAttemptDetails(
        attempt.id,
        instructorA.id,
        new Date(),
        15000,
        instructorA,
        tenantCore
      );
      expect(reviewAsInstructor.attempt.id).toBe(attempt.id);

      // Admin reviews attempt
      const reviewAsAdmin = await deliveryUseCases.getAttemptDetails(
        attempt.id,
        adminPrincipal.id,
        new Date(),
        15000,
        adminPrincipal,
        tenantCore
      );
      expect(reviewAsAdmin.attempt.id).toBe(attempt.id);
    });
  });

  describe('3. HTTP Endpoints - 403 Forbidden with FORBIDDEN_OWNERSHIP_MISMATCH', () => {
    let publishedQuizId: string;
    let studentAAttemptId: string;

    beforeEach(async () => {
      // Create quiz as Instructor A
      const createRes = await request(app)
        .post('/v1/quizzes')
        .set('x-user-id', instructorA.id)
        .set('x-user-role', 'INSTRUCTOR')
        .set('x-tenant-id', tenantCore.tenantId)
        .send({
          code: 'HTTP_TEST_01',
          title: 'HTTP Security Quiz',
        });
      expect(createRes.status).toBe(201);
      const quizId = createRes.body.data.id;

      // Add version as Instructor A
      const versionRes = await request(app)
        .post(`/v1/quizzes/${quizId}/versions`)
        .set('x-user-id', instructorA.id)
        .set('x-user-role', 'INSTRUCTOR')
        .set('x-tenant-id', tenantCore.tenantId)
        .send({
          durationMinutes: 10,
          passingScore: 1,
          questions: [
            {
              id: 'q1',
              type: 'true-false',
              prompt: 'Is HTTP secure by default?',
              points: 2,
              correctAnswer: false,
            },
          ],
          scoringPolicy: { strategyType: 'exact-match' },
        });
      expect(versionRes.status).toBe(201);
      const versionId = versionRes.body.data.id;

      // Publish as Instructor A
      const publishRes = await request(app)
        .post(`/v1/quizzes/${quizId}/publish`)
        .set('x-user-id', instructorA.id)
        .set('x-user-role', 'INSTRUCTOR')
        .set('x-tenant-id', tenantCore.tenantId)
        .send({ versionId });
      expect(publishRes.status).toBe(200);
      publishedQuizId = quizId;

      // Create attempt as Student A
      const attemptRes = await request(app)
        .post('/v1/attempts')
        .set('x-user-id', studentA.id)
        .set('x-user-role', 'STUDENT')
        .set('x-tenant-id', tenantCore.tenantId)
        .send({ quizId: publishedQuizId });
      expect(attemptRes.status).toBe(201);
      studentAAttemptId = attemptRes.body.data.id;
    });

    it('returns HTTP 403 FORBIDDEN_OWNERSHIP_MISMATCH when Instructor B modifies Instructor A quiz', async () => {
      // Instructor B tries to add a version to Instructor A quiz
      const res = await request(app)
        .post(`/v1/quizzes/${publishedQuizId}/versions`)
        .set('x-user-id', instructorB.id)
        .set('x-user-role', 'INSTRUCTOR')
        .set('x-tenant-id', tenantCore.tenantId)
        .send({
          durationMinutes: 20,
          passingScore: 2,
          questions: [],
          scoringPolicy: { strategyType: 'exact-match' },
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN_OWNERSHIP_MISMATCH');
    });

    it('returns HTTP 403 FORBIDDEN_OWNERSHIP_MISMATCH when Instructor B updates Instructor A quiz details', async () => {
      const res = await request(app)
        .put(`/v1/quizzes/${publishedQuizId}`)
        .set('x-user-id', instructorB.id)
        .set('x-user-role', 'INSTRUCTOR')
        .set('x-tenant-id', tenantCore.tenantId)
        .send({
          title: 'Illegally Changed Title',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN_OWNERSHIP_MISMATCH');
    });

    it('returns HTTP 403 FORBIDDEN_OWNERSHIP_MISMATCH when Student B starts Student A attempt', async () => {
      const res = await request(app)
        .post(`/v1/attempts/${studentAAttemptId}/start`)
        .set('x-user-id', studentB.id)
        .set('x-user-role', 'STUDENT')
        .set('x-tenant-id', tenantCore.tenantId)
        .send();

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN_OWNERSHIP_MISMATCH');
    });

    it('returns HTTP 403 FORBIDDEN_OWNERSHIP_MISMATCH when Student B answers Student A attempt', async () => {
      // First Student A starts attempt
      await request(app)
        .post(`/v1/attempts/${studentAAttemptId}/start`)
        .set('x-user-id', studentA.id)
        .set('x-user-role', 'STUDENT')
        .set('x-tenant-id', tenantCore.tenantId)
        .send();

      // Student B records answer
      const res = await request(app)
        .post(`/v1/attempts/${studentAAttemptId}/answers`)
        .set('x-user-id', studentB.id)
        .set('x-user-role', 'STUDENT')
        .set('x-tenant-id', tenantCore.tenantId)
        .send({
          questionId: 'q1',
          answer: true,
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN_OWNERSHIP_MISMATCH');
    });

    it('returns HTTP 403 FORBIDDEN_OWNERSHIP_MISMATCH when Student B submits Student A attempt', async () => {
      const res = await request(app)
        .post(`/v1/attempts/${studentAAttemptId}/submit`)
        .set('x-user-id', studentB.id)
        .set('x-user-role', 'STUDENT')
        .set('x-tenant-id', tenantCore.tenantId)
        .send();

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN_OWNERSHIP_MISMATCH');
    });
  });
});
