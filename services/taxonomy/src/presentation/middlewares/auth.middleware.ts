import { Request, Response, NextFunction } from 'express';
import type { Principal } from '@platform/contracts';
import {
  authContextMiddleware as securityAuthContextMiddleware,
  requireAuth as securityRequireAuth,
  verifyJwtTokenSync,
} from '@platform/security';

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
      context?: {
        principal?: Principal;
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-quiz-platform-secret-key-32-chars-min';

export function verifyJwtSignature(token: string, secret = JWT_SECRET, publicKey?: string): any {
  return verifyJwtTokenSync(token, { secret, publicKey });
}

export async function authContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await securityAuthContextMiddleware(req, res, () => {
    const payload = req.auth as any;
    if (payload && payload.isActive === false) {
      res.status(403).json({
        success: false,
        message: 'Account is deactivated. Access denied.',
        errorCode: 'FORBIDDEN',
      });
      return;
    }
    next();
  });
}

export const requireAuth = securityRequireAuth;

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.principal) {
    res.status(401).json({
      success: false,
      message: 'Authentication required. Please provide a valid Bearer token.',
      errorCode: 'UNAUTHORIZED',
    });
    return;
  }

  const isAdmin =
    req.principal.roles.includes('ADMIN') ||
    req.principal.roles.includes('SUPER_ADMIN') ||
    req.principal.permissions?.includes('admin:manage_users') ||
    req.principal.permissions?.includes('quiz:create') ||
    req.principal.permissions?.includes('*');

  if (!isAdmin) {
    res.status(403).json({
      success: false,
      message: 'Forbidden: Admin access required for managing taxonomies and catalog nodes.',
      errorCode: 'FORBIDDEN',
    });
    return;
  }

  next();
}

