import { describe, it, expect } from 'vitest';
import {
  evaluateOwnership,
  evaluateTenantIsolation,
  evaluateResourceOwnership,
  ResourceOwnershipContext,
  Principal,
  TenantContext,
} from '@platform/contracts';

describe('Contracts & Ownership Evaluation (Clean Zero-Tenant Principal + Decoupled Tenancy)', () => {
  const mockQuizContext: ResourceOwnershipContext = {
    resourceType: 'quiz',
    resourceId: 'quiz_123',
    ownerId: 'usr_instructor_01',
    tenantId: 'tenant_default',
  };

  describe('1. evaluateTenantIsolation (Ngữ Cảnh Tổ Chức Độc Lập)', () => {
    it('should allow access when tenantContext matches resource.tenantId', () => {
      const tenantContext: TenantContext = { tenantId: 'tenant_default' };
      const isAllowed = evaluateTenantIsolation(tenantContext, { tenantId: 'tenant_default' });
      expect(isAllowed).toBe(true);
    });

    it('should deny access when tenantContext does not match resource.tenantId (Cross-Tenant)', () => {
      const tenantContext: TenantContext = { tenantId: 'tenant_other' };
      const isAllowed = evaluateTenantIsolation(tenantContext, { tenantId: 'tenant_default' });
      expect(isAllowed).toBe(false);
    });
  });

  describe('2. evaluateResourceOwnership (ABAC Ownership + RBAC Clearance)', () => {
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

  describe('3. evaluateOwnership (Composite Helper)', () => {
    it('should evaluate with tenantContext and enforce tenant isolation', () => {
      const principal: Principal = {
        id: 'usr_instructor_01',
        roles: ['INSTRUCTOR'],
        permissions: ['quiz:update'],
      };

      // Wrong tenant
      const badTenantResult = evaluateOwnership(
        principal,
        mockQuizContext,
        'quiz:update',
        undefined,
        { tenantId: 'tenant_other' }
      );
      expect(badTenantResult.allowed).toBe(false);
      expect(badTenantResult.reason).toContain('Cross-tenant access prohibited');

      // Correct tenant
      const goodTenantResult = evaluateOwnership(
        principal,
        mockQuizContext,
        'quiz:update',
        undefined,
        { tenantId: 'tenant_default' }
      );
      expect(goodTenantResult.allowed).toBe(true);
      expect(goodTenantResult.isOwner).toBe(true);
    });
  });
});
