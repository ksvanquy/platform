import { describe, it, expect } from 'vitest';
import {
  evaluateOwnership,
  ResourceOwnershipContext,
  Principal,
} from '@platform/contracts';

describe('Contracts & Ownership Evaluation (RBAC + ABAC Lightweight)', () => {
  const mockQuizContext: ResourceOwnershipContext = {
    resourceType: 'quiz',
    resourceId: 'quiz_123',
    ownerId: 'usr_instructor_01',
    tenantId: 'tenant_default',
  };

  it('should deny access if tenant isolation fails (cross-tenant)', () => {
    const principal: Principal = {
      id: 'usr_instructor_01',
      roles: ['INSTRUCTOR'],
      permissions: ['quiz:update'],
      tenantId: 'tenant_other',
    };

    const result = evaluateOwnership(principal, mockQuizContext, 'quiz:update');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Cross-tenant access prohibited');
  });

  it('should deny access if principal lacks required RBAC permission', () => {
    const principal: Principal = {
      id: 'usr_instructor_01',
      roles: ['INSTRUCTOR'],
      permissions: ['quiz:read'],
      tenantId: 'tenant_default',
    };

    const result = evaluateOwnership(principal, mockQuizContext, 'quiz:update');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Missing required permission');
  });

  it('should allow owner with proper permission', () => {
    const principal: Principal = {
      id: 'usr_instructor_01',
      roles: ['INSTRUCTOR'],
      permissions: ['quiz:update'],
      tenantId: 'tenant_default',
    };

    const result = evaluateOwnership(principal, mockQuizContext, 'quiz:update');
    expect(result.allowed).toBe(true);
    expect(result.isOwner).toBe(true);
    expect(result.isAdminBypass).toBe(false);
  });

  it('should deny non-owner without admin bypass', () => {
    const principal: Principal = {
      id: 'usr_instructor_02',
      roles: ['INSTRUCTOR'],
      permissions: ['quiz:update'],
      tenantId: 'tenant_default',
    };

    const result = evaluateOwnership(principal, mockQuizContext, 'quiz:update');
    expect(result.allowed).toBe(false);
    expect(result.isOwner).toBe(false);
    expect(result.reason).toContain('does not own');
  });

  it('should allow ADMIN role bypass even if not owner', () => {
    const principal: Principal = {
      id: 'usr_admin_01',
      roles: ['ADMIN'],
      permissions: ['*'],
      tenantId: 'tenant_default',
    };

    const result = evaluateOwnership(principal, mockQuizContext, 'quiz:update');
    expect(result.allowed).toBe(true);
    expect(result.isOwner).toBe(false);
    expect(result.isAdminBypass).toBe(true);
  });

  it('should allow wildcard permission (*) bypass even if not owner', () => {
    const principal: Principal = {
      id: 'usr_super_01',
      roles: ['SUPERUSER'],
      permissions: ['*'],
      tenantId: 'tenant_default',
    };

    const result = evaluateOwnership(principal, mockQuizContext, 'quiz:update');
    expect(result.allowed).toBe(true);
    expect(result.isAdminBypass).toBe(true);
  });

  it('should allow manage_all permission bypass even if not owner', () => {
    const principal: Principal = {
      id: 'usr_manager_01',
      roles: ['MANAGER'],
      permissions: ['quiz:update', 'quiz:manage_all'],
      tenantId: 'tenant_default',
    };

    const result = evaluateOwnership(
      principal,
      mockQuizContext,
      'quiz:update',
      'quiz:manage_all'
    );
    expect(result.allowed).toBe(true);
    expect(result.isAdminBypass).toBe(true);
  });
});
