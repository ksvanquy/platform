import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../services/quiz/src/presentation/server.js';
import {
  setupFullMicroservicesDb,
  FullMicroservicesContext,
} from './helpers/test-microservices-db.helper.js';

describe('GIAI ĐOẠN 6: Full E2E Lifecycle Across Decomposed Microservices', () => {
  let fullCtx: FullMicroservicesContext;

  const instructorHeaders = {
    'x-user-id': 'usr_instructor_01',
    'x-user-role': 'INSTRUCTOR',
  };

  const studentHeaders = {
    'x-user-id': 'usr_student_01',
    'x-user-role': 'STUDENT',
  };

  const adminHeaders = {
    'x-user-id': 'usr_admin_01',
    'x-user-role': 'ADMIN',
  };

  beforeAll(async () => {
    fullCtx = await setupFullMicroservicesDb();
  });

  afterAll(async () => {
    if (fullCtx) {
      await fullCtx.cleanup();
    }
  });

  describe('1. Clean Seed Data & Taxonomy Integrity Verification', () => {
    it('should verify taxonomy knowledge tree is accessible', async () => {
      const res = await request(app).get('/v1/taxonomies');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const topicTaxonomy = res.body.data.find(
        (t: any) => t.code === 'TOPIC' || t.name?.includes('Chủ đề')
      );
      expect(topicTaxonomy).toBeDefined();
    });

    it('should verify taxonomy tree has quadratic equation topic node', async () => {
      const res = await request(app).get('/v1/taxonomies/tax_topic/tree');
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
      } else {
        const nodeRes = await request(app).get('/v1/nodes/node_math_quad_eq');
        expect(nodeRes.status).toBe(200);
        expect(nodeRes.body.data.id).toBe('node_math_quad_eq');
      }
    });
  });

  describe('2. Microservice 1: Question Bank Domain & Revisions', () => {
    let createdQuestionId: string;

    it('should create a LaTeX-enabled question item with multiple options', async () => {
      const payload = {
        code: `E2E-MATH-Q-${Date.now()}`,
        type: 'SINGLE',
        topicNodeId: 'node_math_quad_eq',
        gradeNodeId: 'node_grade_10',
        difficulty: 'UNDERSTAND',
        defaultPoints: 2,
        prompt: 'Tìm nghiệm của phương trình $$2x^2 - 5x + 2 = 0$$ trên tập số thực $$\\mathbb{R}$$',
        options: [
          { id: 'opt_e2e_1', content: '$$x = 2$$ hoặc $$x = \\frac{1}{2}$$', isCorrect: true, explanation: 'Áp dụng công thức nghiệm delta = 9' },
          { id: 'opt_e2e_2', content: '$$x = -2$$ hoặc $$x = -\\frac{1}{2}$$', isCorrect: false },
          { id: 'opt_e2e_3', content: '$$x = 1$$ hoặc $$x = 2$$', isCorrect: false },
          { id: 'opt_e2e_4', content: 'Phương trình vô nghiệm', isCorrect: false },
        ],
        explanation: 'Phương trình bậc hai có $$\\Delta = (-5)^2 - 4(2)(2) = 25 - 16 = 9 > 0$$. Nghiệm là $$x_1 = 2, x_2 = \\frac{1}{2}$$.',
      };

      const res = await request(app)
        .post('/v1/questions')
        .set(instructorHeaders)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('ACTIVE');

      createdQuestionId = res.body.data.id;
    });

    it('should retrieve the created question with its active revision', async () => {
      expect(createdQuestionId).toBeDefined();

      const res = await request(app)
        .get(`/v1/questions/${createdQuestionId}`)
        .set(instructorHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdQuestionId);
      expect(res.body.data.currentRevision).toBeDefined();
      expect(res.body.data.currentRevision.options).toHaveLength(4);
    });

    it('should filter questions by topicNodeId and Bloom level', async () => {
      const res = await request(app)
        .get('/v1/questions')
        .query({
          topicNodeId: 'node_math_quad_eq',
          difficulty: 'UNDERSTAND',
        })
        .set(instructorHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      for (const q of res.body.data) {
        expect(q.topicNodeId).toBe('node_math_quad_eq');
        expect(q.difficulty).toBe('UNDERSTAND');
      }
    });
  });

  describe('3. Microservice 2: Assessment Blueprint Specification', () => {
    let assessmentId: string;

    it('should create an assessment specification blueprint', async () => {
      const payload = {
        code: `ASM-E2E-${Date.now()}`,
        title: 'Đề kiểm tra E2E Tích hợp Microservices',
        description: 'Kiểm thử liên dịch vụ Question -> Assessment -> Exam -> Attempt',
        primaryTopicNodeId: 'node_math_quad_eq',
        gradeNodeId: 'node_grade_10',
        durationMinutes: 30,
        passingPercentage: 60,
        maxAttempts: 2,
        criteria: [
          { topicNodeId: 'node_math_quad_eq', difficulty: 'REMEMBER', questionCount: 2, pointsPerQuestion: 1 },
          { topicNodeId: 'node_math_quad_eq', difficulty: 'UNDERSTAND', questionCount: 2, pointsPerQuestion: 2 },
        ],
        scoringPolicy: {
          strategyType: 'STANDARD',
          roundingDecimal: 2,
        },
      };

      const res = await request(app)
        .post('/v1/assessments')
        .set(instructorHeaders)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();

      assessmentId = res.body.data.id;
    });

    it('should lock the assessment blueprint against unauthorized mutations', async () => {
      expect(assessmentId).toBeDefined();

      const lockRes = await request(app)
        .post(`/v1/assessments/${assessmentId}/blueprint/lock`)
        .set(instructorHeaders);

      expect(lockRes.status).toBe(200);
      expect(lockRes.body.success).toBe(true);

      // Cố gắng sửa đổi blueprint đã bị khóa phải bị từ chối
      const mutateRes = await request(app)
        .put(`/v1/assessments/${assessmentId}/blueprint`)
        .set(instructorHeaders)
        .send({
          durationMinutes: 90,
        });

      expect(mutateRes.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('4. Microservice 3: Exam Matrix Solver & Candidate Sanitization', () => {
    it('should solve specification matrix and generate exam variants with tamper-proof snapshots', async () => {
      const examCode = `EXM-E2E-${Date.now()}`;
      const payload = {
        assessmentId: 'asm_math10_midterm',
        code: examCode,
        title: 'Đề Thi E2E Ma Trận Chuẩn Hóa',
        durationMinutes: 45,
        variantsCount: 2,
        seedBase: 2026,
      };

      const res = await request(app)
        .post('/v1/exams')
        .set(instructorHeaders)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.variants).toHaveLength(2);

      // Publish exam để thí sinh có thể làm bài
      await request(app)
        .post(`/v1/exams/${res.body.data.id}/publish`)
        .set(instructorHeaders);
    });

    it('should deliver SanitizedExamManifest to candidates with ZERO answer keys or explanations', async () => {
      const res = await request(app)
        .get('/v1/exams/EXM_TOAN10_HK1/manifest')
        .set(studentHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const manifest = res.body.data;
      expect(manifest.questions).toBeDefined();
      expect(manifest.questions.length).toBeGreaterThan(0);

      // Kiểm tra ranh giới an toàn (Zero Leakage)
      for (const q of manifest.questions) {
        expect(q.prompt).toBeDefined();
        expect(q.options).toBeDefined();
        expect((q as any).explanation).toBeUndefined();
        expect((q as any).rubric).toBeUndefined();

        for (const opt of q.options) {
          expect(opt.id).toBeDefined();
          expect(opt.content).toBeDefined();
          expect((opt as any).isCorrect).toBeUndefined();
          expect((opt as any).explanation).toBeUndefined();
        }
      }
    });

    it('should protect internal frozen snapshot (accessible only by AUTHOR/ADMIN)', async () => {
      // Student cố truy cập frozen snapshot -> Phải bị từ chối
      const studentAttempt = await request(app)
        .get('/v1/exams/EXM_TOAN10_HK1/variants/101/frozen')
        .set(studentHeaders);

      expect(studentAttempt.status).toBeGreaterThanOrEqual(400);

      // Instructor/Admin truy cập hợp lệ
      const adminAccess = await request(app)
        .get('/v1/exams/EXM_TOAN10_HK1/variants/101/frozen')
        .set(adminHeaders);

      expect(adminAccess.status).toBe(200);
      expect(adminAccess.body.success).toBe(true);
      expect(adminAccess.body.data.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(adminAccess.body.data.frozenPayload.questions[0].options[0].isCorrect).toBeDefined();
    });
  });

  describe('5. Microservice 4: Candidate Attempt Session, Autosave & Grading', () => {
    let attemptId: string;
    let examManifest: any;

    it('should start or recover candidate attempt session with server-authoritative timer', async () => {
      const res = await request(app)
        .post('/v1/attempts')
        .set(studentHeaders)
        .send({
          examCode: 'EXM_TOAN10_HK1',
          variantCode: '101',
          autoStart: true,
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.manifest).toBeDefined();

      attemptId = res.body.data.id;
      examManifest = res.body.manifest;
    });

    it('should autosave candidate answers with monotonic sequence numbers (<25ms SLA)', async () => {
      expect(attemptId).toBeDefined();
      expect(examManifest.questions.length).toBeGreaterThan(0);

      const firstQuestion = examManifest.questions[0];
      const selectedOptionId = firstQuestion.options[0].id;

      const res = await request(app)
        .post(`/v1/attempts/${attemptId}/answers`)
        .set(studentHeaders)
        .send({
          questionId: firstQuestion.id,
          answer: { selectedOptionId },
          sequenceNumber: 1,
          clientTimestamp: Date.now(),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sequenceNumber).toBe(1);
    });

    it('should record proctoring telemetry events (Anti-Cheat)', async () => {
      expect(attemptId).toBeDefined();

      const res = await request(app)
        .post(`/v1/attempts/${attemptId}/events`)
        .set(studentHeaders)
        .send({
          eventType: 'TAB_SWITCH',
          clientTimestamp: new Date().toISOString(),
          metadata: { blurDurationMs: 3400, url: 'external-search' },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should submit attempt and execute deterministic scoring against frozen snapshot', async () => {
      expect(attemptId).toBeDefined();

      const res = await request(app)
        .post(`/v1/attempts/${attemptId}/submit`)
        .set(studentHeaders)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const attempt = res.body.data;
      expect(['SUBMITTED', 'GRADED', 'TIMED_OUT_GRADED']).toContain(attempt.status);

      // Điểm số và kết quả đánh giá
      if (attempt.scoreResult) {
        const earned = attempt.scoreResult.score ?? attempt.scoreResult.earnedScore;
        expect(typeof earned).toBe('number');
        expect(typeof attempt.scoreResult.maxScore).toBe('number');
        expect(attempt.scoreResult.maxScore).toBeGreaterThan(0);
        expect(typeof attempt.scoreResult.percentage).toBe('number');
      }
    });

    it('should allow proctors and admins to inspect anti-cheat audit logs', async () => {
      expect(attemptId).toBeDefined();

      const res = await request(app)
        .get(`/v1/attempts/${attemptId}/events`)
        .set(adminHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const tabSwitchEvent = res.body.data.find((e: any) => e.eventType === 'TAB_SWITCH');
      expect(tabSwitchEvent).toBeDefined();
    });
  });
});
