# THIẾT KẾ KIẾN TRÚC & KẾ HOẠCH THỰC THI: CHUYỂN ĐỔI QUIZ SERVICE SANG POSTGRESQL & DRIZZLE ORM (DATABASE: `quiz_db`)

**Dự án:** Quiz Assessment Platform Monorepo  
**Dịch vụ trọng tâm:** `@platform/quiz-service` (`services/quiz`), `@platform/contracts`  
**Cơ sở dữ liệu đích:** `quiz_db` (Tách biệt hoàn toàn vật lý và logic với `auth_db`)  
**Định hướng chiến lược:** **100% PostgreSQL - Xóa bỏ hoàn toàn In-Memory (Zero In-Memory Policy)**, Fail-Fast Enforcement, Database-per-Service Architecture, Chuẩn hóa 3NF + JSONB linh hoạt.  
**Thư mục lưu trữ:** `/plan/quiz_service_psql_drizzle_migration_plan.md`  

---

## I. TỔNG QUAN & NGUYÊN TẮC THIẾT KẾ CỐT LÕI (CORE PRINCIPLES & BOUNDARY CONTEXT)

Tiếp nối sự thành công trong việc tái cấu trúc Auth Service sang 100% PostgreSQL RBAC, Quiz Service cần được nâng cấp toàn diện từ trạng thái lưu trữ tạm thời trong RAM (`InMemoryQuizRepository`, `InMemoryAssessmentRepository`) lên cơ sở dữ liệu quan hệ chuẩn công nghiệp **PostgreSQL** thông qua **Drizzle ORM**.

### 7 Nguyên Tắc Thiết Kế Trọng Tâm:

1. **Độc lập Bounded Context & Cơ sở dữ liệu Riêng biệt (Database-per-Service Architecture)**:
   - Cơ sở dữ liệu của Quiz Service mang tên **`quiz_db`**, được quản lý độc lập hoàn toàn với `auth_db`.
   - Kết nối thông qua biến môi trường riêng biệt: `QUIZ_DATABASE_URL` (ví dụ: `postgres://postgres:postgres@localhost:5432/quiz_db`).
   - Quiz Service không thực hiện bất kỳ câu truy vấn Cross-Database hay Foreign Key vật lý nào sang `auth_db`.
   - Thông tin nhận dạng người dùng (`userId`, `roles`, `permissions`, `tenantId`) được tiếp nhận thông qua chữ ký số phân tán JWT RS256/Public Key JWKS được giải mã tại `authContextMiddleware`.

2. **Xóa bỏ Hoàn toàn In-Memory (Zero In-Memory Persistence Policy)**:
   - Triệt để xóa bỏ các lớp lưu trữ tạm thời trong RAM:
     - `services/quiz/src/infrastructure/repositories/in-memory-quiz.repository.ts` (DELETED).
     - `services/quiz/src/infrastructure/repositories/in-memory-assessment.repository.ts` (DELETED).
   - Mọi thực thể đề thi (`Quiz`), phiên bản đóng băng (`QuizVersion`), và phiên làm bài (`Attempt`) bắt buộc phải được lưu trữ và truy xuất từ PostgreSQL thông qua Drizzle ORM.

3. **Chính sách Thất bại Ngay lập tức (Fail-Fast Enforcement)**:
   - Nghiêm cấm hoàn toàn cơ chế Fallback âm thầm sang In-Memory khi thiếu biến môi trường hoặc khi không thể kết nối tới cơ sở dữ liệu.
   - Nếu `QUIZ_DATABASE_URL` không được định nghĩa hoặc database không sẵn sàng, hệ thống lập tức quăng lỗi nghiêm trọng (`Fatal Error`) và dừng tiến trình khởi động. Điều này đảm bảo tính nhất quán tuyệt đối giữa môi trường phát triển (Local), thử nghiệm (CI/CD) và vận hành thực tế (Production).

4. **Kiến trúc Dữ liệu Lai Hiệu Năng Cao (Hybrid Relational + Structured JSONB)**:
   - **Tầng Quan hệ (Relational - Bậc 3NF)**:
     - Các trường định danh, trạng thái vòng đời, quan hệ cha-con, quyền sở hữu (`owner_id`), tổ chức (`tenant_id`), và các mốc thời gian kiểm soát (`started_at`, `deadline`, `submitted_at`) được chuẩn hóa thành các cột độc lập có đánh chỉ mục (B-Tree Indexes).
   - **Tầng Tài liệu Cấu trúc (Structured JSONB)**:
     - Các cấu trúc dữ liệu mang tính đóng băng bất biến (Immutable Snapshot) hoặc có cấu trúc lồng nhau phức tạp:
       - Danh sách câu hỏi, phương án trả lời (`questions: jsonb`).
       - Chính sách xáo trộn (`randomization_policy: jsonb`) và chấm điểm (`scoring_policy: jsonb`).
       - Thứ tự đề thi đã cấp cho thí sinh (`manifest: jsonb`).
       - Lịch sử câu trả lời kèm số thứ tự logic (`answers: jsonb`).
       - Chi tiết bảng điểm từng câu (`score_result: jsonb`).
     - Giải pháp này mang lại tốc độ truy vấn tối đa, tính toàn vẹn của Aggregate Root theo chuẩn DDD, đồng thời loại bỏ sự phức tạp không cần thiết của hàng chục bảng trung gian nối nhau.

5. **Tối Ưu Hóa Bộ Quét Ca Thi Quá Hạn (High-Performance Expiry Sweeper Optimization)**:
   - Daemon nền `AttemptExpirySweeperService` và endpoint Cloud Scheduler `/v1/internal/attempts/sweep` cần truy vấn các ca thi quá hạn liên tục (chu kỳ 30 giây).
   - Thiết lập chỉ mục phức hợp (Composite Index) `(status, deadline)` trên bảng `attempts`.
   - Giúp câu truy vấn `WHERE status = 'IN_PROGRESS' AND deadline < $cutoff` đạt độ phức tạp $O(\log N)$, tránh hoàn toàn tình trạng quét toàn bảng (Full Table Scan), không gây nghẽn CPU hoặc khóa bảng làm ảnh hưởng đến thí sinh đang làm bài.

