# LỘ TRÌNH THỰC THI KIẾN TRÚC ASSESSMENT & QUIZ ENGINE
*(Execution Plan: Domain-Driven Design & Hexagonal Architecture - Audited & Production-Hardened)*

Tài liệu này xác lập kế hoạch chi tiết triển khai 3 bước chuyển đổi hệ thống từ mô hình phiên thi cơ bản sang một **Assessment Core Engine** chuẩn công nghiệp, tách bạch rõ ràng giữa hai sub-domain: **Authoring (Tác quyền/Đề thi)** và **Delivery (Phân phối/Phòng thi)**.

Kế hoạch này đã được audit và tích hợp đầy đủ 5 tiêu chuẩn thực chiến:
1. **Backward-Compatibility & Migration Facade** (Không làm vỡ 67 tests và 2 apps Frontend hiện hữu).
2. **Idempotency & Concurrency Control** (Chống mất mát dữ liệu do out-of-order requests).
3. **Graceful Auto-Submit on Timeout** (Thu bài và chấm điểm tự động thay vì hủy bài thi 0 điểm).
4. **Attempt Policy & Concurrency Defense** (Chống mở nhiều tab gian lận và giới hạn số lượt thi).
5. **Concrete AttemptManifest Snapshot** (Đóng băng tuyệt đối thứ tự câu hỏi và đáp án cho từng thí sinh).

---

## TỔNG QUAN KIẾN TRÚC & SUB-DOMAINS

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   QUIZ CORE ENGINE                                      │
├────────────────────────────────────────────┬────────────────────────────────────────────┤
│           SUB-DOMAIN AUTHORING             │            SUB-DOMAIN DELIVERY             │
│  - Quiz (Entity)                           │  - Attempt (Aggregate Root)                │
│  - QuizVersion (Immutable Snapshot)        │  - AttemptManifest (Frozen Order Snapshot) │
│  - Publishing Policy (Draft -> Published)  │  - State Machine & Timer Enforcer          │
│  - AttemptPolicy (Retake / Max Attempts)   │  - Auto-Submit on Timeout Mechanism        │
├────────────────────────────────────────────┴────────────────────────────────────────────┤
│                                SUB-DOMAIN ASSESSMENT ENGINE                             │
│  - Question Engine Registry (Single-choice, Multiple-choice, True/False, Extensible)    │
│  - Scoring Strategy (ExactMatch, PartialCredit, NegativeMarking)                        │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                             RESTFUL DOMAIN API & CLIENT MIGRATION                       │
│  - RESTful /v1/attempts & /v1/quizzes: Chuẩn giao tiếp duy nhất giữa Client & Server    │
│  - SDK @platform/api-client & apps/quiz-web kết nối trực tiếp Delivery / Authoring API  │
│  - Tầng Facade quá độ đã hoàn thành nhiệm vụ và được loại bỏ hoàn toàn sạch sẽ           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## BẢNG ÁNH XẠ CẤU TRÚC THƯ MỤC DỰ KIẾN (TARGET DIRECTORY STRUCTURE)

```
services/quiz/src/
├── domain/
│   ├── authoring/                     # [MỚI] Sub-domain Quản lý đề & Phiên bản
│   │   ├── quiz.entity.ts             # Thực thể Quiz
│   │   ├── quiz-version.entity.ts     # Thực thể bất biến QuizVersion
│   │   ├── publishing.policy.ts       # Quy tắc kiểm tra tính hợp lệ khi Publish
│   │   └── attempt.policy.ts          # Cấu hình số lượt thi & chính sách thi lại
│   ├── delivery/                      # [MỚI] Sub-domain Phòng thi & Vận hành
│   │   ├── attempt.aggregate.ts       # Aggregate Root Attempt
│   │   ├── attempt-manifest.ts        # Snapshot thứ tự câu hỏi & options
│   │   ├── attempt-status.ts          # State Machine enum & transition definitions
│   │   └── delivery-sanitizer.ts      # Bóc tách đáp án bảo vệ đề thi
│   ├── question-engine/               # [MỚI] Question Engine & Handlers
│   │   ├── question.registry.ts       # Quản lý & tra cứu các loại câu hỏi
│   │   ├── question-handler.interface.ts
│   │   └── handlers/
│   │       ├── single-choice.handler.ts
│   │       ├── multiple-choice.handler.ts
│   │       └── true-false.handler.ts
│   ├── scoring/                       # Module tính điểm kế thừa & mở rộng
│   │   ├── scoring.strategy.ts
│   │   └── strategies/
│   │       ├── exact-match.strategy.ts
│   │       ├── partial-credit.strategy.ts
│   │       └── negative-marking.strategy.ts
│   └── errors/                        # Domain Errors chuẩn hóa
│       └── domain-errors.ts
├── application/
│   ├── use-cases/
│   │   ├── authoring/                 # CreateQuiz, AddVersion, PublishQuiz
│   │   └── delivery/                  # CreateAttempt, StartAttempt, RecordAnswer, SubmitAttempt
│   └── ports/                         # QuizRepository, AttemptRepository
├── infrastructure/
│   └── repositories/                  # In-memory / DB storage implementations
└── presentation/
    ├── routes/
    │   ├── v1-quizzes.routes.ts       # RESTful Authoring routes
    │   └── v1-attempts.routes.ts      # RESTful Delivery routes
    └── server.ts
```

