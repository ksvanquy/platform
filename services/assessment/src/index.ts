/**
 * @platform/assessment-service
 * Autonomous Assessment Blueprint & Matrix Specification Service
 */

export const ASSESSMENT_SERVICE_NAME = 'assessment-service';

// Domain
export * from './domain/entities/assessment.entity.js';
export * from './domain/errors/assessment-domain.errors.js';
export * from './domain/ports/assessment.repository.port.js';

// Application
export * from './application/use-cases/create-assessment.use-case.js';
export * from './application/use-cases/get-assessment.use-case.js';
export * from './application/use-cases/update-assessment.use-case.js';
export * from './application/use-cases/update-blueprint.use-case.js';
export * from './application/use-cases/list-assessments.use-case.js';
export * from './application/use-cases/change-assessment-status.use-case.js';

// Infrastructure
export * from './infrastructure/db/schema.js';
export * from './infrastructure/db/connection.js';
export * from './infrastructure/db/migrate.js';
export * from './infrastructure/db/seed.js';
export * from './infrastructure/repositories/drizzle-assessment.repository.js';

// Presentation
export * from './presentation/middlewares/auth.middleware.js';
export * from './presentation/controllers/assessment.controller.js';
export * from './presentation/routes/v1-assessments.routes.js';
export * from './presentation/routes/index.js';
export * from './presentation/server.js';
