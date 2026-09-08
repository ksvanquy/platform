/**
 * @platform/question-service
 * Autonomous Question Bank Service with LaTeX/Media/Revisions and Bloom Taxonomy
 */

export const QUESTION_SERVICE_NAME = 'question-service';

// Domain
export * from './domain/entities/question.entity.js';
export * from './domain/errors/question-domain.errors.js';
export * from './domain/ports/question.repository.port.js';

// Application
export * from './application/use-cases/create-question.use-case.js';
export * from './application/use-cases/get-question.use-case.js';
export * from './application/use-cases/update-question.use-case.js';
export * from './application/use-cases/list-questions.use-case.js';
export * from './application/use-cases/delete-question.use-case.js';
export * from './application/use-cases/add-revision.use-case.js';

// Infrastructure
export * from './infrastructure/db/schema.js';
export * from './infrastructure/db/connection.js';
export * from './infrastructure/db/migrate.js';
export * from './infrastructure/db/seed.js';
export * from './infrastructure/repositories/drizzle-question.repository.js';

// Presentation
export * from './presentation/middlewares/auth.middleware.js';
export * from './presentation/controllers/question.controller.js';
export * from './presentation/routes/v1-questions.routes.js';
export * from './presentation/routes/index.js';
export * from './presentation/server.js';
