import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlClient: postgres.Sql | null = null;
let envAttempted = false;

export function loadEnvIfAvailable(force = false): void {
  if (envAttempted && !force) return;
  envAttempted = true;

  if (!force && (process.env.NODE_ENV === 'test' || process.env.VITEST)) {
    return;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(__dirname, '../../../../../.env'),
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        if (typeof (process as any).loadEnvFile === 'function') {
          (process as any).loadEnvFile(envPath);
        } else {
          const content = fs.readFileSync(envPath, 'utf-8');
          for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx !== -1) {
              const key = trimmed.slice(0, eqIdx).trim();
              const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
              if (!process.env[key]) {
                process.env[key] = val;
              }
            }
          }
        }
      } catch {
        // ignore read error
      }
      break;
    }
  }
}

export function sanitizePostgresUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has('schema')) {
      const schemaVal = parsed.searchParams.get('schema');
      parsed.searchParams.delete('schema');
      if (schemaVal && schemaVal !== 'public' && !parsed.searchParams.has('search_path')) {
        parsed.searchParams.set('search_path', schemaVal);
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl
      .replace(/([?&])schema=public(&|$)/g, (_m, p1, p2) => (p2 === '&' ? p1 : ''))
      .replace(/([?&])schema=([^&#]+)(&|$)/g, (_m, p1, schemaVal, p2) => {
        const next = p2 === '&' ? '&' : '';
        return `${p1}search_path=${schemaVal}${next}`;
      })
      .replace(/\?$/, '');
  }
}

export function getQuestionDatabaseUrl(): string | undefined {
  loadEnvIfAvailable();
  const url = (process.env.QUESTION_DATABASE_URL || process.env.DATABASE_URL)?.trim();
  if (!url || url === 'QUESTION_DATABASE_URL' || url === 'DATABASE_URL') return undefined;
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    return undefined;
  }
  return sanitizePostgresUrl(url);
}

export function isQuestionDbConfigured(): boolean {
  return Boolean(getQuestionDatabaseUrl());
}

export function getQuestionDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString = getQuestionDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      'FATAL ERROR: QUESTION_DATABASE_URL is not defined in environment variables. ' +
      'In-memory persistence has been permanently removed; PostgreSQL (question_db) is strictly required.'
    );
  }

  sqlClient = postgres(connectionString, {
    max: 15,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });

  dbInstance = drizzle(sqlClient, { schema });
  return dbInstance;
}

export async function closeQuestionDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
    dbInstance = null;
  }
}
