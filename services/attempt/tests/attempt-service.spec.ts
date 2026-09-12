import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Attempt } from '../src/domain/entities/attempt.entity.js';
import { AttemptEvent } from '../src/domain/entities/attempt-event.entity.js';
import { AttemptScoringEngine } from '../src/domain/scoring/attempt-scoring.engine.js';
import { AttemptExpirySweeperService } from '../src/domain/services/attempt-expiry-sweeper.service.js';
import {
  AttemptAlreadySubmittedError,
  AttemptTimeExpiredError,
  AttemptAlreadyFinalizedError,
  AttemptNotFoundError,
  UnauthorizedAttemptAccessError,
} from '../src/domain/errors/attempt-domain.errors.js';
import { createV1AttemptsRouter } from '../src/presentation/routes/v1-attempts.routes.js';
import { createV1InternalRouter } from '../src/presentation/routes/v1-internal.routes.js';
import type {
  AttemptRepositoryPort,
  ExamClientPort,
  AttemptFilterQuery,
} from '../src/domain/ports/attempt.repository.port.js';
import type {
  ExamDTO,
  ExamSnapshotDTO,
  SanitizedExamManifest,
  FrozenQuestionItem,
  CandidateAnswerRecord,
} from '@platform/contracts';

class InMemoryAttemptRepository implements AttemptRepositoryPort {
  private attemptsMap = new Map<string, Attempt>();
  private eventsMap = new Map<string, AttemptEvent[]>();

  async saveAttempt(attempt: Attempt): Promise<Attempt> {
    const existing = this.attemptsMap.get(attempt.id);
    if (existing && existing.isFinalized() && !attempt.isFinalized()) {
      // Chặn State Regression khi ghi đè trạng thái đã hoàn tất bằng trạng thái đang làm
      return existing;
    }
    this.attemptsMap.set(attempt.id, attempt);
    return attempt;
  }

  async findAttemptById(id: string): Promise<Attempt | null> {
    return this.attemptsMap.get(id) || null;
  }

  async findActiveAttempt(userId: string, examId: string): Promise<Attempt | null> {
    for (const a of this.attemptsMap.values()) {
      if (a.userId === userId && a.examId === examId && (a.status === 'CREATED' || a.status === 'IN_PROGRESS')) {
        return a;
      }
    }
    return null;
  }

  async listAttemptsByUser(userId: string, examId?: string): Promise<Attempt[]> {
    const res: Attempt[] = [];
    for (const a of this.attemptsMap.values()) {
      if (a.userId === userId && (!examId || a.examId === examId)) {
        res.push(a);
      }
    }
    return res;
  }

  async listAttempts(filter: AttemptFilterQuery = {}): Promise<{ attempts: Attempt[]; total: number }> {
    let list = Array.from(this.attemptsMap.values());
    if (filter.userId) {
      list = list.filter((a) => a.userId === filter.userId);
    }
    if (filter.examId) {
      list = list.filter((a) => a.examId === filter.examId);
    }
    if (filter.status) {
      list = list.filter((a) => a.status === filter.status);
    }
    return { attempts: list, total: list.length };
  }

  async findExpiredInProgressAttempts(now: Date, gracePeriodMs: number, limit = 50): Promise<Attempt[]> {
    const expired: Attempt[] = [];
    const threshold = new Date(now.getTime() - gracePeriodMs);
    for (const a of this.attemptsMap.values()) {
      if (a.status === 'IN_PROGRESS' && a.deadline && a.deadline.getTime() <= threshold.getTime()) {
        if (this.lockQueues.has(a.id)) {
          continue;
        }
        expired.push(a);
      }
    }
    expired.sort((a, b) => (a.deadline?.getTime() || 0) - (b.deadline?.getTime() || 0));
    return expired.slice(0, limit);
  }

  async saveEvent(event: AttemptEvent): Promise<AttemptEvent> {
    const list = this.eventsMap.get(event.attemptId) || [];
    list.push(event);
    this.eventsMap.set(event.attemptId, list);
    return event;
  }

  async listEventsByAttemptId(attemptId: string): Promise<AttemptEvent[]> {
    return this.eventsMap.get(attemptId) || [];
  }

