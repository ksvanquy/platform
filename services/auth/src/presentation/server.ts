import express, { Express } from 'express';
import { IUserRepository } from '../domain/user/user.repository.port.js';
import { createUserRepository } from '../infrastructure/persistence/repository.factory.js';
import { TokenService } from '../infrastructure/token/token.service.js';
import { createAuthRouter } from './http/auth.router.js';

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

  // Root JWKS discovery endpoint
  app.get('/.well-known/jwks.json', (_req, res) => {
    res.json(tokenService.getJwks());
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
const PORT = process.env.AUTH_PORT ? parseInt(process.env.AUTH_PORT, 10) : 3001;

if (process.env.NODE_ENV !== 'test') {
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
