# HƯỚNG DẪN THỰC THI TỪNG BƯỚC (STEP-BY-STEP IMPLEMENTATION GUIDE)
**Loại Bỏ Multi-Tenant & Đơn Giản Hóa Hệ Thống Quiz**

Tài liệu này cung cấp chi tiết từng vị trí file cần chỉnh sửa, code diff minh họa và thứ tự thực hiện để triển khai thành công kế hoạch trong `SIMPLIFY_QUIZ_SINGLE_TENANT_PLAN.md`.

---

## BƯỚC 1: CẬP NHẬT SHARED CONTRACTS & API CLIENT

### 1.1. Chỉnh sửa `packages/contracts/src/auth/ownership.ts`
- **Mục tiêu**: Đơn giản hóa hàm kiểm tra quyền sở hữu, loại bỏ logic cách ly tenant.
- **Thay đổi**:
  - Đơn giản hóa hàm `evaluateTenantIsolation` (luôn trả về `true` để giữ tương thích ngược nếu còn lời gọi cũ).
  - Trong `evaluateResourceOwnership`, bỏ khối kiểm tra `evaluateTenantIsolation`.

```typescript
// packages/contracts/src/auth/ownership.ts

export function evaluateTenantIsolation(
  _tenantContext?: any,
  _resource?: any
): boolean {
  // Chế độ Single-Tenant: Luôn cho phép truy cập tài nguyên trong hệ thống
  return true;
}

export function evaluateResourceOwnership(
  principal: Principal,
  resource: OwnedResource,
  requiredPermission?: string,
  manageAllPermission?: string,
  _tenantContext?: any
): OwnershipEvaluationResult {
  const permissions = principal.permissions || [];
  const isAdminBypass =
    principal.roles.includes('ADMIN') ||
    (manageAllPermission ? permissions.includes(manageAllPermission) : false);

  if (isAdminBypass) {
    return { allowed: true, isOwner: true, isAdminBypass: true };
  }

  const effectiveOwnerId = resource.ownerId || resource.instructorId || resource.userId;
  const isOwner = Boolean(effectiveOwnerId && effectiveOwnerId === principal.id);

  if (isOwner) {
    return { allowed: true, isOwner: true, isAdminBypass: false };
  }

  if (requiredPermission && permissions.includes(requiredPermission)) {
    return { allowed: true, isOwner: false, isAdminBypass: false };
  }

  return {
    allowed: false,
    reason: 'Insufficient permissions or resource ownership required',
    isOwner: false,
    isAdminBypass: false,
  };
}
```

### 1.2. Chỉnh sửa `packages/api-client/src/client.ts`
- **Mục tiêu**: Ngừng tự động gửi Header `X-Tenant-ID`.
- Giữ phương thức `setTenantId()` như một no-op để không gây lỗi biên dịch ở các component giao diện cũ.

---

## BƯỚC 2: CẬP NHẬT DOMAIN VÀ APPLICATION USE-CASES CỦA QUIZ SERVICE

### 2.1. Cập nhật `services/quiz/src/domain/authoring/quiz.entity.ts`
- Bỏ trường `tenantId` trong interface `QuizProps`.
- Bỏ trường `readonly tenantId: string` trong class `Quiz`.
- Cập nhật hàm `toJSON()`:
```typescript
toJSON() {
  return {
    id: this.id,
    code: this.code,
    title: this.title,
    description: this.description,
    ownerId: this.ownerId,
    isPublic: this.isPublic,
    currentPublishedVersionId: this.currentPublishedVersionId,
    status: this.status,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
}
```

### 2.2. Cập nhật `services/quiz/src/domain/delivery/attempt.aggregate.ts`
- Bỏ `tenantId` trong interface `AttemptProps`.
- Bỏ `readonly tenantId: string` trong class `Attempt`.
- Cập nhật hàm `toJSON()`.

### 2.3. Cập nhật `services/quiz/src/application/use-cases/authoring/authoring.use-cases.ts`
- Bỏ tham số `tenantContext?: TenantContext` ở tất cả các phương thức.
- Xóa bỏ ngoại lệ `Cross-tenant quiz creation prohibited`.
- Hàm `getPublishedQuizzes()`:
```typescript
async getPublishedQuizzes(): Promise<Quiz[]> {
  const all = await this.authoringRepo.listQuizzes();
  return all.filter((q) => q.status === 'PUBLISHED');
}
```

### 2.4. Cập nhật `services/quiz/src/application/use-cases/delivery/delivery.use-cases.ts`
- Bỏ `tenantId` trong `CreateAttemptInput`.
- Trong hàm `createAttempt`: Xóa khối kiểm tra `evaluateTenantIsolation` và ngoại lệ `Cross-tenant access prohibited`.
- Khởi tạo lượt thi:
```typescript
const attempt = new Attempt({
  id: attemptId,
  userId: input.userId,
  quizId: input.quizId,
  quizVersionId: version.id,
  status: 'CREATED',
});
```

