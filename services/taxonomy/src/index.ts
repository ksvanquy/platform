/**
 * @platform/taxonomy-service
 * Autonomous Knowledge Catalog and Taxonomy Service
 */

export const TAXONOMY_SERVICE_NAME = 'taxonomy-service';

// Domain
export * from './domain/entities/taxonomy.entity.js';
export * from './domain/errors/taxonomy-domain.errors.js';
export * from './domain/ports/taxonomy.repository.port.js';

// Application
export * from './application/use-cases/list-taxonomies.use-case.js';
export * from './application/use-cases/get-taxonomy-tree.use-case.js';
export * from './application/use-cases/manage-taxonomy.use-case.js';
export * from './application/use-cases/manage-node.use-case.js';

// Infrastructure
export * from './infrastructure/db/schema.js';
export * from './infrastructure/db/connection.js';
export * from './infrastructure/db/migrate.js';
export * from './infrastructure/db/seed.js';
export * from './infrastructure/repositories/drizzle-taxonomy.repository.js';

// Presentation
export * from './presentation/middlewares/auth.middleware.js';
export * from './presentation/controllers/taxonomy.controller.js';
export * from './presentation/routes/v1-taxonomies.routes.js';
export * from './presentation/routes/v1-nodes.routes.js';
export * from './presentation/routes/index.js';
export * from './presentation/server.js';
