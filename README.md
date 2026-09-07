# 🚀 Quiz Core: Assessment, Examination & Knowledge Taxonomy Platform

Hệ thống khảo thí, đánh giá năng lực trực tuyến và phân loại đề thi theo **Cây Tri Thức (Knowledge Taxonomy)** thế hệ mới. Toàn bộ nền tảng được xây dựng theo chuẩn **Monorepo PNPM**, áp dụng kiến trúc **Hexagonal Architecture (Ports & Adapters)** kết hợp **Domain-Driven Design (DDD)** trên nền tảng **TypeScript**, cơ sở dữ liệu **PostgreSQL** với **Drizzle ORM** và frontend hiện đại với **React 19** + **Tailwind CSS**.

Hệ thống được thiết kế theo mô hình **Unified HTTP Gateway (Port 3000)** tối ưu cho môi trường container/Cloud Run (chỉ duy nhất port 3000 được exposed ra bên ngoài), đồng thời từng dịch vụ lõi vẫn giữ nguyên tính tự chủ (autonomous microservices) có khả năng chạy độc lập trên các cổng riêng biệt.

---

## 🏛️ Cấu Trúc Monorepo (Project Structure)

```text
.
├── services/
│   ├── quiz/                         # 🧠 Core Assessment & Delivery Engine (Port 3000 Unified Gateway)
│   │   ├── drizzle/                  # Drizzle ORM Migrations & SQL DDL (Quizzes, Versions, Attempts)
│   │   ├── src/
│   │   │   ├── domain/               # Pure Business Logic (Framework-Agnostic)
│   │   │   │   ├── authoring/        # Sub-domain Quản lý & Soạn thảo đề thi (Quiz, Version, Policies)
│   │   │   │   ├── delivery/         # Sub-domain Tổ chức thi (Attempt, Manifest, Sanitizer)
│   │   │   │   ├── question-engine/  # Question Registry & Handlers (Single, Multi, True/False...)
│   │   │   │   ├── scoring/          # Chiến lược chấm điểm (Exact, Partial, Negative)
│   │   │   │   └── ports/            # Repository Interfaces & Secondary Ports
│   │   │   ├── application/          # Use Cases (AuthoringUseCases, DeliveryUseCases, SweeperService)
│   │   │   ├── infrastructure/       # Drizzle PostgreSQL Repositories & In-Process DI Factories
│   │   │   └── presentation/         # RESTful Routes (/v1/quizzes, /v1/attempts, /v1/internal, /v1/time)
│   │   └── tests/                    # 144+ Automated Tests (Domain, Security, Delivery, Timing, Sweeper)
│   │
│   ├── auth/                         # 🔐 Generic Identity Provider (IdP) Service (Port 3001)
│   │   ├── drizzle/                  # Drizzle ORM Migrations (Normalized RBAC & Token Storage)
│   │   ├── src/
│   │   │   ├── domain/               # User Entity (Zero-Tenant Clean-Cut) & Role/Permission Aggregates
│   │   │   ├── application/          # Use Cases (Register, Login, Profile, Refresh, Logout, RBAC Admin)
│   │   │   ├── infrastructure/       # Drizzle PostgreSQL Repositories, RS256/HS256 JWKS Token Service
│   │   │   └── presentation/         # RESTful Routes (/v1/auth, /v1/admin/rbac, /.well-known/jwks.json)
│   │   └── tests/                    # 49 Automated Tests (Core Auth, RBAC, RS256 JWKS, Persistence)
│   │
│   └── taxonomy/                     # 🌳 Autonomous Knowledge Catalog & Cây Tri Thức (Port 3002)
│       ├── drizzle/                  # Drizzle ORM Migrations (Taxonomies, Taxonomy Nodes)
│       ├── src/
│       │   ├── domain/               # Taxonomy & Node Entities, Cycle Prevention Errors, Ports
│       │   ├── application/          # Use Cases (GetTaxonomyTree, ManageNode, ManageTaxonomy, List)
│       │   ├── infrastructure/       # Drizzle Repositories (Adjacency List + Recursive CTEs)
│       │   └── presentation/         # RESTful Routes (/v1/taxonomies, /v1/nodes) & Standalone Server
│       └── tests/                    # 47 Automated Tests (Tree Hierarchy, Cycle Prevention, API)
│
├── packages/
│   ├── contracts/                    # 📦 Universal DTOs, Enums, ApiResponse<T>, Principal & Contracts
│   ├── api-client/                   # 📦 Unified Type-Safe SDK cho Quiz, Attempt & Taxonomy APIs
│   ├── auth-client/                  # 📦 Auth SDK quản lý phiên đăng nhập, JWT tokens & User Session
│   └── ui/                           # 📦 Shared Component Library & Theme Definitions
│
├── apps/
│   ├── quiz-web/                     # 🎓 Web App Khảo thí cho Thí sinh (React 19 + Tailwind CSS + Vite)
│   │   └── src/
│   │       ├── components/dashboard/ # TaxonomyTreeSidebar, QuizContentArea, StudentProfileModal
│   │       ├── components/runner/    # QuizHeader, QuizFooter, QuizTimer, QuestionPalette
│   │       ├── components/questions/ # 6 dạng câu hỏi (Single, Multi, FillIn, Matching, Numeric, Ordering)
│   │       ├── components/results/   # ScoreSummaryCard, QuestionFeedbackList
│   │       └── utils/                # TimeSyncManager (Cristian's Algorithm Server Drift Correction)
│   │
│   └── admin-web/                    # 🛠️ Web App Quản trị & Soạn thảo đề thi (React 19 + Tailwind CSS + Vite)
│       └── src/views/                # TaxonomyManagementSection, QuizManagementSection, Dashboard
│
├── guides/                           # 📖 Tài liệu hướng dẫn thiết lập & kết nối CSDL
│   ├── auth_postgres_setup_guide.md
│   └── quiz_postgres_setup_guide.md
├── plan/                             # 📋 Kế hoạch kỹ thuật & Kiến trúc chuyên sâu
│   └── taxonomy_services_plan.md
├── metadata.json                     # ⚙️ Metadata cấu hình ứng dụng AI Studio Build
└── README.md
```