---

## BƯỚC 1: CHUẨN HÓA DOMAIN MODELS & STATE MACHINE

Mục tiêu: Đưa toàn bộ các quy tắc nghiệp vụ bất biến (Invariants) và máy trạng thái (State Machine) xuống tầng **Domain Model**, loại bỏ hoàn toàn việc tầng Presentation/Controller tự ý gán trạng thái.

### 1.1. Sub-Domain Authoring: `Quiz` & `QuizVersion`

1. **Thực thể `Quiz` (Entity)**:
   * Đại diện cho danh tính lâu dài của bài thi (Identity).
   * Thuộc tính:
     ```typescript
     export type QuizStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';
     
     export class Quiz {
       id: string;
       code: string;
       title: string;
       description: string;
       ownerId: string;
       currentPublishedVersionId?: string;
       status: QuizStatus;
       createdAt: Date;
       updatedAt: Date;
     }
     ```
   * Phương thức Domain:
     * `createDraftVersion()`: Tạo phiên bản nháp mới khi có thay đổi.
     * `requestReview()`: Chuyển sang chờ duyệt nội dung.
     * `publish(versionId, invariantsChecker)`: Kích hoạt phiên bản thi chính thức nếu thỏa mãn điều kiện xuất bản.
     * `archive()`: Lưu trữ đề thi, không cho phép mở ca thi mới.

2. **Thực thể `QuizVersion` (Immutable Snapshot)**:
   * Đại diện cho nội dung đề thi bất biến tại một mốc thời gian cụ thể.
   * Thuộc tính:
     ```typescript
     export class QuizVersion {
       id: string; // quiz_ver_<nanoId>
       quizId: string;
       versionNumber: number; // 1, 2, 3...
       durationMinutes: number;
       passingScore: number;
       maxAttempts: number; // 0 = Không giới hạn, 1..N = Số lượt thi tối đa
       questions: AuthoringQuestion[]; // Bản gốc đầy đủ metadata, đáp án đúng & lời giải
       scoringPolicy: ScoringPolicyConfig;
       randomizationPolicy: {
         shuffleQuestions: boolean;
         shuffleOptions: boolean;
       };
       createdAt: Date;
     }
     ```

3. **Publishing Policy (Domain Invariants)**:
   Không cho phép Publish nếu vi phạm bất kỳ điều kiện nào sau đây:
   * `EMPTY_QUESTIONS`: Đề thi chưa có câu hỏi nào.
   * `INVALID_QUESTION_PAYLOAD`: Có câu hỏi thiếu prompt, không có đáp án đúng, hoặc options bị trùng lặp.
   * `ZERO_TOTAL_POINTS`: Tổng điểm của đề thi <= 0.
   * `INVALID_SCORING_CONFIG`: Cấu hình scoring không hợp lệ với các loại câu hỏi trong đề.

---

### 1.2. Sub-Domain Delivery: `Attempt` (Aggregate Root) & State Machine

1. **Bản chất cốt lõi**: `Quiz ≠ Attempt`. 
   * `QuizVersion` là bản thiết kế (Blueprint).
   * `Attempt` là một lượt thực thi của một thí sinh cụ thể (`User A` làm `QuizVersion v3` lần 1, lần 2...).

