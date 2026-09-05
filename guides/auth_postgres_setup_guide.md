# HƯỚNG DẪN KẾT NỐI POSTGRESQL CHO AUTH SERVICE, SEED DỮ LIỆU VÀ CHẠY TEST BẰNG PNPM TRÊN WINDOWS (VS CODE)

> **Mục tiêu:** Hướng dẫn kết nối cơ sở dữ liệu PostgreSQL có sẵn trên máy của bạn với **Auth Service** trong cấu trúc **Monorepo PNPM Workspace** (gồm 2 Server, 2 Client, 3 Packages), thực thi Migration & Seed dữ liệu chuẩn hóa (Normalized RBAC & Generic Identity) qua Drizzle ORM bằng lệnh `pnpm`, và chạy toàn bộ bộ kiểm thử tự động (Vitest) trên môi trường **Windows** trong **Visual Studio Code (VS Code)**.

---

## 1. CẤU TRÚC MONOREPO PNPM WORKSPACE CỦA DỰ ÁN

Dự án được quản trị bằng **`pnpm-workspace.yaml`** với sự phân tách tường minh giữa các tầng nghiệp vụ:

```
quiz-platform-monorepo/
├── pnpm-workspace.yaml             # Cấu hình workspace của pnpm
├── package.json                    # Root package quản lý scripts chung toàn monorepo
├── .env                            # Biến môi trường kết nối database & secret keys
│
├── services/                       # [2 SERVERS PHÍA BACKEND]
│   ├── auth/                       # @platform/auth-service: Dịch vụ xác thực JWT RS256,
│   │                               # Normalized RBAC, Rate Limiting, quản lý PostgreSQL auth_db
│   └── quiz/                       # @platform/quiz-service: Lõi khảo thí Assessment Core Engine
│                                   # (Domain Tenancy, Ownership Policy, State Machine, Auto-Submit)
│
├── apps/                           # [2 CLIENTS PHÍA FRONTEND]
│   ├── quiz-web/                   # @platform/quiz-web: Ứng dụng thi trực tuyến dành cho Học viên
│   └── admin-web/                  # @platform/admin-web: Cổng quản trị soạn đề dành cho Giảng viên & Admin
│
├── packages/                       # [3 THƯ VIỆN DÙNG CHUNG - SHARED PACKAGES]
│   ├── contracts/                  # @platform/contracts: DTOs, Enums, Roles & System Permissions
│   ├── auth-client/                # @platform/auth-client: SDK xác thực, quản lý phiên & Silent Refresh
│   └── api-client/                 # @platform/api-client: HTTP SDK gọi API kèm header X-Tenant-ID tự động
│
└── guides/                         # Thư mục tài liệu hướng dẫn kỹ thuật
    ├── auth_postgres_setup_guide.md # Hướng dẫn thiết lập Auth Service (Tài liệu này)
    └── quiz_postgres_setup_guide.md # Hướng dẫn thiết lập Quiz Core Service
```

### Kiến Trúc Lưu Trữ Auth Service (Generic Identity & Normalized RBAC):
- **Cơ sở dữ liệu độc lập (Database-per-Service)**: Auth Service sở hữu cơ sở dữ liệu riêng (`auth_db`), hoàn toàn tách biệt với `quiz_db` của Quiz Service.
- **Định danh Thuần Túy (Generic Identity - Clean-Cut Tenancy)**:
  - Cột `tenant_id` đã được **xóa bỏ vĩnh viễn** khỏi bảng `users`.
  - Auth Service không chứa khái niệm "trường/tổ chức" của người dùng. Tài khoản thuộc về cá nhân (Global Identity).
  - Bổ sung cột `metadata` kiểu `JSONB` để lưu trữ cài đặt cá nhân (ngôn ngữ, tùy biến) mà không phá vỡ ranh giới domain.
  - Ngữ cảnh tổ chức (`TenantContext`) được bàn giao 100% tự chủ cho Quiz Service quản lý và truyền qua HTTP Header `X-Tenant-ID`.
