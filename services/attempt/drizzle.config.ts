import { defineConfig } from 'drizzle-kit';
import { getAttemptDatabaseUrl } from './src/infrastructure/db/connection.js';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getAttemptDatabaseUrl() || 'postgres://postgres:root@localhost:5432/attempt_db',
  },
  verbose: true,
  strict: true,
});
