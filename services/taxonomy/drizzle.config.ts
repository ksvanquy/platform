import { defineConfig } from 'drizzle-kit';

const isSubdir = process.cwd().replace(/\\/g, '/').endsWith('services/taxonomy');
const schema = isSubdir ? './src/infrastructure/db/schema.ts' : './services/taxonomy/src/infrastructure/db/schema.ts';
const out = isSubdir ? './drizzle/migrations' : './services/taxonomy/drizzle/migrations';

export default defineConfig({
  schema,
  out,
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.TAXONOMY_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/taxonomy_db',
  },
  verbose: true,
  strict: true,
});
