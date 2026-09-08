# KẾ HOẠCH TÁCH QUIZ SERVICE THÀNH 4 MICROSERVICES CHUYÊN BIỆT
*(Question Service, Assessment Service, Exam Service, Attempt Service)*  
**Chuẩn Monorepo PNPM • Hexagonal Architecture (Ports & Adapters) • Domain-Driven Design (DDD) • TypeScript • PostgreSQL + Drizzle ORM • React 19 + Tailwind CSS**

---

## 1. TỔNG QUAN BỐI CẢNH & TÍNH CẤP THIẾT CỦA VIỆC PHÂN TÁCH

### 1.1. Hiện trạng của `services/quiz` nguyên khối (Monolith)
Hiện tại, `services/quiz` (`@platform/quiz-service`) đang gánh vác đồng thời toàn bộ các miền nghiệp vụ khảo thí:
- **Authoring**: Quản lý thông tin đề thi (`quizzes`), các phiên bản đề (`quiz_versions`), câu hỏi JSONB inline, cấu hình thang điểm (`scoring_policy`) và phân bổ ngẫu nhiên (`randomization_policy`).
- **Delivery / Runtime**: Khởi tạo phiên làm bài (`attempts`), xáo trộn câu hỏi/đáp án tức thời khi sinh manifest, tiếp nhận và ghi đè câu trả lời (`CandidateAnswerRecord`), đồng bộ đồng hồ máy chủ, sweeper quét bài quá hạn và động cơ chấm điểm (`AssessmentScoringEngine`).

### 1.2. Vấn đề cốt lõi: Xung đột đặc tính tải (Workload Contention)
Khi quy mô hệ thống mở rộng từ vài trăm thí sinh lên hàng chục nghìn thí sinh thi đồng thời:
1. **Nghẽn cổ chai Write IOPS**: Quá trình thí sinh làm bài gửi request autosave dồn dập (hàng chục nghìn writes/phút) khóa tài nguyên cơ sở dữ liệu, làm chậm thao tác tra cứu, soạn thảo câu hỏi của giảng viên.
2. **Nghẽn CPU do thuật toán sinh đề**: Mỗi khi thí sinh bấm "Bắt đầu làm bài", server phải giải thuật toán xáo trộn (shuffle) và lọc câu hỏi, tiêu tốn CPU đột biến ngay tại thời điểm mở cổng thi (Exam Opening Rush).
3. **Thiếu khả năng mở rộng độc lập (Independent Scalability)**: Không thể scale riêng lẻ module làm bài (Attempt) mà không kéo theo toàn bộ module soạn thảo đề thi và ngân hàng câu hỏi.
4. **Vi phạm ranh giới Single Responsibility (SRP) & Bounded Contexts của DDD**: Đề thi đóng gói (Exam Package), khung năng lực đề thi (Assessment Blueprint), ngân hàng câu hỏi (Question Bank) và phiên thi của thí sinh (Attempt Session) là các Bounded Context riêng biệt với vòng đời và chu kỳ thay đổi hoàn toàn khác nhau.

### 1.3. Mục tiêu phân tách thành 4 Microservices chuyên biệt
Hệ thống sẽ phân rã `services/quiz` thành 4 dịch vụ độc lập:
1. **Question Service (`@platform/question-service`)**: Ngân hàng câu hỏi độc lập, quản trị nội dung đa phương tiện, RichText, LaTeX, phân loại theo Taxonomy.
2. **Assessment Service (`@platform/assessment-service`)**: Quản lý cấu trúc đề thi, khung năng lực (Blueprint), ma trận phân bổ kiến thức và chính sách đánh giá.
3. **Exam Service (`@platform/exam-service`)**: Động cơ sinh đề thi, thuật toán chọn câu hỏi theo ma trận, xáo trộn câu/đáp án theo thuật toán xáo hạt giống (Deterministic Random / Seed-based Shuffle) và đóng băng dữ liệu bất biến (Snapshot Freeze).
4. **Attempt Service (`@platform/attempt-service`)**: Động cơ làm bài thời gian thực, lưu nháp (autosave) độ trễ cực thấp, đếm ngược đồng hồ máy chủ, phòng vệ gian lận và tự động chấm điểm khi nộp bài.

```
                               ┌────────────────────────────────────────┐
                               │      AUTH SERVICE (@platform/auth)     │
                               │  - Issue RS256 JWT Token               │
                               │  - Database: auth_db                   │
                               └──────────────────┬─────────────────────┘
                                                  │ Bearer JWT (id, roles, principal)
              ┌───────────────────────────────────┼───────────────────────────────────┐
              ▼                                   ▼                                   ▼
┌───────────────────────────┐       ┌───────────────────────────┐       ┌───────────────────────────┐
│     TAXONOMY SERVICE      │       │     QUESTION SERVICE      │       │    ASSESSMENT SERVICE     │
│ (@platform/taxonomy)      │       │ (@platform/question)      │       │ (@platform/assessment)    │
│ - Topics, Grades, Skills  │◄──────┤ - Item Bank, RichText,    │◄──────┤ - Blueprint, Matrix Rules │
│ - Database: taxonomy_db   │       │   LaTeX, Rubrics, Media   │       │ - Scoring & Attempt Policy│
│ - Workload: Read-Heavy    │       │ - Database: question_db   │       │ - Database: assessment_db │
└───────────────────────────┘       │ - Workload: Read-Heavy    │       │ - Workload: Business Logic│
                                    └─────────────┬─────────────┘       └─────────────┬─────────────┘
                                                  │ Query questions by matrix         │ Read Blueprint & Rules
                                                  ▼                                   ▼
                                    ┌───────────────────────────────────────────────────────────────┐
                                    │                   EXAM SERVICE (@platform/exam)               │
                                    │ - Matrix Selection Algorithm & Constraint Solver              │
                                    │ - Deterministic Seed-based Shuffle (Fisher-Yates + PRNG)      │
                                    │ - Immutable Exam Snapshot Freeze & SHA-256 Hashing            │
                                    │ - Database: exam_db | Workload: CPU-Bound / Heavy Compute     │
                                    └───────────────────────────────┬───────────────────────────────┘
                                                                    │ Fetch Frozen Exam Snapshot
                                                                    ▼
                                    ┌───────────────────────────────────────────────────────────────┐
                                    │                ATTEMPT SERVICE (@platform/attempt)            │
                                    │ - Finite State Machine (CREATED -> IN_PROGRESS -> SUBMITTED)  │
                                    │ - Ultra Low-Latency Autosave & Sequence Anti-Tamper           │
                                    │ - Server-Authoritative Timer & Anti-Cheat Telemetry Audit     │
                                    │ - Background Expiry Sweeper & Auto-Grading Execution          │
                                    │ - Database: attempt_db | Workload: Ultra High-Write           │
                                    └───────────────────────────────────────────────────────────────┘
```

---

## 2. VAI TRÒ & ĐẶC TÍNH TẢI (WORKLOAD CHARACTERISTICS) CHI TIẾT

### 2.1. Ma trận so sánh 4 Microservices

| Tiêu chí | Question Service | Assessment Service | Exam Service | Attempt Service |
| :--- | :--- | :--- | :--- | :--- |
| **Vai trò nghiệp vụ cốt lõi** | Quản lý ngân hàng câu hỏi, soạn thảo RichText/LaTeX, phân loại cây tri thức, quản lý đáp án/rubric | Quản lý cấu trúc đề (Blueprint), ma trận tỷ lệ câu hỏi, chính sách chấm điểm và điều kiện thi | Sinh đề thi thực thi, xáo trộn hạt giống (Seed-based shuffle), đóng băng đề thành bản ghi bất biến | Quản lý phiên làm bài, lưu nháp (autosave), đồng hồ đếm ngược, telemetry chống gian lận, chấm thi |
| **Đặc tính tải (Workload)** | **Read-Heavy** (Soạn thảo/tra cứu) | **Business Logic / Low Write** | **CPU-Bound / Heavy Compute** | **Ultra High-Write & Low Latency** |
| **Tần suất Đọc/Ghi (R/W Ratio)** | Đọc 85% / Ghi 15% | Đọc 95% / Ghi 5% | Đọc 40% / Tính toán 50% / Ghi 10% | Ghi 80% (autosave) / Đọc 20% |
| **Thời điểm Tải đỉnh (Peak Load)** | Giảng viên soạn đề, trước kỳ thi | Kỳ thi chuẩn bị ban hành khung | Ngay trước giờ phát đề hoặc đợt mở cổng thi | **Suốt thời gian thi** (đặc biệt phút đầu & phút chót) |
| **Yêu cầu Độ trễ (SLA/Latency)** | p95 < 150ms | p95 < 100ms | p95 < 800ms (tính toán nặng) | **p99 < 25ms** (đảm bảo gõ chữ/click mượt mà) |
| **Chiến lược Bộ nhớ đệm (Cache)** | Cache câu hỏi đã duyệt (Redis/In-Memory) | Cache Blueprint đã phát hành | Cache Exam Snapshot theo Hash/Exam ID | In-Memory Write-Buffer / Optimistic DB writes |
| **Chiến lược Mở rộng (Scaling)** | Scale theo số lượng giảng viên/admin | Tải thấp, chỉ cần 2 instances (HA) | Scale theo số đề cần sinh trước giờ G | **Autoscale mạnh mẽ** theo số thí sinh đồng thời |

