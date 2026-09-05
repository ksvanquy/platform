import { Router, Request, Response } from 'express';
import { LoginUseCase } from '../../application/login/login.use-case.js';
import { RegisterUseCase } from '../../application/register/register.use-case.js';
import { GetProfileUseCase } from '../../application/profile/get-profile.use-case.js';
import { RefreshUseCase } from '../../application/refresh/refresh.use-case.js';
import { LogoutUseCase } from '../../application/logout/logout.use-case.js';
import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { TokenService } from '../../infrastructure/token/token.service.js';
import { LoginRateLimiter, defaultLoginRateLimiter } from '../middlewares/rate-limit.middleware.js';

function getRefreshTokenFromCookie(req: Request): string | undefined {
  if ((req as any).cookies?.refreshToken) {
    return (req as any).cookies.refreshToken;
  }
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('refreshToken='));
  if (!match) return undefined;
  return decodeURIComponent(match.split('=')[1]);
}

function setRefreshTokenCookie(req: Request, res: Response, token: string): void {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  const cookieParts = [
    `refreshToken=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/v1/auth',
    'SameSite=Lax',
    'Max-Age=604800', // 7 days
  ];
  if (isSecure) {
    cookieParts.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function clearRefreshTokenCookie(req: Request, res: Response): void {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  const cookieParts = [
    'refreshToken=',
    'HttpOnly',
    'Path=/v1/auth',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecure) {
    cookieParts.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

export function createAuthRouter(
  userRepository: IUserRepository,
  tokenService: TokenService,
  rateLimiter: LoginRateLimiter = defaultLoginRateLimiter
): Router {
  const router = Router();
  const registerUseCase = new RegisterUseCase(userRepository, tokenService);
  const loginUseCase = new LoginUseCase(userRepository, tokenService);
  const getProfileUseCase = new GetProfileUseCase(userRepository);
  const refreshUseCase = new RefreshUseCase(userRepository, tokenService);
  const logoutUseCase = new LogoutUseCase(tokenService);

  // POST /v1/auth/register
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { email, name, password, metadata } = req.body || {};
      const result = await registerUseCase.execute({ email, name, password, metadata });
      setRefreshTokenCookie(req, res, result.tokens.refreshToken);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  });

  // POST /v1/auth/login (Rate Limiting: max 5 failed attempts per 15 minutes)
  router.post('/login', rateLimiter.middleware(), async (req: Request, res: Response) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : (req.ip || req.socket.remoteAddress || 'unknown-ip');

    try {
      const { email, password } = req.body || {};
      const result = await loginUseCase.execute({ email, password });
      rateLimiter.recordSuccess(ip);
      setRefreshTokenCookie(req, res, result.tokens.refreshToken);
      res.json({
        success: true,
        data: result,
      });
    } catch (err: unknown) {
      const lockStatus = rateLimiter.recordFailure(ip);
      const message = err instanceof Error ? err.message : 'Login failed';

      if (lockStatus.locked && lockStatus.retryAfterSeconds !== undefined) {
        res.setHeader('Retry-After', String(lockStatus.retryAfterSeconds));
        res.status(429).json({
          success: false,
          error: `Too many failed login attempts. Please try again after ${lockStatus.retryAfterSeconds} seconds.`,
          errorCode: 'TOO_MANY_REQUESTS',
          retryAfter: lockStatus.retryAfterSeconds,
        });
        return;
      }

      res.status(401).json({
        success: false,
        error: message,
      });
    }
  });

  // POST /v1/auth/refresh
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const refreshToken = req.body?.refreshToken || getRefreshTokenFromCookie(req);
      if (!refreshToken) {
        res.status(401).json({
          success: false,
          error: 'No refresh token provided in body or cookie',
        });
        return;
      }

      const result = await refreshUseCase.execute({ refreshToken });
      setRefreshTokenCookie(req, res, result.tokens.refreshToken);
      res.json({
        success: true,
        data: result,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Refresh failed';
      res.status(401).json({
        success: false,
        error: message,
      });
    }
  });

  // POST /v1/auth/logout
  router.post('/logout', async (req: Request, res: Response) => {
    try {
      const refreshToken = req.body?.refreshToken || getRefreshTokenFromCookie(req);
      const result = await logoutUseCase.execute({ refreshToken });
      clearRefreshTokenCookie(req, res);
      res.json(result);
    } catch (err: unknown) {
      clearRefreshTokenCookie(req, res);
      const message = err instanceof Error ? err.message : 'Logout failed';
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  });

  // GET /v1/auth/me
  router.get('/me', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: 'Missing or malformed Authorization header',
        });
        return;
      }

      const token = authHeader.slice(7);
      const payload = tokenService.verifyAccessToken(token);
      if (!payload || !payload.sub) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
        return;
      }

      const result = await getProfileUseCase.execute({ userId: payload.sub });

      res.json({
        success: true,
        data: result,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      const statusCode = message === 'User not found' ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  });

  // GET /v1/auth/jwks
  router.get('/jwks', (_req: Request, res: Response) => {
    res.json(tokenService.getJwks());
  });

  // GET /v1/auth/roles (List all roles with permissions directly from PostgreSQL SoT)
  router.get('/roles', async (_req: Request, res: Response) => {
    try {
      const roles = userRepository.listRoles ? await userRepository.listRoles() : [];
      res.json({
        success: true,
        data: roles.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          permissions: r.getPermissionCodes(),
        })),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list roles';
      res.status(500).json({ success: false, error: message });
    }
  });

  // GET /v1/auth/roles/:code (Get single role with its full permissions)
  router.get('/roles/:code', async (req: Request, res: Response) => {
    try {
      const code = (Array.isArray(req.params.code) ? req.params.code[0] : req.params.code) as string;
      const role = userRepository.getRoleByCode ? await userRepository.getRoleByCode(code) : null;
      if (!role) {
        res.status(404).json({
          success: false,
          error: `Role '${code}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          permissions: role.getPermissionCodes(),
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get role';
      res.status(500).json({ success: false, error: message });
    }
  });

  // GET /v1/auth/permissions (List all system permissions directly from PostgreSQL SoT)
  router.get('/permissions', async (_req: Request, res: Response) => {
    try {
      const perms = userRepository.listPermissions ? await userRepository.listPermissions() : [];
      res.json({
        success: true,
        data: perms.map((p) => ({
          id: p.id,
          code: p.code,
          resource: p.resource,
          action: p.action,
          description: p.description,
        })),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list permissions';
      res.status(500).json({ success: false, error: message });
    }
  });

  // GET /v1/auth/users (List all registered users with roles & permissions)
  router.get('/users', async (_req: Request, res: Response) => {
    try {
      const allUsers = await userRepository.list();
      res.json({
        success: true,
        data: allUsers.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          metadata: u.metadata,
          isActive: u.isActive,
          roles: u.getRoleCodes(),
          permissions: u.getEffectivePermissions(),
          createdAt: u.createdAt,
        })),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list users';
      res.status(500).json({ success: false, error: message });
    }
  });

  // POST /v1/auth/users/:id/roles & PUT /v1/auth/users/:id/roles (Assign roles to user)
  const handleAssignRoles = async (req: Request, res: Response) => {
    try {
      const userId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const { roles: roleCodes } = req.body || {};
      if (!Array.isArray(roleCodes)) {
        res.status(400).json({
          success: false,
          error: 'Body must include "roles" as an array of role codes (e.g. ["INSTRUCTOR"])',
        });
        return;
      }

      if (!userRepository.assignRoles) {
        res.status(501).json({
          success: false,
          error: 'Role assignment not supported by current repository',
        });
        return;
      }

      const updated = await userRepository.assignRoles(userId, roleCodes);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: `User '${userId}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          roles: updated.getRoleCodes(),
          permissions: updated.getEffectivePermissions(),
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to assign roles';
      res.status(500).json({ success: false, error: message });
    }
  };

  router.post('/users/:id/roles', handleAssignRoles);
  router.put('/users/:id/roles', handleAssignRoles);

  // POST /v1/auth/tokens/verify (Token Introspection RFC 7662)
  router.post('/tokens/verify', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token =
        req.body?.token ||
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

      if (!token) {
        res.status(400).json({
          success: false,
          active: false,
          error: 'No token provided in body or Authorization header',
        });
        return;
      }

      const payload = tokenService.verifyAccessToken(token);
      if (!payload) {
        res.status(200).json({
          success: true,
          active: false,
          error: 'Token is invalid or expired',
        });
        return;
      }

      res.json({
        success: true,
        active: true,
        payload,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Token verification failed';
      res.status(500).json({ success: false, active: false, error: message });
    }
  });

  // POST /v1/auth/tokens/revoke (Explicit Refresh Token Revocation RFC 7009)
  router.post('/tokens/revoke', async (req: Request, res: Response) => {
    try {
      const token = req.body?.token || req.body?.refreshToken;
      if (!token) {
        res.status(400).json({
          success: false,
          error: 'Missing token to revoke',
        });
        return;
      }

      const revoked = await tokenService.revokeRefreshToken(token);
      res.json({
        success: true,
        revoked,
        message: revoked ? 'Token revoked successfully' : 'Token already revoked or not found',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Token revocation failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
