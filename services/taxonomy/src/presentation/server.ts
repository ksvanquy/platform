import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Express } from 'express';
import { createTaxonomyRouter } from './routes/index.js';
import { isTaxonomyDbConfigured, loadEnvIfAvailable } from '../infrastructure/db/connection.js';
import type { TaxonomyRepositoryPort } from '../domain/ports/taxonomy.repository.port.js';

loadEnvIfAvailable();

export function createTaxonomyServer(
  customRepo?: TaxonomyRepositoryPort,
  configuredPort?: number
): Express {
  const app = express();

  // Enable JSON parsing and ETag computation for caching
  app.use(express.json());
  app.set('etag', 'weak');

  // CORS Middleware supporting Web Apps reverse proxies & direct cross-origin calls
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-roles, If-None-Match');
    res.header('Access-Control-Expose-Headers', 'ETag');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const apiDiscovery = {
    status: 'ok',
    service: '@platform/taxonomy-service',
    architecture: 'Autonomous Knowledge Catalog & Taxonomy Microservice (Port 3002)',
    version: '1.0.0',
    port: configuredPort || Number(process.env.TAXONOMY_PORT) || 3002,
    dbConfigured: isTaxonomyDbConfigured(),
    endpoints: [
      { method: 'GET', path: '/health', description: 'Microservice health check' },
      { method: 'GET', path: '/api', description: 'Service discovery metadata' },
      { method: 'GET', path: '/v1/taxonomies', description: 'List all taxonomies' },
      { method: 'GET', path: '/v1/taxonomies/:codeOrId', description: 'Get taxonomy metadata' },
      { method: 'GET', path: '/v1/taxonomies/:codeOrId/tree', description: 'Get complete hierarchical tree (ETag supported)' },
      { method: 'POST', path: '/v1/taxonomies', description: 'Create taxonomy (ADMIN)' },
      { method: 'PUT', path: '/v1/taxonomies/:codeOrId', description: 'Update taxonomy (ADMIN)' },
      { method: 'POST', path: '/v1/taxonomies/:codeOrId/nodes', description: 'Create taxonomy node (ADMIN)' },
      { method: 'GET', path: '/v1/nodes/:id', description: 'Get node details' },
      { method: 'PUT', path: '/v1/nodes/:id', description: 'Update node metadata (ADMIN)' },
      { method: 'POST', path: '/v1/nodes/:id/move', description: 'Reparent node with cycle prevention (ADMIN)' },
      { method: 'DELETE', path: '/v1/nodes/:id', description: 'Soft delete node (ADMIN)' },
      { method: 'GET', path: '/v1/nodes/:id/descendant-ids', description: 'Recursive CTE descendant IDs for quiz filtering' },
      { method: 'GET', path: '/v1/nodes/:id/breadcrumbs', description: 'Recursive CTE breadcrumbs path from root' },
    ],
  };

  // Discovery Endpoints
  app.get('/', (_req, res) => {
    res.status(200).json(apiDiscovery);
  });

  app.get('/api', (_req, res) => {
    res.status(200).json(apiDiscovery);
  });

  // Microservice Healthcheck
  app.get('/health', (req, res) => {
    const port =
      configuredPort ||
      (req.socket.localPort ? req.socket.localPort : Number(process.env.TAXONOMY_PORT) || 3002);
    res.json({
      status: 'ok',
      service: '@platform/taxonomy-service',
      port,
      dbConfigured: isTaxonomyDbConfigured(),
      timestamp: new Date().toISOString(),
    });
  });

  // Mount Unified API Routes
  app.use('/v1', createTaxonomyRouter(customRepo));

  return app;
}

export interface StandaloneTaxonomyServer {
  app: Express;
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

export function startTaxonomyServer(
  port?: number,
  customRepo?: TaxonomyRepositoryPort
): Promise<StandaloneTaxonomyServer> {
  loadEnvIfAvailable();
  const rawPort = port ?? (process.env.TAXONOMY_PORT ? Number(process.env.TAXONOMY_PORT) : undefined);
  if (!rawPort || isNaN(rawPort)) {
    throw new Error(
      '❌ [taxonomy-service] Biến môi trường "TAXONOMY_PORT" chưa được cấu hình trong .env! Vui lòng định nghĩa TAXONOMY_PORT trong file .env (ví dụ: TAXONOMY_PORT=3002).'
    );
  }
  const app = createTaxonomyServer(customRepo, rawPort);
  return new Promise((resolve, reject) => {
    const server = app.listen(rawPort, '0.0.0.0', () => {
      resolve({
        app,
        server,
        port: rawPort,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on('error', reject);
  });
}

// Allow direct execution (standalone server)
const isDirectRun = Boolean(
  process.argv[1] &&
  path.normalize(fileURLToPath(import.meta.url)).toLowerCase() ===
    path.normalize(path.resolve(process.argv[1])).toLowerCase() &&
  process.env.NODE_ENV !== 'test' &&
  !process.env.VITEST
);

if (isDirectRun) {
  loadEnvIfAvailable();
  const rawTaxonomyPort = process.env.TAXONOMY_PORT;
  if (!rawTaxonomyPort || isNaN(Number(rawTaxonomyPort))) {
    throw new Error(
      '❌ [taxonomy-service] Biến môi trường "TAXONOMY_PORT" chưa được cấu hình trong .env! Vui lòng định nghĩa TAXONOMY_PORT trong file .env (ví dụ: TAXONOMY_PORT=3002).'
    );
  }
  const port = Number(rawTaxonomyPort);
  const app = createTaxonomyServer(undefined, port);
  app.listen(port, '0.0.0.0', async () => {
    console.log(`🚀 [taxonomy-service] Standalone Server running on http://0.0.0.0:${port}`);
    console.log(`   Healthcheck: http://localhost:${port}/health`);
    console.log(`   Taxonomies API: http://localhost:${port}/v1/taxonomies`);

    if (isTaxonomyDbConfigured()) {
      try {
        const { runTaxonomyMigrations } = await import('../infrastructure/db/migrate.js');
        const { seedTaxonomyDatabase } = await import('../infrastructure/db/seed.js');
        console.log('🔄 [taxonomy-service] Running schema migrations...');
        await runTaxonomyMigrations();
        await seedTaxonomyDatabase();
        console.log('✅ [taxonomy-service] PostgreSQL database initialized & seeded.');
      } catch (err: any) {
        console.warn('⚠️ [taxonomy-service] Auto-migration warning:', err?.message || err);
      }
    }
  });
}

