# 🚀 Quiz Core: Microservices Assessment, Examination & Knowledge Taxonomy Platform

Hệ thống Khảo thí Trực tuyến, Đánh giá Năng lực và Phân loại Đề thi theo **Cây Tri Thức (Knowledge Taxonomy)** thế hệ mới. Nền tảng được xây dựng theo chuẩn **Monorepo PNPM Workspace**, áp dụng triệt để kiến trúc **Hexagonal Architecture (Ports & Adapters)** kết hợp **Domain-Driven Design (DDD)** trên nền tảng **TypeScript**, cơ sở dữ liệu **PostgreSQL** với **Drizzle ORM** (mô hình **Database-per-Service** với 6 CSDL độc lập) và giao diện người dùng hiện đại với **React 19** + **Tailwind CSS**.

Sau khi hoàn tất kế hoạch phân rã nghiệp vụ khảo thí (**Quiz Decomposition Plan**), hệ thống đã bóc tách toàn diện khối xử lý nguyên khối cũ thành **6 Microservices độc lập**, vận hành thông qua tầng **API Gateway & Reverse Proxy (Port 3000)** thống nhất, tối ưu hóa tuyệt đối cho môi trường container và Cloud Run.

---

## 🏛️ Cấu Trúc Monorepo (Project Structure)

```text
.
├── services/
│   ├── gateway/                      # 🚪 API Gateway & Unified Reverse Proxy (Port 3000)
│   │   ├── src/
│   │   │   ├── middlewares/          # Auth Context & Normalized RBAC Middlewares
│   │   │   ├── server.ts             # Gateway Entrypoint, Dynamic Routers & Static SPA Hosting
│   │   │   └── index.ts
│   │   └── tests/                    # 17+ Gateway Integration & Discovery Tests
│   │
│   ├── question/                     # 📚 Autonomous Question Bank Service (Port 3003)
│   │   ├── drizzle/                  # Migrations (questions, question_revisions)
│   │   ├── src/
│   │   │   ├── domain/               # Question Entity, Revisions, Bloom Taxonomy, Ports
│   │   │   ├── application/          # Use Cases (Create, Update, Revision, List, Filter)
│   │   │   ├── infrastructure/       # Drizzle Repositories (PostgreSQL question_db)
│   │   │   └── presentation/         # RESTful Routes (/v1/questions) & Standalone Server
│   │   └── tests/                    # Tests CRUD, Bloom Difficulty Filter, KaTeX/Media
│   │
│   ├── assessment/                   # 📐 Autonomous Assessment Blueprint Service (Port 3004)
│   │   ├── drizzle/                  # Migrations (assessments, blueprints)
│   │   ├── src/
│   │   │   ├── domain/               # Assessment Entity, Blueprint Matrix, Scoring Policies
│   │   │   ├── application/          # Use Cases (Create, Blueprint Matrix, Lock, Lifecycle)
│   │   │   ├── infrastructure/       # Drizzle Repositories (PostgreSQL assessment_db)
│   │   │   └── presentation/         # RESTful Routes (/v1/assessments) & Standalone Server
│   │   └── tests/                    # Tests Blueprint Matrix, Policy Validation, Persistence
│   │
│   ├── exam/                         # ⚙️ Autonomous Exam Engine Service (Port 3005)
│   │   ├── drizzle/                  # Migrations (exams, exam_snapshots)
│   │   ├── src/
│   │   │   ├── domain/               # Exam Aggregate, MatrixSolver, PRNG Shuffler, Ports
│   │   │   ├── application/          # Use Cases (GenerateExam, VariantGenerator, Snapshots)
│   │   │   ├── infrastructure/       # Drizzle Repositories (PostgreSQL exam_db), Adapters
│   │   │   └── presentation/         # RESTful Routes (/v1/exams) & Standalone Server
│   │   └── tests/                    # Tests Matrix Solver, Mulberry32 PRNG, SHA-256 Freeze
│   │
│   ├── attempt/                      # ⏱️ Autonomous Candidate Attempt Engine (Port 3006)
│   │   ├── drizzle/                  # Migrations (attempts, attempt_events)
│   │   ├── src/
│   │   │   ├── domain/               # Attempt Aggregate, FSM, Scoring Engine, Sweeper
│   │   │   ├── application/          # Use Cases (Start, Autosave, Submit, AntiCheat Telemetry)
│   │   │   ├── infrastructure/       # Drizzle Repositories (PostgreSQL attempt_db), Direct Adapters
│   │   │   └── presentation/         # RESTful Routes (/v1/attempts, /v1/internal) & Server
│   │   └── tests/                    # Tests Autosave (<25ms), FSM, Sweeper, Auto-Grading
│   │
│   ├── auth/                         # 🔐 Generic Identity Provider (IdP) Service (Port 3001)
│   │   ├── drizzle/                  # Migrations (Normalized RBAC: users, roles, permissions)
│   │   ├── src/
│   │   │   ├── domain/               # User Entity (Zero-Tenant), Role & Permission Aggregates
│   │   │   ├── application/          # Use Cases (Register, Login, Profile, Refresh, Logout, RBAC)
│   │   │   ├── infrastructure/       # Drizzle Repositories (PostgreSQL auth_db), RS256 JWKS
│   │   │   └── presentation/         # RESTful Routes (/v1/auth, /.well-known/jwks.json)
│   │   └── tests/                    # Tests Core Auth, RBAC Admin, RS256 JWKS, Persistence
│   │
│   └── taxonomy/                     # 🌳 Autonomous Knowledge Catalog & Cây Tri Thức (Port 3002)
│       ├── drizzle/                  # Migrations (taxonomies, taxonomy_nodes)
│       ├── src/
│       │   ├── domain/               # Taxonomy & Node Entities, Cycle Prevention Errors, Ports
│       │   ├── application/          # Use Cases (GetTaxonomyTree, ManageNode, ManageTaxonomy)
│       │   ├── infrastructure/       # Drizzle Repositories (PostgreSQL taxonomy_db, Recursive CTE)
│       │   └── presentation/         # RESTful Routes (/v1/taxonomies, /v1/nodes) & Server
│       └── tests/                    # Tests Tree Hierarchy O(N), Cycle Prevention, Grade Taxonomies
│
├── packages/
│   ├── contracts/                    # 📦 Universal TypeScript DTOs, Enums, API Interfaces
│   ├── api-client/                   # 📦 Type-Safe Client SDK cho toàn bộ Microservices
│   ├── auth-client/                  # 📦 Auth SDK quản lý phiên đăng nhập, JWT tokens & Cookies
│   └── ui/                           # 📦 Shared UI Component Library & Themes
│
├── apps/
│   ├── quiz-web/                     # 🎓 Web App Khảo thí cho Thí sinh (React 19 + Tailwind CSS + Vite)
│   │   └── src/
│   │       ├── components/dashboard/ # TaxonomyTreeSidebar, QuizContentArea, StudentProfileModal
│   │       ├── components/runner/    # QuizHeader, QuizFooter, QuizTimer, QuestionPalette
│   │       ├── components/questions/ # 6 dạng thức câu hỏi (Single, Multi, FillIn, Matching, Numeric, Ordering)
│   │       ├── components/results/   # ScoreSummaryCard, QuestionFeedbackList
│   │       └── utils/                # TimeSyncManager (Cristian's Algorithm Server Drift Correction)
│   │
│   └── admin-web/                    # 🛠️ Web App Quản trị & Khảo thí Giảng viên (React 19 + Tailwind CSS)
│       └── src/views/                # QuestionManagement, AssessmentManagement, ExamManagement, TaxonomyManagement
│
├── scripts/
│   └── bootstrap-clean-data.ts       # 🚀 Master Clean Bootstrap Script (Khởi tạo dữ liệu sạch 6 services)
├── guides/                           # 📖 Tài liệu hướng dẫn thiết lập & kết nối CSDL
│   ├── auth_postgres_setup_guide.md
│   └── bootstrap_clean_data_guide.md
├── plan/                             # 📋 Kế hoạch kỹ thuật & Kiến trúc chuyên sâu
│   ├── quiz_decomposition_plan.md    # Kế hoạch phân tách Quiz Service thành 4 Microservices (Hoàn thành)
│   ├── grade_taxonomy_plan.md        # Kế hoạch tích hợp Khối Lớp vào Cây Tri Thức
│   └── taxonomy_services_plan.md     # Kế hoạch kiến trúc Taxonomy Service
├── tests/                            # 🧪 Kiểm thử Tích hợp Toàn diện (E2E & Load Concurrency)
│   ├── e2e-quiz-decomposition.spec.ts# Toàn trình Authoring -> Exam -> Attempt -> Autosave -> Grading
│   └── load-and-concurrency.spec.ts  # Kiểm thử tải cao autosave đồng thời & sequence anti-tamper
├── metadata.json                     # ⚙️ Metadata cấu hình ứng dụng AI Studio Build
└── README.md
```

