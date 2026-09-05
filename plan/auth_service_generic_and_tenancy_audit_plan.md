# KIẾN TRÚC & KẾ HOẠCH HÀNH ĐỘNG: AUDIT AUTH SERVICE GENERIC & TỐI ƯU HÓA PHẠM VI NGHIỆP VỤ TENANTID
## (CHIẾN LƯỢC SỬA SÂU TRỰC TIẾP - CLEAN-CUT REFACTORING, BỎ QUA TƯƠNG THÍCH NGƯỢC)

**Mã tài liệu:** `PLAN-AUTH-GENERIC-TENANCY-01-CLEAN-CUT`  
**Định hướng thiết kế:** **Sửa sâu trực tiếp (Direct Deep Refactoring - Zero Backward Compatibility Shims)**  
**Trạng thái:** Active Architecture Blueprint & Action Plan  
**Dịch vụ liên quan:** `services/auth`, `services/quiz`, `packages/contracts`, `packages/auth-client`, `apps/quiz-web`, `apps/admin-web`  
**Điểm tập trung cốt lõi:**
- **Auth Service (`services/auth`)**: 100% Pure Generic Identity & Access Management (IdP). Cắt bỏ hoàn toàn khái niệm `tenantId`, không giữ lại shim/getter tương thích ngược, không hardcode domain permissions của Quiz.
- **Quiz Service (`services/quiz`)**: Tự chủ 100% logic phân lập tổ chức (Tenancy Boundary) thông qua HTTP Header `X-Tenant-ID` và Domain Context.
- **Hợp đồng Chung (`@platform/contracts`)**: Làm sạch `Principal`, tách bạch ranh giới giữa Định danh cá nhân (`Identity`) và Ngữ cảnh tổ chức (`Tenant Context`).

---

## I. TỔNG QUAN & NGUYÊN TẮC "SỬA SÂU TRỰC TIẾP" (CLEAN-CUT DIRECT REFACTOR)

### 1. Quyết Định Kiến Trúc: Bỏ Qua Tương Thích Ngược
- **Tại sao không giữ tương thích ngược (Deprecation / Fallback Shims)?**
  - Các giải pháp nửa vời (giữ getter `get tenantId()`, gán fallback `'tenant_default'`, đóng gói `defaultTenantId` vào token claims) sẽ tạo ra **nợ kỹ thuật (Technical Debt)** kéo dài.
  - Các lập trình viên và service mới tiếp tục phụ thuộc vào `principal.tenantId` giả lập, khiến Auth Service không bao giờ thực sự trở thành một Generic IdP độc lập.
  - Cắt bỏ hoàn toàn (Clean Break) giúp hệ thống tường minh 100%, lỗi biên dịch TypeScript xuất hiện ngay lập tức ở mọi điểm phụ thuộc sai để refactor dứt điểm một lần.

### 2. Hai Trụ Cột Ranh Giới Bounded Context
1. **Trụ cột 1: Auth Service = Pure Identity & Global Access (IdP)**
   - Quản lý định danh: Người dùng (`users`: `id`, `email`, `name`, `password_hash`, `is_active`, `metadata`).
   - Quản lý phân quyền toàn cục (Global RBAC): Vai trò (`ADMIN`, `INSTRUCTOR`, `STUDENT`) và Quyền hệ thống (`*`, `user:*`, `role:*`, `permission:*`, `system:*`).
   - Tuyệt đối **KHÔNG** chứa cột `tenant_id`, không chứa quyền đặc thù bài thi (`quiz:*`, `attempt:*`), không chứa logic thẩm định tổ chức.
2. **Trụ cột 2: Quiz Service = Domain Resource Server & Tenancy Owner**
   - Đề thi (`quizzes`) và lượt làm bài (`attempts`) bắt buộc có `tenant_id`.
   - Ngữ cảnh tổ chức được truyền tải qua HTTP Header chuẩn: `X-Tenant-ID: <tenant_id>`.
   - Phân quyền nghiệp vụ (Business Authorization) do Quiz Service tự sở hữu và tự đối chiếu dựa trên Role của Principal và `tenant_id` của tài nguyên.

