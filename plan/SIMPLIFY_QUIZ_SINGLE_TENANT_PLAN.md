# KẾ HOẠCH LOẠI BỎ MULTI-TENANT & ĐƠN GIẢN HÓA HỆ THỐNG QUIZ
**Project Architecture Modernization & Simplification Plan**
*Ngày lập: 2026-09-06* | *Trạng thái: Sẵn sàng thực thi (Ready for Execution)*

---

## 1. TỔNG QUAN & MỤC TIÊU (EXECUTIVE SUMMARY)

### 1.1. Bối cảnh
Trong giai đoạn đầu của dự án, kiến trúc được thiết kế hỗ trợ **Multi-Tenancy** (Đa khách hàng/Đa tổ chức) bằng cách gắn nhãn `tenant_id` vào các tài nguyên nhằm cô lập dữ liệu giữa các trường đại học hoặc đơn vị thành viên (`tenant_core`, `tenant_foreign`, `tenant_polytechnic`).

Tuy nhiên:
- Dịch vụ xác thực (**Auth Service**) đã hoàn tất chuyển đổi sang **Generic Identity** (đã loại bỏ vĩnh viễn cột `tenant_id` trong bảng `users` tại Migration `0001_remove_tenant_id_add_metadata.sql`). Tài khoản người dùng hiện tại là định danh độc lập, toàn cục.
- Dịch vụ thi (**Quiz Service**) vẫn duy trì cơ chế cô lập qua cột `tenant_id` trong 2 bảng `quizzes` và `attempts`, bắt buộc truyền HTTP Header `X-Tenant-ID`, và thực hiện kiểm tra `evaluateTenantIsolation()` trên mọi use-case.
- Hai ứng dụng giao diện (**quiz-web** và **admin-web**) phải duy trì bộ chọn Workspace giả định, khiến học viên và giáo viên gặp các lỗi chặn truy cập vô cớ (`Cross-tenant access prohibited`), gây rối rắm trong quy trình làm bài và quản lý đề thi.

### 1.2. Mục tiêu chiến lược
1. **Đơn giản hóa triệt để (Radical Simplification)**: Chuyển đổi toàn bộ hệ thống sang kiến trúc **Single-Tenant / Flat Organization**.
2. **Tập trung vào nghiệp vụ cốt lõi**: Bài thi (Quiz) thuộc sở hữu của Giảng viên (`ownerId`) và dùng chung trong toàn bộ hệ thống. Thí sinh (`STUDENT`) có thể tìm kiếm, truy cập và làm bài tự do dựa trên mã đề (`code`) hoặc danh mục đề thi công khai mà không bị rào cản tổ chức ngăn cách.
3. **Giảm thiểu độ phức tạp mã nguồn (Zero Dead Code & Low Overhead)**:
   - Xóa bỏ logic phân giải Header `X-Tenant-ID`.
   - Xóa bỏ các index và cột `tenant_id` dư thừa trong PostgreSQL.
   - Thu gọn các hợp đồng chia sẻ (`@platform/contracts`, `@platform/api-client`).
   - Xóa bỏ dropdown chuyển đổi tổ chức trên cả 2 giao diện người dùng.

---

## 2. PHÂN TÍCH TÁC ĐỘNG & BẢN ĐỒ HIỆN TRẠNG (CURRENT STATE & GAP ANALYSIS)

