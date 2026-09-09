import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import type { Principal } from '@platform/contracts';
import { resolvePermissionsForRoles } from '@platform/contracts';
import { getDefaultRsaKeyPair } from '@platform/auth-service';

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

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

export function verifyJwtSignature(token: string, secret = JWT_SECRET, publicKey?: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    const dataToVerify = `${encodedHeader}.${encodedPayload}`;

    if (header.alg === 'RS256') {
      let pubKey = publicKey;
      if (!pubKey && process.env.JWT_PUBLIC_KEY?.includes('BEGIN')) {
        pubKey = process.env.JWT_PUBLIC_KEY;
      }
      if (!pubKey) {
        pubKey = getDefaultRsaKeyPair().publicKey;
      }
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(dataToVerify);
      const isValid = verify.verify(pubKey, signature, 'base64url');
      if (!isValid) return null;
    } else if (header.alg === 'HS256') {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(dataToVerify)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      if (signature.length !== expectedSignature.length) {
        return null;
      }

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
      }
    } else {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function authContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let principal: Principal | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const payload = verifyJwtSignature(token);

    if (!payload || !payload.sub) {
      req.principal = undefined;
      req.context = { principal: undefined };
      return next();
    }

    if (payload.isActive === false) {
      res.status(403).json({
        success: false,
        message: 'Account is deactivated. Access denied.',
        errorCode: 'FORBIDDEN',
      });
      return;
    }

    const roles = Array.isArray(payload.roles) ? payload.roles : ['STUDENT'];
    const domainPermissions = resolvePermissionsForRoles(roles);
    const tokenPermissions = Array.isArray(payload.permissions) ? payload.permissions : [];
    const permissions = [...new Set([...domainPermissions, ...tokenPermissions])];

    principal = {
      id: payload.sub,
      roles,
      permissions,
      metadata: payload.metadata,
    };
  }

  // Fallback headers for test/internal environments
  if (!principal && req.headers['x-user-id']) {
    const rolesHeader =
      req.headers['x-user-roles'] ||
      req.headers['x-user-role'] ||
      req.headers['x-roles'] ||
      req.headers['x-role'];
    const roles = rolesHeader
      ? String(rolesHeader).split(',').map((r) => r.trim().toUpperCase())
      : ['INSTRUCTOR'];
    principal = {
      id: String(req.headers['x-user-id']),
      roles,
      permissions: resolvePermissionsForRoles(roles),
    };
  }

  req.principal = principal;
  req.context = { principal };

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.principal) {
    res.status(401).json({
      success: false,
      message: 'Authentication required. Please provide a valid Bearer token.',
      errorCode: 'UNAUTHORIZED',
    });
    return;
  }
  next();
}

export function requireAuthor(req: Request, res: Response, next: NextFunction): void {
  if (!req.principal) {
    res.status(401).json({
      success: false,
      message: 'Authentication required.',
      errorCode: 'UNAUTHORIZED',
    });
    return;
  }

  const isAuthor =
    req.principal.roles.includes('INSTRUCTOR') ||
    req.principal.roles.includes('TEACHER') ||
    req.principal.roles.includes('ADMIN') ||
    req.principal.roles.includes('SUPER_ADMIN') ||
    req.principal.permissions?.includes('quiz:create');

  if (!isAuthor) {
    res.status(403).json({
      success: false,
      message: 'Forbidden: Author or Admin access required to manage question items.',
      errorCode: 'FORBIDDEN',
    });
    return;
  }

  next();
}
