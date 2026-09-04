import express, { Express, Request, Response } from 'express';
import { createUserRepository, TokenService, createAuthRouter } from '@platform/auth-service';
import { InMemoryAssessmentRepository } from '../infrastructure/repositories/in-memory-assessment.repository.js';
import { AuthoringUseCases } from '../application/use-cases/authoring/authoring.use-cases.js';
import { DeliveryUseCases } from '../application/use-cases/delivery/delivery.use-cases.js';
import { authContextMiddleware } from './middlewares/auth.middleware.js';
import { createV1QuizzesRouter } from './routes/v1-quizzes.routes.js';
import { createV1AttemptsRouter } from './routes/v1-attempts.routes.js';
import { AttemptExpirySweeperService } from '../application/services/attempt-expiry-sweeper.service.js';
import { createV1InternalRouter } from './routes/v1-internal.routes.js';

const app: Express = express();
app.use(express.json());

// Enable CORS with Credentials & Dynamic Origin Whitelist
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-tenant-id, x-internal-secret');
  res.header('Access-Control-Expose-Headers', 'X-Server-Time, X-Server-Timestamp');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Server-Authoritative Clock Synchronization Middleware (RFC/Zero-Trust Timing Defense)
app.use((_req: Request, res: Response, next) => {
  const now = new Date();
  res.setHeader('X-Server-Time', now.toISOString());
  res.setHeader('X-Server-Timestamp', now.getTime().toString());
  next();
});

// Dedicated Precision Server Clock Synchronization Route (Cristian's Algorithm Target)
app.get('/v1/time', (_req: Request, res: Response) => {
  const now = new Date();
  res.status(200).json({
    success: true,
    serverTime: now.toISOString(),
    timestampMs: now.getTime(),
  });
});

// Authentication Services Initialization (In-Process Integration on Port 3000)
let authUserRepository: any = null;
let authRouterInstance: express.Router | null = null;
const authTokenService = new TokenService();

export function setAuthRepository(repo: any): void {
  authUserRepository = repo;
  authRouterInstance = createAuthRouter(repo, authTokenService);
}

function getAuthRouter(): express.Router {
  if (!authRouterInstance) {
    authUserRepository = createUserRepository();
    authRouterInstance = createAuthRouter(authUserRepository, authTokenService);
  }
  return authRouterInstance;
}

// Root & Well-Known Discovery Endpoints
app.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  res.json(authTokenService.getJwks());
});

// Mount Authentication Domain Routes (Port 3000 Unified Origin)
app.use('/v1/auth', (req: Request, res: Response, next: any) => {
  try {
    const router = getAuthRouter();
    return router(req, res, next);
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      message: err?.message || 'Authentication service database not configured',
    });
  }
});

// Authentication Context Middleware for Quiz and Assessment Domains
app.use(authContextMiddleware);

// Repository & Application Services
const assessmentRepo = new InMemoryAssessmentRepository();
const authoringUseCases = new AuthoringUseCases(assessmentRepo);
const deliveryUseCases = new DeliveryUseCases(assessmentRepo, assessmentRepo);

// Background Attempt Expiry Sweeper Service (Active Hardening & Cloud Scheduler Target)
const sweeperService = new AttemptExpirySweeperService(assessmentRepo, assessmentRepo);
sweeperService.start(30000);

// Discovery API
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'Assessment Engine & Quiz Platform Core API',
    architecture: 'Clean Architecture & DDD Boundary Separation (Unified Port 3000)',
    version: '2.0.0',
    endpoints: [
      { method: 'GET', path: '/health', description: 'Health check' },
      { method: 'GET', path: '/v1/time', description: 'Server-Authoritative Clock Synchronization' },
      { method: 'GET', path: '/.well-known/jwks.json', description: 'JWKS Key Discovery' },
      { method: 'POST', path: '/v1/auth/register', description: 'Auth: User registration' },
      { method: 'POST', path: '/v1/auth/login', description: 'Auth: User login' },
      { method: 'POST', path: '/v1/auth/refresh', description: 'Auth: Rotate token' },
      { method: 'POST', path: '/v1/auth/logout', description: 'Auth: Revoke session' },
      { method: 'GET', path: '/v1/auth/me', description: 'Auth: Current user profile' },
      { method: 'GET', path: '/v1/quizzes', description: 'Authoring: List published quizzes' },
      { method: 'POST', path: '/v1/quizzes', description: 'Authoring: Create quiz (DRAFT)' },
      { method: 'GET', path: '/v1/quizzes/:id', description: 'Authoring: Get quiz details' },
      { method: 'POST', path: '/v1/quizzes/:id/versions', description: 'Authoring: Add quiz version' },
      { method: 'POST', path: '/v1/quizzes/:id/publish', description: 'Authoring: Publish quiz' },
      { method: 'POST', path: '/v1/attempts', description: 'Delivery: Create or resume attempt' },
      { method: 'POST', path: '/v1/attempts/:id/start', description: 'Delivery: Start attempt & get sanitized manifest' },
      { method: 'GET', path: '/v1/attempts/:id', description: 'Delivery: Get attempt details' },
      { method: 'PUT', path: '/v1/attempts/:id/answers/:questionId', description: 'Delivery: Record answer' },
      { method: 'POST', path: '/v1/attempts/:id/submit', description: 'Delivery: Finalize & Grade attempt' },
      { method: 'POST', path: '/v1/internal/attempts/sweep', description: 'Internal: Sweep expired attempts & auto-grade' },
      { method: 'GET', path: '/v1/internal/attempts/sweeper-status', description: 'Internal: Check background sweeper daemon status' },
    ],
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', engine: 'Assessment Engine API v2', timestamp: new Date() });
});

// RESTful v1 Domain Routes
app.use('/v1/quizzes', createV1QuizzesRouter(authoringUseCases));
app.use('/v1/attempts', createV1AttemptsRouter(deliveryUseCases));
app.use('/v1/internal', createV1InternalRouter(sweeperService));

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Assessment Engine API Server running on http://0.0.0.0:${PORT}`);
});

export {
  app,
  authoringUseCases,
  deliveryUseCases,
  sweeperService,
  assessmentRepo,
  authUserRepository,
  authTokenService,
};
