import { defineConfig } from 'drizzle-kit';

const isSubdir = process.cwd().replace(/\\/g, '/').endsWith('services/quiz');
const schema = isSubdir ? './src/infrastructure/db/schema.ts' : './services/quiz/src/infrastructure/db/schema.ts';
const out = isSubdir ? './drizzle/migrations' : './services/quiz/drizzle/migrations';

export default defineConfig({
  schema,
  out,
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.QUIZ_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/quiz_db',
  },
  verbose: true,
  strict: true,
});


