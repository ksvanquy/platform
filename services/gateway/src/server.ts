import fs from 'node:fs';
import path from 'node:path';
import express, { Express, Request, Response } from 'express';
import {
  createUserRepository,
  TokenService,
  createAuthRouter,
  isAuthDbConfigured,
} from '@platform/auth-service';
import {
  createTaxonomyRouter,
  TaxonomyRepositoryPort,
  DrizzleTaxonomyRepository,
  isTaxonomyDbConfigured,
} from '@platform/taxonomy-service';
import {
  createQuestionRouter,
  QuestionRepositoryPort,
  DrizzleQuestionRepository,
  isQuestionDbConfigured,
} from '@platform/question-service';
import {
  createAssessmentRouter,
  AssessmentRepositoryPort,
  DrizzleAssessmentRepository,
  isAssessmentDbConfigured,
} from '@platform/assessment-service';
import {
  createExamRouter,
  ExamRepositoryPort,
  DrizzleExamRepository,
  isExamDbConfigured,
  DirectQuestionClientAdapter,
  DirectAssessmentClientAdapter,
} from '@platform/exam-service';
import {
  createV1AttemptsRouter as createAttemptServiceRouter,
  AttemptRepositoryPort as AttemptServiceRepositoryPort,
  DrizzleAttemptRepository,
  isAttemptDbConfigured,
  AttemptExpirySweeperService as AttemptSweeperDaemon,
  createV1InternalRouter as createAttemptInternalRouter,
  DirectExamClientAdapter,
} from '@platform/attempt-service';
import { authContextMiddleware, setUserActiveChecker } from './middlewares/auth.middleware.js';

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

// Server-Authoritative Clock Synchronization Middleware (Zero-Trust Timing Defense)
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
  return authRouterInstance!;
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

// Authentication Context Middleware for all microservices
app.use(authContextMiddleware);

// Discovery API metadata
const apiDiscovery = {
  status: 'ok',
  service: 'Platform API Gateway & Microservices Unified Entry Point',
  architecture: 'Pure Microservices Architecture (Question, Assessment, Exam, Attempt, Taxonomy, Auth)',
  version: '3.0.0',
  endpoints: [
    { method: 'GET', path: '/health', description: 'System health check & microservices status' },
    { method: 'GET', path: '/v1/time', description: 'Server-Authoritative Clock Synchronization' },
    { method: 'GET', path: '/v1/hosting-config', description: 'CDN & Frontend Decoupled Hosting Discovery' },
    { method: 'GET', path: '/.well-known/jwks.json', description: 'JWKS Key Discovery' },
    { method: 'POST', path: '/v1/auth/register', description: 'Auth: User registration' },
    { method: 'POST', path: '/v1/auth/login', description: 'Auth: User login' },
    { method: 'POST', path: '/v1/auth/refresh', description: 'Auth: Rotate token' },
    { method: 'POST', path: '/v1/auth/logout', description: 'Auth: Revoke session' },
    { method: 'GET', path: '/v1/auth/me', description: 'Auth: Current user profile' },
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
    { method: 'GET', path: '/v1/exams', description: 'Exam: List exams' },
    { method: 'POST', path: '/v1/exams', description: 'Exam: Generate exam from blueprint matrix (AUTHOR)' },
    { method: 'GET', path: '/v1/exams/:idOrCode', description: 'Exam: Get exam details and variants' },
    { method: 'PUT', path: '/v1/exams/:id', description: 'Exam: Update exam metadata (AUTHOR)' },
    { method: 'PATCH', path: '/v1/exams/:id/status', description: 'Exam: Update exam status (READY, ACTIVE, CLOSED)' },
    { method: 'POST', path: '/v1/exams/:id/publish', description: 'Exam: Publish exam (AUTHOR)' },
    { method: 'POST', path: '/v1/exams/:id/unpublish', description: 'Exam: Unpublish exam (AUTHOR)' },
    { method: 'DELETE', path: '/v1/exams/:id', description: 'Exam: Delete exam and snapshots (AUTHOR/ADMIN)' },
    { method: 'GET', path: '/v1/exams/:idOrCode/manifest', description: 'Exam: Get sanitized exam manifest for candidates' },
    { method: 'GET', path: '/v1/exams/:idOrCode/variants/:variantCode/manifest', description: 'Exam: Get variant sanitized manifest' },
    { method: 'GET', path: '/v1/exams/:idOrCode/variants/:variantCode/frozen', description: 'Exam: Get internal frozen snapshot (AUTHOR/ADMIN)' },
    { method: 'POST', path: '/v1/exams/:idOrCode/generate-variants', description: 'Exam: Generate or refresh exam variants (AUTHOR)' },
    { method: 'POST', path: '/v1/attempts', description: 'Attempt: Start or recover attempt session (CANDIDATE)' },
    { method: 'GET', path: '/v1/attempts/:id', description: 'Attempt: Get active attempt and sanitized exam manifest' },
    { method: 'POST', path: '/v1/attempts/:id/start', description: 'Attempt: Start timer countdown' },
    { method: 'PUT', path: '/v1/attempts/:id/answers/:questionId', description: 'Attempt: High-throughput autosave candidate answer (<25ms)' },
    { method: 'POST', path: '/v1/attempts/:id/answers', description: 'Attempt: High-throughput autosave candidate answer' },
    { method: 'POST', path: '/v1/attempts/:id/events', description: 'Attempt: Record anti-cheat telemetry event' },
    { method: 'GET', path: '/v1/attempts/:id/events', description: 'Attempt: Get telemetry audit log (PROCTOR/ADMIN)' },
    { method: 'POST', path: '/v1/attempts/:id/submit', description: 'Attempt: Submit attempt and trigger scoring' },
    { method: 'GET', path: '/v1/attempts/:id/result', description: 'Attempt: Get evaluation result breakdown' },
    { method: 'POST', path: '/v1/internal/attempts/sweep', description: 'Internal: Background sweeper for expired attempts' },
  ],
};

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'API Gateway',
    timestamp: new Date().toISOString(),
    persistence: 'PostgreSQL (Single Source of Truth)',
    embedded_pglite: 'permanently_removed',
    services: {
      auth: isAuthDbConfigured(),
      taxonomy: isTaxonomyDbConfigured(),
      question: isQuestionDbConfigured(),
      assessment: isAssessmentDbConfigured(),
      exam: isExamDbConfigured(),
      attempt: isAttemptDbConfigured(),
    },
  });
});