---

## 🌐 Mô Hình Kiến Trúc Hợp Nhất (Port 3000 Unified Gateway)

Hệ thống được thiết kế theo kiến trúc **Unified HTTP Gateway** tại `services/quiz/src/presentation/server.ts` chạy trên **Port 3000**, thỏa mãn hoàn hảo ràng buộc cổng duy nhất của Google Cloud Run / Container:

```text
                                  ┌──────────────────────────────────────────────────────────┐
                                  │           INCOMING TRAFFIC (HTTP Port 3000)              │
                                  └─────────────────────────────┬────────────────────────────┘
                                                                │
                     ┌──────────────────────────────────────────┴──────────────────────────────────────────┐
                     │                                                                                     │
         [API Requests: /v1/*]                                                                    [Web SPA Static Hosting]
                     │                                                                                     │
    ┌────────────────┴────────────────────────┐                                            ┌───────────────┴───────────────┐
    │                                         │                                            │                               │
    ▼                                         ▼                                            ▼                               ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐    ┌───────────────────┐   ┌───────────────────┐
│     AUTH ROUTER       │ │   TAXONOMY ROUTER     │ │  QUIZ & ATTEMPT CORE  │    │  ADMIN WEB SPA    │   │  QUIZ WEB SPA     │
│  /v1/auth/*           │ │  /v1/taxonomies/*     │ │  /v1/quizzes/*        │    │  Route: /admin/*  │   │  Route: /*        │
│  /.well-known/jwks    │ │  /v1/nodes/*          │ │  /v1/attempts/*       │    │  (apps/admin-web) │   │  (apps/quiz-web)  │
│  (services/auth)      │ │  (services/taxonomy)  │ │  /v1/internal/*       │    └───────────────────┘   └───────────────────┘
│                       │ │                       │ │  /v1/time             │
│  Database: auth_db    │ │  Database: taxonomy_db│ │  Database: quiz_db    │
│  (AUTH_DATABASE_URL)  │ │  (TAXONOMY_DB_URL)    │ │  (QUIZ_DATABASE_URL)  │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

> **Tính Tự Chủ (Autonomy)**: Mỗi dịch vụ (`services/auth` cổng 3001, `services/taxonomy` cổng 3002) đều sở hữu mã nguồn khởi chạy `startServer()` độc lập, schema Drizzle riêng biệt và bộ kiểm thử khép kín, sẵn sàng tách thành microservices độc lập khi scale hệ thống.

---

## 🌟 Tính Năng & Điểm Nhấn Kỹ Thuật (Core Capabilities)

### 1. 🌳 Autonomous Knowledge Catalog & Cây Tri Thức (`services/taxonomy`)
- **Phân loại đa cấp không giới hạn**: Hỗ trợ phân loại cây phân cấp (Topic, Subject, Grade...) và phân loại phẳng (Difficulty, Tag) trên chuẩn **Adjacency List**.
- **PostgreSQL Recursive CTE**: Truy vấn toàn bộ cấu trúc cây lồng nhau (`nested tree`) hoặc lấy danh sách toàn bộ node con cháu (`descendant-ids`) với độ phức tạp tối ưu $O(N)$ trong 1 round-trip truy vấn.
- **Thuật toán Chống Chu Trình (Cycle Prevention)**: Khi di chuyển vị trí node (`moveNode`), hệ thống kiểm tra và chặn tuyệt đối việc biến một node thành con của chính nó hoặc con của các node hậu duệ trong nhánh của nó.
- **Breadcrumbs Navigation**: Tự động dựng đường dẫn từ root đến node hiện tại phục vụ hiển thị breadcrumb cho bài thi.
- **Liên kết trực tiếp với đề thi**: Bảng `quizzes` lưu `primary_node_id`, cho phép thí sinh duyệt đề theo cây phân mục và lọc đề theo node cha (tự động bao gồm đề thuộc tất cả node con).

### 2. 🧠 Assessment & Delivery Core (`services/quiz`)
- **Tách biệt Authoring và Delivery**:
  - **Authoring Sub-domain**: Quản lý vòng đời bài thi `DRAFT` ➜ `REVIEW` ➜ `PUBLISHED` ➜ `ARCHIVED`. Mỗi lần xuất bản tạo một `QuizVersion` Snapshot bất biến, chống sai lệch kết quả khi sửa đề.
  - **Delivery Sub-domain**: Khảo thí qua Aggregate Root `Attempt`. Cơ chế **AttemptManifest** đóng băng trật tự câu hỏi và thứ tự các đáp án đã xáo trộn riêng biệt cho từng thí sinh (reload trình duyệt không bị đổi đề).
- **Zero-Trust Timing Defense (Thuật toán Cristian's Algorithm)**:
  - Máy chủ là nguồn thời gian duy nhất (`Server-Authoritative Clock`).
  - Endpoint `/v1/time` và HTTP headers `X-Server-Time`, `X-Server-Timestamp`.
  - Frontend `TimeSyncManager` và hook `useServerCountdown` tự động bù trừ độ trễ mạng (RTT) và độ lệch đồng hồ máy khách (clock drift), ngăn chặn 100% hành vi hack đồng hồ hệ điều hành để gian lận thời gian làm bài.
- **Background Attempt Expiry Sweeper Daemon**:
  - `AttemptExpirySweeperService` chạy ngầm định kỳ (mỗi 30s) trên máy chủ, tự động quét, khóa bài và chấm điểm các ca thi quá hạn nộp bài kèm thời gian ân hạn (`gracePeriodMs = 15000ms`).
- **Question Engine Registry (Open-Closed Principle)**:
  - Hỗ trợ đa dạng 6 dạng thức câu hỏi: **Single Choice**, **Multiple Choice**, **True/False**, **Fill-in-the-blank**, **Matching**, **Numeric**.
- **Chiến lược chấm điểm linh hoạt**:
  - `ExactMatchScoringStrategy`: Đúng tuyệt đối được trọn điểm.
  - `PartialCreditScoringStrategy`: Cho điểm từng phần có trừ điểm khi chọn sai.
  - `NegativeMarkingScoringStrategy`: Phạt điểm khi đoán mò không chắc chắn.
- **DeliverySanitizer**: Bóc tách 100% đáp án đúng, barem điểm và giải thích chi tiết ngay tại ranh giới máy chủ trước khi truyền tới thí sinh.

### 3. 🔐 Generic Identity Provider (Zero-Tenant IdP) (`services/auth`)
- **Identity-Only Context**: Tách biệt hoàn toàn khỏi domain Quiz (không chứa `tenant_id`, hỗ trợ `metadata` JSONB lưu trữ avatar, preferences).
- **Mã Hóa Chuẩn RFC 7517 (JWKS RS256)**:
  - Cung cấp Public Keys tại `/.well-known/jwks.json` giúp Resource Servers xác thực token không đối xứng mà không cần gọi ngược về IdP.
  - Hỗ trợ cơ chế xoay vòng khóa (Key Rotation) và tương thích ngược với HS256.
- **Normalized RBAC**: 5 bảng chuẩn hóa (`users`, `roles`, `permissions`, `user_roles`, `role_permissions`).
- **Bảo Mật Tối Đa**: Chống brute-force rate limit (5 lần thử/phút), phát hiện tái sử dụng Refresh Token và thu hồi phiên tức thì.

### 4. 🗄️ Lưu Trữ PostgreSQL Bền Vững & Kiểm Thử Siêu Tốc
- **3 Cơ sở dữ liệu PostgreSQL độc lập**:
  - `auth_db`: Quản lý người dùng, RBAC, refresh tokens.
  - `quiz_db`: Quản lý đề thi, phiên bản, câu hỏi, ca thi, kết quả.
  - `taxonomy_db`: Quản lý phân loại tri thức, cây danh mục đa cấp.
- **Auto-Migration & Seeding**: Tự động chạy migration và nạp dữ liệu mẫu (quizzes, categories, admin/instructor/student accounts) ngay khi khởi động máy chủ nếu DB được cấu hình.
- **PGlite WebAssembly Testing**: Sử dụng `@electric-sql/pglite` chạy PostgreSQL trực tiếp trong tiến trình test — **100% kiểm thử tích hợp không cần Docker**, tốc độ vượt trội.

---

## 🔌 Danh Mục RESTful API v1 (API Reference)

### 🌳 1. Taxonomy & Knowledge Tree APIs (`/v1/taxonomies`, `/v1/nodes`)
| Phương thức | Đường dẫn | Phân quyền | Mô tả |
|---|---|---|---|
| `GET` | `/v1/taxonomies` | Public | Lấy danh sách tất cả loại phân loại (Topic, Difficulty, Tag...) |
| `GET` | `/v1/taxonomies/:codeOrId` | Public | Lấy thông tin chi tiết một taxonomy |
| `GET` | `/v1/taxonomies/:codeOrId/tree` | Public | Lấy toàn bộ cây phân cấp lồng nhau (Hỗ trợ ETag caching) |
| `POST` | `/v1/taxonomies` | ADMIN | Tạo mới một taxonomy |
| `PUT` | `/v1/taxonomies/:codeOrId` | ADMIN | Cập nhật thông tin taxonomy |
| `POST` | `/v1/taxonomies/:codeOrId/nodes` | ADMIN | Thêm node mới vào cây (root hoặc node con) |
| `GET` | `/v1/nodes/:id` | Public | Lấy chi tiết thông tin node |
| `PUT` | `/v1/nodes/:id` | ADMIN | Cập nhật metadata, tên, mô tả node |
| `POST` | `/v1/nodes/:id/move` | ADMIN | Di chuyển vị trí nhánh node (có thuật toán chống chu trình) |
| `DELETE` | `/v1/nodes/:id` | ADMIN | Xóa mềm (soft delete) node |
| `GET` | `/v1/nodes/:id/descendant-ids` | Public | Lấy danh sách ID toàn bộ node con cháu (dùng lọc đề thi) |
| `GET` | `/v1/nodes/:id/breadcrumbs` | Public | Lấy đường dẫn từ root đến node hiện tại |

### 📋 2. Quiz Authoring & Catalog APIs (`/v1/quizzes`)
| Phương thức | Đường dẫn | Phân quyền | Mô tả |
|---|---|---|---|
| `GET` | `/v1/quizzes` | Public | Lấy danh sách đề thi đã xuất bản (hỗ trợ lọc theo `primaryNodeId`) |
| `POST` | `/v1/quizzes` | INSTRUCTOR/ADMIN | Tạo mới đề thi ở trạng thái bản nháp (`DRAFT`) |
| `GET` | `/v1/quizzes/:id` | Public | Xem chi tiết thông tin và các phiên bản của đề thi |
| `POST` | `/v1/quizzes/:id/versions` | INSTRUCTOR/ADMIN | Tạo phiên bản mới (`QuizVersion`) cho đề thi |
| `POST` | `/v1/quizzes/:id/publish` | INSTRUCTOR/ADMIN | Xuất bản đề thi theo phiên bản chỉ định |

### 🎯 3. Quiz Delivery APIs (`/v1/attempts`)
| Phương thức | Đường dẫn | Phân quyền | Mô tả |
|---|---|---|---|
| `POST` | `/v1/attempts` | Thí sinh | Tạo mới hoặc khôi phục ca thi của thí sinh |
| `POST` | `/v1/attempts/:id/start` | Thí sinh | Bắt đầu tính giờ & nhận đề thi đã khử khuẩn (`Sanitized Manifest`) |
| `GET` | `/v1/attempts/:id` | Thí sinh | Xem tiến độ ca thi hiện tại |
| `PUT` | `/v1/attempts/:id/answers/:questionId` | Thí sinh | Lưu câu trả lời từng câu (kèm timestamp kiểm soát tính lũy tiến) |
| `POST` | `/v1/attempts/:id/submit` | Thí sinh | Khóa bài thi, tính điểm chính thức và trả về kết quả |

### ⏱️ 4. Server Timing & Internal Daemon APIs
| Phương thức | Đường dẫn | Header/Phân quyền | Mô tả |
|---|---|---|---|
| `GET` | `/v1/time` | Public | Lấy thời gian chuẩn máy chủ phục vụ đồng bộ Cristian's Algorithm |
| `POST` | `/v1/internal/attempts/sweep` | `x-internal-secret` | Kích hoạt quét tức thì các ca thi hết hạn |
| `GET` | `/v1/internal/attempts/sweeper-status`| `x-internal-secret` | Kiểm tra trạng thái hoạt động của daemon sweeper |

### 🔐 5. Authentication & Identity APIs (`/v1/auth`)
| Phương thức | Đường dẫn | Phân quyền | Mô tả |
|---|---|---|---|
| `POST` | `/v1/auth/register` | Public | Đăng ký tài khoản người dùng mới |
| `POST` | `/v1/auth/login` | Public | Đăng nhập (bảo vệ chống brute-force 5 lần/phút) |
| `GET` | `/v1/auth/me` | Logged In | Lấy thông tin hồ sơ và quyền hạn người dùng hiện tại |
| `POST` | `/v1/auth/refresh` | Logged In | Làm mới Access Token với tính năng xoay vòng Refresh Token |
| `POST` | `/v1/auth/logout` | Logged In | Đăng xuất và thu hồi Refresh Token |
| `GET` | `/.well-known/jwks.json` | Public | Khám phá Public Keys ký JWT theo chuẩn RFC 7517 JWKS |

---

## 🛠️ Hướng Dẫn Cài Đặt & Khởi Chạy (Getting Started)

### 1. Yêu cầu môi trường
- **Node.js**: >= 18.0.0 (khuyến nghị Node 20+)
- **npm** hoặc **pnpm**
- **PostgreSQL**: Phiên bản >= 14 (cho môi trường production hoặc staging)

### 2. Cấu hình biến môi trường (`.env`)
Hệ thống **tuân thủ nghiêm ngặt cấu hình tập trung từ `.env` (Single Source of Truth, loại bỏ hoàn toàn cơ chế hardcoded fallback ngầm)**. Sao chép từ `.env.example` và cấu hình:
```env
# Cơ sở dữ liệu PostgreSQL cho từng dịch vụ
AUTH_DATABASE_URL=postgres://postgres:root@localhost:5432/auth_db
QUIZ_DATABASE_URL=postgres://postgres:root@localhost:5432/quiz_db
TAXONOMY_DATABASE_URL=postgres://postgres:root@localhost:5432/taxonomy_db