2. **Cấu trúc Đóng băng `AttemptManifest` (Snapshot)**:
   * Giải quyết triệt để "Hố tử thần Đảo đề": Đảm bảo thí sinh dù reload trang, mất mạng hoặc đổi thiết bị vẫn nhận đúng thứ tự câu hỏi và thứ tự lựa chọn đã bốc lúc bắt đầu thi.
   ```typescript
   export interface AttemptManifest {
     quizVersionId: string;
     questionIds: string[];                  // Thứ tự câu hỏi đã shuffle (cố định)
     optionOrders: Record<string, string[]>; // questionId -> danh sách optionIds đã shuffle
     timeLimitMinutes: number;
     startedAt: string;
     deadline: string;
   }
   ```

3. **Thực thể `Attempt` (Aggregate Root)**:
   * Thuộc tính:
     ```typescript
     export type AttemptStatus = 
       | 'CREATED'           // Khởi tạo, chưa tính giờ
       | 'IN_PROGRESS'       // Đang làm bài, đồng hồ đếm ngược
       | 'SUBMITTED'         // Đã nộp bài, khóa chỉnh sửa
       | 'GRADED'            // Đã chấm xong
       | 'TIMED_OUT_GRADED'; // Hết giờ, tự động thu bài và chấm điểm các câu đã lưu
     
     export class Attempt {
       id: string; // att_<nanoId>
       userId: string;
       quizId: string;
       quizVersionId: string;
       status: AttemptStatus;
       startedAt?: Date;
       deadline?: Date;
       submittedAt?: Date;
       manifest?: AttemptManifest;
       answers: Map<string, CandidateAnswerRecord>;
       scoreResult?: AttemptScoreResult;
     }
     ```

4. **Xử lý Đua lệnh & Tranh chấp ghi nhận câu trả lời (Concurrency & Idempotency)**:
   * Dữ liệu câu trả lời lưu kèm `clientTimestamp` hoặc `sequenceNumber`:
     ```typescript
     export interface CandidateAnswerRecord {
       answer: unknown;
       answeredAt: Date;
       clientTimestamp: number;
     }
     ```
   * **Luật Domain**: Nếu request gửi đến có `clientTimestamp < currentAnswer.clientTimestamp`, Server từ chối ghi đè nhằm chống việc request gửi trước nhưng đến sau do mạng chập chờn (Out-Of-Order request).

5. **State Machine Transitions & Auto-Submit on Timeout**:
   ```
   [ CREATED ]
       │  (start) -> Server sinh AttemptManifest, gán startedAt, tính deadline
       ▼
   [ IN_PROGRESS ]
       │  (recordAnswer)  -> Ghi nhận câu trả lời từng câu (Idempotent + Timestamp check)
       │  (submit)        -> Thí sinh chủ động nộp trước deadline + gracePeriod (15s)
       │  (autoSubmit)    -> Thí sinh nộp muộn hoặc hết giờ -> Thu bài tự động
       ▼
   [ SUBMITTED ]
       │  (grade)         -> Scoring Engine thực thi tính điểm
       ▼
   [ GRADED / TIMED_OUT_GRADED ]
   ```
   * **Graceful Auto-Submit**: Thay vì đánh rớt bài thi (0 điểm) khi hết giờ, hệ thống ghi nhận trạng thái `TIMED_OUT_GRADED`, thu thập toàn bộ các câu thí sinh đã kịp lưu trước mốc deadline và tiến hành chấm điểm bình thường.

6. **Chính sách Lượt thi (`AttemptPolicy` & Fraud Prevention)**:
   * **Chống gian lận đa tab**: Một thí sinh chỉ được phép có duy nhất **1 Attempt ở trạng thái `IN_PROGRESS`** trên cùng một bài thi. Nếu cố tình gọi `POST /v1/attempts`, hệ thống trả về Attempt đang làm dở thay vì tạo mới.
   * **Kiểm soát số lần thi**: Nếu số lượng Attempt đã hoàn thành >= `maxAttempts` của đề thi, từ chối khởi tạo lượt thi mới.

---

## BƯỚC 2: THIẾT KẾ RESTFUL RESOURCE ROUTES CHUẨN & COMPATIBILITY LAYER

Mục tiêu: Xóa bỏ các endpoint thiết kế theo giao diện (`/student/home`), chuyển sang hệ thống RESTful Resource Primitives chuẩn mực nhưng đảm bảo tương thích ngược 100% cho Frontend.

### 2.1. Quản nguyên `/v1/quizzes` (Authoring & Catalog)