---

## II. AUDIT TOÀN DIỆN HIỆN TRẠNG CODEBASE (CODEBASE AUDIT)

Dưới đây là chi tiết các điểm phụ thuộc của `tenantId` và mã nghiệp vụ trên toàn bộ codebase hiện tại:

### 1. Phân tích Hiện trạng `services/auth`

| Vị trí Tệp tin | Đoạn mã / Dòng | Đánh giá Rủi ro Kiến trúc |
| :--- | :--- | :--- |
| `services/auth/src/infrastructure/db/schema.ts` | Dòng 23: `tenantId: varchar('tenant_id', { length: 64 }).notNull().default('tenant_default')` | **Nghiêm trọng (Anti-pattern)**: Ép quan hệ 1:1 giữa Identity và Tenant. Khóa cứng schema người dùng vào 1 tenant duy nhất. |
| `services/auth/src/domain/user/user.entity.ts` | Dòng 27, 38, 99-102: `canAccessTenant(targetTenantId)` | Entity `User` gánh logic thẩm định tenant - vi phạm nguyên tắc tách biệt IdP và Domain. |
| `services/auth/src/domain/role/default-rbac.data.ts` | Dòng 14-26: `quiz:read`, `quiz:create`, `attempt:create`, `attempt:submit`... | **Ô nhiễm Bounded Context**: Auth Service hardcode các hành động nghiệp vụ của Quiz Service vào bảng `permissions` của `auth_db`. |
| `services/auth/src/application/register/register.use-case.ts` | Dòng 65: `const tenantId = dto.tenantId?.trim() || 'tenant_default'` | Bắt buộc client phải gửi `tenantId` ngay khi đăng ký tài khoản người dùng toàn cục. |
| `services/auth/src/infrastructure/token/token.service.ts` | Dòng 14: `tenantId?: string` trong `TokenPayload` | Đóng gói cứng `tenantId` vào JWT Access Token mà không hỗ trợ chuyển đổi ngữ cảnh (Context Switching). |

### 2. Phân tích Hiện trạng `services/quiz`

| Vị trí Tệp tin | Đoạn mã / Thành phần | Nhận xét Nghiệp vụ |
| :--- | :--- | :--- |
| `services/quiz/src/infrastructure/db/schema.ts` | `quizzes.tenantId`, `attempts.tenantId` | **Đúng nghiệp vụ**: Bài thi và lượt làm bài bắt buộc phải thuộc về một tổ chức/đơn vị cụ thể để phân lập dữ liệu. |
| `services/quiz/src/domain/authoring/quiz.entity.ts` | `quiz.tenantId` | **Đúng nghiệp vụ**: Thuộc tính của Aggregate Quiz. |
| `services/quiz/src/domain/delivery/attempt.aggregate.ts` | `attempt.tenantId` | **Đúng nghiệp vụ**: Thuộc tính của Aggregate Attempt. |
| `services/quiz/src/presentation/middlewares/auth.middleware.ts` | Đọc `payload.tenantId` hoặc `req.headers['x-tenant-id']` | Hỗ trợ fallback header, nhưng đang phụ thuộc lớn vào JWT payload do `auth-service` phát hành. |
| `services/quiz/src/application/use-cases/delivery/delivery.use-cases.ts` | `principal.tenantId !== quiz.tenantId` | Nếu `principal.tenantId` bị Auth Service gán cố định, người dùng không thể làm bài thi của tenant khác kể cả khi được mời hoặc được cấp quyền. |

### 3. Phân tích Hiện trạng Hợp đồng Chia sẻ (`@platform/contracts`)

