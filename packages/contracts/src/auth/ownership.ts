import type { Principal } from './principal.js';

export interface ResourceOwnershipContext {
  resourceType: 'quiz' | 'attempt' | 'user';
  resourceId: string;
  ownerId: string;
  tenantId: string;
}

export interface OwnershipEvaluationResult {
  allowed: boolean;
  reason?: string;
  isOwner: boolean;
  isAdminBypass: boolean;
}

export function evaluateOwnership(
  principal: Principal,
  resource: ResourceOwnershipContext,
  requiredPermission: string,
  manageAllPermission?: string
): OwnershipEvaluationResult {
  // 1. Kiểm tra Tenant Isolation
  if (principal.tenantId && resource.tenantId && principal.tenantId !== resource.tenantId) {
    return {
      allowed: false,
      reason: 'Cross-tenant access prohibited',
      isOwner: false,
      isAdminBypass: false,
    };
  }

  const permissions = principal.permissions || [];

  // 2. Kiểm tra RBAC Action Clearance
  const hasActionPerm =
    permissions.includes('*') ||
    permissions.includes(requiredPermission) ||
    (requiredPermission === 'quiz:update' && permissions.includes('quiz:write')) ||
    permissions.some((p) => {
      if (p.endsWith(':*')) {
        return requiredPermission.startsWith(p.slice(0, -1));
      }
      return false;
    });
  if (!hasActionPerm) {
    return {
      allowed: false,
      reason: `Missing required permission: ${requiredPermission}`,
      isOwner: false,
      isAdminBypass: false,
    };
  }

  // 3. Kiểm tra Admin Bypass
  const isAdmin =
    principal.roles.includes('ADMIN') ||
    permissions.includes('*') ||
    (manageAllPermission ? permissions.includes(manageAllPermission) : false);

  if (isAdmin) {
    return { allowed: true, isOwner: resource.ownerId === principal.id, isAdminBypass: true };
  }

  // 4. Thẩm định quyền sở hữu tài nguyên (ABAC Ownership)
  const isOwner = resource.ownerId === principal.id;
  if (!isOwner) {
    return {
      allowed: false,
      reason: `Access denied: Principal does not own this ${resource.resourceType}`,
      isOwner: false,
      isAdminBypass: false,
    };
  }

  return { allowed: true, isOwner: true, isAdminBypass: false };
}