---

## 🌐 Mô Hình Kiến Trúc Hợp Nhất (Port 3000 Unified Gateway)

Hệ thống được thiết kế theo kiến trúc **Unified HTTP Gateway** tại `services/gateway/src/server.ts` lắng nghe trên **Port 3000** (cổng duy nhất được công khai trong môi trường Cloud Run / Container). Gateway đóng vai trò Reverse Proxy, đồng bộ đồng hồ máy chủ, bóc tách Auth Context và điều phối request trực tiếp tới các dịch vụ:

```text
                                  ┌──────────────────────────────────────────────────────────┐
                                  │           INCOMING TRAFFIC (HTTP Port 3000)              │
                                  └─────────────────────────────┬────────────────────────────┘
                                                                │
                     ┌──────────────────────────────────────────┴──────────────────────────────────────────┐
                     │                                                                                     │
         [API Requests: /v1/*]                                                                    [Web SPA Static Hosting]
                     │                                                                                     │
    ┌────────────────┴──────────────────────────────────────────────────────┐                      ┌───────────────┴───────────────┐
    │                                                                       │                      │                               │
    ▼                                                                       ▼                      ▼                               ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────┐┌───────────────────┐ ┌───────────────────┐
│     AUTH ROUTER       │ │   TAXONOMY ROUTER     │ │   QUESTION ROUTER     │ │ ASSESSMENT ROUTER ││  ADMIN WEB SPA    │ │  QUIZ WEB SPA     │
│  /v1/auth/*           │ │  /v1/taxonomies/*     │ │  /v1/questions/*      │ │ /v1/assessments/* ││  Route: /admin/*  │ │  Route: /*        │
│  /.well-known/jwks    │ │  /v1/nodes/*          │ │  (services/question)  │ │ (services/assess.)││  (apps/admin-web) │ │  (apps/quiz-web)  │
│  (services/auth)      │ │  (services/taxonomy)  │ │  Database:            │ │ Database:         │└───────────────────┘ └───────────────────┘
│  Database: auth_db    │ │  Database: taxonomy_db│ │    question_db        │ │   assessment_db   │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘ └───────────────────┘
    │                                                                       │
    ▼                                                                       ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌─────────────────────────────────────────────┐
│      EXAM ROUTER      │ │    ATTEMPT ROUTER     │ │   PRECISION CLOCK & HEALTHCHECK ROUTER      │
│  /v1/exams/*          │ │  /v1/attempts/*       │ │   /v1/time (Cristian's Algorithm Target)    │
│  (services/exam)      │ │  /v1/internal/*       │ │   /health  (6 Microservices DB Status)      │
│  Database: exam_db    │ │  (services/attempt)   │ │   /api     (Discovery OpenAPI Contract)     │
│                       │ │  Database: attempt_db │ │                                             │
└───────────────────────┘ └───────────────────────┘ └─────────────────────────────────────────────┘
```

