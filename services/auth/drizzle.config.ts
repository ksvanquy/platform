import { defineConfig } from 'drizzle-kit';

const isSubdir = process.cwd().replace(/\\/g, '/').endsWith('services/auth');
const schema = isSubdir ? './src/infrastructure/db/schema.ts' : './services/auth/src/infrastructure/db/schema.ts';
const out = isSubdir ? './drizzle/migrations' : './services/auth/drizzle/migrations';

export default defineConfig({
  schema,
  out,
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.AUTH_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/auth_db',
  },
  verbose: true,
  strict: true,
});