6. **Bảo toàn Tính Bất Biến Thời Gian Hai Tầng (Two-Tier Server-Authoritative Timing Invariants)**:
   - Các mốc thời gian `started_at`, `deadline`, `submitted_at` được lưu trữ dưới dạng `TIMESTAMPTZ` (UTC Microsecond Precision).
   - Mọi thao tác ghi nhận câu trả lời (`recordAnswer`) và nộp bài (`submit`) đều đối chiếu nghiêm ngặt với thời gian thực tế của máy chủ cơ sở dữ liệu, chống lại mọi gian lận chỉnh giờ phía Client.

7. **Kiểm Soát Tranh Chấp Bản Ghi (Atomic Updates & Logical Sequence Concurrency)**:
   - Lưu trữ `sequenceNumber` trong từng bản ghi câu trả lời (`answers -> questionId -> sequenceNumber`).
   - Hỗ trợ câu lệnh cập nhật có điều kiện của PostgreSQL để đảm bảo không xảy ra hiện tượng ghi đè ngược khi nhiều gói tin mạng đến lệch thứ tự (Network Jitter/Out-of-Order Packets).

---

## II. THIẾT KẾ MÔ HÌNH DỮ LIỆU POSTGRESQL CHO `quiz_db`

### 1. Sơ đồ Quan hệ Thực thể (ERD Chi Tiết)

```text
+---------------------------------------------------------------------------------------+
|                                      quizzes                                          |
+---------------------------------------------------------------------------------------+
| PK  id                            VARCHAR(64)                                         |
|     code                          VARCHAR(64) UNIQUE NOT NULL                         |
|     title                         VARCHAR(255) NOT NULL                               |
|     description                   TEXT                                                |
|     owner_id                      VARCHAR(64) NOT NULL                                |
|     tenant_id                     VARCHAR(64) NOT NULL DEFAULT 'tenant_default'       |
|     current_published_version_id  VARCHAR(64)                                         |
|     status                        VARCHAR(32) NOT NULL DEFAULT 'DRAFT'                |
|     created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()                  |
|     updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()                  |
+------------------------------------------+--------------------------------------------+
                                           | 1
                                           |
                                           | N (ON DELETE CASCADE)
+------------------------------------------v--------------------------------------------+
|                                   quiz_versions                                       |
+---------------------------------------------------------------------------------------+
| PK  id                            VARCHAR(64)                                         |
| FK  quiz_id                       VARCHAR(64) NOT NULL REFERENCES quizzes(id)         |
|     version_number                INTEGER NOT NULL                                    |
|     duration_minutes              INTEGER NOT NULL                                    |
|     passing_score                 NUMERIC(6,2) NOT NULL                               |
|     max_attempts                  INTEGER NOT NULL DEFAULT 1                          |
|     questions                     JSONB NOT NULL DEFAULT '[]'::jsonb                  |
|     scoring_policy                JSONB NOT NULL                                      |
|     randomization_policy          JSONB NOT NULL                                      |
|     created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()                  |
| UQ  (quiz_id, version_number)                                                         |
+------------------------------------------+--------------------------------------------+
                                           | 1
                                           |
                                           | N (ON DELETE RESTRICT)
+------------------------------------------v--------------------------------------------+
|                                      attempts                                         |
+---------------------------------------------------------------------------------------+
| PK  id                            VARCHAR(64)                                         |
|     user_id                       VARCHAR(64) NOT NULL                                |
| FK  quiz_id                       VARCHAR(64) NOT NULL REFERENCES quizzes(id)         |
| FK  quiz_version_id               VARCHAR(64) NOT NULL REFERENCES quiz_versions(id)   |
|     tenant_id                     VARCHAR(64) NOT NULL DEFAULT 'tenant_default'       |
|     status                        VARCHAR(32) NOT NULL DEFAULT 'CREATED'              |
|     started_at                    TIMESTAMPTZ                                         |
|     deadline                      TIMESTAMPTZ                                         |
|     submitted_at                  TIMESTAMPTZ                                         |
|     manifest                      JSONB                                               |
|     answers                       JSONB NOT NULL DEFAULT '{}'::jsonb                  |
|     score_result                  JSONB                                               |
|     created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()                  |
|     updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()                  |
+---------------------------------------------------------------------------------------+
```

---

### 2. Định nghĩa DDL PostgreSQL Chuẩn Xác (Clean DDL for `quiz_db`)

```sql
-- Khởi tạo cơ sở dữ liệu riêng biệt (chạy bởi DBA / Docker init)
-- CREATE DATABASE quiz_db;
-- \c quiz_db;

-- 1. BẢNG QUIZZES (Quản lý vòng đời & danh tính đề thi)
CREATE TABLE quizzes (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'tenant_default',
    current_published_version_id VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ mục hỗ trợ tra cứu đề thi, phân quyền sở hữu và đa người thuê
CREATE INDEX idx_quizzes_code ON quizzes(code);
CREATE INDEX idx_quizzes_owner ON quizzes(owner_id);
CREATE INDEX idx_quizzes_tenant ON quizzes(tenant_id);
CREATE INDEX idx_quizzes_status ON quizzes(status);
CREATE INDEX idx_quizzes_owner_tenant ON quizzes(owner_id, tenant_id);

-- 2. BẢNG QUIZ_VERSIONS (Các bản phát hành đóng băng bất biến)
CREATE TABLE quiz_versions (
    id VARCHAR(64) PRIMARY KEY,
    quiz_id VARCHAR(64) NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL,
    passing_score NUMERIC(6,2) NOT NULL,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    scoring_policy JSONB NOT NULL,
    randomization_policy JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_quiz_version UNIQUE (quiz_id, version_number)
);

CREATE INDEX idx_quiz_versions_quiz_id ON quiz_versions(quiz_id);
CREATE INDEX idx_quiz_versions_lookup ON quiz_versions(quiz_id, version_number DESC);

-- 3. BẢNG ATTEMPTS (Quản lý các lượt thi của thí sinh)
CREATE TABLE attempts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    quiz_id VARCHAR(64) NOT NULL REFERENCES quizzes(id) ON DELETE RESTRICT,
    quiz_version_id VARCHAR(64) NOT NULL REFERENCES quiz_versions(id) ON DELETE RESTRICT,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'tenant_default',
    status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    started_at TIMESTAMPTZ,
    deadline TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    manifest JSONB,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    score_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ mục phục vụ truy vấn lịch sử thí sinh và chống gian lận đa ca thi
CREATE INDEX idx_attempts_user ON attempts(user_id);
CREATE INDEX idx_attempts_user_quiz ON attempts(user_id, quiz_id);
CREATE INDEX idx_attempts_tenant ON attempts(tenant_id);

-- CHỈ MỤC TỐI QUAN TRỌNG: Phục vụ Daemon AttemptExpirySweeperService quét ca thi quá hạn
-- Query: SELECT * FROM attempts WHERE status = 'IN_PROGRESS' AND deadline < cutoff
CREATE INDEX idx_attempts_sweeper ON attempts(status, deadline) 
WHERE status = 'IN_PROGRESS';
```

