import { describe, it, expect } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createAuthMiddleware,
  requireAuth,
  requireRole,
  requirePermission,
  requireAdmin,
} from '../src/index.js';

function createMockReqRes(headers: Record<string, string> = {}) {
  const req = {
    headers: { ...headers },
  } as unknown as Request;

  let statusCode = 200;
  let jsonBody: unknown = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      jsonBody = body;
      return this;
    },
  } as unknown as Response;

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getJsonBody: () => jsonBody,
  };
}

describe('@platform/security - Express Middlewares & Guards', () => {
  describe('authContextMiddleware (Propagated Mesh Mode)', () => {
    it('should extract principal from propagated internal headers', async () => {
      const authMiddleware = createAuthMiddleware({ allowPropagatedHeaders: true });
      const { req, res } = createMockReqRes({
        'x-user-id': 'usr_student_99',
        'x-user-roles': 'STUDENT',
        'x-user-permissions': 'quiz:read,attempt:start',
      });

      let nextCalled = false;
      await authMiddleware(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.principal).toBeDefined();
      expect(req.principal?.id).toBe('usr_student_99');
      expect(req.principal?.roles).toContain('STUDENT');
      expect(req.principal?.permissions).toContain('quiz:read');
    });
  });

  describe('Guards (requireAuth, requireRole, requirePermission, requireAdmin)', () => {
    it('should reject unauthenticated request in requireAuth', () => {
      const { req, res, getStatusCode, getJsonBody } = createMockReqRes();
      let nextCalled = false;

      requireAuth(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(getStatusCode()).toBe(401);
      expect(getJsonBody()).toEqual({ success: false, error: 'Unauthorized: Authentication required' });
    });

    it('should pass authenticated request in requireAuth', () => {
      const { req, res } = createMockReqRes();
      req.principal = { id: 'usr_1', roles: ['STUDENT'] };
      let nextCalled = false;

      requireAuth(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });

    it('should enforce role check in requireRole', () => {
      const { req, res, getStatusCode } = createMockReqRes();
      req.principal = { id: 'usr_1', roles: ['STUDENT'] };
      let nextCalled = false;

      const instructorGuard = requireRole('INSTRUCTOR', 'ADMIN');
      instructorGuard(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(getStatusCode()).toBe(403);
    });

    it('should enforce permission check in requirePermission', () => {
      const { req, res } = createMockReqRes();
      req.principal = { id: 'usr_1', roles: ['INSTRUCTOR'], permissions: ['quiz:create', 'quiz:publish'] };
      let nextCalled = false;

      const publishGuard = requirePermission('quiz:publish');
      publishGuard(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });

    it('should allow admin in requireAdmin', () => {
      const { req, res } = createMockReqRes();
      req.principal = { id: 'usr_admin', roles: ['ADMIN'], permissions: ['*'] };
      let nextCalled = false;

      requireAdmin(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });
  });
});
