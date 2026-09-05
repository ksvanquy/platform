import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Principal } from '@platform/contracts';
import { TokenService } from '@platform/auth-service';
import { QuizContext } from '../../src/domain/context/quiz-context.js';
import {
  StartAttemptUseCase,
  SaveAnswerUseCase,
  SubmitQuizUseCase,
} from '../../src/application/use-cases/quiz.use-cases.js';
import { authContextMiddleware } from '../../src/presentation/middlewares/auth.middleware.js';
import { setupTestQuizDb, TestQuizDbContext } from '../helpers/test-db.helper.js';

describe('Bước 3 — Quiz Service nhận Principal từ Authentication Context', () => {
  let testCtx: TestQuizDbContext;
  let startAttempt: StartAttemptUseCase;
  let saveAnswerUseCase: SaveAnswerUseCase;
  let submitQuizUseCase: SubmitQuizUseCase;

  const mockPrincipal: Principal = {
    id: 'usr_student_01',
    roles: ['STUDENT'],
  };

  const maliciousPrincipal: Principal = {
    id: 'usr_hacker_99',
    roles: ['STUDENT'],
  };

  beforeEach(async () => {
    testCtx = await setupTestQuizDb();
    startAttempt = new StartAttemptUseCase(testCtx.legacyRepo);
    saveAnswerUseCase = new SaveAnswerUseCase(testCtx.legacyRepo);
    submitQuizUseCase = new SubmitQuizUseCase(testCtx.legacyRepo);
  });

  afterEach(async () => {
    await testCtx?.cleanup();
  });

  describe('1. QuizContext Typing & Principal Acceptance', () => {
    it('should correctly define QuizContext adhering to @platform/contracts', () => {
      const context: QuizContext = {
        principal: mockPrincipal,
      };

      expect(context.principal.id).toBe('usr_student_01');
      expect(context.principal.roles).toContain('STUDENT');
    });

    it('should start attempt using principal instead of frontend-supplied userId', async () => {
      // ✅ startAttempt({ principal, quizId })
      const result = await startAttempt.execute({
        principal: mockPrincipal,
        quizId: 'quiz_demo',
      });

      expect(result.session).toBeDefined();
      expect(result.session.userId).toBe(mockPrincipal.id);
      expect(result.session.status).toBe('IN_PROGRESS');
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it('should reject start attempt if principal or userId is missing', async () => {
      await expect(
        startAttempt.execute({
          principal: undefined as any,
          quizId: 'quiz_demo',
        })
      ).rejects.toThrow('Principal or userId is required to start a quiz attempt.');
    });
  });

  describe('2. IDOR Prevention via Principal Ownership Guard', () => {
    it('should allow valid user with matching principal to save answers', async () => {
      const { session } = await startAttempt.execute({
        principal: mockPrincipal,
        quizId: 'quiz_demo',
      });

      await expect(
        saveAnswerUseCase.execute({
          sessionId: session.id,
          principal: mockPrincipal,
          questionId: 'q1',
          answer: 'opt_1',
        })
      ).resolves.not.toThrow();
    });

    it('should block unauthorized user with different principal from tampering session (anti-IDOR)', async () => {
      // Session created by mockPrincipal
      const { session } = await startAttempt.execute({
        principal: mockPrincipal,
        quizId: 'quiz_demo',
      });

      // Tampering attempt by maliciousPrincipal
      await expect(
        saveAnswerUseCase.execute({
          sessionId: session.id,
          principal: maliciousPrincipal,
          questionId: 'q1',
          answer: 'opt_2',
        })
      ).rejects.toThrow(/Forbidden: You do not have permission/);
    });

    it('should block unauthorized user with different principal from submitting session', async () => {
      const { session } = await startAttempt.execute({
        principal: mockPrincipal,
        quizId: 'quiz_demo',
      });

      await expect(
        submitQuizUseCase.execute({
          sessionId: session.id,
          principal: maliciousPrincipal,
        })
      ).rejects.toThrow(/Forbidden: You do not have permission/);
    });
  });

  describe('3. AuthContext Middleware Request Enrichment', () => {
    it('should extract and set req.principal from standard signed Bearer JWT', () => {
      const tokenService = new TokenService();
      const { accessToken } = tokenService.generateTokens({
        sub: 'usr_student_02',
        roles: ['STUDENT'],
        tenantId: 'tenant_academy',
      });

      const mockReq: any = {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      };
      const mockRes: any = {};
      let nextCalled = false;

      authContextMiddleware(mockReq, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(mockReq.principal).toBeDefined();
      expect(mockReq.principal.id).toBe('usr_student_02');
      expect(mockReq.principal.roles).toEqual(['STUDENT']);
      expect(mockReq.context.principal).toEqual(mockReq.principal);
    });

    it('should reject tampered JWT with 401 Unauthorized', () => {
      const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfaGFja2VyIn0.invalid_tampered_signature';
      let statusCode = 0;
      let jsonBody: any = null;

      const mockReq: any = {
        headers: {
          authorization: `Bearer ${fakeJwt}`,
        },
      };
      const mockRes: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: any) => {
              jsonBody = body;
            },
          };
        },
      };
      let nextCalled = false;

      authContextMiddleware(mockReq, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(401);
      expect(jsonBody.errorCode).toBe('UNAUTHORIZED');
    });

    it('should fallback to x-user-id header when Bearer token is absent', () => {
      const mockReq: any = {
        headers: {
          'x-user-id': 'usr_instructor_99',
          'x-tenant-id': 'tenant_special',
        },
      };
      const mockRes: any = {};

      authContextMiddleware(mockReq, mockRes, () => {});

      expect(mockReq.principal.id).toBe('usr_instructor_99');
    });
  });
});
