# TÀI LIỆU THIẾT KẾ KIẾN TRÚC VÀ ĐẶC TẢ HỆ THỐNG QUIZ SERVICE
*(Quiz Assessment Core Engine: Domain-Driven Design & Hexagonal Architecture Specification)*  
**Dự án:** Platform Core / Quiz Assessment Engine & Auth System  
**Phiên bản:** v3.0 (Production-Ready Architecture)  
**Ngày cập nhật:** September 4, 2026  
**Trạng thái:** Hoàn tất 100% các tiêu chuẩn kiến trúc, kiểm thử tự động toàn diện (15/15 test files, 136/136 tests PASS).

---

## I. TỔNG QUAN HỆ THỐNG VÀ NGUYÊN TẮC THIẾT KẾ (SYSTEM OVERVIEW & DESIGN PRINCIPLES)

Quiz Service là lõi trung tâm của nền tảng thi và khảo sát trực tuyến, chịu trách nhiệm quản lý vòng đời đề thi (Authoring), điều phối quá trình làm bài thi (Delivery), thẩm định câu hỏi (Question Engine) và tự động chấm điểm (Scoring Engine). Hệ thống được xây dựng dựa trên các chuẩn mực kiến trúc công nghiệp:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   QUIZ CORE ENGINE                                      │
├────────────────────────────────────────────┬────────────────────────────────────────────┤
│           SUB-DOMAIN AUTHORING             │            SUB-DOMAIN DELIVERY             │
│  - Quiz (Entity)                           │  - Attempt (Aggregate Root)                │
│  - QuizVersion (Immutable Snapshot)        │  - AttemptManifest (Frozen Order Snapshot) │
│  - Publishing Policy (Invariants Check)    │  - State Machine & Deadline Timer          │
│  - AttemptPolicy (Retake / Max Attempts)   │  - Graceful Auto-Submit on Timeout         │
├────────────────────────────────────────────┴────────────────────────────────────────────┤
│                                QUESTION & SCORING ENGINE                                │
│  - Question Engine Registry (Single-choice, Multiple-choice, True/False, Extensible)    │
│  - Scoring Strategies (ExactMatch, PartialCredit, NegativeMarking)                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                             RESTFUL DOMAIN API & CLIENT INTEGRATION                     │
│  - RESTful /v1/quizzes (Catalog & Authoring) & /v1/attempts (Delivery & Examination)    │
│  - SDK @platform/api-client & apps/quiz-web kết nối trực tiếp Delivery RESTful API      │
│  - Bảo vệ chữ ký số RS256/JWKS, Phân quyền RBAC & Chống truy cập trái phép ca thi (IDOR)│
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6 Tiêu Chuẩn Kiến Trúc Cốt Lõi Vận Hành:
1. **Phân Định Sub-domain Rõ Rệt**: Tách biệt hoàn toàn giữa **Authoring** (biên soạn và xuất bản đề thi) và **Delivery** (quá trình thí sinh làm bài thi).
2. **Đóng Băng Thứ Tự Đề Thi (`AttemptManifest` Snapshot)**: Thứ tự câu hỏi và thứ tự lựa chọn đáp án được xáo trộn (shuffle) duy nhất một lần khi bắt đầu và đóng băng vĩnh viễn trong ca thi. Thí sinh tải lại trang, đổi thiết bị hay mất mạng đều giữ nguyên đề thi.
3. **Ranh Giới Khử Khuẩn Dữ Liệu (`DeliverySanitizer` Boundary)**: Tuyệt đối không gửi đáp án đúng (`correctAnswer`, `isCorrect`), giải thích (`explanation`) hay barem chấm điểm (`gradingRubric`) về phía trình duyệt khi thí sinh đang làm bài.
4. **Kiểm Soát Xung Đột & Tính Bất Biến Lệnh (`Idempotency & Concurrency Defense`)**: Mọi thao tác lưu câu trả lời đều ghi nhận `clientTimestamp`, từ chối các gói tin đến muộn (Out-Of-Order request) do độ trễ mạng gây ra.
5. **Thu Bài Tự Động Nhân Đạo (`Graceful Auto-Submit on Timeout`)**: Khi hết giờ làm bài, hệ thống không hủy bài thi hay chấm 0 điểm, mà tự động chuyển sang trạng thái `TIMED_OUT_GRADED` và chấm điểm các câu thí sinh đã kịp lưu trước thời điểm hết giờ.
6. **Chống Gian Lận Đa Tab & Phân Quyền Hạt Mịn (Anti-Fraud & RBAC)**: Mỗi thí sinh chỉ được mở tối đa một lượt thi ở trạng thái `IN_PROGRESS` trên cùng một đề thi; chặn triệt để lỗ hổng IDOR, nghiêm cấm truy cập hoặc nộp bài vào ca thi của người khác.

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
│   │   ├── attempt.aggregate.ts               # Aggregate Root Attempt
│   │   ├── attempt-manifest.ts                # Snapshot thứ tự câu hỏi & options
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
│       └── domain-errors.ts
├── application/                               # Lớp Điều Phối Tác Vụ (Use Cases)
│   ├── dtos/                                  # Data Transfer Objects
│   │   └── quiz.dto.ts
│   └── use-cases/
│       ├── authoring/                         # AuthoringUseCases (create, version, publish)
│       │   └── authoring.use-cases.ts
│       ├── delivery/                          # DeliveryUseCases (create, start, answer, submit)
│       │   └── delivery.use-cases.ts
│       └── quiz.use-cases.ts
├── infrastructure/                            # Lớp Hạ Tầng & Kho Lưu Trữ (Repositories)
│   └── repositories/
│       ├── in-memory-quiz.repository.ts       # Kho lưu trữ Quiz & Versions
│       └── in-memory-assessment.repository.ts # Kho lưu trữ Ca thi (Attempts)
└── presentation/                              # Lớp Giao Diện HTTP & Middlewares
    ├── middlewares/
    │   ├── auth.middleware.ts                 # Xác thực chữ ký số JWT RS256/HS256
    │   └── rbac.middleware.ts                 # Phân quyền Role & Kiểm tra IDOR
    ├── routes/
    │   ├── v1-quizzes.routes.ts               # RESTful API Authoring & Catalog
    │   └── v1-attempts.routes.ts              # RESTful API Delivery Phòng thi
    └── server.ts                              # Máy chủ Express Port 3000 hợp nhất
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