# Bảo mật JWT (Khóa bí mật hoặc cặp khóa RS256)
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long_for_security

# Cổng khởi chạy dịch vụ (Bắt buộc cấu hình trong .env)
QUIZ_PORT=3000
AUTH_PORT=3001
TAXONOMY_PORT=3002
```

### 3. Cài đặt dependencies
```bash
npm install
```

### 4. Quản lý Cơ sở dữ liệu (Migrations & Seeding)
Hệ thống hỗ trợ Drizzle CLI migration và file seed chuyên biệt cho từng dịch vụ:
```bash
# Auth Service DB
npm run db:migrate:auth       # Chạy migration bảng users, roles, permissions
npm run db:seed:auth          # Nạp tài khoản mẫu (admin@quiz.com, instructor@quiz.com, student@quiz.com)

# Quiz Service DB
npm run db:migrate:quiz       # Chạy migration bảng quizzes, quiz_versions, attempts
npm run db:seed:quiz          # Nạp 7 đề thi mẫu đa dạng các chủ đề Toán, Tin học, Tiếng Anh

# Taxonomy Service DB
npm run db:migrate:taxonomy   # Chạy migration bảng taxonomies, taxonomy_nodes
npm run db:seed:taxonomy      # Nạp cây tri thức phân cấp mẫu
```

### 5. Khởi chạy ứng dụng

#### 🌟 Chế độ Unified Gateway (Khuyến nghị - Chuẩn Cloud Run cổng 3000)
Khởi chạy toàn bộ hệ thống (APIs, Backend Services và Frontend SPAs) trên cổng **3000**:
```bash
npm run dev
# hoặc
npm start
```
Sau khi khởi chạy:
- **Giao diện làm bài cho Thí sinh (Quiz Web)**: `http://localhost:3000/`
- **Giao diện Quản trị & Soạn thảo (Admin Web)**: `http://localhost:3000/admin/`
- **Discovery API & Healthcheck**: `http://localhost:3000/api` và `http://localhost:3000/health`

