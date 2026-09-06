import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlClient: postgres.Sql | null = null;
let envAttempted = false;

/**
 * Tự động nạp cấu hình môi trường .env khi chạy cục bộ
 */
export function loadEnvIfAvailable(force = false): void {
  if (envAttempted && !force) return;
  envAttempted = true;

  if (!force && (process.env.NODE_ENV === 'test' || process.env.VITEST)) {
    return;
  }

  if (process.env.QUIZ_DATABASE_URL) return;

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
              if (!process.env[key]) {
                process.env[key] = val;
              }
            }
          }
        }
      } catch {
        // bỏ qua lỗi đọc file
      }
      if (process.env.QUIZ_DATABASE_URL) break;
    }
  }
}

/**
 * Xử lý an toàn URL kết nối, loại bỏ lỗi tham số 'schema=public'
 */
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

export function getQuizDatabaseUrl(): string | undefined {
  loadEnvIfAvailable();
  // Chú ý: Sử dụng QUIZ_DATABASE_URL, tách biệt hoàn toàn với AUTH_DATABASE_URL
  const url = process.env.QUIZ_DATABASE_URL?.trim();
  if (!url || url === 'QUIZ_DATABASE_URL') return undefined;
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    return undefined;
  }
  return sanitizePostgresUrl(url);
}

export function isQuizDbConfigured(): boolean {
  return Boolean(getQuizDatabaseUrl());
}

/**
 * Lấy đối tượng kết nối Drizzle ORM tới quiz_db (Singleton)
 * Thực thi nguyên tắc Fail-Fast nếu chưa có biến môi trường
 */
export function getQuizDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString = getQuizDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      'FATAL ERROR: QUIZ_DATABASE_URL is not defined in environment variables. ' +
      'In-memory persistence has been permanently removed; PostgreSQL (quiz_db) is strictly required.'
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

export async function closeQuizDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
    dbInstance = null;
  }
}
