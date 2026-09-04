# TÀI LIỆU THIẾT KẾ KIẾN TRÚC VÀ ĐẶC TẢ HỆ THỐNG QUIZ SERVICE
*(Quiz Assessment Core Engine: Domain-Driven Design & Hexagonal Architecture Specification)*  
**Dự án:** Platform Core / Quiz Assessment Engine & Auth System  
**Phiên bản:** v4.0 (Production-Ready Architecture with Zero-Trust Timing & Clock Synchronization Hardening)  
**Ngày cập nhật:** September 4, 2026  
**Trạng thái:** Hoàn tất 100% các tiêu chuẩn kiến trúc & kiểm toán ngoại biên (23/23 test files, 177/177 tests PASS).

---

## I. TỔNG QUAN HỆ THỐNG VÀ NGUYÊN TẮC THIẾT KẾ (SYSTEM OVERVIEW & DESIGN PRINCIPLES)

Quiz Service là lõi trung tâm của nền tảng thi và khảo sát trực tuyến, chịu trách nhiệm quản lý vòng đời đề thi (Authoring), điều phối quá trình làm bài thi (Delivery), thẩm định câu hỏi (Question Engine), tự động chấm điểm (Scoring Engine) và kiểm soát nghiêm ngặt bất biến thời gian thi (Zero-Trust Timing Engine). Hệ thống được xây dựng dựa trên các chuẩn mực kiến trúc công nghiệp:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                             QUIZ CORE ENGINE                                                │
├─────────────────────────────────────────────┬───────────────────────────────────────────────────────────────┤
│            SUB-DOMAIN AUTHORING             │                      SUB-DOMAIN DELIVERY                      │
│  - Quiz (Entity)                            │  - Attempt (Aggregate Root) & State Machine                   │
│  - QuizVersion (Immutable Snapshot)         │  - AttemptManifest (Frozen Order & Deadline Snapshot)         │
│  - Publishing Policy (Invariants Check)     │  - Two-Tier Invariants: Answer Deadline & Submission Cutoff   │
│  - AttemptPolicy (Retake / Max Attempts)    │  - Logical Sequence Concurrency Control (Zero Data Loss)      │
├─────────────────────────────────────────────┴───────────────────────────────────────────────────────────────┤
│                             ACTIVE TIMING & EXPIRY SWEEPER INFRASTRUCTURE                                   │
│  - AttemptExpirySweeperService (Daemon nền quét ca thi quá hạn & cưỡng chế chấm điểm TIMED_OUT_GRADED)       │
│  - Opportunistic Sweeper (Tự động thu bài khi có request đọc chi tiết ca thi quá hạn)                        │
│  - Endpoint /v1/internal/attempts/sweep (Hỗ trợ Cloud Scheduler & Cron Jobs bảo vệ qua Shared Secret & RBAC)│
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                         QUESTION & SCORING ENGINE                                           │
│  - Question Engine Registry (Single-choice, Multiple-choice, True/False, Extensible Handlers)               │
│  - Scoring Strategies (ExactMatch, PartialCredit, NegativeMarking) & Factory Architecture                   │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                  RESTFUL DOMAIN API & CLIENT SYNCHRONIZATION                                │
│  - RESTful /v1/quizzes (Catalog & Authoring), /v1/attempts (Delivery) & GET /v1/time (Clock Sync)           │
│  - Server Headers: X-Server-Time, X-Server-Timestamp (CORS Expose Headers)                                  │
│  - Client Cristian's Algorithm Clock Synchronization & Monotonic Anchor (TimeSyncManager)                   │
│  - Bảo vệ chữ ký số RS256/JWKS, Phân quyền RBAC & Chống truy cập trái phép ca thi (IDOR)                   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 10 Tiêu Chuẩn Kiến Trúc Cốt Lõi Vận Hành:
1. **Phân Định Sub-domain Rõ Rệt**: Tách biệt hoàn toàn giữa **Authoring** (biên soạn và xuất bản đề thi) và **Delivery** (quá trình thí sinh làm bài thi).
2. **Đóng Băng Thứ Tự Đề Thi (`AttemptManifest` Snapshot)**: Thứ tự câu hỏi và thứ tự lựa chọn đáp án được xáo trộn (shuffle) duy nhất một lần khi bắt đầu và đóng băng vĩnh viễn trong ca thi. Thí sinh tải lại trang, đổi thiết bị hay mất mạng đều giữ nguyên đề thi.
3. **Ranh Giới Khử Khuẩn Dữ Liệu (`DeliverySanitizer` Boundary)**: Tuyệt đối không gửi đáp án đúng (`correctAnswer`, `isCorrect`), giải thích (`explanation`) hay barem chấm điểm (`gradingRubric`) về phía trình duyệt khi thí sinh đang làm bài.
4. **Kiến Trúc Thời Gian Hai Tầng Chuẩn Xác (Two-Tier Server-Authoritative Timing Architecture)**:
   - **Tier 1 (Hạn chót trả lời - `deadline`)**: Khi `now > deadline`, hệ thống nghiêm cấm lưu thêm hoặc sửa đổi câu trả lời (`AttemptTimeExpiredError` - HTTP 400).
   - **Tier 2 (Hạn chót nộp bài - `submissionDeadline = deadline + 15s`)**: Khoảng ân hạn (Grace Period) 15 giây **chỉ dành riêng cho việc gửi gói tin nộp bài** qua mạng Internet. Nộp trong 15s được tính là `SUBMITTED` hợp lệ; sau 15s tự động chuyển thành `TIMED_OUT_GRADED`.