- **Cấu trúc 6 bảng chuẩn hóa trong `auth_db`**:
  1. `users`: Lưu trữ tài khoản với mật khẩu băm an toàn bằng `scryptSync` (kèm salt ngẫu nhiên 16 bytes), cờ `isActive`, và `metadata JSONB`.
  2. `roles`: Danh mục vai trò toàn cục (`STUDENT`, `INSTRUCTOR`, `ADMIN`).
  3. `permissions`: Danh mục quyền hệ thống chuẩn hóa (`user:read`, `user:write`, `user:manage`, `role:read`, `role:write`, `permission:read`, `system:config`, `*`). Toàn bộ quyền domain `quiz:*` và `attempt:*` đã được thanh trừng triệt để.
  4. `role_permissions`: Quan hệ nhiều-nhiều chuẩn hóa giữa Role và Permission.
  5. `user_roles`: Gán vai trò cho người dùng trong hệ thống.
  6. `refresh_tokens`: Lưu trữ Refresh Token băm **SHA-256** (chống lộ token nếu database bị dump), quản lý thu hồi (revocation) khi logout hoặc refresh.
- **Dynamic Resilience Factory (`repository.factory.ts`)**:
  - Khi có `AUTH_DATABASE_URL`: Kích hoạt `DrizzleUserRepository` & `DrizzleTokenStorage` (PostgreSQL quan hệ).
  - Khi chạy unit test: Tự động khởi tạo engine PostgreSQL PGlite WebAssembly độc lập không phụ thuộc service ngoài.

---

## 2. CHUẨN BỊ DATABASE TRÊN POSTGRESQL CỦA BẠN

*(Giả định: Máy tính Windows của bạn đã có sẵn PostgreSQL đang chạy trên cổng mặc định 5432).*

Bạn chỉ cần tạo một cơ sở dữ liệu rỗng mang tên **`auth_db`**.

### Cách 1: Sử dụng Terminal trong VS Code (`psql`)
Mở Terminal trong VS Code (`Ctrl + ~`):

```powershell
# Đăng nhập vào PostgreSQL với user postgres
psql -U postgres
```
*(Nếu Windows chưa nhận lệnh `psql`, dùng đường dẫn cài đặt: `& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres`)*

Trong dấu nhắc `postgres=#`, tạo database và thoát:
```sql
CREATE DATABASE auth_db;
\q
```

### Cách 2: Sử dụng Giao diện Đồ Họa (pgAdmin 4 / DBeaver / VS Code Extension)
1. Mở công cụ quản lý PostgreSQL mà bạn quen dùng.
2. Chuột phải vào **Databases** > Chọn **Create** > **Database...**
3. Đặt tên: **`auth_db`** và lưu lại.

---

## 3. CẤU HÌNH BIẾN MÔI TRƯỜNG (`.env`) TRONG VS CODE

Tại thư mục gốc của dự án:

1. Tạo file **`.env`** (nếu chưa có) bằng cách sao chép từ file mẫu:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Mở file `.env` và điền chuỗi kết nối PostgreSQL của bạn:

```env
# ==============================================================================
# AUTH SERVICE - POSTGRESQL CONNECTION (DATABASE-PER-SERVICE)
# ==============================================================================
# Cú pháp chuẩn: postgres://<username>:<password>@<host>:<port>/<database_name>
AUTH_DATABASE_URL=postgres://postgres:mật_khẩu_của_bạn@localhost:5432/auth_db

# Tuỳ chọn: Secret key dự phòng (hệ thống sẽ tự động tạo cặp khóa RS256 2048-bit an toàn khi khởi động)
JWT_SECRET=dev-quiz-platform-secret-key-32-chars-min
```

