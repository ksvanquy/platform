import { describe, it, expect, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { Attempt } from '../src/domain/entities/attempt.entity.js';
import { AttemptEvent } from '../src/domain/entities/attempt-event.entity.js';
import type {
  AttemptRepositoryPort,
  ExamClientPort,
  AttemptFilterQuery,
} from '../src/domain/ports/attempt.repository.port.js';
import type {
  ExamDTO,
  ExamSnapshotDTO,
  SanitizedExamManifest,
} from '@platform/contracts';
import {
  AttemptNotFoundError,
} from '../src/domain/errors/attempt-domain.errors.js';
import { createV1AttemptsRouter } from '../src/presentation/routes/v1-attempts.routes.js';
import { createV1InternalRouter } from '../src/presentation/routes/v1-internal.routes.js';
import { AttemptExpirySweeperService } from '../src/domain/services/attempt-expiry-sweeper.service.js';
import { AttemptMetrics } from '../src/infrastructure/metrics/attempt.metrics.js';

class MockConcurrencyAttemptRepository implements AttemptRepositoryPort {
  public attemptsMap = new Map<string, Attempt>();
  public eventsMap = new Map<string, AttemptEvent[]>();
  private lockQueues = new Map<string, Promise<void>>();
  private activeAdvisoryLocks = new Set<number>();

  async saveAttempt(attempt: Attempt): Promise<Attempt> {
    const existing = this.attemptsMap.get(attempt.id);
    if (existing && ['SUBMITTED', 'GRADED', 'TIMED_OUT_GRADED'].includes(existing.status)) {
      if (!['SUBMITTED', 'GRADED', 'TIMED_OUT_GRADED'].includes(attempt.status)) {
        return existing;
      }
    }
    this.attemptsMap.set(attempt.id, attempt);
    return attempt;
  }

  async findAttemptById(id: string): Promise<Attempt | null> {
    return this.attemptsMap.get(id) || null;
  }

  async findActiveAttempt(userId: string, examId: string): Promise<Attempt | null> {
    for (const a of this.attemptsMap.values()) {
      if (a.userId === userId && a.examId === examId && ['CREATED', 'IN_PROGRESS', 'PAUSED'].includes(a.status)) {
        return a;
      }
    }
    return null;
  }

  async listAttemptsByUser(userId: string, examId?: string): Promise<Attempt[]> {
    const list: Attempt[] = [];
    for (const a of this.attemptsMap.values()) {
      if (a.userId === userId && (!examId || a.examId === examId)) {
        list.push(a);
      }
    }
    return list;
  }

  async listAttempts(_filter?: AttemptFilterQuery): Promise<{ attempts: Attempt[]; total: number }> {
    const list = Array.from(this.attemptsMap.values());
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

describe('Attempt Concurrency & Single Submission Stress Tests', () => {
  let attemptRepo: MockConcurrencyAttemptRepository;
  let mockExamClient: ExamClientPort;
  let sweeper: AttemptExpirySweeperService;
  let app: Express;

  const mockQuestions = Array.from({ length: 50 }).map((_, i) => ({
    id: `q_${String(i + 1).padStart(2, '0')}`,
    revisionId: `rev_${i + 1}`,
    type: 'SINGLE' as any,
    prompt: `Câu hỏi số ${i + 1}`,
    title: `Câu hỏi số ${i + 1}`,
    options: [
      { id: 'opt_a', content: 'Lựa chọn A', isCorrect: true },
      { id: 'opt_b', content: 'Lựa chọn B', isCorrect: false },
    ],
    points: 1,
  }));

  const mockManifest: SanitizedExamManifest = {
    title: 'Đề thi trắc nghiệm 50 câu kiểm thử đồng thời',
    code: 'EXM_STRESS_50',
    durationMinutes: 60,
    navigationMode: 'FREE',
    questionCount: 50,
    sections: [
      {
        id: 'sec_01',
        title: 'Phần thi đồng thời',
        questions: mockQuestions.map((q) => ({
          id: q.id,
          title: q.title,
          type: q.type,
          options: q.options,
          points: q.points,
        })),
      },
    ],
  };

  const mockSnapshot: ExamSnapshotDTO = {
    id: 'snp_stress_01',
    examId: 'exm_stress_01',
    version: 1,
    snapshotHash: 'hash_stress_01',
    frozenPayload: {
      questions: mockQuestions,
      scoringPolicy: { strategyType: 'standard' },
    },
    sanitizedManifest: mockManifest,
    createdAt: new Date().toISOString(),
  };

  const mockExam: ExamDTO = {
    id: 'exm_stress_01',
    assessmentId: 'asm_stress_01',
    code: 'EXM_STRESS_50',
    title: 'Đề thi trắc nghiệm 50 câu',
    durationMinutes: 60,
    isPublished: true,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    AttemptMetrics.resetForTesting();
    attemptRepo = new MockConcurrencyAttemptRepository();
    mockExamClient = {
      getExam: async () => mockExam,
      getExamSnapshot: async () => mockSnapshot,
      getSanitizedManifest: async () => mockManifest,
    };

    sweeper = new AttemptExpirySweeperService(attemptRepo, mockExamClient);

    app = express();
    app.use(express.json());
    app.use('/v1/attempts', createV1AttemptsRouter({ attemptRepo, examClient: mockExamClient }));
    app.use('/v1/internal', createV1InternalRouter(sweeper));
  });

  it('Single Submission with 50 answers: should grade all 50 questions correctly in a single transaction', async () => {
    const createRes = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_stress_student_01')
      .send({ examId: 'exm_stress_01', autoStart: true });

    expect(createRes.status).toBe(201);
    const attemptId = createRes.body.data.id;

    // Chuẩn bị 50 answers
    const answersPayload: Record<string, unknown> = {};
    mockQuestions.forEach((q, index) => {
      answersPayload[q.id] = index % 2 === 0 ? 'opt_a' : 'opt_b';
    });

    const submitRes = await request(app)
      .post(`/v1/attempts/${attemptId}/submit`)
      .set('x-user-id', 'usr_stress_student_01')
      .send({ answers: answersPayload });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.status).toBe('GRADED');
    expect(submitRes.body.scoreResult.score).toBe(25); // 25 câu đúng opt_a

    const savedAttempt = await attemptRepo.findAttemptById(attemptId);
    expect(savedAttempt).toBeDefined();
    expect(Object.keys(savedAttempt!.answers).length).toBe(50);
  });

  it('Concurrent Submissions: should execute scoring exactly once and return idempotent result for concurrent submit requests', async () => {
    const createRes = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_double_submit_01')
      .send({ examId: 'exm_stress_01', autoStart: true });

    const attemptId = createRes.body.data.id;

    // Gửi đồng thời 5 request submit
    const submitPromises = Array.from({ length: 5 }).map(() =>
      request(app)
        .post(`/v1/attempts/${attemptId}/submit`)
        .set('x-user-id', 'usr_double_submit_01')
        .send({
          answers: {
            q_01: 'opt_a',
            q_02: 'opt_a',
          },
        })
    );

    const responses = await Promise.all(submitPromises);

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('GRADED');
      expect(res.body.scoreResult.score).toBe(2);
    }

    const fresh = responses.filter((r) => r.body.isDuplicateSubmission === false);
    const duplicates = responses.filter((r) => r.body.isDuplicateSubmission === true);

    expect(fresh.length).toBe(1);
    expect(duplicates.length).toBe(4);
  });

  it('Sweeper vs. Late Submit Race: should resolve race condition cleanly without deadlock', async () => {
    const attempt = new Attempt({
      id: 'att_expired_race_01',
      userId: 'usr_sweeper_race_01',
      examId: 'exm_stress_01',
      snapshotId: 'snp_stress_01',
      durationMinutes: 30,
      answers: {
        q_01: {
          answer: 'opt_a',
          answeredAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          sequenceNumber: 1,
        },
      },
    });
    const startTime = new Date(Date.now() - 31 * 60 * 1000);
    const deadlineTime = new Date(Date.now() - 30 * 1000);
    attempt.start(startTime, deadlineTime);
    await attemptRepo.saveAttempt(attempt);

    const [sweepResult, studentSubmitRes] = await Promise.all([
      sweeper.sweep(new Date(), 15000),
      request(app)
        .post('/v1/attempts/att_expired_race_01/submit')
        .set('x-user-id', 'usr_sweeper_race_01')
        .send({ answers: { q_01: 'opt_a' } }),
    ]);

    expect(studentSubmitRes.status).toBe(200);
    expect(['GRADED', 'TIMED_OUT_GRADED']).toContain(studentSubmitRes.body.status);

    const finalAttempt = await attemptRepo.findAttemptById('att_expired_race_01');
    expect(['GRADED', 'TIMED_OUT_GRADED']).toContain(finalAttempt?.status);
    expect(finalAttempt?.scoreResult).toBeDefined();
    expect(finalAttempt?.scoreResult?.score).toBe(1);
  });

  it('Distributed Advisory Lock: should ensure only 1 active replica executes sweep and the other skips gracefully', async () => {
    const replicaSweeper1 = new AttemptExpirySweeperService(attemptRepo, mockExamClient);
    const replicaSweeper2 = new AttemptExpirySweeperService(attemptRepo, mockExamClient);

    const expiredAttempt = new Attempt({
      id: 'att_replica_expired_01',
      userId: 'usr_replica_01',
      examId: 'exm_stress_01',
      snapshotId: 'snp_stress_01',
      durationMinutes: 10,
    });
    expiredAttempt.start(new Date(Date.now() - 20 * 60 * 1000), new Date(Date.now() - 60 * 1000));
    await attemptRepo.saveAttempt(expiredAttempt);

    const [result1, result2] = await Promise.all([
      replicaSweeper1.sweep(new Date(), 15000),
      replicaSweeper2.sweep(new Date(), 15000),
    ]);

    const oneAcquired = (result1.sweptCount > 0 && result2.skippedDueToLock) ||
                        (result2.sweptCount > 0 && result1.skippedDueToLock);

    expect(oneAcquired).toBe(true);

    const sweptTotal = result1.sweptCount + result2.sweptCount;
    expect(sweptTotal).toBe(1);

    const checkAttempt = await attemptRepo.findAttemptById('att_replica_expired_01');
    expect(checkAttempt?.status).toBe('TIMED_OUT_GRADED');
  });
});