app.get('/api', (_req: Request, res: Response) => {
  res.status(200).json(apiDiscovery);
});

app.get('/v1/api-discovery', (_req: Request, res: Response) => {
  res.status(200).json(apiDiscovery);
});

// Single Source of Truth: PostgreSQL Microservices Diagnostics
export async function ensureServicesInitialized(): Promise<void> {
  const missingUrls: string[] = [];
  if (!isAuthDbConfigured()) missingUrls.push('AUTH_DATABASE_URL');
  if (!isTaxonomyDbConfigured()) missingUrls.push('TAXONOMY_DATABASE_URL');
  if (!isQuestionDbConfigured()) missingUrls.push('QUESTION_DATABASE_URL');
  if (!isAssessmentDbConfigured()) missingUrls.push('ASSESSMENT_DATABASE_URL');
  if (!isExamDbConfigured()) missingUrls.push('EXAM_DATABASE_URL');
  if (!isAttemptDbConfigured()) missingUrls.push('ATTEMPT_DATABASE_URL');

  if (missingUrls.length > 0) {
    console.warn(
      `⚠️ [Gateway] PostgreSQL URLs missing or invalid: ${missingUrls.join(', ')}. ` +
      'Embedded PGlite has been permanently removed. Real PostgreSQL is the ONLY source of truth.'
    );
  }
}

// Taxonomy Module & Dynamic Router Delegation
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

