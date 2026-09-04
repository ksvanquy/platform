# THIẾT KẾ KIẾN TRÚC & KẾ HOẠCH THỰC THI: HỆ THỐNG PHÂN QUYỀN RBAC THỰC SỰ TRÊN POSTGRESQL (CLEAN-SLATE DEEP REFACTORING)

**Dự án:** Quiz Assessment Platform Monorepo  
**Dịch vụ trọng tâm:** `@platform/auth-service`, `@platform/contracts`, `@platform/quiz-service`  
**Định hướng chiến lược:** **Loại bỏ hoàn toàn tương thích ngược (Zero Backward Compatibility)**, xóa sạch cơ sở dữ liệu cũ (`auth_db`), PostgreSQL là **Single Source of Truth (SoT)** duy nhất.  
**Thư mục lưu trữ:** `/plan/auth_service_rbac_psql_migration_plan.md`  

---

## I. TỔNG QUAN & NGUYÊN TẮC THIẾT KẾ CỐT LÕI (CORE PRINCIPLES)

Do cơ sở dữ liệu cũ `auth_db` được xóa sạch và triển khai mới từ đầu, hệ thống **không cần bất kỳ cơ chế tương thích ngược (Backward Compatibility), không giữ cột tạm thời, không chuyển đổi dữ liệu kế thừa (No Legacy Migration)**.

Toàn bộ kiến trúc được xây dựng mới theo chuẩn **Enterprise Clean RBAC (Chuẩn hóa bậc 3 - 3NF)**:
1. **Loại bỏ hoàn toàn cột `users.roles: text[]`**: Bảng `users` chỉ lưu trữ thông tin nhận dạng (identity) cơ bản.
2. **PostgreSQL là Nguồn Tin cậy Quyền hạn Duy nhất (Database-driven Trust)**:
   - Danh mục vai trò (`roles`) nằm trong bảng `roles`.
   - Danh mục quyền hạn nguyên tử (`permissions`) nằm trong bảng `permissions`.
   - Quan hệ gán vai trò (`user_roles`) và phân quyền cho vai trò (`role_permissions`) là các bảng quan hệ N:N chặt chẽ với Foreign Key Constraints (`ON DELETE CASCADE`).
3. **Loại bỏ Hardcode `SYSTEM_ROLES` trong Mã Nguồn**:
   - Quyền hạn của từng vai trò được định nghĩa và quản lý 100% trong PostgreSQL.
   - Khi khởi tạo database, dữ liệu vai trò và quyền hạn mặc định được nạp qua quy trình `seed` chính thức vào các bảng PostgreSQL.
4. **Hiệu năng Cao & Giảm Thiểu Round-trip (Single-Query Permission Hydration)**:
   - Nạp toàn bộ danh tính, danh sách vai trò và quyền hạn hiệu lực (effective permissions) của người dùng trong **chỉ 1 câu truy vấn SQL (Single Round-trip)** thông qua JOIN tối ưu hoặc PostgreSQL JSON/Array Aggregation.
5. **Độc lập Bounded Context & Zero Trust Verification**:
   - `auth-service` truy xuất PostgreSQL để cấp phát JWT Access Token chứa danh sách claims `roles`, `permissions`, `tenantId`, `userId`.
   - `quiz-service` kiểm tra quyền hạn tức thì (Local Cryptographic Verification) thông qua chữ ký bất đối xứng RS256/JWKS, không gọi chéo sang database của `auth-service`.
6. **Kiến trúc Quyền sở hữu (Ownership Architecture: Hybrid RBAC + ABAC Lightweight)**:
   - **Phân tách trách nhiệm (Separation of Concerns)**:
     - **RBAC (Coarse-grained Authorization)**: Do `auth-service` quản lý làm Single Source of Truth (SoT) trên PostgreSQL, chứng minh người dùng có đủ tư cách năng lực cho hành động (ví dụ: `quiz:update`, `attempt:read`).
     - **ABAC Lightweight (Fine-grained / Contextual Ownership Check)**: Do các Domain Services (`quiz-service`, v.v.) thực thi tại ranh giới nghiệp vụ (Use Cases / Domain Policy) dựa trên ngữ cảnh thực thể (`resource.ownerId`, `resource.tenantId`, `resource.status`) đối chiếu với `Principal` (`principal.id`, `principal.roles`, `principal.tenantId`).
   - **Nguyên tắc "Self vs Any" (Quyền Sở Hữu Tài Nguyên)**:
     - Giảng viên (`INSTRUCTOR`) chỉ có quyền sửa, xuất bản, xóa các bài thi do chính mình tạo ra (`quiz.ownerId === principal.id`).
     - Thí sinh (`STUDENT`) chỉ có quyền truy cập, nộp bài, xem lịch sử các lượt thi của chính mình (`attempt.userId === principal.id`).
     - Quản trị viên (`ADMIN`) sở hữu quyền can thiệp cấp cao (`*` hoặc `quiz:manage_all`) để ghi đè (Bypass Ownership) phục vụ quản lý hệ thống.
   - **Ranh giới cô lập Đa người thuê (Tenant Isolation Boundary)**:
     - Toàn bộ truy vấn và thẩm định tài nguyên phải bảo đảm tính toàn vẹn `resource.tenantId === principal.tenantId`, ngăn ngừa rò rỉ chéo dữ liệu giữa các tổ chức (Cross-Tenant Data Leakage).