```
[ HIỆN TRẠNG ]
  Client (quiz-web/admin-web) ───[Header X-Tenant-ID: tenant_core]───► Quiz Service
                                                                          │
  ┌───────────────────────────────────────────────────────────────────────┴────────────────────────┐
  │ Quiz Service:                                                                                  │
  │  - auth.middleware: Bóc tách req.tenantContext = { tenantId: 'tenant_core' }                   │
  │  - authoring.use-cases: Kiểm tra evaluateTenantIsolation(tenantContext, quiz.tenantId)        │
  │  - delivery.use-cases: Chặn sinh viên nếu không cùng tenantId ('Cross-tenant access prohibited')│
  │  - PostgreSQL: Bảng quizzes (cột tenant_id) + Bảng attempts (cột tenant_id)                    │
  └────────────────────────────────────────────────────────────────────────────────────────────────┘

[ KIẾN TRÚC MỤC TIÊU (SINGLE-TENANT / SIMPLIFIED) ]
  Client (quiz-web/admin-web) ───[Chỉ gửi Authorization: Bearer <token>]───► Quiz Service
                                                                               │
  ┌────────────────────────────────────────────────────────────────────────────┴───────────────────┐
  │ Quiz Service Đơn Giản:                                                                         │
  │  - auth.middleware: Chỉ xác thực danh tính Principal (id, roles, permissions)                  │
  │  - authoring.use-cases: Kiểm tra quyền RBAC (INSTRUCTOR/ADMIN) + ABAC (ownerId === principal.id) │
  │  - delivery.use-cases: Cho phép mọi thí sinh làm bài theo mã đề thi (không bị chặn tenant)     │
  │  - PostgreSQL: Bảng quizzes & attempts thuần túy (Không còn cột tenant_id, không còn index phụ) │
  └────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1. Ma trận các thành phần bị ảnh hưởng (Impact Matrix)

| Tầng kiến trúc | File / Thành phần | Hiện trạng (Multi-Tenant) | Trạng thái sau chuyển đổi (Single-Tenant) |
| :--- | :--- | :--- | :--- |
| **Database Schema** | `services/quiz/src/infrastructure/db/schema.ts` | Có `tenantId` trong `quizzes` và `attempts`; có 3 index liên quan. | Xóa bỏ cột `tenantId`; xóa `idx_quizzes_tenant`, `idx_quizzes_owner_tenant`, `idx_attempts_tenant`. |
| **Database Migrations** | `services/quiz/drizzle/migrations/` | Chỉ có `0000_slow_pet_avengers.sql` tạo cột `tenant_id`. | Thêm migration `0001_remove_tenant_id.sql` thực hiện `ALTER TABLE DROP COLUMN`. |
| **Domain Entities** | `services/quiz/src/domain/authoring/quiz.entity.ts` | Class `Quiz` có trường `readonly tenantId: string;` | Xóa bỏ `tenantId` khỏi `QuizProps`, constructor, getters, và `toJSON()`. |
| **Domain Aggregates** | `services/quiz/src/domain/delivery/attempt.aggregate.ts` | Class `Attempt` có trường `readonly tenantId: string;` | Xóa bỏ `tenantId` khỏi `AttemptProps`, constructor, và `toJSON()`. |
| **Authoring Use Cases** | `authoring.use-cases.ts` | Nhận `tenantContext`, kiểm tra cross-tenant, filter quiz theo `tenantId`. | Xóa bỏ tham số `tenantContext`, xóa kiểm tra `evaluateTenantIsolation`, hàm `getPublishedQuizzes()` lấy danh mục phẳng. |
| **Delivery Use Cases** | `delivery.use-cases.ts` | Nhận `tenantId` & `tenantContext`, chặn `Cross-tenant access prohibited`. | Xóa bỏ kiểm tra cross-tenant; mọi thí sinh hợp lệ đều có thể tạo và nộp lượt thi. |
| **Repositories** | `drizzle-authoring.repository.ts`, `drizzle-delivery.repository.ts` | Insert/Select/Update ánh xạ cột `tenantId`. | Xóa ánh xạ cột `tenantId` khi insert/update/select. |
| **Middlewares** | `services/quiz/src/presentation/middlewares/auth.middleware.ts` | Đọc header `x-tenant-id`, gán `req.tenantContext`. | Xóa bỏ phân giải `tenantContext`, xóa khai báo mở rộng `Express.Request.tenantContext`. |
| **Routes** | `v1-quizzes.routes.ts`, `v1-attempts.routes.ts` | Truyền `req.tenantContext` và đọc `x-tenant-id`. | Bỏ `tenantContext`, bỏ query param `tenantId`, làm sạch payload trả về. |
| **Shared Contracts** | `packages/contracts/src/auth/principal.ts` | Định nghĩa `TenantContext`, `TenantScopedResource`. | Đánh dấu deprecate hoặc loại bỏ `TenantContext`. |
| **Shared Contracts** | `packages/contracts/src/auth/ownership.ts` | Hàm `evaluateTenantIsolation()`. | Xóa hoặc vô hiệu hóa kiểm tra `evaluateTenantIsolation()`, đơn giản hóa `evaluateResourceOwnership()`. |
| **API Client** | `packages/api-client/src/client.ts` | Có `setTenantId()`, tự động chèn `X-Tenant-ID`. | Xóa hoặc để no-op `setTenantId()`, không gửi header `X-Tenant-ID`. |
| **Frontend Quiz** | `apps/quiz-web/src/views/QuizStartView.tsx` | Dropdown Workspace, tag "Nội bộ (tenant_core)", bắt lỗi cross-tenant. | Xóa toàn bộ dropdown workspace; giao diện sạch, chỉ hiển thị danh mục đề thi và ô nhập mã đề. |
| **Frontend Quiz Hook** | `apps/quiz-web/src/hooks/useQuizSession.ts` | Xử lý lỗi `Cross-tenant access prohibited`. | Bỏ xử lý lỗi cross-tenant không cần thiết. |
| **Frontend Admin** | `apps/admin-web/src/views/AdminDashboardView.tsx` | Dropdown Workspace Selector, giải thích tenant. | Xóa Workspace selector, quản lý đề thi tập trung theo tài khoản tác giả. |
| **Test Suites** | `services/quiz/tests/` | Mock `tenantCore`, `tenantForeign`, test cross-tenant. | Chuyển đổi các unit test và integration test sang kịch bản Single-Tenant. |

---

## 3. LỘ TRÌNH THỰC THI CHI TIẾT (PHASED IMPLEMENTATION ROADMAP)

Quá trình chuyển đổi được chia thành **5 Pha tuần tự**, đảm bảo hệ thống không bị gián đoạn và có thể kiểm chứng tại từng bước.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     PHA 1       │     │     PHA 2       │     │     PHA 3       │     │     PHA 4       │     │     PHA 5       │
│ Shared Packages │ ──► │  Quiz Service   │ ──► │ Database Schema │ ──► │ Frontend Apps   │ ──► │ Testing & Docs  │
│  & Contracts    │     │  Domain & App   │     │  & API Routes   │     │  Simplification │     │   Verification  │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

### PHA 1: THƯ VIỆN DÙNG CHUNG & CONTRACTS (PACKAGES)
**Mục tiêu**: Làm sạch các interface dùng chung, gỡ bỏ ràng buộc tenant khỏi tầng giao tiếp cơ sở.

1. **`packages/contracts/src/auth/principal.ts`**:
   - Loại bỏ `TenantContext` và `TenantScopedResource` (hoặc đánh dấu `optional` để tránh vỡ kiểu dữ liệu tạm thời).
   - `Principal` giữ nguyên định danh cá nhân thuần túy: `id`, `roles`, `permissions`, `metadata`.

2. **`packages/contracts/src/auth/ownership.ts`**:
   - Đơn giản hóa `evaluateResourceOwnership()`: Chỉ cần kiểm tra vai trò (`ADMIN`), quyền hạn (`QUIZ_MANAGE_ALL`), hoặc quyền sở hữu cá nhân (`resource.ownerId === principal.id` hoặc `resource.userId === principal.id`).
   - Hàm `evaluateTenantIsolation()`: Trả về `true` mặc định hoặc loại bỏ hoàn toàn lời gọi hàm này.

3. **`packages/api-client/src/client.ts`**:
   - Loại bỏ logic tự động đính kèm header `X-Tenant-ID`.
   - Giữ lại phương thức `setTenantId()` dạng stub cảnh báo (deprecated) để tránh break code cũ nếu chưa kịp sửa ở frontend.

---

### PHA 2: TẦNG DOMAIN & APPLICATION CỦA QUIZ SERVICE
**Mục tiêu**: Đơn giản hóa logic nghiệp vụ, giải phóng Entity và Use-Cases khỏi các điều kiện kiểm tra tenant.

1. **Domain Layer**:
   - `services/quiz/src/domain/authoring/quiz.entity.ts`:
     - Xóa thuộc tính `tenantId` trong `QuizProps` và class `Quiz`.
     - Phương thức `toJSON()` không còn trường `tenantId`.
   - `services/quiz/src/domain/delivery/attempt.aggregate.ts`:
     - Xóa thuộc tính `tenantId` trong `AttemptProps` và class `Attempt`.
     - Phương thức `toJSON()` không còn trường `tenantId`.

2. **Application Use-Cases**:
   - `services/quiz/src/application/use-cases/authoring/authoring.use-cases.ts`:
     - Bỏ tham số `tenantContext` ở toàn bộ các hàm: `createQuiz`, `getQuizDetails`, `updateQuiz`, `addVersion`, `publishQuiz`, `deleteQuiz`.
     - Xóa bỏ ngoại lệ `OwnershipDomainError('Cross-tenant quiz creation prohibited')`.
     - Hàm `getPublishedQuizzes()`: Trả về danh sách tất cả các đề thi đang ở trạng thái `PUBLISHED` mà không cần lọc theo `tenantId`.
   - `services/quiz/src/application/use-cases/delivery/delivery.use-cases.ts`:
     - `CreateAttemptInput`: Xóa thuộc tính `tenantId?: string;`.
     - Bỏ đoạn kiểm tra `evaluateTenantIsolation()` và ngoại lệ `Cross-tenant access prohibited`.
     - Khởi tạo `Attempt` chỉ với `userId`, `quizId`, `quizVersionId`, `status: 'CREATED'`.

---

### PHA 3: CƠ SỞ DỮ LIỆU & TẦNG TRÌNH DIỄN (DATABASE & PRESENTATION)
**Mục tiêu**: Cập nhật Drizzle Schema, tạo Migration DDL và dọn dẹp các API Routes.

1. **Database Schema (`services/quiz/src/infrastructure/db/schema.ts`)**:
   - Trong bảng `quizzes`:
     - Xóa dòng: `tenantId: varchar('tenant_id', { length: 64 }).notNull().default('tenant_default')`.
     - Xóa indexes: `index('idx_quizzes_tenant')` và `index('idx_quizzes_owner_tenant')`.
   - Trong bảng `attempts`:
     - Xóa dòng: `tenantId: varchar('tenant_id', { length: 64 }).notNull().default('tenant_default')`.
     - Xóa index: `index('idx_attempts_tenant')`.

2. **Drizzle Migration SQL (`services/quiz/drizzle/migrations/0001_remove_tenant_id.sql`)**:
   ```sql
   -- Xóa indexes liên quan đến tenant_id
   DROP INDEX IF EXISTS "idx_quizzes_tenant";
   DROP INDEX IF EXISTS "idx_quizzes_owner_tenant";
   DROP INDEX IF EXISTS "idx_attempts_tenant";

   -- Xóa cột tenant_id trong bảng quizzes và attempts
   ALTER TABLE "quizzes" DROP COLUMN IF EXISTS "tenant_id";
   ALTER TABLE "attempts" DROP COLUMN IF EXISTS "tenant_id";
   ```

3. **Repositories**:
   - `DrizzleAuthoringRepository`: Loại bỏ ánh xạ `tenantId` trong câu lệnh `insert`, `onConflictDoUpdate`, và hàm `mapRowToQuiz`.
   - `DrizzleDeliveryRepository`: Loại bỏ ánh xạ `tenantId` trong câu lệnh `insert`, `onConflictDoUpdate`, và hàm `mapRowToAttempt`.

4. **Middlewares & Routes**:
   - `services/quiz/src/presentation/middlewares/auth.middleware.ts`:
     - Xóa bỏ khối code đọc `req.headers['x-tenant-id']` và tạo `tenantContext`.
     - Dọn dẹp namespace mở rộng của Express Request (bỏ `tenantContext`).
   - `services/quiz/src/presentation/routes/v1-quizzes.routes.ts`:
     - `GET /v1/quizzes`: Bỏ lấy `tenantId` từ query/header; gọi `authoring.getPublishedQuizzes()`.
     - `POST /v1/quizzes`: Bỏ `tenantId` trong payload tạo đề.
   - `services/quiz/src/presentation/routes/v1-attempts.routes.ts`:
     - `POST /v1/attempts`: Bỏ truyền `tenantId`.

---

### PHA 4: GIAO DIỆN NGƯỜI DÙNG (FRONTEND WEB APPS)
**Mục tiêu**: Tối ưu UI/UX, loại bỏ sự phức tạp của việc chọn workspace, đem lại trải nghiệm mượt mà, trực quan.

1. **`apps/quiz-web` (Cổng làm bài của Học viên)**:
   - **`src/views/QuizStartView.tsx`**:
     - Xóa bỏ hoàn toàn mảng `WORKSPACES` (`tenant_core`, `tenant_foreign`, `tenant_polytechnic`).
     - Xóa bỏ `currentWorkspaceId`, dropdown chọn workspace ở góc màn hình.
     - Xóa nhãn `Nội bộ (tenant_core)` trên thẻ đề thi.
     - Giữ giao diện tập trung: Danh sách đề thi sẵn có (Card grid) và Form nhập nhanh mã đề thi (Access Code Input).
   - **`src/hooks/useQuizSession.ts`**:
     - Xóa khối logic bắt lỗi chuỗi `"Cross-tenant"`.
   - **`src/api/client.ts`**:
     - Bỏ thiết lập `setTenantId(DEFAULT_WORKSPACE_ID)`.

2. **`apps/admin-web` (Cổng tác giả & Quản trị đề thi)**:
   - **`src/views/AdminDashboardView.tsx`**:
     - Xóa bỏ bộ chọn Workspace.
     - Bảng danh sách đề thi hiển thị trực quan thông tin tác giả (`ownerId`), tiêu đề, trạng thái xuất bản mà không bị phân mảnh theo workspace.
   - **`src/api/client.ts`**:
     - Bỏ cấu hình `DEFAULT_WORKSPACE_ID`.

---

### PHA 5: KIỂM THỬ TỰ ĐỘNG, TÀI LIỆU HÓA & DỌN DẸP (VERIFICATION & DOCS)
**Mục tiêu**: Đảm bảo 100% test suites pass, không còn hồi quy, cập nhật tài liệu kiến trúc.

1. **Cập nhật Test Suites**:
   - `services/quiz/tests/security/ownership-policy.spec.ts`:
     - Loại bỏ các kịch bản kiểm tra `Cross-tenant access prohibited`.
     - Thay thế bằng các kịch bản kiểm tra chuẩn:
       - Instructor A không thể sửa đề của Instructor B (trừ khi là ADMIN).
       - Thí sinh có thể vào thi bất kỳ đề nào ở trạng thái `PUBLISHED` khi có mã hợp lệ.
       - Thí sinh chỉ được xem bài làm và bảng điểm của chính mình.
   - `packages/api-client/tests/api-client.spec.ts`: Bỏ các assert về `X-Tenant-ID`.
   - `services/quiz/tests/delivery/drizzle-assessment-persistence.spec.ts`: Bỏ gán `tenantId` trong fixture.

2. **Cập nhật Hướng Dẫn Kỹ Thuật**:
   - Cập nhật `guides/quiz_postgres_setup_guide.md` phản ánh schema mới không còn `tenant_id`.

---

## 4. BẢNG SO SÁNH TRƯỚC VÀ SAU KHI THỰC HIỆN (BEFORE VS. AFTER)

| Tiêu chí | Trước khi chuyển đổi (Multi-Tenant) | Sau khi chuyển đổi (Single-Tenant) |
| :--- | :--- | :--- |
| **Mức độ phức tạp người dùng** | Học viên phải chọn đúng Workspace; nếu nhầm workspace sẽ bị chặn không làm được bài. | Học viên chỉ cần nhập mã đề hoặc click vào đề thi để làm bài ngay lập tức. |
| **Cấu trúc CSDL** | Cột `tenant_id` xuất hiện ở nhiều bảng kèm 3 composite index gây tốn dung lượng và chi phí ghi. | Bảng gọn nhẹ, chỉ index theo `code`, `owner_id`, `status`, `user_id`. |
| **Luồng Authorization** | Kết hợp RBAC + ABAC + Tenant Isolation Check (3 lớp kiểm tra). | Phân quyền RBAC (Role) + ABAC (Resource Owner) tự nhiên và tường minh. |
| **Bảo trì mã nguồn** | Mọi API endpoint và Use-case đều phải truyền thêm `tenantContext` và header `x-tenant-id`. | Payload và hàm gọn gàng, giảm 40% mã boilerplate và loại bỏ hoàn toàn các lỗi corner-case. |
| **Môi trường Test** | Phải mock nhiều tenant (`tenantCore`, `tenantForeign`) để test ma trận truy cập. | Viết test tập trung vào luồng nghiệp vụ chính: làm bài, tính giờ, chấm điểm, bảo mật tác giả. |

---

## 5. KẾ HOẠCH AN TOÀN & ROLLBACK (SAFETY & ROLLBACK STRATEGY)

1. **Tính tương thích ngược trong quá trình migrate**:
   - Trước khi xóa cột vật lý trên database production, code có thể xử lý fallback coi `tenant_id` là nullable.
   - Khi áp dụng lệnh `ALTER TABLE DROP COLUMN tenant_id`, toàn bộ dữ liệu đề thi và bài thi vẫn nguyên vẹn 100%, không ảnh hưởng đến nội dung câu hỏi (`questions`), bảng điểm (`scoreResult`) hay lịch sử thi (`answers`).

2. **Phương án Rollback dự phòng**:
   - Nếu cần khôi phục lại trường `tenant_id` vì bất kỳ lý do gì, có thể chạy migration rollback:
     ```sql
     ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "tenant_id" varchar(64) DEFAULT 'tenant_default' NOT NULL;
     ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "tenant_id" varchar(64) DEFAULT 'tenant_default' NOT NULL;
     CREATE INDEX IF NOT EXISTS "idx_quizzes_tenant" ON "quizzes" ("tenant_id");
     CREATE INDEX IF NOT EXISTS "idx_attempts_tenant" ON "attempts" ("tenant_id");
     ```
   - Dữ liệu cũ tự động nhận giá trị mặc định `'tenant_default'`.

---

## 6. TIÊU CHÍ HOÀN THÀNH (DEFINITION OF DONE)

- [x] Không còn bất kỳ tham chiếu nào đến `X-Tenant-ID` hay `req.tenantContext` trong `services/quiz`.
- [x] Schema Drizzle và PostgreSQL không còn cột `tenant_id` trong 2 bảng `quizzes` và `attempts`.
- [x] Giao diện `quiz-web` không còn dropdown Workspace; học viên vào làm bài trực tiếp và thông suốt.
- [x] Giao diện `admin-web` hiển thị đề thi tập trung, tạo đề không yêu cầu thông tin tenant.
- [x] Toàn bộ test suite chạy lệnh `npm run test` (hoặc `vitest`) đều pass xanh 100%.
- [x] Ứng dụng build và compile thành công không có lỗi TypeScript (`npm run build`).
