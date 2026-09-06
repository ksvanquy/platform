# KẾ HOẠCH THIẾT KẾ & TRIỂN KHAI TAXONOMY SERVICE (THỐNG NHẤT TOÀN DIỆN VỚI CODEBASE)
*Kiến trúc Knowledge Catalog Độc Lập - Chuẩn hóa theo Hệ thống Monorepo Hiện Tại*

---

## 1. TỔNG QUAN KIẾN TRÚC & TÍNH THỐNG NHẤT VỚI CODEBASE

Dự án hiện tại là một Monorepo PNPM với cấu trúc Domain-Driven Design (DDD) phân lớp sạch sẽ, gồm:
- **`services/auth` (`@platform/auth-service`)**: Quản lý định danh (Users, Roles, RBAC, JWT RS256).
- **`services/quiz` (`@platform/quiz-service`)**: Lõi khảo thí (Quizzes, Versions, Attempts, Engine).
- **`packages/contracts` (`@platform/contracts`)**: Định nghĩa DTOs, Enums, `ApiResponse<T>`, Principal.
- **`packages/api-client` (`@platform/api-client`)**: Unified SDK Client (`ApiClient`).
- **`apps/quiz-web` & `apps/admin-web`**: Frontend Client (Vite + React 19 + Tailwind CSS).

**Taxonomy Service (`@platform/taxonomy-service`)** sẽ được xây dựng theo đúng các quy chuẩn kiến trúc hiện hữu:

```
                      ┌────────────────────────────────────────┐
                      │      AUTH SERVICE (@platform/auth)     │
                      │  - Issue RS256 JWT Token               │
                      │  - Database: auth_db (AUTH_DB_URL)     │
                      └──────────────────┬─────────────────────┘
                                         │ Bearer JWT (id, email, roles)
             ┌───────────────────────────┴───────────────────────────┐
             ▼                                                       ▼
┌────────────────────────────────────────┐               ┌────────────────────────────────────────┐
│     QUIZ SERVICE (@platform/quiz)      │  Client / SDK │   TAXONOMY SERVICE (@platform/taxonomy)│
│ - Assessment Engine & Grading Core     │◄─────────────►│ - Knowledge Catalog & Cây danh mục     │
│ - Tự lưu:                              │  (@platform/  │ - Tự lưu 2 bảng: taxonomies, nodes     │
│     primary_node_id (VARCHAR(64))      │   api-client) │ - Chuẩn Adjacency List + Recursive CTE │
│     tag_node_ids (JSONB/TEXT[])        │               │ - Database: taxonomy_db                │
│ - Database: quiz_db (QUIZ_DB_URL)      │               │   (TAXONOMY_DATABASE_URL)              │
└────────────────────────────────────────┘               └────────────────────────────────────────┘
             │                                                       │
             └───────────────────────────┬───────────────────────────┘
                                         ▼
                      ┌────────────────────────────────────────┐
                      │    PORT 3000 UNIFIED HTTP GATEWAY      │
                      │  - /v1/auth/*        -> Auth Routes    │
                      │  - /v1/quizzes/*     -> Quiz Routes    │
                      │  - /v1/attempts/*    -> Attempt Routes │
                      │  - /v1/taxonomies/*  -> Taxonomy Routes│
                      │  - /v1/nodes/*       -> Node Routes    │
                      │  - /admin/*          -> Admin Web SPA  │
                      │  - /*                -> Quiz Web SPA   │
                      └────────────────────────────────────────┘
```

---

## 2. NGUYÊN TẮC THỐNG NHẤT TOÀN CODEBASE

### 2.1. Thống nhất Chuẩn Định danh `VARCHAR(64)` (Prefixed String IDs)
Đồng bộ 100% với cách `services/auth` và `services/quiz` đang sử dụng:
- Bảng `taxonomies`: `id VARCHAR(64)` định dạng `tax_<code_or_random>` (vd: `tax_topic`, `tax_difficulty`, `tax_tag`).
- Bảng `taxonomy_nodes`: `id VARCHAR(64)` và `parent_id VARCHAR(64)` định dạng `node_<name_or_random>` (vd: `node_math_root`, `node_algebra_10`).
- Khóa ngoại logic tại Quiz Service: `quizzes.primary_node_id VARCHAR(64)`, đồng nhất với `quizzes.owner_id VARCHAR(64)`.

### 2.2. Thống nhất Chuẩn Phản hồi API (`ApiResponse<T>`)
Mọi endpoint trả về định dạng chuẩn từ `@platform/contracts`:
```typescript
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
```

### 2.3. Thống nhất Mô hình Runtime (Port 3000 Unified Gateway & Standalone Dev)
- **Môi trường Cloud Run / Production**: Hệ thống chỉ mở cổng 3000 ra bên ngoài. `services/taxonomy` export hàm `createTaxonomyRouter()` để mount vào máy chủ chính tại `services/quiz/src/presentation/server.ts` dưới các prefix `/v1/taxonomies` và `/v1/nodes`.
- **Môi trường Phát triển Độc lập**: `services/taxonomy` có file `src/presentation/server.ts` riêng chạy cổng **Port 3002** phục vụ dev/test độc lập.

