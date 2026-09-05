# 🚀 Assessment & Quiz Engine Platform (Monorepo)

Hệ thống đánh giá năng lực và thi trắc nghiệm trực tuyến thế hệ mới, được thiết kế theo chuẩn **Monorepo**, kiến trúc **Hexagonal Architecture (Ports & Adapters)** kết hợp **Domain-Driven Design (DDD)** trên nền tảng **TypeScript**, cơ sở dữ liệu **PostgreSQL** với **Drizzle ORM**.

Toàn bộ logic nghiệp vụ đánh giá, quản lý vòng đời bài thi và thuật toán chấm điểm được cô lập hoàn toàn khỏi Web Framework và giao diện người dùng, đồng thời lưu trữ bền vững trên PostgreSQL với độ trễ tối thiểu và kiểm thử tích hợp không phụ thuộc Docker nhờ **PGlite**.

---

## 🏛️ Cấu Trúc Monorepo (Project Structure)

```text
.
├── services/
│   ├── quiz/                         # 🧠 Core Assessment & Delivery Engine (Port 3000)
│   │   ├── drizzle/                  # Drizzle ORM Migrations & SQL DDL
│   │   ├── src/
│   │   │   ├── domain/               # Pure Business Logic (Framework-Agnostic)
│   │   │   │   ├── authoring/        # Sub-domain Quản lý & Soạn thảo đề thi (Quiz, Version, Policies)
│   │   │   │   ├── delivery/         # Sub-domain Tổ chức thi (Attempt, Manifest, Sanitizer)
│   │   │   │   ├── question-engine/  # Question Registry & Handlers (Single, Multi, True/False)
│   │   │   │   ├── scoring/          # Chiến lược chấm điểm (Exact, Partial, Negative)
│   │   │   │   └── ports/            # Repository Interfaces & Secondary Ports
│   │   │   ├── application/          # Use Cases (AuthoringUseCases, DeliveryUseCases)
│   │   │   ├── infrastructure/       # Drizzle PostgreSQL Persistence & Multi-tenant Repositories
│   │   │   └── presentation/         # RESTful Inbound Routes (/v1/quizzes, /v1/attempts)
│   │   └── tests/                    # 144 Automated Tests (Domain, Security, Delivery, PostgreSQL)
│   └── auth/                         # 🔐 Generic Identity Provider (IdP) Service (Port 3001)
│       ├── drizzle/                  # Drizzle ORM Migrations (Normalized RBAC & Token Storage)
│       ├── src/
│       │   ├── domain/               # User Entity (Zero-Tenant Clean-Cut) & Role/Permission Aggregates
│       │   ├── application/          # Use Cases (Register, Login, Profile, Refresh, Logout, RBAC Admin)
│       │   ├── infrastructure/       # Drizzle PostgreSQL Repositories, RS256/HS256 JWKS Token Service
│       │   └── presentation/         # RESTful Inbound Routes (/v1/auth, /v1/admin/rbac, /.well-known/jwks.json)
│       └── tests/                    # 49 Automated Tests (Core Auth, RBAC, RS256 JWKS, Persistence)
│
├── packages/
│   ├── api-client/                   # 📦 Type-Safe SDK cho toàn bộ Quiz RESTful API
│   ├── auth-client/                  # 📦 Auth SDK quản lý phiên đăng nhập, tokens & JWT context
│   └── contracts/                    # 📦 Common Type Definitions, Principal & Domain Contracts
│
├── apps/
│   ├── quiz-web/                     # 💻 Web App làm bài cho Thí sinh (React + Tailwind + Vite)
│   └── admin-web/                    # 🛠️ Web App Quản trị & Soạn thảo đề thi (React + Vite)
│
├── plan/                             # 📋 Kế hoạch kỹ thuật & tài liệu kiến trúc chuyên sâu
│   └── auth_service_generic_and_tenancy_audit_plan.md
├── EXECUTION_PLAN.md                 # 📋 Chi tiết kế hoạch thực thi & đối chiếu các giai đoạn
└── README.md
```

---

## 🌟 Tính Năng & Điểm Nhấn Kiến Trúc (Core Capabilities)

