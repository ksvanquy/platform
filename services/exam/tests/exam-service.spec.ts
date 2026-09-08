import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createExamRouter } from '../src/presentation/routes/v1-exams.routes.js';
import { Exam, ExamSnapshot } from '../src/domain/entities/exam.entity.js';
import type {
  ExamRepositoryPort,
  QuestionClientPort,
  AssessmentClientPort,
  ExamFilterQuery,
} from '../src/domain/ports/exam.repository.port.js';
import type { QuestionDTO, AssessmentDTO, BlueprintDTO } from '@platform/contracts';

class InMemoryExamRepository implements ExamRepositoryPort {
  private examsMap = new Map<string, Exam>();
  private snapshotsMap = new Map<string, ExamSnapshot[]>();

  async saveExam(exam: Exam): Promise<Exam> {
    this.examsMap.set(exam.id, exam);
    return exam;
  }

  async findExamById(id: string): Promise<Exam | null> {
    return this.examsMap.get(id) || null;
  }

  async findExamByCode(code: string): Promise<Exam | null> {
    for (const e of this.examsMap.values()) {
      if (e.code === code) return e;
    }
    return null;
  }

  async listExams(filter: ExamFilterQuery = {}): Promise<{ exams: Exam[]; total: number }> {
    let list = Array.from(this.examsMap.values());
    if (filter.search) {
      list = list.filter((e) => e.title.toLowerCase().includes(filter.search!.toLowerCase()));
    }
    return { exams: list, total: list.length };
  }

  async deleteExam(id: string): Promise<boolean> {
    return this.examsMap.delete(id);
  }

  async saveSnapshot(snapshot: ExamSnapshot): Promise<ExamSnapshot> {
    const list = this.snapshotsMap.get(snapshot.examId) || [];
    const idx = list.findIndex((s) => s.variantCode === snapshot.variantCode);
    if (idx >= 0) {
      list[idx] = snapshot;
    } else {
      list.push(snapshot);
    }
    this.snapshotsMap.set(snapshot.examId, list);
    return snapshot;
  }

  async findSnapshotById(id: string): Promise<ExamSnapshot | null> {
    for (const list of this.snapshotsMap.values()) {
      const found = list.find((s) => s.id === id);
      if (found) return found;
    }
    return null;
  }

  async findSnapshotByExamAndVariant(examId: string, variantCode: string): Promise<ExamSnapshot | null> {
    const list = this.snapshotsMap.get(examId) || [];
    return list.find((s) => s.variantCode === variantCode) || null;
  }

  async listSnapshotsByExamId(examId: string): Promise<ExamSnapshot[]> {
    return this.snapshotsMap.get(examId) || [];
  }

  async deleteSnapshotsByExamId(examId: string): Promise<number> {
    const list = this.snapshotsMap.get(examId) || [];
    this.snapshotsMap.delete(examId);
    return list.length;
  }
}

