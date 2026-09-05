# HƯỚNG DẪN KẾT NỐI POSTGRESQL CHO QUIZ SERVICE (`quiz_db`), SEED DỮ LIỆU VÀ CHẠY TEST BẰNG PNPM TRÊN WINDOWS (VS CODE)

> **Mục tiêu:** Hướng dẫn kết nối cơ sở dữ liệu PostgreSQL có sẵn trên máy của bạn với **Quiz Core Engine Service** trong cấu trúc **Monorepo PNPM Workspace** (gồm 2 Server, 2 Client, 3 Packages), thiết lập kiến trúc Database-per-Service độc lập với `auth_db`, cơ chế Domain-Driven Multi-Tenancy (header `X-Tenant-ID`), phân quyền sở hữu tài nguyên (ABAC Ownership Policy), thực thi Drizzle Migration & Seed đề thi mẫu, và chạy toàn bộ bộ kiểm thử tự động (Vitest) trên môi trường **Windows** trong **Visual Studio Code (VS Code)**.

---

## 1. CẤU TRÚC MONOREPO & KIẾN TRÚC LƯU TRỮ QUIZ SERVICE

Dự án được quản trị bằng **`pnpm-workspace.yaml`** với sự phân tách tường minh giữa các tầng nghiệp vụ:

```
quiz-platform-monorepo/
├── pnpm-workspace.yaml             # Cấu hình workspace của pnpm
├── package.json                    # Root package quản lý scripts chung toàn monorepo
├── .env                            # Biến môi trường kết nối database & secret keys
│
├── services/                       # [2 SERVERS PHÍA BACKEND]
│   ├── auth/                       # @platform/auth-service: Dịch vụ xác thực JWT RS256,
│   │                               # Generic Identity, RBAC, quản lý database auth_db (Port 3001)
│   └── quiz/                       # @platform/quiz-service: Lõi khảo thí Assessment Core Engine
│                                   # (Domain Tenancy, Ownership Policy, State Machine, Auto-Submit) (Port 3000)
│
├── apps/                           # [2 CLIENTS PHÍA FRONTEND]
│   ├── quiz-web/                   # @platform/quiz-web: Ứng dụng thi trực tuyến dành cho Học viên (Port 5173)
│   └── admin-web/                  # @platform/admin-web: Cổng quản trị soạn đề dành cho Giảng viên & Admin (Port 5174)
│
├── packages/                       # [3 THƯ VIỆN DÙNG CHUNG - SHARED PACKAGES]
│   ├── contracts/                  # @platform/contracts: DTOs, Enums, Roles & System Permissions
│   ├── auth-client/                # @platform/auth-client: SDK xác thực, quản lý phiên & Silent Refresh
│   └── api-client/                 # @platform/api-client: HTTP SDK gọi API kèm header X-Tenant-ID tự động
│
└── guides/                         # Thư mục tài liệu kỹ thuật
    ├── auth_postgres_setup_guide.md # Hướng dẫn thiết lập Auth Service (auth_db)
    └── quiz_postgres_setup_guide.md # Hướng dẫn thiết lập Quiz Service (quiz_db - Tài liệu này)
```

### Kiến Trúc Lưu Trữ Quiz Service (Database-per-Service & Domain Tenancy):
- **Cơ sở dữ liệu độc lập (`quiz_db`)**: Quiz Service sở hữu cơ sở dữ liệu riêng, hoàn toàn tách biệt với `auth_db`.
  - Auth Service không lưu trữ hay quản lý đề thi hoặc ca thi.
  - Quiz Service không lưu trữ mật khẩu hay refresh token, chỉ nhận `Principal` từ JWT đã được ký hợp lệ.
- **Domain-Driven Multi-Tenancy (Clean-Cut Tenancy)**:
  - `tenantId` đã được **loại bỏ hoàn toàn khỏi Principal/User** trong Auth Service.
  - Quiz Service xác định tổ chức thông qua HTTP Header `X-Tenant-ID` gửi kèm từ client (mặc định: `tenant_default` hoặc `tenant_core`).
  - Mọi thao tác truy vấn đề thi và ca thi đều được lọc và kiểm tra cách ly theo `tenant_id` tương ứng trong bảng `quizzes` và `attempts`.
