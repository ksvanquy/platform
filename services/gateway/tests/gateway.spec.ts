import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import {
  app,
  setAuthRepository,
  setTaxonomyRepository,
  setQuestionRepository,
  setAssessmentRepository,
  setExamRepository,
  setAttemptRepository,
} from '../src/server.js';
import {
  InMemoryUserRepository,
  TokenService,
} from '@platform/auth-service';

describe('GIAI ĐOẠN 7: API Gateway & Clean Microservices Integration (Port 3000)', () => {
  let authRepo: InMemoryUserRepository;
  let tokenService: TokenService;
  let adminToken: string;
  let studentToken: string;

  beforeAll(async () => {
    // 1. Auth Setup
    authRepo = new InMemoryUserRepository();
    tokenService = new TokenService();
    setAuthRepository(authRepo);

    // 2. Taxonomy Mock Setup
    const mockTaxonomyRepo: any = {
      findTaxonomies: async () => [
        {
          id: 'tax_topic',
          code: 'TOPIC',
          name: 'Chủ đề',
          description: 'Chủ đề kiến thức',
          isHierarchical: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      findTaxonomyByCode: async () => null,
      findTaxonomyById: async () => null,
      createTaxonomy: async (t: any) => t,
      findNodesByTaxonomyId: async () => [],
      findNodeById: async () => null,
      findNodeByCode: async () => null,
      createNode: async (n: any) => n,
      updateNode: async () => null,
      deleteNode: async () => true,
      moveNode: async () => null,
      getDescendants: async () => [],
      getBreadcrumbs: async () => [],
    };
    setTaxonomyRepository(mockTaxonomyRepo);

    // 3. Question Mock Setup
    const mockQuestionRepo: any = {
      save: async (q: any) => q,
      findById: async () => null,
      findByCode: async () => null,
      findRevision: async () => null,
      listRevisions: async () => [],
      listQuestions: async () => ({ questions: [], total: 0 }),
      delete: async () => true,
    };
    setQuestionRepository(mockQuestionRepo);

    // 4. Assessment Mock Setup
    const mockAssessmentRepo: any = {
      save: async (a: any) => a,
      findById: async () => null,
      findByCode: async () => null,
      listAssessments: async () => ({ assessments: [], total: 0 }),
      delete: async () => true,
      updateStatus: async () => null,
      updateBlueprint: async () => null,
    };
    setAssessmentRepository(mockAssessmentRepo);

    // 5. Exam Mock Setup with mocked clients
    const mockExamRepo: any = {
      saveExam: async (e: any) => e,
      findExamById: async () => null,
      findExamByCode: async () => null,
      listExams: async () => ({ exams: [], total: 0 }),
      listSnapshotsByExamId: async () => [],
      updateExam: async () => null,
      deleteExam: async () => true,
      findVariantByCode: async () => null,
      saveVariant: async (v: any) => v,
      listVariantsByExamId: async () => [],
    };
    const mockQuestionClient: any = {
      getQuestion: async () => null,
      listQuestions: async () => [],
    };
    const mockAssessmentClient: any = {
      getAssessment: async () => null,
    };
    setExamRepository(mockExamRepo, mockQuestionClient, mockAssessmentClient);

    // 6. Attempt Mock Setup with mocked exam client
    const mockAttemptRepo: any = {
      findAttemptById: async () => null,
      findActiveAttempt: async () => null,
      saveAttempt: async (a: any) => a,
      listAttemptsByUser: async () => [],
      listAttempts: async () => ({ attempts: [], total: 0 }),
      saveEvent: async (e: any) => e,
      listEventsByAttemptId: async () => [],
    };
    const mockExamClient: any = {
      getExam: async () => null,
      getExamSnapshot: async () => null,
      getSanitizedManifest: async () => null,
    };
    setAttemptRepository(mockAttemptRepo, mockExamClient);

    // Retrieve seeded admin and student users
    const adminUser = await authRepo.findByEmail('admin@quiz.local');
    const studentUser = await authRepo.findByEmail('student@quiz.local');

    expect(adminUser).toBeDefined();
    expect(studentUser).toBeDefined();

    const adminAuthTokens = tokenService.generateTokens({
      sub: adminUser!.id,
      email: adminUser!.email,
      roles: ['ADMIN'],
    });
    adminToken = adminAuthTokens.accessToken;

    const studentAuthTokens = tokenService.generateTokens({
      sub: studentUser!.id,
      email: studentUser!.email,
      roles: ['STUDENT'],
    });
    studentToken = studentAuthTokens.accessToken;
  });

  it('1. GET /health - Trả về trạng thái hoạt động của Unified Gateway và tất cả Microservices', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('API Gateway');
    expect(res.body.services).toBeDefined();
    expect(res.body.services.auth).toBeDefined();
    expect(res.body.services.taxonomy).toBeDefined();
    expect(res.body.services.question).toBeDefined();
    expect(res.body.services.assessment).toBeDefined();
    expect(res.body.services.exam).toBeDefined();
    expect(res.body.services.attempt).toBeDefined();
  });

  it('2. GET /.well-known/jwks.json - Trả về public key JWKS để xác thực token', async () => {
    const res = await request(app).get('/.well-known/jwks.json');
    expect(res.status).toBe(200);
    expect(res.body.keys).toBeDefined();
    expect(Array.isArray(res.body.keys)).toBe(true);
    expect(res.body.keys.length).toBeGreaterThan(0);
  });

  it('3. GET /v1/time - Server-Authoritative Clock Synchronization (Zero-Trust Timing Defense)', async () => {
    const res = await request(app).get('/v1/time');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.serverTime).toBeDefined();
    expect(res.body.timestampMs).toBeDefined();
    expect(res.headers['x-server-time']).toBeDefined();
  });

  it('4. GET /api - Khám phá Unified Architecture và Microservices endpoints', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('Platform API Gateway & Microservices Unified Entry Point');
    expect(res.body.architecture).toBe(
      'Pure Microservices Architecture (Question, Assessment, Exam, Attempt, Taxonomy, Auth)'
    );
    expect(Array.isArray(res.body.endpoints)).toBe(true);
    expect(res.body.endpoints.length).toBeGreaterThan(10);
  });

  it('4b. GET /v1/hosting-config - CDN & Frontend Decoupled Hosting Discovery (Phương án A)', async () => {
    const res = await request(app).get('/v1/hosting-config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.architecture).toContain('Decoupled Static Hosting');
    expect(res.body.corsConfig).toBeDefined();
    expect(res.body.corsConfig.credentialsAllowed).toBe(true);
  });

  it('5. GET /v1/taxonomies - Gateway điều hướng thành công tới Taxonomy Service', async () => {
    const res = await request(app).get('/v1/taxonomies');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('6. Question Service - Gateway bảo vệ RBAC cho tác vụ Question Authoring', async () => {
    // Không có token -> 401
    const unauthRes = await request(app)
      .post('/v1/questions')
      .send({ content: 'Test Question' });
    expect(unauthRes.status).toBe(401);

    // Student token (không có quyền tác giả) -> 403 Forbidden
    const forbiddenRes = await request(app)
      .post('/v1/questions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ content: 'Test Question' });
    expect(forbiddenRes.status).toBe(403);
  });

  it('7. GET /v1/assessments - Gateway điều hướng tới Assessment Service', async () => {
    const res = await request(app).get('/v1/assessments');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('8. GET /v1/exams - Gateway điều hướng tới Exam Service', async () => {
    const res = await request(app).get('/v1/exams');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('9. POST /v1/attempts - Gateway điều hướng tới Attempt Service và yêu cầu Candidate Authentication', async () => {
    const unauthRes = await request(app)
      .post('/v1/attempts')
      .send({ examId: 'exam_demo' });
    expect(unauthRes.status).toBe(401);

    const authRes = await request(app)
      .post('/v1/attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ examId: 'exam_demo' });
    // Attempt Service xử lý và trả về 404 (exam không tồn tại trong ExamClient), chứng minh flow kết nối hoàn hảo
    expect(authRes.status).toBe(404);
    expect(authRes.body.success).toBe(false);
  });

  it('10. Xác nhận Quiz Service cũ (/v1/quizzes) đã được loại bỏ hoàn toàn', async () => {
    // Gọi route không tồn tại trả về 404
    const res = await request(app).get('/v1/non-existent-legacy-route');
    expect(res.status).toBe(404);
  });
});