> **Tính Tự Chủ (Service Autonomy)**: Từng microservice (`auth` 3001, `taxonomy` 3002, `question` 3003, `assessment` 3004, `exam` 3005, `attempt` 3006) đều sở hữu mã nguồn khởi chạy `server.ts` độc lập, schema Drizzle riêng biệt, connection pool tối ưu riêng và bộ kiểm thử khép kín, sẵn sàng chạy phân tán trên các container/cluster độc lập.

---

## 🌟 Đặc Tả 6 Microservices Chuyên Biệt

### 1. 📊 Bảng So Sánh Đặc Tính Kỹ Thuật

| Microservice | Vai Trò Nghiệp Vụ Cốt Lõi | Đặc Tính Tải (Workload) | R/W Ratio | SLA / Latency | CSDL Độc Lập |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth Service** | Quản trị tài khoản, phát hành RS256 JWKS Token, phân quyền RBAC đa cấp | Bảo mật cao / Read-Mostly (Verify) | 90% Đọc / 10% Ghi | p95 < 50ms | `auth_db` |
| **Taxonomy Service** | Cây tri thức đa cấp, Recursive CTE, chống chu trình (Cycle Prevention) | Read-Heavy (Duyệt cây, lọc bài) | 95% Đọc / 5% Ghi | p95 < 40ms | `taxonomy_db` |
| **Question Bank** | Ngân hàng câu hỏi, KaTeX/LaTeX, Revisions, phân loại Bloom & Topic | Read-Heavy (Soạn thảo, tra cứu) | 85% Đọc / 15% Ghi | p95 < 80ms | `question_db` |
| **Assessment Service**| Khung đề thi (Blueprint), ma trận tiêu chí Bloom, chính sách chấm điểm | Business Logic / Low-Write | 95% Đọc / 5% Ghi | p95 < 60ms | `assessment_db` |
| **Exam Engine** | Sinh đề qua `MatrixSolver`, xáo trộn hạt giống (PRNG), đóng băng SHA-256 | **CPU-Bound / Heavy Compute** | 40% Đọc / 50% Tính / 10% Ghi | p95 < 300ms | `exam_db` |
| **Attempt Engine** | Quản lý ca thi, autosave lũy tiến, telemetry chống gian lận, auto-grading | **Ultra High-Write & Low Latency** | 80% Ghi / 20% Đọc | **p99 < 25ms** | `attempt_db` |

---

### 2. Chi Tiết Tính Năng Từng Dịch Vụ

#### 📚 Question Service (`@platform/question-service` - Port 3003)
- **Item Bank Độc Lập**: Quản lý câu hỏi tập trung không phụ thuộc vào bất kỳ đề thi cụ thể nào.
- **Đa Dạng Loại Câu Hỏi**: Single Choice, Multiple Choice, Fill-in-the-blank, Matching (Ghép đôi), Numeric (Số học), Ordering (Sắp xếp).
- **Rich Content & Toán Học**: Hỗ trợ đầy đủ cú pháp KaTeX/LaTeX ($$...$$), định dạng Markdown, nhúng hình ảnh/video/audio assets.
- **Lịch Sử Phiên Bản (Question Revisions)**: Mỗi lần cập nhật nội dung sẽ tự động tạo `question_revisions` mới với số hiệu tăng dần, đảm bảo các kỳ thi đã diễn ra trong quá khứ không bị sai lệch dữ liệu.
- **Gắn Nhãn Đa Chiều**: Phân loại theo Khối lớp (`gradeNodeId`), Chủ đề (`topicNodeId`), và Thang đo tư duy Bloom (`REMEMBER`, `UNDERSTAND`, `APPLY`, `ANALYZE`).

#### 📐 Assessment Service (`@platform/assessment-service` - Port 3004)
- **Đặc Tả Ma Trận Đề Thi (Blueprint Matrix)**: Định nghĩa cấu trúc chuẩn cho đề thi (ví dụ: cần 20 câu Nhận biết, 15 câu Thông hiểu, 10 câu Vận dụng, 5 câu Vận dụng cao theo từng Node chuyên môn).
- **Chính Sách Điểm Số Linh Hoạt (Scoring Policies)**:
  - `STANDARD`: Đúng câu nào ăn trọn điểm câu đó.
  - `PARTIAL`: Cho điểm từng phần đối với câu nhiều đáp án hoặc ghép đôi.
  - `NEGATIVE`: Trừ điểm phạt khi chọn sai nhằm triệt tiêu hành vi đoán mò.
- **Chính Sách Khảo Thí (Attempt Policies)**: Cấu hình thời lượng làm bài (`durationMinutes`), điểm chuẩn đạt (`passingPercentage`), số lần làm bài tối đa (`maxAttempts`).
- **Khóa Bản Cương (Blueprint Locking)**: Cơ chế khóa ma trận sau khi phê duyệt để ngăn chặn sửa đổi ngoài ý muốn.

#### ⚙️ Exam Service (`@platform/exam-service` - Port 3005)
- **Động Cơ Giải Ma Trận Ràng Buộc (Matrix Constraint Solver)**: Đọc Blueprint từ Assessment Service, truy vấn ngân hàng từ Question Service và áp dụng thuật toán chọn lọc ngẫu nhiên có trọng số nhằm tạo nên đề thi hoàn chỉnh.
- **Thuật Toán Xáo Trộn Hạt Giống (Deterministic PRNG Shuffle - Mulberry32)**:
  - Sử dụng thuật toán Fisher-Yates kết hợp Pseudo-Random Number Generator.
  - Với cùng một `seed` (hoặc `studentId + examCode`), trật tự câu hỏi và phương án được xáo trộn ngẫu nhiên nhưng có thể **tái lập chính xác 100%** khi phúc khảo hoặc chấm thi.