### 2. Đóng Băng Thứ Tự Đề Thi (`AttemptManifest` Snapshot)
Giải quyết triệt để vấn đề xáo trộn ngẫu nhiên mỗi lần gọi API:
* Khi thí sinh gọi `POST /v1/attempts/:id/start`, hệ thống thực hiện xáo trộn ngẫu nhiên câu hỏi và danh sách lựa chọn (nếu đề thi bật cờ shuffle), sau đó lưu cố định vào thuộc tính `manifest` của `Attempt`:
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
* Mọi lời gọi API lấy thông tin ca thi tiếp theo (`GET /v1/attempts/:id`) đều sắp xếp câu hỏi đúng theo thứ tự đã lưu trong `manifest`.

### 3. Ranh Giới Khử Khuẩn Dữ Liệu (`DeliverySanitizer`)
* Dữ liệu đề thi trả về cho thí sinh bắt buộc phải đi qua `DeliverySanitizer`:
  - **Loại bỏ triệt để**: `correctAnswer`, `correctOptionId`, `correctOptionIds`, `isCorrect`, `explanation`, `gradingRubric`.
  - **Giữ lại**: `id`, `type`, `prompt`, `points`, `options` (đã loại thuộc tính `isCorrect` và sắp xếp theo `AttemptManifest`).

### 4. Máy Trạng Thái Vòng Đời Ca Thi (State Machine)

