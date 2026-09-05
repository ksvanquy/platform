import { Request, Response, NextFunction } from 'express';
import { resolvePermissionsForRoles } from '@platform/contracts';

/**
 * Kiểm tra xem tập quyền của người dùng có chứa quyền yêu cầu hay không.
 * Hỗ trợ:
 * - Full admin wildcard: '*'
 * - Domain wildcard: e.g. 'quiz:*' cho phép 'quiz:read', 'quiz:write'
 * - Khớp chính xác: 'quiz:write' === 'quiz:write'
 */
export function hasPermission(userPermissions: readonly string[], requiredPermission: string): boolean {
  if (userPermissions.includes('*')) {
    return true;
  }
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }
  return userPermissions.some((p) => {
    if (p.endsWith(':*')) {
      const prefix = p.slice(0, -1); // e.g. 'quiz:'
      return requiredPermission.startsWith(prefix);
    }
    return false;
  });
}

/**
 * Middleware yêu cầu người dùng phải sở hữu ít nhất một trong các vai trò được chỉ định.
 * Quản trị viên (ADMIN) mặc định có quyền vượt qua kiểm tra này.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid Bearer token.',
        errorCode: 'UNAUTHORIZED',
      });
      return;
    }

    const userRoles = principal.roles || [];
    const hasAllowedRole = userRoles.some(
      (role) => allowedRoles.includes(role) || role === 'ADMIN'
    );

    if (!hasAllowedRole) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Required role [${allowedRoles.join(', ')}]. Current roles: [${userRoles.join(', ')}]`,
        errorCode: 'FORBIDDEN',
      });
      return;
    }

    next();
  };
}

/**
 * Middleware yêu cầu người dùng phải sở hữu toàn bộ các quyền hạn (permissions) được chỉ định.
 * Tự động tính toán permissions từ SYSTEM_ROLES nếu principal chưa có permissions trực tiếp.
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid Bearer token.',
        errorCode: 'UNAUTHORIZED',
      });
      return;
    }

    const rolePermissions = resolvePermissionsForRoles(principal.roles || []);
    const directPermissions = principal.permissions || [];
    const userPermissions = [...new Set([...rolePermissions, ...directPermissions])];

    const hasAll = requiredPermissions.every((perm) => hasPermission(userPermissions, perm));

    if (!hasAll) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Missing required permissions [${requiredPermissions.join(', ')}]`,
        errorCode: 'FORBIDDEN',
      });
      return;
    }

    next();
  };
}
