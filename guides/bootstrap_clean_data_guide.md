# HƯỚNG DẪN KHỞI TẠO DỮ LIỆU MỚI (BOOTSTRAP CLEAN DATA) BẰNG PNPM TRONG MONOREPO WORKSPACE

> **Mục tiêu:** Hướng dẫn thiết lập cơ sở dữ liệu PostgreSQL cho 6 Microservices độc lập, thực thi Migration cấu trúc bảng và chạy script khởi tạo dữ liệu mẫu sạch (`scripts/bootstrap-clean-data.ts`) bằng **PNPM** (`pnpm seed:all`) trong cấu trúc **Monorepo PNPM Workspace**, phục vụ kiểm thử, phát triển và vận hành hệ thống Khảo thí Trực tuyến.

---

## 1. TỔNG QUAN KIẾN TRÚC & NGUYÊN TẮC CLEAN BOOTSTRAP

Hệ thống Khảo thí trực tuyến đã được bóc tách toàn diện sang mô hình **6 Microservices độc lập**, mỗi service sở hữu một cơ sở dữ liệu riêng biệt (**Database-per-Service**):

```
                                  ┌────────────────────────┐
                                  │   API Gateway (3000)   │
                                  └───────────┬────────────┘
         ┌───────────────┬────────────────────┼───────────────────┬───────────────┐
         ▼               ▼                    ▼                   ▼               ▼
   ┌───────────┐   ┌────────────┐      ┌─────────────┐     ┌─────────────┐  ┌───────────┐
   │Auth (3001)│   │Taxonomy(02)│      │Question (03)│     │Assessm. (04)│  │ Exam (05) │
   └─────┬─────┘   └─────┬──────┘      └──────┬──────┘     └──────┬──────┘  └─────┬─────┘
         │               │                    │                   │               │
         ▼               ▼                    ▼                   ▼               ▼
     [auth_db]     [taxonomy_db]        [question_db]      [assessment_db]    [exam_db]
                                                                                  ▲
                                                                                  │
                                                                           ┌──────┴────┐
                                                                           │Attempt(06)│
                                                                           └─────┬─────┘
                                                                                 │
                                                                                 ▼
                                                                           [attempt_db]
```

### Nguyên Tắc Khởi Tạo Dữ Liệu Sạch (Clean Bootstrap):
1. **100% Clean Data**: Toàn bộ dữ liệu được sinh mới chuẩn mực, hoàn toàn không kế thừa hay phụ thuộc schema monolithic cũ.
2. **Đường Ống Phụ Thuộc Nghiệp Vụ Nghiêm Ngặt (Strict Dependency Pipeline)**:
   $$\text{Auth} \longrightarrow \text{Taxonomy} \longrightarrow \text{Question} \longrightarrow \text{Assessment} \longrightarrow \text{Exam} \longrightarrow \text{Attempt}$$
   - **Auth Service**: Cung cấp danh tính chuẩn hóa và tài khoản tác giả (`usr_instructor_01`), học viên (`usr_student_01`).
   - **Taxonomy Service**: Cung cấp cây danh mục chủ đề (`node_math_quad_eq`), khối lớp (`node_grade_10`) và thang độ khó.
   - **Question Bank Service**: Cung cấp ngân hàng câu hỏi chuẩn Bloom taxonomy gắn với các node chủ đề đã tạo.
   - **Assessment Service**: Xây dựng đề cương khảo thí (Blueprint) và ma trận tiêu chí phân bổ câu hỏi.
   - **Exam Engine Service**: Vận hành bộ giải ma trận `MatrixSolver`, tổng hợp câu hỏi từ Question Bank thành đề thi chính thức (`EXM_TOAN10_HK1`) kèm 4 mã đề hoán vị bất biến (101, 102, 103, 104).
3. **Tách Biệt Tuyệt Đối Giữa Runtime Dev và Migration/Seeding**:
   - Khi chạy server phát triển (`pnpm run dev`, `pnpm run dev:gateway`, `pnpm start` hoặc các standalone service servers), hệ thống **hoàn toàn KHÔNG tự động gọi migrations hay seeding**.
   - Việc loại bỏ auto-migrations giúp khởi động server gần như tức thì, tránh khóa database (deadlocks/timeouts) khi `tsx watch` tự động reload mỗi lần lưu file code.
   - Quá trình chạy Migration được tách biệt hoàn toàn và chỉ thực thi khi lập trình viên chủ động kích hoạt:
     - Chạy migration đơn lẻ: `pnpm db:migrate:<service>` (ví dụ: `pnpm db:migrate:auth`, `pnpm db:migrate:taxonomy`,...)
     - Khởi tạo toàn diện schema và dữ liệu mẫu sạch: `pnpm seed:all` (`scripts/bootstrap-clean-data.ts`).

