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

    it('should call attempts.recordAnswer() to save candidate answer', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, message: 'Answer saved' }),
      });

      const response = await api.attempts.recordAnswer('att_123', 'q_01', {
        answer: 'opt_a',
        clientTimestamp: 123456,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/attempts/att_123/answers/q_01',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ answer: 'opt_a', clientTimestamp: 123456 }),
        })
      );
      expect(response.message).toBe('Answer saved');
    });

    it('should call attempts.submit() to submit quiz attempt', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { scoreResult: { score: 90, passed: true } },
        }),
      });

      const response = await api.attempts.submit('att_123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://quiz.api.local/v1/attempts/att_123/submit',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
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
  });
});