### 1. Phân Tách Rõ Ràng Hai Bounded Contexts (DDD)
- **Authoring Sub-domain (Soạn thảo đề thi)**:
  - Vòng đời bài thi an toàn: `DRAFT` ➜ `REVIEW` ➜ `PUBLISHED` ➜ `ARCHIVED`.
  - Cơ chế **QuizVersion Snapshot**: Mỗi lần xuất bản tạo một bản chụp đề thi bất biến, ngăn chặn sửa đổi đề làm sai lệch kết quả của các thí sinh đang thi.
  - Kiểm định quy chuẩn xuất bản (`PublishingPolicy`): Chặn xuất bản khi đề trống, điểm bằng 0 hoặc cấu hình chấm sai lệch.
- **Delivery Sub-domain (Tổ chức thi & Nộp bài)**:
  - Quản lý phiên làm bài thông qua Aggregate Root `Attempt`.
  - **AttemptManifest**: Đóng băng trật tự câu hỏi và thứ tự các phương án xáo trộn riêng biệt cho từng thí sinh, đảm bảo refresh trang không bị đổi đề.
  - **AttemptPolicy**: Kiểm soát số lần thi tối đa (`maxAttempts`) và tự động khôi phục ca thi đang làm (`Resume Attempt`) khi mở lại trình duyệt hoặc nhiều tab.

### 2. Định Danh Chuẩn Generic IdP (Zero-Tenant Clean-Cut Auth)
- **Identity-Only Bounded Context**: Auth Service hoạt động như một Identity Provider độc lập chuẩn mực (tương tự Auth0 / Keycloak):
  - Bảng `users` hoàn toàn không chứa `tenant_id` hay các thuộc tính đặc thù của domain Quiz.
  - Hỗ trợ trường `metadata` (JSONB) lưu thông tin mở rộng phi định danh (avatar, locale, custom preferences).
  - JWT Token được ký theo chuẩn OIDC với các claims: `sub`, `email`, `name`, `roles`, `permissions`, `metadata`.
- **Mã Hóa Bất Đối Xứng RFC 7517 (JWKS RS256)**:
  - Endpoint `/.well-known/jwks.json` cung cấp public keys cho các Resource Servers (Quiz Service) xác thực token độc lập mà không cần gọi ngược về Auth Service.
  - Hỗ trợ xoay vòng khóa (Key Rotation) và tương thích ngược với khóa đối xứng HS256 khi cần.
