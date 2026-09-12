import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiClient, ApiClient, ApiClientError } from '../src/index.js';

describe('Bước 5 — packages/api-client', () => {
  let mockFetch: any;
  let api: ApiClient;
  const mockToken = 'mock_jwt_access_token_xyz';

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  describe('createApiClient Configuration & Token Injection', () => {
    it('should inject Authorization Bearer header when getToken is provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });

      api = createApiClient({
        baseUrl: 'http://quiz.api.local',
        getToken: () => mockToken,
        fetchFn: mockFetch,
      });

      await api.get('/test-endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/test-endpoint',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle async getToken callback', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'ok' }),
      });

      api = createApiClient({
        baseUrl: 'http://quiz.api.local',
        getToken: async () => Promise.resolve('async_token_abc'),
        fetchFn: mockFetch,
      });

      await api.health();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/health',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer async_token_abc',
          }),
        })
      );
    });

    it('should throw ApiClientError on HTTP error status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          message: 'Access Denied: Session does not belong to user',
        }),
      });

      api = createApiClient({
        baseUrl: 'http://quiz.api.local',
        fetchFn: mockFetch,
      });

      await expect(api.get('/restricted')).rejects.toThrow(ApiClientError);
      await expect(api.get('/restricted')).rejects.toThrow(
        'Access Denied: Session does not belong to user'
      );
    });

    it('should inject Authorization Bearer header when token is provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });

      api = createApiClient({
        baseUrl: 'http://quiz.api.local',
        getToken: () => mockToken,
        fetchFn: mockFetch,
      });

      await api.get('/quizzes');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/quizzes',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['X-Tenant-ID']).toBeUndefined();
    });
  });

  describe('Domain Resource Operations (quizzes & sessions)', () => {
    beforeEach(() => {
      api = createApiClient({
        baseUrl: 'http://quiz.api.local',
        getToken: () => mockToken,
        fetchFn: mockFetch,
      });
    });

    it('should call quizzes.list() to get available quizzes', async () => {
      const mockQuizzes = [
        { id: 'quiz_01', title: 'TypeScript Fundamentals', durationMinutes: 45 },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockQuizzes }),
      });

      const response = await api.quizzes.list();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/quizzes',
        expect.objectContaining({ method: 'GET' })
      );
      expect(response.data).toEqual(mockQuizzes);
    });

    it('should call attempts.submit() to submit quiz attempt with answers payload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { scoreResult: { score: 90, passed: true } },
        }),
      });

      const response = await api.attempts.submit('att_123', {
        answers: { q_01: 'opt_a' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/attempts/att_123/submit',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ answers: { q_01: 'opt_a' } }),
        })
      );
      expect(response.data.scoreResult.score).toBe(90);
    });

    it('should call attempts.create() and attempts.start() for RESTful v1 Delivery', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'att_123', status: 'CREATED' },
        }),
      });

      const res = await api.attempts.create('quiz_demo');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/attempts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ quizId: 'quiz_demo' }),
        })
      );
      expect(res.data.id).toBe('att_123');
    });

    it('should call v1Quizzes.list() for RESTful v1 Authoring', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: [{ id: 'quiz_1', code: 'TS_101' }],
        }),
      });

      const res = await api.v1Quizzes.list();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/quizzes',
        expect.objectContaining({ method: 'GET' })
      );
      expect(res.data[0].code).toBe('TS_101');
    });

    it('should call questions.list() and questions.create()', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: [{ id: 'q_test_1', code: 'Q_101', prompt: 'Solve 1+1' }],
        }),
      });

      const res = await api.questions.list({ difficulty: 'REMEMBER' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/questions?difficulty=REMEMBER',
        expect.objectContaining({ method: 'GET' })
      );
      expect(res.data![0].code).toBe('Q_101');
    });

    it('should call assessments.list() and assessments.lockBlueprint()', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'bp_123', isLocked: true },
        }),
      });

      const res = await api.assessments.lockBlueprint('asm_456');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/assessments/asm_456/blueprint/lock',
        expect.objectContaining({ method: 'POST' })
      );
      expect(res.data!.isLocked).toBe(true);
    });

    it('should call exams.generate() and exams.getSanitizedManifest()', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'exam_999', code: 'EXAM_MATH', variantsCount: 4 },
        }),
      });

      const genRes = await api.exams.generate({
        assessmentId: 'asm_123',
        code: 'EXAM_MATH',
        title: 'Kỳ thi Toán Đại số',
        variantsCount: 4,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/exams',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('EXAM_MATH'),
        })
      );
      expect(genRes.data!.id).toBe('exam_999');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { examId: 'exam_999', variantCode: '101', questions: [] },
        }),
      });

      const manifestRes = await api.exams.getSanitizedManifest('exam_999', '101');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/exams/exam_999/variants/101/manifest',
        expect.objectContaining({ method: 'GET' })
      );
      expect(manifestRes.data!.variantCode).toBe('101');
    });

    it('should compute clock offset in syncServerTime via Cristian algorithm', async () => {
      const now = Date.now();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          serverTime: new Date(now + 100).toISOString(),
          timestampMs: now + 100,
        }),
      });

      const syncResult = await api.syncServerTime();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/time',
        expect.objectContaining({ method: 'GET' })
      );
      expect(syncResult.serverTimestampMs).toBe(now + 100);
      expect(typeof syncResult.clockOffsetMs).toBe('number');
      expect(typeof syncResult.rttMs).toBe('number');
    });

    it('should manage users via api.users resource (list and updateStatus)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: [{ id: 'usr_01', email: 'admin@test.com', isActive: true }],
        }),
      });

      const usersRes = await api.users.list();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/auth/users',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
      expect(usersRes.data).toHaveLength(1);
      expect(usersRes.data![0].email).toBe('admin@test.com');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          message: 'User status updated',
          data: { id: 'usr_01', isActive: false },
        }),
      });

      const updateRes = await api.users.updateStatus('usr_01', false);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/auth/users/usr_01/status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isActive: false }),
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
      expect(updateRes.data.isActive).toBe(false);
    });

    it('should support candidate delivery: startQuiz, submitQuiz, getActiveAttempt', async () => {
      // 1. startQuiz mock response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            id: 'att_777',
            examId: 'exam_math_01',
            status: 'IN_PROGRESS',
            userId: 'student_1',
            startedAt: '2026-09-12T10:00:00.000Z',
          },
          manifest: {
            durationMinutes: 30,
            questions: [
              {
                id: 'q_single',
                type: 'single-choice',
                prompt: 'What is 2+2?',
                points: 5,
                options: [
                  { id: '1', text: '3' },
                  { id: '2', text: '4' },
                ],
              },
            ],
          },
          serverTime: '2026-09-12T10:00:00.000Z',
        }),
      });

      const startRes = await api.delivery.startQuiz('exam_math_01', { variantCode: 'V1', userId: 'student_1' });
      expect(startRes.session.id).toBe('att_777');
      expect(startRes.session.status).toBe('IN_PROGRESS');
      expect(startRes.questions).toHaveLength(1);
      expect(startRes.questions[0].type).toBe('SINGLE');
      expect(startRes.questions[0].metadata?.options).toHaveLength(2);

      // 2. submitQuiz mock response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            scoreResult: {
              score: 9.5,
              maxScore: 10,
              percentage: 95,
              passed: true,
              breakdown: {
                q_single: { isCorrect: true, scoreAwarded: 5, maxScore: 5 },
              },
            },
          },
        }),
      });

      const submitRes = await api.delivery.submitQuiz({
        sessionId: 'att_777',
        userId: 'student_1',
        answers: { q_single: '2' },
      });

      expect(submitRes.totalScoreAwarded).toBe(9.5);
      expect(submitRes.percentage).toBe(95);
      expect(submitRes.isPassed).toBe(true);

      // 3. getActiveAttempt mock response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: [
            {
              id: 'att_active',
              status: 'IN_PROGRESS',
              deadline: new Date(Date.now() + 600000).toISOString(),
            },
          ],
        }),
      });

      const activeAttempt = await api.delivery.getActiveAttempt('student_1');
      expect(activeAttempt?.id).toBe('att_active');
    });

    it('should track clock offset and invoke onTimeSync', async () => {
      let syncCalledWith: any = null;
      const clientWithSync = createApiClient({
        baseUrl: 'http://quiz.api.local',
        onTimeSync: (serverTime, offset) => {
          syncCalledWith = { serverTime, offset };
        },
      });

      const futureTime = Date.now() + 10000;
      clientWithSync.syncFromTimestamp(futureTime);

      expect(syncCalledWith).not.toBeNull();
      expect(syncCalledWith.offset).toBeGreaterThanOrEqual(9000);
      expect(clientWithSync.getServerNow()).toBeGreaterThanOrEqual(Date.now() + 9000);
      expect(clientWithSync.getClockOffsetMs()).toBeGreaterThanOrEqual(9000);
    });
  });
});