---

## 2. CHUẨN BỊ 6 CƠ SỞ DỮ LIỆU TRÊN POSTGRESQL

Hệ thống yêu cầu 6 database độc lập trên PostgreSQL (mặc định cổng `5432`).

### Cách 1: Sử dụng Terminal (`psql`)
Mở Terminal trong VS Code (`Ctrl + ~`):

```powershell
# Đăng nhập vào PostgreSQL với quyền user postgres
psql -U postgres
```
*(Nếu Windows chưa nhận lệnh `psql`, dùng đường dẫn cài đặt: `& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres`)*

Tại dấu nhắc `postgres=#`, chạy các lệnh SQL sau để tạo 6 database rỗng:

```sql
CREATE DATABASE auth_db;
CREATE DATABASE taxonomy_db;
CREATE DATABASE question_db;
CREATE DATABASE assessment_db;
CREATE DATABASE exam_db;
CREATE DATABASE attempt_db;
\q
```

### Cách 2: Sử dụng Giao diện Đồ Họa (pgAdmin 4 / DBeaver / TablePlus)
1. Mở công cụ quản lý PostgreSQL.
2. Chuột phải vào mục **Databases** > chọn **Create** > **Database...**.
3. Lần lượt tạo đủ 6 database với tên chuẩn:
   - `auth_db`
   - `taxonomy_db`
   - `question_db`
   - `assessment_db`
   - `exam_db`
   - `attempt_db`

---

## 3. CẤU HÌNH BIẾN MÔI TRƯỜNG (`.env`)

Mở file **`.env`** tại thư mục gốc dự án (sao chép từ `.env.example` nếu chưa có):

```powershell
Copy-Item .env.example .env
# Hoặc trên Linux/macOS: cp .env.example .env
```

Điền chuỗi kết nối tương ứng với mật khẩu PostgreSQL của máy bạn:

```env
# ==============================================================================
# CẤU HÌNH KẾT NỐI POSTGRESQL 6 MICROSERVICES (DATABASE-PER-SERVICE)
# Cú pháp chuẩn: postgres://<username>:<password>@<host>:<port>/<database_name>
# ==============================================================================
AUTH_DATABASE_URL=postgres://postgres:mật_khẩu_của_bạn@localhost:5432/auth_db
AUTH_PORT=3001

TAXONOMY_DATABASE_URL=postgres://postgres:mật_khẩu_của_bạn@localhost:5432/taxonomy_db
TAXONOMY_PORT=3002

QUESTION_DATABASE_URL=postgres://postgres:mật_khẩu_của_bạn@localhost:5432/question_db
QUESTION_PORT=3003

ASSESSMENT_DATABASE_URL=postgres://postgres:mật_khẩu_của_bạn@localhost:5432/assessment_db
ASSESSMENT_PORT=3004

EXAM_DATABASE_URL=postgres://postgres:mật_khẩu_của_bạn@localhost:5432/exam_db
EXAM_PORT=3005

ATTEMPT_DATABASE_URL=postgres://postgres:mật_khẩu_của_bạn@localhost:5432/attempt_db
ATTEMPT_PORT=3006

# API Gateway hợp nhất
GATEWAY_PORT=3000

# Secret Key cho Token Service
JWT_SECRET=dev-quiz-platform-secret-key-32-chars-min
```

> ⚠️ **Lưu ý quan trọng về định dạng URL:**
> - **Không gắn `?schema=public` vào đuôi URL**: PostgreSQL thuần không có biến cấu hình GUC tên là `schema` (PostgreSQL dùng `search_path`), dễ dẫn đến lỗi `unrecognized configuration parameter "schema" (code 42704)`.
> - **Mã hóa URL (URL Encoding)**: Nếu mật khẩu PostgreSQL chứa ký tự đặc biệt (`@`, `#`, `$`, `&`), hãy đổi sang dạng mã hóa URL (ví dụ `@` thành `%40`).

---

## 4. CÀI ĐẶT DEPENDENCIES & CHẠY MIGRATION BẰNG PNPM

### 4.1. Cài đặt Dependencies Monorepo bằng pnpm
```powershell
pnpm install
```
*pnpm sẽ tự động phân giải cấu trúc workspace, liên kết các package nội bộ (`@platform/contracts`, `@platform/auth-client`, `@platform/api-client`) và nạp thư viện tối ưu qua cơ chế hard-link.*