#### 🛠️ Chế độ Phát triển từng thành phần (Standalone Dev)
```bash
npm run dev:quiz       # Khởi chạy Quiz Core Gateway (Port 3000)
npm run dev:auth       # Khởi chạy Auth Service riêng lẻ (Port 3001)
npm run dev:taxonomy   # Khởi chạy Taxonomy Service riêng lẻ (Port 3002)
npm run dev:web        # Khởi chạy Vite dev server cho Quiz Web
npm run dev:admin      # Khởi chạy Vite dev server cho Admin Web
```

---

## 🧪 Kết Quả Kiểm Thử Tự Động (Automated Test Suites)

Toàn bộ **hơn 260 tests** trên toàn bộ các services, packages và frontend đều đạt trạng thái **PASS 100%**:

```bash
npm test
```

### 1. 🌳 Taxonomy Service Tests (`services/taxonomy/tests`) — 47 tests
- `taxonomy.spec.ts`: Kiểm tra tạo taxonomy, gán node, dựng cây $O(N)$ và truy vấn hậu duệ qua Recursive CTE.
- `api.spec.ts`: Kiểm tra toàn bộ RESTful endpoints, CORS, ETag caching và SDK integration.
- `cycle-prevention.spec.ts`: Kiểm tra cơ chế chặn tự tham chiếu và chặn chuyển node vào cây con của chính nó.
- `tree-structure.spec.ts`: Kiểm tra tính toàn vẹn cấu trúc cây, thứ tự sắp xếp (`sort_order`) và breadcrumbs.

