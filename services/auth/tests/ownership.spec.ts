import { describe, it, expect } from 'vitest';
import {
  evaluateOwnership,
  evaluateResourceOwnership,
  ResourceOwnershipContext,
  Principal,
} from '@platform/contracts';

describe('Contracts & Ownership Evaluation (Single-Tenant ABAC Ownership + RBAC Clearance)', () => {
  const mockQuizContext: ResourceOwnershipContext = {
    resourceType: 'quiz',
    resourceId: 'quiz_123',
    ownerId: 'usr_instructor_01',
  };

  describe('1. evaluateResourceOwnership (ABAC Ownership + RBAC Clearance)', () => {
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

    it('should allow wildcard permission (*) bypass even if not owner', () => {
      const principal: Principal = {
        id: 'usr_super_01',
        roles: ['SUPERUSER'],
        permissions: ['*'],
      };

      const result = evaluateResourceOwnership(principal, mockQuizContext, 'quiz:update');
      expect(result.allowed).toBe(true);
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
  });

  describe('2. evaluateOwnership (Standard Helper)', () => {
    it('should evaluate resource ownership cleanly without tenant checks', () => {
      const ownerPrincipal: Principal = {
        id: 'usr_instructor_01',
        roles: ['INSTRUCTOR'],
        permissions: ['quiz:update'],
      };

      const ownerResult = evaluateOwnership(
        ownerPrincipal,
        mockQuizContext,
        'quiz:update'
      );
      expect(ownerResult.allowed).toBe(true);
      expect(ownerResult.isOwner).toBe(true);

      const nonOwnerPrincipal: Principal = {
        id: 'usr_instructor_other',
        roles: ['INSTRUCTOR'],
        permissions: ['quiz:update'],
      };

      const nonOwnerResult = evaluateOwnership(
        nonOwnerPrincipal,
        mockQuizContext,
        'quiz:update'
      );
      expect(nonOwnerResult.allowed).toBe(false);
      expect(nonOwnerResult.isOwner).toBe(false);
    });
  });
});

