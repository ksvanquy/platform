import { describe, it, expect } from 'vitest';
import { hasPermission, requireRole, requirePermission } from '../../src/presentation/middlewares/rbac.middleware.js';
import type { Request, Response } from 'express';

function createMockReqRes(principal?: any) {
  const req = { principal } as Request;
  let statusCode = 200;
  let jsonResponse: any = null;
  let nextCalled = false;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      jsonResponse = data;
      return this;
    },
  } as unknown as Response;

  const next = () => {
    nextCalled = true;
  };

  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getJson: () => jsonResponse,
    wasNextCalled: () => nextCalled,
  };
}

describe('RBAC Middleware & Permission Resolution', () => {
  describe('hasPermission helper', () => {
    it('should grant everything for wildcard "*"', () => {
      expect(hasPermission(['*'], 'quiz:create')).toBe(true);
      expect(hasPermission(['*'], 'any:arbitrary:permission')).toBe(true);
    });

    it('should grant matching domain wildcard "quiz:*"', () => {
      expect(hasPermission(['quiz:*'], 'quiz:create')).toBe(true);
      expect(hasPermission(['quiz:*'], 'quiz:publish')).toBe(true);
      expect(hasPermission(['quiz:*'], 'attempt:start')).toBe(false);
    });

    it('should match exact permissions', () => {
      expect(hasPermission(['quiz:create', 'quiz:publish'], 'quiz:create')).toBe(true);
      expect(hasPermission(['quiz:create'], 'quiz:publish')).toBe(false);
    });
  });

  describe('requireRole middleware', () => {
    it('should reject unauthenticated request with 401', () => {
      const { req, res, next, getStatus, getJson, wasNextCalled } = createMockReqRes(undefined);
      const middleware = requireRole('INSTRUCTOR');
      middleware(req, res, next);

      expect(wasNextCalled()).toBe(false);
      expect(getStatus()).toBe(401);
      expect(getJson().errorCode).toBe('UNAUTHORIZED');
    });

    it('should reject non-matching role with 403', () => {
      const { req, res, next, getStatus, getJson, wasNextCalled } = createMockReqRes({
        id: 'u1',
        roles: ['STUDENT'],
      });
      const middleware = requireRole('INSTRUCTOR');
      middleware(req, res, next);

      expect(wasNextCalled()).toBe(false);
      expect(getStatus()).toBe(403);
      expect(getJson().errorCode).toBe('FORBIDDEN');
    });

    it('should allow matching role', () => {
      const { req, res, next, wasNextCalled } = createMockReqRes({
        id: 'u2',
        roles: ['INSTRUCTOR'],
      });
      const middleware = requireRole('INSTRUCTOR', 'ADMIN');
      middleware(req, res, next);

      expect(wasNextCalled()).toBe(true);
    });

    it('should allow ADMIN role unconditionally', () => {
      const { req, res, next, wasNextCalled } = createMockReqRes({
        id: 'u3',
        roles: ['ADMIN'],
      });
      const middleware = requireRole('INSTRUCTOR');
      middleware(req, res, next);

      expect(wasNextCalled()).toBe(true);
    });
  });

  describe('requirePermission middleware', () => {
    it('should reject request when missing required permission with 403', () => {
      const { req, res, next, getStatus, getJson, wasNextCalled } = createMockReqRes({
        id: 'u4',
        roles: ['STUDENT'],
        permissions: ['quiz:read', 'attempt:create'],
      });
      const middleware = requirePermission('quiz:create');
      middleware(req, res, next);

      expect(wasNextCalled()).toBe(false);
      expect(getStatus()).toBe(403);
      expect(getJson().errorCode).toBe('FORBIDDEN');
    });

    it('should resolve permissions from roles when permissions array is empty', () => {
      const { req, res, next, wasNextCalled } = createMockReqRes({
        id: 'u5',
        roles: ['INSTRUCTOR'],
        permissions: [],
      });
      const middleware = requirePermission('quiz:create');
      middleware(req, res, next);

      expect(wasNextCalled()).toBe(true);
    });

    it('should allow when all required permissions match', () => {
      const { req, res, next, wasNextCalled } = createMockReqRes({
        id: 'u6',
        roles: ['STUDENT'],
        permissions: ['attempt:create', 'attempt:submit'],
      });
      const middleware = requirePermission('attempt:create', 'attempt:submit');
      middleware(req, res, next);

      expect(wasNextCalled()).toBe(true);
    });
  });
});
