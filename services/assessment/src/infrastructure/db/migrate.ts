import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { getAssessmentDatabaseUrl, sanitizePostgresUrl } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runAssessmentMigrations(customUrl?: string): Promise<void> {
  const rawUrl = customUrl || getAssessmentDatabaseUrl();
  if (!rawUrl) {
    throw new Error('Cannot run assessment migrations: ASSESSMENT_DATABASE_URL is not set.');
  }

  const connectionString = sanitizePostgresUrl(rawUrl);
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS assessments (
        id VARCHAR(64) PRIMARY KEY NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        owner_id VARCHAR(64) NOT NULL,
        primary_topic_node_id VARCHAR(64),
        grade_node_id VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        current_blueprint_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_assessments_topic ON assessments(primary_topic_node_id);
      CREATE INDEX IF NOT EXISTS idx_assessments_grade ON assessments(grade_node_id);
      CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments(status);
      CREATE INDEX IF NOT EXISTS idx_assessments_owner ON assessments(owner_id);

      CREATE TABLE IF NOT EXISTS blueprints (
        id VARCHAR(64) PRIMARY KEY NOT NULL,
        assessment_id VARCHAR(64) NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 45,
        passing_percentage INTEGER NOT NULL DEFAULT 50,
        max_attempts INTEGER NOT NULL DEFAULT 1,
        criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
        scoring_policy JSONB NOT NULL DEFAULT '{"strategyType":"STANDARD","roundingDecimal":2}'::jsonb,
        is_locked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_assessment_blueprint ON blueprints(assessment_id, version_number);
      CREATE INDEX IF NOT EXISTS idx_bp_assessment ON blueprints(assessment_id);
    `);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runAssessmentMigrations()
    .then(() => {
      console.log('✅ Assessment Service migrations completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Assessment Service migration failed:', err);
      process.exit(1);
    });
}
