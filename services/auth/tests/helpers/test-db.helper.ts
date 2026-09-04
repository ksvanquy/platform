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

  // Read and apply migration SQL
  const migrationPath = path.resolve(__dirname, '../../drizzle/migrations/0000_remarkable_grandmaster.sql');
  const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
  const statements = sqlContent
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await client.exec(stmt);
  }

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