### 2. 🧠 Quiz Service Tests (`services/quiz/tests`) — 144+ tests
- `domain/authoring/quiz.spec.ts`: Vòng đời bài thi và snapshot phiên bản bất biến.
- `domain/authoring/quiz-primary-node.spec.ts`: Phân loại đề thi vào node Cây tri thức (`primaryNodeId`).
- `domain/delivery/attempt-state-machine.spec.ts`: FSM trạng thái ca thi và kiểm soát chuyển trạng thái.
- `domain/delivery/attempt-manifest.spec.ts`: Bất biến xáo trộn câu hỏi và đáp án cho thí sinh.
- `domain/delivery/server-timing-invariants.spec.ts`: Độ chính xác đồng hồ máy chủ và tính toán thời gian hết hạn.
- `scoring/scoring.spec.ts`: Các chiến lược tính điểm (Exact, Partial, Negative).
- `security/sanitization-boundary.spec.ts`: Khử khuẩn ranh giới máy chủ, bảo vệ đáp án đúng.
- `security/principal-context.spec.ts` & `ownership-policy.spec.ts`: Kiểm soát quyền truy cập đề thi và ca thi (ABAC).
- `delivery/attempt-expiry-sweeper.spec.ts` & `presentation/sweeper-api.spec.ts`: Quét ngầm và tự động đóng ca thi quá hạn.
- `delivery/drizzle-assessment-persistence.spec.ts`: Lưu trữ bền vững trên PostgreSQL với Drizzle ORM.
- `presentation/assessment-api.spec.ts` & `presentation/server-timing-api.spec.ts`: RESTful endpoints và Cristian's sync.

