import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quizApi } from '../src/api/quiz-api.js';
import { apiClient } from '../src/api/client.js';

describe('Frontend Single Submission Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should submit quiz with all answers in a single request', async () => {
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

    const answers = {
      q1: 'opt_A',
      q2: { optionId: 'opt_B' },
    };

    const result = await quizApi.submitQuiz({
      sessionId: 'sess_123',
      userId: 'cand_1',
      answers,
    });

    expect(result.totalScoreAwarded).toBe(10);
    expect(result.percentage).toBe(100);
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledWith(
      'sess_123',
      expect.objectContaining({
        answers,
      })
    );
  });
});