  private lockQueues = new Map<string, Promise<void>>();

  async withAttemptLock<T>(
    attemptId: string,
    operation: (attempt: Attempt, saveLocked: (updated: Attempt) => Promise<void>) => Promise<T>
  ): Promise<T> {
    while (this.lockQueues.has(attemptId)) {
      await this.lockQueues.get(attemptId);
    }

    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.lockQueues.set(attemptId, lockPromise);

    try {
      const attempt = this.attemptsMap.get(attemptId);
      if (!attempt) {
        throw new AttemptNotFoundError(attemptId);
      }

      const saveLocked = async (updated: Attempt): Promise<void> => {
        this.attemptsMap.set(updated.id, updated);
      };

      return await operation(attempt, saveLocked);
    } finally {
      this.lockQueues.delete(attemptId);
      releaseLock();
    }
  }

  private activeAdvisoryLocks = new Set<number>();

  async withAdvisoryLock<T>(
    lockKey: number,
    operation: () => Promise<T>
  ): Promise<{ acquired: boolean; result?: T }> {
    if (this.activeAdvisoryLocks.has(lockKey)) {
      return { acquired: false };
    }

    this.activeAdvisoryLocks.add(lockKey);
    try {
      const result = await operation();
      return { acquired: true, result };
    } finally {
      this.activeAdvisoryLocks.delete(lockKey);
    }
  }
}