| Vị trí Tệp tin | Định nghĩa | Đánh giá |
| :--- | :--- | :--- |
| `packages/contracts/src/auth/principal.ts` | `interface Principal { id: string; roles: readonly string[]; permissions?: readonly string[]; tenantId?: string; }` | `tenantId` là trường tuỳ chọn (`optional`), nhưng đang được hiểu là "tenant của người dùng" thay vì "ngữ cảnh tenant đang hoạt động". |
| `packages/contracts/src/auth/ownership.ts` | `evaluateOwnership(principal, resource, ...)` | So sánh `principal.tenantId !== resource.tenantId`. |

---

## III. ĐỐI CHIẾU CÁC MÔ HÌNH KIẾN TRÚC GIẢI PHÁP

Để giải quyết triệt để vấn đề và biến `services/auth` thành **Generic IAM Service**, chúng ta xem xét 3 phương án kiến trúc:

```text
+-----------------------------------------------------------------------------------------------+
|                                SO SÁNH 3 MÔ HÌNH KIẾN TRÚC TENANCY                            |
+-----------------------------------------------------------------------------------------------+

[MÔ HÌNH 1: HIỆN TẠI (Coupled Single-Tenant User)]
  User (auth_db) ---> Bắt buộc có 1 tenant_id
  Hạn chế: 1 User = 1 Tenant vĩnh viễn. Auth Service bị dính chặt nghiệp vụ.

[MÔ HÌNH 2: MULTI-TENANT ORGANIZATIONS TRONG AUTH SERVICE (Clerk / WorkOS Style)]
  auth_db:
    users (id, email, password)
    organizations (id, name, slug)
    organization_members (user_id, org_id, role)
  Đánh giá: Rất mạnh mẽ nếu hệ thống là SaaS đa tổ chức dùng chung, nhưng Auth Service trở nên
           nặng nề, quản lý cả vòng đời Organization, lời mời (Invites), chuyển đổi Org.

[MÔ HÌNH 3: PURE GENERIC AUTH + METADATA & DOMAIN-OWNED TENANCY (KHUYẾN NGHỊ TỐI ƯU)]
  1. Auth Service: Thuần túy Generic Identity Provider:
     - users: id, email, name, password_hash, is_active, metadata (JSONB)
     - roles & permissions: Generic Scopes & Global Roles.
     - Không có cột tenant_id trong schema cốt lõi.
  2. Quiz Service (và các Domain Services khác):
     - Tự sở hữu toàn bộ logic Tenancy: quizzes.tenant_id, attempts.tenant_id.
     - Xác định Tenant qua: Request Header `X-Tenant-ID`, Domain URL/Subdomain, hoặc
       bảng thành viên phân quyền trong Quiz (`quiz_tenant_members` / enrollments).
```

### So sánh Chi tiết:

| Tiêu Chí Đánh Giá | Mô hình 1 (Hiện tại) | Mô hình 2 (Org trong Auth) | Mô hình 3 (Generic Auth + Domain Tenancy) |
| :--- | :--- | :--- | :--- |
| **Tính Generic của Auth** | Thấp (Bị khóa vào 1 tenant) | Trung bình (Biết về Org) | **Tuyệt đối (100% Generic IdP)** |
| **Khả năng 1 User đa Tenant** | Không thể (Phải tạo nhiều tài khoản) | Có (Chuyển Org qua Token) | **Rất dễ dàng và linh hoạt** |
| **Độ phức tạp của Auth Service** | Thấp nhưng sai nghiệp vụ | Rất cao (Thêm 4-5 bảng) | **Gọn nhẹ, chuẩn mực Clean Architecture** |
| **Độ độc lập của Quiz Service** | Bị phụ thuộc vào tenant của Auth | Phụ thuộc vào Org của Auth | **Tự chủ hoàn toàn ranh giới nghiệp vụ bài thi** |
| **Khả năng cắm dịch vụ mới** | Khó (Dịch vụ mới bị ép có tenant) | Tương đối | **Cực kỳ dễ dàng (E-commerce, Forum, LMS...)** |

