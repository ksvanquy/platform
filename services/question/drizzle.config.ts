import { defineConfig } from 'drizzle-kit';
import { getQuestionDatabaseUrl } from './src/infrastructure/db/connection.js';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: getQuestionDatabaseUrl() || 'postgres://postgres:root@localhost:5432/question_db',
  },
  verbose: true,
  strict: true,
});