describe('Exam Service API & Use Cases', () => {
  let examRepo: InMemoryExamRepository;
  let mockQuestionClient: QuestionClientPort;
  let mockAssessmentClient: AssessmentClientPort;
  let app: express.Express;

  const sampleQuestion: QuestionDTO = {
    id: 'q_mock_01',
    code: 'Q_01',
    type: 'SINGLE',
    topicNodeId: 'TOPIC_MATH',
    difficulty: 'REMEMBER',
    status: 'ACTIVE',
    defaultPoints: 2,
    currentRevision: {
      id: 'rev_mock_01',
      questionId: 'q_mock_01',
      revisionNumber: 1,
      prompt: 'What is 10 / 2?',
      options: [
        { id: 'opt_1', content: '5', isCorrect: true },
        { id: 'opt_2', content: '2', isCorrect: false },
      ],
      createdAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleAssessment: AssessmentDTO = {
    id: 'asm_mock_01',
    code: 'ASM_01',
    title: 'Toán 10 Giữa Kỳ',
    ownerId: 'usr_inst_01',
    primaryTopicNodeId: 'TOPIC_MATH',
    status: 'PUBLISHED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleBlueprint: BlueprintDTO = {
    id: 'bp_mock_01',
    assessmentId: 'asm_mock_01',
    versionNumber: 1,
    durationMinutes: 45,
    criteria: [
      {
        topicNodeId: 'TOPIC_MATH',
        difficulty: 'REMEMBER',
        questionCount: 1,
        pointsPerQuestion: 10,
      },
    ],
    scoringPolicy: { strategyType: 'STANDARD', roundingDecimal: 2 },
    isLocked: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    examRepo = new InMemoryExamRepository();

    mockQuestionClient = {
      getQuestions: async () => [sampleQuestion],
    };

    mockAssessmentClient = {
      getAssessmentWithBlueprint: async () => ({
        assessment: sampleAssessment,
        blueprint: sampleBlueprint,
      }),
    };

    app = express();
    app.use(express.json());
    app.use('/v1/exams', createExamRouter({
      examRepo,
      questionClient: mockQuestionClient,
      assessmentClient: mockAssessmentClient,
    }));
  });

  it('POST /v1/exams - should generate exam with variants from assessment blueprint', async () => {
    const res = await request(app)
      .post('/v1/exams')
      .set('x-user-id', 'usr_inst_01')
      .set('x-user-roles', 'INSTRUCTOR')
      .send({
        assessmentId: 'asm_mock_01',
        code: 'EXM_2026_HK1',
        title: 'Đề Thi Toán 10 Kỳ 1',
        durationMinutes: 45,
        variantsCount: 2,
        seedBase: 777,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('EXM_2026_HK1');
    expect(res.body.data.variantsCount).toBe(2);
    expect(res.body.data.variants).toHaveLength(2);
  });

  it('GET /v1/exams/:idOrCode/manifest - should deliver sanitized exam manifest without answer keys', async () => {
    // Generate first
    await request(app)
      .post('/v1/exams')
      .set('x-user-id', 'usr_inst_01')
      .set('x-user-roles', 'INSTRUCTOR')
      .send({
        assessmentId: 'asm_mock_01',
        code: 'EXM_CANDIDATE',
        title: 'Candidate View Test',
        durationMinutes: 30,
        variantsCount: 1,
      });

    const res = await request(app).get('/v1/exams/EXM_CANDIDATE/manifest');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Candidate View Test');
    expect(res.body.data.questions).toHaveLength(1);

    // CRITICAL: Ensure no isCorrect exists in options
    const question = res.body.data.questions[0];
    for (const opt of question.options) {
      expect(opt.isCorrect).toBeUndefined();
    }
  });

  it('GET /v1/exams/:idOrCode/variants/:variantCode/frozen - should return full frozen payload with answers for author/admin', async () => {
    await request(app)
      .post('/v1/exams')
      .set('x-user-id', 'usr_inst_01')
      .set('x-user-roles', 'INSTRUCTOR')
      .send({
        assessmentId: 'asm_mock_01',
        code: 'EXM_FROZEN_TEST',
        title: 'Frozen Test',
        durationMinutes: 30,
        variantsCount: 1,
      });

    const res = await request(app)
      .get('/v1/exams/EXM_FROZEN_TEST/variants/DEFAULT/frozen')
      .set('x-user-id', 'usr_inst_01')
      .set('x-user-roles', 'INSTRUCTOR');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contentHash).toBeDefined();
    expect(res.body.data.frozenPayload.questions[0].options.some((o: any) => o.isCorrect)).toBe(true);
  });

  it('PATCH /v1/exams/:id/status - should update status and toggle publish', async () => {
    const createRes = await request(app)
      .post('/v1/exams')
      .set('x-user-id', 'usr_inst_01')
      .set('x-user-roles', 'INSTRUCTOR')
      .send({
        assessmentId: 'asm_mock_01',
        code: 'EXM_STATUS_TEST',
        title: 'Status Test',
        durationMinutes: 30,
        variantsCount: 1,
      });

    const examId = createRes.body.data.id;

    // Publish
    const pubRes = await request(app)
      .post(`/v1/exams/${examId}/publish`)
      .set('x-user-id', 'usr_inst_01')
      .set('x-user-roles', 'INSTRUCTOR');
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.data.isPublished).toBe(true);

    // Update status to ACTIVE
    const patchRes = await request(app)
      .patch(`/v1/exams/${examId}/status`)
      .set('x-user-id', 'usr_inst_01')
      .set('x-user-roles', 'INSTRUCTOR')
      .send({ status: 'ACTIVE' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.status).toBe('ACTIVE');
  });
});
