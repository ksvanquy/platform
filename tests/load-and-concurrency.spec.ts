import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../services/gateway/src/server.js';
import { Attempt } from '../services/attempt/src/domain/entities/attempt.entity.js';
import { OutdatedAnswerSequenceError } from '../services/attempt/src/domain/errors/attempt-domain.errors.js';
import { MatrixSolverService } from '../services/exam/src/domain/services/matrix-solver.service.js';
import type { QuestionDTO, BlueprintCriterion, ScoringPolicyConfig } from '@platform/contracts';

describe('GIAI ĐOẠN 6: Load, Concurrency & Performance Benchmarks', () => {
  describe('1. Autosave High-Write Load & Concurrency Defense', () => {
    let attempt: Attempt;

    beforeEach(() => {
      attempt = new Attempt({
        id: 'att_load_test_001',
        userId: 'usr_student_01',
        examId: 'exm_perf_001',
        snapshotId: 'snp_perf_001',
        variantCode: '101',
        durationMinutes: 45,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        deadline: new Date(Date.now() + 45 * 60 * 1000),
      });
    });

    it('should achieve p99 latency < 25ms under 500 high-frequency autosave operations', () => {
      const NUM_OPERATIONS = 500;
      const latenciesMs: number[] = [];

      for (let i = 1; i <= NUM_OPERATIONS; i++) {
        const start = performance.now();
        attempt.recordAnswer(
          `q_math_perf_${i % 10}`,
          { selectedOptionId: `opt_${i % 4}` },
          i, // Strictly increasing sequence number
          Date.now(),
          new Date()
        );
        const elapsed = performance.now() - start;
        latenciesMs.push(elapsed);
      }

      latenciesMs.sort((a, b) => a - b);
      const p50Index = Math.floor(NUM_OPERATIONS * 0.5);
      const p95Index = Math.floor(NUM_OPERATIONS * 0.95);
      const p99Index = Math.floor(NUM_OPERATIONS * 0.99);

      const p50 = latenciesMs[p50Index];
      const p95 = latenciesMs[p95Index];
      const p99 = latenciesMs[p99Index];

      console.log(`⚡ [Autosave Benchmark] 500 ops: p50 = ${p50.toFixed(3)}ms, p95 = ${p95.toFixed(3)}ms, p99 = ${p99.toFixed(3)}ms`);

      expect(p99).toBeLessThan(25); // Target p99 < 25ms SLA
      expect(attempt.status).toBe('IN_PROGRESS');
    });

    it('should defend against outdated answer sequence (OutdatedAnswerSequenceError)', () => {
      const qId = 'q_math10_quad_001';

      // 1. Ghi nhận lượt trả lời thứ 10
      attempt.recordAnswer(qId, { selectedOptionId: 'opt_1' }, 10);
      expect(attempt.answers[qId].sequenceNumber).toBe(10);
      expect((attempt.answers[qId].answer as any).selectedOptionId).toBe('opt_1');

      // 2. Gói tin đến trễ với sequenceNumber = 8 (nhỏ hơn 10) -> Phải bị từ chối
      expect(() => {
        attempt.recordAnswer(qId, { selectedOptionId: 'opt_old' }, 8);
      }).toThrow(OutdatedAnswerSequenceError);

      // 3. Gói tin trùng lặp với sequenceNumber = 10 (bằng 10) -> Phải bị từ chối
      expect(() => {
        attempt.recordAnswer(qId, { selectedOptionId: 'opt_duplicate' }, 10);
      }).toThrow(OutdatedAnswerSequenceError);

      // Dữ liệu không bị ghi đè bởi gói tin cũ
      expect((attempt.answers[qId].answer as any).selectedOptionId).toBe('opt_1');

      // 4. Gói tin mới hơn với sequenceNumber = 11 -> Phải được chấp nhận thành công
      attempt.recordAnswer(qId, { selectedOptionId: 'opt_2' }, 11);
      expect(attempt.answers[qId].sequenceNumber).toBe(11);
      expect((attempt.answers[qId].answer as any).selectedOptionId).toBe('opt_2');
    });

    it('should guarantee Zero Data Loss under concurrent out-of-order writes', async () => {
      const qId = 'q_concurrent_01';

      // Mô phỏng 50 gói tin gửi đến không theo thứ tự (out of order)
      const sequencePayloads = Array.from({ length: 50 }, (_, i) => ({
        seq: i + 1,
        value: `answer_v${i + 1}`,
      }));

      // Xáo trộn ngẫu nhiên thứ tự các gói tin đến máy chủ
      const shuffledArrival = [...sequencePayloads].sort(() => Math.random() - 0.5);

      for (const item of shuffledArrival) {
        try {
          attempt.recordAnswer(qId, { value: item.value }, item.seq);
        } catch (err) {
          // Bỏ qua lỗi OutdatedAnswerSequenceError do gói tin đến sau gói tin mới hơn
          if (!(err instanceof OutdatedAnswerSequenceError)) {
            throw err;
          }
        }
      }

      // Đảm bảo trạng thái cuối cùng luôn là phiên bản mới nhất (seq 50)
      expect(attempt.answers[qId].sequenceNumber).toBe(50);
      expect((attempt.answers[qId].answer as any).value).toBe('answer_v50');
    });
  });

  describe('2. Matrix Solver & Deterministic PRNG Benchmark', () => {
    const mockQuestions: QuestionDTO[] = Array.from({ length: 30 }, (_, i) => ({
      id: `q_pool_${i + 1}`,
      code: `MATH10-POOL-${String(i + 1).padStart(3, '0')}`,
      type: (i % 2 === 0 ? 'SINGLE' : 'MULTIPLE') as any,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: (i < 10 ? 'REMEMBER' : i < 20 ? 'UNDERSTAND' : 'APPLY') as any,
      defaultPoints: 1,
      status: 'ACTIVE' as any,
      currentRevisionId: `rev_pool_${i + 1}`,
      ownerId: 'usr_instructor_01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentRevision: {
        id: `rev_pool_${i + 1}`,
        questionId: `q_pool_${i + 1}`,
        revisionNumber: 1,
        prompt: `$$f(x) = x^2 - ${i}x + 1$$ - Câu hỏi số ${i + 1}`,
        options: [
          { id: `opt_${i}_1`, content: `$$x = ${i}$$`, isCorrect: true, explanation: 'Chính xác' },
          { id: `opt_${i}_2`, content: `$$x = -${i}$$`, isCorrect: false },
          { id: `opt_${i}_3`, content: `$$x = ${i * 2}$$`, isCorrect: false },
          { id: `opt_${i}_4`, content: `$$x = 0$$`, isCorrect: false },
        ],
        explanation: `Lời giải chi tiết bài toán ${i + 1}`,
        createdBy: 'usr_instructor_01',
        createdAt: new Date().toISOString(),
      },
    }));

    const criteria: BlueprintCriterion[] = [
      { topicNodeId: 'node_math_quad_eq', difficulty: 'REMEMBER', questionCount: 4, pointsPerQuestion: 1 },
      { topicNodeId: 'node_math_quad_eq', difficulty: 'UNDERSTAND', questionCount: 4, pointsPerQuestion: 1 },
      { topicNodeId: 'node_math_quad_eq', difficulty: 'APPLY', questionCount: 2, pointsPerQuestion: 1 },
    ];

    const scoringPolicy: ScoringPolicyConfig = {
      strategyType: 'STANDARD',
      roundingDecimal: 2,
    };

    it('should solve matrix and generate 10 exam variants in under 200ms', () => {
      const start = performance.now();

      const result = MatrixSolverService.solveMatrix({
        examId: 'exm_benchmark_10v',
        examCode: 'EXM-BENCH-10V',
        examTitle: 'Đề Thi Thử Nghiệm Tải 10 Mã Đề',
        durationMinutes: 45,
        seedBase: 2026,
        variantsCount: 10,
        criteria,
        scoringPolicy,
        availableQuestions: mockQuestions,
      });

      const elapsed = performance.now() - start;
      console.log(`⚡ [Matrix Solver Benchmark] Solved 10 variants in ${elapsed.toFixed(2)}ms (Target < 200ms)`);

      expect(elapsed).toBeLessThan(200);
      expect(result.snapshots).toHaveLength(10);
      expect(result.totalQuestions).toBe(10);
      expect(result.totalPoints).toBe(10);
    });

    it('should guarantee 100% deterministic reproducibility for identical seeds', () => {
      const run1 = MatrixSolverService.solveMatrix({
        examId: 'exm_determ_1',
        examCode: 'EXM-DET-01',
        examTitle: 'Đề Thi Tiền Định',
        durationMinutes: 45,
        seedBase: 2026,
        variantsCount: 4,
        criteria,
        scoringPolicy,
        availableQuestions: mockQuestions,
      });

      const run2 = MatrixSolverService.solveMatrix({
        examId: 'exm_determ_2',
        examCode: 'EXM-DET-01',
        examTitle: 'Đề Thi Tiền Định',
        durationMinutes: 45,
        seedBase: 2026,
        variantsCount: 4,
        criteria,
        scoringPolicy,
        availableQuestions: mockQuestions,
      });

      // Đối chiếu từng biến thể giữa run 1 và run 2
      for (let i = 0; i < 4; i++) {
        const snap1 = run1.snapshots[i];
        const snap2 = run2.snapshots[i];

        // Mã đề
        expect(snap1.variantCode).toBe(snap2.variantCode);

        // Thứ tự câu hỏi
        const qOrder1 = snap1.frozenPayload.questions.map((q) => q.id);
        const qOrder2 = snap2.frozenPayload.questions.map((q) => q.id);
        expect(qOrder1).toEqual(qOrder2);

        // Thứ tự phương án của từng câu hỏi
        for (let qIdx = 0; qIdx < qOrder1.length; qIdx++) {
          const optOrder1 = snap1.frozenPayload.questions[qIdx].options.map((o) => o.id);
          const optOrder2 = snap2.frozenPayload.questions[qIdx].options.map((o) => o.id);
          expect(optOrder1).toEqual(optOrder2);
        }
      }
    });

    it('should generate different permutations when seedBase is different', () => {
      const runSeedA = MatrixSolverService.solveMatrix({
        examId: 'exm_seed_a',
        examCode: 'EXM-SEED-A',
        examTitle: 'Seed A',
        durationMinutes: 45,
        seedBase: 2026,
        variantsCount: 2,
        criteria,
        scoringPolicy,
        availableQuestions: mockQuestions,
      });

      const runSeedB = MatrixSolverService.solveMatrix({
        examId: 'exm_seed_b',
        examCode: 'EXM-SEED-B',
        examTitle: 'Seed B',
        durationMinutes: 45,
        seedBase: 999999,
        variantsCount: 2,
        criteria,
        scoringPolicy,
        availableQuestions: mockQuestions,
      });

      const qOrderA = runSeedA.snapshots[0].frozenPayload.questions.map((q) => q.id);
      const qOrderB = runSeedB.snapshots[0].frozenPayload.questions.map((q) => q.id);

      // Khác seed sẽ cho ra phân bổ hoặc thứ tự câu hỏi khác nhau
      const isIdentical = JSON.stringify(qOrderA) === JSON.stringify(qOrderB);
      expect(isIdentical).toBe(false);
    });

    it('should strictly sanitize candidate manifest without leaking answer keys or explanations', () => {
      const result = MatrixSolverService.solveMatrix({
        examId: 'exm_sanitize_check',
        examCode: 'EXM-SAN-01',
        examTitle: 'Sanitize Check',
        durationMinutes: 45,
        seedBase: 2026,
        variantsCount: 2,
        criteria,
        scoringPolicy,
        availableQuestions: mockQuestions,
      });

      for (const snapshot of result.snapshots) {
        // Snapshot frozenPayload phải bảo toàn đáp án và giải thích
        for (const fq of snapshot.frozenPayload.questions) {
          expect(fq.explanation).toBeDefined();
          for (const opt of fq.options) {
            expect(opt.isCorrect).toBeDefined();
          }
        }

        // Snapshot sanitizedManifest gửi về thí sinh TUYỆT ĐỐI KHÔNG rò rỉ isCorrect hay explanation
        const manifest = snapshot.sanitizedManifest;
        for (const sq of manifest.questions) {
          expect((sq as any).explanation).toBeUndefined();
          expect((sq as any).rubric).toBeUndefined();
          for (const opt of sq.options) {
            expect((opt as any).isCorrect).toBeUndefined();
            expect((opt as any).explanation).toBeUndefined();
          }
        }

        // Check contentHash SHA-256
        expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
      }
    });
  });

  describe('3. Unified Gateway Concurrency & Clock Synchronization', () => {
    it('should handle 50 concurrent /v1/time requests with Cristian offset precision', async () => {
      const requests = Array.from({ length: 50 }, () => request(app).get('/v1/time'));

      const startTime = performance.now();
      const responses = await Promise.all(requests);
      const elapsed = performance.now() - startTime;

      console.log(`⚡ [Time Sync Concurrency] 50 requests in ${elapsed.toFixed(2)}ms (Avg: ${(elapsed / 50).toFixed(2)}ms/req)`);

      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.serverTime).toBe('string');
        expect(typeof res.body.timestampMs).toBe('number');

        // Mốc thời gian máy chủ phải xấp xỉ thời gian thực hiện test (trong vòng 2000ms)
        const serverEpoch = res.body.timestampMs;
        expect(Math.abs(Date.now() - serverEpoch)).toBeLessThan(2000);
      }
    });
  });
});