```text
[ CREATED ]
    │
    │  (startAttempt) -> Khởi tạo AttemptManifest, tính deadline, kích hoạt đồng hồ
    ▼
[ IN_PROGRESS ]
    │
    │  (recordAnswer) -> Ghi nhận câu trả lời từng câu (Idempotent + Timestamp check)
    │  (submitAttempt) -> Thí sinh chủ động nộp bài trước thời hạn
    │  (autoSubmit)    -> Thí sinh nộp muộn hoặc hết giờ thi -> Chuyển sang TIMED_OUT_GRADED
    ▼
[ SUBMITTED ]
    │
    │  (gradeAttempt)  -> Kích hoạt Assessment Scoring Engine
    ▼
[ GRADED / TIMED_OUT_GRADED ]
```

* **Trạng thái `CREATED`**: Ca thi được tạo thành công, chưa tính giờ làm bài.
* **Trạng thái `IN_PROGRESS`**: Thí sinh đã bấm vào phòng thi, đồng hồ máy chủ tính `startedAt` và xác lập mốc `deadline = startedAt + durationMinutes`.
* **Trạng thái `SUBMITTED` / `GRADED`**: Bài thi đã nộp, khóa hoàn toàn khả năng chỉnh sửa đáp án (`ATTEMPT_ALREADY_SUBMITTED`).
* **Trạng thái `TIMED_OUT_GRADED` (Graceful Auto-Submit)**: Khi thí sinh nộp bài sau mốc `deadline` (kèm thời gian dung sai Grace Period), hệ thống tự động thu nhận tất cả câu trả lời đã lưu trước thời điểm hết giờ và thực hiện chấm điểm công bằng.

### 5. Kiểm Soát Tranh Chấp & Xung Đột Gói Tin (`Concurrency & Idempotency`)
* Mỗi câu trả lời được lưu trữ dưới dạng:
  ```typescript
  export interface CandidateAnswerRecord {
    answer: unknown;
    answeredAt: Date;
    clientTimestamp: number;
  }
  ```
* **Quy tắc Chống Ghi Đè Ngược**: Nếu request gửi lên có `clientTimestamp < currentAnswer.clientTimestamp`, hệ thống từ chối cập nhật với mã lỗi `OUTDATED_ANSWER_TIMESTAMP` (HTTP `409 Conflict`), ngăn ngừa rủi ro mạng chập chờn gửi request trước nhưng đến sau.

### 6. Chống Gian Lận Đa Tab (Multi-tab Prevention)
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

### 2. Nhóm Tài Nguyên `/v1/attempts` (Delivery & Phòng Thi)