---

## III. THIẾT KẾ DRIZZLE SCHEMA CHO QUIZ SERVICE (`services/quiz/src/infrastructure/db/schema.ts`)

File schema sử dụng các tính năng cao cấp của Drizzle ORM với hỗ trợ TypeScript Type-Casting cho các trường JSONB:

```typescript
// services/quiz/src/infrastructure/db/schema.ts
import { pgTable, varchar, text, integer, numeric, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { 
  AuthoringQuestion, 
  ScoringPolicyConfig, 
  RandomizationPolicy 
} from '../../domain/authoring/quiz-version.entity.js';
import type { AttemptManifest } from '../../domain/delivery/attempt-manifest.js';
import type { 
  CandidateAnswerRecord, 
  AttemptScoreResult 
} from '../../domain/delivery/attempt.aggregate.js';

/**
 * Bảng quizzes: Lưu trữ metadata và trạng thái phát hành của đề thi
 */
export const quizzes = pgTable(
  'quizzes',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    code: varchar('code', { length: 64 }).notNull().unique(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    ownerId: varchar('owner_id', { length: 64 }).notNull(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull().default('tenant_default'),
    currentPublishedVersionId: varchar('current_published_version_id', { length: 64 }),
    status: varchar('status', { length: 32 }).notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_quizzes_code').on(table.code),
    index('idx_quizzes_owner').on(table.ownerId),
    index('idx_quizzes_tenant').on(table.tenantId),
    index('idx_quizzes_status').on(table.status),
    index('idx_quizzes_owner_tenant').on(table.ownerId, table.tenantId),
  ]
);

/**
 * Bảng quiz_versions: Lưu trữ các snapshot nội dung câu hỏi bất biến
 */
export const quizVersions = pgTable(
  'quiz_versions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    quizId: varchar('quiz_id', { length: 64 })
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    passingScore: numeric('passing_score', { precision: 6, scale: 2 }).notNull(),
    maxAttempts: integer('max_attempts').notNull().default(1),
    questions: jsonb('questions').$type<readonly AuthoringQuestion[]>().notNull().default([]),
    scoringPolicy: jsonb('scoring_policy').$type<ScoringPolicyConfig>().notNull(),
    randomizationPolicy: jsonb('randomization_policy').$type<RandomizationPolicy>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_quiz_version').on(table.quizId, table.versionNumber),
    index('idx_quiz_versions_quiz_id').on(table.quizId),
  ]
);

/**
 * Bảng attempts: Lưu trữ phiên làm bài, câu trả lời và bảng điểm chi tiết
 */
export const attempts = pgTable(
  'attempts',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    quizId: varchar('quiz_id', { length: 64 })
      .notNull()
      .references(() => quizzes.id, { onDelete: 'restrict' }),
    quizVersionId: varchar('quiz_version_id', { length: 64 })
      .notNull()
      .references(() => quizVersions.id, { onDelete: 'restrict' }),
    tenantId: varchar('tenant_id', { length: 64 }).notNull().default('tenant_default'),
    status: varchar('status', { length: 32 }).notNull().default('CREATED'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    deadline: timestamp('deadline', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    manifest: jsonb('manifest').$type<AttemptManifest>(),
    answers: jsonb('answers').$type<Record<string, CandidateAnswerRecord>>().notNull().default({}),
    scoreResult: jsonb('score_result').$type<AttemptScoreResult>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_attempts_user').on(table.userId),
    index('idx_attempts_user_quiz').on(table.userId, table.quizId),
    index('idx_attempts_tenant').on(table.tenantId),
    index('idx_attempts_sweeper').on(table.status, table.deadline),
  ]
);

// Quan hệ Drizzle Relations
export const quizzesRelations = relations(quizzes, ({ many }) => ({
  versions: many(quizVersions),
  attempts: many(attempts),
}));

export const quizVersionsRelations = relations(quizVersions, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [quizVersions.quizId],
    references: [quizzes.id],
  }),
  attempts: many(attempts),
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [attempts.quizId],
    references: [quizzes.id],
  }),
  version: one(quizVersions, {
    fields: [attempts.quizVersionId],
    references: [quizVersions.id],
  }),
}));
```

---

## IV. THIẾT KẾ KẾT NỐI DATABASE RIÊNG BIỆT (`services/quiz/src/infrastructure/db/connection.ts`)

Module này quản lý vòng đời kết nối tới `quiz_db` sử dụng thư viện `postgres.js` hiệu năng cao và Drizzle ORM, thực thi nghiêm ngặt nguyên tắc **Fail-Fast**:

```typescript
// services/quiz/src/infrastructure/db/connection.ts
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
  // Chú ý: Ưu tiên QUIZ_DATABASE_URL, không dùng chung với AUTH_DATABASE_URL
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
```

---

## V. TÁI CẤU TRÚC TẦNG PERSISTENCE & DRIZZLE REPOSITORIES (100% POSTGRESQL)