- **Cấu trúc 3 bảng quan hệ trong `quiz_db`**:
  1. **`quizzes`**: Quản lý thông tin đề thi.
     - `id`: Định danh duy nhất (khóa chính).
     - `code`: Mã đề duy nhất trong hệ thống (Unique Constraint).
     - `title`, `description`: Tiêu đề và mô tả đề thi.
     - `owner_id`: ID của giảng viên/người tạo đề (ABAC Authoring Guard).
     - `tenant_id`: Mã tổ chức sở hữu đề thi (Tenant Isolation).
     - `status`: Trạng thái đề (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
     - `current_published_version_id`: Phiên bản đang được công bố cho thí sinh làm bài.
  2. **`quiz_versions`**: Phiên bản đề thi bất biến (Immutable Versioning).
     - `id`: Khóa chính phiên bản.
     - `quiz_id`: Liên kết khóa ngoại tới `quizzes.id` (ON DELETE CASCADE).
     - `version_number`: Số thứ tự phiên bản tăng dần (Ràng buộc Unique `[quiz_id, version_number]`).
     - `duration_minutes`: Thời lượng thi chính thức.
     - `passing_score`: Điểm chuẩn đạt bài thi.
     - `max_attempts`: Số lượt thi tối đa cho phép mỗi thí sinh.
     - `questions`: Cấu trúc danh sách câu hỏi lưu dạng `JSONB` (hỗ trợ single-choice, multiple-choice, true-false,...).
     - `scoring_policy`, `randomization_policy`: Chính sách chấm điểm và xáo trộn lưu dạng `JSONB`.
  3. **`attempts`**: Phiên thi của thí sinh (Assessment Delivery & Scoring).
     - `id`: Khóa chính ca thi.
     - `user_id`: ID thí sinh thực hiện bài thi (chống IDOR).
     - `quiz_id`, `quiz_version_id`: Khóa ngoại tới đề và phiên bản đề.
     - `tenant_id`: Mã tổ chức ca thi (Tenant Isolation).
     - `status`: Trạng thái máy trạng thái thi (`CREATED`, `IN_PROGRESS`, `SUBMITTED`, `GRADED`, `TIMED_OUT_GRADED`).
     - `started_at`, `deadline`, `submitted_at`: Dấu mốc thời gian chính thức do máy chủ quyết định (Server-Authoritative Timing).
     - `manifest`: Bản snapshot đề thi đã xáo trộn và **bảo mật tuyệt đối** (đã lược bỏ đáp án đúng trước khi trả về client) lưu dạng `JSONB`.
     - `answers`: Danh sách câu trả lời của thí sinh kèm số thứ tự `sequenceNumber` (chống mất dữ liệu do trễ mạng) lưu dạng `JSONB`.
     - `score_result`: Bảng điểm và phản hồi chi tiết sau khi nộp bài lưu dạng `JSONB`.
- **Dynamic Resilience Factory**:
  - Khi có `QUIZ_DATABASE_URL`: Kích hoạt `DrizzleAuthoringRepository` & `DrizzleDeliveryRepository` kết nối trực tiếp PostgreSQL.
  - Khi chạy unit test: Sử dụng PGlite WebAssembly độc lập tự động khởi tạo bảng không cần service ngoài.

---

## 2. CHUẨN BỊ DATABASE TRÊN POSTGRESQL CỦA BẠN

*(Giả định: Máy tính Windows của bạn đã có sẵn PostgreSQL đang chạy trên cổng mặc định 5432).*

Bạn chỉ cần tạo một cơ sở dữ liệu rỗng mang tên **`quiz_db`**.

### Cách 1: Sử dụng Terminal trong VS Code (`psql`)
Mở Terminal trong VS Code (`Ctrl + ~`):

```powershell
# Đăng nhập vào PostgreSQL với tài khoản postgres
psql -U postgres
```
*(Nếu Windows chưa nhận lệnh `psql`, dùng đường dẫn cài đặt: `& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres`)*

Trong dấu nhắc `postgres=#`, tạo database và thoát:
```sql
CREATE DATABASE quiz_db;
\q
```

### Cách 2: Sử dụng Giao diện Đồ Họa (pgAdmin 4 / DBeaver / VS Code Extension)
1. Mở công cụ quản lý PostgreSQL.
2. Chuột phải vào **Databases** > Chọn **Create** > **Database...**
3. Đặt tên: **`quiz_db`** và lưu lại.

---

## 3. CẤU HÌNH BIẾN MÔI TRƯỜNG (`.env`) TRONG VS CODE

Tại thư mục gốc của dự án:

1. Mở file **`.env`** tại thư mục gốc.
2. Bổ sung hoặc chỉnh sửa biến kết nối cho Quiz Service:

```env
# ==============================================================================
# QUIZ SERVICE - POSTGRESQL CONNECTION (DATABASE-PER-SERVICE)
# ==============================================================================
# Cú pháp chuẩn: postgres://<username>:<password>@<host>:<port>/<database_name>
QUIZ_DATABASE_URL=postgres://postgres:mật_khẩu_của_bạn@localhost:5432/quiz_db

# Cổng lắng nghe của Quiz Engine Service
PORT=3000

# Địa chỉ Auth Service nội bộ để xác thực JWT / JWKS
AUTH_SERVICE_URL=http://localhost:3001

# Khóa bí mật cho Background Sweeper Daemon (/v1/internal/attempts/sweep)
INTERNAL_SWEEPER_SECRET=quiz-internal-sweeper-secret-token-32-chars-min
```

> ⚠️ **Lưu ý định dạng URL & mã hóa ký tự đặc biệt trên Windows:**
> - **Tuyệt đối không gắn `?schema=public` vào đuôi URL**: Driver `postgres.js` sẽ phát sinh lỗi `PostgresError: unrecognized configuration parameter "schema" (code 42704)`. Hệ thống đã trang bị bộ lọc tự động `sanitizePostgresUrl()`, tuy nhiên bạn nên giữ định dạng chuẩn: `postgres://postgres:password@localhost:5432/quiz_db`.
> - **Mã hóa URL (URL Encoding)**: Nếu mật khẩu có ký tự đặc biệt (`@`, `#`, `$`, `%`,...), hãy chuyển thành URL-encoded (ví dụ: `P@ss123` chuyển thành `P%40ss123`).

---

## 4. CÀI ĐẶT DEPENDENCIES & THỰC THI MIGRATION/SEED BẰNG PNPM

Trong VS Code, mở Terminal (`Ctrl + ~`) tại thư mục gốc dự án.

### Bước 4.1: Cài Đặt Dependencies Bằng PNPM
```powershell
pnpm install
```

---

### Bước 4.2: Chạy Migration (Khởi Tạo Cấu Trúc Bảng Database)
Thực thi migration SQL của Quiz Service để tạo các bảng `quizzes`, `quiz_versions`, `attempts` cùng các chỉ mục tối ưu hóa hiệu năng:

```powershell
# Cách 1: Chạy qua script tại root
pnpm db:migrate:quiz

# Cách 2: Chạy trực tiếp qua pnpm workspace filter vào Quiz Service
pnpm --filter @platform/quiz-service db:migrate
```

**Màn hình xuất thông báo thành công:**
```text
🔄 Running Quiz Service PostgreSQL migrations...
   + Created table: quizzes
   + Created table: quiz_versions
   + Created table: attempts
   + Created indexes: idx_quizzes_code, idx_quizzes_owner, idx_quizzes_tenant, idx_attempts_sweeper,...
✅ Quiz Service PostgreSQL migrations completed successfully.
```

---

### Bước 4.3: Chạy Seed (Nạp Dữ Liệu Đề Thi Mẫu Đa Dạng)
Nạp đề thi mẫu kiến trúc cốt lõi cùng các phiên bản đã công bố vào database:

```powershell
# Cách 1: Chạy qua script tại root
pnpm db:seed:quiz

# Cách 2: Chạy trực tiếp qua pnpm workspace filter
pnpm --filter @platform/quiz-service db:seed
```

**Màn hình xuất thông báo thành công:**
```text
🌱 [quiz_db] Seeding default quizzes and versions into PostgreSQL...
  + Seeded Quiz: 'Bài Thi Thử Kiến Trúc Core' (Code: REACT_CORE)
  + Seeded Version: v1 (15 phút, Passing: 3/5 điểm, 3 câu hỏi mẫu: Single-choice, Multi-choice, True/False)
  + Published Version ID: ver_demo_v1
✅ [quiz_db] Seeding completed: 1 quiz, 1 published version initialized in PostgreSQL.
```

### 📋 Cấu Trúc Đề Thi Mẫu Sau Khi Seed:

| Thuộc Tính | Giá Trị Mẫu | Ý Nghĩa Kỹ Thuật |
| :--- | :--- | :--- |
| **Mã Đề (`code`)** | `REACT_CORE` | Mã số dùng để bắt đầu ca thi qua API `POST /v1/attempts` |
| **Tiêu đề** | Bài Thi Thử Kiến Trúc Core | Tên hiển thị trên giao diện học viên |
| **Tổ chức (`tenantId`)** | `tenant_default` | Tổ chức sở hữu đề thi (cô lập đa khách hàng) |
| **Tác giả (`ownerId`)** | `admin_master` | Định danh người tạo đề, chỉ tác giả hoặc ADMIN mới sửa được đề |
| **Thời lượng thi** | `15` phút | Bộ đếm thời gian phía Server kiểm soát nghiêm ngặt |
| **Dạng câu hỏi** | 3 loại: Single Choice, Multiple Choice, True/False | Kiểm thử toàn diện chính sách chấm điểm và xáo trộn |

---

## 5. CHẠY BỘ KIỂM THỬ TỰ ĐỘNG BẰNG PNPM (TEST SUITE)

Hệ thống kiểm thử của Quiz Service bao gồm kiểm thử máy trạng thái, kiểm soát tương tranh bất đối xứng, cách ly tổ chức, và chống gian lận đáp án.

### 5.1. Chạy Riêng Tests Của Quiz Service
```powershell
# Chạy toàn bộ các test suites của Quiz Service (hơn 110 tests)
pnpm vitest services/quiz/tests
```
**Các bài kiểm tra cốt lõi được thực thi:**
- `attempt-state-machine.spec.ts`: Chuyển đổi trạng thái phiên thi chuẩn hóa.
- `sanitization-boundary.spec.ts`: Xác thực đáp án đúng không bao giờ rò rỉ về phía frontend.
- `server-timing-invariants.spec.ts`: Tính toán thời gian nộp bài dựa trên đồng hồ Server, chống gian lận đổi giờ máy client.
- `attempt-sequence-concurrency.spec.ts`: Kiểm soát thứ tự lưu câu trả lời bằng sequence number chống race condition do mạng giật lag.
- `attempt-expiry-sweeper.spec.ts`: Background daemon tự động thu gom và tự động nộp bài khi hết giờ.
- `ownership-policy.spec.ts`: Kiểm thử ranh giới tổ chức qua header `X-Tenant-ID` và chính sách sở hữu đề thi / ca thi.
- `drizzle-assessment-persistence.spec.ts`: Kiểm thử tầng lưu trữ Drizzle PostgreSQL 100%.

### 5.2. Chạy Toàn Bộ Test Files Trong Toàn Monorepo
```powershell
pnpm test
```
**Kết quả mong đợi:** 27/27 test files, hơn 260 tests **PASS 100%**.

---

## 6. KHỞI CHẠY HỆ THỐNG (2 SERVERS & 2 CLIENTS)

Để ứng dụng vận hành đầy đủ luồng từ đăng nhập, soạn đề, đổi tổ chức cho đến thi trực tuyến, bạn khởi chạy đồng thời các service:

Trong VS Code, mở 4 tab Terminal:

1. **Terminal 1 — Auth Service (Port 3001):**
   ```powershell
   pnpm run dev:auth
   ```
   *Cung cấp JWT RS256 và endpoint xác thực.*

2. **Terminal 2 — Quiz Engine Service (Port 3000):**
   ```powershell
   pnpm run dev:quiz
   ```
   *Lõi khảo thí chạy trên cổng 3000 kết nối với `quiz_db`.*

3. **Terminal 3 — Client Học Viên (`apps/quiz-web` - Port 5173):**
   ```powershell
   pnpm run dev:web
   ```
   *Truy cập `http://localhost:5173` để thi trực tuyến.*

4. **Terminal 4 — Client Quản Trị & Giảng Viên (`apps/admin-web` - Port 5174):**
   ```powershell
   pnpm run dev:admin
   ```
   *Truy cập `http://localhost:5174` để quản trị đề thi, duyệt đề, đổi tổ chức.*

---

## 7. CƠ CHẾ DOMAIN-DRIVEN MULTI-TENANCY & WORKSPACE SWITCHER

Hệ thống áp dụng mô hình đa tổ chức theo kiến trúc sạch (**Clean-Cut Tenancy**):

1. **Không gian làm việc độc lập**:
   - Dữ liệu đề thi và ca thi được phân cách độc lập theo các định danh tổ chức:
     - `tenant_core` / `tenant_default`: Không gian đào tạo tiêu chuẩn.
     - `tenant_foreign`: Không gian liên kết quốc tế.
     - `tenant_polytechnic`: Không gian khối cao đẳng/nghề.
2. **Truyền Ngữ Cảnh Qua Header HTTP**:
   - Mọi truy vấn từ frontend thông qua thư viện `@platform/api-client` đều tự động đính kèm header:
     ```http
     X-Tenant-ID: tenant_core
     ```
3. **Workspace Switcher trên Giao Diện Web**:
   - Cả hai ứng dụng `quiz-web` và `admin-web` đều tích hợp bộ chọn không gian làm việc trực quan trên thanh tiêu đề. Khi người dùng chọn tổ chức khác, header `X-Tenant-ID` sẽ lập tức cập nhật và tải lại dữ liệu của tổ chức tương ứng.

---

## 8. CHEAT-SHEET CÁC LỆNH PNPM DÀNH CHO QUIZ SERVICE

| Thao tác nghiệp vụ | Lệnh PNPM tương ứng |
| :--- | :--- |
| Cài đặt toàn bộ dependencies | `pnpm install` |
| Tạo file Migration mới từ schema | `pnpm db:generate:quiz` |
| Chạy Migration bảng Quiz DB | `pnpm db:migrate:quiz` *(hoặc `pnpm --filter @platform/quiz-service db:migrate`)* |
| Nạp dữ liệu Seed đề thi mẫu | `pnpm db:seed:quiz` *(hoặc `pnpm --filter @platform/quiz-service db:seed`)* |
| Chạy kiểm thử riêng Quiz Service | `pnpm vitest services/quiz/tests` |
| Chạy toàn bộ test suites monorepo | `pnpm test` |
| Khởi động Quiz API Server (Port 3000) | `pnpm run dev:quiz` |
| Khởi động Frontend Quiz Web (Port 5173) | `pnpm run dev:web` |
| Khởi động Frontend Admin Web (Port 5174) | `pnpm run dev:admin` |
| Kiểm tra lỗi TypeScript & Linting | `pnpm run lint` |
| Biên dịch toàn bộ Packages & Apps | `pnpm run build` |

---

## 9. XỬ LÝ SỰ CỐ THƯỜNG GẶP TRÊN WINDOWS

1. **Lỗi `FATAL ERROR: QUIZ_DATABASE_URL is not defined in environment variables`**:
   - **Nguyên nhân**: Bạn chưa cấu hình biến `QUIZ_DATABASE_URL` trong file `.env`.
   - **Cách xử lý**: Mở file `.env` tại thư mục gốc, thêm dòng:
     ```env
     QUIZ_DATABASE_URL=postgres://postgres:mật_khẩu_của_bạn@localhost:5432/quiz_db
     ```
2. **Lỗi `FORBIDDEN_CROSS_TENANT_ACCESS (403 Forbidden)`**:
   - **Nguyên nhân**: Thí sinh hoặc giảng viên đang cố gắng truy cập vào đề thi hoặc ca thi thuộc về tổ chức khác với giá trị trong header `X-Tenant-ID`.
   - **Cách xử lý**: Kiểm tra lại tổ chức đang chọn trên Workspace Switcher hoặc header `X-Tenant-ID` truyền vào API.
3. **Lỗi `OUTDATED_ANSWER_SEQUENCE (409 Conflict)`**:
   - **Nguyên nhân**: Hệ thống nhận được gói tin lưu câu trả lời có số `sequenceNumber` nhỏ hơn số thứ tự đã ghi nhận gần nhất (do độ trễ mạng gây đảo thứ tự gói tin).
   - **Cách xử lý**: Đây là cơ chế bảo vệ tính toàn vẹn dữ liệu. Client chỉ cần gửi phiên bản mới nhất với `sequenceNumber` tăng dần.
4. **Lỗi `database "quiz_db" does not exist`**:
   - Chưa tạo database `quiz_db`. Mở terminal chạy `psql -U postgres -c "CREATE DATABASE quiz_db;"` rồi chạy lại `pnpm db:migrate:quiz`.
5. **Lỗi Port 3000 hoặc 3001 đã bị chiếm dụng (EADDRINUSE)**:
   - Trên Windows, mở PowerShell với quyền Administrator và kiểm tra tiến trình đang chiếm port:
     ```powershell
     netstat -ano | findstr :3000
     taskkill /PID <PID_tìm_được> /F
     ```
   - Sau đó khởi động lại server bằng `pnpm run dev:quiz`.