> ⚠️ **Lưu ý định dạng URL & mã hóa ký tự đặc biệt trên Windows:**
> - **Tuyệt đối không gắn `?schema=public` vào đuôi URL**: Một số ORM như Prisma thường dùng `?schema=public`, nhưng PostgreSQL thuần không có biến cấu hình GUC tên là `schema` (PostgreSQL dùng `search_path`). Nếu gắn `?schema=public`, PostgreSQL sẽ trả về lỗi `PostgresError: unrecognized configuration parameter "schema" (code 42704)`. Auth Service đã có bộ lọc `sanitizePostgresUrl()`, tuy nhiên bạn nên khai báo URL chuẩn: `postgres://postgres:password@localhost:5432/auth_db`.
> - **Mã hóa URL (URL Encoding)**: Nếu mật khẩu PostgreSQL của bạn có ký tự đặc biệt (ví dụ: `@`, `#`, `$`, `%`, `&`, `/`), hãy đổi sang dạng mã hóa **URL Encode** (ví dụ: `@` thành `%40`, `#` thành `%23`).  
> *Ví dụ: Mật khẩu là `P@ss123` => `postgres://postgres:P%40ss123@localhost:5432/auth_db`*.

---

## 4. CÀI ĐẶT DEPENDENCIES & THỰC THI MIGRATION/SEED BẰNG PNPM

Trong VS Code, mở Terminal (`Ctrl + ~`) tại thư mục gốc dự án.

### Bước 4.1: Cài Đặt Dependencies Bằng PNPM
```powershell
pnpm install
```
*pnpm sẽ tự động phân giải cấu trúc workspace, liên kết các package nội bộ (`@platform/contracts`, `@platform/auth-client`, `@platform/api-client`) và tải dependencies theo `pnpm-lock.yaml` một cách nhanh chóng.*

---

### Bước 4.2: Chạy Migration (Khởi Tạo Cấu Trúc Bảng Database)
Thực thi toàn bộ các migration SQL của Auth Service (`0000`, `0001_remove_tenant_id_add_metadata`, `0002_purge_domain_permissions`):

```powershell
# Cách 1: Chạy qua script tại root
pnpm db:migrate:auth

# Cách 2: Chạy trực tiếp qua pnpm workspace filter vào Auth Service
pnpm --filter @platform/auth-service db:migrate
```

**Màn hình xuất thông báo thành công:**
```text
🔄 Running Auth Service PostgreSQL migrations...
   + Migration 0000: Initial schema (users, roles, permissions, user_roles, role_permissions, refresh_tokens)
   + Migration 0001: Remove tenant_id, add metadata JSONB
   + Migration 0002: Purge domain permissions (quiz:*, attempt:*)
✅ Auth Service PostgreSQL migrations completed successfully.
```
*(Lúc này trong database `auth_db` đã được tạo đầy đủ 6 bảng chuẩn hóa).*

---

### Bước 4.3: Chạy Seed (Nạp Dữ Liệu Quyền Hệ Thống & Tài Khoản Mẫu)
Tiếp theo, nạp danh mục quyền hệ thống chuẩn hóa và danh sách người dùng mặc định vào database:

```powershell
# Cách 1: Chạy qua script tại root
pnpm db:seed:auth

# Cách 2: Chạy trực tiếp qua pnpm workspace filter
pnpm --filter @platform/auth-service db:seed
```

**Màn hình xuất thông báo thành công:**
```text
🌱 Seeding Normalized RBAC into PostgreSQL Auth Service DB...
  1/5 Seeding permissions (user:read, user:write, user:manage, role:*, permission:*, system:config, *)...
  2/5 Seeding roles (STUDENT, INSTRUCTOR, ADMIN)...
  3/5 Mapping role permissions...
  4/5 Seeding users & assigning roles...
    + Seeded user: admin@quiz.com (ADMIN)
    + Seeded user: instructor@quiz.com (INSTRUCTOR)
    + Seeded user: student@quiz.com (STUDENT)
    + Seeded user: admin@quiz.local (ADMIN)
    + Seeded user: instructor@quiz.local (INSTRUCTOR)
    + Seeded user: student@quiz.local (STUDENT)
✅ Normalized RBAC Auth DB seeding finished.
```

### 📋 Bảng Tài Khoản Mẫu Có Sẵn Sau Khi Seed:

| Email Đăng Nhập | Mật Khẩu | Quyền (Roles) | Quyền Hệ Thống (Effective Permissions) | Mục Đích Sử Dụng |
| :--- | :--- | :--- | :--- | :--- |
| `admin@quiz.com` | `admin123` | `["ADMIN"]` | `["*"]` | Quản trị viên toàn hệ thống, toàn quyền bypass |
| `instructor@quiz.com` | `teacher123` | `["INSTRUCTOR"]` | `["user:read", "user:write"]` | Giảng viên, tác giả đề thi (soạn đề tại `admin-web`) |
| `student@quiz.com` | `student123` | `["STUDENT"]` | `["user:read", "user:write"]` | Học viên, thí sinh (làm bài tại `quiz-web`) |
| `admin@quiz.local` | `admin123` | `["ADMIN"]` | `["*"]` | Tài khoản Admin dự phòng môi trường local |
| `instructor@quiz.local`| `teacher123` | `["INSTRUCTOR"]` | `["user:read", "user:write"]` | Tài khoản Giảng viên dự phòng môi trường local |
| `student@quiz.local` | `student123` | `["STUDENT"]` | `["user:read", "user:write"]` | Tài khoản Học viên dự phòng môi trường local |

*Ghi chú quan trọng:* Tài khoản Auth Service là **Generic Identity**. Bạn có thể sử dụng cùng một tài khoản để làm việc trên bất kỳ tổ chức/không gian làm việc nào (`tenant_core`, `tenant_foreign`, `tenant_polytechnic`) mà không cần tạo lại tài khoản.

---

## 5. CHẠY BỘ KIỂM THỬ TỰ ĐỘNG BẰNG PNPM (TEST SUITE)

Dự án sử dụng **Vitest** hỗ trợ chạy đa luồng cực nhanh trong pnpm monorepo.

### 5.1. Chạy Riêng Tests Của Auth Service
```powershell
# Chạy 4 test suites chuyên biệt của Auth Service (auth, persistence, ownership, rbac-admin-api)
pnpm vitest services/auth/tests
```
**Kết quả mong đợi:** 4/4 test files, 51/51 tests **PASS 100%**.

### 5.2. Chạy Toàn Bộ 27 Test Files Trong Monorepo
```powershell
pnpm test
```
**Kết quả mong đợi:** 27/27 test files, hơn 260 tests **PASS 100%** (bao gồm: Generic Identity, RS256 JWKS, Rate Limiting 429, State Machine, Delivery Sanitizer, Concurrency Sequence, Anti-IDOR, Sweeper Daemon, Dynamic RBAC, Ownership Policy,...).

---

## 6. KHỞI CHẠY HỆ THỐNG (2 SERVERS & 2 CLIENTS)

Hệ thống monorepo hỗ trợ 2 chế độ khởi chạy:

### Chế độ 1: Microservices Riêng Biệt (Khuyến nghị đúng chuẩn kiến trúc 2 Servers - 2 Clients)
Trong VS Code, bạn mở 4 tab Terminal song song:

1. **Terminal 1 — Auth Service (Port 3001):**
   ```powershell
   pnpm run dev:auth
   ```
   *Màn hình thông báo:*
   ```text
   📦 Initializing DrizzleUserRepository (PostgreSQL - Database-per-Service)
   📦 Initializing DrizzleTokenStorage (PostgreSQL - Database-per-Service)
   🔐 Auth Service is running on http://localhost:3001
   ```

2. **Terminal 2 — Quiz Engine Service (Port 3000):**
   ```powershell
   pnpm run dev:quiz
   ```
   *Màn hình thông báo:*
   ```text
   🚀 Assessment Engine API Server running on http://0.0.0.0:3000
   ```

3. **Terminal 3 — Client Học Viên (`apps/quiz-web` - Port 5173):**
   ```powershell
   pnpm run dev:web
   ```
   *Truy cập:* `http://localhost:5173` để đăng nhập bằng tài khoản học viên (`student@quiz.local` / `student123`).

4. **Terminal 4 — Client Quản Trị & Giảng Viên (`apps/admin-web` - Port 5174):**
   ```powershell
   pnpm run dev:admin
   ```
   *Truy cập:* `http://localhost:5174` để đăng nhập bằng tài khoản quản trị (`admin@quiz.local` / `admin123`) hoặc giảng viên (`instructor@quiz.local` / `teacher123`).

---