Triển khai đầy đủ hai cổng giao tiếp `AuthoringRepositoryPort` và `DeliveryRepositoryPort` bằng Drizzle ORM kết nối tới `quiz_db`.

### 1. `DrizzleAuthoringRepository` (`services/quiz/src/infrastructure/repositories/drizzle-authoring.repository.ts`)

```typescript
import { eq, desc } from 'drizzle-orm';
import { getQuizDb } from '../db/connection.js';
import { quizzes, quizVersions } from '../db/schema.js';
import { Quiz, QuizStatus } from '../../domain/authoring/quiz.entity.js';
import { QuizVersion } from '../../domain/authoring/quiz-version.entity.js';
import { AuthoringRepositoryPort } from '../../domain/ports/assessment.repository.ports.js';

export class DrizzleAuthoringRepository implements AuthoringRepositoryPort {
  constructor(private customDb?: any) {}

  private get db() {
    return this.customDb || getQuizDb();
  }

  // --- QUẢN LÝ ĐỀ THI (QUIZ) ---

  async saveQuiz(quiz: Quiz): Promise<void> {
    const raw = quiz.toJSON();
    await this.db
      .insert(quizzes)
      .values({
        id: raw.id,
        code: raw.code,
        title: raw.title,
        description: raw.description,
        ownerId: raw.ownerId,
        tenantId: raw.tenantId,
        currentPublishedVersionId: raw.currentPublishedVersionId,
        status: raw.status,
        createdAt: new Date(raw.createdAt),
        updatedAt: new Date(raw.updatedAt),
      })
      .onConflictDoUpdate({
        target: quizzes.id,
        set: {
          code: raw.code,
          title: raw.title,
          description: raw.description,
          ownerId: raw.ownerId,
          tenantId: raw.tenantId,
          currentPublishedVersionId: raw.currentPublishedVersionId,
          status: raw.status,
          updatedAt: new Date(raw.updatedAt),
        },
      });
  }

  async findQuizById(id: string): Promise<Quiz | null> {
    const rows = await this.db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToQuiz(rows[0]);
  }

  async findQuizByCode(code: string): Promise<Quiz | null> {
    const rows = await this.db.select().from(quizzes).where(eq(quizzes.code, code)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToQuiz(rows[0]);
  }

  async listPublishedQuizzes(): Promise<Quiz[]> {
    const rows = await this.db.select().from(quizzes).where(eq(quizzes.status, 'PUBLISHED'));
    return rows.map((r) => this.mapRowToQuiz(r));
  }

  // --- QUẢN LÝ PHIÊN BẢN (VERSION) ---

  async saveVersion(version: QuizVersion): Promise<void> {
    await this.db
      .insert(quizVersions)
      .values({
        id: version.id,
        quizId: version.quizId,
        versionNumber: version.versionNumber,
        durationMinutes: version.durationMinutes,
        passingScore: version.passingScore.toString(),
        maxAttempts: version.maxAttempts,
        questions: version.questions,
        scoringPolicy: version.scoringPolicy,
        randomizationPolicy: version.randomizationPolicy,
        createdAt: version.createdAt,
      })
      .onConflictDoUpdate({
        target: quizVersions.id,
        set: {
          versionNumber: version.versionNumber,
          durationMinutes: version.durationMinutes,
          passingScore: version.passingScore.toString(),
          maxAttempts: version.maxAttempts,
          questions: version.questions,
          scoringPolicy: version.scoringPolicy,
          randomizationPolicy: version.randomizationPolicy,
        },
      });
  }

  async findVersionById(id: string): Promise<QuizVersion | null> {
    const rows = await this.db.select().from(quizVersions).where(eq(quizVersions.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToVersion(rows[0]);
  }

  async findLatestVersionByQuizId(quizId: string): Promise<QuizVersion | null> {
    const rows = await this.db
      .select()
      .from(quizVersions)
      .where(eq(quizVersions.quizId, quizId))
      .orderBy(desc(quizVersions.versionNumber))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRowToVersion(rows[0]);
  }

  async listVersionsByQuizId(quizId: string): Promise<QuizVersion[]> {
    const rows = await this.db
      .select()
      .from(quizVersions)
      .where(eq(quizVersions.quizId, quizId))
      .orderBy(desc(quizVersions.versionNumber));

    return rows.map((r) => this.mapRowToVersion(r));
  }

  private mapRowToQuiz(row: any): Quiz {
    return new Quiz({
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description || undefined,
      ownerId: row.ownerId,
      tenantId: row.tenantId,
      currentPublishedVersionId: row.currentPublishedVersionId || undefined,
      status: row.status as QuizStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private mapRowToVersion(row: any): QuizVersion {
    return new QuizVersion({
      id: row.id,
      quizId: row.quizId,
      versionNumber: row.versionNumber,
      durationMinutes: row.durationMinutes,
      passingScore: Number(row.passingScore),
      maxAttempts: row.maxAttempts,
      questions: row.questions,
      scoringPolicy: row.scoringPolicy,
      randomizationPolicy: row.randomizationPolicy,
      createdAt: row.createdAt,
    });
  }
}
```

---

### 2. `DrizzleDeliveryRepository` (`services/quiz/src/infrastructure/repositories/drizzle-delivery.repository.ts`)

