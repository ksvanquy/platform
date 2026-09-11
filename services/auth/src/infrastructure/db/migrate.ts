import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';
import { getAuthDatabaseUrl, sanitizePostgresUrl, closeAuthDb, isAuthDbConfigured } from './connection.js';

export async function runAuthMigrations(): Promise<void> {
  if (!isAuthDbConfigured()) {
    console.warn('⚠️ AUTH_DATABASE_URL is not configured. Skipping PostgreSQL migrations.');
    return;
  }

  const rawUrl = getAuthDatabaseUrl()!;
  const connectionString = sanitizePostgresUrl(rawUrl);
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS permissions (
        id VARCHAR(64) PRIMARY KEY NOT NULL,
        code VARCHAR(128) NOT NULL UNIQUE,
        resource VARCHAR(64) NOT NULL,
        action VARCHAR(64) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR(64) PRIMARY KEY NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        is_system BOOLEAN DEFAULT FALSE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        password_hash TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
        is_active BOOLEAN DEFAULT TRUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id VARCHAR(64) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        granted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        PRIMARY KEY (role_id, permission_id)
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        assigned_by VARCHAR(64),
        PRIMARY KEY (user_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_hash TEXT PRIMARY KEY NOT NULL,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        family_id VARCHAR(64),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
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
  runAuthMigrations()
    .then(() => closeAuthDb())
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