| Phương thức | Đường dẫn | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/quizzes` | Public / Student | Lấy danh sách đề thi đã Published (Catalog) |
| `POST` | `/v1/quizzes` | Instructor / Admin | Khởi tạo đề thi mới (trạng thái DRAFT) |
| `GET` | `/v1/quizzes/:id` | Authenticated | Xem chi tiết thông tin đề thi |
| `POST` | `/v1/quizzes/:id/versions` | Instructor / Admin | Tạo phiên bản mới hoặc cập nhật bản thảo |
| `GET` | `/v1/quizzes/:id/versions` | Instructor / Admin | Xem lịch sử các phiên bản của đề thi |
| `POST` | `/v1/quizzes/:id/publish` | Instructor / Admin | Kiểm tra invariants và xuất bản đề thi |
| `POST` | `/v1/quizzes/:id/archive` | Admin | Đóng/lưu trữ đề thi |

### 2.2. Quản nguyên `/v1/attempts` (Delivery & Execution)

| Phương thức | Đường dẫn | Quyền hạn | Mô tả & Xử lý |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/attempts` | Student | Khởi tạo hoặc khôi phục lượt thi (`CREATED` / `IN_PROGRESS`). Body: `{ quizId }`. |
| `POST` | `/v1/attempts/:id/start` | Student (Owner) | Bắt đầu tính giờ. Trả về `DeliveryQuestion[]` đã lột bỏ đáp án và sắp xếp theo `AttemptManifest`. |
| `GET` | `/v1/attempts/:id` | Student (Owner) | Lấy thông tin trạng thái phòng thi, thời gian còn lại, câu hỏi (đã sanitize). |
| `PUT` | `/v1/attempts/:id/answers/:questionId` | Student (Owner) | Lưu câu trả lời từng câu. Body: `{ answer, clientTimestamp }`. |
| `POST` | `/v1/attempts/:id/submit` | Student (Owner) | Nộp bài thi (`SUBMITTED`), kích hoạt luồng chấm điểm sang `GRADED`. Hỗ trợ auto-submit nếu quá giờ. |
| `GET` | `/v1/attempts/:id/result` | Student (Owner) / Admin | Lấy bảng kết quả, điểm số, và lời giải (nếu đề thi cho phép xem sau nộp). |
| `GET` | `/v1/attempts` | Authenticated | Liệt kê lịch sử các lần thi của thí sinh (Hỗ trợ Retake & Analytics). |

### 2.3. Quy tắc Bảo mật Delivery Data Leak (Sanitization Boundary)
* Tại các route `/v1/attempts/:id` và `/v1/attempts/:id/start`, dữ liệu câu hỏi trả về Frontend bắt buộc phải đi qua lớp **`DeliverySanitizer`**:
  * Loại bỏ triệt để: `correctAnswer`, `correctOptionId`, `correctOptionIds`, `gradingRubric`, `explanation`.
  * Giữ lại: `id`, `type`, `prompt`, `metadata.options` (đã loại `isCorrect` và shuffle theo `AttemptManifest`).

### 2.4. Đồng bộ RESTful API Trực tiếp & Loại bỏ Facade (Direct RESTful Migration)
Sau giai đoạn chuyển tiếp an toàn, toàn bộ tầng Facade tương thích ngược (`/api/v1/*` và `legacy-facade.routes.ts`) đã được **loại bỏ hoàn toàn** để bảo toàn tính tinh gọn và nguyên bản của kiến trúc Hexagonal / RESTful:
* Không còn các endpoint ngầm `/api/v1/sessions*` hay `/api/v1/quizzes/:id/start`. Các request tới endpoint legacy sẽ trả về `404 Not Found`.
* SDK `@platform/api-client` tương tác trực tiếp với các Resource Primitives:
  * `apiClient.quizzes.list()` / `get()` / `create()` / `addVersion()` / `publish()`
  * `apiClient.attempts.create()` / `start()` / `recordAnswer()` / `submit()` / `get()`
