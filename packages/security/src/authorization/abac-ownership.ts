import type {
  Principal,
  OwnedResource,
  ResourceOwnershipContext,
  OwnershipEvaluationResult,
} from '@platform/contracts';
import { hasPermission } from './rbac-evaluator.js';

export interface OwnershipOptions {
  requiredPermission?: string;
  manageAllPermission?: string;
  allowAdminBypass?: boolean;
}

/**
 * Thẩm định quyền sở hữu tài nguyên hoặc vai trò quản trị (RBAC Action Clearance + ABAC Ownership Check).
 * Đây là Pure Function không phụ thuộc Database hay IO.
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
    const hasActionPerm = hasPermission(principal, requiredPermission);
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
 * Helper tương thích chuẩn cho các use-case trong hệ thống
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