---

## BƯỚC 3: CẬP NHẬT DATABASE SCHEMA & REPOSITORIES

### 3.1. Cập nhật `services/quiz/src/infrastructure/db/schema.ts`
- **Xóa bỏ các trường**:
  - Trong bảng `quizzes`: dòng `tenantId: varchar(...)`
  - Trong bảng `attempts`: dòng `tenantId: varchar(...)`
- **Xóa bỏ các chỉ mục**:
  - `idx_quizzes_tenant`
  - `idx_quizzes_owner_tenant`
  - `idx_attempts_tenant`

### 3.2. Cập nhật Repositories
- `services/quiz/src/infrastructure/repositories/drizzle-authoring.repository.ts`:
  - Bỏ `tenantId: raw.tenantId` trong lệnh `insert` và `onConflictDoUpdate`.
  - Bỏ `tenantId: row.tenantId` trong `mapRowToQuiz`.
- `services/quiz/src/infrastructure/repositories/drizzle-delivery.repository.ts`:
  - Bỏ `tenantId: raw.tenantId` trong `insert` và `onConflictDoUpdate`.
  - Bỏ `tenantId: row.tenantId` trong `mapRowToAttempt`.

### 3.3. Tạo Migration SQL: `services/quiz/drizzle/migrations/0001_remove_tenant_id.sql`
```sql
-- DDL loại bỏ multi-tenancy khỏi Quiz Service
DROP INDEX IF EXISTS "idx_quizzes_tenant";
DROP INDEX IF EXISTS "idx_quizzes_owner_tenant";
DROP INDEX IF EXISTS "idx_attempts_tenant";

ALTER TABLE "quizzes" DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "attempts" DROP COLUMN IF EXISTS "tenant_id";
```

---

## BƯỚC 4: CẬP NHẬT PRESENTATION LAYER (MIDDLEWARES & ROUTES)

### 4.1. Cập nhật `services/quiz/src/presentation/middlewares/auth.middleware.ts`
- Xóa khai báo `tenantContext?: TenantContext;` trong Express Request.
- Xóa khối code:
```typescript
// XÓA ĐOẠN NÀY:
// const rawTenantId = (req.headers['x-tenant-id'] as string) || undefined;
// ...
// req.tenantContext = tenantContext;
```

### 4.2. Cập nhật `services/quiz/src/presentation/routes/v1-quizzes.routes.ts`
- Tuyến `GET /v1/quizzes`:
```typescript
router.get('/', async (_req: Request, res: Response) => {
  try {
    const quizzes = await authoring.getPublishedQuizzes();
    res.status(200).json({
      success: true,
      data: quizzes.map((q) => ({
        id: q.id,
        code: q.code,
        title: q.title,
        description: q.description,
        status: q.status,
        isPublic: q.isPublic,
        currentPublishedVersionId: q.currentPublishedVersionId,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
```
- Tuyến `POST /v1/quizzes`: Bỏ truyền `tenantId`.

### 4.3. Cập nhật `services/quiz/src/presentation/routes/v1-attempts.routes.ts`
- Tuyến `POST /v1/attempts`: Bỏ `tenantId: req.tenantContext?.tenantId`.

---

## BƯỚC 5: TINH GỌN GIAO DIỆN NGƯỜI DÙNG (FRONTENDS)

### 5.1. Cập nhật `apps/quiz-web/src/views/QuizStartView.tsx`
- Xóa hằng số `WORKSPACES`.
- Xóa `useState(DEFAULT_WORKSPACE_ID)`.
- Xóa dropdown chọn Workspace ở header/sub-header.
- Xóa nhãn `Nội bộ (tenant_core)` trong thẻ bài thi.
- Thí sinh chỉ thấy:
  1. Ô nhập nhanh mã đề thi (Access Code Input).
  2. Danh mục các đề thi đang mở.

### 5.2. Cập nhật `apps/quiz-web/src/hooks/useQuizSession.ts`
- Xóa xử lý đặc biệt cho chuỗi lỗi `Cross-tenant`.

### 5.3. Cập nhật `apps/admin-web/src/views/AdminDashboardView.tsx`
- Xóa bộ chọn Workspace.
- Danh sách đề thi hiển thị toàn bộ các đề do tài khoản tạo hoặc toàn bộ đề nếu là quyền ADMIN.

---

## BƯỚC 6: CHẠY KIỂM THỬ VÀ KIỂM CHỨNG TỰ ĐỘNG

Chạy các lệnh sau tại root dự án để đảm bảo toàn bộ hệ thống hoạt động chính xác:

```bash
# 1. Chạy linter kiểm tra cú pháp và kiểu dữ liệu
npm run lint

# 2. Chạy toàn bộ test suites
npm run test

# 3. Build kiểm tra sản phẩm
npm run build
```
