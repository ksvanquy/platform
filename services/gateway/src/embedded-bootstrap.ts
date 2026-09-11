import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePgLite } from 'drizzle-orm/pglite';
import * as taxonomySchema from '@platform/taxonomy-service';
import * as questionSchema from '@platform/question-service';
import * as assessmentSchema from '@platform/assessment-service';
import * as examSchema from '@platform/exam-service';
import * as attemptSchema from '@platform/attempt-service';

import { DrizzleTaxonomyRepository, seedTaxonomyDatabase } from '@platform/taxonomy-service';
import { DrizzleQuestionRepository, seedQuestionDatabase } from '@platform/question-service';
import { DrizzleAssessmentRepository, seedAssessmentDatabase } from '@platform/assessment-service';
import {
  DrizzleExamRepository,
  seedExamDatabase,
  DirectQuestionClientAdapter,
  DirectAssessmentClientAdapter,
} from '@platform/exam-service';
import {
  DrizzleAttemptRepository,
  DirectExamClientAdapter,
} from '@platform/attempt-service';

export interface EmbeddedBootstrapResult {
  taxonomyRepo: DrizzleTaxonomyRepository;
  questionRepo: DrizzleQuestionRepository;
  assessmentRepo: DrizzleAssessmentRepository;
  examRepo: DrizzleExamRepository;
  attemptRepo: DrizzleAttemptRepository;
  examQClient: DirectQuestionClientAdapter;
  examAsmClient: DirectAssessmentClientAdapter;
}

let bootstrapResult: EmbeddedBootstrapResult | null = null;
let bootstrapPromise: Promise<EmbeddedBootstrapResult> | null = null;

export async function bootstrapEmbeddedMicroservices(): Promise<EmbeddedBootstrapResult> {
  if (bootstrapResult) {
    return bootstrapResult;
  }
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    // 1. Taxonomy Service DB (PGlite)
    const taxClient = new PGlite();
    const taxDb = drizzlePgLite(taxClient, { schema: taxonomySchema as any });
    await taxClient.exec(`
      CREATE TABLE IF NOT EXISTS taxonomies (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        is_hierarchical BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS taxonomy_nodes (
        id VARCHAR(64) PRIMARY KEY,
        taxonomy_id VARCHAR(64) NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
        parent_id VARCHAR(64) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
        metadata JSONB NOT NULL DEFAULT '{}',
        deleted_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await seedTaxonomyDatabase(taxDb as any);
    const taxonomyRepo = new DrizzleTaxonomyRepository(taxDb as any);

    // 2. Question Service DB (PGlite)
    const qClient = new PGlite();
    const qDb = drizzlePgLite(qClient, { schema: questionSchema as any });
    await qClient.exec(`
      CREATE TABLE IF NOT EXISTS questions (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        type VARCHAR(32) NOT NULL,
        topic_node_id VARCHAR(64),
        grade_node_id VARCHAR(64),
        difficulty VARCHAR(32) NOT NULL DEFAULT 'REMEMBER',
        default_points INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        current_revision_id VARCHAR(64),
        owner_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS question_revisions (
        id VARCHAR(64) PRIMARY KEY,
        question_id VARCHAR(64) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        revision_number INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        options JSONB NOT NULL,
        pairs JSONB,
        explanation TEXT,
        rubric JSONB,
        media_assets JSONB,
        created_by VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_question_revision UNIQUE (question_id, revision_number)
      );
    `);
    await seedQuestionDatabase(qDb as any);
    const questionRepo = new DrizzleQuestionRepository(qDb as any);

    // 3. Assessment Service DB (PGlite)
    const asmClient = new PGlite();
    const asmDb = drizzlePgLite(asmClient, { schema: assessmentSchema as any });
    await asmClient.exec(`
      CREATE TABLE IF NOT EXISTS assessments (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        owner_id VARCHAR(64) NOT NULL,
        primary_topic_node_id VARCHAR(64),
        grade_node_id VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        current_blueprint_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS blueprints (
        id VARCHAR(64) PRIMARY KEY,
        assessment_id VARCHAR(64) NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 45,
        passing_percentage INTEGER NOT NULL DEFAULT 50,
        max_attempts INTEGER NOT NULL DEFAULT 1,
        criteria JSONB NOT NULL DEFAULT '[]',
        scoring_policy JSONB NOT NULL DEFAULT '{"strategyType": "STANDARD", "roundingDecimal": 2}',
        is_locked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_assessment_blueprint UNIQUE (assessment_id, version_number)
      );
    `);
    await seedAssessmentDatabase(asmDb as any);
    const assessmentRepo = new DrizzleAssessmentRepository(asmDb as any);

    // 4. Exam Service DB (PGlite)
    const examClient = new PGlite();
    const examDb = drizzlePgLite(examClient, { schema: examSchema as any });
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
    const examRepo = new DrizzleExamRepository(examDb as any);
    const examQClient = new DirectQuestionClientAdapter(questionRepo);
    const examAsmClient = new DirectAssessmentClientAdapter(assessmentRepo);
    await seedExamDatabase(examRepo, examQClient, examAsmClient);

    // 5. Attempt Service DB (PGlite)
    const attemptClient = new PGlite();
    const attemptDb = drizzlePgLite(attemptClient, { schema: attemptSchema as any });
    await attemptClient.exec(`
      CREATE TABLE IF NOT EXISTS attempts (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        exam_id VARCHAR(64) NOT NULL,
        snapshot_id VARCHAR(64) NOT NULL,
        variant_code VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
        status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
        version INTEGER NOT NULL DEFAULT 1,
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
    const attemptRepo = new DrizzleAttemptRepository(attemptDb as any);

    bootstrapResult = {
      taxonomyRepo,
      questionRepo,
      assessmentRepo,
      examRepo,
      attemptRepo,
      examQClient,
      examAsmClient,
    };

    return bootstrapResult;
  })();

  return bootstrapPromise;
}
