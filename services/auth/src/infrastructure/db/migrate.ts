import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getAuthDb, closeAuthDb, isAuthDbConfigured } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, '../../../drizzle/migrations');

export async function runAuthMigrations(): Promise<void> {
  if (!isAuthDbConfigured()) {
    console.warn('⚠️ AUTH_DATABASE_URL is not configured. Skipping PostgreSQL migrations.');
    return;
  }

  console.log('🔄 Running Auth Service PostgreSQL migrations...');
  const db = getAuthDb();
  await migrate(db, { migrationsFolder });
  console.log('✅ Auth Service PostgreSQL migrations completed successfully.');
}

// Allow direct execution (cross-platform Windows & POSIX support)
const isDirectRun = Boolean(
  process.argv[1] &&
  (
    path.normalize(fileURLToPath(import.meta.url)).toLowerCase() ===
      path.normalize(path.resolve(process.argv[1])).toLowerCase() ||
    process.argv[1].replace(/\\/g, '/').endsWith('migrate.ts') ||
    process.argv[1].replace(/\\/g, '/').endsWith('migrate.js')
  )
);

if (isDirectRun) {
  runAuthMigrations()
    .then(() => closeAuthDb())
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
