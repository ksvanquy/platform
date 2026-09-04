import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Attempt } from '../../src/domain/delivery/attempt.aggregate.js';
import { AttemptManifest } from '../../src/domain/delivery/attempt-manifest.js';
import {
  OutdatedAnswerSequenceError,
  OutdatedAnswerTimestampError,
} from '../../src/domain/errors/domain-errors.js';
import { InMemoryAssessmentRepository } from '../../src/infrastructure/repositories/in-memory-assessment.repository.js';
import { DeliveryUseCases } from '../../src/application/use-cases/delivery/delivery.use-cases.js';
import { createV1AttemptsRouter } from '../../src/presentation/routes/v1-attempts.routes.js';

describe('BƯỚC 4: Logical Sequence Concurrency Control & Network Delay Simulation', () => {
  const sampleManifest: AttemptManifest = {
    quizVersionId: 'ver_demo_v1',
    questionIds: ['q1', 'q2', 'q3'],
    optionOrders: {},
    timeLimitMinutes: 60,
    startedAt: new Date(Date.now() - 60000).toISOString(),
    deadline: new Date(Date.now() + 3600000).toISOString(),
  };

  describe('1. Domain Aggregate Sequence-Based Concurrency Defense', () => {
    it('should store sequenceNumber in CandidateAnswerRecord', () => {
      const attempt = new Attempt({
        id: 'att_seq_001',
        userId: 'student_alice',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
      });

      attempt.start(new Date('2026-09-04T10:00:00.000Z'), sampleManifest);
      attempt.recordAnswer('q1', { selectedOptionId: 'opt_A' }, 1, new Date('2026-09-04T10:01:00.000Z'));

      const record = attempt.answers['q1'];
      expect(record).toBeDefined();
      expect(record.sequenceNumber).toBe(1);
      expect(record.answer).toEqual({ selectedOptionId: 'opt_A' });
      // Backward compatibility alias
      expect(record.clientTimestamp).toBe(1);
    });

    it('should update answer when sequenceNumber increases strictly monotonically', () => {
      const attempt = new Attempt({
        id: 'att_seq_002',
        userId: 'student_alice',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
      });

      attempt.start(new Date('2026-09-04T10:00:00.000Z'), sampleManifest);

      // Sequence 1: Lựa chọn đáp án A
      attempt.recordAnswer('q1', 'opt_A', 1, new Date('2026-09-04T10:01:00.000Z'));
      expect(attempt.answers['q1'].answer).toBe('opt_A');
      expect(attempt.answers['q1'].sequenceNumber).toBe(1);

      // Sequence 2: Đổi ý chọn đáp án B
      attempt.recordAnswer('q1', 'opt_B', 2, new Date('2026-09-04T10:01:05.000Z'));
      expect(attempt.answers['q1'].answer).toBe('opt_B');
      expect(attempt.answers['q1'].sequenceNumber).toBe(2);

      // Sequence 3: Đổi ý chọn đáp án C
      attempt.recordAnswer('q1', 'opt_C', 3, new Date('2026-09-04T10:01:10.000Z'));
      expect(attempt.answers['q1'].answer).toBe('opt_C');
      expect(attempt.answers['q1'].sequenceNumber).toBe(3);
    });

    it('should reject out-of-order delayed answer with OutdatedAnswerSequenceError', () => {
      const attempt = new Attempt({
        id: 'att_seq_003',
        userId: 'student_alice',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
      });

      attempt.start(new Date('2026-09-04T10:00:00.000Z'), sampleManifest);

      // Gói tin mới nhất đến trước (sequence = 5)
      attempt.recordAnswer('q1', 'answer_latest', 5, new Date('2026-09-04T10:02:00.000Z'));

      // Gói tin cũ bị trễ mạng đến sau (sequence = 2)
      expect(() => {
        attempt.recordAnswer('q1', 'answer_stale', 2, new Date('2026-09-04T10:02:01.000Z'));
      }).toThrow(OutdatedAnswerSequenceError);

      // Đáp án được ghi nhận phải giữ nguyên giá trị mới nhất
      expect(attempt.answers['q1'].answer).toBe('answer_latest');
      expect(attempt.answers['q1'].sequenceNumber).toBe(5);
    });

    it('should ensure OutdatedAnswerSequenceError is an instance of OutdatedAnswerTimestampError for backward compatibility', () => {
      const attempt = new Attempt({
        id: 'att_seq_compat',
        userId: 'student_alice',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
      });

      attempt.start(new Date('2026-09-04T10:00:00.000Z'), sampleManifest);
      attempt.recordAnswer('q1', 'val_first', 10);

      try {
        attempt.recordAnswer('q1', 'val_outdated', 5);
        expect.fail('Expected error to be thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(OutdatedAnswerSequenceError);
        expect(err).toBeInstanceOf(OutdatedAnswerTimestampError);
        expect(err.errorCode).toBe('OUTDATED_ANSWER_SEQUENCE');
        expect(err.statusCode).toBe(409);
      }
    });

    it('should reject duplicate sequence number (packet retransmission defense)', () => {
      const attempt = new Attempt({
        id: 'att_seq_dup',
        userId: 'student_alice',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
      });

      attempt.start(new Date('2026-09-04T10:00:00.000Z'), sampleManifest);
      attempt.recordAnswer('q1', 'answer_seq_1', 1);

      // Gói tin trùng lặp sequence = 1
      expect(() => {
        attempt.recordAnswer('q1', 'answer_seq_1_dup', 1);
      }).toThrow(OutdatedAnswerSequenceError);

      expect(attempt.answers['q1'].answer).toBe('answer_seq_1');
    });

    it('should maintain independent sequence tracks per question', () => {
      const attempt = new Attempt({
        id: 'att_multi_q',
        userId: 'student_alice',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
      });

      attempt.start(new Date('2026-09-04T10:00:00.000Z'), sampleManifest);

      // q1 đạt sequence 10
      attempt.recordAnswer('q1', 'q1_seq10', 10);
      // q2 bắt đầu ở sequence 1 mà không bị xung đột với sequence của q1
      attempt.recordAnswer('q2', 'q2_seq1', 1);

      expect(attempt.answers['q1'].sequenceNumber).toBe(10);
      expect(attempt.answers['q1'].answer).toBe('q1_seq10');
      expect(attempt.answers['q2'].sequenceNumber).toBe(1);
      expect(attempt.answers['q2'].answer).toBe('q2_seq1');
    });
  });

  describe('2. Network Delay & Jitter Simulation (Scrambled Packet Arrivals)', () => {
    it('should maintain 100% data integrity when 50 updates arrive in random scrambled order', () => {
      const attempt = new Attempt({
        id: 'att_jitter_test',
        userId: 'student_alice',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
      });

      attempt.start(new Date('2026-09-04T10:00:00.000Z'), sampleManifest);

      // Tạo 50 bản cập nhật có thứ tự logic tăng dần từ 1 đến 50
      const updates = Array.from({ length: 50 }, (_, i) => ({
        sequenceNumber: i + 1,
        value: `choice_${i + 1}`,
      }));

      // Xáo trộn thứ tự xuất hiện của các gói tin (mô phỏng jitter mạng Internet)
      // Sử dụng thuật toán Fisher-Yates shuffle
      const scrambled = [...updates];
      for (let i = scrambled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
      }

      let acceptedCount = 0;
      let rejectedCount = 0;
      let highestSeenSequence = 0;

      // Xử lý từng gói tin đến ngẫu nhiên
      for (const packet of scrambled) {
        try {
          attempt.recordAnswer('q1', packet.value, packet.sequenceNumber);
          acceptedCount++;
          expect(packet.sequenceNumber).toBeGreaterThan(highestSeenSequence);
          highestSeenSequence = packet.sequenceNumber;
        } catch (err: any) {
          expect(err).toBeInstanceOf(OutdatedAnswerSequenceError);
          rejectedCount++;
          expect(packet.sequenceNumber).toBeLessThanOrEqual(highestSeenSequence);
        }
      }

      // Tổng số gói xử lý phải là 50
      expect(acceptedCount + rejectedCount).toBe(50);
      expect(acceptedCount).toBeGreaterThan(0);

      // Kết quả cuối cùng trong Aggregate BẮT BUỘC phải là giá trị của sequence cao nhất (50)
      expect(attempt.answers['q1'].sequenceNumber).toBe(50);
      expect(attempt.answers['q1'].answer).toBe('choice_50');
    });
  });

  describe('3. Delivery Use Cases Concurrent Execution', () => {
    let repo: InMemoryAssessmentRepository;
    let delivery: DeliveryUseCases;

    beforeEach(async () => {
      repo = new InMemoryAssessmentRepository();
      delivery = new DeliveryUseCases(repo, repo);

      const attempt = new Attempt({
        id: 'att_usecase_seq',
        userId: 'candidate_charlie',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
      });
      attempt.start(new Date('2026-09-04T10:00:00.000Z'), sampleManifest);
      await repo.saveAttempt(attempt);
    });

    it('should resolve concurrent asynchronous saves with higher sequence winning', async () => {
      // Giả lập 2 yêu cầu gửi song song:
      // Request A: sequence 2, gửi với delay mô phỏng 10ms
      // Request B: sequence 1, gửi với delay mô phỏng 30ms (đến muộn)
      const saveReqA = async () => {
        await new Promise((r) => setTimeout(r, 10));
        return delivery.recordAnswer({
          attemptId: 'att_usecase_seq',
          userId: 'candidate_charlie',
          questionId: 'q1',
          answer: 'opt_B_final',
          sequenceNumber: 2,
        });
      };

      const saveReqB = async () => {
        await new Promise((r) => setTimeout(r, 30));
        return delivery.recordAnswer({
          attemptId: 'att_usecase_seq',
          userId: 'candidate_charlie',
          questionId: 'q1',
          answer: 'opt_A_stale',
          sequenceNumber: 1,
        });
      };

      // Thực thi song song
      const [resA, resB] = await Promise.allSettled([saveReqA(), saveReqB()]);

      expect(resA.status).toBe('fulfilled');
      expect(resB.status).toBe('rejected');
      if (resB.status === 'rejected') {
        expect(resB.reason).toBeInstanceOf(OutdatedAnswerSequenceError);
      }

      // Kiểm tra trạng thái đã lưu trong repository
      const savedAttempt = await repo.findAttemptById('att_usecase_seq');
      expect(savedAttempt?.answers['q1'].answer).toBe('opt_B_final');
      expect(savedAttempt?.answers['q1'].sequenceNumber).toBe(2);
    });
  });

  describe('4. HTTP RESTful API Integration (/v1/attempts/:id/answers/:questionId)', () => {
    let app: express.Application;
    let repo: InMemoryAssessmentRepository;
    let delivery: DeliveryUseCases;

    beforeEach(async () => {
      repo = new InMemoryAssessmentRepository();
      delivery = new DeliveryUseCases(repo, repo);

      const attempt = new Attempt({
        id: 'att_http_seq',
        userId: 'test_user_id',
        quizId: 'quiz_demo',
        quizVersionId: 'ver_demo_v1',
      });
      attempt.start(new Date('2026-09-04T10:00:00.000Z'), sampleManifest);
      await repo.saveAttempt(attempt);

      app = express();
      app.use(express.json());
      // Giả lập auth middleware gán req.principal
      app.use((req: any, _res, next) => {
        req.principal = { id: 'test_user_id', role: 'STUDENT', email: 'test@example.com' };
        next();
      });
      app.use('/v1/attempts', createV1AttemptsRouter(delivery));
    });

    it('should return 200 OK for sequence 1 and sequence 2', async () => {
      const res1 = await request(app)
        .put('/v1/attempts/att_http_seq/answers/q1')
        .send({ answer: 'opt_1', sequenceNumber: 1 });
      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      const res2 = await request(app)
        .put('/v1/attempts/att_http_seq/answers/q1')
        .send({ answer: 'opt_2', sequenceNumber: 2 });
      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);
    });

    it('should return 409 Conflict with OUTDATED_ANSWER_SEQUENCE when sequence is out-of-order', async () => {
      // Đặt sequence 10
      await request(app)
        .put('/v1/attempts/att_http_seq/answers/q1')
        .send({ answer: 'opt_10', sequenceNumber: 10 });

      // Gửi sequence 5 (đến muộn)
      const resOutdated = await request(app)
        .put('/v1/attempts/att_http_seq/answers/q1')
        .send({ answer: 'opt_5', sequenceNumber: 5 });

      expect(resOutdated.status).toBe(409);
      expect(resOutdated.body.success).toBe(false);
      expect(resOutdated.body.errorCode).toBe('OUTDATED_ANSWER_SEQUENCE');
      expect(resOutdated.body.message).toContain('Rejected out-of-order answer');
    });

    it('should also accept sequenceNumber in POST /v1/attempts/:id/answers body', async () => {
      const res = await request(app)
        .post('/v1/attempts/att_http_seq/answers')
        .send({ questionId: 'q2', answer: 'opt_q2_seq1', sequenceNumber: 1 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const resStale = await request(app)
        .post('/v1/attempts/att_http_seq/answers')
        .send({ questionId: 'q2', answer: 'opt_q2_stale', sequenceNumber: 1 });

      expect(resStale.status).toBe(409);
      expect(resStale.body.errorCode).toBe('OUTDATED_ANSWER_SEQUENCE');
    });
  });
});
