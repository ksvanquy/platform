import type { Request, Response, NextFunction } from 'express';
import type { Principal } from '@platform/contracts';
import { verifyJwtTokenAsync, verifyJwtTokenSync, mapJwtPayloadToPrincipal } from '../token/jwt-verifier.js';
import { resolvePermissionsForRoles } from '../authorization/rbac-evaluator.js';
import { JwksClient, defaultJwksClient } from '../token/jwks-client.js';

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
      context?: {
        principal?: Principal;
      };
      auth?: unknown;
    }
  }
}

export interface AuthMiddlewareOptions {
  secret?: string;
  publicKey?: string;
  jwksClient?: JwksClient;
  allowPropagatedHeaders?: boolean;
  strictMode?: boolean;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  const jwks = options.jwksClient || defaultJwksClient;
  const allowPropagated = options.strictMode ? (options.allowPropagatedHeaders === true) : (options.allowPropagatedHeaders !== false);

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // 1. Kiểm tra Authorization Header (Bearer Token)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) {
        const payload = await verifyJwtTokenAsync(token, {
          secret: options.secret,
          publicKey: options.publicKey,
          jwksClient: jwks,
        });

        if (payload) {
          const principal = mapJwtPayloadToPrincipal(payload);
          // If permissions array is empty or not resolved, resolve from roles
          if (!principal.permissions || principal.permissions.length === 0) {
            const resolvedPerms = resolvePermissionsForRoles(principal.roles);
            (principal as { permissions: readonly string[] }).permissions = resolvedPerms;
          }

          req.principal = principal;
          req.context = { principal };
          req.auth = payload;
          next();
          return;
        }
      }
    }

    // 2. Kiểm tra Header lan truyền nội bộ từ Gateway (Mesh-Trust Mode)
    if (allowPropagated) {
      // 2a. Hỗ trợ x-principal serialized JSON header
      const xPrincipalHeader = req.headers['x-principal'] as string | undefined;
      if (xPrincipalHeader) {
        try {
          const parsed = typeof xPrincipalHeader === 'string' ? JSON.parse(xPrincipalHeader) : xPrincipalHeader;
          if (parsed && parsed.id) {
            const roles = Array.isArray(parsed.roles) ? parsed.roles : ['STUDENT'];
            let permissions = Array.isArray(parsed.permissions) ? parsed.permissions : [];
            if (permissions.length === 0 && roles.length > 0) {
              permissions = [...resolvePermissionsForRoles(roles)];
            }
            const principal: Principal = {
              id: parsed.id,
              roles,
              permissions,
              metadata: {
                ...parsed.metadata,
                source: 'x_principal_header',
              },
            };
            req.principal = principal;
            req.context = { principal };
            req.auth = principal;
            next();
            return;
          }
        } catch {
          // Ignore parse errors, continue to individual headers
        }
      }

      // 2b. Hỗ trợ individual x-user-id / x-user-roles headers
      const userId = (req.headers['x-user-id'] as string) || (req.headers['x-principal-id'] as string);
      if (userId) {
        const rawRoles =
          (req.headers['x-user-roles'] as string) ||
          (req.headers['x-principal-roles'] as string) ||
          (req.headers['x-user-role'] as string) ||
          (req.headers['x-roles'] as string) ||
          (req.headers['x-role'] as string);
        const rawPermissions =
          (req.headers['x-user-permissions'] as string) || (req.headers['x-principal-permissions'] as string);

        const roles: string[] = rawRoles
          ? rawRoles.split(',').map((r) => r.trim().toUpperCase()).filter(Boolean)
          : ['STUDENT'];
        let permissions: string[] = rawPermissions
          ? rawPermissions.split(',').map((p) => p.trim()).filter(Boolean)
          : [];

        if (permissions.length === 0 && roles.length > 0) {
          permissions = [...resolvePermissionsForRoles(roles)];
        }

        const principal: Principal = {
          id: userId,
          roles,
          permissions,
          metadata: {
            source: 'propagated_headers',
          },
        };

        req.principal = principal;
        req.context = { principal };
        req.auth = principal;
        next();
        return;
      }
    }

    // Request unauthenticated (principal remains undefined)
    req.principal = undefined;
    if (req.context) req.context.principal = undefined;
    next();
  };
}

// Default export for drop-in replacement across microservices (Mesh-Trust Mode)
export const authContextMiddleware = createAuthMiddleware({
  allowPropagatedHeaders: true,
  strictMode: false,
});

// Strict Zero-Trust export for Edge Gateway and public boundary routes
export const strictAuthMiddleware = createAuthMiddleware({
  allowPropagatedHeaders: false,
  strictMode: true,
});
