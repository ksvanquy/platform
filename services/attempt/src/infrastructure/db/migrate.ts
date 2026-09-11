import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { getAttemptDatabaseUrl, sanitizePostgresUrl } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runAttemptMigrations(customUrl?: string): Promise<void> {
  const rawUrl = customUrl || getAttemptDatabaseUrl();
  if (!rawUrl) {
    throw new Error('Cannot run attempt migrations: ATTEMPT_DATABASE_URL is not set.');
  }

  const connectionString = sanitizePostgresUrl(rawUrl);
  const sql = postgres(connectionString, { max: 1 });

  try {
    // 1. Ensure core schema tables exist
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS attempts (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        exam_id VARCHAR(64) NOT NULL,
        snapshot_id VARCHAR(64) NOT NULL,
        variant_code VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
        status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
        version INTEGER NOT NULL DEFAULT 1,
        started_at TIMESTAMPTZ,
        deadline TIMESTAMPTZ,
        submitted_at TIMESTAMPTZ,
        duration_minutes INTEGER NOT NULL,
        answers JSONB NOT NULL DEFAULT '{}'::jsonb,
        score_result JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Idempotent column addition & backfill for existing databases
      ALTER TABLE attempts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
      UPDATE attempts SET version = 1 WHERE version IS NULL;

      CREATE INDEX IF NOT EXISTS idx_attempts_user_exam ON attempts(user_id, exam_id);
      CREATE INDEX IF NOT EXISTS idx_attempts_status_deadline ON attempts(status, deadline);
      CREATE INDEX IF NOT EXISTS idx_attempts_exam ON attempts(exam_id);
      CREATE INDEX IF NOT EXISTS idx_attempts_id_version_status ON attempts(id, version, status);

      CREATE TABLE IF NOT EXISTS attempt_events (
        id VARCHAR(64) PRIMARY KEY,
        attempt_id VARCHAR(64) NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        client_timestamp TIMESTAMPTZ NOT NULL,
        server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_events_attempt ON attempt_events(attempt_id);
      CREATE INDEX IF NOT EXISTS idx_events_user_time ON attempt_events(user_id, server_timestamp);
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
  runAttemptMigrations()
    .then(() => {
      console.log('✅ Attempt Service migrations completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Attempt Service migration failed:', err);
      process.exit(1);
    });
}