---

### 2.2. Phân tích Chuyên sâu Từng Dịch Vụ

#### 1. Question Service (`@platform/question-service`)
- **Vai trò chuyên biệt**:
  - Quản trị Ngân hàng câu hỏi tập trung (Item Bank) phục vụ toàn bộ trường học/tổ chức.
  - Hỗ trợ đa dạng loại câu hỏi: Single Choice, Multiple Choice, Fill-in, Matching, Ordering, Numeric, Rich essay.
  - Xử lý nội dung giàu định dạng: Biểu thức toán học LaTeX/KaTeX, Markdown, mã nguồn tô màu cú pháp (Syntax Highlighting), đính kèm tệp âm thanh/hình ảnh/video.
  - Gắn nhãn đa chiều theo Taxonomy: Phân cấp theo Topic (Cây môn học), Grade (Khối lớp), Bloom Taxonomy (Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao), Thẻ kỹ năng (Tags).
  - Quản lý phiên bản câu hỏi (Question Revisions) và lịch sử chỉnh sửa để không phá vỡ các kỳ thi đã diễn ra.
  - Quản lý lời giải chi tiết, gợi ý làm bài (Explanations) và barem điểm (Rubrics) có phân quyền bảo mật chặt chẽ.
- **Đặc tính tải**:
  - **Read-Heavy**: Giảng viên tra cứu, tìm kiếm câu hỏi theo bộ lọc đa chiều (Filter by Grade, Topic, Difficulty, Keywords).
  - **Text & Media Intensive**: Parsing chuỗi KaTeX/LaTeX, kiểm tra tính hợp lệ của thẻ HTML/Markdown, kiểm soát dung lượng media assets.
  - **Batch Read Spike**: Khi Exam Service tiến hành sinh đề, nó sẽ thực hiện các truy vấn đọc hàng loạt (Batch Read) theo danh sách Question IDs hoặc theo ma trận phân bổ.
  - Tải rất thấp trong thời gian thí sinh đang làm bài thi.

#### 2. Assessment Service (`@platform/assessment-service`)
- **Vai trò chuyên biệt**:
  - Quản lý Khung đề thi / Ma trận đặc tả đề thi (Assessment Blueprint & Specification Matrix).
  - Định nghĩa nguyên tắc phân bổ câu hỏi (Rule-based allocation): ví dụ Đề Toán 10 cần 20 câu Nhận biết, 15 câu Thông hiểu, 10 câu Vận dụng, 5 câu Vận dụng cao; phân bổ chính xác theo các Node trong Cây môn học và Khối lớp.
  - Quản lý Chính sách chấm điểm (Scoring Policy): Thang điểm chuẩn (Standard 10/100), Điểm từng phần (Partial scoring), Điểm phạt trừ khi làm sai (Negative marking penalty), Làm tròn số thập phân.
  - Quản lý Chính sách làm bài (Attempt Policy): Thời gian làm bài (Duration minutes), Số lần làm bài tối đa (Max attempts), Thời hạn mở/đóng cổng thi (Availability window), Thời gian gia hạn nộp trễ (Grace period ms).
  - Quản lý Vòng đời đề thi (State Lifecycle): `DRAFT` ➔ `REVIEW` ➔ `APPROVED` ➔ `PUBLISHED` ➔ `ARCHIVED`.
- **Đặc tính tải**:
  - **Business Logic Heavy / Read-Heavy**: Rất nhiều logic kiểm tra tính hợp lệ của quy tắc ma trận (tổng tỷ lệ phần trăm = 100%, ngân hàng câu hỏi có đủ số lượng theo yêu cầu của blueprint hay không).
  - **Tải rất thấp**: Số lượng bản ghi Blueprint không tăng nhanh như câu hỏi hay phiên thi; dữ liệu chủ yếu được đọc bởi Exam Service và Admin Web.

#### 3. Exam Service (`@platform/exam-service`)
- **Vai trò chuyên biệt**:
  - **Động cơ chọn câu hỏi theo ma trận (Matrix Constraint Solver)**: Đọc Blueprint từ Assessment Service, truy vấn ngân hàng từ Question Service và áp dụng thuật toán chọn ngẫu nhiên có ràng buộc để đảm bảo đề thi đủ và đúng cấu trúc.
  - **Thuật toán xáo trộn hạt giống (Deterministic Random / Seed-based Shuffle)**: Sử dụng thuật toán Fisher-Yates kết hợp Pseudo-Random Number Generator (PRNG như Mulberry32 hoặc PCG-XSH-RR). Với cùng một `seed` (hoặc `studentId + examCode`), thứ tự câu hỏi và thứ tự các phương án lựa chọn được xáo trộn duy nhất nhưng có thể tái lập hoàn toàn (100% Deterministic) nhằm phục vụ công tác thanh tra, chấm thi và phúc khảo.
  - **Đóng băng dữ liệu đề thi bất biến (Immutable Exam Package Freeze)**: Trích xuất toàn bộ nội dung câu hỏi, phương án, điểm số, đóng gói thành một Snapshot bất biến, băm mã định danh SHA-256 (Tamper-proof Cryptographic Hash). Từ thời điểm này, mọi chỉnh sửa trong Question Bank sẽ **không bao giờ** làm thay đổi nội dung đề thi đã phát hành.
  - Sinh các mã đề khác nhau (Exam Variants / Mã đề 101, 102, 103...) cho cùng một bài thi.
- **Đặc tính tải**:
  - **CPU-Bound & Heavy Compute**: Xử lý thuật toán xáo trộn, giải ma trận tổ hợp và tính toán mã băm SHA-256 trên các payload dữ liệu lớn.
  - **Tải tăng đột biến (Spike Load)**: Tập trung cao độ trước giờ thi khi hệ thống thực hiện Batch Exam Generation (Ví dụ: sinh trước 10.000 đề cho 10.000 thí sinh hoặc sinh theo đợt).

#### 4. Attempt Service (`@platform/attempt-service`)
- **Vai trò chuyên biệt**:
  - Quản lý Vòng đời phiên làm bài (Attempt Session Lifecycle): Máy trạng thái hữu hạn (FSM) nghiêm ngặt: `CREATED` ➔ `IN_PROGRESS` ➔ `PAUSED` ➔ `SUBMITTED` ➔ `EVALUATED` / `EXPIRED`.
  - **Lưu nháp thời gian thực (Low-Latency Autosave)**: Tiếp nhận câu trả lời từng câu của thí sinh, bảo vệ thứ tự bằng số thứ tự tăng dần (`sequenceNumber`) và nhãn thời gian máy chủ, phòng vệ chống ghi đè phiên bản cũ (Outdated Answer Sequence Defense).
  - **Bộ đếm thời gian phân tán chính xác tuyệt đối (Server-Authoritative Clock Synchronization)**: Phối hợp với thuật toán Cristian's Algorithm ở client để bù trừ độ trễ mạng (RTT/2 drift compensation), loại trừ hoàn toàn việc gian lận bằng cách can thiệp đồng hồ hệ thống trên máy tính thí sinh.
  - **Giám sát & Tiếp nhận sự kiện chống gian lận (Anti-cheat Telemetry Ingestion)**: Ghi nhận chuỗi sự kiện `blur`, `tab-switch`, `fullscreen-exit`, `paste-detected`, `speed-violation` vào bảng kiểm toán bất biến (Audit Log).
  - **Background Sweeper Daemon**: Tự động quét và cưỡng chế nộp bài các bài thi quá hạn (`IN_PROGRESS` vượt quá `deadline + gracePeriod`).
  - **Tự động chấm điểm (Grading Execution)**: Sau khi nộp bài, kích hoạt động cơ chấm điểm dựa trên Snapshot bài thi đã đóng băng từ Exam Service, tính điểm chuẩn xác, cập nhật bảng điểm chi tiết (`AttemptScoreResult`).