---

### 4.2. Chạy Migration Cấu Trúc Bảng Cho Cả 6 Services

Thực thi migration SQL để khởi tạo schema cho 6 cơ sở dữ liệu. Bạn có thể chạy nhanh từ root:

```powershell
# 1. Migration Auth Service
pnpm db:migrate:auth

# 2. Migration Taxonomy Service
pnpm db:migrate:taxonomy

# 3. Migration Question Bank Service
pnpm db:migrate:question

# 4. Migration Assessment Service
pnpm db:migrate:assessment

# 5. Migration Exam Engine Service
pnpm db:migrate:exam

# 6. Migration Attempt Service
pnpm db:migrate:attempt
```

*(Mẹo: Bạn cũng có thể dùng `pnpm --filter @platform/<service-name> db:migrate` hoặc dùng `pnpm db:push:<service>` nếu muốn Drizzle đồng bộ cấu trúc bảng trực tiếp).*

---

## 5. THỰC THI BOOTSTRAP CLEAN DATA BẰNG PNPM

Toàn bộ quá trình nạp dữ liệu sạch được điều phối tự động qua script tổng thể `scripts/bootstrap-clean-data.ts`.

### Lệnh thực thi chính:
Tại thư mục gốc dự án trong Terminal VS Code, chạy:

```powershell
pnpm seed:all
```
*(Hoặc dùng lệnh tương đương: `pnpm run seed:all`)*.

---

### Nhật Ký Thực Thi Mong Đợi (Console Log):

Màn hình console sẽ xuất log chi tiết từng công đoạn theo thứ tự:

```text
================================================================
🚀 GIAI ĐOẠN 6: BẮT ĐẦU KHỞI TẠO DỮ LIỆU SẠCH (CLEAN BOOTSTRAP)
   Nguyên tắc: 100% dữ liệu mới chuẩn mực, không tái sử dụng schema cũ
================================================================

👉 [1/6] Bootstrapping Auth Service (Users, Roles, Permissions)...
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
   ✅ Auth Service seeded successfully.

👉 [2/6] Bootstrapping Taxonomy Service (Categories, Nodes, Trees)...
🌱 Seeding Taxonomy Database (Dimensions & Standard Tree Nodes)...
   + Seeded 4 Taxonomy Dimensions: TOPIC, DIFFICULTY, TAG, GRADE
   + Seeded Topic Tree: Toán học (Đại số, Phương trình bậc hai)
   + Seeded Grade Hierarchy: Lớp 10 (THPT)
   ✅ Taxonomy Service seeded successfully.

👉 [3/6] Bootstrapping Question Bank Service (Bloom Taxonomy Questions)...
🌱 [question_db] Seeding comprehensive question bank into PostgreSQL...
   + Seeded 10+ Bloom Taxonomy questions (REMEMBER, UNDERSTAND, APPLY)
   + Công thức Toán học LaTeX KaTeX chuẩn mực
   + Quản lý phiên bản câu hỏi (Question Revisions v1)
   ✅ Question Bank Service seeded successfully.

👉 [4/6] Bootstrapping Assessment Service (Blueprints & Criteria Matrices)...
🌱 [assessment_db] Seeding standardized assessments & blueprints into PostgreSQL...
   + Seeded Assessment: asm_math10_midterm (MATH10-MIDTERM-2026)
   + Seeded Blueprint: Ma trận tiêu chí 10 câu (4 Nhận biết, 4 Thông hiểu, 2 Vận dụng)
   ✅ Assessment Service seeded successfully.

👉 [5/6] Bootstrapping Exam Engine Service (MatrixSolver, Variants 101-104, Snapshots)...
   + Khởi tạo giải thuật ma trận MatrixSolver
   + Sinh 4 mã đề hoán vị độc lập: Mã 101, 102, 103, 104
   + Đóng băng snapshot câu hỏi chống chỉnh sửa đề thi
   + Kích hoạt trạng thái: PUBLISHED & ACTIVE
   ✅ Exam Engine Service seeded successfully.

👉 [6/6] Bootstrapping Attempt Service (Runtime Sessions & Telemetry Logs)...
🌱 [attempt_db] Checking exam snapshots to seed demo completed attempt...
   + Seeded demo completed attempt: att_demo_student01_graded
   + Seeded telemetry audit events (ATTEMPT_STARTED, ANSWER_SAVED, AUTO_SUBMITTED)
   + Trạng thái bài thi: GRADED (10/10 điểm)
   ✅ Attempt Service seeded successfully.

================================================================
🎉 HOÀN TẤT KHỞI TẠO DỮ LIỆU SẠCH 6 DỊCH VỤ TRONG 1250ms
================================================================
```