---

## IV. KIẾN TRÚC MỤC TIÊU (TARGET ARCHITECTURE)

### 1. Kiến trúc Generic Auth Service
Auth Service chỉ quản lý:
1. **Users (Định danh)**:
   - `id`: Định danh duy nhất (UUID/ULID/CUID).
   - `email`: Tên đăng nhập chuẩn hóa duy nhất.
   - `name`: Tên hiển thị người dùng.
   - `password_hash`: Băm mật khẩu Argon2id / Scrypt.
   - `metadata`: Trường `JSONB` mở rộng (chứa avatar, phone, preferences, defaultTenantId tuỳ chọn).
   - `is_active`, `created_at`, `updated_at`.
2. **Roles & Scopes (Quyền hạn cấp hệ thống)**:
   - Thay vì hardcode quyền hạn đặc thù của Quiz (`quiz:create`, `quiz:publish`) vào database của Auth Service, Auth Service hỗ trợ:
     - **Roles hệ thống chuẩn**: `ADMIN`, `USER`, `INSTRUCTOR` (hoặc custom roles qua API).
     - **Phân quyền linh hoạt (Scopes)**: Quản lý permissions như các danh mục hành động mà các client applications / resource servers đăng ký, hoặc Auth Service cấp phát các quyền tổng quát (`*`, `read`, `write`, `admin`).
3. **JWT Token phát hành**:
   - Chứa các claims chuẩn OIDC: `sub`, `email`, `name`, `roles`, `permissions`.
   - Thuộc tính `metadata`: Có thể mang theo các thông tin người dùng yêu cầu mà không biến Auth Service thành máy chủ lưu trữ nghiệp vụ.

### 2. Kiến trúc Tenancy tại Quiz Service
Quiz Service là nơi quyết định 100% nghiệp vụ phân chia tổ chức:
1. **Thực thể thuộc Tenant**:
   - `quizzes.tenant_id`: Xác định đề thi thuộc trường học / tổ chức nào.
   - `attempts.tenant_id`: Xác định lượt làm bài thuộc tổ chức nào (luôn kế thừa từ bài thi).
2. **Cơ chế phân giải Tenant (Tenant Resolution Strategy)**:
   - Client gửi ngữ cảnh qua Header HTTP: `X-Tenant-ID: <tenant_id>`.
   - Hoặc xác định từ URL/Subdomain: `tenant-a.quizplatform.com`.
   - Hoặc Quiz Service truy xuất bảng liên kết người dùng với tổ chức nội bộ (`tenant_memberships` / `enrollments`).
3. **Bảo vệ Ranh giới Tổ chức (Tenant Boundary Enforcement)**:
   - Mọi truy vấn lấy danh sách đề thi, tạo đề thi, làm bài thi đều lọc theo `tenant_id` được chỉ định của phiên làm việc.
   - Người dùng `ADMIN` có thể xem toàn bộ hoặc chỉ định tenant; người dùng thông thường chỉ thao tác trong tenant mà họ đang truy cập hợp lệ.

---

