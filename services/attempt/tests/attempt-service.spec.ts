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
  OutdatedAnswerSequenceError,
  AttemptConcurrencyConflictError,
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
  PatchAnswerAtomicResult,
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
        // Mô phỏng FOR UPDATE SKIP LOCKED: bỏ qua nếu attemptId đang bị lock bởi withAttemptLock
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

  async patchAnswerAtomic(
    attemptId: string,
    questionId: string,
    answerRecord: CandidateAnswerRecord,
    expectedVersion?: number,
    userId?: string,
    userRole?: string
  ): Promise<PatchAnswerAtomicResult> {
    const attempt = this.attemptsMap.get(attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }
    if (userId && attempt.userId !== userId && userRole !== 'ADMIN') {
      throw new UnauthorizedAttemptAccessError('You can only record answers for your own attempt');
    }
    if (attempt.status !== 'IN_PROGRESS') {
      throw new AttemptAlreadyFinalizedError(attemptId, attempt.status);
    }
    if (expectedVersion !== undefined && attempt.version !== expectedVersion) {
      throw new AttemptConcurrencyConflictError(attemptId, attempt.version, expectedVersion);
    }
    const now = new Date();
    if (attempt.isAnswerTimeExpired(now)) {
      throw new AttemptTimeExpiredError(attemptId);
    }

    attempt.recordAnswer(
      questionId,
      answerRecord.answer,
      answerRecord.sequenceNumber,
      answerRecord.clientTimestamp,
      now,
      15000
    );
    attempt.incrementVersion();

    return {
      success: true,
      newVersion: attempt.version,
      remainingTimeMs: attempt.remainingTimeMs(now),
      status: attempt.status,
    };
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

describe('Attempt Service: Domain Aggregate & Concurrency Defense', () => {
  it('should maintain FSM state transitions from CREATED -> IN_PROGRESS -> SUBMITTED -> GRADED', () => {
    const attempt = new Attempt({
      id: 'att_test_01',
      userId: 'usr_student_01',
      examId: 'exm_01',
      snapshotId: 'snp_01',
      durationMinutes: 45,
    });

    expect(attempt.status).toBe('CREATED');
    expect(attempt.startedAt).toBeNull();

    const startTime = new Date();
    attempt.start(startTime);

    expect(attempt.status).toBe('IN_PROGRESS');
    expect(attempt.startedAt).toEqual(startTime);
    expect(attempt.deadline).toBeDefined();

    // Record answer
    attempt.recordAnswer('q_01', 'opt_a', 1);
    expect(attempt.answers['q_01'].answer).toBe('opt_a');
    expect(attempt.answers['q_01'].sequenceNumber).toBe(1);

    // Submit
    attempt.submit();
    expect(attempt.status).toBe('SUBMITTED');
    expect(attempt.submittedAt).toBeDefined();

    // Grade
    attempt.grade({
      score: 10,
      maxScore: 10,
      percentage: 100,
      passed: true,
      evaluatedAt: new Date().toISOString(),
      breakdown: {},
    });

    expect(attempt.status).toBe('GRADED');
    expect(attempt.scoreResult?.score).toBe(10);
  });

  it('should strictly reject out-of-order answers using logical sequence numbers', () => {
    const attempt = new Attempt({
      id: 'att_test_seq',
      userId: 'usr_student_01',
      examId: 'exm_01',
      snapshotId: 'snp_01',
      durationMinutes: 30,
    });
    attempt.start();

    // Save seq 1 -> success
    attempt.recordAnswer('q_01', 'opt_b', 1);
    expect(attempt.answers['q_01'].answer).toBe('opt_b');

    // Save seq 5 -> success
    attempt.recordAnswer('q_01', 'opt_c', 5);
    expect(attempt.answers['q_01'].answer).toBe('opt_c');

    // Save seq 3 (older than 5) -> throws OutdatedAnswerSequenceError
    expect(() => {
      attempt.recordAnswer('q_01', 'opt_a', 3);
    }).toThrow(OutdatedAnswerSequenceError);

    // Current answer remains opt_c
    expect(attempt.answers['q_01'].answer).toBe('opt_c');
  });

  it('should reject recording answers after official deadline (Zero-Tolerance Tier 1)', () => {
    const startTime = new Date(Date.now() - 60 * 60 * 1000); // 60 mins ago
    const customDeadline = new Date(Date.now() - 10 * 60 * 1000); // 10 mins ago

    const attempt = new Attempt({
      id: 'att_test_expired',
      userId: 'usr_student_01',
      examId: 'exm_01',
      snapshotId: 'snp_01',
      durationMinutes: 30,
    });
    attempt.start(startTime, customDeadline);

    expect(() => {
      attempt.recordAnswer('q_01', 'opt_a', 1, undefined, new Date());
    }).toThrow(AttemptTimeExpiredError);
  });

  it('should transition to TIMED_OUT_GRADED if submitted past grace period (Tier 2)', () => {
    const now = new Date();
    const deadline = new Date(now.getTime() - 20000); // Expired 20s ago

    const attempt = new Attempt({
      id: 'att_test_grace',
      userId: 'usr_student_01',
      examId: 'exm_01',
      snapshotId: 'snp_01',
      durationMinutes: 30,
    });
    attempt.start(new Date(now.getTime() - 40 * 60 * 1000), deadline);

    attempt.submit(now, 15000); // Grace period 15s, expired 20s -> TIMED_OUT_GRADED
    expect(attempt.status).toBe('TIMED_OUT_GRADED');
  });

  it('Giai đoạn 1: should support OCC versioning on Attempt aggregate', () => {
    const attempt = new Attempt({
      id: 'att_occ_01',
      userId: 'usr_student_01',
      examId: 'exm_01',
      snapshotId: 'snp_01',
      durationMinutes: 60,
    });

    // Default version should be 1
    expect(attempt.version).toBe(1);

    // incrementVersion should increase version monotonically
    attempt.incrementVersion();
    expect(attempt.version).toBe(2);

    attempt.incrementVersion();
    expect(attempt.version).toBe(3);

    // toDTO should include version
    const dto = attempt.toDTO();
    expect(dto.version).toBe(3);

    // toPrimitives and fromPrimitives round-trip
    const primitives = attempt.toPrimitives();
    expect(primitives.version).toBe(3);

    const reconstructed = Attempt.fromPrimitives(primitives);
    expect(reconstructed.id).toBe(attempt.id);
    expect(reconstructed.version).toBe(3);
    expect(reconstructed.status).toBe(attempt.status);
  });

  it('Giai đoạn 1: should define and map concurrency conflict and finalized errors with HTTP 409', () => {
    const conflictErr = new AttemptConcurrencyConflictError('att_occ_01', 2, 1);
    expect(conflictErr.statusCode).toBe(409);
    expect(conflictErr.errorCode).toBe('ATTEMPT_CONCURRENCY_CONFLICT');
    expect(conflictErr.message).toContain('expected version 1, but found version 2');

    const finalizedErr = new AttemptAlreadyFinalizedError('att_occ_01', 'GRADED');
    expect(finalizedErr.statusCode).toBe(409);
    expect(finalizedErr.errorCode).toBe('ATTEMPT_ALREADY_FINALIZED');
    expect(finalizedErr.message).toContain('already finalized with status "GRADED"');
  });
});

describe('Attempt Scoring Engine: Multi-Format Evaluation', () => {
  const sampleQuestions: FrozenQuestionItem[] = [
    {
      id: 'q_single',
      revisionId: 'rev_1',
      type: 'SINGLE',
      prompt: 'What is 2 + 2?',
      points: 2,
      options: [
        { id: 'opt_1', content: '3', isCorrect: false },
        { id: 'opt_2', content: '4', isCorrect: true },
      ],
    },
    {
      id: 'q_multiple',
      revisionId: 'rev_2',
      type: 'MULTIPLE',
      prompt: 'Select prime numbers',
      points: 3,
      options: [
        { id: 'opt_a', content: '2', isCorrect: true },
        { id: 'opt_b', content: '3', isCorrect: true },
        { id: 'opt_c', content: '4', isCorrect: false },
      ],
    },
    {
      id: 'q_fill',
      revisionId: 'rev_3',
      type: 'FILL_IN',
      prompt: 'Capital of France?',
      points: 2,
      options: [{ id: 'opt_f', content: 'Paris', isCorrect: true }],
    },
  ];

  it('should evaluate full score when all answers are correct', () => {
    const result = AttemptScoringEngine.evaluate({
      questions: sampleQuestions,
      answers: {
        q_single: { answer: 'opt_2', answeredAt: new Date().toISOString(), sequenceNumber: 1 },
        q_multiple: { answer: ['opt_a', 'opt_b'], answeredAt: new Date().toISOString(), sequenceNumber: 1 },
        q_fill: { answer: 'Paris', answeredAt: new Date().toISOString(), sequenceNumber: 1 },
      },
      passingScore: 5,
    });

    expect(result.score).toBe(7);
    expect(result.maxScore).toBe(7);
    expect(result.percentage).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.breakdown['q_single'].isCorrect).toBe(true);
    expect(result.breakdown['q_multiple'].isCorrect).toBe(true);
    expect(result.breakdown['q_fill'].isCorrect).toBe(true);
  });

  it('should handle partial credit and unanswered questions correctly', () => {
    const result = AttemptScoringEngine.evaluate({
      questions: sampleQuestions,
      answers: {
        q_single: { answer: 'opt_1', answeredAt: new Date().toISOString(), sequenceNumber: 1 }, // Incorrect
        q_multiple: { answer: ['opt_a'], answeredAt: new Date().toISOString(), sequenceNumber: 1 }, // Partial
      },
      scoringPolicy: { strategyType: 'partial' },
      passingScore: 4,
    });

    expect(result.breakdown['q_single'].isCorrect).toBe(false);
    expect(result.breakdown['q_single'].scoreAwarded).toBe(0);
    expect(result.breakdown['q_multiple'].scoreAwarded).toBe(1.5); // 1 out of 2 correct
    expect(result.breakdown['q_fill'].feedback).toBe('Chưa trả lời');
    expect(result.passed).toBe(false);
  });
});