```typescript
import { eq, and, lte } from 'drizzle-orm';
import { getQuizDb } from '../db/connection.js';
import { attempts } from '../db/schema.js';
import { Attempt } from '../../domain/delivery/attempt.aggregate.js';
import { AttemptStatus } from '../../domain/delivery/attempt-status.js';
import { DeliveryRepositoryPort } from '../../domain/ports/assessment.repository.ports.js';

export class DrizzleDeliveryRepository implements DeliveryRepositoryPort {
  constructor(private customDb?: any) {}

  private get db() {
    return this.customDb || getQuizDb();
  }

  async saveAttempt(attempt: Attempt): Promise<void> {
    const raw = attempt.toJSON();
    await this.db
      .insert(attempts)
      .values({
        id: raw.id,
        userId: raw.userId,
        quizId: raw.quizId,
        quizVersionId: raw.quizVersionId,
        tenantId: raw.tenantId,
        status: raw.status,
        startedAt: raw.startedAt ? new Date(raw.startedAt) : null,
        deadline: raw.deadline ? new Date(raw.deadline) : null,
        submittedAt: raw.submittedAt ? new Date(raw.submittedAt) : null,
        manifest: raw.manifest || null,
        answers: raw.answers || {},
        scoreResult: raw.scoreResult || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: attempts.id,
        set: {
          status: raw.status,
          startedAt: raw.startedAt ? new Date(raw.startedAt) : null,
          deadline: raw.deadline ? new Date(raw.deadline) : null,
          submittedAt: raw.submittedAt ? new Date(raw.submittedAt) : null,
          manifest: raw.manifest || null,
          answers: raw.answers || {},
          scoreResult: raw.scoreResult || null,
          updatedAt: new Date(),
        },
      });
  }

  async findAttemptById(id: string): Promise<Attempt | null> {
    const rows = await this.db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToAttempt(rows[0]);
  }

  async listAttemptsByUser(userId: string, quizId?: string): Promise<Attempt[]> {
    const condition = quizId
      ? and(eq(attempts.userId, userId), eq(attempts.quizId, quizId))
      : eq(attempts.userId, userId);

    const rows = await this.db.select().from(attempts).where(condition);
    return rows.map((r) => this.mapRowToAttempt(r));
  }

  /**
   * Truy vấn các ca thi quá hạn đang ở trạng thái IN_PROGRESS
   * Sử dụng chỉ mục phức hợp idx_attempts_sweeper (status, deadline)
   * Ngưỡng tính toán: deadline < now - gracePeriodMs
   */
  async findExpiredInProgressAttempts(
    now: Date = new Date(),
    gracePeriodMs = 15000
  ): Promise<Attempt[]> {
    const cutoffDate = new Date(now.getTime() - gracePeriodMs);

    const rows = await this.db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.status, 'IN_PROGRESS'),
          lte(attempts.deadline, cutoffDate)
        )
      );

    return rows.map((r) => this.mapRowToAttempt(r));
  }

  private mapRowToAttempt(row: any): Attempt {
    return new Attempt({
      id: row.id,
      userId: row.userId,
      quizId: row.quizId,
      quizVersionId: row.quizVersionId,
      tenantId: row.tenantId,
      status: row.status as AttemptStatus,
      startedAt: row.startedAt || undefined,
      deadline: row.deadline || undefined,
      submittedAt: row.submittedAt || undefined,
      manifest: row.manifest || undefined,
      answers: row.answers || {},
      scoreResult: row.scoreResult
        ? {
            ...row.scoreResult,
            evaluatedAt: new Date(row.scoreResult.evaluatedAt),
          }
        : undefined,
    });
  }
}
```

---

### 3. Factory Cưỡng Chế Kết Nối PostgreSQL (Fail-Fast Persistence Factory)

Tạo file `services/quiz/src/infrastructure/repositories/assessment-repository.factory.ts`:

```typescript
// services/quiz/src/infrastructure/repositories/assessment-repository.factory.ts
import { 
  AuthoringRepositoryPort, 
  DeliveryRepositoryPort 
} from '../../domain/ports/assessment.repository.ports.js';
import { DrizzleAuthoringRepository } from './drizzle-authoring.repository.js';
import { DrizzleDeliveryRepository } from './drizzle-delivery.repository.js';
import { isQuizDbConfigured } from '../db/connection.js';

export function createAuthoringRepository(db?: any): AuthoringRepositoryPort {
  if (db) {
    return new DrizzleAuthoringRepository(db);
  }
  if (!isQuizDbConfigured()) {
    throw new Error(
      'FATAL: QUIZ_DATABASE_URL is not configured. ' +
      'In-Memory fallback is strictly forbidden. Please configure quiz_db PostgreSQL connection.'
    );
  }
  return new DrizzleAuthoringRepository();
}

export function createDeliveryRepository(db?: any): DeliveryRepositoryPort {
  if (db) {
    return new DrizzleDeliveryRepository(db);
  }
  if (!isQuizDbConfigured()) {
    throw new Error(
      'FATAL: QUIZ_DATABASE_URL is not configured. ' +
      'In-Memory fallback is strictly forbidden. Please configure quiz_db PostgreSQL connection.'
    );
  }
  return new DrizzleDeliveryRepository();
}
```

---

## VI. CẤU HÌNH DRIZZLE-KIT, MIGRATION SCRIPT & SEED DỮ LIỆU ĐỀ THI VÀO `quiz_db`

### 1. File Cấu Hình Drizzle Kit (`services/quiz/drizzle.config.ts`)

```typescript
// services/quiz/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
import { getQuizDatabaseUrl } from './src/infrastructure/db/connection.js';

const dbUrl = getQuizDatabaseUrl();

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl || 'postgres://postgres:postgres@localhost:5432/quiz_db',
  },
  verbose: true,
  strict: true,
});
```

---

### 2. Script Tự Động Chạy Migration (`services/quiz/src/infrastructure/db/migrate.ts`)

```typescript
// services/quiz/src/infrastructure/db/migrate.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getQuizDb, closeQuizDb } from './connection.js';

export async function runQuizMigrations(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsFolder = path.resolve(__dirname, '../../../drizzle/migrations');

  console.log(`[quiz_db] Running PostgreSQL migrations from: ${migrationsFolder}`);
  const db = getQuizDb();
  await migrate(db, { migrationsFolder });
  console.log('[quiz_db] PostgreSQL migrations completed successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runQuizMigrations()
    .then(async () => {
      await closeQuizDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[quiz_db] Migration failed:', err);
      await closeQuizDb();
      process.exit(1);
    });
}
```

---

### 3. Script Seed Dữ Liệu Khởi Tạo Mẫu (`services/quiz/src/infrastructure/db/seed.ts`)

