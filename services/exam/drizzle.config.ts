import { defineConfig } from 'drizzle-kit';
import { getExamDatabaseUrl } from './src/infrastructure/db/connection.js';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getExamDatabaseUrl() || 'postgres://postgres:root@localhost:5432/exam_db',
  },
  verbose: true,
  strict: true,
});
