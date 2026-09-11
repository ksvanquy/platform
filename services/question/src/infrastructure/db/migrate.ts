import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { getQuestionDatabaseUrl, sanitizePostgresUrl } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runQuestionMigrations(customUrl?: string): Promise<void> {
  const rawUrl = customUrl || getQuestionDatabaseUrl();
  if (!rawUrl) {
    throw new Error('Cannot run question migrations: QUESTION_DATABASE_URL is not set.');
  }

  const connectionString = sanitizePostgresUrl(rawUrl);
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS questions (
        id VARCHAR(64) PRIMARY KEY NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        type VARCHAR(32) NOT NULL,
        topic_node_id VARCHAR(64),
        grade_node_id VARCHAR(64),
        difficulty VARCHAR(32) DEFAULT 'REMEMBER' NOT NULL,
        default_points INTEGER DEFAULT 1 NOT NULL,
        status VARCHAR(32) DEFAULT 'ACTIVE' NOT NULL,
        current_revision_id VARCHAR(64),
        owner_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS question_revisions (
        id VARCHAR(64) PRIMARY KEY NOT NULL,
        question_id VARCHAR(64) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        revision_number INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        options JSONB NOT NULL,
        pairs JSONB,
        explanation TEXT,
        rubric JSONB,
        media_assets JSONB,
        created_by VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_node_id);
      CREATE INDEX IF NOT EXISTS idx_questions_grade ON questions(grade_node_id);
      CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
      CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
      CREATE INDEX IF NOT EXISTS idx_questions_owner ON questions(owner_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_question_revision ON question_revisions(question_id, revision_number);
      CREATE INDEX IF NOT EXISTS idx_qrev_question ON question_revisions(question_id);
    `);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runQuestionMigrations()
    .then(() => {
      console.log('✅ Question Service migrations completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Question Service migration failed:', err);
      process.exit(1);
    });
}