### Chế độ 2: Hợp Nhất Nhanh (All-in-One Backend trên Port 3000)
Nếu bạn chỉ muốn mở 1 terminal backend duy nhất:
```powershell
# Backend hợp nhất (chạy cả Auth và Quiz trên cổng 3000)
pnpm dev
```
*(Nếu dùng chế độ này, bạn chỉ cần đặt biến `AUTH_SERVICE_URL=http://127.0.0.1:3000` hoặc chạy 2 server độc lập như Chế độ 1)*.

---

## 7. CHEAT-SHEET CÁC LỆNH PNPM DÀNH CHO AUTH SERVICE

| Thao tác nghiệp vụ | Lệnh PNPM tương ứng |
| :--- | :--- |
| Cài đặt toàn bộ dependencies | `pnpm install` |
| Chạy Migration bảng Auth DB | `pnpm db:migrate:auth` *(hoặc `pnpm --filter @platform/auth-service db:migrate`)* |
| Nạp dữ liệu Seed mẫu Auth DB | `pnpm db:seed:auth` *(hoặc `pnpm --filter @platform/auth-service db:seed`)* |
| Chạy toàn bộ test suite monorepo | `pnpm test` |
| Chạy test riêng Auth Service | `pnpm vitest services/auth/tests` |
| Khởi động Auth API Server (Port 3001) | `pnpm run dev:auth` |
| Khởi động Frontend Quiz Web (Port 5173) | `pnpm run dev:web` |
| Khởi động Frontend Admin Web (Port 5174) | `pnpm run dev:admin` |
| Kiểm tra lỗi TypeScript & Linting | `pnpm run lint` |
| Biên dịch toàn bộ Packages & Apps | `pnpm run build` |

---

## 8. XỬ LÝ SỰ CỐ THƯỜNG GẶP TRÊN WINDOWS
 
1. **Lỗi `PostgresError: unrecognized configuration parameter "schema" (code: 42704)`**:
   - **Nguyên nhân**: Chuỗi `AUTH_DATABASE_URL` trong `.env` có gắn thêm query parameter `?schema=public`. Driver `postgres.js` chuyển tham số này vào StartupMessage của giao thức kết nối PostgreSQL. Tuy nhiên, PostgreSQL không hỗ trợ biến GUC `schema` (tham số đúng trong PostgreSQL là `search_path`).
   - **Cách xử lý**:
     - Mở file `.env` tại thư mục gốc, xóa bỏ phần `?schema=public` ở cuối URL, chỉ để lại: `AUTH_DATABASE_URL=postgres://postgres:mật_khẩu@localhost:5432/auth_db`.
     - Code trong `services/auth/src/infrastructure/db/connection.ts` cũng đã được trang bị hàm `sanitizePostgresUrl()` tự động dọn dẹp chuỗi URL.
2. **Lỗi `Connection refused (ECONNREFUSED 127.0.0.1:5432)`**:
   - Dịch vụ PostgreSQL trên Windows chưa bật. Nhấn `Windows + R`, gõ `services.msc`, tìm `postgresql-x64-...` và bấm **Start**.
3. **Lỗi `password authentication failed for user "postgres"`**:
   - Kiểm tra lại mật khẩu trong file `.env`. Nếu có ký tự đặc biệt, nhớ chuyển thành dạng mã hóa URL Encode (như mục 3).
4. **Lỗi `database "auth_db" does not exist`**:
   - Chưa tạo database `auth_db`. Chạy `psql -U postgres -c "CREATE DATABASE auth_db;"` rồi chạy lại `pnpm db:migrate:auth`.
5. **Cơ chế Fail-Fast (Chuẩn hóa Kiến trúc)**:
   - Nếu database bị ngắt kết nối hoặc biến `AUTH_DATABASE_URL` bị trống khi chạy production/dev, hệ thống sẽ báo lỗi Fail-Fast rõ ràng yêu cầu cung cấp PostgreSQL URL thay vì âm thầm rơi vào dữ liệu giả lập. Khi chạy test tự động (`pnpm test`), hệ thống sử dụng PGlite WebAssembly độc lập không phụ thuộc service ngoài.