export function setTaxonomyRepository(repo: TaxonomyRepositoryPort): void {
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

// Question Service Dynamic Router Delegation
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

export function setQuestionRepository(repo: QuestionRepositoryPort): void {
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

// Assessment Service Dynamic Router Delegation
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

export function setAssessmentRepository(repo: AssessmentRepositoryPort): void {
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

// Exam Service Dynamic Router Delegation
let examRepoInstance: ExamRepositoryPort | null = null;
let examRouterInstance: express.Router | null = null;

function getExamRepository(): ExamRepositoryPort | null {
  if (!examRepoInstance) {
    try {
      examRepoInstance = new DrizzleExamRepository();
    } catch (err: any) {
      console.warn('⚠️ Could not initialize DrizzleExamRepository:', err?.message || err);
    }
  }
  return examRepoInstance;
}

export function setExamRepository(
  repo: ExamRepositoryPort,
  questionClient?: any,
  assessmentClient?: any
): void {
  examRepoInstance = repo;
  examRouterInstance = createExamRouter({ examRepo: repo, questionClient, assessmentClient });
}

function getExamRouter(): express.Router {
  if (!examRouterInstance) {
    const repo = getExamRepository();
    const questionRepo = getQuestionRepository();
    const assessmentRepo = getAssessmentRepository();
    const questionClient = new DirectQuestionClientAdapter(questionRepo as any);
    const assessmentClient = new DirectAssessmentClientAdapter(assessmentRepo as any);
    examRouterInstance = createExamRouter({
      examRepo: repo || undefined,
      questionClient,
      assessmentClient,
    });
  }
  return examRouterInstance!;
}

// Attempt Service Dynamic Router Delegation
let attemptRepoInstance: AttemptServiceRepositoryPort | null = null;
let attemptRouterInstance: express.Router | null = null;
let attemptSweeperDaemonInstance: AttemptSweeperDaemon | null = null;

function getAttemptRepository(): AttemptServiceRepositoryPort | null {
  if (!attemptRepoInstance) {
    try {
      attemptRepoInstance = new DrizzleAttemptRepository();
    } catch (err: any) {
      console.warn('⚠️ Could not initialize DrizzleAttemptRepository:', err?.message || err);
    }
  }
  return attemptRepoInstance;
}

export function setAttemptRepository(
  repo: AttemptServiceRepositoryPort,
  examClient?: any
): void {
  attemptRepoInstance = repo;
  const examClientInstance =
    examClient ||
    (examRepoInstance ? new DirectExamClientAdapter(examRepoInstance as any) : new DirectExamClientAdapter());
  attemptRouterInstance = createAttemptServiceRouter({ attemptRepo: repo, examClient: examClientInstance });
  attemptSweeperDaemonInstance = new AttemptSweeperDaemon(repo, examClientInstance);
}

function getAttemptRouter(): express.Router {
  if (!attemptRouterInstance) {
    const repo = getAttemptRepository();
    const examRepo = getExamRepository();
    const examClient = new DirectExamClientAdapter(examRepo as any);
    attemptRouterInstance = createAttemptServiceRouter({ attemptRepo: repo || undefined, examClient });
    attemptSweeperDaemonInstance = new AttemptSweeperDaemon(repo || new DrizzleAttemptRepository(), examClient);
  }
  return attemptRouterInstance!;
}

// Mount Question Bank Routes
app.use('/v1/questions', async (req: Request, res: Response, next: any) => {
  try {
    await ensureServicesInitialized();
    const router = getQuestionRouter();
    return router(req, res, next);
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      message: err?.message || 'Question service database not configured',
    });
  }
});

// Mount Assessment Blueprint Routes
app.use('/v1/assessments', async (req: Request, res: Response, next: any) => {
  try {
    await ensureServicesInitialized();
    const router = getAssessmentRouter();
    return router(req, res, next);
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      message: err?.message || 'Assessment service database not configured',
    });
  }
});

// Mount Exam Engine Routes
app.use('/v1/exams', async (req: Request, res: Response, next: any) => {
  try {
    await ensureServicesInitialized();
    const router = getExamRouter();
    return router(req, res, next);
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      message: err?.message || 'Exam service database not configured',
    });
  }
});

// Mount Attempt Engine Routes
app.use('/v1/attempts', async (req: Request, res: Response, next: any) => {
  try {
    await ensureServicesInitialized();
    const router = getAttemptRouter();
    return router(req, res, next);
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      message: err?.message || 'Attempt service database not configured',
    });
  }
});

// Mount Attempt Internal Sweeper Routes
app.use('/v1/internal', async (req: Request, res: Response, next: any) => {
  try {
    await ensureServicesInitialized();
    const repo = getAttemptRepository();
    const examClient = new DirectExamClientAdapter();
    const sweeper =
      attemptSweeperDaemonInstance ||
      new AttemptSweeperDaemon(repo || new DrizzleAttemptRepository(), examClient);
    const router = createAttemptInternalRouter(sweeper);
    return router(req, res, next);
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      message: err?.message || 'Internal attempt sweeper not available',
    });
  }
});

