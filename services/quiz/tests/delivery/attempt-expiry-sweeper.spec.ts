import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAssessmentRepository } from '../../src/infrastructure/repositories/in-memory-assessment.repository.js';
import { AttemptExpirySweeperService } from '../../src/application/services/attempt-expiry-sweeper.service.js';
import { DeliveryUseCases } from '../../src/application/use-cases/delivery/delivery.use-cases.js';
import { Attempt } from '../../src/domain/delivery/attempt.aggregate.js';

describe('BƯỚC 3: AttemptExpirySweeperService & Opportunistic Sweeping', () => {
  let assessmentRepo: InMemoryAssessmentRepository;
  let sweeperService: AttemptExpirySweeperService;
  let deliveryUseCases: DeliveryUseCases;

  beforeEach(() => {
    assessmentRepo = new InMemoryAssessmentRepository();
    sweeperService = new AttemptExpirySweeperService(assessmentRepo, assessmentRepo);
    deliveryUseCases = new DeliveryUseCases(assessmentRepo, assessmentRepo);
  });

  it('should sweep expired in-progress attempts and transition to TIMED_OUT_GRADED with score calculation', async () => {
    // 1. Tạo một attempt đang làm bài (IN_PROGRESS)
    const startedAt = new Date('2026-09-04T08:00:00.000Z');
    const deadline = new Date('2026-09-04T08:15:00.000Z'); // 15 phút

    const attempt = new Attempt({
      id: 'att_expired_01',
      userId: 'student_bob',
      quizId: 'quiz_demo',
      quizVersionId: 'ver_demo_v1',
      status: 'IN_PROGRESS',
      startedAt,
      deadline,
    });

    // Thí sinh đã trả lời 1 câu đúng trước khi bị ngắt kết nối
    attempt.recordAnswer('q1', 'opt_1', startedAt.getTime() + 1000, new Date(startedAt.getTime() + 1000));
    await assessmentRepo.saveAttempt(attempt);

    // 2. Mô phỏng thời gian hiện tại là 08:15:30 (Quá deadline 30s > 15s grace period)
    const simulatedNow = new Date('2026-09-04T08:15:30.000Z');

    const result = await sweeperService.sweep(simulatedNow, 15000);

    expect(result.totalFound).toBe(1);
    expect(result.sweptCount).toBe(1);
    expect(result.sweptAttempts[0].attemptId).toBe('att_expired_01');
    expect(result.sweptAttempts[0].passed).toBe(false); // passScore là 3, q1 được 2 điểm
    expect(result.sweptAttempts[0].score).toBe(2);

    // Kiểm tra bản ghi trong repository sau khi quét
    const updated = await assessmentRepo.findAttemptById('att_expired_01');
    expect(updated).toBeDefined();
    expect(updated?.status).toBe('TIMED_OUT_GRADED');
    expect(updated?.scoreResult).toBeDefined();
    expect(updated?.scoreResult?.score).toBe(2);
    expect(updated?.submittedAt).toEqual(simulatedNow);
  });

  it('should NOT sweep active attempts that are still within official deadline or grace period', async () => {
    const startedAt = new Date('2026-09-04T08:00:00.000Z');
    const deadline = new Date('2026-09-04T08:15:00.000Z');

    // Attempt 1: Vẫn đang trong giờ làm bài (now = 08:10:00)
    const attempt1 = new Attempt({
      id: 'att_active_01',
      userId: 'student_alice',
      quizId: 'quiz_demo',
      quizVersionId: 'ver_demo_v1',
      status: 'IN_PROGRESS',
      startedAt,
      deadline,
    });
    await assessmentRepo.saveAttempt(attempt1);

    // Attempt 2: Đang trong 15s grace period (now = 08:15:10, deadline + grace = 08:15:15)
    const attempt2 = new Attempt({
      id: 'att_grace_02',
      userId: 'student_charlie',
      quizId: 'quiz_demo',
      quizVersionId: 'ver_demo_v1',
      status: 'IN_PROGRESS',
      startedAt,
      deadline,
    });
    await assessmentRepo.saveAttempt(attempt2);

    const checkTime = new Date('2026-09-04T08:15:10.000Z');
    const result = await sweeperService.sweep(checkTime, 15000);

    // Cả 2 đều chưa quá hạn grace period (15s sau deadline) -> không được phép quét cưỡng chế
    expect(result.sweptCount).toBe(0);

    const a1 = await assessmentRepo.findAttemptById('att_active_01');
    const a2 = await assessmentRepo.findAttemptById('att_grace_02');
    expect(a1?.status).toBe('IN_PROGRESS');
    expect(a2?.status).toBe('IN_PROGRESS');
  });

  it('should support Opportunistic Sweeping via getAttemptDetails when student re-syncs', async () => {
    const startedAt = new Date('2026-09-04T08:00:00.000Z');
    const deadline = new Date('2026-09-04T08:15:00.000Z');

    const attempt = new Attempt({
      id: 'att_opportunistic_01',
      userId: 'student_dan',
      quizId: 'quiz_demo',
      quizVersionId: 'ver_demo_v1',
      status: 'IN_PROGRESS',
      startedAt,
      deadline,
    });

    // Trả lời 2 câu đúng: q1 (2 điểm), q2 (2 điểm) -> tổng 4 điểm >= passingScore (3) -> Passed!
    attempt.recordAnswer('q1', 'opt_1', startedAt.getTime() + 1000, new Date(startedAt.getTime() + 1000));
    attempt.recordAnswer('q2', ['opt_let', 'opt_const'], startedAt.getTime() + 2000, new Date(startedAt.getTime() + 2000));
    await assessmentRepo.saveAttempt(attempt);

    // Thí sinh mở lại trang lúc 08:20:00 (mạng khôi phục)
    const reconnectTime = new Date('2026-09-04T08:20:00.000Z');
    const details = await deliveryUseCases.getAttemptDetails('att_opportunistic_01', 'student_dan', reconnectTime);

    expect(details.autoSwept).toBe(true);
    expect(details.attempt.status).toBe('TIMED_OUT_GRADED');
    expect(details.attempt.scoreResult?.score).toBe(4);
    expect(details.attempt.scoreResult?.passed).toBe(true);

    // Repository cũng được cập nhật ngay lập tức
    const inRepo = await assessmentRepo.findAttemptById('att_opportunistic_01');
    expect(inRepo?.status).toBe('TIMED_OUT_GRADED');
  });

  it('should manage daemon lifecycle via start() and stop()', () => {
    sweeperService.start(10000);
    const statusRunning = sweeperService.getStatus();
    expect(statusRunning.isRunning).toBe(true);
    expect(statusRunning.intervalMs).toBe(10000);

    sweeperService.stop();
    const statusStopped = sweeperService.getStatus();
    expect(statusStopped.isRunning).toBe(false);
  });
});