### 3. 🔐 Auth Service Tests (`services/auth/tests`) — 49 tests
- `auth.spec.ts`: Đăng ký, Đăng nhập, Profile, Refresh Token rotation, Logout, Rate Limit và JWKS.
- `rbac-admin-api.spec.ts`: Endpoints quản trị RBAC (CRUD Roles, Permissions, gán quyền User).
- `drizzle-persistence.spec.ts`: Lưu trữ PostgreSQL và trường Metadata JSONB (Zero-Tenant IdP).
- `ownership.spec.ts` & `refresh-token-reuse.spec.ts`: Kiểm tra thu hồi token khi bị phát hiện tái sử dụng.

### 4. 📦 Packages & Web Apps Tests
- `packages/api-client/tests/api-client.spec.ts`: Type-safe SDK client gọi Quiz và Taxonomy APIs.
- `packages/auth-client/tests/auth-client.spec.ts`: Auth Client SDK quản lý phiên và cookie.
- `apps/quiz-web/tests/`: Kiểm tra thuật toán đồng bộ thời gian máy chủ (`time-sync.spec.ts`), đếm ngược (`countdown.spec.ts`), và tính đồng thời API (`quiz-api-concurrency.spec.ts`).

---

## 👥 Tài Khoản Mẫu Mặc Định (Default Seed Accounts)

Sau khi chạy `npm run db:seed:auth` hoặc khi hệ thống auto-seed, các tài khoản sau sẵn sàng sử dụng:

| Vai trò (Role) | Email | Mật khẩu | Quyền hạn |
|---|---|---|---|
| **Quản Trị Viên (ADMIN)** | `admin@quiz.com` | `Admin@123456` | Quản trị toàn hệ thống, quản lý Cây Tri Thức, quản lý RBAC |
| **Giảng Viên (INSTRUCTOR)** | `instructor@quiz.com` | `Instructor@123456` | Soạn thảo, quản lý và xuất bản đề thi của mình |
| **Thí Sinh (STUDENT)** | `student@quiz.com` | `Student@123456` | Khảo thí trực tuyến, làm bài thi và xem kết quả điểm số |

