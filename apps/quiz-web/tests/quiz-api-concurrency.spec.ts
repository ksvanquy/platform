import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quizApi } from '../src/api/quiz-api.js';
import { apiClient } from '../src/api/client.js';
import { TimeSyncManager } from '../src/utils/TimeSyncManager.js';

describe('Frontend Concurrency & Sequence Control (BƯỚC 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass sequenceNumber and synchronized timestamp in quizApi.saveAnswer', async () => {
    const timeSync = TimeSyncManager.getInstance();
    timeSync.syncFromTimestamp(1725450000000, 20);

    const recordAnswerSpy = vi
      .spyOn(apiClient.attempts, 'recordAnswer')
      .mockResolvedValue({ success: true, message: 'Saved' } as any);

    const result = await quizApi.saveAnswer({
      sessionId: 'sess_123',
      userId: 'cand_1',
      questionId: 'q1',
      answer: { optionId: 'opt_A' },
      sequenceNumber: 3,
    });

    expect(result.success).toBe(true);
    expect(recordAnswerSpy).toHaveBeenCalledTimes(1);
    expect(recordAnswerSpy).toHaveBeenCalledWith(
      'sess_123',
      'q1',
      expect.objectContaining({
        answer: { optionId: 'opt_A' },
        sequenceNumber: 3,
        clientTimestamp: expect.any(Number),
      })
    );
  });

  it('should simulate Debounced Autosave queue flushing before submit (Edge Case 3 Defense)', async () => {
    const recordAnswerSpy = vi
      .spyOn(apiClient.attempts, 'recordAnswer')
      .mockResolvedValue({ success: true, message: 'Saved' } as any);

    const submitSpy = vi
      .spyOn(apiClient.attempts, 'submit')
      .mockResolvedValue({
        success: true,
        data: {
          scoreResult: {
            score: 10,
            maxScore: 10,
            percentage: 100,
            passed: true,
            breakdown: [],
          },
        },
      } as any);

    // Mô phỏng kịch bản thí sinh click đáp án ở 10:29:59 và bấm "Nộp bài" ngay tức khắc
    // Hàng đợi pending: câu q50 đang chờ debounce
    const pendingAnswers = [
      { questionId: 'q50', answer: 'opt_D', sequenceNumber: 1 },
      { questionId: 'q51', answer: 'opt_B', sequenceNumber: 2 },
    ];

    const callOrder: string[] = [];
    recordAnswerSpy.mockImplementation(async (_sess, qId) => {
      callOrder.push(`save_${qId}`);
      return { success: true } as any;
    });

    submitSpy.mockImplementation(async () => {
      callOrder.push('submit');
      return {
        success: true,
        data: {
          scoreResult: {
            score: 10,
            maxScore: 10,
            percentage: 100,
            passed: true,
            breakdown: [],
          },
        },
      } as any;
    });

    // Client Flusher: Gửi toàn bộ pending trước khi submit
    const flushPromises = pendingAnswers.map((p) =>
      quizApi.saveAnswer({
        sessionId: 'sess_123',
        userId: 'cand_1',
        questionId: p.questionId,
        answer: p.answer,
        sequenceNumber: p.sequenceNumber,
      })
    );

    await Promise.all(flushPromises);
    await quizApi.submitQuiz({
      sessionId: 'sess_123',
      userId: 'cand_1',
    });

    // Xác minh thứ tự: Các yêu cầu lưu câu trả lời BẮT BUỘC phải hoàn tất TRƯỚC lệnh submit
    expect(callOrder).toContain('save_q50');
    expect(callOrder).toContain('save_q51');
    expect(callOrder[callOrder.length - 1]).toBe('submit');
    expect(recordAnswerSpy).toHaveBeenCalledTimes(2);
    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});