| Phương thức | Đường dẫn Endpoint | Yêu cầu Quyền hạn | Mô tả chức năng |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/attempts` | Student (Chính chủ) | Khởi tạo hoặc khôi phục ca thi (`isExisting: boolean`) |
| `POST` | `/v1/attempts/:id/start` | Student (Chính chủ) | Bắt đầu tính giờ; nhận đề thi đã khử khuẩn và `AttemptManifest` |
| `GET` | `/v1/attempts/:id` | Student (Chính chủ) | Xem trạng thái phòng thi, thời gian còn lại, câu hỏi |
| `PUT` | `/v1/attempts/:id/answers/:questionId` | Student (Chính chủ) | Lưu đáp án từng câu kèm `clientTimestamp` chống xung đột mạng |
| `POST` | `/v1/attempts/:id/answers` | Student (Chính chủ) | Lưu đáp án qua Body `{ questionId, answer, clientTimestamp }` |
| `POST` | `/v1/attempts/:id/submit` | Student (Chính chủ) | Nộp bài thi, đóng băng ca thi và nhận kết quả chấm điểm tức thì |

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
        }
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

### 3. Danh Mục Mã Lỗi Domain Chuẩn Hóa (`DomainErrorCode`)

| Mã Lỗi (`errorCode`) | HTTP Status | Mô tả Nghiệp vụ |
| :--- | :---: | :--- |
| `QUIZ_NOT_FOUND` | 404 | Không tìm thấy đề thi với ID được cung cấp |
| `QUIZ_NOT_PUBLISHED` | 400 | Đề thi chưa được xuất bản, thí sinh không thể làm bài |
| `QUIZ_PUBLISH_INVARIANT_VIOLATION` | 422 | Đề thi không đủ điều kiện xuất bản (rỗng câu hỏi, thang điểm sai) |
| `ATTEMPT_NOT_FOUND` | 404 | Không tìm thấy ca thi tương ứng |
| `ATTEMPT_ALREADY_SUBMITTED` | 409 | Bài thi đã nộp, từ chối mọi thao tác chỉnh sửa đáp án |
| `ATTEMPT_ALREADY_IN_PROGRESS` | 409 | Thí sinh đã có ca thi đang dở dang, không được mở thêm tab |
| `MAX_ATTEMPTS_EXCEEDED` | 403 | Thí sinh đã sử dụng hết số lần thi tối đa cho phép |
| `ATTEMPT_TIME_EXPIRED` | 400 | Thời gian làm bài đã hết |
| `OUTDATED_ANSWER_TIMESTAMP` | 409 | Gói tin đáp án gửi lên cũ hơn gói tin đã được ghi nhận trước đó |
| `INVALID_ANSWER_PAYLOAD` | 422 | Cấu trúc câu trả lời không tương thích với loại câu hỏi |
| `INVALID_STATE_TRANSITION` | 409 | Chuyển đổi trạng thái ca thi bất hợp lệ |
| `FORBIDDEN` | 403 | Không đủ quyền hạn thực thi hoặc vi phạm quyền sở hữu ca thi |
| `UNAUTHORIZED` | 401 | Thiếu token xác thực hoặc token không hợp lệ |

---

## VIII. ĐỒNG BỘ KHÁCH HÀNG: SDK & GIAO DIỆN THÍ SINH (`quiz-web`)

1. **Thư Viện Khách Hàng `@platform/api-client`**:
   - Tương tác trực tiếp với các primitives chuẩn RESTful v1:
     - `apiClient.quizzes.list()` / `get()` / `create()` / `addVersion()` / `publish()`
     - `apiClient.attempts.create()` / `start()` / `recordAnswer()` / `submit()` / `get()`
   - Tự động gắn kèm Header Authorization qua Token Provider.
2. **Giao Diện Thí Sinh `apps/quiz-web`**:
   - `QuizStartView`: Tự động tải danh mục đề thi khả dụng từ `GET /v1/quizzes`, cho phép chọn đề thi và hiển thị thông tin bài thi.
   - `QuizActiveView`: Hiển thị danh sách câu hỏi theo đúng thứ tự `AttemptManifest`, đồng bộ đồng hồ đếm ngược với `deadline` của máy chủ.
   - `useQuizSession`: Hook điều phối tự động lưu đáp án khi thí sinh click chọn, cảnh báo mất kết nối mạng và hỗ trợ tự động nộp bài khi hết giờ.

---

## IX. CHỈ SỐ KIỂM THỬ VÀ ĐẢM BẢO CHẤT LƯỢNG (TESTING & VERIFICATION)

Chất lượng của Quiz Assessment Engine được kiểm chứng qua bộ kiểm thử tự động toàn diện:

```text
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

Test Files:  15 passed (15)
Tests:       136 passed (136)
Result:      100% Pass, Không có lỗi hồi quy (Zero Regression)
```

### Kết Luận Nghiệm Thu:
* Hệ thống Quiz Service đã hoàn tất quá trình chuyển đổi kiến trúc sang chuẩn công nghiệp **Domain-Driven Design (DDD)** và **Hexagonal Architecture**.
* Hai sub-domain **Authoring** và **Delivery** hoạt động độc lập, rõ ràng và mạch lạc.
* Bộ ba Động cơ **State Machine**, **Question Engine** và **Assessment Scoring Engine** bảo đảm tính tin cậy, chính xác và khả năng mở rộng cao cho nền tảng thi trực tuyến.
