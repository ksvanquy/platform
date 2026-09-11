import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@platform/contracts': path.resolve(import.meta.dirname, 'packages/contracts/src/index.ts'),
      '@platform/security': path.resolve(import.meta.dirname, 'packages/security/src/index.ts'),
      '@platform/auth-client': path.resolve(import.meta.dirname, 'packages/auth-client/src/index.ts'),
      '@platform/api-client': path.resolve(import.meta.dirname, 'packages/api-client/src/index.ts'),
      '@platform/auth-service': path.resolve(import.meta.dirname, 'services/auth/src/index.ts'),
      '@platform/taxonomy-service': path.resolve(import.meta.dirname, 'services/taxonomy/src/index.ts'),
      '@platform/question-service': path.resolve(import.meta.dirname, 'services/question/src/index.ts'),
      '@platform/assessment-service': path.resolve(import.meta.dirname, 'services/assessment/src/index.ts'),
      '@platform/exam-service': path.resolve(import.meta.dirname, 'services/exam/src/index.ts'),
      '@platform/attempt-service': path.resolve(import.meta.dirname, 'services/attempt/src/index.ts'),
    },
  },
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
