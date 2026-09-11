import { Request, Response, NextFunction } from 'express';
import type { Principal } from '@platform/contracts';
import {
  authContextMiddleware as securityAuthContextMiddleware,
  createAuthMiddleware,
  requireAuth as securityRequireAuth,
  verifyJwtTokenSync,
  verifyJwtTokenAsync,
  defaultJwksClient,
  resolvePermissionsForRoles,
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

type UserActiveChecker = (userId: string) => Promise<boolean> | boolean;
let globalUserActiveChecker: UserActiveChecker | null = null;

export function setUserActiveChecker(checker: UserActiveChecker | null): void {
  globalUserActiveChecker = checker;
}

/**
 * Gateway Auth Context Middleware leveraging @platform/security SDK.
 * Parses Bearer JWT, validates signature via JWKS/RS256/HS256, checks account status,
 * and sets downstream mesh propagation headers (x-user-id, x-user-roles, x-user-permissions).
 */
export async function authContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await securityAuthContextMiddleware(req, res, async () => {
    // Check if account was marked deactivated in token claim
    const payload = req.auth as any;
    if (payload && payload.isActive === false) {
      res.status(403).json({
        success: false,
        message: 'Account is deactivated. Access denied.',
        errorCode: 'FORBIDDEN',
      });
      return;
    }

    // Real-time active status checker
    if (req.principal?.id && globalUserActiveChecker) {
      try {
        const isActive = await globalUserActiveChecker(req.principal.id);
        if (!isActive) {
          res.status(403).json({
            success: false,
            message: 'Account is deactivated. Access denied.',
            errorCode: 'FORBIDDEN',
          });
          return;
        }
      } catch {
        // ignore checker error
      }
    }

    // Downstream Header Propagation (Mesh-Trust Header Injection)
    if (req.principal) {
      req.headers['x-user-id'] = req.principal.id;
      req.headers['x-user-roles'] = req.principal.roles.join(',');
      if (req.principal.permissions?.length) {
        req.headers['x-user-permissions'] = req.principal.permissions.join(',');
      }
      req.headers['x-principal'] = JSON.stringify(req.principal);
    }

    next();
  });
}

export const requireAuth = securityRequireAuth;