- **Mô Hình Phân Quyền Chuẩn Hóa (Normalized RBAC)**:
  - 5 bảng quan hệ: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`.
  - Quản trị viên phân quyền linh hoạt qua API CRUD Role, gán Permission và phân bổ quyền cho User.

### 3. Phân Lập Đa Khách Thuê Tự Chủ (Autonomous Tenancy Boundary at Quiz Service)
- **Header-Based Context**: Quiz Service tự chủ hoàn toàn logic phân tách tổ chức thông qua HTTP Header `X-Tenant-ID`.
- **Kiểm Soát Sở Hữu Gọn Nhẹ (Lightweight ABAC Ownership Policy)**:
  - Đề thi và Lượt làm bài thuộc quyền quản lý của Tenant tương ứng (`quizzes.tenant_id`, `attempts.tenant_id`).
  - Giảng viên chỉ sửa/xuất bản đề thi do mình tạo ra (`authorId === principal.id`), trừ Quản trị viên có quyền `quiz:manage_all`.
  - Thí sinh chỉ được thao tác trên lượt làm bài chính chủ (`attempt.candidateId === principal.id`).

### 4. Question Engine Registry & Scoring Strategies
- **Question Engine Registry (Open-Closed Principle)**: Hỗ trợ `Single-choice`, `Multiple-choice`, và `True/False` mở rộng độc lập.
- **Chiến lược chấm điểm đa dạng**: `ExactMatchScoringStrategy` (chính xác tuyệt đối), `PartialCreditScoringStrategy` (điểm từng phần có trừ sai), và `NegativeMarkingScoringStrategy` (phạt điểm khi đoán mò).
- **DeliverySanitizer**: Bóc tách triệt để đáp án đúng, biểu điểm và giải thích chi tiết ngay tại ranh giới máy chủ trước khi gửi dữ liệu cho thí sinh.

### 5. Lưu Trữ Bền Vững PostgreSQL & Drizzle ORM
- Đã thay thế 100% các InMemory repositories bằng Drizzle ORM trên nền PostgreSQL thực thụ.
- Cơ chế kiểm thử tích hợp siêu tốc sử dụng `@electric-sql/pglite` (chạy WebAssembly PostgreSQL engine trực tiếp trong tiến trình test, không cần Docker, tốc độ dưới 30s cho toàn bộ 193 tests).

---

## 🔌 Chuẩn Giao Tiếp RESTful API v1

### 📋 Quiz Authoring & Catalog APIs (`/v1/quizzes`)
| Phương thức | Đường dẫn | Header yêu cầu | Mô tả |
|---|---|---|---|
| `GET` | `/v1/quizzes` | `X-Tenant-ID` | Lấy danh sách đề thi đã xuất bản trong tenant |
| `POST` | `/v1/quizzes` | `X-Tenant-ID`, `Authorization` | Tạo mới đề thi ở trạng thái bản nháp (`DRAFT`) |
| `GET` | `/v1/quizzes/:id` | `X-Tenant-ID` | Xem chi tiết thông tin và các phiên bản của đề thi |
| `POST` | `/v1/quizzes/:id/versions` | `X-Tenant-ID`, `Authorization` | Tạo phiên bản mới (`QuizVersion`) cho đề thi |
| `POST` | `/v1/quizzes/:id/publish` | `X-Tenant-ID`, `Authorization` | Xuất bản đề thi theo phiên bản chỉ định |

### 🎯 Quiz Delivery APIs (`/v1/attempts`)
| Phương thức | Đường dẫn | Header yêu cầu | Mô tả |
|---|---|---|---|
| `POST` | `/v1/attempts` | `X-Tenant-ID`, `Authorization` | Tạo mới hoặc khôi phục ca thi của thí sinh |
| `POST` | `/v1/attempts/:id/start` | `X-Tenant-ID`, `Authorization` | Bắt đầu tính giờ & nhận đề thi đã khử khuẩn (`Sanitized Manifest`) |
| `GET` | `/v1/attempts/:id` | `X-Tenant-ID`, `Authorization` | Xem tiến độ ca thi hiện tại |
| `PUT` | `/v1/attempts/:id/answers/:questionId` | `X-Tenant-ID`, `Authorization` | Lưu câu trả lời từng câu (kèm `clientTimestamp`) |
| `POST` | `/v1/attempts/:id/submit` | `X-Tenant-ID`, `Authorization` | Khóa bài thi, tính điểm chính thức và trả về kết quả |

### 🔐 Authentication & Identity APIs (`/v1/auth`)
| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| `POST` | `/v1/auth/register` | Đăng ký tài khoản người dùng mới (chỉ nhận `email`, `name`, `password`, `metadata`) |
| `POST` | `/v1/auth/login` | Đăng nhập hệ thống (bảo vệ chống brute-force rate limit 5 lần thử/phút) |
| `GET` | `/v1/auth/me` | Lấy thông tin hồ sơ người dùng và Principal an toàn |
| `POST` | `/v1/auth/refresh` | Làm mới Access Token (hỗ trợ cookie HttpOnly xoay vòng token) |
| `POST` | `/v1/auth/logout` | Đăng xuất và thu hồi Refresh Token trong DB |
| `GET` | `/.well-known/jwks.json` | Cung cấp danh sách khóa công khai theo chuẩn RFC 7517 JWKS |

---

## 🛠️ Hướng Dẫn Cài Đặt & Khởi Chạy (Getting Started)

### Yêu cầu môi trường
- **Node.js**: >= 18.0.0
- **npm** hoặc **bun** / **pnpm**
- **PostgreSQL**: Phiên bản >= 14 (cho môi trường production / development)

### Cấu hình biến môi trường (`.env`)
```env
# Quiz Service
QUIZ_PORT=3000
QUIZ_DATABASE_URL=postgres://postgres:postgres@localhost:5432/quiz_db