---

## 3. THIẾT KẾ CƠ SỞ DỮ LIỆU DRIZZLE ORM (2 BẢNG THUẦN TÚY)

Cơ sở dữ liệu độc lập: `taxonomy_db` (kết nối qua `TAXONOMY_DATABASE_URL`).  
Không sử dụng extension PostgreSQL `ltree`, sử dụng Adjacency List chuẩn.

### 3.1. Drizzle Schema File (`services/taxonomy/src/infrastructure/db/schema.ts`)
```typescript
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/**
 * 1. Bảng taxonomies: Quản lý các loại phân loại (Chủ đề, Độ khó, Tags...)
 */
export const taxonomies = pgTable(
  'taxonomies',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    code: varchar('code', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    isHierarchical: boolean('is_hierarchical').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_taxonomies_code').on(table.code),
  ]
);

export type TaxonomyRow = typeof taxonomies.$inferSelect;
export type NewTaxonomyRow = typeof taxonomies.$inferInsert;

/**
 * 2. Bảng taxonomy_nodes: Quản lý cây danh mục theo mô hình Adjacency List
 */
export const taxonomyNodes = pgTable(
  'taxonomy_nodes',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    taxonomyId: varchar('taxonomy_id', { length: 64 })
      .notNull()
      .references(() => taxonomies.id, { onDelete: 'cascade' }),
    parentId: varchar('parent_id', { length: 64 }),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull().default('PUBLISHED'),
    metadata: jsonb('metadata').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_nodes_taxonomy').on(table.taxonomyId),
    index('idx_nodes_parent').on(table.parentId),
    index('idx_nodes_sort').on(table.taxonomyId, table.sortOrder),
    uniqueIndex('uq_nodes_active_slug')
      .on(table.taxonomyId, table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export type TaxonomyNodeRow = typeof taxonomyNodes.$inferSelect;
export type NewTaxonomyNodeRow = typeof taxonomyNodes.$inferInsert;
```

---

## 4. TRUY VẤN CÂY PHÂN CẤP BẰNG RECURSIVE CTE (DRIZZLE REPOSITORY)

Tầng Repository (`DrizzleTaxonomyRepository`) thực thi các truy vấn cây đa tầng bằng SQL tiêu chuẩn:

### 4.1. Lấy toàn bộ ID con cháu (`findDescendantIds`)
```typescript
async findDescendantIds(rootNodeId: string): Promise<string[]> {
  const result = await this.db.execute(sql`
    WITH RECURSIVE node_tree AS (
      SELECT id FROM taxonomy_nodes 
      WHERE id = ${rootNodeId} AND deleted_at IS NULL
      UNION ALL
      SELECT child.id 
      FROM taxonomy_nodes child
      INNER JOIN node_tree parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )
    SELECT id FROM node_tree;
  `);
  return result.map((r: any) => r.id);
}
```

### 4.2. Dựng cây lồng nhau In-Memory $O(N)$ (`getTree`)
Thay vì đệ quy nhiều lần xuống database, repository lấy toàn bộ node của 1 taxonomy (`SELECT * ... ORDER BY sort_order`) và chuyển thành cấu trúc lồng nhau trong Node.js (thời gian xử lý < 1ms):
```typescript
function buildNestedTree(nodes: TaxonomyNodeRow[]): TaxonomyNodeDTO[] {
  const map = new Map<string, TaxonomyNodeDTO>();
  const roots: TaxonomyNodeDTO[] = [];

  for (const n of nodes) {
    map.set(n.id, { ...n, children: [] });
  }

  for (const n of nodes) {
    const item = map.get(n.id)!;
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}
```

---

## 5. BẢNG THIẾT KẾ REST API CONTRACTS & CLIENT SDK

