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

## 4. THIẾT KẾ CƠ SỞ DỮ LIỆU & DRIZZLE ORM (DATABASE-PER-SERVICE)

Mỗi service sở hữu một Database Schema độc lập (Database-per-service pattern). Trong môi trường phát triển cục bộ và Cloud Run, các database này có thể là các database riêng rẽ trên cùng một PostgreSQL instance hoặc các cụm database tách biệt để tối ưu scaling.

### 4.1. Quy ước Định danh ID Toàn Hệ Thống (Prefixed String IDs - `VARCHAR(64)`)
Đồng nhất 100% với convention hiện hữu (`usr_...`, `tax_...`, `node_...`):
- Question Service: `q_<hash/uuid>` (câu hỏi), `qrev_<uuid>` (phiên bản câu hỏi).
- Assessment Service: `asm_<uuid>` (bài đánh giá/khung đề), `bp_<uuid>` (blueprint).
- Exam Service: `exm_<uuid>` (kỳ thi/đề thi), `exv_<code_seed>` (biến thể đề thi/variant), `snp_<hash>` (gói snapshot đóng băng).
- Attempt Service: `att_<uuid>` (phiên làm bài), `evt_<uuid>` (sự kiện audit chống gian lận).

---

### 4.2. Chi tiết Drizzle ORM Schema cho Từng Dịch Vụ

