import { describe, it, expect } from 'vitest';
import type { Principal, ResourceOwnershipContext } from '@platform/contracts';
import {
  evaluateResourceOwnership,
  evaluateOwnership,
} from '../src/authorization/abac-ownership.js';
import {
  SYSTEM_ROLES,
  resolvePermissionsForRoles,
  hasPermission,
  hasAnyRole,
} from '../src/authorization/rbac-evaluator.js';

describe('@platform/security - RBAC & ABAC Ownership Engine', () => {
  const mockQuizContext: ResourceOwnershipContext = {
    resourceType: 'quiz',
    resourceId: 'quiz_123',
    ownerId: 'usr_instructor_01',
  };

  describe('1. RBAC Evaluator', () => {
    it('should resolve permissions correctly from system roles', () => {
      const studentPerms = resolvePermissionsForRoles(['STUDENT']);
      expect(studentPerms).toContain('attempt:start');
      expect(studentPerms).toContain('attempt:submit');

      const adminPerms = resolvePermissionsForRoles(['ADMIN']);
      expect(adminPerms).toContain('*');
    });

    it('should match wildcard and specific permissions', () => {
      const adminPrincipal: Principal = { id: 'admin', roles: ['ADMIN'], permissions: ['*'] };
      expect(hasPermission(adminPrincipal, 'quiz:delete')).toBe(true);

      const instructorPrincipal: Principal = {
        id: 'inst',
        roles: ['INSTRUCTOR'],
        permissions: ['quiz:*'],
      };
      expect(hasPermission(instructorPrincipal, 'quiz:publish')).toBe(true);
      expect(hasPermission(instructorPrincipal, 'system:shutdown')).toBe(false);
    });

    it('should check role membership correctly', () => {
      const user: Principal = { id: 'u1', roles: ['INSTRUCTOR', 'TEACHER'] };
      expect(hasAnyRole(user, ['STUDENT', 'INSTRUCTOR'])).toBe(true);
      expect(hasAnyRole(user, ['ADMIN'])).toBe(false);
    });
  });

  describe('2. ABAC Ownership Evaluation', () => {
    it('should deny access if principal lacks required RBAC permission', () => {
      const principal: Principal = {
        id: 'usr_instructor_01',
        roles: ['INSTRUCTOR'],
        permissions: ['quiz:read'],
      };

      const result = evaluateResourceOwnership(principal, mockQuizContext, 'quiz:update');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Missing required permission');
    });

    it('should allow owner with proper permission', () => {
      const principal: Principal = {
        id: 'usr_instructor_01',
        roles: ['INSTRUCTOR'],
        permissions: ['quiz:update'],
      };

      const result = evaluateResourceOwnership(principal, mockQuizContext, 'quiz:update');
      expect(result.allowed).toBe(true);
      expect(result.isOwner).toBe(true);
      expect(result.isAdminBypass).toBe(false);
    });

    it('should deny non-owner without admin bypass', () => {
      const principal: Principal = {
        id: 'usr_instructor_02',
        roles: ['INSTRUCTOR'],
        permissions: ['quiz:update'],
      };

      const result = evaluateResourceOwnership(principal, mockQuizContext, 'quiz:update');
      expect(result.allowed).toBe(false);
      expect(result.isOwner).toBe(false);
      expect(result.reason).toContain('does not own');
    });

    it('should allow ADMIN role bypass even if not owner', () => {
      const principal: Principal = {
        id: 'usr_admin_01',
        roles: ['ADMIN'],
        permissions: ['*'],
      };

      const result = evaluateResourceOwnership(principal, mockQuizContext, 'quiz:update');
      expect(result.allowed).toBe(true);
      expect(result.isOwner).toBe(false);
      expect(result.isAdminBypass).toBe(true);
    });

    it('should allow manage_all permission bypass even if not owner', () => {
      const principal: Principal = {
        id: 'usr_manager_01',
        roles: ['MANAGER'],
        permissions: ['quiz:update', 'quiz:manage_all'],
      };

      const result = evaluateResourceOwnership(
        principal,
        mockQuizContext,
        'quiz:update',
        'quiz:manage_all'
      );
      expect(result.allowed).toBe(true);
      expect(result.isAdminBypass).toBe(true);
    });

    it('should work with evaluateOwnership standard wrapper', () => {
      const ownerPrincipal: Principal = {
        id: 'usr_instructor_01',
        roles: ['INSTRUCTOR'],
        permissions: ['quiz:update'],
      };

      const result = evaluateOwnership(ownerPrincipal, mockQuizContext, 'quiz:update');
      expect(result.allowed).toBe(true);
      expect(result.isOwner).toBe(true);
    });
  });
});
