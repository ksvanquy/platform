import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, assessmentRepo } from '../../src/presentation/server.js';
import { Attempt } from '../../src/domain/delivery/attempt.aggregate.js';

describe('BƯỚC 3: Internal Sweeper HTTP API (/v1/internal/attempts)', () => {
  const SWEEPER_SECRET = process.env.INTERNAL_SWEEPER_SECRET || 'internal-quiz-sweeper-secret';

  beforeEach(async () => {
    // Dọn dẹp hoặc gieo dữ liệu nếu cần
  });

  it('should reject unauthorized access without secret or admin credentials with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/v1/internal/attempts/sweep')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('FORBIDDEN_INTERNAL_ACCESS');
  });

  it('should execute sweep when valid x-internal-secret header is provided', async () => {
    // Tạo 1 attempt quá hạn trong assessmentRepo
    const startedAt = new Date(Date.now() - 3600 * 1000); // 1 giờ trước
    const deadline = new Date(Date.now() - 3000 * 1000); // Đã hết hạn 50 phút trước

    const attempt = new Attempt({
      id: 'att_api_expired_01',
      userId: 'student_tester',
      quizId: 'quiz_demo',
      quizVersionId: 'ver_demo_v1',
      status: 'IN_PROGRESS',
      startedAt,
      deadline,
    });
    await assessmentRepo.saveAttempt(attempt);

    const res = await request(app)
      .post('/v1/internal/attempts/sweep')
      .set('x-internal-secret', SWEEPER_SECRET)
      .send({ gracePeriodMs: 15000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.sweptCount).toBeGreaterThanOrEqual(1);

    // Kiểm tra attempt đã chuyển sang TIMED_OUT_GRADED
    const updated = await assessmentRepo.findAttemptById('att_api_expired_01');
    expect(updated?.status).toBe('TIMED_OUT_GRADED');
  });

  it('should accept secret via query parameter ?secret=...', async () => {
    const res = await request(app)
      .post(`/v1/internal/attempts/sweep?secret=${SWEEPER_SECRET}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return background daemon status via GET /v1/internal/attempts/sweeper-status', async () => {
    const res = await request(app)
      .get('/v1/internal/attempts/sweeper-status')
      .set('x-internal-secret', SWEEPER_SECRET);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isRunning).toBe(true);
    expect(res.body.data.intervalMs).toBe(30000);
  });
});
