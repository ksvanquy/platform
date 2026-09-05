import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../../infrastructure/token/token.service.js';

/**
 * Middleware bảo vệ các endpoint quản trị người dùng & phân quyền RBAC (P1 Priority).
 * Yêu cầu:
 * 1. Header Authorization: Bearer <accessToken>
 * 2. Token hợp lệ, chưa hết hạn và không bị khóa (isActive !== false)
 * 3. Người gọi phải có vai trò ADMIN hoặc quyền hạn quản trị (ví dụ: '*', 'user:manage', 'auth:manage_users')
 */
export function createRequireAdminAuth(tokenService: TokenService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Admin token required in Authorization header',
      });
      return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing token in Authorization header',
      });
      return;
    }

    const payload = tokenService.verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or expired token',
      });
      return;
    }

    if (payload.isActive === false) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Account is deactivated',
      });
      return;
    }

    const hasAdminRole = Array.isArray(payload.roles) && payload.roles.includes('ADMIN');
    const hasAdminPermission =
      Array.isArray(payload.permissions) &&
      (payload.permissions.includes('*') ||
        payload.permissions.includes('user:manage') ||
        payload.permissions.includes('user:write') ||
        payload.permissions.includes('auth:manage_users'));

    if (!hasAdminRole && !hasAdminPermission) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Insufficient privileges. Admin role required.',
      });
      return;
    }

    (req as any).auth = payload;
    next();
  };
}