# Auth Service
AUTH_PORT=3001
AUTH_DATABASE_URL=postgres://postgres:postgres@localhost:5432/auth_db
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long_for_security
```

### Lệnh thực thi chính

```bash
# 1. Cài đặt toàn bộ dependencies
npm install

# 2. Chạy toàn bộ 193 Automated Unit & Integration Tests (Sử dụng PGlite)
npm test

# 3. Kiểm tra tĩnh kiểu dữ liệu (Type-check / Lint)
npm run lint

# 4. Biên dịch dự án
npm run build

# 5. Quản lý Cơ sở Dữ liệu Drizzle (Migrations & Seeding)
npm run db:migrate:auth   # Áp dụng migration cho Auth Service DB
npm run db:seed:auth      # Nạp dữ liệu khởi tạo RBAC và người dùng mẫu
npm run db:migrate:quiz   # Áp dụng migration cho Quiz Service DB
npm run db:seed:quiz      # Nạp dữ liệu đề thi và phiên bản mẫu

# 6. Khởi chạy môi trường phát triển (Dev Server)
npm run dev:quiz          # Khởi chạy Quiz Service (Port 3000)
npm run dev:auth          # Khởi chạy Auth Service (Port 3001)
npm run dev:web           # Khởi chạy Giao diện Thí sinh (quiz-web)
npm run dev:admin         # Khởi chạy Giao diện Quản trị (admin-web)
```

---

## 🧪 Kết Quả Kiểm Thử (Test Suites)

Toàn bộ **193 automated tests** thuộc cả 2 dịch vụ đều đạt trạng thái **PASS 100%**:

### 🧠 Quiz Service (144 tests)
- `services/quiz/tests/domain/authoring/quiz.spec.ts`: Quản lý trạng thái và phiên bản đề thi.
- `services/quiz/tests/domain/authoring/attempt-policy.spec.ts`: Chính sách giới hạn lượt thi và khôi phục ca thi.
- `services/quiz/tests/domain/delivery/attempt-state-machine.spec.ts`: FSM ca thi và kiểm soát thời gian.
- `services/quiz/tests/domain/delivery/attempt-manifest.spec.ts`: Bất biến xáo trộn câu hỏi và đáp án.
- `services/quiz/tests/scoring/scoring.spec.ts`: Các chiến lược tính điểm (Exact, Partial, Negative).
- `services/quiz/tests/security/sanitization-boundary.spec.ts`: Lọc dữ liệu nhạy cảm trước khi gửi client.
- `services/quiz/tests/security/principal-context.spec.ts`: Bảo vệ quyền sở hữu ca thi theo JWT.
- `services/quiz/tests/security/ownership-policy.spec.ts`: ABAC Ownership Policy cho đề thi và ca thi.
- `services/quiz/tests/delivery/drizzle-assessment-persistence.spec.ts`: Lưu trữ PostgreSQL Drizzle cho Delivery & Attempts.
- `services/quiz/tests/presentation/assessment-api.spec.ts`: RESTful API Endpoints (`/v1/quizzes`, `/v1/attempts`).
- `services/quiz/src/application/use-cases.spec.ts`: Quy trình nghiệp vụ soạn thảo và thi trọn vẹn trên PGlite.

### 🔐 Auth Service (49 tests)
- `services/auth/tests/auth.spec.ts`: Đăng ký, Đăng nhập, Hồ sơ cá nhân, Xoay vòng Refresh Token, Logout, Rate Limit brute-force và Khám phá khóa RFC 7517 JWKS.
- `services/auth/tests/rbac-admin-api.spec.ts`: Endpoints quản trị RBAC (CRUD Roles, Permissions, User Roles).
- `services/auth/tests/drizzle-persistence.spec.ts`: Kiểm tra lưu trữ PostgreSQL với Drizzle ORM và User Metadata (Zero-Tenant).
- `services/auth/tests/ownership.spec.ts`: Kiểm tra bảo vệ quyền hạn và sở hữu tài khoản.

### 📦 Client Packages Tests
- `packages/api-client/tests/api-client.spec.ts`: Type-Safe SDK Client cho Quiz Service.
- `packages/auth-client/tests/auth-client.spec.ts`: Auth Client SDK quản lý tokens và xác thực.