7. **Chỉ dùng duy nhất PostgreSQL - Xóa bỏ hoàn toàn In-Memory (Zero In-Memory Policy)**:
   - **Không sử dụng In-Memory Persistence**: Triệt để xóa bỏ các lớp lưu trữ tạm thời trong RAM (`InMemoryUserRepository`, `InMemoryTokenStorage`). Toàn bộ dữ liệu người dùng, vai trò, quyền hạn, phiên làm việc (refresh tokens) đều bắt buộc lưu trữ và truy xuất từ PostgreSQL thông qua Drizzle ORM.
   - **Loại bỏ hoàn toàn cơ chế Fallback sang In-Memory (Fail-Fast Enforcement)**: Nếu thiếu cấu hình kết nối database (`AUTH_DATABASE_URL` hoặc `DATABASE_URL`) hoặc database không sẵn sàng, hệ thống dừng khởi động ngay lập tức (throw Fatal Error) chứ không âm thầm chuyển sang chạy In-Memory giả lập. Điều này ngăn ngừa hoàn toàn tình trạng sai lệch trạng thái, mất mát dữ liệu hoặc test giả định sai hành vi thực tế của PostgreSQL.

---

## II. THIẾT KẾ MÔ HÌNH DỮ LIỆU POSTGRESQL MỚI (100% NORMALIZED RBAC SCHEMA)

### 1. Sơ đồ Quan hệ Thực thể (ERD 3NF)

```text
       +------------------------------------+
       |              users                 |
       +------------------------------------+
       | PK id            VARCHAR(64)       |
       |    email         VARCHAR(255) (UQ) |
       |    name          VARCHAR(255)      |
       |    password_hash TEXT              |
       |    tenant_id     VARCHAR(64)       |
       |    is_active     BOOLEAN           |
       |    created_at    TIMESTAMPTZ       |
       |    updated_at    TIMESTAMPTZ       |
       +-----------------+------------------+
                         | 1
                         |
                         | N
       +-----------------v------------------+              +------------------------------------+
       |            user_roles              |   N      1   |               roles                |
       +------------------------------------+<-------------+------------------------------------+
       | PK,FK user_id    VARCHAR(64)       |              | PK id          VARCHAR(64)         |
       | PK,FK role_id    VARCHAR(64)       |              |    code        VARCHAR(64) (UQ)    |
       |       assigned_at TIMESTAMPTZ      |              |    name        VARCHAR(128)        |
       |       assigned_by VARCHAR(64)      |              |    description TEXT                |
       +------------------------------------+              |    is_system   BOOLEAN             |
                                                           |    created_at  TIMESTAMPTZ         |
                                                           |    updated_at  TIMESTAMPTZ         |
                                                           +-----------------+------------------+
                                                                             | 1
                                                                             |
                                                                             | N
                                                           +-----------------v------------------+
                                                           |          role_permissions          |
                                                           +------------------------------------+
                                                           | PK,FK role_id       VARCHAR(64)    |
                                                           | PK,FK permission_id VARCHAR(64)    |
                                                           |       granted_at    TIMESTAMPTZ    |
                                                           +-----------------+------------------+
                                                                             | N
                                                                             |
                                                                             | 1
       +------------------------------------+              +-----------------v------------------+
       |           refresh_tokens           |              |            permissions             |
       +------------------------------------+              +------------------------------------+
       | PK token_hash   TEXT               |              | PK id          VARCHAR(64)         |
       | FK user_id      VARCHAR(64)        |              |    code        VARCHAR(128) (UQ)   |
       |    expires_at   TIMESTAMPTZ        |              |    resource    VARCHAR(64)         |
       |    revoked_at   TIMESTAMPTZ        |              |    action      VARCHAR(64)         |
       |    created_at   TIMESTAMPTZ        |              |    description TEXT                |
       +------------------------------------+              |    created_at  TIMESTAMPTZ         |
                                                           +------------------------------------+
```

---

### 2. Định nghĩa DDL PostgreSQL Chi tiết (Clean DDL)