## V. KẾ HOẠCH HÀNH ĐỘNG CHI TIẾT (ACTIONABLE WORK PACKAGES: WP-1 ĐẾN WP-6)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        LỘ TRÌNH THỰC HIỆN REFACTORING GENERIC AUTH                     │
├────────┬───────────────────────────────────────────────────────────────────────────────┤
│  WP-1  │ Thiết kế lại Schema Users trong Auth Service (Bỏ tenantId, thay bằng metadata)│
│  WP-2  │ Generic hóa Permissions & Roles trong Auth Service (Loại bỏ domain coupling)  │
│  WP-3  │ Tái cấu trúc Hợp đồng (@platform/contracts & @platform/auth-client)          │
│  WP-4  │ Đưa Toàn Bộ Logic Phân Lập Tenancy về Tự Chủ tại Quiz Service                 │
│  WP-5  │ Cập nhật Web Applications (quiz-web, admin-web) & Header Interceptors         │
│  WP-6  │ Di Trú Dữ Liệu, Cập nhật Toàn bộ Test Suites & Kiểm Thử Toàn Diện             │
└────────┴───────────────────────────────────────────────────────────────────────────────┘
```

### Chi Tiết Từng Gói Công Việc (Đã Được Kiểm Toán & Gia Cố Toàn Diện):

---

### **Gói WP-1: Sạch Sẽ Tuyệt Đối Trong Auth Service (Clean-Cut Zero-Tenant Users)**
*Mục tiêu: Xóa bỏ 100% mọi khái niệm, trường dữ liệu, getter hay shim liên quan đến `tenantId` trong Auth Service. Bỏ qua hoàn toàn tương thích ngược.*

#### 1. Hành Động Triệt Để (Zero Backward Compatibility):
- **Cắt bỏ hoàn toàn khỏi Domain Entity (`services/auth/src/domain/user/user.entity.ts`)**:
  - Xóa bỏ hoàn toàn thuộc tính `tenantId`.
  - **KHÔNG tạo getter `get tenantId()` và KHÔNG dùng fallback `'tenant_default'`**.
  - Xóa bỏ hoàn toàn phương thức vi phạm Bounded Context `canAccessTenant(targetTenantId)`.
  - Entity `User` chỉ đại diện cho định danh cá nhân thuần túy:
    ```typescript
    export class User {
      readonly id: string;
      readonly email: string;
      readonly name: string;
      readonly passwordHash: string;
      readonly roles: readonly Role[];
      readonly isActive: boolean;
      readonly metadata: Record<string, unknown>;
      readonly createdAt: Date;
      readonly updatedAt: Date;
    }
    ```
- **Làm sạch Database Schema (`services/auth/src/infrastructure/db/schema.ts`)**:
  - Xóa triệt để cột `tenantId` và index `users_tenant_id_idx`.
  - Bảng `users` chỉ lưu `metadata: jsonb('metadata').notNull().default({})` (dành cho thông tin mở rộng của người dùng như avatar, bio, settings).
- **Làm sạch Drizzle Repository (`drizzle-user.repository.ts`) & In-Memory Repository**:
  - Xóa bỏ mọi tham chiếu tới `tenantId` trong `mapRowsToUser`, `findById`, `findByEmail`, câu lệnh `insert` và `onConflictDoUpdate`.
- **Làm sạch Use Cases & HTTP Router**:
  - `RegisterUseCase`: Interface `RegisterDto` chỉ nhận `{ email, name, password, metadata }`. Xóa bỏ hoàn toàn tham số `tenantId`.
  - `LoginUseCase` & `GetProfileUseCase`: User profile trả về `{ id, email, name, roles, permissions, metadata, createdAt }`. Không có trường `tenantId`.
  - `auth.router.ts`: Xóa bỏ việc trích xuất và xử lý `tenantId` từ `req.body`.
- **Làm sạch Token Service (`token.service.ts`)**:
  - Interface `TokenPayload` loại bỏ hoàn toàn `tenantId?: string`.
  - JWT token được cấp phát chỉ chứa thông tin định danh và quyền toàn cục:
    ```typescript
    export interface TokenPayload {
      sub: string;
      email: string;
      name: string;
      roles: string[];
      permissions?: string[];
      metadata?: Record<string, unknown>;
    }
    ```
- **Làm sạch Seeding (`seed.ts`)**:
  - Xóa bỏ mọi giá trị `defaultTenantId: 'tenant_default'` trong mảng `SEED_USERS`. Dữ liệu người dùng chỉ chứa `metadata: {}`.

#### 2. Kịch Bản Di Trú Dữ Liệu Dứt Điểm (Clean Direct Migration):
```sql
-- Thêm cột metadata mới cho thông tin mở rộng
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- Xóa bỏ hoàn toàn index và cột tenant_id (không giữ lại làm nợ kỹ thuật)
DROP INDEX IF EXISTS users_tenant_id_idx;
ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;
```

---

### **Gói WP-2: Thanh Trừng Triệt Để Domain Coupling Khỏi Auth Service (Purge Domain Permissions)**
*Mục tiêu: Auth Service không biết và không quan tâm đến bài thi hay lượt thi của Quiz Service.*

#### 1. Cắt Bỏ Toàn Bộ Domain Permissions (`default-rbac.data.ts`):
- **Hiện trạng ô nhiễm**: Auth Service đang khai báo `quiz:read`, `quiz:create`, `quiz:publish`, `quiz:manage_all`, `attempt:create`, `attempt:submit`, `attempt:grade`, `attempt:review`.
- **Hành động cắt bỏ dứt điểm**:
  - Xóa bỏ 100% các quyền có tiền tố `quiz:*` và `attempt:*` khỏi `DEFAULT_PERMISSIONS_DATA` và khỏi ma trận vai trò mặc định (`ROLE_PERMISSIONS_MAP`).
  - Auth Service chỉ lưu trữ và cấp phát các quyền cốt lõi cấp hệ thống (System & Identity Scopes):
    - `*` (Full Admin)
    - `user:read`, `user:write`, `user:manage`
    - `role:read`, `role:write`
    - `permission:read`
    - `system:config`
- **Nguyên tắc Phân quyền Nghiệp vụ (Domain RBAC)**:
  - Quiz Service tự sở hữu toàn bộ ma trận quyền nghiệp vụ của chính nó.
  - Quiz Service đối chiếu vai trò người dùng (ví dụ: `INSTRUCTOR`, `STUDENT`) do Auth Service cấp với Policy nội bộ của Quiz để cho phép tạo đề thi hoặc làm bài thi.

---

### **Gói WP-3: Tái Cấu Trúc Hợp Đồng Sạch Sẽ (@platform/contracts & @platform/auth-client)**
*Mục tiêu: Phân định rạch ròi giữa Định Danh (Identity) và Ngữ Cảnh Tổ Chức (Tenant Context), loại bỏ hoàn toàn tenantId khỏi Principal.*

#### 1. Làm Sạch Interface `Principal` (`packages/contracts/src/auth/principal.ts`):
- **Bỏ qua tương thích ngược**: Xóa bỏ hoàn toàn thuộc tính `tenantId?: string` khỏi `Principal`.
  ```typescript
  export interface Principal {
    readonly id: string;
    readonly roles: readonly string[];
    readonly permissions?: readonly string[];
    readonly metadata?: Record<string, unknown>;
  }
  ```
- **Tách riêng Hợp đồng Ngữ Cảnh Tổ Chức (Tenant Context Contract)**:
  - Khởi tạo interface độc lập dành riêng cho các Resource Services:
    ```typescript
    export interface TenantContext {
      readonly tenantId: string;
    }

    export interface TenantScopedResource {
      readonly tenantId: string;
    }

    export interface OwnedResource {
      readonly ownerId?: string;
      readonly instructorId?: string;
      readonly userId?: string;
    }
    ```
- **Tái Cấu Trúc Hàm Thẩm Định Quyền Sở Hữu (`packages/contracts/src/auth/ownership.ts`)**:
  - Tách thành 2 hàm độc lập, rõ ràng về mặt toán học và logic ranh giới:
    1. `evaluateTenantIsolation(tenantContext: TenantContext, resource: TenantScopedResource): boolean`  
       $\rightarrow$ Đảm bảo request đang thao tác đúng tổ chức của tài nguyên.
    2. `evaluateResourceOwnership(principal: Principal, resource: OwnedResource): boolean`  
       $\rightarrow$ Đảm bảo người dùng sở hữu tài nguyên hoặc có vai trò quản trị.

#### 2. Cập Nhật `@platform/auth-client`:
- Loại bỏ trường `tenantId` khỏi `RegisterPayload`, `AuthResponse`, và `UserProfile`.
- Client chỉ giao tiếp định danh cá nhân với Auth Service.

---

### **Gói WP-4: Tự Chủ Tenancy 100% Tại Quiz Service (Domain-Driven Tenancy)**
*Mục tiêu: Đưa toàn bộ quyền quyết định và ranh giới tổ chức về đúng Quiz Service mà không phụ thuộc vào Auth Token.*

#### 1. Cơ Chế Xác Thực & Phân Giải Tenant Tại Quiz Service (`auth.middleware.ts`):
- **Bỏ qua tương thích ngược**: Middleware tuyệt đối KHÔNG đọc `payload.tenantId` hay fallback token.
- Phân tách rõ ràng giữa **Principal (Định danh)** và **TenantContext (Ngữ cảnh tổ chức)**:
  ```typescript
  // services/quiz/src/presentation/middlewares/auth.middleware.ts
  const rawTenantId = req.headers['x-tenant-id'] as string;
  const tenantId = rawTenantId?.trim();

  // Đính kèm Principal từ Access Token hợp lệ
  req.principal = {
    id: payload.sub,
    roles: payload.roles,
    permissions: payload.permissions,
    metadata: payload.metadata,
  };

  // Đính kèm TenantContext trực tiếp từ HTTP Header
  req.tenantContext = tenantId ? { tenantId } : undefined;
  ```

#### 2. Thẩm Định Ranh Giới Nghiệp Vụ Tại Quiz Use Cases:
- **Tạo Đề Thi (`CreateQuizUseCase`)**:
  - Đề thi bắt buộc phải gắn với `tenantId` hợp lệ được cung cấp từ Header `X-Tenant-ID`.
  - Giảng viên (`INSTRUCTOR`) chỉ được tạo đề thi trong phạm vi `tenantId` của ngữ cảnh phiên làm việc.
- **Làm Bài Thi (`StartAttemptUseCase`)**:
  - Thẩm định ranh giới tổ chức thông qua hàm chuyên biệt:
    ```typescript
    evaluateTenantIsolation(req.tenantContext, quiz);
    ```
  - Nếu bài thi là công khai (`quiz.isPublic === true`), cho phép mọi thí sinh tham gia.
  - Nếu bài thi là nội bộ (`isPublic === false`), chặn truy cập nếu `req.tenantContext?.tenantId !== quiz.tenantId`.

---

### **Gói WP-5: Cập Nhật Web Applications (`quiz-web`, `admin-web`) & Interceptors**
*Mục tiêu: Tách rời hoàn toàn giao diện người dùng khỏi sự ràng buộc tổ chức của tài khoản cá nhân.*

1. **HTTP Client Tenant Interceptor**:
   - Web application (`apps/quiz-web`, `apps/admin-web`) duy trì trạng thái tổ chức đang hoạt động (`activeWorkspaceId` / `currentTenantId`).
   - Mọi request gửi tới API của Quiz Service được tự động đính kèm header: `X-Tenant-ID: <activeWorkspaceId>`.
2. **Loại Bỏ Tenant Khỏi Giao Diện Đăng Ký / Profile**:
   - Trang Đăng ký (`/register`): Người dùng chỉ nhập Tên, Email, Mật khẩu. Không có ô nhập "Mã trường / Tổ chức".
   - Trang Cá nhân (`/profile`): Hiển thị thông tin định danh thuần túy và các tổ chức/khoa mà người dùng tham gia (truy vấn từ Quiz/LMS service).

---

### **Gói WP-6: Di Trú Dữ Liệu, Cập Nhật Test Suites & Kiểm Thử Toàn Diện**

1. **Di Trú Dữ Liệu Dứt Điểm (Clean Migration)**:
   - File migration `0001_remove_tenant_id_add_metadata.sql`: Đã thêm cột `metadata` JSONB và `DROP COLUMN IF EXISTS tenant_id`.
   - Seed lại `auth_db`: Dữ liệu seed sạch sẽ 100%, không còn bất kỳ dấu vết nào của `tenantId`.
2. **Cập Nhật Toàn Diện Test Suites**:
   - `services/auth/tests/auth.spec.ts`: Kiểm tra đăng ký, đăng nhập, profile hoàn toàn không có `tenantId`.
   - `services/auth/tests/drizzle-persistence.spec.ts`: Khẳng định bảng `users` hoạt động chuẩn với `metadata JSONB`, không còn assertion kiểm tra `user.tenantId`.
   - `services/quiz/tests/security/ownership-policy.spec.ts`: Cập nhật các test case để truyền `tenantContext` qua header `X-Tenant-ID` thay vì trông chờ vào `principal.tenantId`.
3. **Tiêu Chuẩn Hoàn Thành (Definition of Done)**:
   - Toàn bộ lệnh `npx vitest run` chạy xanh 100%.
   - `lint_applet` (`tsc --noEmit`) đạt 0 lỗi.
   - `compile_applet` hoàn tất thành công.

---

## VI. BẢNG SO SÁNH: GIẢI PHÁP NỬA VỜI VS. SỬA SÂU TRỰC TIẾP (CLEAN-CUT)

| Tiêu Chí | Giải Pháp Nửa Vời (Giữ Tương Thích Ngược) | Sửa Sâu Trực Tiếp (Clean-Cut - Chọn Phương Án Này) |
| :--- | :--- | :--- |
| **`User.tenantId` trong Auth** | Giữ getter fallback `user.tenantId` | **XÓA BỎ HOÀN TOÀN**. Không còn getter hay property. |
| **`RegisterDto`** | Vẫn nhận `tenantId?: string` tùy chọn | **Chỉ nhận `email, name, password, metadata`**. |
| **JWT Token Payload** | Vẫn có thể chứa `tenantId` fallback | **100% OIDC chuẩn**: `sub, email, name, roles, permissions`. |
| **`Principal` Interface** | Giữ `tenantId?: string` với chú thích | **XÓA BỎ `tenantId`**. Tách riêng `TenantContext`. |
| **Permissions trong Auth DB** | Vẫn lưu `quiz:*`, `attempt:*` | **THANH TRỪNG 100%**. Chỉ giữ quyền hệ thống chung. |
| **Rủi ro Nợ Kỹ Thuật** | Cao (Service mới tiếp tục dùng sai) | **Bằng Không (Zero Technical Debt)**. |
| **Tính Đúng Đắn DDD** | Vi phạm Bounded Context ngầm | **Chuẩn mực Domain-Driven Design & Microservices**. |

---

## VII. LỘ TRÌNH TRIỂN KHAI THỰC THI

Kế hoạch hành động trực tiếp được chia thành 4 bước thực hiện liên hoàn:
1. **Bước 1 (Auth Clean Break)**: Loại bỏ hoàn toàn getter `tenantId` trong `User`, loại bỏ `dto.tenantId` trong `RegisterUseCase`, làm sạch `TokenPayload` và `default-rbac.data.ts`.
2. **Bước 2 (Contracts Clean Break)**: Tách `TenantContext` khỏi `Principal` trong `@platform/contracts`, cập nhật hàm `ownership.ts`.
3. **Bước 3 (Quiz Domain Autonomy)**: Nâng cấp `auth.middleware.ts` tại Quiz Service để độc lập phân giải Tenant qua `X-Tenant-ID`, cập nhật các use cases của Quiz.
4. **Bước 4 (Validation & Verification)**: Chạy toàn bộ test suites của cả 2 services, chạy linter và compiler xác nhận 100% mã nguồn sạch lỗi.
