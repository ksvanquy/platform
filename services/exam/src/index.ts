/**
 * @platform/exam-service
 * Autonomous Exam Service with Matrix Solver, Mulberry32 PRNG Shuffling, and Tamper-Proof Snapshots
 */

export const EXAM_SERVICE_NAME = 'exam-service';

// Domain
export * from './domain/entities/exam.entity.js';
export * from './domain/errors/exam-domain.errors.js';
export * from './domain/ports/exam.repository.port.js';
export * from './domain/services/prng.service.js';
export * from './domain/services/matrix-solver.service.js';

// Application
export * from './application/use-cases/generate-exam.use-case.js';
export * from './application/use-cases/get-exam.use-case.js';
export * from './application/use-cases/list-exams.use-case.js';
export * from './application/use-cases/get-exam-snapshot.use-case.js';
export * from './application/use-cases/update-exam.use-case.js';
export * from './application/use-cases/delete-exam.use-case.js';
export * from './application/use-cases/generate-variants.use-case.js';

// Infrastructure
export * from './infrastructure/db/schema.js';
export * from './infrastructure/db/connection.js';
export * from './infrastructure/db/migrate.js';
export * from './infrastructure/db/seed.js';
export * from './infrastructure/repositories/drizzle-exam.repository.js';
export * from './infrastructure/adapters/direct-question-client.adapter.js';
export * from './infrastructure/adapters/direct-assessment-client.adapter.js';

// Presentation
export * from './presentation/middlewares/auth.middleware.js';
export * from './presentation/controllers/exam.controller.js';
export * from './presentation/routes/v1-exams.routes.js';
export * from './presentation/routes/index.js';
export * from './presentation/server.js';