#### 1. Question Service Schema (`services/question/src/infrastructure/db/schema.ts`)
```typescript
import { pgTable, varchar, text, integer, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const questions = pgTable('questions', {
  id: varchar('id', { length: 64 }).primaryKey(), // q_xxxx
  code: varchar('code', { length: 64 }).notNull().unique(), // MÃ ĐỊNH DANH (VD: MATH10-ALG-001)
  type: varchar('type', { length: 32 }).notNull(), // SINGLE, MULTIPLE, FILL_IN, MATCHING, ORDERING, NUMERIC
  topicNodeId: varchar('topic_node_id', { length: 64 }), // Khóa ngoại logic sang taxonomy_nodes (TOPIC)
  gradeNodeId: varchar('grade_node_id', { length: 64 }), // Khóa ngoại logic sang taxonomy_nodes (GRADE)
  difficulty: varchar('difficulty', { length: 32 }).notNull().default('MEDIUM'), // REMEMBER, UNDERSTAND, APPLY, ANALYZE
  defaultPoints: integer('default_points').notNull().default(1),
  status: varchar('status', { length: 32 }).notNull().default('ACTIVE'), // DRAFT, ACTIVE, DEPRECATED
  currentRevisionId: varchar('current_revision_id', { length: 64 }),
  ownerId: varchar('owner_id', { length: 64 }).notNull(), // Giảng viên sở hữu
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_questions_topic').on(table.topicNodeId),
  index('idx_questions_grade').on(table.gradeNodeId),
  index('idx_questions_difficulty').on(table.difficulty),
  index('idx_questions_status').on(table.status),
]);

export const questionRevisions = pgTable('question_revisions', {
  id: varchar('id', { length: 64 }).primaryKey(), // qrev_xxxx
  questionId: varchar('question_id', { length: 64 }).notNull().references(() => questions.id, { onDelete: 'cascade' }),
  revisionNumber: integer('revision_number').notNull(),
  prompt: text('prompt').notNull(), // Nội dung câu hỏi (chứa Markdown + LaTeX: $$...$$)
  options: jsonb('options').$type<Array<{ id: string; content: string; isCorrect: boolean }>>().notNull(), // Dữ liệu phương án
  explanation: text('explanation'), // Lời giải chi tiết (chứa KaTeX)
  rubric: jsonb('rubric').$type<Record<string, unknown>>(), // Barem chấm điểm cho dạng câu phức tạp
  mediaAssets: jsonb('media_assets').$type<Array<{ type: 'IMAGE' | 'AUDIO'; url: string; caption?: string }>>(),
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
]);

export const blueprints = pgTable('blueprints', {
  id: varchar('id', { length: 64 }).primaryKey(), // bp_xxxx
  assessmentId: varchar('assessment_id', { length: 64 }).notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull().default(1),
  durationMinutes: integer('duration_minutes').notNull().default(45),
  passingPercentage: numeric('passing_percentage', { precision: 5, scale: 2 }).notNull().default('50.00'),
  maxAttempts: integer('max_attempts').notNull().default(1),
  // Cấu hình ma trận phân bổ: danh sách tiêu chí chọn câu hỏi
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
      options: Array<{ id: string; content: string; isCorrect: boolean }>;
      points: number;
      explanation?: string;
    }>;
    scoringPolicy: Record<string, unknown>;
  }>().notNull(),
  // Dữ liệu đã khử trùng (Sanitized) sẵn sàng phát cho client (ĐÃ XÓA SẠCH isCorrect, explanation)
  sanitizedManifest: jsonb('sanitized_manifest').$type<{
    questions: Array<{
      id: string;
      type: string;
      prompt: string;
      options: Array<{ id: string; content: string }>; // KHÔNG CÓ isCorrect
      points: number;
    }>;
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
  status: varchar('status', { length: 32 }).notNull().default('CREATED'), // CREATED, IN_PROGRESS, SUBMITTED, EXPIRED
  startedAt: timestamp('started_at', { withTimezone: true }),
  deadline: timestamp('deadline', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  // Lưu nháp câu trả lời: Cập nhật liên tục với độ trễ thấp
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
      isCorrect: boolean;
      scoreAwarded: number;
      maxScore: number;
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
]);
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
- Để đảm bảo hiệu năng tối đa khi chạy in-process và sẵn sàng cho môi trường distributed độc lập trong tương lai, giao tiếp giữa các services được trừu tượng hóa thông qua **Driven Ports**:
  - `ExamService` phụ thuộc vào `QuestionClientPort` (lấy danh sách câu hỏi theo tiêu chí) và `AssessmentClientPort` (lấy thông tin Blueprint).
  - `AttemptService` phụ thuộc vào `ExamClientPort` (lấy thông tin Snapshot và Manifest đã khử trùng).
- Trong môi trường Monorepo hiện tại: Triển khai Adapter bằng In-Memory Client / Dynamic Module Delegation với xác thực HMAC/JWT Token nội bộ (`x-internal-secret`), không sinh thêm overhead HTTP dư thừa nhưng vẫn giữ tách biệt 100% ranh giới domain.

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

Lộ trình được chia thành **6 giai đoạn rõ ràng**, đảm bảo hệ thống luôn biên dịch thành công (`compile_applet`), chạy thông suốt không gây gián đoạn (Zero Downtime) và có khả năng rollback nếu phát sinh sự cố.

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
│ GIAI ĐOẠN 6: Di trú Dữ liệu (Data Migration), Kiểm thử Tải & Hoàn thiện          │
│ - Viết script migrate từ schema cũ sang 4 schema mới                             │
│ - Chạy test suites (Vitest), kiểm thử tải đồng thời (Concurrency & Latency)      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. KẾT LUẬN & GIÁ TRỊ MANG LẠI

Việc phân tách `services/quiz` thành 4 microservices chuyên biệt (**Question**, **Assessment**, **Exam**, **Attempt**) mang lại những giá trị mang tính bước ngoặt cho hệ thống:

1. **Hiệu năng vượt trội (Peak Performance)**: Module làm bài (**Attempt Service**) được giải phóng hoàn toàn khỏi các tác vụ nặng về tính toán và phân tích nội dung, cho phép xử lý hàng chục nghìn lượt ghi nháp đồng thời với độ trễ dưới 25ms.
2. **Khả năng mở rộng tối ưu (Elastic Scalability)**: Dễ dàng mở rộng tài nguyên tính toán (CPU) cho **Exam Service** trước giờ thi, và mở rộng tài nguyên I/O cho **Attempt Service** trong thời gian thi mà không gây lãng phí chi phí hạ tầng.
3. **Bảo mật & Toàn vẹn học thuật (Academic Integrity & Anti-Cheat)**: Thuật toán xáo hạt giống tái lập được 100%, mã băm SHA-256 chống chỉnh sửa đề thi, kết hợp ranh giới khử trùng dữ liệu tuyệt đối ngăn ngừa triệt để rủi ro lộ đáp án.
4. **Kiến trúc bền vững (Maintainability & Clean Architecture)**: Tuân thủ nghiêm ngặt **Hexagonal Architecture** và **DDD**, mã nguồn trong sáng, phân tách rõ ràng giữa Core Business Rules và External Adapters, bảo đảm khả năng mở rộng không giới hạn cho hệ thống trong tương lai.