```sql
-- 1. Bảng USERS (Đã loại bỏ hoàn toàn cột roles cũ)
CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'tenant_default',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant ON users(tenant_id);

-- 2. Bảng ROLES
CREATE TABLE roles (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE, -- 'ADMIN', 'INSTRUCTOR', 'STUDENT'
    name VARCHAR(128) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_roles_code ON roles(code);

-- 3. Bảng PERMISSIONS
CREATE TABLE permissions (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(128) NOT NULL UNIQUE, -- 'quiz:read', 'quiz:create', '*'
    resource VARCHAR(64) NOT NULL,     -- 'quiz', 'attempt', 'user', 'system'
    action VARCHAR(64) NOT NULL,       -- 'read', 'create', 'update', 'delete', 'manage'
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_permissions_code ON permissions(code);
CREATE INDEX idx_permissions_resource ON permissions(resource);

-- 4. Bảng USER_ROLES
CREATE TABLE user_roles (
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- 5. Bảng ROLE_PERMISSIONS
CREATE TABLE role_permissions (
    role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(64) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_perm ON role_permissions(permission_id);

-- 6. Bảng REFRESH_TOKENS
CREATE TABLE refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

---

## III. THIẾT KẾ TẦNG DOMAIN & ARCHITECTURE (CLEAN ARCHITECTURE)

### 1. Tầng Domain Entities

#### A. Thực thể `Permission` (`src/domain/role/permission.entity.ts`)
```typescript
export interface PermissionProps {
  id: string;
  code: string;
  resource: string;
  action: string;
  description?: string;
  createdAt?: Date;
}

export class Permission {
  readonly id: string;
  readonly code: string;
  readonly resource: string;
  readonly action: string;
  readonly description?: string;
  readonly createdAt: Date;

  constructor(props: PermissionProps) {
    this.id = props.id;
    this.code = props.code.trim();
    this.resource = props.resource.trim().toLowerCase();
    this.action = props.action.trim().toLowerCase();
    this.description = props.description;
    this.createdAt = props.createdAt || new Date();
  }
}
```

#### B. Thực thể `Role` (`src/domain/role/role.entity.ts`)
```typescript
import { Permission } from './permission.entity.js';

