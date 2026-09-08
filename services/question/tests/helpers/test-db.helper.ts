import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../src/infrastructure/db/schema.js';
import { seedQuestionDatabase } from '../../src/infrastructure/db/seed.js';
import { DrizzleQuestionRepository } from '../../src/infrastructure/repositories/drizzle-question.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TestQuestionContext {
  client: PGlite;
  db: any;
  repo: DrizzleQuestionRepository;
  cleanup: () => Promise<void>;
}

export async function setupTestQuestionDb(): Promise<TestQuestionContext> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  const migrationsDir = path.resolve(__dirname, '../../drizzle/migrations');
  if (fs.existsSync(migrationsDir)) {
    const sqlFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of sqlFiles) {
      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const statements = sqlContent
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        await client.exec(stmt);
      }
    }
  }

  await seedQuestionDatabase(db);

  const repo = new DrizzleQuestionRepository(db as any);

  return {
    client,
    db,
    repo,
    cleanup: async () => {
      await client.close();
    },
  };
}