5. **Đồng Bộ Đồng Hồ Khách Hàng Chuẩn Thuật Toán Cristian (Cristian's Sync on Monotonic Time)**:
   - Client tính độ trễ mạng khứ hồi $\text{RTT} = T_{\text{client\_receive}} - T_{\text{client\_start}}$ và ước lượng giờ máy chủ: $T_{\text{server\_est}} = T_{\text{server}} + \frac{\text{RTT}}{2}$.
   - Neo mốc đồng hồ vào `performance.now()` (Monotonic Time), hoàn toàn miễn nhiễm với việc người dùng chỉnh lùi giờ hệ điều hành hoặc gian lận đồng hồ (Clock Tampering).
6. **Kiểm Soát Tranh Chấp Bằng Chuỗi Thứ Tự Logic (Logical Sequence Concurrency Control)**:
   - Mỗi câu trả lời được gán một số thứ tự logic tự tăng nghiêm ngặt (`sequenceNumber: 1, 2, 3...`) độc lập cho từng câu hỏi.
   - Server từ chối mọi gói tin out-of-order hoặc duplicate packet bằng `OutdatedAnswerSequenceError` (HTTP 409 Conflict, `errorCode: 'OUTDATED_ANSWER_SEQUENCE'`), bảo đảm không bao giờ bị ghi đè ngược do biến động độ trễ mạng (Network Jitter).
7. **Quét Ca Thi Quá Hạn Chủ Động & Cơ Hội (Active Daemon & Opportunistic Expiry Sweeper)**:
   - Nền tảng duy trì bộ quét nền định kỳ `AttemptExpirySweeperService` tự động thu bài và chấm điểm các ca thi bị thí sinh bỏ rơi (đóng tab, tắt máy).
   - Cơ chế Opportunistic Sweeper tự động phát hiện ca thi quá hạn và kích hoạt chấm điểm ngay khi có request truy vấn ca thi.
8. **Thu Bài Tự Động Nhân Đạo & Chống Mất Dữ Liệu (Graceful Auto-Submit & Zero Data Loss Flush)**:
   - Khi hết giờ, bài thi không bị hủy hay gán 0 điểm mà được tự động chuyển sang `TIMED_OUT_GRADED` và chấm điểm các câu đã kịp lưu.
   - Phía Client: Tự động hủy toàn bộ Debounced Autosave Timers và flush đồng loạt toàn bộ các câu trả lời đang chờ lên máy chủ trước khi gửi lệnh submit bài thi, triệt tiêu 100% nguy cơ mất dữ liệu câu hỏi cuối cùng.
9. **Chống Gian Lận Đa Tab & Phân Quyền Hạt Mịn (Anti-Fraud & RBAC)**:
   - Mỗi thí sinh chỉ được mở tối đa một lượt thi ở trạng thái `IN_PROGRESS` trên cùng một đề thi; chặn triệt để lỗ hổng IDOR, nghiêm cấm truy cập hoặc nộp bài vào ca thi của người khác.
10. **Độc Lập Dịch Vụ & Hợp Nhất Chữ Ký Số (Database-per-Service & RS256/JWKS)**:
    - Cơ sở dữ liệu của Auth Service và Quiz Service tách biệt hoàn toàn; liên kết qua Token Context và khóa công khai RS256 chuẩn công nghiệp.

---

## II. CẤU TRÚC PHÂN TẦNG VÀ TỔ CHỨC MÃ NGUỒN (`services/quiz/src`)

```text
services/quiz/src/
├── domain/                                    # Lớp Nghiệp Vụ Cốt Lõi (Domain)
│   ├── authoring/                             # Sub-domain Quản lý đề & Phiên bản
│   │   ├── quiz.entity.ts                     # Thực thể Quiz (Identity & Status)
│   │   ├── quiz-version.entity.ts             # Thực thể bất biến QuizVersion (Snapshot)
│   │   ├── publishing.policy.ts               # Bộ quy tắc Invariants khi xuất bản đề
│   │   └── attempt.policy.ts                  # Chính sách số lượt thi & thi lại
│   ├── delivery/                              # Sub-domain Phòng thi & Vận hành
│   │   ├── attempt.aggregate.ts               # Aggregate Root Attempt (Two-Tier Timing & Sequence Control)
│   │   ├── attempt-manifest.ts                # Snapshot thứ tự câu hỏi, options & deadline
│   │   ├── attempt-status.ts                  # Máy trạng thái State Machine & Transitions
│   │   └── delivery-sanitizer.ts              # Lọc đáp án bảo vệ đề thi
│   ├── question-engine/                       # Động cơ Xử lý Câu hỏi
│   │   ├── question.registry.ts               # Registry tra cứu & đăng ký handler
│   │   ├── question-handler.interface.ts      # Hợp đồng QuestionTypeHandler
│   │   └── handlers/
│   │       ├── single-choice.handler.ts       # Trắc nghiệm 1 đáp án
│   │       ├── multiple-choice.handler.ts     # Trắc nghiệm nhiều đáp án
│   │       └── true-false.handler.ts          # Câu hỏi Đúng / Sai
│   ├── scoring/                               # Động cơ Tính điểm
│   │   ├── assessment-scoring.engine.ts       # Điều phối chấm điểm toàn bài
│   │   ├── scoring.strategy.ts                # Hợp đồng ScoringStrategy
│   │   ├── strategies.ts                      # ExactMatch, PartialCredit, NegativeMarking
│   │   └── scoring.factory.ts                 # Factory khởi tạo chiến lược chấm
│   ├── context/                               # Ngữ cảnh phiên thi
│   │   └── quiz-context.ts
│   └── errors/                                # Danh mục Lỗi Nghiệp Vụ Chuẩn Hóa
│       └── domain-errors.ts                   # OutdatedAnswerSequenceError, AttemptTimeExpiredError...
├── application/                               # Lớp Điều Phối Tác Vụ (Use Cases & Services)
│   ├── dtos/                                  # Data Transfer Objects
│   │   └── quiz.dto.ts
│   ├── services/                              # Dịch Vụ Ứng Dụng Hạ Tầng Nền
│   │   └── attempt-expiry-sweeper.service.ts  # Bộ quét nền thu bài quá hạn & chấm điểm
│   └── use-cases/
│       ├── authoring/                         # AuthoringUseCases (create, version, publish)
│       │   └── authoring.use-cases.ts
│       ├── delivery/                          # DeliveryUseCases (create, start, answer, submit, sweep)
│       │   └── delivery.use-cases.ts
│       └── quiz.use-cases.ts
├── infrastructure/                            # Lớp Hạ Tầng & Kho Lưu Trữ (Repositories)
│   └── repositories/
│       ├── in-memory-quiz.repository.ts       # Kho lưu trữ Quiz & Versions
│       └── in-memory-assessment.repository.ts # Kho lưu trữ Ca thi (Attempts & Expiry Queries)
└── presentation/                              # Lớp Giao Diện HTTP & Middlewares
    ├── middlewares/
    │   ├── auth.middleware.ts                 # Xác thực chữ ký số JWT RS256/HS256
    │   └── rbac.middleware.ts                 # Phân quyền Role & Kiểm tra IDOR
    ├── routes/
    │   ├── v1-quizzes.routes.ts               # RESTful API Authoring & Catalog
    │   ├── v1-attempts.routes.ts              # RESTful API Delivery Phòng thi & Lưu đáp án
    │   ├── v1-time.routes.ts                  # RESTful API Đồng bộ thời gian máy chủ (GET /v1/time)
    │   └── v1-internal.routes.ts              # RESTful API Quản trị & Sweeper (POST /v1/internal/attempts/sweep)
    └── server.ts                              # Express Server kèm Middleware X-Server-Time & Sweeper Startup

apps/quiz-web/src/                             # Giao Diện Web Khách Hàng (Client Application)
├── utils/
│   └── TimeSyncManager.ts                     # Quản lý đồng bộ giờ Cristian Algorithm & Monotonic Anchor
├── hooks/
│   ├── useServerCountdown.ts                  # Hook đếm ngược thời gian chính xác, chống trôi/sleep
│   └── useQuizSession.ts                      # Hook điều phối thi, Monotonic Sequence & Autosave Flush
└── api/
    └── quiz-api.ts                            # Client API Wrapper tích hợp RTT Synchronization & Sequence
```

---

## III. SUB-DOMAIN AUTHORING: QUẢN LÝ ĐỀ THI & PHIÊN BẢN BẤT BIẾN

### 1. Thực Thể `Quiz` (Entity)
Đại diện cho danh tính lâu dài của bài kiểm tra trong hệ thống:
* **Thuộc tính**:
  - `id`: Mã định danh duy nhất của bài thi (`quiz_<nanoId>`).
  - `code`: Mã định danh ngắn gọn dùng cho tìm kiếm/liên kết (`e.g. 'CS101'`).
  - `title`, `description`: Tiêu đề và mô tả bài thi.
  - `ownerId`: Định danh của giảng viên/tác giả sở hữu đề thi.
  - `status`: Vòng đời bài thi (`QuizStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED'`).
  - `currentPublishedVersionId`: Con trỏ tới phiên bản đang phát hành chính thức cho thí sinh.
* **Quy tắc Nghiệp vụ**:
  - Khi mới khởi tạo, đề thi luôn ở trạng thái `DRAFT`.
  - Chỉ phiên bản được xuất bản (`PUBLISHED`) mới được hiển thị trong danh mục thi (`/v1/quizzes`).

### 2. Thực Thể `QuizVersion` (Immutable Snapshot)
Mỗi phiên bản đề thi là một bản thiết kế (Blueprint) bất biến. Khi đã xuất bản, nội dung của phiên bản không bao giờ bị thay đổi nhằm đảm bảo tính công bằng và toàn vẹn dữ liệu cho các thí sinh đã hoặc đang thi:
* **Thuộc tính**:
  - `id`: Định danh phiên bản (`quiz_ver_<nanoId>`).
  - `quizId`: Tham chiếu tới `Quiz`.
  - `versionNumber`: Số thứ tự phiên bản tăng dần (1, 2, 3...).
  - `durationMinutes`: Thời gian làm bài thi tính theo phút.
  - `passingScore`: Điểm chuẩn đạt yêu cầu.
  - `maxAttempts`: Số lượt làm bài tối đa cho phép (0 = không giới hạn, 1..N = giới hạn).
  - `questions`: Danh sách câu hỏi đầy đủ metadata, barem điểm và đáp án đúng.
  - `scoringPolicy`: Cấu hình chiến lược chấm (`ExactMatch`, `PartialCredit`, `NegativeMarking`).
  - `randomizationPolicy`: `{ shuffleQuestions: boolean, shuffleOptions: boolean }`.

### 3. Quy Tắc Bất Biến Khi Xuất Bản (`PublishingPolicy`)
Hệ thống từ chối xuất bản (`POST /v1/quizzes/:id/publish`) với mã lỗi `QUIZ_PUBLISH_INVARIANT_VIOLATION` (HTTP `422 Unprocessable Entity`) nếu vi phạm bất kỳ điều kiện nào:
1. `EMPTY_QUESTIONS`: Đề thi không có câu hỏi nào.
2. `INVALID_QUESTION_PAYLOAD`: Có câu hỏi thiếu prompt, thiếu options hoặc không có đáp án đúng.
3. `ZERO_TOTAL_POINTS`: Tổng điểm của đề thi <= 0.
4. `INVALID_SCORING_CONFIG`: Cấu hình scoring không tương thích với các loại câu hỏi trong đề.

### 4. Chính Sách Lượt Thi (`AttemptPolicy`)
* Kiểm soát số lần làm bài của từng thí sinh: Nếu số ca thi đã hoàn thành (`GRADED` / `TIMED_OUT_GRADED`) >= `maxAttempts`, hệ thống chặn khởi tạo ca thi mới (`MAX_ATTEMPTS_EXCEEDED` - HTTP `403 Forbidden`).

---

## IV. SUB-DOMAIN DELIVERY: VẬN HÀNH PHÒNG THI, SNAPSHOT & STATE MACHINE

### 1. Phân Định Bản Chất: `Quiz ≠ Attempt`
* `QuizVersion` là **Bản thiết kế (Blueprint)**: 1 đề thi có thể có hàng nghìn thí sinh cùng làm.
* `Attempt` là **Một lượt thực thi cụ thể (Execution Aggregate Root)**: Đại diện cho phiên thi của thí sinh X tại thời điểm Y.

### 2. Đóng Băng Thứ Tự Đề Thi & Mốc Thời Gian (`AttemptManifest` Snapshot)
Giải quyết triệt để vấn đề xáo trộn ngẫu nhiên mỗi lần gọi API và bảo đảm tính độc lập của ca thi:
* Khi thí sinh gọi `POST /v1/attempts/:id/start`, hệ thống thực hiện xáo trộn ngẫu nhiên câu hỏi và danh sách lựa chọn (nếu đề thi bật cờ shuffle), sau đó lưu cố định vào thuộc tính `manifest` của `Attempt`:
  ```typescript
  export interface AttemptManifest {
    quizVersionId: string;
    questionIds: string[];                  // Thứ tự câu hỏi đã shuffle (cố định vĩnh viễn)
    optionOrders: Record<string, string[]>; // questionId -> danh sách optionIds đã shuffle
    timeLimitMinutes: number;               // Thời gian làm bài chính thức (phút)
    startedAt: string;                      // ISO timestamp thời điểm bắt đầu ca thi
    deadline: string;                       // ISO timestamp hạn chót làm bài (Tier 1 cutoff)
  }
  ```
* Mọi lời gọi API lấy thông tin ca thi tiếp theo (`GET /v1/attempts/:id`) đều sắp xếp câu hỏi đúng theo thứ tự đã lưu trong `manifest`.

### 3. Ranh Giới Khử Khuẩn Dữ Liệu (`DeliverySanitizer`)
* Dữ liệu đề thi trả về cho thí sinh bắt buộc phải đi qua `DeliverySanitizer`:
  - **Loại bỏ triệt để**: `correctAnswer`, `correctOptionId`, `correctOptionIds`, `isCorrect`, `explanation`, `gradingRubric`.
  - **Giữ lại**: `id`, `type`, `prompt`, `points`, `options` (đã loại thuộc tính `isCorrect` và sắp xếp theo `AttemptManifest`).

### 4. Kiến Trúc Thời Gian Hai Tầng Chuẩn Xác (Two-Tier Server-Authoritative Timing Architecture)
Nhằm giải quyết triệt để bài toán ranh giới thời gian (Grace Period vs. Answer Cutoff), hệ thống thiết lập hai mốc kiểm tra độc lập tại tầng Aggregate Root:

```text
               ┌───────────────────────┐             ┌────────────────────────────────┐
               │    TIER 1 CUTOFF      │             │         TIER 2 CUTOFF          │
               │   (Answer Deadline)   │             │   (Submission Grace Cutoff)    │
               │  deadline = startedAt │             │  submissionDeadline = deadline │
               │     + timeLimitMs     │             │    + submissionGracePeriodMs   │
               └───────────┬───────────┘             └───────────────┬────────────────┘
                           │                                         │
──[ ĐANG LÀM BÀI ]─────────┼──[ CHỈ CHO PHÉP NỘP BÀI QUA MẠNG ]──────┼──[ QUÁ HẠN / SWEEPER ]──► Time
 (Lưu đáp án: OK)          │  (Lưu đáp án: HTTP 400 BỊ CHẶN)         │  (Chuyển TIMED_OUT_GRADED)
 (Nộp bài: SUBMITTED)      │  (Nộp bài: SUBMITTED - Grace OK)        │  (Chấm điểm tự động)
```

1. **Tier 1 - Hạn chót trả lời câu hỏi (`deadline`)**:
   - `deadline = startedAt.getTime() + timeLimitMinutes * 60 * 1000`.
   - **Bất biến kiểm tra**: Khi `now > deadline`, mọi nỗ lực lưu thêm hoặc sửa đổi câu trả lời đều bị từ chối bằng ngoại lệ `AttemptTimeExpiredError` (HTTP 400 Bad Request, `errorCode: 'ATTEMPT_TIME_EXPIRED'`).
   - Thí sinh tuyệt đối không thể lợi dụng thời gian ân hạn mạng để trả lời thêm câu hỏi.
2. **Tier 2 - Hạn chót gửi gói tin nộp bài (`submissionDeadline`)**:
   - `submissionDeadline = deadline + submissionGracePeriodMs` (mặc định 15.000 ms = 15 giây).
   - **Mục đích duy nhất**: Bù đắp độ trễ truyền gói tin nộp bài qua mạng Internet (Network Latency).
   - Nếu thí sinh bấm nộp bài trong khoảng `deadline < now <= submissionDeadline`, ca thi vẫn được ghi nhận là `SUBMITTED` hợp lệ.
   - Nếu request nộp bài tới sau `submissionDeadline` (hoặc do Sweeper quét trúng), ca thi tự động chuyển thành `TIMED_OUT_GRADED`.

### 5. Máy Trạng Thái Vòng Đời Ca Thi (State Machine)

```text
[ CREATED ]
    │
    │  (startAttempt) -> Khởi tạo AttemptManifest, tính deadline, kích hoạt đồng hồ
    ▼
[ IN_PROGRESS ]
    │
    │  (recordAnswer) -> Ghi nhận câu trả lời (Strict Monotonic SequenceNumber check)
    │  (submitAttempt) -> Thí sinh chủ động nộp bài trước mốc submissionDeadline
    │  (autoSubmit)    -> Thí sinh nộp muộn (> submissionDeadline) hoặc do Sweeper quét
    ▼
[ SUBMITTED ]
    │
    │  (gradeAttempt)  -> Kích hoạt Assessment Scoring Engine
    ▼
[ GRADED / TIMED_OUT_GRADED ]
```

* **Trạng thái `CREATED`**: Ca thi được tạo thành công, chưa tính giờ làm bài.
* **Trạng thái `IN_PROGRESS`**: Thí sinh đã bấm vào phòng thi, đồng hồ máy chủ tính `startedAt` và xác lập mốc `deadline`.
* **Trạng thái `SUBMITTED` / `GRADED`**: Bài thi đã nộp hợp lệ, khóa hoàn toàn khả năng chỉnh sửa đáp án (`ATTEMPT_ALREADY_SUBMITTED`).
* **Trạng thái `TIMED_OUT_GRADED` (Graceful Auto-Submit)**: Khi ca thi quá hạn `submissionDeadline`, hệ thống bảo toàn toàn bộ câu trả lời đã lưu trước thời điểm `deadline` và thực hiện chấm điểm công bằng.

### 6. Kiểm Soát Tranh Chấp Bằng Chuỗi Logic Tuần Tự (Logical Sequence Concurrency Control)
Thay thế việc dựa vào `clientTimestamp` (dễ bị lệch đồng hồ client hoặc tráo gói tin mạng), hệ thống áp dụng cơ chế số thứ tự logic tự tăng nghiêm ngặt (**Monotonically Increasing Sequence Number**) theo chuẩn phân tán:

* Mỗi câu trả lời được lưu trữ dưới dạng:
  ```typescript
  export interface CandidateAnswerRecord {
    answer: unknown;
    answeredAt: Date;
    sequenceNumber: number;          // Số thứ tự logic đơn điệu tăng dần (1, 2, 3...)
    clientTimestamp?: number;        // Alias tương thích ngược cho các client cũ
  }
  ```
* **Bất biến Chống Ghi Đè Ngược & Trùng Lặp Gói Tin**:
  - Khi client gửi đáp án mới cho câu hỏi `questionId` với `sequenceNumber`, Server kiểm tra:
    ```typescript
    if (existingAnswer && existingAnswer.sequenceNumber >= incoming.sequenceNumber) {
      throw new OutdatedAnswerSequenceError(
        questionId,
        incoming.sequenceNumber,
        existingAnswer.sequenceNumber
      );
    }
    ```
  - Nếu vi phạm, hệ thống ném `OutdatedAnswerSequenceError` (HTTP `409 Conflict`, `errorCode: 'OUTDATED_ANSWER_SEQUENCE'`).
  - Đảm bảo 100% khi xảy ra Network Jitter (gói số 1 bị nghẽn mạng đến sau gói số 2), gói cũ sẽ bị loại bỏ lập tức, bảo toàn câu trả lời mới nhất của thí sinh.

### 7. Bộ Quét Ca Thi Quá Hạn Chủ Động & Cơ Hội (Attempt Expiry Sweeper Service)
Giải quyết triệt để bài toán thí sinh bỏ thi, tắt máy, ngắt mạng khiến ca thi bị treo vĩnh viễn ở trạng thái `IN_PROGRESS`:

1. **Active Sweeper Daemon (Bộ quét nền chủ động)**:
   - Lớp `AttemptExpirySweeperService` vận hành một background timer định kỳ (mặc định 60 giây).
   - Tìm kiếm toàn bộ ca thi đang `IN_PROGRESS` mà `submissionDeadline < now` thông qua `findExpiredInProgressAttempts(now)`.
   - Tự động gọi `autoSubmit(now, 'EXPIRED_BY_SWEEPER')` chuyển trạng thái sang `TIMED_OUT_GRADED` và chuyển tiếp sang `AssessmentScoringEngine` chấm điểm.
2. **Opportunistic Sweeper (Quét cơ hội)**:
   - Trong Use Case `getAttemptDetails`, nếu phát hiện ca thi đang truy vấn đã vượt quá `submissionDeadline`, hệ thống tự động kích hoạt chuyển trạng thái và chấm điểm ngay lập tức, trả kết quả `TIMED_OUT_GRADED` về cho thí sinh mà không cần chờ tới chu kỳ của daemon.
3. **Cloud Scheduler / Cron Endpoint**:
   - Cung cấp API `POST /v1/internal/attempts/sweep` hỗ trợ gọi từ Cloud Scheduler hoặc Kubernetes CronJob cho kiến trúc Serverless/Multi-replica, được bảo vệ bằng secret key `X-Internal-Sweeper-Secret` và RBAC `ADMIN`.

### 8. Chống Gian Lận Đa Tab (Multi-tab Prevention)
* Khi gọi `POST /v1/attempts`, nếu thí sinh đã có một ca thi ở trạng thái `IN_PROGRESS` trên cùng đề thi, hệ thống sẽ **trả về chính ca thi đang dở dang đó** thay vì tạo ca thi mới (`isExisting: true`), buộc thí sinh tiếp tục phiên thi hiện tại.

---

## V. QUESTION ENGINE & ASSESSMENT SCORING ENGINE

### 1. Kiến Trúc Question Handler (Registry Pattern)
Áp dụng mẫu thiết kế **Open-Closed Principle**, cho phép bổ sung thêm các loại câu hỏi mới mà không can thiệp vào lõi xử lý:

```typescript
export interface QuestionTypeHandler<TQuestion = any, TAnswer = any> {
  readonly type: string;
  sanitizeForDelivery(question: TQuestion, optionOrder?: string[]): DeliveryQuestion;
  validateAnswerPayload(question: TQuestion, answer: TAnswer): boolean;
  evaluate(question: TQuestion, answer: TAnswer, strategy: ScoringStrategy): QuestionEvaluation;
}
```

* **`SingleChoiceHandler` (`single-choice`)**:
  - Trắc nghiệm chọn 1 đáp án đúng trong danh sách.
  - Kiểm tra tính hợp lệ của `selectedOptionId`.
  - So khớp trực tiếp với `correctOptionId`.
* **`MultipleChoiceHandler` (`multiple-choice`)**:
  - Trắc nghiệm chọn 1 hoặc nhiều đáp án đúng (`selectedOptionIds: string[]`).
  - Hỗ trợ cả chấm điểm thành phần lẫn chấm tuyệt đối.
* **`TrueFalseHandler` (`true-false`)**:
  - Câu hỏi nhận định Đúng / Sai (`booleanValue: boolean`).
  - So khớp trực tiếp giá trị boolean chuẩn.

### 2. Các Chiến Lược Chấm Điểm (`ScoringStrategy`)
Được điều phối qua `AssessmentScoringEngine`:
* **`ExactMatchScoring`**:
  - Chỉ cho điểm tối đa nếu thí sinh chọn đúng 100% đáp án; sai bất kỳ chi tiết nào = 0 điểm.
* **`PartialCreditScoring`**:
  - Dành cho câu hỏi nhiều đáp án (`multiple-choice`):
  - `Điểm = (Số lựa chọn đúng - Số lựa chọn sai) / Tổng số đáp án đúng * MaxPoints` (không âm).
  - Ngăn chặn triệt để hành vi gian lận tích chọn toàn bộ các ô (tick all).
* **`NegativeMarkingScoring`**:
  - Áp dụng trừ điểm phạt khi thí sinh trả lời sai, chống đánh bừa ngẫu nhiên.

---

## VI. BẢO MẬT, ĐỊNH DANH & PHÂN QUYỀN (SECURITY, AUTHENTICATION & RBAC)

Hệ thống Quiz Service được bảo vệ bằng các lớp phòng thủ chuyên sâu:

1. **Xác Thực Chữ Ký Số JWT Chuẩn RS256**:
   - Sử dụng khóa công khai RSA lấy từ JWKS Discovery (`/.well-known/jwks.json`) để xác thực chữ ký của Access Token.
   - Hỗ trợ fallback HS256 nếu cấu hình môi trường dùng chung secret.
   - Không cho phép token giả mạo chữ ký, token hết hạn hoặc token bị can thiệp payload ➜ Trả về HTTP `401 Unauthorized`.
   - **Chấm dứt hoàn toàn Anonymous Fallback**: Không còn cơ chế tự động gán tài khoản mặc định `usr_student_01` cho request không có token.

2. **Phân Quyền Vai Trò (RBAC Guard)**:
   - Các route tạo đề, cập nhật phiên bản, xuất bản (`POST /v1/quizzes`, `POST /v1/quizzes/:id/versions`, `POST /v1/quizzes/:id/publish`) đều được bảo vệ bởi middleware:
     ```typescript
     requireRole('INSTRUCTOR', 'ADMIN')
     ```
   - Thí sinh (`STUDENT`) gửi request vào các route này lập tức bị từ chối với HTTP `403 Forbidden` (`errorCode: 'FORBIDDEN'`).

3. **Bảo Vệ Ca Thi & Chống Lỗ Hổng IDOR (Anti-Cheating IDOR Defense)**:
   - Toàn bộ các route làm bài thi (`/v1/attempts/:id/*`) đều kiểm tra định danh người dùng:
     ```typescript
     if (attempt.userId !== req.principal.id && !req.principal.roles.includes('ADMIN')) {
       throw new ForbiddenError('You are not authorized to access this quiz attempt');
     }
     ```
   - Thí sinh tuyệt đối không thể xem, nộp bài hoặc gửi đáp án vào ca thi của thí sinh khác.

---

## VII. ĐẶC TẢ CHI TIẾT RESTFUL API V1 (API SPECIFICATION)

### 1. Nhóm Tài Nguyên `/v1/quizzes` (Authoring & Catalog)

| Phương thức | Đường dẫn Endpoint | Yêu cầu Quyền hạn | Mô tả chức năng |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/quizzes` | Public / Thí sinh | Lấy danh mục các bài thi đã xuất bản (`PUBLISHED`) |
| `POST` | `/v1/quizzes` | `INSTRUCTOR`, `ADMIN` | Tạo mới bài thi (trạng thái ban đầu `DRAFT`) |
| `GET` | `/v1/quizzes/:id` | Authenticated | Lấy chi tiết thông tin bài thi |
| `POST` | `/v1/quizzes/:id/versions` | `INSTRUCTOR`, `ADMIN` | Thêm phiên bản mới (câu hỏi, thời gian, điểm đạt, cấu hình) |
| `POST` | `/v1/quizzes/:id/publish` | `INSTRUCTOR`, `ADMIN` | Kiểm tra Invariants và phát hành phiên bản làm bài chính thức |

#### Ví dụ Request / Response Tạo Bài Thi:
* **`POST /v1/quizzes`**:
  ```json
  // Request Body
  {
    "code": "CS101",
    "title": "Nhập môn Lập trình Web",
    "description": "Bài kiểm tra kiến thức HTML, CSS, JavaScript và Kiến trúc Web"
  }
  
  // Response 201 Created
  {
    "success": true,
    "data": {
      "id": "quiz_101",
      "code": "CS101",
      "title": "Nhập môn Lập trình Web",
      "status": "DRAFT",
      "ownerId": "usr_instructor_01"
    }
  }
  ```

---

### 2. Nhóm Tài Nguyên `/v1/attempts` (Delivery & Phòng Thi) & Clock Sync API

| Phương thức | Đường dẫn Endpoint | Yêu cầu Quyền hạn | Mô tả chức năng |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/time` | Public / Thí sinh | Lấy mốc thời gian máy chủ chuẩn xác (`serverTime`, `serverTimestamp`, `iso`) phục vụ đồng bộ đồng hồ |
| `POST` | `/v1/attempts` | Student (Chính chủ) | Khởi tạo hoặc khôi phục ca thi (`isExisting: boolean`) |
| `POST` | `/v1/attempts/:id/start` | Student (Chính chủ) | Bắt đầu tính giờ; nhận đề thi đã khử khuẩn và `AttemptManifest` |
| `GET` | `/v1/attempts/:id` | Student (Chính chủ) | Xem trạng thái phòng thi, thời gian còn lại, câu hỏi (tích hợp Opportunistic Sweeper) |
| `PUT` | `/v1/attempts/:id/answers/:questionId` | Student (Chính chủ) | Lưu đáp án từng câu kèm `sequenceNumber` đơn điệu tăng dần chống Network Jitter |
| `POST` | `/v1/attempts/:id/answers` | Student (Chính chủ) | Lưu đáp án qua Body `{ questionId, answer, sequenceNumber, clientTimestamp? }` |
| `POST` | `/v1/attempts/:id/submit` | Student (Chính chủ) | Nộp bài thi (hỗ trợ Grace Period 15s), chuyển `SUBMITTED` hoặc `TIMED_OUT_GRADED` và trả kết quả |

#### Server Timing Headers Toàn Cục:
Mọi phản hồi HTTP từ Quiz Service đều được gắn kèm hai tiêu đề thời gian máy chủ chuẩn hóa (đồng thời khai báo trong `Access-Control-Expose-Headers`):
* `X-Server-Time`: Chuỗi ISO-8601 thời gian thực tại máy chủ (ví dụ: `2026-09-04T07:00:00.123Z`).
* `X-Server-Timestamp`: Epoch millisecond nguyên bản (ví dụ: `1788505200123`).

---

### 3. Nhóm Tài Nguyên Quản Trị & Background Sweeper (`/v1/internal/attempts`)

| Phương thức | Đường dẫn Endpoint | Yêu cầu Quyền hạn | Mô tả chức năng |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/internal/attempts/sweep` | `ADMIN` / Shared Secret | Kích hoạt quét tức thì các ca thi quá hạn `submissionDeadline` và cưỡng chế chấm điểm |
| `GET` | `/v1/internal/attempts/sweeper-status` | `ADMIN` / Shared Secret | Kiểm tra trạng thái daemon nền, chu kỳ quét (`intervalMs`) và cờ kích hoạt |

* **Cơ Chế Bảo Vệ**: Endpoint hỗ trợ xác thực kép: Bearer JWT Role `ADMIN` hoặc Header `X-Internal-Sweeper-Secret` (phục vụ Cloud Scheduler và Serverless Cron triggers).

#### Ví dụ Bắt Đầu Ca Thi:
* **`POST /v1/attempts/att_101/start`**:
  ```json
  // Response 200 OK
  {
    "success": true,
    "data": {
      "attempt": {
        "id": "att_101",
        "quizId": "quiz_demo",
        "quizVersionId": "quiz_ver_demo_v1",
        "status": "IN_PROGRESS",
        "startedAt": "2026-09-04T07:00:00.000Z",
        "deadline": "2026-09-04T07:45:00.000Z"
      },
      "manifest": {
        "quizVersionId": "quiz_ver_demo_v1",
        "questionIds": ["q_02", "q_01", "q_03"],
        "optionOrders": {
          "q_01": ["opt_c", "opt_a", "opt_b"]
        },
        "timeLimitMinutes": 45,
        "startedAt": "2026-09-04T07:00:00.000Z",
        "deadline": "2026-09-04T07:45:00.000Z"
      },
      "questions": [
        {
          "id": "q_02",
          "type": "single-choice",
          "prompt": "Giao thức nào cung cấp kết nối mạng bảo mật trên nền TLS?",
          "points": 10,
          "options": [
            { "id": "opt_2a", "text": "HTTP" },
            { "id": "opt_2b", "text": "HTTPS" }
          ]
        }
      ]
    }
  }
  ```

---

### 4. Danh Mục Mã Lỗi Domain Chuẩn Hóa (`DomainErrorCode`)

| Mã Lỗi (`errorCode`) | HTTP Status | Mô tả Nghiệp vụ |
| :--- | :---: | :--- |
| `QUIZ_NOT_FOUND` | 404 | Không tìm thấy đề thi với ID được cung cấp |
| `QUIZ_NOT_PUBLISHED` | 400 | Đề thi chưa được xuất bản, thí sinh không thể làm bài |
| `QUIZ_PUBLISH_INVARIANT_VIOLATION` | 422 | Đề thi không đủ điều kiện xuất bản (rỗng câu hỏi, thang điểm sai) |
| `ATTEMPT_NOT_FOUND` | 404 | Không tìm thấy ca thi tương ứng |
| `ATTEMPT_ALREADY_SUBMITTED` | 409 | Bài thi đã nộp, từ chối mọi thao tác chỉnh sửa đáp án |
| `ATTEMPT_ALREADY_IN_PROGRESS` | 409 | Thí sinh đã có ca thi đang dở dang, không được mở thêm tab |
| `MAX_ATTEMPTS_EXCEEDED` | 403 | Thí sinh đã sử dụng hết số lần thi tối đa cho phép |
| `ATTEMPT_TIME_EXPIRED` | 400 | Đã quá hạn chót trả lời câu hỏi (`deadline`), từ chối lưu thêm câu trả lời |
| `OUTDATED_ANSWER_SEQUENCE` | 409 | Gói tin đáp án có `sequenceNumber` nhỏ hơn hoặc bằng gói tin đã lưu (chống Jitter/Duplicate) |
| `OUTDATED_ANSWER_TIMESTAMP` | 409 | Gói tin đáp án gửi lên cũ hơn gói tin đã được ghi nhận trước đó (Legacy fallback) |
| `INVALID_ANSWER_PAYLOAD` | 422 | Cấu trúc câu trả lời không tương thích với loại câu hỏi |
| `INVALID_STATE_TRANSITION` | 409 | Chuyển đổi trạng thái ca thi bất hợp lệ |
| `FORBIDDEN` | 403 | Không đủ quyền hạn thực thi hoặc vi phạm quyền sở hữu ca thi |
| `UNAUTHORIZED` | 401 | Thiếu token xác thực hoặc token không hợp lệ |

---

## VIII. ĐỒNG BỘ KHÁCH HÀNG: SDK & GIAO DIỆN THÍ SINH (`quiz-web`)

### 1. Quản Lý Đồng Bộ Thời Gian Máy Chủ (`TimeSyncManager`)
* **Thuật toán Cristian (Cristian's Synchronization Algorithm)**:
  - Khi client gửi request đồng bộ tới `GET /v1/time`, client ghi lại:
    - $T_{\text{start}}$: Thời điểm bắt đầu gửi request (`performance.now()`).
    - $T_{\text{server}}$: Thời gian máy chủ trả về trong response.
    - $T_{\text{end}}$: Thời điểm nhận được response (`performance.now()`).
  - Độ trễ khứ hồi: $\text{RTT} = T_{\text{end}} - T_{\text{start}}$.
  - Giờ máy chủ ước tính tại thời điểm $T_{\text{end}}$: $T_{\text{server\_est}} = T_{\text{server}} + \frac{\text{RTT}}{2}$.
* **Monotonic Offset Anchoring (Chống Gian Lận Đổi Giờ Máy Tính)**:
  - Thay vì lưu trữ chênh lệch với `Date.now()`, hệ thống neo độ lệch vào `performance.now()`:
    $$\text{baseServerTime} = T_{\text{server\_est}}, \quad \text{basePerfNow} = T_{\text{end}}$$
  - Bất kỳ lúc nào cần tính giờ máy chủ hiện tại:
    $$\text{now}_{\text{server}} = \text{baseServerTime} + (\text{performance.now()} - \text{basePerfNow})$$
  - Khi thí sinh cố tình chỉnh lùi giờ trên đồng hồ Windows/macOS, `performance.now()` không bị thay đổi, đồng hồ thi vẫn đếm chính xác từng giây.

### 2. Hook Đếm Ngược Kháng Trôi Dạt (`useServerCountdown`)
* Nhận vào `deadline` (ISO string từ máy chủ).
* Tính số giây còn lại trực tiếp qua `timeSync.getRemainingSeconds(deadline)`.
* **Cơ Chế Phục Hồi Khi Ẩn Tab / Sleep**:
  - Khi thí sinh gập laptop hoặc chuyển tab, timer `setInterval` bị hệ điều hành đóng băng (throttled).
  - Hook lắng nghe các sự kiện `visibilitychange`, `window focus`, `online` để kích hoạt tái đồng bộ ngay lập tức với `TimeSyncManager`, lập tức hiển thị lại số giây thực tế mà không bị trôi thời gian.
  - Khi thời gian còn lại chạm 0, hook tự động gọi callback `onExpire()`.

### 3. Hook Phiên Thi & Bộ Xả Hàng Đợi Chống Mất Dữ Liệu (`useQuizSession`)
* **Quản lý Monotonic Sequence Numbers**:
  - Duy trì `sequenceMapRef` ánh xạ `questionId -> currentSequence`.
  - Mỗi thao tác chọn đáp án tăng `sequenceNumber` lên 1 và đính kèm vào payload gửi lên server.
* **Autosave Queue Flusher (Zero Data Loss Guarantee)**:
  - Thí sinh làm bài thường có độ trễ debounce (ví dụ: 600ms) trước khi autosave gửi gói tin.
  - Nếu thí sinh bấm nút **Nộp bài (Submit)** ngay sau khi chọn câu cuối cùng, nguy cơ câu cuối cùng chưa kịp gửi lên máy chủ là rất lớn.
  - **Giải pháp**: Hàm `submitAttempt` lập tức hủy bỏ toàn bộ `debounceTimers`, lấy toàn bộ các câu hỏi đang chờ trong `pendingSavesRef` và gửi đồng loạt lên máy chủ qua `Promise.allSettled`, sau đó mới thực hiện gọi API `submit`. Cam kết **100% không mất đáp án**.

---

## IX. CHỈ SỐ KIỂM THỬ VÀ ĐẢM BẢO CHẤT LƯỢNG (TESTING & VERIFICATION)

Chất lượng của Quiz Assessment Engine & Timing Invariants được kiểm chứng qua bộ kiểm thử tự động toàn diện:

```text
 ✓ services/quiz/tests/domain/delivery/server-timing-invariants.spec.ts (9 tests)
 ✓ services/quiz/tests/delivery/attempt-sequence-concurrency.spec.ts (11 tests)
 ✓ services/quiz/tests/delivery/attempt-expiry-sweeper.spec.ts (4 tests)
 ✓ services/quiz/tests/presentation/server-timing-api.spec.ts (4 tests)
 ✓ services/quiz/tests/presentation/sweeper-api.spec.ts (4 tests)
 ✓ apps/quiz-web/tests/time-sync.spec.ts (4 tests)
 ✓ apps/quiz-web/tests/quiz-api-concurrency.spec.ts (2 tests)
 ✓ apps/quiz-web/tests/countdown.spec.ts (3 tests)
 ✓ services/quiz/tests/domain/authoring/quiz.spec.ts (9 tests)
 ✓ services/quiz/tests/domain/authoring/attempt-policy.spec.ts (6 tests)
 ✓ services/quiz/tests/domain/delivery/attempt-manifest.spec.ts (2 tests)
 ✓ services/quiz/tests/domain/delivery/attempt-state-machine.spec.ts (12 tests)
 ✓ services/quiz/tests/security/sanitization-boundary.spec.ts (15 tests)
 ✓ services/quiz/tests/security/rbac.spec.ts (10 tests)
 ✓ services/quiz/tests/security/principal-context.spec.ts (9 tests)
 ✓ services/quiz/tests/scoring/scoring.spec.ts (15 tests)
 ✓ services/quiz/tests/session/quiz-session.spec.ts (7 tests)
 ✓ services/quiz/src/application/use-cases.spec.ts (2 tests)
 ✓ services/quiz/tests/presentation/assessment-api.spec.ts (10 tests)
 ✓ services/auth/tests/auth.spec.ts (18 tests)
 ✓ services/auth/tests/drizzle-persistence.spec.ts (4 tests)
 ✓ packages/auth-client/tests/auth-client.spec.ts (9 tests)
 ✓ packages/api-client/tests/api-client.spec.ts (8 tests)

Test Files:  23 passed (23)
Tests:       177 passed (177)
Result:      100% Pass, Không có lỗi hồi quy (Zero Regression)
```

### Kết Luận Nghiệm Thu:
* Hệ thống Quiz Service đã hoàn tất toàn diện cả 4 bước kiểm toán và gia cố độ tin cậy thời gian:
  1. **Server-Authoritative Timing Invariants & Two-Tier Architecture**: Tách bạch tuyệt đối Answer Cutoff và Submission Grace Period.
  2. **Active & Opportunistic Expiry Sweeper**: Tự động dọn dẹp và chấm điểm các ca thi quá hạn, hỗ trợ Cloud Scheduler qua endpoint bảo mật.
  3. **Clock Synchronization & Monotonic Anchoring**: Triệt tiêu hoàn toàn gian lận đồng hồ qua Thuật toán Cristian và `performance.now()`.
  4. **Logical Sequence Concurrency Control**: Triệt tiêu xung đột Network Jitter và bảo đảm Zero Data Loss khi nộp bài.
* Toàn bộ 23 test suites và 177 tests kiểm thử tự động đạt tỷ lệ vượt qua 100%, sẵn sàng cho môi trường production tải cao.