// Mount Taxonomy Domain Routes
app.use('/v1', async (req: Request, res: Response, next: any) => {
  if (
    req.path.startsWith('/taxonomies') ||
    req.path === '/taxonomies' ||
    req.path.startsWith('/nodes') ||
    req.path === '/nodes'
  ) {
    try {
      await ensureServicesInitialized();
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

// ============================================================================
// Decoupled Static Hosting (Phương án A: CDN / Cloud Storage) & Local Serving
// ============================================================================
// Trong mô hình Decoupled Static Hosting (khuyến nghị cho quy mô lớn):
// - Frontend tĩnh (web, admin-web) được lưu trữ trên Cloud Storage / CDN
// - Gateway hoạt động như Pure API Gateway và thông báo CDN topology qua /v1/hosting-config
// - Vẫn hỗ trợ phục vụ tệp tĩnh local (nếu có dist) để tương thích môi trường Dev / Preview
const FRONTEND_HOSTING_MODE =
  process.env.FRONTEND_HOSTING_MODE || (process.env.CDN_QUIZ_URL ? 'decoupled' : 'embedded');
const CDN_QUIZ_URL = process.env.CDN_QUIZ_URL || '';
const CDN_ADMIN_URL = process.env.CDN_ADMIN_URL || '';

const quizWebDist = path.resolve(process.cwd(), 'apps/web/dist');
const adminWebDist = path.resolve(process.cwd(), 'apps/admin-web/dist');

const isQuizWebBuilt = fs.existsSync(path.join(quizWebDist, 'index.html'));
const isAdminWebBuilt = fs.existsSync(path.join(adminWebDist, 'index.html'));

if (!isQuizWebBuilt || !isAdminWebBuilt) {
  console.warn(
    '⚠️ [Gateway Startup] Pre-built frontend assets not found! ' +
    'In production, frontend is served via CDN (Phương án A) or pre-built via "npm run build". ' +
    'Gateway will run in API-only mode for missing local frontends.'
  );
}

// Dedicated CDN & Frontend Hosting Discovery Route
app.get('/v1/hosting-config', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    mode: FRONTEND_HOSTING_MODE,
    architecture: 'Decoupled Static Hosting via CDN / Cloud Storage (Phương án A)',
    cdnQuizUrl: CDN_QUIZ_URL || null,
    cdnAdminUrl: CDN_ADMIN_URL || null,
    localDistAvailable: {
      quizWeb: isQuizWebBuilt,
      adminWeb: isAdminWebBuilt,
    },
    corsConfig: {
      credentialsAllowed: true,
      origin: 'Dynamic Whitelist / Any Origin Allowed',
    },
    recommendation: 'Use CDN edge caching for static assets (/assets/*) with max-age=31536000, immutable.',
  });
});

// Serve Admin Web under /admin (hoặc redirect sang CDN nếu cấu hình CDN_ADMIN_URL)
if (CDN_ADMIN_URL && FRONTEND_HOSTING_MODE === 'decoupled' && !isQuizWebBuilt) {
  app.use('/admin', (_req: Request, res: Response) => {
    res.redirect(302, CDN_ADMIN_URL);
  });
} else if (fs.existsSync(adminWebDist)) {
  app.use('/admin', express.static(adminWebDist));
  app.use('/admin', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(adminWebDist, 'index.html'));
  });
}

// Serve Quiz Web static assets & SPA routing fallback (hoặc redirect sang CDN)
if (CDN_QUIZ_URL && FRONTEND_HOSTING_MODE === 'decoupled' && !isQuizWebBuilt) {
  app.get('/', (req: Request, res: Response, next: any) => {
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect(302, CDN_QUIZ_URL);
    }
    next();
  });
} else if (fs.existsSync(quizWebDist)) {
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
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(quizWebDist, 'index.html'));
  });
}

// Root route: HTML for browser visitors, Discovery JSON for API clients / tests
app.get('/', (req: Request, res: Response) => {
  if (req.headers.accept?.includes('text/html') && fs.existsSync(path.join(quizWebDist, 'index.html'))) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(path.join(quizWebDist, 'index.html'));
  }
  res.status(200).json(apiDiscovery);
});

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Platform API Gateway Server running on http://0.0.0.0:${PORT} [100% Real PostgreSQL - Embedded PGlite Removed]`);
  });

  ensureServicesInitialized()
    .then(() => {
      // Initialize attempt sweeper daemon once services are ready
      try {
        const repo = getAttemptRepository();
        const examRepo = getExamRepository();
        if (repo) {
          attemptSweeperDaemonInstance = new AttemptSweeperDaemon(
            repo,
            new DirectExamClientAdapter(examRepo as any)
          );
          attemptSweeperDaemonInstance.start(30000);
        }
      } catch (err: any) {
        console.warn('⚠️ [attempt_db] Could not initialize sweeper daemon:', err?.message || err);
      }
    })
    .catch((err) => console.error('Error during PostgreSQL services verification:', err));
}

export {
  app,
  authUserRepository,
  authTokenService,
};
