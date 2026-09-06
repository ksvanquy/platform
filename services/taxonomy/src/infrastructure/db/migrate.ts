import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getTaxonomyDb, closeTaxonomyDb, isTaxonomyDbConfigured } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, '../../../drizzle/migrations');

export async function runTaxonomyMigrations(): Promise<void> {
  if (!isTaxonomyDbConfigured()) {
    console.warn('⚠️ TAXONOMY_DATABASE_URL is not configured. Skipping PostgreSQL migrations.');
    return;
  }

  console.log('🔄 Running Taxonomy Service PostgreSQL migrations...');
  const db = getTaxonomyDb();
  await migrate(db, { migrationsFolder });
  console.log('✅ Taxonomy Service PostgreSQL migrations completed successfully.');
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
  runTaxonomyMigrations()
    .then(() => closeTaxonomyDb())
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
