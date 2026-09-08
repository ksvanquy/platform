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
  const sql = postgres(connectionString, { max: 1 });

  try {
    const migrationsDir = path.resolve(__dirname, '../../../drizzle/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migration folder found for Question Service.');
      return;
    }

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
