import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../src/infrastructure/db/schema.js';
import { seedAuthDb } from '../../src/infrastructure/db/seed.js';
import { DrizzleUserRepository, DrizzleTokenStorage } from '../../src/infrastructure/persistence/drizzle-user.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TestPostgresContext {
  client: PGlite;
  db: ReturnType<typeof drizzle<typeof schema>>;
  userRepo: DrizzleUserRepository;
  tokenStorage: DrizzleTokenStorage;
  cleanup: () => Promise<void>;
}

export async function setupTestPostgresDb(): Promise<TestPostgresContext> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Initialize schema tables directly in test database
  await client.exec(`
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
      id VARCHAR(64) PRIMARY KEY NOT NULL,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      family_id VARCHAR(64) NOT NULL,
      is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);

  // Seed default RBAC permissions, roles, and default users
  await seedAuthDb(db);

  const userRepo = new DrizzleUserRepository(db);
  const tokenStorage = new DrizzleTokenStorage(db);

  return {
    client,
    db,
    userRepo,
    tokenStorage,
    cleanup: async () => {
      await client.close();
    },
  };
}
