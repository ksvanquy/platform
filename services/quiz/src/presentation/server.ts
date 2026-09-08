import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import express, { Express, Request, Response } from 'express';
import {
  createUserRepository,
  TokenService,
  createAuthRouter,
  isAuthDbConfigured,
  runAuthMigrations,
  seedAuthDb,
} from '@platform/auth-service';
import {
  AuthoringRepositoryPort,
  DeliveryRepositoryPort,
} from '../domain/ports/assessment.repository.ports.js';
import {
  createAuthoringRepository,
  createDeliveryRepository,
} from '../infrastructure/repositories/assessment-repository.factory.js';
import { AuthoringUseCases } from '../application/use-cases/authoring/authoring.use-cases.js';
import { DeliveryUseCases } from '../application/use-cases/delivery/delivery.use-cases.js';
import { authContextMiddleware, setUserActiveChecker } from './middlewares/auth.middleware.js';
import { createV1QuizzesRouter } from './routes/v1-quizzes.routes.js';
import { createV1AttemptsRouter } from './routes/v1-attempts.routes.js';
import { AttemptExpirySweeperService } from '../application/services/attempt-expiry-sweeper.service.js';
import { createV1InternalRouter } from './routes/v1-internal.routes.js';
import { isQuizDbConfigured, loadEnvIfAvailable } from '../infrastructure/db/connection.js';
import { runQuizMigrations } from '../infrastructure/db/migrate.js';
import { seedQuizDatabase } from '../infrastructure/db/seed.js';
import {
  createTaxonomyRouter,
  TaxonomyRepositoryPort,
  DrizzleTaxonomyRepository,
  isTaxonomyDbConfigured,
  runTaxonomyMigrations,
  seedTaxonomyDatabase,
} from '@platform/taxonomy-service';
import {
  createQuestionRouter,
  QuestionRepositoryPort,
  DrizzleQuestionRepository,
  isQuestionDbConfigured,
  runQuestionMigrations,
  seedQuestionDatabase,
} from '@platform/question-service';
import {
  createAssessmentRouter,
  AssessmentRepositoryPort,
  DrizzleAssessmentRepository,
  isAssessmentDbConfigured,
  runAssessmentMigrations,
  seedAssessmentDatabase,
} from '@platform/assessment-service';

loadEnvIfAvailable();

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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-internal-secret');
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
  setUserActiveChecker(async (userId: string) => {
    if (authUserRepository) {
      const user = await authUserRepository.findById(userId);
      return user ? user.isActive : true;
    }
    return true;
  });
}