- **Đặc tính tải**:
  - **Ultra High-Write & Low Latency**: Chịu tải hàng chục nghìn lượt ghi/giây (Write Traffic Burst). Mỗi thao tác chọn đáp án, gõ chữ của thí sinh đều kích hoạt autosave.
  - Đòi hỏi phản hồi siêu tốc (< 25ms) để giao diện thí sinh không có cảm giác giật/lag.
  - Đòi hỏi tính chịu lỗi cực cao (Fault-tolerant, Zero Data Loss) vì mất câu trả lời của thí sinh là sự cố nghiêm trọng nhất trong hệ thống thi cử.

---

## 3. THIẾT KẾ KIẾN TRÚC HEXAGONAL (PORTS & ADAPTERS) & DDD

Để đảm bảo tính nhất quán 100% với cấu trúc Monorepo PNPM hiện tại (tương tự như `services/auth` và `services/taxonomy`), mỗi microservice sẽ tuân thủ nghiêm ngặt 4 lớp của Hexagonal Architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PRESENTATION LAYER (Driving Adapters)                                       │
│  - Express Routers & Controllers (/v1/...)                                  │
│  - HTTP Request Parsers & Zod Validation Middlewares                        │
│  - Auth Context & RBAC Middleware (Extract Principal from RS256 JWT)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ calls
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ APPLICATION LAYER (Driving Ports & Use Cases)                               │
│  - Application Use Cases (Interactors & Orchestration)                      │
│  - Command & Query DTOs                                                     │
│  - Driving Ports (Input Ports / Use Case Interfaces)                        │
│  - Transaction Boundary Handlers                                            │
└──────────────────┬───────────────────────────────────────┬──────────────────┘
                   │ invokes                               │ calls via
                   ▼                                       ▼