* Ứng dụng Frontend `quiz-web` đã chuyển đổi 100% sang chuẩn Delivery mới:
  * `POST /v1/attempts`: Khởi tạo ca thi hoặc khôi phục ca thi đang dở dang (`IN_PROGRESS`).
  * `POST /v1/attempts/:id/start`: Kích hoạt đồng hồ máy chủ và nhận danh sách câu hỏi đã được `DeliverySanitizer` lọc sạch đáp án.
  * `PUT /v1/attempts/:id/answers/:questionId`: Lưu câu trả lời từng câu kèm `clientTimestamp` chống xung đột mạng trễ.
  * `POST /v1/attempts/:id/submit`: Đóng băng ca thi và nhận bảng điểm chi tiết.
  * Tích hợp bộ chọn đề thi động từ danh mục `GET /v1/quizzes`.

---

## BƯỚC 3: CẮM QUESTION ENGINE & SCORING STRATEGY

Mục tiêu: Thiết kế Question Engine mở rộng theo mẫu thiết kế **Strategy + Registry (Open-Closed Principle)**, hỗ trợ ngay 3 loại câu hỏi cốt lõi và sẵn sàng gắn thêm loại câu hỏi mới mà không sửa core logic.

### 3.1. Kiến trúc Question Type Handler (Registry Pattern)

```typescript
export interface QuestionTypeHandler<TQuestion = any, TAnswer = any> {
  readonly type: QuestionType; // 'single-choice' | 'multiple-choice' | 'true-false'
  
  // 1. Lọc dữ liệu nhạy cảm trước khi gửi tới thí sinh
  sanitizeForDelivery(question: TQuestion, optionOrder?: string[]): DeliveryQuestion;
  
  // 2. Validate tính hợp lệ của câu trả lời gửi lên từ Client
  validateAnswerPayload(question: TQuestion, answer: TAnswer): boolean;
  
  // 3. Tính điểm câu hỏi dựa trên chiến lược chấm
  evaluate(question: TQuestion, answer: TAnswer, strategy: ScoringStrategy): QuestionEvaluation;
}
```

### 3.2. Ba loại câu hỏi cốt lõi ban đầu (MVP+)

1. **`single-choice` (Trắc nghiệm 1 đáp án)**:
   * Dữ liệu: Danh sách lựa chọn `{ id, text, isCorrect }`.
   * Thí sinh nộp: `{ selectedOptionId: string }`.
   * Đánh giá: So sánh chính xác `selectedOptionId === correctOptionId`.

2. **`multiple-choice` (Trắc nghiệm nhiều đáp án)**:
   * Dữ liệu: Danh sách lựa chọn trong đó có thể có >= 1 đáp án đúng.
   * Thí sinh nộp: `{ selectedOptionIds: string[] }`.
   * Đánh giá: Hỗ trợ tính điểm thành phần (Partial Credit) hoặc chỉ tính điểm khi đúng toàn bộ (Exact Match).

3. **`true-false` (Đúng / Sai)**:
   * Dữ liệu: Mệnh đề khẳng định và boolean chuẩn `correctValue: boolean`.
   * Thí sinh nộp: `{ booleanValue: boolean }`.
   * Đánh giá: So khớp boolean trực tiếp.

### 3.3. Các chiến lược chấm điểm (`ScoringStrategy`)

* **`ExactMatchScoring`**:
  * Chỉ cộng trọn vẹn điểm câu hỏi nếu toàn bộ đáp án của thí sinh trùng khớp 100% với đáp án đúng. Sai một chi tiết nhỏ = 0 điểm.
* **`PartialCreditScoring`**:
  * Dành cho `multiple-choice`: Điểm nhận được = (Số ý đúng chọn được / Tổng số ý đúng) * MaxPoints (trừ điểm nếu chọn option sai để chống tick all).
* **`NegativeMarkingScoring`**:
  * Trừ điểm khi chọn sai để chống thí sinh đánh bừa (ví dụ: đúng +1, sai -0.25, không làm 0).

---

## BẢNG MÃ LỖI DOMAIN CHUẨN HÓA (DOMAIN ERROR CATALOG)