function getAuthRouter(): express.Router {
  if (!authRouterInstance) {
    authUserRepository = createUserRepository();
    authRouterInstance = createAuthRouter(authUserRepository, authTokenService);
    setUserActiveChecker(async (userId: string) => {
      if (authUserRepository) {
        const user = await authUserRepository.findById(userId);
        return user ? user.isActive : true;
      }
      return true;
    });
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

// Repository & Application Services (Dynamic Delegation & PostgreSQL Persistence)
let authoringRepo: AuthoringRepositoryPort | null = null;
let deliveryRepo: DeliveryRepositoryPort | null = null;
let authoringUseCases!: AuthoringUseCases;
let deliveryUseCases!: DeliveryUseCases;
let sweeperService!: AttemptExpirySweeperService;

function initAssessmentServices(): void {
  try {
    if (!authoringRepo) {
      authoringRepo = createAuthoringRepository();
    }
    if (!deliveryRepo) {
      deliveryRepo = createDeliveryRepository();
    }
  } catch (err) {
    // If database is not configured at startup (e.g. initial test harness loading),
    // let it fail fast on access or await test injection via setAssessmentRepositories
    console.warn('⚠️ Assessment repository initialization deferred until database is configured or injected.');
  }

  // Create proxy ports that dynamically delegate to active singleton repos
  const authoringProxy: AuthoringRepositoryPort = {
    saveQuiz: (quiz) => getActiveAuthoringRepo().saveQuiz(quiz),
    findQuizById: (id) => getActiveAuthoringRepo().findQuizById(id),
    findQuizByCode: (code) => getActiveAuthoringRepo().findQuizByCode(code),
    listPublishedQuizzes: (filter) => getActiveAuthoringRepo().listPublishedQuizzes(filter),
    saveVersion: (version) => getActiveAuthoringRepo().saveVersion(version),
    findVersionById: (id) => getActiveAuthoringRepo().findVersionById(id),
    findLatestVersionByQuizId: (quizId) => getActiveAuthoringRepo().findLatestVersionByQuizId(quizId),
    listVersionsByQuizId: (quizId) => getActiveAuthoringRepo().listVersionsByQuizId(quizId),
  };

  const deliveryProxy: DeliveryRepositoryPort = {
    saveAttempt: (attempt) => getActiveDeliveryRepo().saveAttempt(attempt),
    findAttemptById: (id) => getActiveDeliveryRepo().findAttemptById(id),
    listAttemptsByUser: (userId, quizId) => getActiveDeliveryRepo().listAttemptsByUser(userId, quizId),
    findExpiredInProgressAttempts: (now, gracePeriodMs) =>
      getActiveDeliveryRepo().findExpiredInProgressAttempts(now, gracePeriodMs),
  };

  authoringUseCases = new AuthoringUseCases(authoringProxy);
  deliveryUseCases = new DeliveryUseCases(authoringProxy, deliveryProxy);
  sweeperService = new AttemptExpirySweeperService(authoringProxy, deliveryProxy);
}

function getActiveAuthoringRepo(): AuthoringRepositoryPort {
  if (!authoringRepo) {
    authoringRepo = createAuthoringRepository();
  }
  return authoringRepo;
}

function getActiveDeliveryRepo(): DeliveryRepositoryPort {
  if (!deliveryRepo) {
    deliveryRepo = createDeliveryRepository();
  }
  return deliveryRepo;
}

export function setAssessmentRepositories(
  authoring: AuthoringRepositoryPort,
  delivery: DeliveryRepositoryPort
): void {
  authoringRepo = authoring;
  deliveryRepo = delivery;
}

initAssessmentServices();

// Start background sweeper only in active runtime (skip during isolated test suite)
if (process.env.NODE_ENV !== 'test' && isQuizDbConfigured()) {
  sweeperService.start(30000);
}

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', engine: 'Assessment Engine API v2', timestamp: new Date() });
});

