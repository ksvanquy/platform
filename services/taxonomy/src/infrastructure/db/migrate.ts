import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';
import { getTaxonomyDatabaseUrl, sanitizePostgresUrl, closeTaxonomyDb, isTaxonomyDbConfigured } from './connection.js';

export async function runTaxonomyMigrations(): Promise<void> {
  if (!isTaxonomyDbConfigured()) {
    console.warn('⚠️ TAXONOMY_DATABASE_URL is not configured. Skipping PostgreSQL migrations.');
    return;
  }

  const rawUrl = getTaxonomyDatabaseUrl()!;
  const connectionString = sanitizePostgresUrl(rawUrl);
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS taxonomies (
        id VARCHAR(64) PRIMARY KEY NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        is_hierarchical BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_taxonomies_code ON taxonomies(code);

      CREATE TABLE IF NOT EXISTS taxonomy_nodes (
        id VARCHAR(64) PRIMARY KEY NOT NULL,
        taxonomy_id VARCHAR(64) NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
        parent_id VARCHAR(64),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_taxonomy ON taxonomy_nodes(taxonomy_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_parent ON taxonomy_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_sort ON taxonomy_nodes(taxonomy_id, sort_order);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_nodes_active_slug ON taxonomy_nodes(taxonomy_id, slug) WHERE deleted_at IS NULL;
    `);
  } finally {
    await sql.end();
  }
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