---

### Tùy Chọn: Chạy Seed Độc Lập Từng Service Bằng pnpm

Khi bạn muốn nạp lại dữ liệu cho một service đơn lẻ:

| Microservice | Lệnh Chạy Seed Độc Lập bằng pnpm |
| :--- | :--- |
| **Auth Service** | `pnpm db:seed:auth` *(hoặc `pnpm --filter @platform/auth-service db:seed`)* |
| **Taxonomy Service** | `pnpm db:seed:taxonomy` *(hoặc `pnpm --filter @platform/taxonomy-service db:seed`)* |
| **Question Bank** | `pnpm db:seed:question` *(hoặc `pnpm --filter @platform/question-service db:seed`)* |
| **Assessment Service** | `pnpm db:seed:assessment` *(hoặc `pnpm --filter @platform/assessment-service db:seed`)* |
| **Exam Engine** | `pnpm db:seed:exam` *(hoặc `pnpm --filter @platform/exam-service db:seed`)* |
| **Attempt Service** | `pnpm db:seed:attempt` *(hoặc `pnpm --filter @platform/attempt-service db:seed`)* |

*(Lưu ý: Nếu nạp độc lập `exam` hoặc `attempt`, hãy chắc chắn `question` và `assessment` đã được nạp dữ liệu trước đó).*

---

## 6. DANH MỤC DỮ LIỆU MẪU ĐƯỢC NẠP SẴN (DATA CATALOG)

### 6.1. Danh Sách Tài Khoản Người Dùng (Auth Service)

Mật khẩu được băm an toàn bằng thuật toán chuẩn hóa `scryptSync` (kèm salt ngẫu nhiên 16 bytes):

| Email Đăng Nhập | Mật Khẩu Mặc Định | Vai Trò (Role) | Mục Đích Sử Dụng |
| :--- | :--- | :--- | :--- |
| `admin@quiz.local` | `admin123` | `ADMIN` | Quản trị toàn hệ thống, cấu hình và giám sát |
| `instructor@quiz.local` | `teacher123` | `INSTRUCTOR` | Giảng viên, soạn ngân hàng câu hỏi, duyệt đề thi |
| `student@quiz.local` | `student123` | `STUDENT` | Học viên, đăng nhập làm bài khảo thí |
| `admin@quiz.com` | `admin123` | `ADMIN` | Tài khoản Admin môi trường chính |
| `instructor@quiz.com` | `teacher123` | `INSTRUCTOR` | Tài khoản Giảng viên môi trường chính |
| `student@quiz.com` | `student123` | `STUDENT` | Tài khoản Học viên môi trường chính |

### 6.2. Danh Mục Khảo Thí & Đề Thi Chính Thức

| Thông Tin Khảo Thí | Chi Tiết Dữ Liệu Nạp |
| :--- | :--- |
| **Chủ đề (Topic)** | Toán học $\rightarrow$ Đại số $\rightarrow$ Phương trình bậc hai (`node_math_quad_eq`) |
| **Khối lớp (Grade)** | Lớp 10 (`node_grade_10`) |
| **Đề cương (Assessment)** | `MATH10-MIDTERM-2026`: Đề kiểm tra giữa kỳ 1 - Toán 10 (45 phút, 10 câu hỏi) |
| **Đề thi (Exam)** | Mã `EXM_TOAN10_HK1`: Đề Thi Giữa Kỳ 1 Môn Toán Lớp 10 (Chính thức) |
| **Mã đề hoán vị (Variants)**| **101, 102, 103, 104** (Thứ tự câu hỏi và đáp án được xáo trộn ngẫu nhiên theo seed bất biến) |
| **Ca thi mẫu (Demo Attempt)**| `att_demo_student01_graded` (Điểm số: 10/10, trạng thái: `GRADED`) |

---

## 7. KIỂM THỬ TỰ ĐỘNG & KHỞI CHẠY HỆ THỐNG BẰNG PNPM

### 7.1. Chạy Bộ Kiểm Thử Tự Động Bằng pnpm
Dự án sử dụng Vitest hỗ trợ chạy đa luồng cực nhanh trong pnpm monorepo:

```powershell
# Chạy toàn bộ test suites trong monorepo
pnpm test

# Chạy riêng kiểm thử tích hợp API Gateway (cổng 3000)
pnpm vitest services/gateway/tests/gateway.spec.ts
```
**Kết quả mong đợi:** Tất cả các bài kiểm tra đều đạt trạng thái **PASS 100%**.

---

### 7.2. Khởi Động API Gateway (Cổng Hợp Nhất 3000)
```powershell
pnpm start
# Hoặc chế độ tự động reload khi sửa code:
pnpm run dev:gateway
```
*(Server lắng nghe tại `http://localhost:3000`)*.

Kiểm tra trạng thái hệ thống:
- **Health Check 6 Services**: `GET http://localhost:3000/health`
- **Đồng bộ thời gian Cristian's Algorithm**: `GET http://localhost:3000/v1/time`
- **Danh mục chủ đề**: `GET http://localhost:3000/v1/taxonomies`
- **Danh sách đề thi sẵn sàng**: `GET http://localhost:3000/v1/exams`

---

### 7.3. Khởi Động Giao Diện Web Dành Cho Học Viên & Giảng Viên
Mở 2 tab terminal song song:

1. **Tab 1 — Cổng học sinh thi trực tuyến (`apps/web` - Port 5173):**
   ```powershell
   pnpm run dev:web
   ```
   *Truy cập:* `http://localhost:5173` để đăng nhập bằng tài khoản học viên (`student@quiz.local` / `student123`).

2. **Tab 2 — Cổng quản trị khảo thí (`apps/admin-web` - Port 5174):**
   ```powershell
   pnpm run dev:admin
   ```
   *Truy cập:* `http://localhost:5174` để đăng nhập bằng tài khoản quản trị (`admin@quiz.local` / `admin123`) hoặc giảng viên (`instructor@quiz.local` / `teacher123`).

---

## 8. BẢNG TỔNG HỢP CÁC LỆNH PNPM (CHEAT-SHEET)

| Nghiệp Vụ Thao Tác | Lệnh PNPM |
| :--- | :--- |
| **Cài đặt dependencies** | `pnpm install` |
| **Nạp dữ liệu sạch toàn bộ 6 Services** | `pnpm seed:all` |
| **Migration từng service** | `pnpm db:migrate:auth`<br>`pnpm db:migrate:taxonomy`<br>`pnpm db:migrate:question`<br>`pnpm db:migrate:assessment`<br>`pnpm db:migrate:exam`<br>`pnpm db:migrate:attempt` |
| **Seed từng service riêng vị trí** | `pnpm db:seed:auth`<br>`pnpm db:seed:taxonomy`<br>`pnpm db:seed:question`<br>`pnpm db:seed:assessment`<br>`pnpm db:seed:exam`<br>`pnpm db:seed:attempt` |
| **Chạy toàn bộ test suites** | `pnpm test` |
| **Chạy kiểm thử Gateway** | `pnpm vitest services/gateway/tests` |
| **Khởi động API Gateway (3000)** | `pnpm start` *(hoặc `pnpm run dev:gateway`)* |
| **Khởi động Web Thi Học Viên (5173)** | `pnpm run dev:web` |
| **Khởi động Web Quản Trị Đề (5174)** | `pnpm run dev:admin` |
| **Kiểm tra TypeScript & Linting** | `pnpm run lint` |
| **Biên dịch Production Build** | `pnpm run build` |

---

## 9. XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

1. **Lỗi `connect ECONNREFUSED 127.0.0.1:5432`**:
   - Dịch vụ PostgreSQL trên máy tính chưa bật.
   - *Khắc phục:* Nhấn `Windows + R`, gõ `services.msc`, tìm dịch vụ `postgresql-x64-...` và bấm **Start**.

2. **Lỗi `database "..." does not exist`**:
   - Chưa tạo đủ 6 database trong PostgreSQL.
   - *Khắc phục:* Mở `psql -U postgres` và thực thi các lệnh `CREATE DATABASE` ở Mục 2.

3. **Lỗi `Assessment asm_math10_midterm not found for exam generation`**:
   - Chạy lệnh seed đơn lẻ của Exam trước khi Question và Assessment có dữ liệu.
   - *Khắc phục:* Luôn ưu tiên dùng lệnh tổng hợp `pnpm seed:all` để chạy đúng thứ tự phụ thuộc.

4. **Lỗi `unrecognized configuration parameter "schema"`**:
   - Chuỗi kết nối PostgreSQL trong file `.env` bị gắn thừa `?schema=public`.
   - *Khắc phục:* Xóa bỏ phần `?schema=public` ở cuối chuỗi URL trong file `.env`.
