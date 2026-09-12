import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

function loadEnv(): void {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        if (typeof process.loadEnvFile === 'function') {
          process.loadEnvFile(envPath);
        } else {
          const content = fs.readFileSync(envPath, 'utf-8');
          for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx !== -1) {
              const key = trimmed.slice(0, eqIdx).trim();
              const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
              if (!process.env[key]) process.env[key] = val;
            }
          }
        }
      } catch {}
      if (process.env.ATTEMPT_DATABASE_URL || process.env.DATABASE_URL) break;
    }
  }
}
loadEnv();

const isSubdir = process.cwd().replace(/\\/g, '/').endsWith('services/attempt');
const schema = isSubdir ? './src/infrastructure/db/schema.ts' : './services/attempt/src/infrastructure/db/schema.ts';

export default defineConfig({
  schema,
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.ATTEMPT_DATABASE_URL || process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/quiz_core',
  },
  verbose: true,
  strict: true,
});

