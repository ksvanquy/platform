import type {
  Principal,
  TenantContext,
  TenantScopedResource,
  OwnedResource,
} from './principal.js';

export interface ResourceOwnershipContext extends OwnedResource {
  resourceType?: 'quiz' | 'attempt' | 'user' | string;
  resourceId?: string;
  ownerId?: string;
  tenantId?: string;
}

export interface OwnershipEvaluationResult {
  allowed: boolean;
  reason?: string;
  isOwner: boolean;
  isAdminBypass: boolean;
}

/**
 * @deprecated In single-tenant architecture, tenant isolation is bypassed and always allowed.
 */
export function evaluateTenantIsolation(
  _tenantContext?: TenantContext,
  _resource?: TenantScopedResource
): boolean {
  return true;
}

/**
 * 2. Đảm bảo người dùng sở hữu tài nguyên hoặc có vai trò quản trị (RBAC Action Clearance + ABAC Ownership Check).
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
 * Hàm đánh giá kết hợp (Composite) hỗ trợ tương thích với các use case hiện có.
 * Có thể truyền tenantContext trực tiếp để kiểm tra Tenant Isolation.
 */
export function evaluateOwnership(
  principal: Principal,
  resource: ResourceOwnershipContext,
  requiredPermission: string,
  manageAllPermission?: string,
  tenantContext?: TenantContext
): OwnershipEvaluationResult {
  // Nếu có tenantContext và resource có tenantId thì kiểm tra Tenant Isolation
  if (tenantContext && resource.tenantId) {
    const isTenantValid = evaluateTenantIsolation(tenantContext, { tenantId: resource.tenantId });
    if (!isTenantValid) {
      return {
        allowed: false,
        reason: 'Cross-tenant access prohibited',
        isOwner: false,
        isAdminBypass: false,
      };
    }
  }

  return evaluateResourceOwnership(
    principal,
    resource,
    requiredPermission,
    manageAllPermission
  );
}

