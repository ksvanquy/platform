import express, { Express } from 'express';
import { createTaxonomyRouter } from './routes/index.js';
import { isTaxonomyDbConfigured, loadEnvIfAvailable } from '../infrastructure/db/connection.js';
import type { TaxonomyRepositoryPort } from '../domain/ports/taxonomy.repository.port.js';

loadEnvIfAvailable();

export function createTaxonomyServer(customRepo?: TaxonomyRepositoryPort): Express {
  const app = express();

  app.use(express.json());

  // CORS Middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-roles');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Healthcheck
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: '@platform/taxonomy-service',
      dbConfigured: isTaxonomyDbConfigured(),
      timestamp: new Date().toISOString(),
    });
  });

  // Mount Unified API Routes
  app.use('/v1', createTaxonomyRouter(customRepo));

  return app;
}

// Allow direct execution (standalone server)
const isMain = Boolean(
  process.argv[1] &&
  (
    process.argv[1].replace(/\\/g, '/').endsWith('server.ts') ||
    process.argv[1].replace(/\\/g, '/').endsWith('server.js')
  )
);

if (isMain) {
  const port = Number(process.env.TAXONOMY_PORT) || 3002;
  const app = createTaxonomyServer();
  app.listen(port, () => {
    console.log(`🚀 [taxonomy-service] Standalone Server running on port ${port}`);
    console.log(`   Healthcheck: http://localhost:${port}/health`);
    console.log(`   Taxonomies API: http://localhost:${port}/v1/taxonomies`);
  });
}