// Discovery API metadata
const apiDiscovery = {
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
    { method: 'GET', path: '/v1/taxonomies', description: 'Taxonomy: List all taxonomies' },
    { method: 'POST', path: '/v1/taxonomies', description: 'Taxonomy: Create taxonomy (ADMIN)' },
    { method: 'GET', path: '/v1/taxonomies/:code/tree', description: 'Taxonomy: Get nested taxonomy tree' },
    { method: 'POST', path: '/v1/taxonomies/:code/nodes', description: 'Taxonomy: Create taxonomy node (ADMIN)' },
    { method: 'GET', path: '/v1/nodes/:id', description: 'Taxonomy: Get node details' },
    { method: 'PUT', path: '/v1/nodes/:id', description: 'Taxonomy: Update node (ADMIN)' },
    { method: 'POST', path: '/v1/nodes/:id/move', description: 'Taxonomy: Move node branch (ADMIN)' },
    { method: 'DELETE', path: '/v1/nodes/:id', description: 'Taxonomy: Soft delete node (ADMIN)' },
    { method: 'GET', path: '/v1/nodes/:id/descendant-ids', description: 'Taxonomy: Get recursive descendant IDs' },
    { method: 'GET', path: '/v1/nodes/:id/breadcrumbs', description: 'Taxonomy: Get breadcrumbs from root' },
    { method: 'GET', path: '/v1/questions', description: 'Question: List and filter questions by taxonomy/Bloom' },
    { method: 'POST', path: '/v1/questions', description: 'Question: Create question item with LaTeX/media (AUTHOR)' },
    { method: 'GET', path: '/v1/questions/:idOrCode', description: 'Question: Get question details with revision' },
    { method: 'PUT', path: '/v1/questions/:id', description: 'Question: Update question and auto-generate revision (AUTHOR)' },
    { method: 'DELETE', path: '/v1/questions/:id', description: 'Question: Delete question (AUTHOR/ADMIN)' },
    { method: 'GET', path: '/v1/questions/:id/revisions', description: 'Question: List historical revisions' },
    { method: 'GET', path: '/v1/assessments', description: 'Assessment: List assessments and criteria' },
    { method: 'POST', path: '/v1/assessments', description: 'Assessment: Create assessment blueprint (AUTHOR)' },
    { method: 'GET', path: '/v1/assessments/:idOrCode', description: 'Assessment: Get assessment & blueprint details' },
    { method: 'PUT', path: '/v1/assessments/:id', description: 'Assessment: Update assessment details (AUTHOR)' },
    { method: 'PATCH', path: '/v1/assessments/:id/status', description: 'Assessment: Transition lifecycle status (AUTHOR)' },
    { method: 'PUT', path: '/v1/assessments/:id/blueprint', description: 'Assessment: Update blueprint criteria matrix (AUTHOR)' },
    { method: 'POST', path: '/v1/assessments/:id/blueprint/lock', description: 'Assessment: Lock blueprint against edits (AUTHOR)' },
  ],
};

// Taxonomy Module & Dynamic Router Delegation (Unified Port 3000 Gateway)
let taxonomyRepoInstance: TaxonomyRepositoryPort | null = null;
let taxonomyRouterInstance: express.Router | null = null;

function getTaxonomyRepository(): TaxonomyRepositoryPort | null {
  if (!taxonomyRepoInstance) {
    try {
      taxonomyRepoInstance = new DrizzleTaxonomyRepository();
    } catch (err: any) {
      console.warn('⚠️ Could not initialize DrizzleTaxonomyRepository:', err?.message || err);
    }
  }
  return taxonomyRepoInstance;
}

function setTaxonomyRepository(repo: TaxonomyRepositoryPort): void {
  taxonomyRepoInstance = repo;
  taxonomyRouterInstance = createTaxonomyRouter(repo);
}

function getTaxonomyRouter(): express.Router {
  if (!taxonomyRouterInstance) {
    const repo = getTaxonomyRepository();
    taxonomyRouterInstance = createTaxonomyRouter(repo || undefined);
  }
  return taxonomyRouterInstance!;
}

// Question Service Dynamic Router Delegation (Unified Port 3000 Gateway)
let questionRepoInstance: QuestionRepositoryPort | null = null;
let questionRouterInstance: express.Router | null = null;

function getQuestionRepository(): QuestionRepositoryPort | null {
  if (!questionRepoInstance) {
    try {
      questionRepoInstance = new DrizzleQuestionRepository();
    } catch (err: any) {
      console.warn('⚠️ Could not initialize DrizzleQuestionRepository:', err?.message || err);
    }
  }
  return questionRepoInstance;
}

function setQuestionRepository(repo: QuestionRepositoryPort): void {
  questionRepoInstance = repo;
  questionRouterInstance = createQuestionRouter(repo);
}

function getQuestionRouter(): express.Router {
  if (!questionRouterInstance) {
    const repo = getQuestionRepository();
    questionRouterInstance = createQuestionRouter(repo || undefined);
  }
  return questionRouterInstance!;
}

// Assessment Service Dynamic Router Delegation (Unified Port 3000 Gateway)
let assessmentRepoInstance: AssessmentRepositoryPort | null = null;
let assessmentRouterInstance: express.Router | null = null;