describe('Attempt Service & Single-Submission Workflow Tests', () => {
  let attemptRepo: InMemoryAttemptRepository;
  let mockExamClient: ExamClientPort;
  let sweeper: AttemptExpirySweeperService;
  let app: express.Express;

  const mockManifest: SanitizedExamManifest = {
    title: 'Kỳ thi thử Toán',
    code: 'EXM_TOAN_01',
    durationMinutes: 45,
    navigationMode: 'FREE',
    questionCount: 2,
    sections: [
      {
        id: 'sec_01',
        title: 'Phần 1: Đại số',
        questions: [
          {
            id: 'q_01',
            title: 'Phương trình bậc 2',
            type: 'SINGLE',
            options: [
              { id: 'opt_1', content: 'x = 1 hoặc x = 2' },
              { id: 'opt_2', content: 'x = 0' },
            ],
            points: 2,
          },
          {
            id: 'q_02',
            title: 'Bất đẳng thức',
            type: 'SINGLE',
            options: [
              { id: 'opt_a', content: 'Đúng' },
              { id: 'opt_b', content: 'Sai' },
            ],
            points: 3,
          },
        ],
      },
    ],
  };

  const mockSnapshot: ExamSnapshotDTO = {
    id: 'snp_mock_01',
    examId: 'exm_mock_01',
    version: 1,
    snapshotHash: 'hash_mock_01',
    frozenPayload: {
      questions: [
        {
          id: 'q_01',
          revisionId: 'rev_01',
          type: 'SINGLE',
          prompt: 'Giải phương trình $$x^2 - 3x + 2 = 0$$',
          title: 'Phương trình bậc 2',
          options: [
            { id: 'opt_1', content: 'x = 1 hoặc x = 2', isCorrect: true },
            { id: 'opt_2', content: 'x = 0', isCorrect: false },
          ],
          points: 2,
        },
        {
          id: 'q_02',
          revisionId: 'rev_02',
          type: 'SINGLE',
          prompt: 'Bất đẳng thức Cauchy-Schwarz luôn đúng trên R?',
          title: 'Bất đẳng thức',
          options: [
            { id: 'opt_a', content: 'Đúng', isCorrect: false },
            { id: 'opt_b', content: 'Sai', isCorrect: true },
          ],
          points: 3,
        },
      ],
      scoringPolicy: { strategyType: 'standard' },
    },
    sanitizedManifest: mockManifest,
    createdAt: new Date().toISOString(),
  };

  const mockExam: ExamDTO = {
    id: 'exm_mock_01',
    assessmentId: 'asm_01',
    code: 'EXM_TOAN_01',
    title: 'Kỳ thi thử Toán',
    durationMinutes: 45,
    isPublished: true,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    attemptRepo = new InMemoryAttemptRepository();
    mockExamClient = {
      getExam: async (idOrCode) => {
        if (idOrCode === 'exm_mock_01' || idOrCode === 'EXM_TOAN_01') return mockExam;
        return null;
      },
      getExamSnapshot: async () => mockSnapshot,
      getSanitizedManifest: async () => mockManifest,
    };

    sweeper = new AttemptExpirySweeperService(attemptRepo, mockExamClient);

    app = express();
    app.use(express.json());
    app.use('/v1/attempts', createV1AttemptsRouter({ attemptRepo, examClient: mockExamClient }));
    app.use('/v1/internal', createV1InternalRouter(sweeper));
  });

  it('POST /v1/attempts - starts new attempt or recovers active session', async () => {
    const res = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_candidate_01')
      .send({ examId: 'exm_mock_01' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toMatch(/^att_/);
    expect(res.body.manifest).toBeDefined();

    const attemptId = res.body.data.id;

    // Idempotent recovery when opening another tab
    const recoverRes = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_candidate_01')
      .send({ examId: 'exm_mock_01' });

    expect(recoverRes.status).toBe(200);
    expect(recoverRes.body.isRecovered).toBe(true);
    expect(recoverRes.body.data.id).toBe(attemptId);
  });

  it('POST /v1/attempts/:id/submit - receives answers directly, evaluates score and grades attempt', async () => {
    const init = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_candidate_01')
      .send({ examId: 'exm_mock_01' });

    const attemptId = init.body.data.id;

    // Submit with all answers attached in a single payload
    const submitRes = await request(app)
      .post(`/v1/attempts/${attemptId}/submit`)
      .set('x-user-id', 'usr_candidate_01')
      .send({
        answers: {
          q_01: 'opt_1',
          q_02: 'opt_b',
        },
      });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('GRADED');
    expect(submitRes.body.scoreResult.score).toBe(5);
    expect(submitRes.body.scoreResult.percentage).toBe(100);
  });

  it('POST /v1/internal/attempts/sweep - sweeps and grades expired attempts', async () => {
    const expiredAttempt = new Attempt({
      id: 'att_expired_01',
      userId: 'usr_candidate_99',
      examId: 'exm_mock_01',
      snapshotId: 'snp_mock_01',
      durationMinutes: 30,
      answers: {
        q_01: {
          answer: 'opt_1',
          answeredAt: new Date(Date.now() - 30000).toISOString(),
          sequenceNumber: 1,
        },
      },
    });
    expiredAttempt.start(new Date(Date.now() - 50 * 60 * 1000), new Date(Date.now() - 20000));
    await attemptRepo.saveAttempt(expiredAttempt);

    const sweepRes = await request(app)
      .post('/v1/internal/attempts/sweep')
      .set('x-internal-secret', 'internal-quiz-sweeper-secret')
      .send({ gracePeriodMs: 5000 });

    expect(sweepRes.status).toBe(200);
    expect(sweepRes.body.data.sweptCount).toBe(1);
    expect(sweepRes.body.data.sweptAttemptIds).toContain('att_expired_01');

    const updated = await attemptRepo.findAttemptById('att_expired_01');
    expect(updated?.status).toBe('TIMED_OUT_GRADED');
    expect(updated?.scoreResult?.score).toBe(2);
  });

  it('GET /v1/attempts/time - provides server-authoritative timestamp', async () => {
    const res = await request(app).get('/v1/attempts/time');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.serverTime).toBeDefined();
    expect(res.body.timestampMs).toBeGreaterThan(0);
  });

  describe('Single-Submission & Concurrency Defense', () => {
    it('should handle 10 concurrent submissions idempotently without double-grading', async () => {
      const createRes = await request(app)
        .post('/v1/attempts')
        .set('x-user-id', 'usr_concurrent_submit_01')
        .send({ examId: 'exm_mock_01', autoStart: true });

      const attemptId = createRes.body.data.id;

      // Gửi đồng thời 10 request submit với cùng bảng answers
      const submitPromises = Array.from({ length: 10 }).map(() =>
        request(app)
          .post(`/v1/attempts/${attemptId}/submit`)
          .set('x-user-id', 'usr_concurrent_submit_01')
          .send({
            answers: {
              q_01: 'opt_1',
            },
          })
      );

      const responses = await Promise.all(submitPromises);

      // Tất cả 10 request đều phải thành công (HTTP 200)
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('GRADED');
        expect(res.body.scoreResult.score).toBe(2);
      }

      // Đúng 1 request là fresh submission (isDuplicateSubmission === false), 9 request còn lại là duplicate
      const freshSubmissions = responses.filter((r) => r.body.isDuplicateSubmission === false);
      const duplicateSubmissions = responses.filter((r) => r.body.isDuplicateSubmission === true);

      expect(freshSubmissions.length).toBe(1);
      expect(duplicateSubmissions.length).toBe(9);
    });

    it('should strictly prevent State Regression from GRADED back to IN_PROGRESS', async () => {
      const createRes = await request(app)
        .post('/v1/attempts')
        .set('x-user-id', 'usr_regression_01')
        .send({ examId: 'exm_mock_01', autoStart: true });

      const attemptId = createRes.body.data.id;

      // Submit attempt -> becomes GRADED
      const submitRes = await request(app)
        .post(`/v1/attempts/${attemptId}/submit`)
        .set('x-user-id', 'usr_regression_01')
        .send({ answers: { q_01: 'opt_1' } });
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.status).toBe('GRADED');

      // Calling saveAttempt with an IN_PROGRESS entity does not regress the stored state
      const staleEntity = new Attempt({
        id: attemptId,
        userId: 'usr_regression_01',
        examId: 'exm_mock_01',
        snapshotId: 'snp_mock_01',
        durationMinutes: 30,
        status: 'IN_PROGRESS',
      });
      await attemptRepo.saveAttempt(staleEntity);

      const afterSave = await attemptRepo.findAttemptById(attemptId);
      expect(afterSave?.status).toBe('GRADED');
    });

    it('should correctly handle Deadline vs Grace Period Guard', async () => {
      // Case 1: Within official deadline -> GRADED
      const attempt1 = new Attempt({
        id: 'att_deadline_normal',
        userId: 'usr_student_dl_01',
        examId: 'exm_mock_01',
        snapshotId: 'snp_mock_01',
        durationMinutes: 30,
      });
      attempt1.start(new Date(Date.now() - 5000), new Date(Date.now() + 60000));
      await attemptRepo.saveAttempt(attempt1);

      const res1 = await request(app)
        .post('/v1/attempts/att_deadline_normal/submit')
        .set('x-user-id', 'usr_student_dl_01')
        .send({ answers: { q_01: 'opt_1' } });
      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('GRADED');

      // Case 2: Past deadline by 5 seconds, but within 15 seconds grace period -> GRADED
      const attempt2 = new Attempt({
        id: 'att_deadline_grace',
        userId: 'usr_student_dl_02',
        examId: 'exm_mock_01',
        snapshotId: 'snp_mock_01',
        durationMinutes: 30,
      });
      attempt2.start(new Date(Date.now() - 30 * 60 * 1000), new Date(Date.now() - 5000));
      await attemptRepo.saveAttempt(attempt2);

      const res2 = await request(app)
        .post('/v1/attempts/att_deadline_grace/submit')
        .set('x-user-id', 'usr_student_dl_02')
        .send({ answers: { q_01: 'opt_1' } });
      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('GRADED');

      // Case 3: Past deadline by 25 seconds, exceeding 15 seconds grace period -> TIMED_OUT_GRADED
      const attempt3 = new Attempt({
        id: 'att_deadline_exceeded',
        userId: 'usr_student_dl_03',
        examId: 'exm_mock_01',
        snapshotId: 'snp_mock_01',
        durationMinutes: 30,
      });
      attempt3.start(new Date(Date.now() - 30 * 60 * 1000), new Date(Date.now() - 25000));
      await attemptRepo.saveAttempt(attempt3);

      const res3 = await request(app)
        .post('/v1/attempts/att_deadline_exceeded/submit')
        .set('x-user-id', 'usr_student_dl_03')
        .send({ answers: { q_01: 'opt_1' } });
      expect(res3.status).toBe(200);
      expect(res3.body.status).toBe('TIMED_OUT_GRADED');
    });
  });
});
