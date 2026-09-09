import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePgLite } from 'drizzle-orm/pglite';
import * as examSchema from '../../services/exam/src/infrastructure/db/schema.js';
import * as attemptSchema from '../../services/attempt/src/infrastructure/db/schema.js';
import { setupTestTaxonomyDb, TestTaxonomyContext } from '../../services/taxonomy/tests/helpers/test-db.helper.js';
import { setupTestQuestionDb, TestQuestionContext } from '../../services/question/tests/helpers/test-db.helper.js';
import { setupTestAssessmentDb, TestAssessmentContext } from '../../services/assessment/tests/helpers/test-db.helper.js';
import { DrizzleExamRepository } from '../../services/exam/src/infrastructure/repositories/drizzle-exam.repository.js';
import { DirectQuestionClientAdapter } from '../../services/exam/src/infrastructure/adapters/direct-question-client.adapter.js';
import { DirectAssessmentClientAdapter } from '../../services/exam/src/infrastructure/adapters/direct-assessment-client.adapter.js';
import { seedExamDatabase } from '../../services/exam/src/infrastructure/db/seed.js';
import { DrizzleAttemptRepository } from '../../services/attempt/src/infrastructure/repositories/drizzle-attempt.repository.js';
import { DirectExamClientAdapter } from '../../services/attempt/src/infrastructure/adapters/direct-exam-client.adapter.js';
import {
  setTaxonomyRepository,
  setQuestionRepository,
  setAssessmentRepository,
  setExamRepository,
  setAttemptRepository,
} from '../../services/gateway/src/server.js';

export interface FullMicroservicesContext {
  taxonomyCtx: TestTaxonomyContext;
  questionCtx: TestQuestionContext;
  assessmentCtx: TestAssessmentContext;
  examRepo: DrizzleExamRepository;
  attemptRepo: DrizzleAttemptRepository;
  cleanup: () => Promise<void>;
}

export async function setupFullMicroservicesDb(): Promise<FullMicroservicesContext> {
  // 1. Setup Taxonomy Service DB
  const taxonomyCtx = await setupTestTaxonomyDb();
  setTaxonomyRepository(taxonomyCtx.repo);

  // 2. Setup Question Service DB
  const questionCtx = await setupTestQuestionDb();
  setQuestionRepository(questionCtx.repo);

  // 3. Setup Assessment Service DB
  const assessmentCtx = await setupTestAssessmentDb();
  setAssessmentRepository(assessmentCtx.repo);

  // 4. Setup Exam Service DB (PGlite)
  const examClient = new PGlite();
  const examDb = drizzlePgLite(examClient, { schema: examSchema });

  await examClient.exec(`
    CREATE TABLE IF NOT EXISTS exams (
      id VARCHAR(64) PRIMARY KEY,
      assessment_id VARCHAR(64) NOT NULL,
      code VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      start_time TIMESTAMP WITH TIME ZONE,
      end_time TIMESTAMP WITH TIME ZONE,
      duration_minutes INTEGER NOT NULL,
      is_published BOOLEAN NOT NULL DEFAULT FALSE,
      randomization_seed_base INTEGER NOT NULL DEFAULT 1337,
      status VARCHAR(32) NOT NULL DEFAULT 'READY',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS exam_snapshots (
      id VARCHAR(64) PRIMARY KEY,
      exam_id VARCHAR(64) NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      variant_code VARCHAR(32) NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      frozen_payload JSONB NOT NULL,
      sanitized_manifest JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_exam_variant UNIQUE (exam_id, variant_code)
    );
  `);

  const examRepo = new DrizzleExamRepository(examDb);
  const examQClient = new DirectQuestionClientAdapter(questionCtx.repo);
  const examAsmClient = new DirectAssessmentClientAdapter(assessmentCtx.repo);

  // Seed standard exams
  await seedExamDatabase(examRepo, examQClient, examAsmClient);
  setExamRepository(examRepo, examQClient, examAsmClient);

  // 5. Setup Attempt Service DB (PGlite)
  const attemptClient = new PGlite();
  const attemptDb = drizzlePgLite(attemptClient, { schema: attemptSchema });

  await attemptClient.exec(`
    CREATE TABLE IF NOT EXISTS attempts (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      exam_id VARCHAR(64) NOT NULL,
      snapshot_id VARCHAR(64) NOT NULL,
      variant_code VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
      status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
      started_at TIMESTAMP WITH TIME ZONE,
      deadline TIMESTAMP WITH TIME ZONE,
      submitted_at TIMESTAMP WITH TIME ZONE,
      duration_minutes INTEGER NOT NULL,
      answers JSONB NOT NULL DEFAULT '{}',
      score_result JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attempt_events (
      id VARCHAR(64) PRIMARY KEY,
      attempt_id VARCHAR(64) NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
      user_id VARCHAR(64) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      client_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
      server_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'
    );
  `);

  const attemptRepo = new DrizzleAttemptRepository(attemptDb);
  const attemptExamClient = new DirectExamClientAdapter(examRepo);
  setAttemptRepository(attemptRepo, attemptExamClient);

  return {
    taxonomyCtx,
    questionCtx,
    assessmentCtx,
    examRepo,
    attemptRepo,
    cleanup: async () => {
      await attemptClient.close();
      await examClient.close();
      await assessmentCtx.cleanup();
      await questionCtx.cleanup();
      await taxonomyCtx.cleanup();
    },
  };
}