### 5.1. Endpoints Chi Tiết
| Method | Path | Auth / Role | Mô tả chức năng |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/taxonomies` | Public | Lấy danh sách các loại taxonomy |
| `POST` | `/v1/taxonomies` | `ADMIN` | Tạo loại taxonomy mới |
| `GET` | `/v1/taxonomies/:code/tree` | Public | Lấy toàn bộ cây phân cấp (có cache ETag) |
| `POST` | `/v1/taxonomies/:code/nodes` | `ADMIN` | Tạo Node mới |
| `PUT` | `/v1/nodes/:id` | `ADMIN` | Sửa tên, slug, metadata của Node |
| `POST` | `/v1/nodes/:id/move` | `ADMIN` | Di chuyển vị trí nhánh (`newParentId`, chống cycle) |
| `DELETE` | `/v1/nodes/:id` | `ADMIN` | Xóa mềm Node |
| `GET` | `/v1/nodes/:id/descendant-ids` | Public | Lấy mảng ID con cháu (phục vụ lọc đề thi) |

### 5.2. Mở rộng SDK `@platform/api-client`
Bổ sung `taxonomies` vào `ApiClient`:
```typescript
readonly taxonomies = {
  list: async () => this.get<ApiResponse<TaxonomyDTO[]>>('/v1/taxonomies'),
  getTree: async (code: string) => this.get<ApiResponse<TaxonomyTreeDTO>>(`/v1/taxonomies/${code}/tree`),
  create: async (data: CreateTaxonomyInput) => this.post<ApiResponse<TaxonomyDTO>>('/v1/taxonomies', data),
  createNode: async (code: string, data: CreateNodeInput) => this.post<ApiResponse<TaxonomyNodeDTO>>(`/v1/taxonomies/${code}/nodes`, data),
  updateNode: async (id: string, data: UpdateNodeInput) => this.put<ApiResponse<TaxonomyNodeDTO>>(`/v1/nodes/${id}`, data),
  moveNode: async (id: string, newParentId: string | null) => this.post<ApiResponse<void>>(`/v1/nodes/${id}/move`, { newParentId }),
  deleteNode: async (id: string) => this.delete<ApiResponse<void>>(`/v1/nodes/${id}`),
  getDescendantIds: async (id: string) => this.get<ApiResponse<{ nodeIds: string[] }>>(`/v1/nodes/${id}/descendant-ids`),
};
```

---

## 6. CẤU TRÚC THƯ MỤC THỐNG NHẤT (`services/taxonomy`)

Đúng chuẩn kiến trúc phân lớp DDD của Monorepo:
```
services/taxonomy/
├── package.json               # "@platform/taxonomy-service"
├── tsconfig.json
├── drizzle.config.ts
├── src/
│   ├── index.ts               # Export router, repos, use-cases
│   ├── domain/
│   │   ├── entities/          # Taxonomy.ts, TaxonomyNode.ts
│   │   ├── ports/             # taxonomy.repository.port.ts
│   │   └── errors/            # taxonomy-domain.errors.ts
│   ├── application/
│   │   ├── use-cases/         # get-tree.use-case.ts, manage-node.use-case.ts
│   │   └── dtos/              # taxonomy.dto.ts
│   ├── infrastructure/
│   │   ├── db/
│   │   │   ├── connection.ts  # Singleton kết nối TAXONOMY_DATABASE_URL
│   │   │   ├── schema.ts      # Drizzle schema (2 bảng)
│   │   │   ├── migrate.ts     # Script chạy migration
│   │   │   └── seed.ts        # Seed dữ liệu môn học, độ khó, tags
│   │   └── repositories/
│   │       └── drizzle-taxonomy.repository.ts
│   └── presentation/
│       ├── controllers/       # taxonomy.controller.ts
│       ├── routes/            # v1-taxonomies.routes.ts, v1-nodes.routes.ts
│       └── server.ts          # Standalone server (Port 3002 cho dev)
└── tests/
    ├── tree-structure.spec.ts
    ├── cycle-prevention.spec.ts
    └── api.spec.ts
```

---

## 7. CẬP NHẬT CẤU HÌNH MONOREPO & SCRIPT THỐNG NHẤT

### 7.1. Cập nhật `package.json` ở Root
Bổ sung các lệnh đồng bộ:
```json
{
  "scripts": {
    "dev:taxonomy": "tsx watch services/taxonomy/src/presentation/server.ts",
    "db:generate:taxonomy": "drizzle-kit generate --config=services/taxonomy/drizzle.config.ts",
    "db:migrate:taxonomy": "tsx services/taxonomy/src/infrastructure/db/migrate.ts",
    "db:seed:taxonomy": "tsx services/taxonomy/src/infrastructure/db/seed.ts"
  }
}
```

### 7.2. Cập nhật `.env.example`
Bổ sung:
```env
TAXONOMY_DATABASE_URL=
TAXONOMY_PORT=3002
```

---

## 8. LỘ TRÌNH TRIỂN KHAI THEO TỪNG GIAI ĐOẠN

1. **Giai đoạn 1**: Khởi tạo thư mục `services/taxonomy`, thiết lập `package.json` (`@platform/taxonomy-service`) và `tsconfig.json`.
2. **Giai đoạn 2**: Khai báo Schema Drizzle (2 bảng `taxonomies` và `taxonomyNodes`), `connection.ts`, `migrate.ts`, `seed.ts`.
3. **Giai đoạn 3**: Định nghĩa DTOs trong `@platform/contracts` và mở rộng `taxonomies` trong `@platform/api-client`.
4. **Giai đoạn 4**: Cài đặt Domain Entities, Repository Drizzle với Recursive CTE, Use Cases và Routes Express.
5. **Giai đoạn 5**: Thiết lập máy chủ độc lập Standalone Taxonomy Server (Port 3002 qua `TAXONOMY_PORT`), cấu hình Reverse Proxy tại các Web Apps (`apps/admin-web`, `apps/quiz-web`), kiểm thử tích hợp và đảm bảo tính tự chủ hoàn toàn của microservice.
6. **Giai đoạn 6** (ĐÃ HOÀN THÀNH): Bổ sung `primary_node_id` vào `quizzes`, cập nhật giao diện `apps/admin-web` và `apps/quiz-web`.

