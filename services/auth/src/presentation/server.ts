import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Express } from 'express';
import { IUserRepository } from '../domain/user/user.repository.port.js';
import { createUserRepository } from '../infrastructure/persistence/repository.factory.js';
import { TokenService } from '../infrastructure/token/token.service.js';
import { createAuthRouter } from './http/auth.router.js';
import { loadEnvIfAvailable } from '../infrastructure/db/connection.js';

export interface AuthAppInstance {
  app: Express;
  userRepository: IUserRepository;
  tokenService: TokenService;
}

export function createAuthApp(
  customUserRepo?: IUserRepository,
  customTokenService?: TokenService
): AuthAppInstance {
  const app = express();
  app.use(express.json());

  // CORS middleware with credentials support
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Cookie');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const userRepository = customUserRepo || createUserRepository();
  const tokenService = customTokenService || new TokenService();

  // Root JWKS discovery endpoint (RFC 7517 & OpenID Connect Discovery)
  app.get(['/.well-known/jwks.json', '/.well-known/openid-configuration/jwks'], (_req, res) => {
    const jwks = tokenService.getJwks();
    const bodyString = JSON.stringify(jwks);
    const etag = `W/"${Buffer.from(bodyString).length.toString(16)}-${bodyString.slice(0, 16)}"`;
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.setHeader('ETag', etag);
    res.setHeader('Vary', 'Accept-Encoding');
    res.send(bodyString);
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
  });

  // Mount Auth Router
  app.use('/v1/auth', createAuthRouter(userRepository, tokenService));

  return { app, userRepository, tokenService };
}

// Start standalone server when executed
const isDirectRun = Boolean(
  process.argv[1] &&
  path.normalize(fileURLToPath(import.meta.url)).toLowerCase() ===
    path.normalize(path.resolve(process.argv[1])).toLowerCase() &&
  process.env.NODE_ENV !== 'test' &&
  !process.env.VITEST
);

if (isDirectRun) {
  loadEnvIfAvailable();
  const rawAuthPort = process.env.AUTH_PORT;
  if (!rawAuthPort || isNaN(Number(rawAuthPort))) {
    throw new Error(
      '❌ [auth-service] Biến môi trường "AUTH_PORT" chưa được cấu hình trong .env! Vui lòng định nghĩa AUTH_PORT trong file .env (ví dụ: AUTH_PORT=3001).'
    );
  }
  const PORT = Number(rawAuthPort);
  const { app } = createAuthApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔐 Auth Service is running on http://localhost:${PORT}`);
    console.log(`🔑 Endpoints:`);
    console.log(`  - POST /v1/auth/login`);
    console.log(`  - POST /v1/auth/refresh`);
    console.log(`  - POST /v1/auth/logout`);
    console.log(`  - GET  /v1/auth/me`);
    console.log(`  - GET  /.well-known/jwks.json`);
  });
}