export interface RoleProps {
  id: string;
  code: string;
  name: string;
  description?: string;
  isSystem?: boolean;
  permissions?: readonly Permission[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class Role {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly isSystem: boolean;
  readonly permissions: readonly Permission[];
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: RoleProps) {
    this.id = props.id;
    this.code = props.code.toUpperCase().trim();
    this.name = props.name.trim();
    this.description = props.description;
    this.isSystem = Boolean(props.isSystem);
    this.permissions = Object.freeze(props.permissions ? [...props.permissions] : []);
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  getPermissionCodes(): readonly string[] {
    return Object.freeze(this.permissions.map((p) => p.code));
  }
}
```

#### C. Aggregate Root `User` (`src/domain/user/user.entity.ts`)
Thực thể `User` chứa danh sách thực thể `Role` được nạp từ DB.
- **Không còn trường `roles: string[]` nguyên thủy.**
- `getEffectivePermissions()`: Tự động gom nhóm toàn bộ permissions từ tất cả các roles gán cho user, loại bỏ trùng lặp.
- `toPrincipal()`: Đóng gói Principal truyền vào JWT Access Token.

```typescript
import type { Principal } from '@platform/contracts';
import { Role } from '../role/role.entity.js';

export interface UserProps {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  roles: readonly Role[];
  tenantId?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly roles: readonly Role[];
  readonly tenantId: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email.toLowerCase().trim();
    this.name = props.name.trim();
    this.passwordHash = props.passwordHash;
    this.roles = Object.freeze([...props.roles]);
    this.tenantId = props.tenantId || 'tenant_default';
    this.isActive = props.isActive !== undefined ? props.isActive : true;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  getRoleCodes(): readonly string[] {
    return Object.freeze(this.roles.map((r) => r.code));
  }

  getEffectivePermissions(): readonly string[] {
    const permCodes = new Set<string>();
    for (const role of this.roles) {
      for (const perm of role.permissions) {
        permCodes.add(perm.code);
      }
    }
    return Object.freeze(Array.from(permCodes));
  }

  toPrincipal(): Principal {
    return {
      id: this.id,
      roles: this.getRoleCodes(),
      permissions: this.getEffectivePermissions(),
      tenantId: this.tenantId,
    };
  }

  toSafeProfile() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      roles: this.getRoleCodes(),
      permissions: this.getEffectivePermissions(),
      tenantId: this.tenantId,
      isActive: this.isActive,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
```

---

### 2. Tầng Persistence & Data Access (Drizzle ORM)

#### Cập nhật `DrizzleUserRepository`
Khi truy vấn `findByEmail` hoặc `findById`, thực hiện **1 câu SQL JOIN** lấy `users`, `user_roles`, `roles`, `role_permissions`, `permissions`:

```typescript
// services/auth/src/infrastructure/persistence/drizzle-user.repository.ts
export class DrizzleUserRepository implements IUserRepository {
  private readonly db = getAuthDb();

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    const rows = await this.db
      .select({
        userId: users.id,
        userEmail: users.email,
        userName: users.name,
        userPasswordHash: users.passwordHash,
        userTenantId: users.tenantId,
        userIsActive: users.isActive,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
        roleId: roles.id,
        roleCode: roles.code,
        roleName: roles.name,
        roleDesc: roles.description,
        roleIsSystem: roles.isSystem,
        permId: permissions.id,
        permCode: permissions.code,
        permResource: permissions.resource,
        permAction: permissions.action,
        permDesc: permissions.description,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(users.email, normalized));

    if (rows.length === 0) return null;
    return this.mapRowsToUser(rows);
  }

  private mapRowsToUser(rows: any[]): User {
    const first = rows[0];
    const roleMap = new Map<string, { roleProps: any; perms: Permission[] }>();

    for (const r of rows) {
      if (r.roleId && !roleMap.has(r.roleId)) {
        roleMap.set(r.roleId, {
          roleProps: {
            id: r.roleId,
            code: r.roleCode,
            name: r.roleName,
            description: r.roleDesc,
            isSystem: r.roleIsSystem,
          },
          perms: [],
        });
      }
      if (r.roleId && r.permId) {
        roleMap.get(r.roleId)!.perms.push(
          new Permission({
            id: r.permId,
            code: r.permCode,
            resource: r.permResource,
            action: r.permAction,
            description: r.permDesc,
          })
        );
      }
    }

    const domainRoles = Array.from(roleMap.values()).map(
      (entry) => new Role({ ...entry.roleProps, permissions: entry.perms })
    );

    return new User({
      id: first.userId,
      email: first.userEmail,
      name: first.userName,
      passwordHash: first.userPasswordHash,
      roles: domainRoles,
      tenantId: first.userTenantId,
      isActive: first.userIsActive,
      createdAt: first.userCreatedAt,
      updatedAt: first.userUpdatedAt,
    });
  }
}
```

#### Xóa bỏ hoàn toàn In-Memory Fallback trong Persistence Factories (Fail-Fast Rule)

Để bảo đảm tính toàn vẹn và ngăn chặn các lỗi ngầm do chạy in-memory trong môi trường production/testing, `repository.factory.ts` và `token-storage.factory.ts` loại bỏ hoàn toàn mã nguồn fallback:

```typescript
// services/auth/src/infrastructure/persistence/repository.factory.ts
import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { DrizzleUserRepository } from './drizzle-user.repository.js';
import { isAuthDbConfigured } from '../db/connection.js';

export function createUserRepository(): IUserRepository {
  if (!isAuthDbConfigured()) {
    throw new Error(
      'FATAL: AUTH_DATABASE_URL or DATABASE_URL is not configured. In-Memory fallback is strictly forbidden in production and staging.'
    );
  }
  return new DrizzleUserRepository();
}
```

```typescript
// services/auth/src/infrastructure/persistence/token-storage.factory.ts
import { ITokenStorage } from '../../domain/token/token.storage.port.js';
import { DrizzleTokenStorage } from './drizzle-user.repository.js';
import { isAuthDbConfigured } from '../db/connection.js';

export function createTokenStorage(): ITokenStorage {
  if (!isAuthDbConfigured()) {
    throw new Error(
      'FATAL: AUTH_DATABASE_URL or DATABASE_URL is not configured. In-Memory fallback is strictly forbidden in production and staging.'
    );
  }
  return new DrizzleTokenStorage();
}
```

Danh sách các file bị xóa bỏ vĩnh viễn khỏi kiến trúc:
- `services/auth/src/infrastructure/persistence/in-memory-user.repository.ts` (DELETED)
- `services/auth/src/infrastructure/persistence/in-memory-token.storage.ts` (DELETED)

---

## IV. THIẾT KẾ KIẾN TRÚC QUYỀN SỞ HỮU (OWNERSHIP ARCHITECTURE: HYBRID RBAC + ABAC LIGHTWEIGHT)

### 1. Vấn đề của RBAC Thuần túy & Yêu cầu ABAC Lightweight
- **Giới hạn của RBAC thuần túy (Coarse-grained Authorization)**:
  - RBAC chỉ trả lời: *"Người dùng có vai trò gì và có được phép thực hiện hành động này nói chung hay không?"* (Ví dụ: `INSTRUCTOR` có quyền `quiz:update`).
  - RBAC **không** trả lời được: *"Người dùng có được phép chỉnh sửa đề thi CỤ THỂ NÀY hay không?"*. Nếu chỉ dựa vào RBAC, Giảng viên A có thể sửa, xuất bản hoặc xóa đề thi của Giảng viên B (Lỗ hổng IDOR - Insecure Direct Object References). Tương tự, Sinh viên X có thể đọc hoặc nộp bài thi của Sinh viên Y.
- **Giải pháp Hybrid: RBAC + ABAC Lightweight (Resource Ownership & Tenancy Boundary)**:
  - **RBAC (ở Auth Service / PostgreSQL)**: Đóng vai trò là cổng phân loại tư cách (Coarse-grained clearance) — cấp phát `roles`, `permissions`, `tenantId` trong JWT Token.
  - **ABAC Lightweight (ở Domain Services / Quiz Service)**: Đóng vai trò là bộ thẩm định ngữ cảnh tài nguyên (Fine-grained Contextual clearance) — đối chiếu `ownerId`, `userId`, `tenantId`, `status` của Aggregate Root với `Principal`.

```text
+----------------------------------------------------------------------------------------------------+
|                                 LUỒNG THẨM ĐỊNH QUYỀN HẠN 3 LỚP                                    |
|                                (3-LAYER AUTHORIZATION DECISION FLOW)                               |
+----------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
                       [ LỚP 1: TENANT ISOLATION (Đa người thuê) ]
                       resource.tenantId === principal.tenantId ?
                                        │
                               YES      │      NO
                               ┌────────┴────────┐
                               ▼                 ▼
             [ LỚP 2: ACTION CLEARANCE (RBAC) ]  [ 403 FORBIDDEN: TENANT MISMATCH ]
             principal.hasPermission(action) ?
                               │
                      YES      │      NO
                      ┌────────┴────────┐
                      ▼                 ▼
     [ LỚP 3: OWNERSHIP EVALUATION (ABAC) ]   [ 403 FORBIDDEN: INSUFFICIENT PERMISSION ]
     isOwner(principal.id === resource.ownerId)
     OR hasBypass(ADMIN / *:manage_all) ?
                      │
             YES      │      NO
             ┌────────┴────────┐
             ▼                 ▼
      [ 200 OK: ALLOW ]   [ 403 FORBIDDEN: OWNERSHIP VIOLATION ]
```

---

### 2. Mô hình Đánh giá Quyền sở hữu (Ownership Decision Rules)

#### A. Đối với Tài nguyên Đề thi (`Quiz` Aggregate Root)
- **Tạo mới (`quiz:create`)**: Mọi người dùng có quyền `quiz:create` đều được tạo đề thi mới. Khi tạo, `quiz.ownerId = principal.id`.
- **Cập nhật / Thêm phiên bản / Xuất bản (`quiz:update`, `quiz:publish`)**:
  - **Cho phép nếu**: `quiz.ownerId === principal.id` (Chủ sở hữu).
  - **Cho phép nếu**: `principal.roles.includes('ADMIN')` HOẶC `principal.permissions.includes('*')` HOẶC `principal.permissions.includes('quiz:manage_all')` (Quyền quản trị toàn cục).
  - **Từ chối nếu**: Giảng viên khác tìm cách truy cập hoặc sửa đổi đề thi không phải của mình ➔ ném `OwnershipDomainError` (HTTP 403).
- **Xem đề thi (`quiz:read`)**:
  - Đề thi ở trạng thái `PUBLISHED`: Cho phép thí sinh và giảng viên đọc.
  - Đề thi ở trạng thái `DRAFT` / `ARCHIVED`: Chỉ cho phép chính chủ sở hữu (`quiz.ownerId === principal.id`) hoặc `ADMIN`.

#### B. Đối với Tài nguyên Lượt thi (`Attempt` Aggregate Root)
- **Bắt đầu / Làm bài / Nộp bài (`attempt:create`, `attempt:submit`)**:
  - Thí sinh chỉ được thao tác trên bài thi của chính mình: `attempt.userId === principal.id`.
  - Nghiêm cấm hoàn toàn hành vi nộp bài hộ hoặc truy xuất phiên thi của thí sinh khác.
- **Xem kết quả / Bài thi (`attempt:read`)**:
  - Thí sinh: Được xem bài làm của chính mình (`attempt.userId === principal.id`).
  - Giảng viên: Được xem bài làm của thí sinh nộp vào đề thi do mình làm chủ (`quiz.ownerId === principal.id` thông qua quyền `attempt:read` / `attempt:review`).
  - Quản trị viên (`ADMIN` / `attempt:read_all`): Được xem bài làm của tất cả thí sinh trên toàn hệ thống.

---

### 3. Thiết kế Contract & Helper ABAC trong Clean Architecture

#### A. Bổ sung Contract trong `@platform/contracts`
```typescript
// packages/contracts/src/auth/ownership.ts
import type { Principal } from './principal.js';

export interface ResourceOwnershipContext {
  resourceType: 'quiz' | 'attempt' | 'user';
  resourceId: string;
  ownerId: string;
  tenantId: string;
}

export interface OwnershipEvaluationResult {
  allowed: boolean;
  reason?: string;
  isOwner: boolean;
  isAdminBypass: boolean;
}

export function evaluateOwnership(
  principal: Principal,
  resource: ResourceOwnershipContext,
  requiredPermission: string,
  manageAllPermission?: string
): OwnershipEvaluationResult {
  // 1. Kiểm tra Tenant Isolation
  if (principal.tenantId && resource.tenantId && principal.tenantId !== resource.tenantId) {
    return {
      allowed: false,
      reason: 'Cross-tenant access prohibited',
      isOwner: false,
      isAdminBypass: false,
    };
  }

  // 2. Kiểm tra RBAC Action Clearance
  const hasActionPerm =
    principal.permissions.includes('*') || principal.permissions.includes(requiredPermission);
  if (!hasActionPerm) {
    return {
      allowed: false,
      reason: `Missing required permission: ${requiredPermission}`,
      isOwner: false,
      isAdminBypass: false,
    };
  }

  // 3. Kiểm tra Admin Bypass
  const isAdmin =
    principal.roles.includes('ADMIN') ||
    principal.permissions.includes('*') ||
    (manageAllPermission ? principal.permissions.includes(manageAllPermission) : false);

  if (isAdmin) {
    return { allowed: true, isOwner: resource.ownerId === principal.id, isAdminBypass: true };
  }

  // 4. Thẩm định quyền sở hữu tài nguyên (ABAC Ownership)
  const isOwner = resource.ownerId === principal.id;
  if (!isOwner) {
    return {
      allowed: false,
      reason: `Access denied: Principal does not own this ${resource.resourceType}`,
      isOwner: false,
      isAdminBypass: false,
    };
  }

  return { allowed: true, isOwner: true, isAdminBypass: false };
}
```

#### B. Áp dụng tại Application Use Cases (`services/quiz`)
Tầng Application Use Cases của `quiz-service` tiếp nhận `Principal` từ request context và thực hiện kiểm tra quyền sở hữu trước khi thực thi domain logic:

```typescript
// services/quiz/src/application/use-cases/authoring/authoring.use-cases.ts
export class AuthoringUseCases {
  constructor(private readonly quizRepo: IQuizRepository) {}

  async addVersion(input: AddVersionInput, principal: Principal): Promise<QuizVersion> {
    const quiz = await this.quizRepo.findById(input.quizId);
    if (!quiz) throw new EntityNotFoundError('Quiz', input.quizId);

    // Kiểm tra quyền sở hữu qua ABAC policy
    const evaluation = evaluateOwnership(
      principal,
      {
        resourceType: 'quiz',
        resourceId: quiz.id,
        ownerId: quiz.ownerId,
        tenantId: quiz.tenantId || 'tenant_default',
      },
      'quiz:update',
      'quiz:manage_all'
    );

    if (!evaluation.allowed) {
      throw new ForbiddenDomainError(evaluation.reason || 'You do not have permission to modify this quiz');
    }

    // Thực thi nghiệp vụ domain...
    return quiz.addVersion(input);
  }
}
```

---

## V. MA TRẬN PHÂN QUYỀN SEED TRÊN POSTGRESQL MỚI (KÈM PHẠM VI OWNERSHIP)

Khi chạy `db:seed`, hệ thống sẽ nạp trực tiếp danh mục Roles, Permissions và ánh xạ vào PostgreSQL, bao gồm phân định phạm vi rõ ràng giữa **Self (Chính chủ)** và **All (Toàn cục)**:

### 1. Bảng Permissions
| ID | Code | Resource | Action | Phạm vi (Scope) | Mô tả |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `perm_all` | `*` | `*` | `*` | `SYSTEM` | Toàn quyền quản trị tối cao (Bypass toàn bộ Ownership) |
| `perm_quiz_read` | `quiz:read` | `quiz` | `read` | `PUBLIC / SELF` | Xem danh mục đề thi công khai hoặc đề nháp của chính mình |
| `perm_quiz_create` | `quiz:create` | `quiz` | `create` | `SELF` | Tạo đề thi mới (gán người tạo làm ownerId) |
| `perm_quiz_update` | `quiz:update` | `quiz` | `update` | `SELF` | Chỉnh sửa đề thi do chính mình sở hữu |
| `perm_quiz_delete` | `quiz:delete` | `quiz` | `delete` | `SELF` | Xóa đề thi do chính mình sở hữu |
| `perm_quiz_publish` | `quiz:publish` | `quiz` | `publish` | `SELF` | Phát hành đề thi do chính mình sở hữu |
| `perm_quiz_manage_all` | `quiz:manage_all` | `quiz` | `manage_all` | `ALL` | Quản lý, can thiệp bất kỳ đề thi nào của giảng viên khác |
| `perm_attempt_create` | `attempt:create` | `attempt` | `create` | `SELF` | Bắt đầu ca thi cá nhân |
| `perm_attempt_submit` | `attempt:submit` | `attempt` | `submit` | `SELF` | Nộp bài ca thi của chính mình |
| `perm_attempt_read_self` | `attempt:read_self` | `attempt` | `read` | `SELF` | Xem lại bài thi và điểm của chính mình |
| `perm_attempt_read_all` | `attempt:read_all` | `attempt` | `read` | `ALL` | Xem bài làm của tất cả thí sinh trong hệ thống |
| `perm_attempt_review` | `attempt:review` | `attempt` | `review` | `OWNED_QUIZ` | Chấm điểm bài thi nộp vào các đề do mình làm chủ |
| `perm_user_manage` | `user:manage` | `user` | `manage` | `ALL` | Quản lý danh sách người dùng và gán vai trò |
| `perm_system_config` | `system:config` | `system` | `config` | `SYSTEM` | Cấu hình tham số và bảo mật toàn hệ thống |

### 2. Bảng Roles & Liên kết Role - Permissions
1. **`role_student` (`STUDENT`)**:
   - `quiz:read`
   - `attempt:create`
   - `attempt:submit`
   - `attempt:read_self`
2. **`role_instructor` (`INSTRUCTOR`)**:
   - `quiz:read`
   - `quiz:create`
   - `quiz:update` (Áp dụng ABAC: chỉ cập nhật quiz mình sở hữu)
   - `quiz:delete` (Áp dụng ABAC: chỉ xóa quiz mình sở hữu)
   - `quiz:publish` (Áp dụng ABAC: chỉ xuất bản quiz mình sở hữu)
   - `attempt:read_self`
   - `attempt:review` (Chấm bài thuộc quiz do mình sở hữu)
3. **`role_admin` (`ADMIN`)**:
   - `*` (Tự động bypass ownership check, kèm `quiz:manage_all`, `attempt:read_all`, `user:manage`, `system:config`)

### 3. Người dùng mặc định được Seed
- `admin@quiz.local` (password: `admin123`) ➔ Gán `role_admin`
- `instructor@quiz.local` (password: `instructor123`) ➔ Gán `role_instructor`
- `student@quiz.local` (password: `student123`) ➔ Gán `role_student`

---

## VI. KẾ HOẠCH TRIỂN KHAI VÀ THỰC THI (ACTIONABLE WORKPACKAGES)

Do không giữ tương thích ngược, toàn bộ các gói công việc được triển khai dứt điểm và nhất quán:

1. **Gói WP-1: Định nghĩa lại Drizzle Schema (Clean Schema) [HOÀN THÀNH ✅]**
   - Đã cập nhật `services/auth/src/infrastructure/db/schema.ts`: Định nghĩa 6 bảng chuẩn hóa 3NF (`users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `refresh_tokens`). Đã xóa bỏ hoàn toàn cột mảng `roles: text[]` trên bảng `users`.
   - Bổ sung toàn bộ indexes hiệu năng cao (`tenant_id`, `code`, `resource`, `user_id`, `role_id`, `permission_id`) và relational definitions.
   - Cập nhật đồng bộ migration script `services/auth/drizzle/migrations/0000_remarkable_grandmaster.sql`.
2. **Gói WP-2: Xây dựng Migration Script và Seed Script Mới (Chuẩn Ownership Scope) [HOÀN THÀNH ✅]**
   - Đã cập nhật `services/auth/src/infrastructure/db/migrate.ts`: Hỗ trợ chạy tự động `migrate(db, { migrationsFolder })` trực tiếp vào PostgreSQL mới.
   - Đã cập nhật `services/auth/src/domain/role/default-rbac.data.ts` và `services/auth/src/infrastructure/db/seed.ts`: Nạp đủ 16 permissions chuẩn hóa, bao gồm phân định phạm vi Ownership (`quiz:manage_all`, `attempt:read_self`, `attempt:read_all`, `quiz:update`, `quiz:delete`, `quiz:publish`, `attempt:review`), nạp 3 roles (`STUDENT`, `INSTRUCTOR`, `ADMIN`), ánh xạ `role_permissions`, nạp users mặc định và gán `user_roles`.
3. **Gói WP-3: Tái cấu trúc Tầng Domain Auth Service [HOÀN THÀNH ✅]**
   - Đã cập nhật `services/auth/src/domain/role/permission.entity.ts`: Đầy đủ thuộc tính nguyên tử, phương thức khớp mã `matches()`, kiểm tra wildcard `isWildcard()`, kiểm tra quyền hạn toàn cục `isManageAll()`, và chuyển đổi `toJSON()`.
   - Đã cập nhật `services/auth/src/domain/role/role.entity.ts`: Danh sách Permissions bất biến (`Object.freeze`), kiểm tra quyền hạn `hasPermission()` hỗ trợ wildcard `*`, định danh quản trị viên `isAdministrator()`, immutability builder `withPermissions()`, và `toJSON()`.
   - Đã cập nhật `services/auth/src/domain/user/user.entity.ts`: Chuẩn hóa `toPrincipal()` trả về đầy đủ `{ id, roles, permissions, tenantId }`, tích hợp các domain policy methods: `hasRole()`, `hasPermission()` (tự động bypass cho Admin/Wildcard), `isAdmin()`, `canAccessTenant()`, và `withRoles()`.
4. **Gói WP-4: Tái cấu trúc Tầng Persistence (100% PostgreSQL - Xóa bỏ hoàn toàn In-Memory)**
   - **Loại bỏ vĩnh viễn In-Memory Repositories**:
     - Xóa bỏ hoàn toàn `in-memory-user.repository.ts` và `in-memory-token.storage.ts`. Hệ thống không duy trì bất kỳ mã nguồn in-memory giả lập nào.
   - **Tối ưu hóa và Độc quyền hóa Drizzle Persistence**:
     - `DrizzleUserRepository` là triển khai duy nhất của `IUserRepository`, chịu trách nhiệm thực hiện single-query JOIN lấy User cùng toàn bộ Roles và Permissions, danh sách Roles và Permissions trực tiếp từ các bảng quan hệ PostgreSQL.
     - `DrizzleTokenStorage` là triển khai duy nhất của `ITokenStorage`, quản lý toàn bộ vòng đời Refresh Token, kiểm tra revocation và rotation trực tiếp trong bảng `refresh_tokens`.
   - **Refactor Repository & Token Storage Factories**:
     - Cập nhật `repository.factory.ts` và `token-storage.factory.ts` để chỉ khởi tạo Drizzle persistence kết nối PostgreSQL.
     - **Fail-Fast**: Nếu thiếu chuỗi kết nối (`AUTH_DATABASE_URL` hoặc `DATABASE_URL`), throw Fatal Error ngay khi khởi tạo thay vì âm thầm fallback sang In-Memory.
   - **Kiểm thử Tích hợp trên PostgreSQL**: Mọi bài kiểm thử tích hợp cho tầng Auth & RBAC đều bắt buộc kết nối và chạy trực tiếp trên cơ sở dữ liệu PostgreSQL chuẩn (không dùng mock in-memory), đảm bảo kiểm chứng toàn vẹn các ràng buộc khóa ngoại (Foreign Key Constraints) và Cascade Deletion.
5. **Gói WP-5: Chuẩn hóa Contracts & Cơ chế Thẩm định Ownership (RBAC + ABAC Lightweight)**
   - Cập nhật `@platform/contracts`: Xuất khẩu `evaluateOwnership`, `ResourceOwnershipContext`, `OwnershipEvaluationResult`.
   - Đảm bảo `Principal` contract chứa đầy đủ `id`, `roles`, `permissions`, `tenantId`.
6. **Gói WP-6: Áp dụng Ownership Policy tại Quiz Service**
   - Tích hợp `evaluateOwnership` vào `AuthoringUseCases` (`addVersion`, `publishQuiz`, `updateQuiz`) để ngăn chặn Giảng viên sửa bài của nhau.
   - Xác thực `attempt.userId === principal.id` trong `DeliveryUseCases` để đảm bảo sinh viên chỉ thao tác trên bài thi của mình.
   - Trả về mã lỗi chuẩn `HTTP 403 Forbidden` (`FORBIDDEN_OWNERSHIP_MISMATCH`) khi vi phạm quyền sở hữu.
7. **Gói WP-7: Endpoints Quản trị RBAC & Token Service**
   - `GET /v1/auth/roles`: Liệt kê các vai trò và quyền hạn trực tiếp từ database.
   - `GET /v1/auth/permissions`: Liệt kê toàn bộ quyền hạn hệ thống.
8. **Gói WP-8: Kiểm thử Toàn diện & Xác thực Hệ thống (RBAC + ABAC Tests)**
   - Viết unit & integration tests kiểm thử kịch bản:
     - Giảng viên A tạo đề thi ➔ Giảng viên B tìm cách cập nhật đề thi của Giảng viên A ➔ Bị chặn với HTTP 403.
     - Admin cập nhật đề thi của Giảng viên A ➔ Cho phép thành công (Admin Override).
     - Sinh viên X tìm cách nộp bài thi hoặc xem kết quả của Sinh viên Y ➔ Bị chặn với HTTP 403.
   - Chạy toàn bộ test suites (`npx vitest run`) đảm bảo 100% tests pass.
   - Chạy `compile_applet` và `lint_applet` đảm bảo không có lỗi biên dịch.