- **Đóng Băng Bất Biến (Immutable Exam Snapshot Freeze & SHA-256)**:
  - Toàn bộ nội dung câu hỏi, phương án, điểm số được đóng gói thành Snapshot bất biến, băm mã định danh SHA-256.
  - Sau khi Snapshot được sinh, mọi sửa đổi trong Question Bank sẽ **không bao giờ** làm thay đổi nội dung của kỳ thi đã phát hành.
- **Sinh Biến Thể Mã Đề (Variant Generator)**: Tự động phát sinh các mã đề khác nhau (Mã 101, 102, 103, 104...) cho cùng một bài thi.
- **Khử Khuẩn Dữ Liệu Phát Đề (Sanitized Manifest)**: Loại bỏ hoàn toàn cờ `isCorrect`, lời giải chi tiết và barem điểm trước khi truyền tới giao diện thí sinh.

#### ⏱️ Attempt Service (`@platform/attempt-service` - Port 3006)
- **Máy Trạng Thái Ca Thi (FSM)**: Quản lý vòng đời chặt chẽ: `CREATED` ➔ `IN_PROGRESS` ➔ `PAUSED` ➔ `SUBMITTED` ➔ `EVALUATED` / `EXPIRED`.
- **Lưu Nháp Siêu Tốc (Ultra Low-Latency Autosave < 25ms)**:
  - Tiếp nhận câu trả lời từng câu với số thứ tự tăng dần (`sequenceNumber`) và timestamp máy chủ.
  - Phòng vệ chống ghi đè do trễ mạng (Outdated Sequence Defense).
