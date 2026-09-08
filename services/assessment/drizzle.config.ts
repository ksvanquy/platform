import { defineConfig } from 'drizzle-kit';
import { getAssessmentDatabaseUrl } from './src/infrastructure/db/connection.js';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: getAssessmentDatabaseUrl() || 'postgres://postgres:root@localhost:5432/assessment_db',
  },
  verbose: true,
  strict: true,
});
