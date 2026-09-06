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

  // Trong môi trường kiểm thử (Vitest / test), mặc định không nạp .env để các bài test chạy in-memory độc lập
  if (!force && (process.env.NODE_ENV === 'test' || process.env.VITEST)) {
    return;
  }

  if (process.env.AUTH_DATABASE_URL) return;

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
        // ignore parse errors and proceed
      }
      if (process.env.AUTH_DATABASE_URL) break;
    }
  }
}

export function sanitizePostgresUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    // Trong PostgreSQL protocol StartupMessage, 'schema' không phải là tham số cấu hình máy chủ GUC hợp lệ.
    // Thư viện postgres.js tự động gửi mọi searchParams không nhận diện trong StartupMessage.
    // Nếu URL chứa '?schema=public' (thường gặp khi copy từ Prisma hoặc Supabase),
    // PostgreSQL sẽ lập tức ngắt kết nối với lỗi FATAL: PostgresError: unrecognized configuration parameter "schema" (code 42704).
    if (parsed.searchParams.has('schema')) {
      const schemaVal = parsed.searchParams.get('schema');
      parsed.searchParams.delete('schema');
      // Nếu người dùng chỉ định schema tùy biến khác public, chuyển sang search_path hợp lệ của PostgreSQL
      if (schemaVal && schemaVal !== 'public' && !parsed.searchParams.has('search_path')) {
        parsed.searchParams.set('search_path', schemaVal);
      }
    }
    return parsed.toString();
  } catch {
    // Fallback nếu password có chứa ký tự đặc biệt chưa URL encode khiến URL() parse lỗi
    return rawUrl
      .replace(/([?&])schema=public(&|$)/g, (_m, p1, p2) => (p2 === '&' ? p1 : ''))
      .replace(/([?&])schema=([^&#]+)(&|$)/g, (_m, p1, schemaVal, p2) => {
        const next = p2 === '&' ? '&' : '';
        return `${p1}search_path=${schemaVal}${next}`;
      })
      .replace(/\?$/, '');
  }
}

export function getAuthDatabaseUrl(): string | undefined {
  loadEnvIfAvailable();
  const url = (process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL)?.trim();
  if (!url || url === 'AUTH_DATABASE_URL' || url === 'DATABASE_URL') return undefined;
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    return undefined;
  }
  return sanitizePostgresUrl(url);
}

export function isAuthDbConfigured(): boolean {
  return Boolean(getAuthDatabaseUrl());
}

export function getAuthDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString = getAuthDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      'FATAL ERROR: AUTH_DATABASE_URL is not defined in environment variables. In-memory mode has been permanently removed; PostgreSQL is strictly required.'
    );
  }

  sqlClient = postgres(connectionString, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });

  dbInstance = drizzle(sqlClient, { schema });
  return dbInstance;
}

export async function closeAuthDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
    dbInstance = null;
  }
}
