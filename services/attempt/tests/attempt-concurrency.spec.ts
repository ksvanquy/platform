import { describe, it, expect, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { Attempt } from '../src/domain/entities/attempt.entity.js';
import { AttemptEvent } from '../src/domain/entities/attempt-event.entity.js';
import type {
  AttemptRepositoryPort,
  ExamClientPort,
  PatchAnswerAtomicResult,
  AttemptFilterQuery,
} from '../src/domain/ports/attempt.repository.port.js';
import type {
  ExamDTO,
  ExamSnapshotDTO,
  SanitizedExamManifest,
  CandidateAnswerRecord,
} from '@platform/contracts';
import {
  AttemptNotFoundError,
  UnauthorizedAttemptAccessError,
  AttemptAlreadyFinalizedError,
  AttemptConcurrencyConflictError,
  AttemptTimeExpiredError,
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
        // Mô phỏng FOR UPDATE SKIP LOCKED
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

describe('Giai đoạn 4: E2E Concurrency Stress Tests & Distributed Advisory Lock', () => {
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

  // =========================================================================
  // Kịch bản 1: Concurrent Autosave - 50 requests lưu nháp đồng thời
  // =========================================================================
  it('Kịch bản 1 (Concurrent Autosave): should handle 50 simultaneous autosave requests with Zero Lost Updates', async () => {
    // 1. Khởi tạo ca thi
    const createRes = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_stress_student_01')
      .send({ examId: 'exm_stress_01', autoStart: true });

    expect(createRes.status).toBe(201);
    const attemptId = createRes.body.data.id;

    // 2. Bắn đồng thời 50 request autosave cho 50 câu hỏi khác nhau qua Promise.all
    const autosavePromises = mockQuestions.map((q, index) =>
      request(app)
        .put(`/v1/attempts/${attemptId}/answers/${q.id}`)
        .set('x-user-id', 'usr_stress_student_01')
        .send({
          answer: index % 2 === 0 ? 'opt_a' : 'opt_b',
          sequenceNumber: index + 1,
          clientTimestamp: Date.now() + index * 10,
        })
    );

    const responses = await Promise.all(autosavePromises);

    // 3. Toàn bộ 50 requests phải thành công (HTTP 200)
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }

    // 4. Kiểm tra dữ liệu trong Repository: Đủ 50 câu trả lời, không câu nào bị ghi đè hay thất lạc
    const savedAttempt = await attemptRepo.findAttemptById(attemptId);
    expect(savedAttempt).toBeDefined();
    expect(Object.keys(savedAttempt!.answers).length).toBe(50);

    for (let i = 0; i < 50; i++) {
      const qId = `q_${String(i + 1).padStart(2, '0')}`;
      expect(savedAttempt!.answers[qId]).toBeDefined();
      expect(savedAttempt!.answers[qId].answer).toBe(i % 2 === 0 ? 'opt_a' : 'opt_b');
    }

    // Version tăng chính xác qua từng lượt atomic patch
    expect(savedAttempt!.version).toBe(51); // 1 ban đầu + 50 lần patch
  });

  // =========================================================================
  // Kịch bản 2: Autosave vs. Submit Race - Submit cùng lúc với 10 Autosaves
  // =========================================================================
  it('Kịch bản 2 (Autosave vs. Submit Race): should prioritize submit, finalize attempt and reject subsequent late autosaves', async () => {
    const createRes = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_race_student_01')
      .send({ examId: 'exm_stress_01', autoStart: true });

    const attemptId = createRes.body.data.id;

    // Chuẩn bị 1 request submit và 10 request autosave
    const submitReq = request(app)
      .post(`/v1/attempts/${attemptId}/submit`)
      .set('x-user-id', 'usr_race_student_01');

    const autosaveReqs = Array.from({ length: 10 }).map((_, idx) =>
      request(app)
        .put(`/v1/attempts/${attemptId}/answers/q_${String(idx + 1).padStart(2, '0')}`)
        .set('x-user-id', 'usr_race_student_01')
        .send({
          answer: 'opt_a',
          sequenceNumber: idx + 1,
        })
    );

    // Thực thi đan xen
    const [submitRes, ...autosaveResponses] = await Promise.all([submitReq, ...autosaveReqs]);

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe('GRADED');

    // Sau khi ca thi đã ở trạng thái GRADED, các request autosave đến trễ hơn thời điểm submit phải bị reject 409
    const finalizedAttempt = await attemptRepo.findAttemptById(attemptId);
    expect(finalizedAttempt?.status).toBe('GRADED');

    // Bắn thêm 1 autosave chắc chắn đến sau khi submit commit xong
    const postSubmitAutosave = await request(app)
      .put(`/v1/attempts/${attemptId}/answers/q_50`)
      .set('x-user-id', 'usr_race_student_01')
      .send({ answer: 'opt_late', sequenceNumber: 99 });

    expect(postSubmitAutosave.status).toBe(409);
    expect(postSubmitAutosave.body.errorCode).toBe('ATTEMPT_ALREADY_FINALIZED');

    // Đảm bảo trạng thái vẫn là GRADED
    const finalCheck = await attemptRepo.findAttemptById(attemptId);
    expect(finalCheck?.status).toBe('GRADED');
  });

  // =========================================================================
  // Kịch bản 3: Double Submit Race - 5 requests submit đồng thời
  // =========================================================================
  it('Kịch bản 3 (Double Submit Race): should execute scoring exactly once and return idempotent result for concurrent submit requests', async () => {
    const createRes = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_double_submit_01')
      .send({ examId: 'exm_stress_01', autoStart: true });

    const attemptId = createRes.body.data.id;

    // Làm nháp câu 1 và câu 2 (đều chọn đúng opt_a)
    await request(app)
      .put(`/v1/attempts/${attemptId}/answers/q_01`)
      .set('x-user-id', 'usr_double_submit_01')
      .send({ answer: 'opt_a', sequenceNumber: 1 });

    await request(app)
      .put(`/v1/attempts/${attemptId}/answers/q_02`)
      .set('x-user-id', 'usr_double_submit_01')
      .send({ answer: 'opt_a', sequenceNumber: 2 });

    // Bắn đồng thời 5 request submit
    const submitPromises = Array.from({ length: 5 }).map(() =>
      request(app)
        .post(`/v1/attempts/${attemptId}/submit`)
        .set('x-user-id', 'usr_double_submit_01')
    );

    const responses = await Promise.all(submitPromises);

    // Tất cả 5 responses đều là HTTP 200
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('GRADED');
      expect(res.body.scoreResult.score).toBe(2);
    }

    // Đúng 1 request chấm bài tươi (isDuplicateSubmission === false), 4 request còn lại là duplicate
    const fresh = responses.filter((r) => r.body.isDuplicateSubmission === false);
    const duplicates = responses.filter((r) => r.body.isDuplicateSubmission === true);

    expect(fresh.length).toBe(1);
    expect(duplicates.length).toBe(4);
  });

  // =========================================================================
  // Kịch bản 4: Sweeper vs. Late Submit Race - Thí sinh nộp bài trùng lúc sweeper quét
  // =========================================================================
  it('Kịch bản 4 (Sweeper vs. Late Submit Race): should resolve race condition cleanly without deadlock or uncaught exceptions', async () => {
    // Tạo 1 ca thi đã hết hạn từ 30 giây trước
    const attempt = new Attempt({
      id: 'att_expired_race_01',
      userId: 'usr_sweeper_race_01',
      examId: 'exm_stress_01',
      snapshotId: 'snp_stress_01',
      durationMinutes: 30,
    });
    // Bắt đầu từ 31 phút trước, deadline 30 giây trước -> quá hạn
    const startTime = new Date(Date.now() - 31 * 60 * 1000);
    const deadlineTime = new Date(Date.now() - 30 * 1000);
    const answerTime = new Date(Date.now() - 15 * 60 * 1000);
    attempt.start(startTime, deadlineTime);
    attempt.recordAnswer('q_01', 'opt_a', 1, undefined, answerTime);
    await attemptRepo.saveAttempt(attempt);

    // Kích hoạt đồng thời: Sweeper quét quá hạn và thí sinh bấm nộp bài trễ
    const [sweepResult, studentSubmitRes] = await Promise.all([
      sweeper.sweep(new Date(), 15000),
      request(app)
        .post('/v1/attempts/att_expired_race_01/submit')
        .set('x-user-id', 'usr_sweeper_race_01'),
    ]);

    expect(studentSubmitRes.status).toBe(200);
    expect(['GRADED', 'TIMED_OUT_GRADED']).toContain(studentSubmitRes.body.status);

    // Trạng thái cuối cùng trong database phải là một trạng thái đóng băng hợp lệ
    const finalAttempt = await attemptRepo.findAttemptById('att_expired_race_01');
    expect(['GRADED', 'TIMED_OUT_GRADED']).toContain(finalAttempt?.status);
    expect(finalAttempt?.scoreResult).toBeDefined();
    expect(finalAttempt?.scoreResult?.score).toBe(1);
  });

  // =========================================================================
  // Kịch bản 5: Distributed Advisory Lock - 2 Replicas cùng kích hoạt Sweeper
  // =========================================================================
  it('Kịch bản 5 (Distributed Advisory Lock): should ensure only 1 active replica executes sweep and the other skips gracefully', async () => {
    // Tạo 2 sweeper services giả lập 2 Pod/Replicas riêng biệt dùng chung database
    const replicaSweeper1 = new AttemptExpirySweeperService(attemptRepo, mockExamClient);
    const replicaSweeper2 = new AttemptExpirySweeperService(attemptRepo, mockExamClient);

    // Tạo ca thi quá hạn
    const expiredAttempt = new Attempt({
      id: 'att_replica_expired_01',
      userId: 'usr_replica_01',
      examId: 'exm_stress_01',
      snapshotId: 'snp_stress_01',
      durationMinutes: 10,
    });
    expiredAttempt.start(new Date(Date.now() - 20 * 60 * 1000), new Date(Date.now() - 60 * 1000));
    await attemptRepo.saveAttempt(expiredAttempt);

    // Kích hoạt quét đồng thời từ cả 2 replicas
    const [result1, result2] = await Promise.all([
      replicaSweeper1.sweep(new Date(), 15000),
      replicaSweeper2.sweep(new Date(), 15000),
    ]);

    // Một replica thành công thực thi, một replica bị skip do advisory lock
    const oneAcquired = (result1.sweptCount > 0 && result2.skippedDueToLock) ||
                        (result2.sweptCount > 0 && result1.skippedDueToLock);

    expect(oneAcquired).toBe(true);

    // Bản ghi chỉ bị quét đúng 1 lần
    const sweptTotal = result1.sweptCount + result2.sweptCount;
    expect(sweptTotal).toBe(1);

    const checkAttempt = await attemptRepo.findAttemptById('att_replica_expired_01');
    expect(checkAttempt?.status).toBe('TIMED_OUT_GRADED');
  });

  // =========================================================================
  // Kịch bản 6: Metrics & Observability & Rollback Flag Endpoint
  // =========================================================================
  it('Kịch bản 6 (Observability & Rollback): should expose internal metrics and allow fallback via FEATURE_FLAG_ATOMIC_AUTOSAVE', async () => {
    // 1. Kiểm tra endpoint metrics nội bộ
    const metricsRes = await request(app)
      .get('/v1/internal/attempts/metrics')
      .set('x-internal-secret', 'internal-quiz-sweeper-secret');

    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body.success).toBe(true);
    const metricsData = metricsRes.body.data;

    expect(metricsData).toHaveProperty('attempt_occ_conflicts_total');
    expect(metricsData).toHaveProperty('attempt_double_submits_total');
    expect(metricsData).toHaveProperty('attempt_sweeper_locked_skips_total');
    expect(metricsData).toHaveProperty('attempt_atomic_patch_total');
    expect(metricsData).toHaveProperty('attempt_submissions_total');
    expect(metricsData).toHaveProperty('feature_flag_atomic_autosave');
    expect(metricsData.feature_flag_atomic_autosave).toBe(true);

    // 2. Kiểm thử Rollback Fallback khi FEATURE_FLAG_ATOMIC_AUTOSAVE=false
    process.env.FEATURE_FLAG_ATOMIC_AUTOSAVE = 'false';

    const createRes = await request(app)
      .post('/v1/attempts')
      .set('x-user-id', 'usr_rollback_test_01')
      .send({ examId: 'exm_stress_01', autoStart: true });

    const attemptId = createRes.body.data.id;

    // Lưu câu trả lời thông qua rollback fallback
    const fallbackAutosave = await request(app)
      .put(`/v1/attempts/${attemptId}/answers/q_01`)
      .set('x-user-id', 'usr_rollback_test_01')
      .send({ answer: 'opt_fallback', sequenceNumber: 1 });

    expect(fallbackAutosave.status).toBe(200);
    expect(fallbackAutosave.body.success).toBe(true);

    const rollbackAttempt = await attemptRepo.findAttemptById(attemptId);
    expect(rollbackAttempt?.answers['q_01'].answer).toBe('opt_fallback');

    // Phục hồi lại cờ mặc định
    process.env.FEATURE_FLAG_ATOMIC_AUTOSAVE = 'true';
  });
});