describe('Attempt Service API & Sweeper Integration', () => {
  let attemptRepo: InMemoryAttemptRepository;
  let mockExamClient: ExamClientPort;
  let sweeper: AttemptExpirySweeperService;
  let app: express.Express;

  const mockManifest: SanitizedExamManifest = {
    examId: 'exm_mock_01',
    variantCode: 'DEFAULT',
    title: 'Kỳ thi thử Toán',
    durationMinutes: 45,
    totalQuestions: 2,
    totalPoints: 5,
    questions: [
      {
        id: 'q_01',
        type: 'SINGLE',
        prompt: '1 + 1 = ?',
        options: [
          { id: 'opt_1', content: '2' },
          { id: 'opt_2', content: '3' },
        ],
        points: 2,
      },
      {
        id: 'q_02',
        type: 'SINGLE',
        prompt: '5 * 5 = ?',
        options: [
          { id: 'opt_a', content: '20' },
          { id: 'opt_b', content: '25' },
        ],
        points: 3,
      },
    ],
    serverTimestamp: Date.now(),
  };

  const mockSnapshot: ExamSnapshotDTO = {
    id: 'snp_mock_01',
    examId: 'exm_mock_01',
    variantCode: 'DEFAULT',
    contentHash: 'hash123',
    frozenPayload: {
      questions: [
        {
          id: 'q_01',
          revisionId: 'rev_1',
          type: 'SINGLE',
          prompt: '1 + 1 = ?',
          points: 2,
          options: [
            { id: 'opt_1', content: '2', isCorrect: true },
            { id: 'opt_2', content: '3', isCorrect: false },
          ],
        },
        {
          id: 'q_02',
          revisionId: 'rev_2',
          type: 'SINGLE',
          prompt: '5 * 5 = ?',
          points: 3,
          options: [
            { id: 'opt_a', content: '20', isCorrect: false },
            { id: 'opt_b', content: '25', isCorrect: true },
          ],
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

  it('POST /v1/attempts/:id/answers - autosaves answer with sequence checking', async () => {
    const init = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_candidate_01')
      .send({ examId: 'exm_mock_01' });

    const attemptId = init.body.data.id;

    const saveRes = await request(app)
      .post(`/v1/attempts/${attemptId}/answers`)
      .set('x-user-id', 'usr_candidate_01')
      .send({
        questionId: 'q_01',
        answer: 'opt_1',
        sequenceNumber: 1,
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);
    expect(saveRes.body.data.sequenceNumber).toBe(1);

    // Save out of sequence
    const badSeqRes = await request(app)
      .post(`/v1/attempts/${attemptId}/answers`)
      .set('x-user-id', 'usr_candidate_01')
      .send({
        questionId: 'q_01',
        answer: 'opt_2',
        sequenceNumber: 1, // Same or lower sequence
      });

    expect(badSeqRes.status).toBe(409);
    expect(badSeqRes.body.errorCode).toBe('OUTDATED_ANSWER_SEQUENCE');
  });

  it('POST /v1/attempts/:id/events - logs anti-cheat telemetry', async () => {
    const init = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_candidate_01')
      .send({ examId: 'exm_mock_01' });

    const attemptId = init.body.data.id;

    const eventRes = await request(app)
      .post(`/v1/attempts/${attemptId}/events`)
      .set('x-user-id', 'usr_candidate_01')
      .send({
        eventType: 'TAB_SWITCH',
        metadata: { blurDurationMs: 3200 },
      });

    expect(eventRes.status).toBe(201);
    expect(eventRes.body.data.id).toMatch(/^evt_/);
    expect(eventRes.body.data.eventType).toBe('TAB_SWITCH');

    // List events
    const listEventsRes = await request(app)
      .get(`/v1/attempts/${attemptId}/events`)
      .set('x-user-id', 'usr_candidate_01');

    expect(listEventsRes.status).toBe(200);
    expect(listEventsRes.body.data.length).toBe(1);
  });

  it('POST /v1/attempts/:id/submit - evaluates score and grades attempt', async () => {
    const init = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_candidate_01')
      .send({ examId: 'exm_mock_01' });

    const attemptId = init.body.data.id;

    // Answer both correctly
    await request(app)
      .post(`/v1/attempts/${attemptId}/answers`)
      .set('x-user-id', 'usr_candidate_01')
      .send({ questionId: 'q_01', answer: 'opt_1', sequenceNumber: 1 });

    await request(app)
      .post(`/v1/attempts/${attemptId}/answers`)
      .set('x-user-id', 'usr_candidate_01')
      .send({ questionId: 'q_02', answer: 'opt_b', sequenceNumber: 1 });

    // Submit
    const submitRes = await request(app)
      .post(`/v1/attempts/${attemptId}/submit`)
      .set('x-user-id', 'usr_candidate_01');

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('GRADED');
    expect(submitRes.body.scoreResult.score).toBe(5);
    expect(submitRes.body.scoreResult.percentage).toBe(100);
  });

  it('POST /v1/internal/attempts/sweep - sweeps and grades expired attempts', async () => {
    // Setup an expired attempt in repository with existing answers
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

  describe('Giai đoạn 2: Atomic JSONB Patching & Autosave Concurrency Defense', () => {
    it('should atomically patch individual questions and increment version without losing updates', async () => {
      // 1. Create and start attempt
      const createRes = await request(app)
        .post('/v1/attempts')
        .set('x-user-id', 'usr_concurrent_01')
        .send({ examId: 'exm_mock_01', autoStart: true });

      const attemptId = createRes.body.data.id;
      const initialVersion = createRes.body.data.version;
      expect(initialVersion).toBe(1);

      // 2. Patch question q_01
      const patch1 = await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_01`)
        .set('x-user-id', 'usr_concurrent_01')
        .send({ answer: 'opt_1', sequenceNumber: 1 });

      expect(patch1.status).toBe(200);
      expect(patch1.body.success).toBe(true);
      expect(patch1.body.data.version).toBe(2);
      expect(patch1.body.data.remainingTimeMs).toBeGreaterThan(0);

      // 3. Patch question q_02 with sequence 1
      const patch2 = await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_02`)
        .set('x-user-id', 'usr_concurrent_01')
        .send({ answer: 'opt_b', sequenceNumber: 1 });

      expect(patch2.status).toBe(200);
      expect(patch2.body.data.version).toBe(3);

      // 4. Update question q_01 with higher sequence number
      const patch3 = await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_01`)
        .set('x-user-id', 'usr_concurrent_01')
        .send({ answer: 'opt_2', sequenceNumber: 2 });

      expect(patch3.status).toBe(200);
      expect(patch3.body.data.version).toBe(4);

      // 5. Verify both questions exist and retain their latest values
      const getRes = await request(app)
        .get(`/v1/attempts/${attemptId}`)
        .set('x-user-id', 'usr_concurrent_01');

      expect(getRes.body.data.answers.q_01.answer).toBe('opt_2');
      expect(getRes.body.data.answers.q_01.sequenceNumber).toBe(2);
      expect(getRes.body.data.answers.q_02.answer).toBe('opt_b');
      expect(getRes.body.data.answers.q_02.sequenceNumber).toBe(1);
      expect(getRes.body.data.version).toBe(4);
    });

    it('should reject outdated sequence numbers with HTTP 409 OUTDATED_ANSWER_SEQUENCE', async () => {
      const createRes = await request(app)
        .post('/v1/attempts')
        .set('x-user-id', 'usr_seq_01')
        .send({ examId: 'exm_mock_01', autoStart: true });

      const attemptId = createRes.body.data.id;

      // Save seq #5
      await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_01`)
        .set('x-user-id', 'usr_seq_01')
        .send({ answer: 'opt_latest', sequenceNumber: 5 });

      // Stale request with seq #3 should be rejected
      const staleRes = await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_01`)
        .set('x-user-id', 'usr_seq_01')
        .send({ answer: 'opt_stale', sequenceNumber: 3 });

      expect(staleRes.status).toBe(409);
      expect(staleRes.body.errorCode).toBe('OUTDATED_ANSWER_SEQUENCE');
    });

    it('should reject answer updates once attempt is finalized (SUBMITTED/GRADED) with HTTP 409', async () => {
      const createRes = await request(app)
        .post('/v1/attempts')
        .set('x-user-id', 'usr_finalized_01')
        .send({ examId: 'exm_mock_01', autoStart: true });

      const attemptId = createRes.body.data.id;

      // Submit attempt
      const submitRes = await request(app)
        .post(`/v1/attempts/${attemptId}/submit`)
        .set('x-user-id', 'usr_finalized_01');
      expect(submitRes.status).toBe(200);

      // Attempt to autosave after submission
      const patchRes = await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_01`)
        .set('x-user-id', 'usr_finalized_01')
        .send({ answer: 'new_answer', sequenceNumber: 1 });

      expect(patchRes.status).toBe(409);
      expect(patchRes.body.errorCode).toBe('ATTEMPT_ALREADY_FINALIZED');
    });

    it('should enforce OCC version conflict check when expectedVersion is provided', async () => {
      const createRes = await request(app)
        .post('/v1/attempts')
        .set('x-user-id', 'usr_occ_01')
        .send({ examId: 'exm_mock_01', autoStart: true });

      const attemptId = createRes.body.data.id;

      // First patch succeeds with version 1 -> increments to 2
      const patch1 = await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_01`)
        .set('x-user-id', 'usr_occ_01')
        .send({ answer: 'opt_1', sequenceNumber: 1, expectedVersion: 1 });
      expect(patch1.status).toBe(200);
      expect(patch1.body.data.version).toBe(2);

      // Stale client passing expectedVersion 1 should receive 409 CONCURRENCY_CONFLICT
      const staleConflict = await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_02`)
        .set('x-user-id', 'usr_occ_01')
        .send({ answer: 'opt_b', sequenceNumber: 1, expectedVersion: 1 });

      expect(staleConflict.status).toBe(409);
      expect(staleConflict.body.errorCode).toBe('ATTEMPT_CONCURRENCY_CONFLICT');
    });
  });

  describe('Giai đoạn 3: Row-Level Lock, Idempotent Submission & State Regression Defense', () => {
    it('Task CONC-3.1 & CONC-3.2: should handle 10 concurrent submissions idempotently without double-grading', async () => {
      // Create and start attempt
      const createRes = await request(app)
        .post('/v1/attempts')
        .set('x-user-id', 'usr_concurrent_submit_01')
        .send({ examId: 'exm_mock_01', autoStart: true });

      const attemptId = createRes.body.data.id;

      // Autosave an answer
      await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_01`)
        .set('x-user-id', 'usr_concurrent_submit_01')
        .send({ answer: 'opt_1', sequenceNumber: 1 });

      // Gửi đồng thời 10 request submit
      const submitPromises = Array.from({ length: 10 }).map(() =>
        request(app)
          .post(`/v1/attempts/${attemptId}/submit`)
          .set('x-user-id', 'usr_concurrent_submit_01')
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

    it('Task CONC-3.3: should strictly prevent State Regression from GRADED back to IN_PROGRESS', async () => {
      const createRes = await request(app)
        .post('/v1/attempts')
        .set('x-user-id', 'usr_regression_01')
        .send({ examId: 'exm_mock_01', autoStart: true });

      const attemptId = createRes.body.data.id;

      // Submit attempt -> becomes GRADED
      const submitRes = await request(app)
        .post(`/v1/attempts/${attemptId}/submit`)
        .set('x-user-id', 'usr_regression_01');
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.status).toBe('GRADED');

      // Delayed autosave arrives late -> rejected with HTTP 409 ATTEMPT_ALREADY_FINALIZED
      const lateAutosave = await request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_01`)
        .set('x-user-id', 'usr_regression_01')
        .send({ answer: 'opt_late', sequenceNumber: 10 });
      expect(lateAutosave.status).toBe(409);
      expect(lateAutosave.body.errorCode).toBe('ATTEMPT_ALREADY_FINALIZED');

      // Ensure attempt is still GRADED in database
      const fetchAttempt = await attemptRepo.findAttemptById(attemptId);
      expect(fetchAttempt?.status).toBe('GRADED');

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

    it('Task CONC-3.4: should correctly handle Deadline vs Grace Period Guard', async () => {
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
        .set('x-user-id', 'usr_student_dl_01');
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
      // Deadline was 5 seconds ago
      attempt2.start(new Date(Date.now() - 30 * 60 * 1000), new Date(Date.now() - 5000));
      await attemptRepo.saveAttempt(attempt2);

      const res2 = await request(app)
        .post('/v1/attempts/att_deadline_grace/submit')
        .set('x-user-id', 'usr_student_dl_02');
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
      // Deadline was 25 seconds ago
      attempt3.start(new Date(Date.now() - 30 * 60 * 1000), new Date(Date.now() - 25000));
      await attemptRepo.saveAttempt(attempt3);

      const res3 = await request(app)
        .post('/v1/attempts/att_deadline_exceeded/submit')
        .set('x-user-id', 'usr_student_dl_03');
      expect(res3.status).toBe(200);
      expect(res3.body.status).toBe('TIMED_OUT_GRADED');
    });
  });
});