Di dời toàn bộ mock seed data trước đây bị hardcode trong `InMemoryAssessmentRepository` và `InMemoryQuizRepository` thành file seed chính thức vào database PostgreSQL `quiz_db`:

```typescript
// services/quiz/src/infrastructure/db/seed.ts
import { getQuizDb, closeQuizDb } from './connection.js';
import { DrizzleAuthoringRepository } from '../repositories/drizzle-authoring.repository.js';
import { Quiz } from '../../domain/authoring/quiz.entity.js';
import { QuizVersion } from '../../domain/authoring/quiz-version.entity.js';

export async function seedQuizDatabase(): Promise<void> {
  console.log('[quiz_db] Seeding default quizzes and versions into PostgreSQL...');
  const repo = new DrizzleAuthoringRepository();

  const quizId = 'quiz_demo';
  const versionId = 'ver_demo_v1';

  const version = new QuizVersion({
    id: versionId,
    quizId,
    versionNumber: 1,
    durationMinutes: 15,
    passingScore: 3,
    maxAttempts: 3,
    questions: [
      {
        id: 'q1',
        type: 'single-choice',
        prompt: 'ReactJS là gì?',
        points: 2,
        options: [
          { id: 'opt_1', text: 'Thư viện UI', isCorrect: true },
          { id: 'opt_2', text: 'Database', isCorrect: false },
          { id: 'opt_3', text: 'Hệ điều hành', isCorrect: false },
        ],
      },
      {
        id: 'q2',
        type: 'multiple-choice',
        prompt: 'Những từ khóa nào được dùng khai báo biến trong JavaScript hiện đại?',
        points: 2,
        options: [
          { id: 'opt_let', text: 'let', isCorrect: true },
          { id: 'opt_const', text: 'const', isCorrect: true },
          { id: 'opt_goto', text: 'goto', isCorrect: false },
        ],
      },
      {
        id: 'q3',
        type: 'true-false',
        prompt: 'TypeScript hỗ trợ Type System tại thời điểm compile-time',
        points: 1,
        correctAnswer: true,
      },
    ],
    scoringPolicy: { strategyType: 'exact-match' },
    randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
  });

  const quiz = new Quiz({
    id: quizId,
    code: 'REACT_CORE',
    title: 'Bài Thi Thử Kiến Trúc Core',
    description: 'Kiểm tra tổng hợp các loại câu hỏi',
    ownerId: 'admin_master',
    tenantId: 'tenant_default',
    status: 'PUBLISHED',
    currentPublishedVersionId: versionId,
  });

  await repo.saveVersion(version);
  await repo.saveQuiz(quiz);

  console.log('[quiz_db] Seeding completed: 1 quiz, 1 published version initialized in PostgreSQL.');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  seedQuizDatabase()
    .then(async () => {
      await closeQuizDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[quiz_db] Seeding failed:', err);
      await closeQuizDb();
      process.exit(1);
    });
}
```

---

## VII. CHIẾN LƯỢC KIỂM THỬ TÍCH HỢP TRÊN POSTGRESQL (ZERO IN-MEMORY MOCKS)

Để đảm bảo toàn bộ các bài kiểm tra của Quiz Service phản ánh chính xác hành vi của PostgreSQL (kiểm tra kiểu dữ liệu JSONB, ràng buộc khóa ngoại, transaction, timestamp microsecond) mà không phụ thuộc vào mock in-memory, hệ thống sử dụng **PGlite** (`@electric-sql/pglite`) trong môi trường test:

### Cấu hình `services/quiz/tests/helpers/test-db.helper.ts`

```typescript
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import * as schema from '../../src/infrastructure/db/schema.js';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function createTestQuizDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsFolder = path.resolve(__dirname, '../../drizzle/migrations');

  await migrate(db, { migrationsFolder });

  return { db, client };
}
```

---

## VIII. KẾ HOẠCH HÀNH ĐỘNG CHI TIẾT (ACTIONABLE WORK PACKAGES: WP-1 ĐẾN WP-8)

