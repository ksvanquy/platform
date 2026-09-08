import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../src/infrastructure/db/schema.js';
import { seedQuizDatabase } from '../../src/infrastructure/db/seed.js';
import { DrizzleAuthoringRepository } from '../../src/infrastructure/repositories/drizzle-authoring.repository.js';
import { DrizzleDeliveryRepository } from '../../src/infrastructure/repositories/drizzle-delivery.repository.js';
import { DrizzleQuizLegacyRepository } from '../../src/infrastructure/repositories/drizzle-quiz-legacy.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TestQuizDbContext {
  client: PGlite;
  db: ReturnType<typeof drizzle<typeof schema>>;
  authoringRepo: DrizzleAuthoringRepository;
  deliveryRepo: DrizzleDeliveryRepository;
  legacyRepo: DrizzleQuizLegacyRepository;
  cleanup: () => Promise<void>;
}

export async function setupTestQuizDb(): Promise<TestQuizDbContext> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Read and apply all quiz_db migration SQL files in order
  const migrationsDir = path.resolve(__dirname, '../../drizzle/migrations');
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

  // Seed default quiz and published version into test database
  await seedQuizDatabase(db);

  const authoringRepo = new DrizzleAuthoringRepository(db);
  const deliveryRepo = new DrizzleDeliveryRepository(db);
  const legacyRepo = new DrizzleQuizLegacyRepository(db);

  return {
    client,
    db,
    authoringRepo,
    deliveryRepo,
    legacyRepo,
    cleanup: async () => {
      await client.close();
    },
  };
}