function getAssessmentRepository(): AssessmentRepositoryPort | null {
  if (!assessmentRepoInstance) {
    try {
      assessmentRepoInstance = new DrizzleAssessmentRepository();
    } catch (err: any) {
      console.warn('⚠️ Could not initialize DrizzleAssessmentRepository:', err?.message || err);
    }
  }
  return assessmentRepoInstance;
}

function setAssessmentRepository(repo: AssessmentRepositoryPort): void {
  assessmentRepoInstance = repo;
  assessmentRouterInstance = createAssessmentRouter(repo);
}

function getAssessmentRouter(): express.Router {
  if (!assessmentRouterInstance) {
    const repo = getAssessmentRepository();
    assessmentRouterInstance = createAssessmentRouter(repo || undefined);
  }
  return assessmentRouterInstance!;
}

app.get('/api', (_req: Request, res: Response) => {
  res.status(200).json(apiDiscovery);
});

// Root route: HTML for browser visitors, Discovery JSON for API clients / tests
app.get('/', (req: Request, res: Response) => {
  if (req.headers.accept?.includes('text/html') && fs.existsSync(path.join(quizWebDist, 'index.html'))) {
    return res.sendFile(path.join(quizWebDist, 'index.html'));
  }
  res.status(200).json(apiDiscovery);
});

// RESTful v1 Domain Routes
app.use('/v1/quizzes', createV1QuizzesRouter(authoringUseCases, () => getTaxonomyRepository()));
app.use('/v1/attempts', createV1AttemptsRouter(deliveryUseCases));
app.use('/v1/internal', createV1InternalRouter(sweeperService));

// Mount Question Bank Routes (Unified Gateway on Port 3000)
app.use('/v1/questions', (req: Request, res: Response, next: any) => {
  try {
    const router = getQuestionRouter();
    return router(req, res, next);
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      message: err?.message || 'Question service database not configured',
    });
  }
});

// Mount Assessment Blueprint Routes (Unified Gateway on Port 3000)
app.use('/v1/assessments', (req: Request, res: Response, next: any) => {
  try {
    const router = getAssessmentRouter();
    return router(req, res, next);
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      message: err?.message || 'Assessment service database not configured',
    });
  }
});

// Mount Taxonomy Domain Routes (Unified Gateway on Port 3000)
app.use('/v1', (req: Request, res: Response, next: any) => {
  if (
    req.path.startsWith('/taxonomies') ||
    req.path === '/taxonomies' ||
    req.path.startsWith('/nodes') ||
    req.path === '/nodes'
  ) {
    try {
      const router = getTaxonomyRouter();
      return router(req, res, next);
    } catch (err: any) {
      return res.status(503).json({
        success: false,
        message: err?.message || 'Taxonomy service database not configured',
      });
    }
  }
  next();
});

// Static frontend serving (Candidate Quiz Web & Admin Web)
const quizWebDist = path.resolve(process.cwd(), 'apps/quiz-web/dist');
const adminWebDist = path.resolve(process.cwd(), 'apps/admin-web/dist');