- **Đồng Bộ Thời Gian Chuẩn Xác (Cristian's Algorithm)**:
  - Máy chủ là nguồn thời gian duy nhất (`Server-Authoritative Clock`).
  - Bù trừ độ trễ mạng $RTT / 2$ và độ lệch đồng hồ máy khách (clock drift), ngăn chặn hoàn toàn gian lận bằng cách chỉnh giờ máy tính.
- **Audit Log Chống Gian Lận (Anti-Cheat Telemetry Ingestion)**:
  - Ghi nhận liên tục chuỗi sự kiện `tab-switch`, `window-blur`, `fullscreen-exit`, `paste-detected` vào bảng `attempt_events`.
- **Background Expiry Sweeper Daemon**:
  - Tiến trình ngầm định kỳ quét và cưỡng chế nộp bài các ca thi quá hạn nộp bài kèm thời gian ân hạn (`gracePeriodMs = 15000ms`).
- **Động Cơ Chấm Điểm Tự Động (Auto-Grading Execution)**:
  - Chấm điểm ngay lập tức sau khi nộp bài dựa trên Frozen Snapshot từ Exam Service.
  - Tính toán điểm tổng, tỷ lệ phần trăm, trạng thái Đạt/Không đạt và bảng điểm chi tiết từng câu.

#### 🔐 Auth Service (`@platform/auth-service` - Port 3001)
- **Generic Zero-Tenant IdP**: Quản lý danh tính độc lập, hỗ trợ `metadata` JSONB mở rộng.
- **Chuẩn Mã Hóa RFC 7517 (JWKS RS256)**: Public Keys tại `/.well-known/jwks.json` cho phép các microservices xác thực chữ ký token mà không cần gọi ngược về IdP.
- **Normalized RBAC**: 5 bảng chuẩn hóa (`users`, `roles`, `permissions`, `user_roles`, `role_permissions`).

#### 🌳 Taxonomy Service (`@platform/taxonomy-service` - Port 3002)
- **Phân Loại Đa Cấp Không Giới Hạn**: Quản lý chủ đề, môn học, khối lớp theo cấu trúc **Adjacency List**.
- **PostgreSQL Recursive CTE**: Dựng toàn bộ cây danh mục $O(N)$ và truy vấn toàn bộ con cháu trong 1 round-trip.
- **Thuật Toán Chống Chu Trình (Cycle Prevention)**: Ngăn chặn tuyệt đối việc di chuyển một node thành con của chính nó hoặc hậu duệ của nó.

---

## 🗄️ Thiết Kế Cơ Sở Dữ Liệu PostgreSQL Độc Lập (Database-per-Service)

### 1. Nguyên Tắc Thiết Kế CSDL
1. **100% PostgreSQL Thật (psql)**: Tuyệt đối không dùng in-memory mocks hay sqlite giả lập.
2. **Fail-Fast Connection**: Dịch vụ dừng ngay lập tức nếu thiếu biến môi trường kết nối database tương ứng.
3. **URL Sanitization**: Tự động lọc bỏ tham số không hợp lệ `?schema=public` trong PostgreSQL StartupMessage.
4. **Zero Cross-Database Foreign Keys**: Không tạo khóa ngoại vật lý giữa các database khác nhau; liên kết logic thông qua Prefixed String IDs:
   - `usr_...`: Tài khoản người dùng (Auth)
   - `tax_...`, `node_...`: Danh mục & Node cây tri thức (Taxonomy)
   - `q_...`, `qrev_...`: Câu hỏi & Phiên bản câu hỏi (Question Bank)
   - `asm_...`, `bp_...`: Bài đánh giá & Khung ma trận đề (Assessment)
   - `exm_...`, `exv_...`, `snp_...`: Đề thi, Biến thể đề & Snapshot đóng băng (Exam)
   - `att_...`, `evt_...`: Ca thi & Sự kiện telemetry chống gian lận (Attempt)

### 2. Danh Mục 6 Cơ Sở Dữ Liệu

| Service | Database PostgreSQL | Biến Môi Trường (.env) | Nội Dung Quản Lý |
|---|---|---|---|
| **Auth** | `auth_db` | `AUTH_DATABASE_URL` | Bảng `users`, `roles`, `permissions`, `user_roles`, `role_permissions` |
| **Taxonomy** | `taxonomy_db` | `TAXONOMY_DATABASE_URL` | Bảng `taxonomies`, `taxonomy_nodes` |
| **Question** | `question_db` | `QUESTION_DATABASE_URL` | Bảng `questions`, `question_revisions` |
| **Assessment** | `assessment_db` | `ASSESSMENT_DATABASE_URL` | Bảng `assessments`, `blueprints` |
| **Exam** | `exam_db` | `EXAM_DATABASE_URL` | Bảng `exams`, `exam_snapshots` |
| **Attempt** | `attempt_db` | `ATTEMPT_DATABASE_URL` | Bảng `attempts`, `attempt_events` |

---

## 🔌 Danh Mục RESTful API v1 (API Reference)

Tất cả API đều được truy cập hợp nhất qua **Port 3000** của API Gateway:

### 1. 🚪 Gateway Core & Discovery Endpoints
| Method | Endpoint | Auth | Mô Tả |
|---|---|---|---|
| `GET` | `/health` | Public | Kiểm tra trạng thái sức khỏe Gateway và kết nối CSDL của cả 6 Microservices |
| `GET` | `/api` | Public | Danh mục đặc tả các API endpoints (OpenAPI Discovery) |
| `GET` | `/v1/time` | Public | Lấy thời gian chuẩn máy chủ phục vụ đồng bộ Cristian's Algorithm |
| `GET` | `/.well-known/jwks.json` | Public | Public Keys xác thực JWT RS256 theo chuẩn RFC 7517 |

### 2. 🔐 Authentication & Identity APIs (`/v1/auth`)
| Method | Endpoint | Phân Quyền | Mô Tả |
|---|---|---|---|
| `POST` | `/v1/auth/register` | Public | Đăng ký tài khoản người dùng mới |
| `POST` | `/v1/auth/login` | Public | Đăng nhập hệ thống (Bảo vệ chống brute-force) |
| `POST` | `/v1/auth/refresh` | Logged In | Xoay vòng Refresh Token lấy Access Token mới |
| `POST` | `/v1/auth/logout` | Logged In | Đăng xuất và thu hồi Refresh Token |
| `GET` | `/v1/auth/me` | Logged In | Lấy thông tin hồ sơ và danh sách quyền hạn người dùng |
| `GET` | `/v1/auth/admin/users` | ADMIN | Danh sách người dùng hệ thống |
| `PATCH`| `/v1/auth/admin/users/:id/status` | ADMIN | Khóa hoặc kích hoạt tài khoản người dùng |

### 3. 🌳 Taxonomy & Cây Tri Thức APIs (`/v1/taxonomies`, `/v1/nodes`)
| Method | Endpoint | Phân Quyền | Mô Tả |
|---|---|---|---|
| `GET` | `/v1/taxonomies` | Public | Danh sách các loại phân loại (Topic, Grade, Skill...) |
| `POST` | `/v1/taxonomies` | ADMIN | Tạo mới một taxonomy |
| `GET` | `/v1/taxonomies/:code/tree` | Public | Lấy toàn bộ cây phân cấp lồng nhau (Nested Tree) |
| `POST` | `/v1/taxonomies/:code/nodes` | ADMIN | Thêm node mới vào cây tri thức |
| `GET` | `/v1/nodes/:id` | Public | Lấy thông tin chi tiết một node |
| `PUT` | `/v1/nodes/:id` | ADMIN | Cập nhật thông tin node |
| `POST` | `/v1/nodes/:id/move` | ADMIN | Di chuyển vị trí nhánh node (Chống chu trình) |
| `DELETE`| `/v1/nodes/:id` | ADMIN | Xóa mềm node khỏi cây tri thức |
| `GET` | `/v1/nodes/:id/descendant-ids` | Public | Lấy danh sách ID toàn bộ node con cháu |
| `GET` | `/v1/nodes/:id/breadcrumbs` | Public | Lấy đường dẫn phân cấp từ root đến node hiện tại |

### 4. 📚 Question Bank APIs (`/v1/questions`)
| Method | Endpoint | Phân Quyền | Mô Tả |
|---|---|---|---|
| `GET` | `/v1/questions` | Public/AUTHOR | Danh sách câu hỏi, hỗ trợ lọc theo Topic, Grade, Bloom, Loại câu |
| `POST` | `/v1/questions` | INSTRUCTOR/ADMIN | Tạo mới câu hỏi kèm nội dung RichText/LaTeX và các phương án |
| `GET` | `/v1/questions/:idOrCode` | Public/AUTHOR | Xem chi tiết câu hỏi và phiên bản hiện hành |
| `PUT` | `/v1/questions/:id` | INSTRUCTOR/ADMIN | Cập nhật nội dung câu hỏi (Tự động tạo Revision mới) |
| `DELETE`| `/v1/questions/:id` | INSTRUCTOR/ADMIN | Xóa câu hỏi khỏi ngân hàng |
| `GET` | `/v1/questions/:id/revisions` | INSTRUCTOR/ADMIN | Xem danh sách lịch sử các phiên bản sửa đổi của câu hỏi |
| `GET` | `/v1/questions/:id/revisions/:revisionNumber` | INSTRUCTOR/ADMIN | Xem chi tiết một bản sửa đổi (revision) cụ thể của câu hỏi |
| `POST` | `/v1/questions/:id/revisions` | INSTRUCTOR/ADMIN | Tạo thủ công một bản revision mới cho câu hỏi |

### 5. 📐 Assessment Blueprint APIs (`/v1/assessments`)
| Method | Endpoint | Phân Quyền | Mô Tả |
|---|---|---|---|
| `GET` | `/v1/assessments` | Public/AUTHOR | Danh sách bài đánh giá và khung đề thi |
| `POST` | `/v1/assessments` | INSTRUCTOR/ADMIN | Tạo mới bài đánh giá kèm Blueprint ban đầu |
| `GET` | `/v1/assessments/:idOrCode` | Public/AUTHOR | Xem chi tiết bài đánh giá và ma trận tiêu chí phân bổ |
| `PUT` | `/v1/assessments/:id` | INSTRUCTOR/ADMIN | Cập nhật thông tin bài đánh giá |
| `PATCH`| `/v1/assessments/:id/status` | INSTRUCTOR/ADMIN | Chuyển đổi trạng thái vòng đời (`DRAFT`, `REVIEW`, `APPROVED`) |
| `PUT` | `/v1/assessments/:id/blueprint` | INSTRUCTOR/ADMIN | Cập nhật ma trận tiêu chí chọn câu hỏi & chính sách tính điểm |
| `POST` | `/v1/assessments/:id/blueprint/lock` | INSTRUCTOR/ADMIN | Khóa ma trận đề thi chống chỉnh sửa |

### 6. ⚙️ Exam Engine APIs (`/v1/exams`)
| Method | Endpoint | Phân Quyền | Mô Tả |
|---|---|---|---|
| `GET` | `/v1/exams` | Public/AUTHOR | Danh sách đề thi đã phát hành hoặc đang chuẩn bị |
| `POST` | `/v1/exams` | INSTRUCTOR/ADMIN | Kích hoạt `MatrixSolver` sinh đề thi từ Blueprint |
| `GET` | `/v1/exams/:idOrCode` | Public/AUTHOR | Xem chi tiết đề thi và danh sách các mã đề biến thể |
| `PUT` | `/v1/exams/:id` | INSTRUCTOR/ADMIN | Cập nhật metadata đề thi |
| `PATCH`| `/v1/exams/:id/status` | INSTRUCTOR/ADMIN | Cập nhật trạng thái đề thi (`READY`, `ACTIVE`, `CLOSED`) |
| `POST` | `/v1/exams/:id/publish` | INSTRUCTOR/ADMIN | Xuất bản đề thi chính thức |
| `POST` | `/v1/exams/:id/unpublish` | INSTRUCTOR/ADMIN | Hủy xuất bản đề thi |
| `DELETE`| `/v1/exams/:id` | INSTRUCTOR/ADMIN | Xóa đề thi và các snapshots liên quan |
| `GET` | `/v1/exams/:idOrCode/manifest` | Thí sinh | Lấy đề thi đã khử khuẩn (`Sanitized Manifest`) cho mã mặc định |
| `GET` | `/v1/exams/:idOrCode/variants/:code/manifest` | Thí sinh | Lấy đề thi đã khử khuẩn theo mã đề biến thể cụ thể |
| `GET` | `/v1/exams/:idOrCode/variants/:code/frozen` | INSTRUCTOR/ADMIN | Lấy Snapshot đóng băng gốc đầy đủ đáp án phục vụ thanh tra |
| `POST` | `/v1/exams/:idOrCode/generate-variants` | INSTRUCTOR/ADMIN | Phát sinh thêm các biến thể mã đề mới (101, 102, 103...) |

### 7. ⏱️ Candidate Attempt APIs (`/v1/attempts`, `/v1/internal`)
| Method | Endpoint | Phân Quyền | Mô Tả |
|---|---|---|---|
| `POST` | `/v1/attempts` | Thí sinh | Khởi tạo hoặc khôi phục ca thi của thí sinh |
| `GET` | `/v1/attempts/:id` | Thí sinh | Lấy thông tin ca thi và đề thi đã khử khuẩn |
| `POST` | `/v1/attempts/:id/start` | Thí sinh | Bắt đầu tính giờ làm bài và nhận đề thi |
| `PUT` | `/v1/attempts/:id/answers/:questionId` | Thí sinh | Lưu nháp câu trả lời từng câu siêu tốc (<25ms) kèm sequence |
| `POST` | `/v1/attempts/:id/answers` | Thí sinh | Lưu nháp câu trả lời (Endpoint thay thế) |
| `POST` | `/v1/attempts/:id/events` | Thí sinh | Ghi nhận telemetry chống gian lận (`tab-switch`, `blur`...) |
| `GET` | `/v1/attempts/:id/events` | PROCTOR/ADMIN | Xem nhật ký kiểm toán chống gian lận của ca thi |
| `POST` | `/v1/attempts/:id/submit` | Thí sinh | Nộp bài thi và kích hoạt động cơ chấm điểm tự động |
| `GET` | `/v1/attempts/:id/result` | Thí sinh | Xem bảng điểm tổng hợp và giải thích chi tiết |
| `GET` | `/v1/attempts/time` | Public | Lấy thời gian máy chủ dự phòng phục vụ thuật toán Cristian |
| `POST` | `/v1/internal/attempts/sweep` | Internal / ADMIN | Kích hoạt quét tức thì các ca thi quá hạn nộp bài |
| `GET` | `/v1/internal/attempts/sweeper-status` | Internal / ADMIN | Kiểm tra tình trạng hoạt động của Background Sweeper Daemon |

---

## 🛠️ Hướng Dẫn Cài Đặt & Khởi Chạy (Getting Started)

### 1. Yêu Cầu Môi Trường
- **Node.js**: >= 20.0.0
- **pnpm**: >= 8.0.0 (hoặc pnpm 9+ / 10+), trình quản lý gói & PNPM Workspaces chính thức của toàn bộ dự án (`pnpm-workspace.yaml`)
- **PostgreSQL**: Phiên bản >= 14 (Chạy cục bộ trên cổng `5432` hoặc trên Cloud)

### 2. Cấu Hình Biến Môi Trường (`.env`)
Tạo file `.env` tại thư mục gốc dự án dựa theo `.env.example`:

```env
# ============================================================================
# CƠ SỞ DỮ LIỆU POSTGRESQL THẬT (DATABASE-PER-SERVICE)
# ============================================================================
AUTH_DATABASE_URL=postgres://postgres:root@localhost:5432/auth_db
TAXONOMY_DATABASE_URL=postgres://postgres:root@localhost:5432/taxonomy_db
QUESTION_DATABASE_URL=postgres://postgres:root@localhost:5432/question_db
ASSESSMENT_DATABASE_URL=postgres://postgres:root@localhost:5432/assessment_db
EXAM_DATABASE_URL=postgres://postgres:root@localhost:5432/exam_db
ATTEMPT_DATABASE_URL=postgres://postgres:root@localhost:5432/attempt_db

# ============================================================================
# BẢO MẬT XÁC THỰC (JWT RS256 / SECRETS)
# ============================================================================
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long_for_security

# ============================================================================
# CỔNG GIAO TIẾP DỊCH VỤ (SERVICE PORTS)
# ============================================================================
GATEWAY_PORT=3000
AUTH_PORT=3001
TAXONOMY_PORT=3002
QUESTION_PORT=3003
ASSESSMENT_PORT=3004
EXAM_PORT=3005
ATTEMPT_PORT=3006
```

### 3. Khởi Tạo Nhanh 6 Database PostgreSQL
Nếu đang sử dụng PostgreSQL cục bộ, mở Terminal `psql`:

```sql
CREATE DATABASE auth_db;
CREATE DATABASE taxonomy_db;
CREATE DATABASE question_db;
CREATE DATABASE assessment_db;
CREATE DATABASE exam_db;
CREATE DATABASE attempt_db;
```

### 4. Cài Đặt Dependencies & Khởi Tạo Dữ Liệu Sạch (Clean Bootstrap) Bằng PNPM
```bash
# 1. Cài đặt toàn bộ dependencies cho toàn bộ monorepo workspace
pnpm install

# 2. Khởi tạo toàn diện schema và nạp dữ liệu mẫu sạch qua Clean Bootstrap Script
pnpm seed:all
# hoặc: pnpm run seed:all
```

> **Lưu ý**: Lệnh `pnpm seed:all` chạy script `scripts/bootstrap-clean-data.ts` theo đúng đường ống phụ thuộc nghiệp vụ:
> $$\text{Auth} \longrightarrow \text{Taxonomy} \longrightarrow \text{Question} \longrightarrow \text{Assessment} \longrightarrow \text{Exam} \longrightarrow \text{Attempt}$$
> Nạp đầy đủ tài khoản người dùng, cây danh mục Toán/Khối 10, ngân hàng câu hỏi chuẩn Bloom, ma trận đề thi mẫu và phát sinh đề thi biến thể có sẵn để thí sinh trải nghiệm ngay lập tức.

Nếu muốn chạy Migration hoặc Seed đơn lẻ cho từng dịch vụ bằng `pnpm`:
```bash
pnpm db:migrate:auth        && pnpm db:seed:auth
pnpm db:migrate:taxonomy    && pnpm db:seed:taxonomy
pnpm db:migrate:question    && pnpm db:seed:question
pnpm db:migrate:assessment  && pnpm db:seed:assessment
pnpm db:migrate:exam        && pnpm db:seed:exam
pnpm db:migrate:attempt     && pnpm db:seed:attempt
```

> 💡 **Mẹo PNPM Filter**: Bạn cũng có thể thực thi lệnh trong một service cụ thể:
> ```bash
> pnpm --filter @platform/question-service db:migrate
> pnpm --filter @platform/auth-service db:seed
> ```

### 5. Khởi Chạy Ứng Dụng Bằng PNPM

#### 🌟 Chế Độ Unified Gateway (Khuyến nghị - Port 3000)
Khởi chạy toàn bộ hệ thống (API Gateway, các Microservices và phục vụ 2 ứng dụng Frontend Web SPA) trên duy nhất cổng **3000**:

```bash
pnpm dev
# hoặc
pnpm start
```

Sau khi khởi chạy:
- 🎓 **Cổng Thí Sinh Làm Bài (Quiz Web SPA)**: `http://localhost:3000/`
- 🛠️ **Cổng Quản Trị & Khảo Thí (Admin Web SPA)**: `http://localhost:3000/admin/`
- 🩺 **Kiểm Tra Trạng Thái Hệ Thống (Health Check)**: `http://localhost:3000/health`
- 📖 **Danh Mục API (Discovery)**: `http://localhost:3000/api`

#### 🛠️ Chế Độ Standalone Dev (Phát triển từng dịch vụ riêng biệt với PNPM)
```bash
pnpm dev:gateway      # Khởi chạy API Gateway (Port 3000)
pnpm dev:auth         # Khởi chạy Auth Service độc lập (Port 3001)
pnpm dev:taxonomy     # Khởi chạy Taxonomy Service độc lập (Port 3002)
pnpm dev:question     # Khởi chạy Question Service độc lập (Port 3003)
pnpm dev:assessment   # Khởi chạy Assessment Service độc lập (Port 3004)
pnpm dev:exam         # Khởi chạy Exam Service độc lập (Port 3005)
pnpm dev:attempt      # Khởi chạy Attempt Service độc lập (Port 3006)
pnpm dev:web          # Khởi chạy Vite Dev Server cho Quiz Web
pnpm dev:admin        # Khởi chạy Vite Dev Server cho Admin Web
```

#### 📦 Quản Lý Gói & Dependencies Trong PNPM Workspace
```bash
# Cài đặt package mới cho một service hoặc app cụ thể:
pnpm --filter @platform/question-service add <package-name>

# Cài đặt package mới cho toàn bộ root monorepo (devDependencies):
pnpm add -w -D <package-name>

# Biên dịch các shared packages nội bộ (contracts, auth-client, api-client):
pnpm build:packages

# Kiểm tra kiểu TypeScript & cú pháp toàn bộ hệ thống:
pnpm lint

# Biên dịch toàn bộ các packages và frontend apps cho Production:
pnpm build
```

#### 🔄 Quản Lý Schema CSDL Với Drizzle ORM
```bash
# Tạo migration file khi thay đổi schema:
pnpm db:generate:<service>  # ví dụ: pnpm db:generate:question

# Đồng bộ trực tiếp cấu trúc bảng vào DB (Dành cho môi trường Dev):
pnpm db:push:<service>      # ví dụ: pnpm db:push:attempt
```

---

## 🧪 Kết Quả Kiểm Thử Tự Động (Automated Testing)

Toàn bộ hệ thống được bảo vệ bởi hệ thống kiểm thử tự động toàn diện với **hơn 280+ bài kiểm thử (PASS 100%)** chạy trên nền **Vitest**:

```bash
pnpm test
```

### Danh Mục Các Bộ Kiểm Thử Chính:
1. **Kiểm Thử Toàn Trình Sau Phân Rã (`tests/e2e-quiz-decomposition.spec.ts`)**:
   - Kiểm tra chu trình khép kín: Đăng nhập Giảng viên ➔ Tạo Cây tri thức ➔ Soạn câu hỏi Bloom ➔ Tạo Blueprint ma trận ➔ Kích hoạt `MatrixSolver` sinh đề ➔ Đóng băng Snapshot SHA-256 ➔ Thí sinh nhận đề đã khử khuẩn ➔ Autosave đáp án ➔ Bấm nộp bài ➔ Chấm điểm tự động chuẩn xác.
2. **Kiểm Thử Tải Cao & Đồng Thời (`tests/load-and-concurrency.spec.ts`)**:
   - Thử nghiệm lưu nháp đồng thời hàng trăm requests/giây đảm bảo p99 < 25ms.
   - Kiểm tra cơ chế chống ghi đè phiên bản cũ (Outdated Sequence Defense).
3. **Gateway Service Tests (`services/gateway/tests/gateway.spec.ts`)**:
   - Kiểm tra định tuyến liên dịch vụ, xác thực JWT Context, đồng bộ thời gian `/v1/time` và cơ chế Fail-Safe khi CSDL chưa sẵn sàng.
4. **Microservices Tests (`services/*/tests`)**:
   - `services/question/tests`: Kiểm tra CRUD câu hỏi, bộ lọc độ khó Bloom, lưu trữ Revisions.
   - `services/assessment/tests`: Kiểm tra cấu hình ma trận tiêu chí, khóa Blueprint, chính sách điểm.
   - `services/exam/tests`: Kiểm tra giải ma trận `matrix-solver.spec.ts`, tính tất định của PRNG `prng.spec.ts`, đóng băng Snapshot.
   - `services/attempt/tests`: Kiểm tra FSM ca thi, lưu nháp, sweeper daemon, thuật toán chấm điểm.
   - `services/auth/tests`: Kiểm tra JWKS RS256, xoay vòng Refresh Token, phát hiện dùng lại token, RBAC Admin.
   - `services/taxonomy/tests`: Kiểm tra Recursive CTE $O(N)$, thuật toán chống chu trình `cycle-prevention.spec.ts`, cấu trúc cây học tập.
5. **Packages & Frontend Tests**:
   - `packages/api-client/tests`: Type-safe SDK calls.
   - `packages/auth-client/tests`: Cookie & Session persistence.
   - `apps/quiz-web/tests`: Kiểm tra đồng bộ đồng hồ Cristian's Algorithm (`time-sync.spec.ts`) và đếm ngược an toàn (`countdown.spec.ts`).

---

## 👥 Tài Khoản Mẫu Mặc Định (Default Seed Accounts)

Sau khi chạy `pnpm seed:all` (hoặc nạp qua `pnpm db:seed:auth`), các tài khoản sau sẵn sàng để đăng nhập và trải nghiệm (mật khẩu được mã hóa an toàn bằng `scrypt`):

| Vai Trò (Role) | Email Đăng Nhập | Mật Khẩu | Quyền Hạn & Chức Năng Khả Dụng |
|---|---|---|---|
| **Quản Trị Viên (ADMIN)** | `admin@quiz.com`<br>`admin@quiz.local` | `admin123` | Toàn quyền quản trị hệ thống, quản lý Cây Tri Thức, quản lý RBAC, phân quyền và khóa/kích hoạt tài khoản người dùng |
| **Giảng Viên (INSTRUCTOR)** | `instructor@quiz.com`<br>`instructor@quiz.local` | `teacher123` | Soạn ngân hàng câu hỏi (RichText/LaTeX), thiết lập Blueprint ma trận đề, kích hoạt sinh đề thi và xuất bản đề thi |
| **Thí Sinh (STUDENT)** | `student@quiz.com`<br>`student@quiz.local` | `student123` | Xem danh mục môn học, tham gia làm bài thi trắc nghiệm trực tuyến, xem đồng hồ đếm ngược và bảng điểm chi tiết |

---

## 📄 Bản Quyền & Giấy Phép (License)

Dự án được phát triển theo chuẩn kiến trúc hướng dịch vụ doanh nghiệp (Enterprise Microservices). Giữ toàn quyền sở hữu trí tuệ thuộc về nhóm phát triển nền tảng Quiz Core.


