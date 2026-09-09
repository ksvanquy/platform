import { Request, Response, NextFunction } from 'express';
import { resolvePermissionsForRoles } from '@platform/contracts';

/**
 * Kiểm tra xem tập quyền của người dùng có chứa quyền yêu cầu hay không.
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
      const prefix = p.slice(0, -1);
      return requiredPermission.startsWith(prefix);
    }
    return false;
  });
}

/**
 * Middleware yêu cầu người dùng phải sở hữu ít nhất một trong các vai trò được chỉ định.
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
      (role: any) => allowedRoles.includes(role) || role === 'ADMIN'
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
 * Middleware kiểm tra quyền hạn chi tiết (Fine-grained Permission Check).
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

    const effectivePermissions = principal.permissions?.length
      ? principal.permissions
      : resolvePermissionsForRoles(principal.roles);

    const hasAll = requiredPermissions.every((reqPerm) =>
      hasPermission(effectivePermissions, reqPerm)
    );

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
