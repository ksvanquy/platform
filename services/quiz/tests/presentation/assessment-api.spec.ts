import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, assessmentRepo, setAuthRepository } from '../../src/presentation/server.js';
import { setupTestPostgresDb, TestPostgresContext } from '../../../auth/tests/helpers/test-db.helper.js';

describe('Assessment Engine API Integration & Facade (Pha 3)', () => {
  let testContext: TestPostgresContext;

  beforeAll(async () => {
    testContext = await setupTestPostgresDb();
    setAuthRepository(testContext.userRepo);
  });

  afterAll(async () => {
    await testContext?.cleanup();
  });
  describe('Authoring REST API (/v1/quizzes)', () => {
    it('should list published quizzes publicly without auth requirement', async () => {
      const res = await request(app).get('/v1/quizzes');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].code).toBe('REACT_CORE');
    });

    it('should reject unauthenticated request when creating a quiz (401)', async () => {
      const res = await request(app)
        .post('/v1/quizzes')
        .send({
          code: 'UNAUTH_QUIZ',
          title: 'Unauthorized Quiz',
        });
      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('UNAUTHORIZED');
    });

    it('should reject student role from creating or publishing quizzes (RBAC 403)', async () => {
      const studentHeaders = {
        'x-user-id': 'student_user_01',
        'x-user-roles': 'STUDENT',
      };

      // Student creates quiz -> 403
      const createRes = await request(app)
        .post('/v1/quizzes')
        .set(studentHeaders)
        .send({
          code: 'STUDENT_QUIZ',
          title: 'Student Attempted Quiz',
        });
      expect(createRes.status).toBe(403);
      expect(createRes.body.errorCode).toBe('FORBIDDEN');

      // Student publishes quiz -> 403
      const pubRes = await request(app)
        .post('/v1/quizzes/quiz_demo/publish')
        .set(studentHeaders)
        .send({ versionId: 'qv_demo_v1' });
      expect(pubRes.status).toBe(403);
      expect(pubRes.body.errorCode).toBe('FORBIDDEN');
    });

    it('should allow authoring workflow for INSTRUCTOR: create quiz -> add version -> publish', async () => {
      const instructorHeaders = {
        'x-user-id': 'instructor_01',
        'x-user-roles': 'INSTRUCTOR',
      };

      // 1. Create Quiz
      const createRes = await request(app)
        .post('/v1/quizzes')
        .set(instructorHeaders)
        .send({
          code: 'TS_EXPERT',
          title: 'TypeScript Expert Exam',
          description: 'Advanced assessment',
        });
      expect(createRes.status).toBe(201);
      const quizId = createRes.body.data.id;

      // 2. Add Version
      const versionRes = await request(app)
        .post(`/v1/quizzes/${quizId}/versions`)
        .set(instructorHeaders)
        .send({
          durationMinutes: 30,
          passingScore: 5,
          questions: [
            {
              id: 'q_ts1',
              type: 'single-choice',
              prompt: 'What is unknown in TS?',
              points: 5,
              options: [
                { id: 'opt_any', text: 'Same as any', isCorrect: false },
                { id: 'opt_safe', text: 'Type-safe counter part of any', isCorrect: true },
              ],
            },
          ],
          scoringPolicy: { strategyType: 'exact-match' },
        });
      expect(versionRes.status).toBe(201);
      const versionId = versionRes.body.data.id;

      // 3. Publish Quiz
      const publishRes = await request(app)
        .post(`/v1/quizzes/${quizId}/publish`)
        .set(instructorHeaders)
        .send({ versionId });
      expect(publishRes.status).toBe(200);
      expect(publishRes.body.data.quiz.status).toBe('PUBLISHED');
    });
  });

  describe('Delivery REST API (/v1/attempts)', () => {
    it('should execute candidate exam lifecycle seamlessly', async () => {
      const candidateHeaders = { 'x-user-id': 'candidate_alice_123' };

      // 1. Create Attempt
      const createRes = await request(app)
        .post('/v1/attempts')
        .set(candidateHeaders)
        .send({ quizId: 'quiz_demo' });
      expect(createRes.status).toBe(201);
      const attemptId = createRes.body.data.id;

      // 2. Start Attempt
      const startRes = await request(app)
        .post(`/v1/attempts/${attemptId}/start`)
        .set(candidateHeaders);
      expect(startRes.status).toBe(200);
      expect(startRes.body.data.attempt.status).toBe('IN_PROGRESS');
      expect(startRes.body.data.questions.length).toBe(3);

      // Verify delivery question is sanitized (no isCorrect or correctAnswer)
      const q1 = startRes.body.data.questions[0];
      expect(q1.options[0]).not.toHaveProperty('isCorrect');

      // 3. Record Answer via PUT /:id/answers/:questionId
      const ansRes = await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q1`)
        .set(candidateHeaders)
        .send({
          answer: { selectedOptionId: 'opt_1' },
          clientTimestamp: Date.now(),
        });
      expect(ansRes.status).toBe(200);

      // 4. Record Answer via POST /:id/answers
      const ansRes2 = await request(app)
        .post(`/v1/attempts/${attemptId}/answers`)
        .set(candidateHeaders)
        .send({
          questionId: 'q2',
          answer: { selectedOptionIds: ['opt_2a', 'opt_2b'] },
          clientTimestamp: Date.now(),
        });
      expect(ansRes2.status).toBe(200);

      // 5. Submit Attempt
      const submitRes = await request(app)
        .post(`/v1/attempts/${attemptId}/submit`)
        .set(candidateHeaders);
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.data.attempt.status).toBe('GRADED');
      expect(submitRes.body.data.scoreResult.score).toBeGreaterThanOrEqual(2);
    });

    it('should prevent IDOR: reject unauthorized candidate trying to answer or submit another person attempt (403)', async () => {
      const ownerHeaders = { 'x-user-id': 'legit_candidate_777' };
      const hackerHeaders = { 'x-user-id': 'cheater_bob_999' };

      // 1. Owner creates and starts attempt
      const createRes = await request(app)
        .post('/v1/attempts')
        .set(ownerHeaders)
        .send({ quizId: 'quiz_demo' });
      expect(createRes.status).toBe(201);
      const attemptId = createRes.body.data.id;

      await request(app)
        .post(`/v1/attempts/${attemptId}/start`)
        .set(ownerHeaders);

      // 2. Hacker tries to view details -> 403
      const hackerGetRes = await request(app)
        .get(`/v1/attempts/${attemptId}`)
        .set(hackerHeaders);
      expect(hackerGetRes.status).toBe(403);
      expect(hackerGetRes.body.errorCode).toBe('FORBIDDEN');

      // 3. Hacker tries to record answer -> 403
      const hackerAnsRes = await request(app)
        .post(`/v1/attempts/${attemptId}/answers`)
        .set(hackerHeaders)
        .send({
          questionId: 'q1',
          answer: { selectedOptionId: 'opt_1' },
        });
      expect(hackerAnsRes.status).toBe(403);
      expect(hackerAnsRes.body.errorCode).toBe('FORBIDDEN');

      // 4. Hacker tries to submit attempt -> 403
      const hackerSubmitRes = await request(app)
        .post(`/v1/attempts/${attemptId}/submit`)
        .set(hackerHeaders);
      expect(hackerSubmitRes.status).toBe(403);
      expect(hackerSubmitRes.body.errorCode).toBe('FORBIDDEN');
    });

    it('should return 404 for removed legacy facade endpoints', async () => {
      const legacyRes = await request(app)
        .post('/api/v1/quizzes/quiz_demo/start')
        .set({ 'x-user-id': 'legacy_user_789' });
      expect(legacyRes.status).toBe(404);
    });
  });

  describe('Unified Auth Endpoints on Port 3000 (/v1/auth & /.well-known)', () => {
    it('should expose JWKS key discovery at /.well-known/jwks.json', async () => {
      const res = await request(app).get('/.well-known/jwks.json');
      expect(res.status).toBe(200);
      expect(res.body.keys).toBeDefined();
      expect(Array.isArray(res.body.keys)).toBe(true);
      expect(res.body.keys[0].kid).toBe('quiz-auth-key-1');
    });

    it('should authenticate user and return valid signed JWT from POST /v1/auth/login', async () => {
      const loginRes = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'student@quiz.local',
          password: 'student123',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.data.tokens.accessToken).toBeDefined();

      const accessToken = loginRes.body.data.tokens.accessToken;

      // Access protected /v1/auth/me using returned token
      const meRes = await request(app)
        .get('/v1/auth/me')
        .set({ Authorization: `Bearer ${accessToken}` });

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.profile.email).toBe('student@quiz.local');
      expect(['usr_student_01', 'usr_student_local']).toContain(meRes.body.data.principal.id);
    });

    it('should reject invalid password at POST /v1/auth/login with 401', async () => {
      const res = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'student@quiz.local',
          password: 'wrong_password',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