// Ensure frontend assets are built if missing
if (!fs.existsSync(quizWebDist)) {
  try {
    console.log('📦 Building frontend assets (@platform/quiz-web)...');
    execSync('npm run build --workspace=@platform/quiz-web', { stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️ Could not pre-build @platform/quiz-web:', err);
  }
}

if (!fs.existsSync(adminWebDist)) {
  try {
    console.log('📦 Building admin assets (@platform/admin-web)...');
    execSync('npm run build --workspace=@platform/admin-web', { stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️ Could not pre-build @platform/admin-web:', err);
  }
}

// Serve Admin Web under /admin
if (fs.existsSync(adminWebDist)) {
  app.use('/admin', express.static(adminWebDist));
  app.use('/admin', (_req: Request, res: Response) => {
    res.sendFile(path.join(adminWebDist, 'index.html'));
  });
}

// Serve Quiz Web static assets & SPA routing fallback
if (fs.existsSync(quizWebDist)) {
  app.use(express.static(quizWebDist, { index: false }));
  app.use((req: Request, res: Response, next: any) => {
    if (
      req.path.startsWith('/v1/') ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/.well-known/') ||
      req.path.startsWith('/admin')
    ) {
      return next();
    }
    res.sendFile(path.join(quizWebDist, 'index.html'));
  });
}

let server: any = null;
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const rawQuizPort = process.env.QUIZ_PORT;
  if (!rawQuizPort || isNaN(Number(rawQuizPort))) {
    throw new Error(
      '❌ [quiz-service] Biến môi trường "QUIZ_PORT" chưa được cấu hình trong .env! Vui lòng định nghĩa QUIZ_PORT trong file .env (ví dụ: QUIZ_PORT=3000).'
    );
  }
  const PORT = Number(rawQuizPort);
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Assessment Engine API Server running on http://0.0.0.0:${PORT}`);
  });
}

// Auto-bootstrap PostgreSQL databases (migrations & initial seed) when configured
async function bootstrapDatabases(): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return;
  }

  // 1. Quiz DB auto-migration and seeding
  if (isQuizDbConfigured()) {
    try {
      console.log('🔄 [quiz_db] Running schema migrations...');
      await runQuizMigrations();
      const repo = getActiveAuthoringRepo();
      const existing = await repo.findQuizById('quiz_demo');
      if (!existing) {
        console.log('🌱 [quiz_db] Seeding default quizzes and versions into PostgreSQL...');
        await seedQuizDatabase();
      }
      console.log('✅ [quiz_db] PostgreSQL database initialized successfully.');
    } catch (err: any) {
      console.warn('⚠️ [quiz_db] Database bootstrap warning:', err?.message || err);
    }
  }

  // 2. Auth DB auto-migration and seeding
  if (isAuthDbConfigured()) {
    try {
      console.log('🔄 [auth_db] Running schema migrations...');
      await runAuthMigrations();
      await seedAuthDb();
      console.log('✅ [auth_db] PostgreSQL database initialized successfully.');
    } catch (err: any) {
      console.warn('⚠️ [auth_db] Database bootstrap warning:', err?.message || err);
    }
  }

  // 3. Taxonomy DB auto-migration and seeding
  if (isTaxonomyDbConfigured()) {
    try {
      console.log('🔄 [taxonomy_db] Running schema migrations...');
      await runTaxonomyMigrations();
      await seedTaxonomyDatabase();
      console.log('✅ [taxonomy_db] PostgreSQL database initialized successfully.');
    } catch (err: any) {
      console.warn('⚠️ [taxonomy_db] Database bootstrap warning:', err?.message || err);
    }
  }

  // 4. Question DB auto-migration and seeding
  if (isQuestionDbConfigured()) {
    try {
      console.log('🔄 [question_db] Running schema migrations...');
      await runQuestionMigrations();
      await seedQuestionDatabase();
      console.log('✅ [question_db] PostgreSQL database initialized successfully.');
    } catch (err: any) {
      console.warn('⚠️ [question_db] Database bootstrap warning:', err?.message || err);
    }
  }

  // 5. Assessment DB auto-migration and seeding
  if (isAssessmentDbConfigured()) {
    try {
      console.log('🔄 [assessment_db] Running schema migrations...');
      await runAssessmentMigrations();
      await seedAssessmentDatabase();
      console.log('✅ [assessment_db] PostgreSQL database initialized successfully.');
    } catch (err: any) {
      console.warn('⚠️ [assessment_db] Database bootstrap warning:', err?.message || err);
    }
  }
}

bootstrapDatabases();

export {
  app,
  authoringUseCases,
  deliveryUseCases,
  sweeperService,
  authoringRepo,
  deliveryRepo,
  getActiveAuthoringRepo,
  getActiveDeliveryRepo,
  authUserRepository,
  authTokenService,
  setTaxonomyRepository,
  setQuestionRepository,
  setAssessmentRepository,
};
