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
} from '@platform/contracts';

class InMemoryAttemptRepository implements AttemptRepositoryPort {
  private attemptsMap = new Map<string, Attempt>();
  private eventsMap = new Map<string, AttemptEvent[]>();

  async saveAttempt(attempt: Attempt): Promise<Attempt> {
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

  async findExpiredInProgressAttempts(now: Date, gracePeriodMs: number): Promise<Attempt[]> {
    const expired: Attempt[] = [];
    const threshold = new Date(now.getTime() - gracePeriodMs);
    for (const a of this.attemptsMap.values()) {
      if (a.status === 'IN_PROGRESS' && a.deadline && a.deadline.getTime() <= threshold.getTime()) {
        expired.push(a);
      }
    }
    return expired;
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
});
