import type {
  Principal,
  OwnedResource,
} from './principal.js';

export interface ResourceOwnershipContext extends OwnedResource {
  resourceType?: 'quiz' | 'attempt' | 'user' | string;
  resourceId?: string;
  ownerId?: string;
}

export interface OwnershipEvaluationResult {
  allowed: boolean;
  reason?: string;
  isOwner: boolean;
  isAdminBypass: boolean;
}

/**
 * Thẩm định quyền sở hữu tài nguyên hoặc vai trò quản trị (RBAC Action Clearance + ABAC Ownership Check).
 */
export function evaluateResourceOwnership(
  principal: Principal,
  resource: OwnedResource,
  requiredPermission?: string,
  manageAllPermission?: string
): OwnershipEvaluationResult {
  const permissions = principal.permissions || [];

  // A. Kiểm tra RBAC Action Clearance (nếu có requiredPermission)
  if (requiredPermission) {
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
  }

  // B. Kiểm tra Admin Bypass
  const isAdmin =
    principal.roles.includes('ADMIN') ||
    permissions.includes('*') ||
    (manageAllPermission ? permissions.includes(manageAllPermission) : false);

  const resourceOwnerId = resource.ownerId ?? resource.instructorId ?? resource.userId;
  const isOwner = Boolean(resourceOwnerId && resourceOwnerId === principal.id);

  if (isAdmin) {
    return {
      allowed: true,
      reason: undefined,
      isOwner,
      isAdminBypass: true,
    };
  }

  // C. Thẩm định quyền sở hữu tài nguyên (ABAC Ownership)
  if (!isOwner) {
    return {
      allowed: false,
      reason: `Access denied: Principal does not own this resource`,
      isOwner: false,
      isAdminBypass: false,
    };
  }

  return {
    allowed: true,
    isOwner: true,
    isAdminBypass: false,
  };
}

/**
 * Hàm thẩm định quyền sở hữu tiêu chuẩn cho các use cases trong hệ thống Single-Tenant.
 */
export function evaluateOwnership(
  principal: Principal,
  resource: ResourceOwnershipContext,
  requiredPermission: string,
  manageAllPermission?: string
): OwnershipEvaluationResult {
  return evaluateResourceOwnership(
    principal,
    resource,
    requiredPermission,
    manageAllPermission
  );
}

