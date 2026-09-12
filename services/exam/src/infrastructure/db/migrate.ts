import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { getExamDatabaseUrl, sanitizePostgresUrl } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runExamMigrations(customUrl?: string): Promise<void> {
  const rawUrl = customUrl || getExamDatabaseUrl();
  if (!rawUrl) {
    throw new Error('Cannot run exam migrations: EXAM_DATABASE_URL is not set.');
  }

  const connectionString = sanitizePostgresUrl(rawUrl);
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

  try {
    // 1. Ensure core schema tables exist
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS exams (
        id VARCHAR(64) PRIMARY KEY,
        assessment_id VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        duration_minutes INTEGER NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT false,
        randomization_seed_base INTEGER NOT NULL DEFAULT 1337,
        status VARCHAR(32) NOT NULL DEFAULT 'READY',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_exams_assessment ON exams(assessment_id);
      CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);

      CREATE TABLE IF NOT EXISTS exam_master_payloads (
        exam_id VARCHAR(64) PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE,
        master_payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS exam_snapshots (
        id VARCHAR(64) PRIMARY KEY,
        exam_id VARCHAR(64) NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        variant_code VARCHAR(32) NOT NULL,
        content_hash VARCHAR(64) NOT NULL,
        permutation_mapping JSONB,
        frozen_payload JSONB,
        sanitized_manifest JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE exam_snapshots ADD COLUMN IF NOT EXISTS permutation_mapping JSONB;
      ALTER TABLE exam_snapshots ALTER COLUMN frozen_payload DROP NOT NULL;
      ALTER TABLE exam_snapshots ALTER COLUMN sanitized_manifest DROP NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_variant ON exam_snapshots(exam_id, variant_code);
      CREATE INDEX IF NOT EXISTS idx_exam_snapshots_exam ON exam_snapshots(exam_id);
    `);

    // 2. Run any generated migration SQL files if present
    const migrationsDir = path.resolve(__dirname, '../../../drizzle/migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, 'utf-8');
        const statements = sqlContent
          .split('--> statement-breakpoint')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          await sql.unsafe(statement);
        }
      }
    }
  } finally {
    await sql.end();
  }
}

const isDirectRun = Boolean(
  process.argv[1] &&
  path.normalize(fileURLToPath(import.meta.url)).toLowerCase() ===
    path.normalize(path.resolve(process.argv[1])).toLowerCase() &&
  process.env.NODE_ENV !== 'test' &&
  !process.env.VITEST
);

if (isDirectRun) {
  runExamMigrations()
    .then(() => {
      console.log('✅ Exam Service migrations completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Exam Service migration failed:', err);
      process.exit(1);
    });
}