Toàn bộ quá trình chuyển đổi được chia thành 8 gói công việc (Work Packages) cụ thể, thực thi dứt điểm và nhất quán:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        LỘ TRÌNH CHUYỂN ĐỔI QUIZ SERVICE SANG POSTGRESQL                │
├────────┬───────────────────────────────────────────────────────────────────────────────┤
│ [DONE] │ WP-1: Cập nhật Cấu hình Môi trường (.env.example, package.json scripts)       │
│ [DONE] │ WP-2: Thiết kế Drizzle Schema (quizzes, quiz_versions, attempts với JSONB)     │
│ [DONE] │ WP-3: Thiết lập Kết nối quiz_db độc lập (connection.ts, Fail-Fast)             │
│ [DONE] │ WP-4: Tạo Migration Script & Chạy Drizzle-Kit Generate cho quiz_db            │
│ [DONE] │ WP-5: Xây dựng DrizzleAuthoringRepository & DrizzleDeliveryRepository (100% PSQL)   │
│ [DONE] │ WP-6: Tạo Seed Script & Cập nhật Server Entry Point (services/quiz/src/server.ts)    │
│ [DONE] │ WP-7: Xóa Bỏ Hoàn Toàn In-Memory Repositories & Di Trú Test Suite                   │
│  WP-8  │ Viết Test Tích Hợp PostgreSQL cho Quiz Service & Chạy Toàn Bộ Test Suite       │
└────────┴───────────────────────────────────────────────────────────────────────────────┘
```

### Chi tiết Từng Gói Công Việc:

### **[HOÀN THÀNH] Gói WP-1: Khai báo Biến Môi Trường & Cấu Hình Scripts**
- Đã thêm biến `QUIZ_DATABASE_URL` vào file `/.env.example`:
  ```env
  AUTH_DATABASE_URL=
  QUIZ_DATABASE_URL=
  JWT_PRIVATE_KEY=
  JWT_PUBLIC_KEY=
  JWT_SECRET=
  ```
- Đã cập nhật `services/quiz/package.json`:
  - Bổ sung dependencies: `drizzle-orm`, `postgres`.
  - Bổ sung devDependencies: `drizzle-kit`, `@electric-sql/pglite`.
  - Thêm scripts:
    - `"db:generate": "drizzle-kit generate"`
    - `"db:migrate": "tsx src/infrastructure/db/migrate.ts"`
    - `"db:seed": "tsx src/infrastructure/db/seed.ts"`
- Đã bổ sung scripts tương ứng vào root `package.json`:
  - `"db:generate:quiz"`
  - `"db:migrate:quiz"`
  - `"db:seed:quiz"`

### **[HOÀN THÀNH] Gói WP-2: Thiết kế Drizzle Schema (`services/quiz/src/infrastructure/db/schema.ts`)**
- Đã tạo mới file `services/quiz/src/infrastructure/db/schema.ts`.
- Đã định nghĩa đầy đủ 3 bảng quan hệ 3NF kết hợp JSONB: `quizzes`, `quiz_versions`, `attempts`.
- Đã cấu hình chỉ mục tối ưu `idx_attempts_sweeper` trên `(status, deadline)` phục vụ `AttemptExpirySweeperService`.
- Đã khai báo đầy đủ quan hệ `relations` (`quizzesRelations`, `quizVersionsRelations`, `attemptsRelations`) và TypeScript types (`QuizRow`, `QuizVersionRow`, `AttemptRow`, ...).

### **[HOÀN THÀNH] Gói WP-3: Thiết lập Kết nối `quiz_db` Độc Lập (`connection.ts`)**
- Đã tạo mới file `services/quiz/src/infrastructure/db/connection.ts`.
- Đã xử lý nạp biến môi trường tự động `loadEnvIfAvailable`, khử lỗi tham số `schema=public` qua `sanitizePostgresUrl`.
- Đã cài đặt kết nối Singleton `getQuizDb()` với pool `postgres(connectionString, { max: 15, idle_timeout: 30, connect_timeout: 10 })` và hàm dọn dẹp `closeQuizDb()`.
- Đã cài đặt cơ chế kiểm soát lỗi **Fail-Fast**: nếu thiếu `QUIZ_DATABASE_URL`, ném lỗi dừng máy chủ ngay lập tức, không chấp nhận fallback hay chạy in-memory.

### **[HOÀN THÀNH] Gói WP-4: Tạo Migration Drizzle-Kit cho `quiz_db`**
- Đã tạo file `services/quiz/drizzle.config.ts` hỗ trợ linh hoạt cả monorepo root context lẫn service workspace context.
- Đã chạy lệnh `npx drizzle-kit generate` sinh thành công tệp migration `services/quiz/drizzle/migrations/0000_slow_pet_avengers.sql` chứa đầy đủ 3 bảng (`quizzes`, `quiz_versions`, `attempts`), quan hệ khóa ngoại và các chỉ mục (`idx_attempts_sweeper`, ...).
- Đã tạo file `services/quiz/src/infrastructure/db/migrate.ts` hỗ trợ thực thi migration tự động qua hàm `runQuizMigrations()` và CLI direct run.

### **[HOÀN THÀNH] Gói WP-5: Hiện thực Tầng Persistence 100% PostgreSQL**
- Đã tạo file `services/quiz/src/infrastructure/repositories/drizzle-authoring.repository.ts` hiện thực đầy đủ `AuthoringRepositoryPort` tương tác 100% với PostgreSQL (`saveQuiz`, `findQuizById`, `findQuizByCode`, `listPublishedQuizzes`, `saveVersion`, `findVersionById`, `findLatestVersionByQuizId`, `listVersionsByQuizId`).
- Đã tạo file `services/quiz/src/infrastructure/repositories/drizzle-delivery.repository.ts` hiện thực đầy đủ `DeliveryRepositoryPort` tương tác 100% với PostgreSQL (`saveAttempt`, `findAttemptById`, `listAttemptsByUser`, `findExpiredInProgressAttempts` tối ưu với chỉ mục `idx_attempts_sweeper`).
- Đã tạo factory `services/quiz/src/infrastructure/repositories/assessment-repository.factory.ts` (`createAuthoringRepository`, `createDeliveryRepository`) với cơ chế Fail-Fast nghiêm ngặt, cấm hoàn toàn in-memory fallback.

### **[HOÀN THÀNH] Gói WP-6: Seed Dữ Liệu Mẫu & Cập nhật Server Entry Point**
- Đã tạo file `services/quiz/src/infrastructure/db/seed.ts` để nạp đề thi mẫu và phiên bản v1 trực tiếp vào PostgreSQL `quiz_db` (hỗ trợ cả CLI runner qua `npm run db:seed:quiz` và gọi hàm module `seedQuizDatabase`).
- Đã cập nhật `services/quiz/src/presentation/server.ts`:
  - Khai báo các biến singleton repository và phương thức Dependency Injection `setAssessmentRepositories(authoring, delivery)`.
  - Triển khai Dynamic Delegation Proxies cho `AuthoringRepositoryPort` và `DeliveryRepositoryPort`, cho phép chuyển đổi linh hoạt giữa các repository instances (đặc biệt khi chạy kiểm thử tích hợp).
  - Khởi tạo `sweeperService.start(30000)` an toàn trong môi trường Production/Dev khi có kết nối cơ sở dữ liệu (`NODE_ENV !== 'test' && isQuizDbConfigured()`).
  - Xuất khẩu đầy đủ các use case, sweeperService, và helper `setAssessmentRepositories` cho các module và test suites.

### **[HOÀN THÀNH] Gói WP-7: Xóa Bỏ Hoàn Toàn In-Memory Persistence & Di Trú Test Suite**
- Đã xóa vĩnh viễn và hoàn toàn các file in-memory repositories:
  - `services/quiz/src/infrastructure/repositories/in-memory-quiz.repository.ts` (DELETED).
  - `services/quiz/src/infrastructure/repositories/in-memory-assessment.repository.ts` (DELETED).
- Đã thiết lập test database harness PostgreSQL chuẩn xác (`services/quiz/tests/helpers/test-db.helper.ts`):
  - Khởi tạo PGlite instance biệt lập cho mỗi test suite.
  - Tự động áp dụng file migration SQL chính thức (`drizzle/migrations/0000_slow_pet_avengers.sql`).
  - Tự động seed dữ liệu mẫu hợp lệ (`quiz_demo`, `ver_demo_v1`, 3 câu hỏi trắc nghiệm).
  - Cung cấp `testCtx.authoringRepo`, `testCtx.deliveryRepo`, `testCtx.legacyRepo`, `testCtx.db`, `testCtx.cleanup()`.
- Đã di trú 100% test suites từ In-Memory sang PostgreSQL PGlite:
  - `tests/delivery/attempt-sequence-concurrency.spec.ts`: Sử dụng `DrizzleDeliveryRepository` qua PGlite để kiểm thử Race Condition & Concurrency.
  - `tests/delivery/attempt-expiry-sweeper.spec.ts`: Sử dụng `DrizzleDeliveryRepository` & `DrizzleAuthoringRepository` qua PGlite để kiểm thử background sweeper.
  - `tests/security/ownership-policy.spec.ts`: Sử dụng `DrizzleAuthoringRepository` qua PGlite.
  - `tests/presentation/assessment-api.spec.ts`: Sử dụng `setupTestQuizDb()` và tiêm phụ thuộc qua `setAssessmentRepositories(testContext.authoringRepo, testContext.deliveryRepo)`.
  - `tests/presentation/sweeper-api.spec.ts`: Sử dụng `setupTestQuizDb()` và tiêm phụ thuộc qua `setAssessmentRepositories(testContext.authoringRepo, testContext.deliveryRepo)`.
  - `tests/security/principal-context.spec.ts`: Sử dụng `setupTestQuizDb()` và `DrizzleQuizLegacyRepository`.
  - `services/quiz/src/application/use-cases.spec.ts`: Xóa bỏ class mock `InMemoryQuizRepository`, chuyển đổi sang `setupTestQuizDb()` và `testCtx.legacyRepo` tương tác 100% PostgreSQL.

### **Gói WP-8: Kiểm Thử Toàn Diện 100% PostgreSQL & Đảm Bảo Tương Thích Tuyệt Đối**
- Viết test suite kiểm thử tích hợp Drizzle persistence chuyên sâu cho Quiz Service (`services/quiz/tests/delivery/drizzle-assessment-persistence.spec.ts`):
  - Kiểm thử lưu trữ và đọc JSONB `questions`, `scoring_policy`, `randomization_policy`.
  - Kiểm thử lưu trữ và cập nhật `answers` có điều kiện monotonic `sequenceNumber`.
  - Kiểm thử chỉ mục `idx_attempts_sweeper` với câu truy vấn `findExpiredInProgressAttempts()`.
  - Kiểm thử chuyển trạng thái `TIMED_OUT_GRADED` và lưu trữ `score_result`.
- Chạy kiểm tra chất lượng code: `compile_applet`, `vitest run`, đảm bảo 100% test suites vượt qua xanh tuyệt đối trên nền PostgreSQL.

---

## IX. BẢNG ĐỐI CHIẾU KIẾN TRÚC TRƯỚC VÀ SAU CHUYỂN ĐỔI

| Tiêu Chí Đánh Giá | Kiến Trúc Cũ (In-Memory) | Kiến Trúc Mới (100% PostgreSQL & Drizzle) |
| :--- | :--- | :--- |
| **Nơi Lưu Trữ Dữ Liệu** | RAM máy chủ (`Map<string, T>`) | Database **`quiz_db`** (PostgreSQL 16+) |
| **Tính Độc Lập Dịch Vụ** | Chạy chung tiến trình | Độc lập hoàn toàn với `auth_db`, kết nối qua `QUIZ_DATABASE_URL` |
| **Độ Bền Dữ Liệu** | Mất sạch khi khởi động lại máy chủ | Bền vững 100%, hỗ trợ ACID transaction và backup WAL |
| **Bộ Quét Ca Thi Quá Hạn** | `Array.filter()` trong bộ nhớ RAM | Chỉ mục phức hợp `idx_attempts_sweeper` truy vấn $O(\log N)$ |
| **Cơ Chế Khử Khuẩn Đề Thi** | Xử lý thủ công qua Sanitizer | Tách biệt ranh giới bảng: Delivery đọc qua Sanitizer, Authoring lưu trữ JSONB đầy đủ |
| **Xử Lý Tranh Chấp Trả Lời** | So sánh số thứ tự trong RAM | Kiểm tra `sequenceNumber` trong JSONB kết hợp Transaction |
| **Khả Năng Mở Rộng (Scale)** | Giới hạn ở 1 instance máy chủ (Single Pod) | Hỗ trợ mở rộng đa instance (Horizontal Scale) không lo lệch state |
| **Chính Sách Lỗi Cấu Hình** | Dễ dẫn đến silent fallback | **Fail-Fast**: Thiếu biến môi trường là dừng máy chủ ngay |

---

## X. KẾT LUẬN

Kế hoạch chuyển đổi Quiz Service sang **100% PostgreSQL & Drizzle ORM** với cơ sở dữ liệu độc lập **`quiz_db`** là bước tiến quyết định để hoàn thiện kiến trúc Microservices / Hexagonal Architecture chuẩn mực của nền tảng Quiz Assessment Platform.

Việc loại bỏ triệt để tầng lưu trữ In-Memory và áp dụng chính sách Fail-Fast mang lại:
1. **Độ tin cậy tuyệt đối** cho các kỳ thi quy mô lớn với hàng nghìn thí sinh làm bài đồng thời.
2. **Khả năng mở rộng không giới hạn** cho các cụm máy chủ xử lý phòng thi (Delivery instances).
3. **Bảo toàn dữ liệu** trước mọi sự cố mạng hoặc khởi động lại container.
4. **Phân định ranh giới nghiệp vụ sạch sẽ** giữa xác thực danh tính (Auth Service trên `auth_db`) và điều phối bài thi (Quiz Service trên `quiz_db`).