┌──────────────────────────────────────┐   ┌──────────────────────────────────┐
│ DOMAIN LAYER (Core Enterprise Logic) │   │ DRIVEN PORTS (Outbound Interfaces│
│  - Entities & Aggregate Roots        │   │  - Repository Ports              │
│  - Value Objects & Domain Enums      │   │  - External Service Client Ports │
│  - Domain Events & Event Publishers  │   │  - Clock / Timer Ports           │
│  - Domain Errors & Business Rules    │   │  - PRNG / Shuffler Ports         │
└──────────────────────────────────────┘   └──────────────────┬───────────────┘
                                                              │ implemented by
                                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ INFRASTRUCTURE LAYER (Driven Adapters)                                      │
│  - Drizzle ORM Repositories (PostgreSQL Implementation)                     │
│  - Database Schemas (`schema.ts`), Migrations & Connection Pools            │
│  - HTTP / RPC Client Adapters (gọi liên dịch vụ qua @platform/api-client)   │
│  - Fast Seed PRNG Implementation (Mulberry32)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Cấu trúc thư mục chuẩn hóa trong Monorepo

```
/services
  ├── auth/                        # [ĐÃ CÓ] @platform/auth-service (Port 3000)
  ├── taxonomy/                    # [ĐÃ CÓ] @platform/taxonomy-service (Port 3000)
  ├── question/                    # [MỚI] @platform/question-service
  │   ├── package.json
  │   ├── tsconfig.json
  │   ├── drizzle.config.ts
  │   ├── src/
  │   │   ├── domain/              # Entities, Value Objects, Ports
  │   │   ├── application/         # Use Cases, DTOs
  │   │   ├── infrastructure/      # Drizzle ORM, DB schema, Repositories
  │   │   ├── presentation/        # Express Routers, Middlewares, Controllers
  │   │   └── index.ts
  │   └── tests/
  ├── assessment/                  # [MỚI] @platform/assessment-service
  │   ├── package.json
  │   ├── tsconfig.json
  │   ├── drizzle.config.ts
  │   ├── src/
  │   │   ├── domain/              # Blueprint, Matrix, Policies, Ports
  │   │   ├── application/         # Use Cases, DTOs
  │   │   ├── infrastructure/      # Drizzle ORM, DB schema, Repositories
  │   │   ├── presentation/        # Express Routers, Middlewares, Controllers
  │   │   └── index.ts
  │   └── tests/
  ├── exam/                        # [MỚI] @platform/exam-service
  │   ├── package.json
  │   ├── tsconfig.json
  │   ├── drizzle.config.ts
  │   ├── src/
  │   │   ├── domain/              # ExamSnapshot, SeedShuffler, Solver, Ports
  │   │   ├── application/         # GenerateExamUseCase, FreezeExamUseCase
  │   │   ├── infrastructure/      # Drizzle ORM, DB schema, Client Adapters
  │   │   ├── presentation/        # Express Routers, Middlewares, Controllers
  │   │   └── index.ts
  │   └── tests/
  └── attempt/                     # [MỚI] @platform/attempt-service
      ├── package.json
      ├── tsconfig.json
      ├── drizzle.config.ts
      ├── src/
      │   ├── domain/              # AttemptAggregate, FSM, Scoring, Sweeper, Ports
      │   ├── application/         # StartAttempt, AutosaveAnswer, SubmitAttempt
      │   ├── infrastructure/      # Drizzle ORM, DB schema, High-speed buffer
      │   ├── presentation/        # Express Routers, Sweeper, Telemetry
      │   └── index.ts
      └── tests/
```

---

## 4. THIẾT KẾ CƠ SỞ DỮ LIỆU POSTGRESQL THẬT & DRIZZLE ORM (DATABASE-PER-SERVICE)

### 4.1. Nguyên tắc Cốt lõi: 100% PostgreSQL Thật (psql) - Xóa Bỏ Hoàn Toàn In-Memory Mode

Hệ thống tuân thủ triệt để các nguyên tắc lưu trữ dữ liệu chuyên nghiệp cấp doanh nghiệp:

1. **Tuyệt đối Không Dùng In-Memory Mode**:
   - **Loại bỏ vĩnh viễn**: Mọi hình thức lưu trữ tạm thời trong bộ nhớ (in-memory arrays, mock repositories, SQLite in-memory, PGLite) đều bị cấm hoàn toàn trong cả môi trường phát triển (development), kiểm thử tích hợp (integration testing), và sản xuất (production).
   - **PostgreSQL bắt buộc**: Tất cả 4 microservices mới (`Question`, `Assessment`, `Exam`, `Attempt`) cùng các services hiện hữu (`Auth`, `Taxonomy`, `Quiz`) đều vận hành trực tiếp trên cơ sở dữ liệu PostgreSQL thật thông qua driver hiệu năng cao `postgres` (`postgres.js`) và ORM kiểu an toàn `drizzle-orm/postgres-js`.

2. **Cơ chế Ngắt Lập Tức (Fail-Fast Startup Guarantee)**:
   - Khi bất kỳ microservice nào khởi động, module kết nối cơ sở dữ liệu sẽ kiểm tra biến môi trường kết nối tương ứng (`QUESTION_DATABASE_URL`, `ASSESSMENT_DATABASE_URL`, `EXAM_DATABASE_URL`, `ATTEMPT_DATABASE_URL`).
   - Nếu biến môi trường bị thiếu hoặc không đúng định dạng kết nối PostgreSQL (`postgres://` hoặc `postgresql://`), service sẽ ném ngoại lệ nghiêm trọng (Fatal Exception) và dừng tiến trình ngay lập tức:
     ```text
     FATAL ERROR: <SERVICE>_DATABASE_URL is not defined in environment variables.
     In-memory persistence has been permanently removed; PostgreSQL (<service>_db) is strictly required.
     ```

3. **Xử lý An toàn URL Kết nối (PostgreSQL Startup Parameter Sanitization)**:
   - Thư viện `postgres.js` tự động truyền các tham số query trong chuỗi kết nối vào gói tin `StartupMessage` của giao thức PostgreSQL.
   - Nếu chuỗi kết nối chứa tham số `?schema=public` (thường xuất hiện khi copy từ Supabase, Neon hoặc Prisma), PostgreSQL sẽ từ chối kết nối và báo lỗi `FATAL: PostgresError: unrecognized configuration parameter "schema" (code 42704)`.
   - Tất cả services đều tích hợp hàm `sanitizePostgresUrl(rawUrl)` để tự động chuẩn hóa: gỡ bỏ `schema=public` và chuyển đổi sang `search_path` hợp lệ nếu có schema tùy biến.

---

### 4.2. Danh mục Các Cơ sở Dữ liệu Độc lập (Independent Databases Topology)

Mỗi service sở hữu một Cơ sở Dữ liệu PostgreSQL độc lập hoàn toàn (**Database-per-Service Pattern**). Các database này có thể chạy trên cùng một PostgreSQL cluster vật lý/container cục bộ (qua các database name riêng rẽ) hoặc trên các Cloud SQL / RDS instances độc lập:

| Service | Tên Database PostgreSQL | Biến Môi Trường (.env) | Vai Trò & Ranh Giới Lưu Trữ Dữ Liệu |
|---|---|---|---|
| **Auth Service** | `auth_db` | `AUTH_DATABASE_URL` | Quản lý tài khoản người dùng, phiên đăng nhập, JWT tokens, RBAC roles & permissions. |
| **Taxonomy Service** | `taxonomy_db` | `TAXONOMY_DATABASE_URL` | Quản lý cây phân loại học tập (Subjects, Grades, Topics, Learning Nodes). |
| **Quiz Service (Legacy)** | `quiz_db` | `QUIZ_DATABASE_URL` | Quản lý Quizzes và Attempts cũ trong giai đoạn chuyển tiếp (sẽ được loại bỏ hoàn toàn tại Giai đoạn 7). |
| **Question Service** | `question_db` | `QUESTION_DATABASE_URL` | Ngân hàng câu hỏi, phiên bản câu hỏi (revisions), rich-text/LaTeX, Bloom difficulty, media assets. |
| **Assessment Service** | `assessment_db` | `ASSESSMENT_DATABASE_URL` | Bài đánh giá (Assessments), Khung ma trận đề (Blueprints), chính sách tính điểm (Scoring Policy) và lượt thi. |
| **Exam Service** | `exam_db` | `EXAM_DATABASE_URL` | Đề thi chính thức, các biến thể đề (Variants), Snapshot đóng băng bất biến (SHA-256 Tamper-proof Hash). |
| **Attempt Service** | `attempt_db` | `ATTEMPT_DATABASE_URL` | Phiên làm bài của thí sinh, bộ đệm autosave câu trả lời tốc độ cao, telemetry audit chống gian lận, kết quả chấm điểm. |

#### Ranh giới Dữ liệu Tuyệt đối (Zero Cross-Database Foreign Keys):
- **Không có khóa ngoại vật lý giữa các database**: Các bảng trong `question_db`, `assessment_db`, `exam_db`, `attempt_db` không tạo ràng buộc `REFERENCES` sang bảng của service khác.
- **Liên kết Logic qua Prefixed String IDs**: Mọi tham chiếu liên dịch vụ sử dụng khóa chuỗi định danh duy nhất (`VARCHAR(64)`), ví dụ `usr_...`, `node_...`, `q_...`, `asm_...`, `exm_...`, `att_...`.
- **Bảo đảm Tính toàn vẹn ở Tầng Ứng dụng (Application Layer Validation)**: Khi tạo Blueprint, Assessment Service kiểm tra sự tồn tại của `topicNodeId` qua Client Adapter của Taxonomy Service; khi Exam Service giải ma trận chọn câu hỏi, nó truy vấn Question Service qua gRPC/HTTP Client Port.

---

### 4.3. Thiết lập Biến Môi Trường (.env & .env.example) Đồng nhất Hệ Thống

Tất cả các dịch vụ đọc cấu hình từ file `.env` tại thư mục gốc Monorepo, đồng thời tài liệu hóa toàn bộ biến yêu cầu trong `.env.example`:

```env
# ============================================================================
# CƠ SỞ DỮ LIỆU POSTGRESQL THẬT (DATABASE-PER-SERVICE)
# Bắt buộc kết nối PostgreSQL thật - Tuyệt đối không dùng In-Memory
# ============================================================================
AUTH_DATABASE_URL=postgres://postgres:root@localhost:5432/auth_db
TAXONOMY_DATABASE_URL=postgres://postgres:root@localhost:5432/taxonomy_db
QUIZ_DATABASE_URL=postgres://postgres:root@localhost:5432/quiz_db

QUESTION_DATABASE_URL=postgres://postgres:root@localhost:5432/question_db
ASSESSMENT_DATABASE_URL=postgres://postgres:root@localhost:5432/assessment_db
EXAM_DATABASE_URL=postgres://postgres:root@localhost:5432/exam_db
ATTEMPT_DATABASE_URL=postgres://postgres:root@localhost:5432/attempt_db

# ============================================================================
# BẢO MẬT & XÁC THỰC (JWT RS256 & SECRETS)
# ============================================================================
JWT_SECRET=your_jwt_shared_secret_min_32_chars
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# ============================================================================
# CỔNG GIAO TIẾP DỊCH VỤ (SERVICE PORTS)
# ============================================================================
QUIZ_PORT=3000
AUTH_PORT=3001
TAXONOMY_PORT=3002
QUESTION_PORT=3003
ASSESSMENT_PORT=3004
EXAM_PORT=3005
ATTEMPT_PORT=3006
```

#### Câu lệnh Tạo Database PostgreSQL Nhanh trên Máy Phát triển:
```sql
-- Chạy trên psql console (postgres superuser)
CREATE DATABASE question_db;
CREATE DATABASE assessment_db;
CREATE DATABASE exam_db;
CREATE DATABASE attempt_db;
```

---

### 4.4. Chuẩn hóa Module Kết nối Database (`connection.ts`) cho Từng Dịch Vụ

Tất cả microservices đều triển khai file `src/infrastructure/db/connection.ts` theo đúng mẫu chuẩn hóa kiến trúc của `services/auth` và `services/quiz`, bao gồm:
- Hàm `loadEnvIfAvailable()` nạp đa tầng từ `.env`, `.env.local` hoặc root `.env`.
- Hàm `sanitizePostgresUrl(rawUrl)` gỡ bỏ các tham số query không hợp lệ.
- Singleton Client Pool `postgres(connectionString, { max: 15, idle_timeout: 30, connect_timeout: 10 })`.
- Đối tượng Drizzle ORM Singleton `get<Service>Db()`.
- Hàm giải phóng kết nối `close<Service>Db()` phục vụ graceful shutdown và cleanup bài test.

#### Mẫu Triển khai Chuẩn (`services/question/src/infrastructure/db/connection.ts`):
```typescript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlClient: postgres.Sql | null = null;
let envAttempted = false;

export function loadEnvIfAvailable(force = false): void {
  if (envAttempted && !force) return;
  envAttempted = true;

  if (!force && (process.env.NODE_ENV === 'test' || process.env.VITEST)) {
    return;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(__dirname, '../../../../../.env'),
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        if (typeof process.loadEnvFile === 'function') {
          process.loadEnvFile(envPath);
        } else {
          const content = fs.readFileSync(envPath, 'utf-8');
          for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx !== -1) {
              const key = trimmed.slice(0, eqIdx).trim();
              const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
              if (!process.env[key]) {
                process.env[key] = val;
              }
            }
          }
        }
      } catch {
        // bỏ qua lỗi đọc file
      }
      break;
    }
  }
}

export function sanitizePostgresUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has('schema')) {
      const schemaVal = parsed.searchParams.get('schema');
      parsed.searchParams.delete('schema');
      if (schemaVal && schemaVal !== 'public' && !parsed.searchParams.has('search_path')) {
        parsed.searchParams.set('search_path', schemaVal);
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl
      .replace(/([?&])schema=public(&|$)/g, (_m, p1, p2) => (p2 === '&' ? p1 : ''))
      .replace(/([?&])schema=([^&#]+)(&|$)/g, (_m, p1, schemaVal, p2) => {
        const next = p2 === '&' ? '&' : '';
        return `${p1}search_path=${schemaVal}${next}`;
      })
      .replace(/\?$/, '');
  }
}

export function getQuestionDatabaseUrl(): string | undefined {
  loadEnvIfAvailable();
  const url = process.env.QUESTION_DATABASE_URL?.trim();
  if (!url || url === 'QUESTION_DATABASE_URL') return undefined;
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    return undefined;
  }
  return sanitizePostgresUrl(url);
}

export function isQuestionDbConfigured(): boolean {
  return Boolean(getQuestionDatabaseUrl());
}

export function getQuestionDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString = getQuestionDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      'FATAL ERROR: QUESTION_DATABASE_URL is not defined in environment variables. ' +
      'In-memory persistence has been permanently removed; PostgreSQL (question_db) is strictly required.'
    );
  }

  sqlClient = postgres(connectionString, {
    max: 15,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });

  dbInstance = drizzle(sqlClient, { schema });
  return dbInstance;
}

export async function closeQuestionDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
    dbInstance = null;
  }
}
```

*(Tương tự, các file `services/assessment/src/infrastructure/db/connection.ts`, `services/exam/src/infrastructure/db/connection.ts`, và `services/attempt/src/infrastructure/db/connection.ts` được áp dụng mẫu thiết kế này với các hàm tương ứng `getAssessmentDb()`, `getExamDb()`, `getAttemptDb()` và các biến môi trường tương ứng).*

---

### 4.5. Cấu hình Drizzle ORM (`drizzle.config.ts`) cho Từng Dịch Vụ

Mỗi dịch vụ có file cấu hình Drizzle riêng biệt độc lập:

#### `services/question/drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit';
import { getQuestionDatabaseUrl } from './src/infrastructure/db/connection.js';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getQuestionDatabaseUrl() || 'postgres://postgres:root@localhost:5432/question_db',
  },
  verbose: true,
  strict: true,
});
```

#### `services/assessment/drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit';
import { getAssessmentDatabaseUrl } from './src/infrastructure/db/connection.js';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getAssessmentDatabaseUrl() || 'postgres://postgres:root@localhost:5432/assessment_db',
  },
  verbose: true,
  strict: true,
});
```

#### `services/exam/drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit';
import { getExamDatabaseUrl } from './src/infrastructure/db/connection.js';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getExamDatabaseUrl() || 'postgres://postgres:root@localhost:5432/exam_db',
  },
  verbose: true,
  strict: true,
});
```

#### `services/attempt/drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit';
import { getAttemptDatabaseUrl } from './src/infrastructure/db/connection.js';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getAttemptDatabaseUrl() || 'postgres://postgres:root@localhost:5432/attempt_db',
  },
  verbose: true,
  strict: true,
});
```

---

### 4.6. Quy ước Định danh ID Toàn Hệ Thống (Prefixed String IDs - `VARCHAR(64)`)
Đồng nhất 100% với convention hiện hữu (`usr_...`, `tax_...`, `node_...`):
- Question Service: `q_<hash/uuid>` (câu hỏi), `qrev_<uuid>` (phiên bản câu hỏi).
- Assessment Service: `asm_<uuid>` (bài đánh giá/khung đề), `bp_<uuid>` (blueprint).
- Exam Service: `exm_<uuid>` (kỳ thi/đề thi), `exv_<code_seed>` (biến thể đề thi/variant), `snp_<hash>` (gói snapshot đóng băng).
- Attempt Service: `att_<uuid>` (phiên làm bài), `evt_<uuid>` (sự kiện audit chống gian lận).

---

### 4.7. Chi tiết Drizzle ORM Schema cho Từng Dịch Vụ

#### 1. Question Service Schema (`services/question/src/infrastructure/db/schema.ts`)
```typescript
import { pgTable, varchar, text, integer, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const questions = pgTable('questions', {
  id: varchar('id', { length: 64 }).primaryKey(), // q_xxxx
  code: varchar('code', { length: 64 }).notNull().unique(), // MÃ ĐỊNH DANH (VD: MATH10-ALG-001)
  type: varchar('type', { length: 32 }).notNull(), // SINGLE, MULTIPLE, FILL_IN, MATCHING, ORDERING, NUMERIC, ESSAY
  topicNodeId: varchar('topic_node_id', { length: 64 }), // Khóa logic tham chiếu sang taxonomy_nodes (TOPIC)
  gradeNodeId: varchar('grade_node_id', { length: 64 }), // Khóa logic tham chiếu sang taxonomy_nodes (GRADE)
  difficulty: varchar('difficulty', { length: 32 }).notNull().default('REMEMBER'), // REMEMBER, UNDERSTAND, APPLY, ANALYZE
  defaultPoints: integer('default_points').notNull().default(1),
  status: varchar('status', { length: 32 }).notNull().default('ACTIVE'), // DRAFT, ACTIVE, DEPRECATED
  currentRevisionId: varchar('current_revision_id', { length: 64 }),
  ownerId: varchar('owner_id', { length: 64 }).notNull(), // Giảng viên sở hữu (ABAC)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_questions_topic').on(table.topicNodeId),
  index('idx_questions_grade').on(table.gradeNodeId),
  index('idx_questions_difficulty').on(table.difficulty),
  index('idx_questions_status').on(table.status),
  index('idx_questions_owner').on(table.ownerId),
]);

export const questionRevisions = pgTable('question_revisions', {
  id: varchar('id', { length: 64 }).primaryKey(), // qrev_xxxx
  questionId: varchar('question_id', { length: 64 }).notNull().references(() => questions.id, { onDelete: 'cascade' }),
  revisionNumber: integer('revision_number').notNull(),
  prompt: text('prompt').notNull(), // Nội dung câu hỏi (chứa Markdown + LaTeX: $$...$$)
  options: jsonb('options').$type<Array<{ id: string; content: string; isCorrect: boolean; explanation?: string }>>().notNull(),
  pairs: jsonb('pairs').$type<Array<{ leftId: string; leftText: string; rightId: string; rightText: string }>>(),
  explanation: text('explanation'), // Lời giải chi tiết (chứa KaTeX)
  rubric: jsonb('rubric').$type<Record<string, unknown>>(), // Barem chấm điểm cho dạng câu phức tạp
  mediaAssets: jsonb('media_assets').$type<Array<{ type: 'IMAGE' | 'AUDIO' | 'VIDEO'; url: string; caption?: string }>>(),
  createdBy: varchar('created_by', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_question_revision').on(table.questionId, table.revisionNumber),
  index('idx_qrev_question').on(table.questionId),
]);
```

#### 2. Assessment Service Schema (`services/assessment/src/infrastructure/db/schema.ts`)
```typescript
import { pgTable, varchar, text, integer, numeric, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';

export const assessments = pgTable('assessments', {
  id: varchar('id', { length: 64 }).primaryKey(), // asm_xxxx
  code: varchar('code', { length: 64 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  ownerId: varchar('owner_id', { length: 64 }).notNull(),
  primaryTopicNodeId: varchar('primary_topic_node_id', { length: 64 }),
  gradeNodeId: varchar('grade_node_id', { length: 64 }),
  status: varchar('status', { length: 32 }).notNull().default('DRAFT'), // DRAFT, REVIEW, APPROVED, ARCHIVED
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_assessments_topic').on(table.primaryTopicNodeId),
  index('idx_assessments_grade').on(table.gradeNodeId),
  index('idx_assessments_status').on(table.status),
  index('idx_assessments_owner').on(table.ownerId),
]);

export const blueprints = pgTable('blueprints', {
  id: varchar('id', { length: 64 }).primaryKey(), // bp_xxxx
  assessmentId: varchar('assessment_id', { length: 64 }).notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull().default(1),
  durationMinutes: integer('duration_minutes').notNull().default(45),
  passingPercentage: numeric('passing_percentage', { precision: 5, scale: 2 }).notNull().default('50.00'),
  maxAttempts: integer('max_attempts').notNull().default(1),
  // Cấu hình ma trận phân bổ: danh sách tiêu chí chọn câu hỏi theo Bloom Taxonomy
  criteria: jsonb('criteria').$type<Array<{
    topicNodeId: string;
    difficulty: 'REMEMBER' | 'UNDERSTAND' | 'APPLY' | 'ANALYZE';
    questionCount: number;
    pointsPerQuestion: number;
  }>>().notNull().default([]),
  // Cấu hình tính điểm: Standard, Partial, Negative Marking
  scoringPolicy: jsonb('scoring_policy').$type<{
    strategyType: 'STANDARD' | 'PARTIAL' | 'ALL_OR_NOTHING';
    negativeMarkingPenalty?: number;
    roundingDecimal?: number;
    partialScoringThreshold?: number;
  }>().notNull(),
  isLocked: boolean('is_locked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_blueprints_assessment').on(table.assessmentId),
]);
```

#### 3. Exam Service Schema (`services/exam/src/infrastructure/db/schema.ts`)
```typescript
import { pgTable, varchar, text, integer, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const exams = pgTable('exams', {
  id: varchar('id', { length: 64 }).primaryKey(), // exm_xxxx
  assessmentId: varchar('assessment_id', { length: 64 }).notNull(), // Tham chiếu logic sang Assessment Service
  code: varchar('code', { length: 64 }).notNull().unique(), // VD: HK1-TOAN10-2026
  title: varchar('title', { length: 255 }).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime: timestamp('end_time', { withTimezone: true }),
  durationMinutes: integer('duration_minutes').notNull(),
  isPublished: boolean('is_published').notNull().default(false),
  randomizationSeedBase: integer('randomization_seed_base').notNull().default(1337),
  status: varchar('status', { length: 32 }).notNull().default('READY'), // READY, ACTIVE, CLOSED
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_exams_assessment').on(table.assessmentId),
  index('idx_exams_status').on(table.status),
]);

// Snapshot bất biến của đề thi đã được giải ma trận và đóng băng (Frozen Exam Package)
export const examSnapshots = pgTable('exam_snapshots', {
  id: varchar('id', { length: 64 }).primaryKey(), // snp_xxxx
  examId: varchar('exam_id', { length: 64 }).notNull().references(() => exams.id, { onDelete: 'cascade' }),
  variantCode: varchar('variant_code', { length: 32 }).notNull(), // VD: "101", "102", "DEFAULT"
  contentHash: varchar('content_hash', { length: 64 }).notNull(), // SHA-256 xác thực tính toàn vẹn
  // Dữ liệu câu hỏi gốc đầy đủ (Bao gồm đáp án đúng để phục vụ chấm thi)
  frozenPayload: jsonb('frozen_payload').$type<{
    questions: Array<{
      id: string;
      revisionId: string;
      type: string;
      prompt: string;
      options: Array<{ id: string; content: string; isCorrect: boolean; explanation?: string }>;
      points: number;
      explanation?: string;
      rubric?: Record<string, unknown>;
    }>;
    scoringPolicy: Record<string, unknown>;
  }>().notNull(),
  // Dữ liệu đã khử trùng (Sanitized) phát cho thí sinh (ĐÃ XÓA SẠCH isCorrect, explanation)
  sanitizedManifest: jsonb('sanitized_manifest').$type<{
    examId: string;
    variantCode: string;
    title: string;
    durationMinutes: number;
    totalQuestions: number;
    totalPoints: number;
    questions: Array<{
      id: string;
      type: string;
      prompt: string;
      options: Array<{ id: string; content: string }>; // KHÔNG CÓ isCorrect
      points: number;
    }>;
    serverTimestamp: number;
  }>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_exam_variant').on(table.examId, table.variantCode),
  index('idx_exam_snapshots_exam').on(table.examId),
]);
```

#### 4. Attempt Service Schema (`services/attempt/src/infrastructure/db/schema.ts`)
```typescript
import { pgTable, varchar, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const attempts = pgTable('attempts', {
  id: varchar('id', { length: 64 }).primaryKey(), // att_xxxx
  userId: varchar('user_id', { length: 64 }).notNull(),
  examId: varchar('exam_id', { length: 64 }).notNull(), // Tham chiếu logic sang Exam Service
  snapshotId: varchar('snapshot_id', { length: 64 }).notNull(), // Tham chiếu snapshot đề thi bất biến
  variantCode: varchar('variant_code', { length: 32 }).notNull().default('DEFAULT'),
  status: varchar('status', { length: 32 }).notNull().default('CREATED'), // CREATED, IN_PROGRESS, PAUSED, SUBMITTED, EXPIRED
  startedAt: timestamp('started_at', { withTimezone: true }),
  deadline: timestamp('deadline', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes').notNull(),
  // Lưu nháp câu trả lời: Cập nhật liên tục với độ trễ thấp (<25ms)
  answers: jsonb('answers').$type<Record<string, {
    answer: unknown;
    answeredAt: string;
    sequenceNumber: number;
    clientTimestamp?: number;
  }>>().notNull().default({}),
  // Bảng điểm tổng hợp và chi tiết từng câu sau khi hoàn tất chấm thi
  scoreResult: jsonb('score_result').$type<{
    score: number;
    maxScore: number;
    percentage: number;
    passed: boolean;
    evaluatedAt: string;
    breakdown: Record<string, {
      questionId: string;
      isCorrect: boolean;
      scoreAwarded: number;
      maxScore: number;
      candidateAnswer: unknown;
      correctAnswer?: unknown;
      explanation?: string;
      feedback?: string;
    }>;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_attempts_user_exam').on(table.userId, table.examId),
  index('idx_attempts_status_deadline').on(table.status, table.deadline), // Phục vụ Background Sweeper
]);

// Bảng kiểm toán chống gian lận (Anti-cheat Telemetry Events Audit)
export const attemptEvents = pgTable('attempt_events', {
  id: varchar('id', { length: 64 }).primaryKey(), // evt_xxxx
  attemptId: varchar('attempt_id', { length: 64 }).notNull().references(() => attempts.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 64 }).notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(), // TAB_SWITCH, BLUR, FULLSCREEN_EXIT, PASTE_DETECTED
  clientTimestamp: timestamp('client_timestamp', { withTimezone: true }).notNull(),
  serverTimestamp: timestamp('server_timestamp', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [
  index('idx_events_attempt').on(table.attemptId),
  index('idx_events_user_time').on(table.userId, table.serverTimestamp),
]);
```

---

### 4.8. Scripts Quản lý Migration & Seeding trên PostgreSQL Thật

Tất cả các dịch vụ độc lập đều được cấu hình các scripts quản lý vòng đời cơ sở dữ liệu đồng nhất trong `package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:seed": "node --loader ts-node/esm src/infrastructure/db/seed.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

#### Các lệnh thực thi đồng loạt từ Root Monorepo:
```bash
# Đẩy schema lên các database PostgreSQL độc lập
pnpm --filter @platform/question-service run db:push
pnpm --filter @platform/assessment-service run db:push
pnpm --filter @platform/exam-service run db:push
pnpm --filter @platform/attempt-service run db:push

# Nạp dữ liệu mẫu ban đầu (Seed initial questions, blueprints & exams)
pnpm --filter @platform/question-service run db:seed
pnpm --filter @platform/assessment-service run db:seed
pnpm --filter @platform/exam-service run db:seed
```

---

## 5. THUẬT TOÁN XÁO HẠT GIỐNG & PHÒNG VỆ SANITIZATION

### 5.1. Thuật toán Xáo hạt giống (Deterministic Random / Seed-based Shuffle) trong Exam Service
Nhằm đáp ứng yêu cầu:
1. Mỗi thí sinh có một thứ tự câu hỏi và phương án riêng biệt chống nhìn bài nhau.
2. Ban giám thị hoặc hội đồng phúc khảo có thể tái hiện chính xác 100% đề thi của thí sinh đó chỉ bằng hạt giống (`seed`).

```typescript
// Implement PRNG Mulberry32 (Deterministic Pseudo-Random Generator)
export class DeterministicPRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  // Trả về số thực [0, 1) chuẩn xác
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Shuffle mảng bằng thuật toán Fisher-Yates kết hợp PRNG
  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
```

### 5.2. Ranh giới Khử trùng Dữ liệu (Sanitization Boundary Enforcement)
- **Tuyệt đối không rò rỉ đáp án đúng**:
  - `Exam Service` tạo 2 phiên bản: `frozenPayload` (chứa `isCorrect`, `explanation`, `rubric`) được lưu trữ bảo mật và CHỈ cung cấp cho `Attempt Service` khi chấm điểm; và `sanitizedManifest` (đã strip sạch toàn bộ `isCorrect`, `explanation`) để trả về cho Frontend thí sinh.
  - Ngăn ngừa hoàn toàn rủi ro thí sinh mở `DevTools -> Network Tab` để xem đáp án đúng.

---

## 6. GIAO THỨC GIAO TIẾP LIÊN DỊCH VỤ & UNIFIED GATEWAY (PORT 3000)

### 6.1. Tuân thủ Quy chuẩn Cổng Duy Nhất Port 3000 của Hạ Tầng
Theo quy định hệ thống, chỉ có duy nhất **Port 3000** được cấp phép ra ngoài thông qua Reverse Proxy. Trong kiến trúc monorepo:
- Các microservices được thiết kế dưới dạng các module Express Router độc lập (`createQuestionRouter`, `createAssessmentRouter`, `createExamRouter`, `createAttemptRouter`).
- Tại file entry point chính (`services/quiz/src/presentation/server.ts` hoặc router gateway trung tâm), các router được mount vào các prefix đường dẫn tương ứng:

```
Port 3000 Reverse Proxy / Express Gateway:
  ├── /v1/auth/*         -> Auth Service Router
  ├── /v1/taxonomies/*   -> Taxonomy Service Router
  ├── /v1/questions/*    -> Question Service Router
  ├── /v1/assessments/*  -> Assessment Service Router
  ├── /v1/exams/*        -> Exam Service Router
  ├── /v1/attempts/*     -> Attempt Service Router
  ├── /admin/*           -> Admin Web Frontend (React 19 + Tailwind CSS)
  └── /*                 -> Quiz Web Frontend (React 19 + Tailwind CSS)
```

### 6.2. Giao tiếp Trực tiếp giữa các Microservices (Inter-Service Ports)
- Để đảm bảo hiệu năng tối đa và sẵn sàng cho môi trường distributed độc lập, giao tiếp giữa các services được trừu tượng hóa thông qua **Driven Ports**:
  - `ExamService` phụ thuộc vào `QuestionClientPort` (truy vấn danh sách câu hỏi theo tiêu chí từ `question_db`) và `AssessmentClientPort` (lấy thông tin Blueprint từ `assessment_db`).
  - `AttemptService` phụ thuộc vào `ExamClientPort` (truy vấn snapshot và manifest từ `exam_db`).
- **Nguyên tắc Thực thi**: Triển khai Adapter bằng Module Service Delegation (Inter-Service Direct Domain Client) hoặc HTTP Client nội bộ. Mỗi Service Instance vận hành độc lập, đọc ghi 100% trên **PostgreSQL Database riêng** của mình, tuyệt đối không chia sẻ bộ nhớ RAM hay dùng in-memory cache làm nguồn chân lý (Single Source of Truth là Real PostgreSQL).

---

## 7. TÍCH HỢP FRONTEND (REACT 19 + TAILWIND CSS) & CONTRACTS

### 7.1. Cập nhật `packages/contracts` (`@platform/contracts`)
Tách các module contracts thành các thư mục tương ứng:
- `packages/contracts/src/question/`: DTOs câu hỏi, dạng thức RichText/LaTeX, phân loại Bloom.
- `packages/contracts/src/assessment/`: DTOs Blueprint, quy tắc ma trận, Scoring policy config.
- `packages/contracts/src/exam/`: DTOs Exam summary, Exam Variant, Sanitized Manifest.
- `packages/contracts/src/attempt/`: DTOs Attempt session, Autosave payload, Anti-cheat events, Score breakdown.

### 7.2. Cập nhật Frontend `apps/admin-web` (Giảng viên / Quản trị viên)
- **Question Management View**: Trình soạn thảo câu hỏi hỗ trợ xem trước LaTeX/KaTeX thời gian thực (Live Preview), upload media, phân loại Topic & Grade qua Taxonomy Selector.
- **Assessment Blueprint Builder**: Giao diện thiết lập ma trận đề thi trực quan, kéo thả phân bổ tỷ lệ độ khó theo Bloom Taxonomy, cấu hình thời gian và thang điểm.
- **Exam Publication Hub**: Xem trước các đề thi đã sinh, kiểm tra phân bổ câu hỏi, xem trước các biến thể đề (Variants 101, 102...) và mã băm SHA-256.

### 7.3. Cập nhật Frontend `apps/quiz-web` (Thí sinh làm bài)
- **Exam Selection & Start Screen**: Nhận diện kỳ thi từ mã code, đồng bộ đồng hồ máy chủ qua `TimeSyncManager` (Cristian's Algorithm).
- **Active Exam Runner**:
  - Tải `sanitizedManifest` từ Attempt Service.
  - Hỗ trợ render đầy đủ công thức toán học KaTeX/LaTeX, hình ảnh minh họa sắc nét.
  - Tích hợp hook `useAutosave` với cơ chế Debounce + Retry + Sequence protection.
  - Tích hợp `AntiCheatMonitor` ghi nhận các sự kiện tab switch/blur gửi về Attempt Service.
- **Result & Review Screen**: Hiển thị bảng điểm chi tiết, phân tích điểm mạnh/yếu theo từng chủ đề trong cây tri thức.

---

## 8. KẾ HOẠCH & LỘ TRÌNH TRIỂN KHAI TỪNG BƯỚC (ROADMAP)

Lộ trình được chia thành **7 giai đoạn rõ ràng**, đảm bảo hệ thống luôn biên dịch thành công (`compile_applet`), chạy thông suốt không gây gián đoạn (Zero Downtime) và tiến tới loại bỏ hoàn toàn `services/quiz` monolithic cũ:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 1: Chuẩn hóa Contracts & DTOs (@platform/contracts)                   │
│ - Mở rộng schemas cho Question, Assessment, Exam, Attempt                        │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 2: Xây dựng Question Service & Assessment Service (Authoring Split)    │
│ - Tách ngân hàng câu hỏi độc lập (RichText, LaTeX, Media, Revisions)             │
│ - Tách quản lý Blueprint và ma trận đề thi                                       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 3: Xây dựng Exam Service (Matrix Solver & Seed-based Shuffle)          │
│ - Thuật toán Fisher-Yates + Mulberry32 PRNG                                      │
│ - Đóng băng đề thi bất biến (SHA-256 Immutable Snapshot)                         │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 4: Xây dựng Attempt Service (High-Write Runtime Engine)                │
│ - Máy trạng thái FSM, Autosave <25ms, Server Timer Sync                          │
│ - Telemetry chống gian lận, Background Sweeper & Auto-Grading                    │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 5: Tích hợp Unified Gateway & Cập nhật Frontend SDK                    │
│ - Cập nhật router trên Port 3000, nâng cấp @platform/api-client                  │
│ - Kết nối quiz-web & admin-web sang các API endpoints mới                       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 6: Khởi tạo Dữ liệu Mới (Clean Bootstrap/Seed), Kiểm thử Tải & E2E     │
│ - KHÔNG migrate dữ liệu cũ sang mới (tránh Technical Debt & Schema Pollution)    │
│ - Khởi tạo sạch 100% dữ liệu chuẩn mực cho Question, Assessment, Exam, Attempt   │
│ - Kiểm thử tải & độ trễ (Autosave <25ms, Matrix Solver, Gateway Concurrency)     │
│ - Xác thực thông suốt toàn bộ luồng E2E trên 4 microservices độc lập             │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 7: Loại bỏ Hoàn toàn Quiz Service Cũ (Full Decommission Legacy Service)│
│ - Chuyển Unified Gateway thành Pure API Gateway (Reverse Proxy / Routing Port)   │
│ - Xóa bỏ toàn bộ mã nguồn legacy: domain/legacy, entities, use-cases cũ           │
│ - Gỡ bỏ database quiz_db và biến QUIZ_DATABASE_URL khỏi hệ thống                 │
│ - Hoàn tất chuyển đổi sang 100% Microservices thuần khiết (Zero Dead Code)       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 8.1. Chi tiết Giai đoạn 6: Khởi tạo Dữ liệu Mới (Clean Bootstrap/Seed), Kiểm thử Tải & Hoàn thiện

**Quyết định Thiết kế Trọng yếu**: **Không thực hiện di trú (migration) dữ liệu từ `quiz_db` cũ sang các schema mới**. 
- *Lý do*: Cấu trúc dữ liệu cũ có tính kết dính cao (monolithic coupling), thiếu phân tầng Bloom, chưa hỗ trợ snapshot bất biến và thiếu trường dữ liệu chuẩn hóa cho RichText/LaTeX/Audit logs. Việc viết adapter di trú dữ liệu cũ sẽ đưa các trường dữ liệu khiếm khuyết hoặc lỗi thời vào các database mới, gây ra nợ kỹ thuật (technical debt) không đáng có.
- *Giải pháp*: **Khởi tạo dữ liệu mới 100% (Fresh Clean Seeding)** với chuẩn dữ liệu cao nhất của hệ thống:
  1. **Khởi tạo Ngân hàng Câu hỏi Chuẩn hóa (`question_db`)**:
     - Tạo bộ câu hỏi mẫu đa dạng phân loại: Toán học (LaTeX/KaTeX), Khoa học tự nhiên, Khoa học xã hội, Tin học.
     - Đầy đủ các định dạng: Single Choice, Multiple Choice, True/False, Fill-in-the-blank, Matching, Numeric.
     - Gắn nhãn taxonomy chính xác (`topicNodeId`, `gradeNodeId`) và phân cấp độ nhận thức chuẩn Bloom Taxonomy (Remember, Understand, Apply, Analyze).
  2. **Khởi tạo Khung Đề thi & Ma trận Chuẩn mực (`assessment_db`)**:
     - Các bản Blueprint mẫu chuẩn mực với quy tắc ma trận phân bổ độ khó nghiêm ngặt (ví dụ: 40% Nhận biết, 30% Thông hiểu, 20% Vận dụng, 10% Vận dụng cao).
     - Thiết lập chính sách chấm điểm (`ScoringPolicy`), giới hạn thời gian (15 phút, 45 phút, 90 phút), số lượt làm bài cho phép và chính sách công bố kết quả (`IMMEDIATE`, `AFTER_DEADLINE`, `MANUAL`).
  3. **Sinh & Đóng băng Kỳ thi Chính thức (`exam_db`)**:
     - Sinh các đề thi hoàn chỉnh từ Blueprint qua thuật toán Matrix Solver.
     - Sinh các biến thể mã đề (Variants 101, 102, 103, 104) với xáo trộn có hạt giống (Seed-based PRNG) và khóa bất biến bằng hàm băm SHA-256 (`snapshotHash`).
  4. **Kiểm thử Hiệu năng & Chịu tải (Load & Concurrency Performance Testing)**:
     - **Autosave High-Write Test**: Kiểm thử mô phỏng 500-1.000 thí sinh gửi câu trả lời đồng thời tới Attempt Service, đo lường tỷ lệ p99 latency đạt `<25ms` và không bị race condition nhờ `sequenceNumber`.
     - **Matrix Solver & Shuffle Benchmark**: Đánh giá tốc độ giải ma trận và sinh 10 bộ đề thi biến thể dưới 200ms.
     - **Gateway Throughput & Connection Pool**: Kiểm tra khả năng chịu tải của Unified Gateway trên Port 3000 khi đồng thời proxy dữ liệu tới 4 services.
  5. **Xác thực Luồng Nghiệp vụ Toàn vẹn (End-to-End Flow Verification)**:
     - Thử nghiệm thông suốt từ khâu giáo viên tạo câu hỏi ➔ xây dựng ma trận ➔ duyệt sinh đề thi ➔ thí sinh đăng nhập làm bài ➔ tự động lưu nháp ➔ thu thập sự kiện chống gian lận ➔ nộp bài và chấm điểm tự động.

---

### 8.2. Chi tiết Giai đoạn 7: Loại bỏ Hoàn toàn Quiz Service Cũ (Full Decommission of Legacy Quiz Service)

Mục tiêu của Giai đoạn 7 là dọn dẹp sạch sẽ (zero dead code), đưa hệ thống về trạng thái kiến trúc Microservices thuần khiết:

1. **Chuyển dịch Gateway thành Pure API Gateway**:
   - Tách rời mã nguồn của Gateway khỏi thư mục `services/quiz`.
   - Cổng 3000 trở thành API Gateway chuyên biệt (hoặc Reverse Proxy nhẹ), chỉ đảm nhiệm vai trò:
     - Xác thực JWT & phân quyền RBAC sơ bộ qua Auth Client.
     - Routing / Reverse Proxy các request đến đúng cổng đích:
       - `/v1/questions` ➔ Question Service (Port 3001)
       - `/v1/assessments` & `/v1/blueprints` ➔ Assessment Service (Port 3002)
       - `/v1/exams` ➔ Exam Service (Port 3003)
       - `/v1/attempts` & `/v1/time` ➔ Attempt Service (Port 3004)
     - Khám phá API (`/v1/api-discovery`) và Health Checks tổng thể hệ thống.
2. **Xóa bỏ Toàn bộ Mã Nguồn Monolithic Cũ trong `services/quiz`**:
   - Xóa các Domain Entities cũ (`Quiz`, `QuizVersion`, `QuizAttempt`, `QuizSession`).
   - Xóa các Use Cases cũ (`CreateQuizUseCase`, `SubmitAttemptUseCase` cũ, v.v.).
   - Xóa các Repositories cũ liên quan đến bảng `quizzes` và `quiz_attempts`.
   - Loại bỏ toàn bộ các router cũ `/v1/quizzes/*` sau khi kiểm tra frontend web đã chuyển hướng 100% sang API mới.
3. **Thu hồi Database `quiz_db` và Dọn dẹp Cấu hình**:
   - Gỡ bỏ database `quiz_db` khỏi PostgreSQL cluster.
   - Gỡ biến môi trường `QUIZ_DATABASE_URL` khỏi `.env`, `.env.example` và các file cấu hình Docker/CI-CD.
   - Dọn dẹp các script npm và build configurations thừa.
4. **Kiểm tra & Nghiệm thu Cuối cùng (Final Acceptance)**:
   - Chạy toàn bộ test suites của 4 services mới (`question`, `assessment`, `exam`, `attempt`) và `api-client`.
   - Biên dịch toàn bộ Monorepo (`compile_applet`) và kiểm tra tĩnh (`lint_applet`), xác nhận hệ thống hoàn toàn sạch mã rác, hiệu năng cao và sẵn sàng đưa vào vận hành sản phẩm thực tế.

---

## 9. KẾT LUẬN & GIÁ TRỊ MANG LẠI

Việc phân tách `services/quiz` thành 4 microservices chuyên biệt (**Question**, **Assessment**, **Exam**, **Attempt**) kết hợp với lộ trình dọn dẹp triệt để mang lại những giá trị mang tính bước ngoặt cho hệ thống:

1. **Hiệu năng vượt trội (Peak Performance)**: Module làm bài (**Attempt Service**) được giải phóng hoàn toàn khỏi các tác vụ nặng về tính toán và phân tích nội dung, cho phép xử lý hàng chục nghìn lượt ghi nháp đồng thời với độ trễ dưới 25ms.
2. **Khả năng mở rộng tối ưu (Elastic Scalability)**: Dễ dàng mở rộng tài nguyên tính toán (CPU) cho **Exam Service** trước giờ thi, và mở rộng tài nguyên I/O cho **Attempt Service** trong thời gian thi mà không gây lãng phí chi phí hạ tầng.
3. **Bảo mật & Toàn vẹn học thuật (Academic Integrity & Anti-Cheat)**: Thuật toán xáo hạt giống tái lập được 100%, mã băm SHA-256 chống chỉnh sửa đề thi, kết hợp ranh giới khử trùng dữ liệu tuyệt đối ngăn ngừa triệt để rủi ro lộ đáp án.
4. **Kiến trúc bền vững & Sạch bóng Nợ kỹ thuật (Pure Microservices & Zero Technical Debt)**: Tuân thủ nghiêm ngặt **Hexagonal Architecture** và **DDD**, xóa sạch mã monolithic cũ, bảo đảm mã nguồn trong sáng, phân tách rõ ràng giữa Core Business Rules và External Adapters, bảo đảm khả năng mở rộng không giới hạn cho hệ thống trong tương lai.