| Mã lỗi | HTTP Status | Mô tả nghiệp vụ |
| :--- | :--- | :--- |
| `QUIZ_NOT_FOUND` | 404 | Đề thi không tồn tại trong hệ thống |
| `QUIZ_NOT_PUBLISHED` | 400 | Đề thi chưa được xuất bản, thí sinh không thể bắt đầu |
| `QUIZ_PUBLISH_INVARIANT_VIOLATION`| 422 | Đề thi chưa đủ điều kiện xuất bản (thiếu câu hỏi, thang điểm sai) |
| `ATTEMPT_NOT_FOUND` | 404 | Không tìm thấy lượt thi với ID yêu cầu |
| `ATTEMPT_ALREADY_SUBMITTED` | 409 | Bài thi đã nộp, không được phép sửa câu trả lời |
| `ATTEMPT_ALREADY_IN_PROGRESS` | 409 | Thí sinh đang có lượt thi dở dang, không được mở thêm tab thi mới |
| `MAX_ATTEMPTS_EXCEEDED` | 403 | Thí sinh đã dùng hết số lượt làm bài cho phép của đề thi này |
| `ATTEMPT_TIME_EXPIRED` | 400 | Quá thời gian quy định làm bài (kể cả grace period) |
| `OUTDATED_ANSWER_TIMESTAMP` | 409 | Gói tin trả lời câu hỏi bị đến muộn hơn gói tin đã lưu trước đó |
| `INVALID_ANSWER_PAYLOAD` | 422 | Định dạng câu trả lời không khớp với loại câu hỏi |

---

## KẾ HOẠCH TRIỂN KHAI & KIỂM THỬ (IMPLEMENTATION & VERIFICATION)

### Trình tự thực thi:
1. **Pha 1 (Domain Core & State Machine)**: [HOÀN THÀNH - 100%]
   - [x] Xây dựng `services/quiz/src/domain/authoring/` (`Quiz`, `QuizVersion`, `PublishingPolicy`, `AttemptPolicy`).
   - [x] Xây dựng `services/quiz/src/domain/delivery/` (`Attempt`, `AttemptManifest`, `AttemptStatus`, `DeliverySanitizer`).
   - [x] Cài đặt State Machine: `CREATED` -> `IN_PROGRESS` -> `SUBMITTED` -> `GRADED` / `TIMED_OUT_GRADED`.
   - [x] Viết Unit Tests kiểm tra State Machine transitions, Graceful Auto-Submit và các ràng buộc Invariants (29 tests mới, tổng 96 tests passed).
2. **Pha 2 (Question & Scoring Engine)**: [HOÀN THÀNH - 100%]
   - [x] Triển khai `QuestionRegistry` và 3 handlers: `SingleChoiceHandler`, `MultipleChoiceHandler`, `TrueFalseHandler`.
   - [x] Tích hợp với `ScoringStrategy` (ExactMatch, PartialCredit, NegativeMarking) qua `AssessmentScoringEngine`.
   - [x] Viết Unit Tests kiểm tra tính điểm độc lập cho từng loại câu hỏi.
3. **Pha 3 (Application, Presentation & RESTful Delivery)**: [HOÀN THÀNH - 100%]
   - [x] Viết Use Cases: `AuthoringUseCases` (`createQuiz`, `addVersion`, `publishQuiz`, `getPublishedQuizzes`, `getQuizDetails`), `DeliveryUseCases` (`createAttempt`, `startAttempt`, `recordAnswer`, `submitAttempt`, `getAttemptDetails`).
   - [x] Cắm RESTful routes `/v1/quizzes` và `/v1/attempts`.
   - [x] Hoàn tất quá đoạn Facade và **loại bỏ triệt để Backward Compatibility Facade** (`/api/v1/*` và `legacy-facade.routes.ts`) để bảo đảm kiến trúc sạch (clean architecture).
   - [x] Cập nhật SDK `@platform/api-client` kết nối trực tiếp các Resource Primitives chuẩn RESTful v1 (`attempts`, `quizzes`).
   - [x] Đảm bảo 100% test suites (13 test files, 101 unit/integration tests) đều PASS.
4. **Pha 4 (Kiểm thử toàn diện, Hậu kiểm & Frontend Migration)**: [HOÀN THÀNH - 100%]
   - [x] Chạy toàn bộ Test Suite (101 tests PASS, 13 test files, không có regression).
   - [x] Nâng cấp `apps/quiz-web` đồng bộ 100% với `/v1/attempts` và `/v1/quizzes` qua `quizApi`.
   - [x] Tích hợp tính năng hiển thị và chọn đề thi khả dụng từ catalog trên giao diện `QuizStartView`.
   - [x] Cập nhật proxy trong `apps/quiz-web/vite.config.ts` và `apps/admin-web/vite.config.ts` cho các route `/v1/quizzes` và `/v1/attempts`.
   - [x] Kiểm tra xác thực toàn diện: Compile, Linting, Test Suites và Dev Server hoạt động ổn định tuyệt đối.
