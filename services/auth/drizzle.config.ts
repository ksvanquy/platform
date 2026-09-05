import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.AUTH_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/auth_db',
  },
  verbose: true,
  strict: true,
});


