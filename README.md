# 🚀 Assessment & Quiz Engine Platform (Monorepo)

Hệ thống đánh giá năng lực và thi trắc nghiệm trực tuyến thế hệ mới, được thiết kế theo chuẩn **Monorepo**, kiến trúc **Hexagonal Architecture (Ports & Adapters)** kết hợp **Domain-Driven Design (DDD)** trên nền tảng **TypeScript**.

Toàn bộ logic nghiệp vụ đánh giá, quản lý vòng đời bài thi và thuật toán chấm điểm được cô lập hoàn toàn khỏi Web Framework, cơ sở dữ liệu và giao diện người dùng.

---

## 🏛️ Cấu Trúc Monorepo (Project Structure)

```text
.
├── services/
│   ├── quiz/                         # 🧠 Core Assessment & Delivery Engine (Port 3000)
│   │   ├── src/
│   │   │   ├── domain/               # Pure Business Logic (Framework-Agnostic)
│   │   │   │   ├── authoring/        # Sub-domain Quản lý & Soạn thảo đề thi (Quiz, Version, Policies)
│   │   │   │   ├── delivery/         # Sub-domain Tổ chức thi (Attempt, Manifest, Sanitizer)
│   │   │   │   ├── question-engine/  # Question Registry & Handlers (Single, Multi, True/False)
│   │   │   │   ├── scoring/          # Chiến lược chấm điểm (Exact, Partial, Negative)
│   │   │   │   └── ports/            # Repository Interfaces & Secondary Ports
│   │   │   ├── application/          # Use Cases (AuthoringUseCases, DeliveryUseCases)
│   │   │   ├── infrastructure/       # Persistence Repositories & In-memory Storage
│   │   │   └── presentation/         # RESTful Inbound Routes (/v1/quizzes, /v1/attempts)
│   │   └── tests/                    # 101 Automated Unit, Integration & Boundary Tests
│   └── auth/                         # 🔐 Authentication Service (JWT & Principal Token)
│
├── packages/
│   ├── api-client/                   # 📦 Type-Safe SDK cho toàn bộ RESTful API
│   ├── auth-client/                  # 📦 Auth SDK quản lý phiên đăng nhập & JWT context
│   └── contracts/                    # 📦 Common Type Definitions & Domain Contracts
│
├── apps/
│   ├── quiz-web/                     # 💻 Web App làm bài cho Thí sinh (React + Tailwind + Vite)
│   └── admin-web/                    # 🛠️ Web App Quản trị & Soạn thảo đề thi (React + Vite)
│
├── EXECUTION_PLAN.md                 # 📋 Chi tiết kế hoạch thực thi & đối chiếu 4 Pha
└── README.md
```

---

## 🌟 Tính Năng & Điểm Nhấn Kiến Trúc (Core Capabilities)

### 1. Phân Tách Rõ Ràng Hai Bounded Contexts (DDD)
- **Authoring Sub-domain (Soạn thảo đề thi)**:
  - Vòng đời bài thi an toàn: `DRAFT` ➜ `REVIEW` ➜ `PUBLISHED` ➜ `ARCHIVED`.
  - Cơ chế **QuizVersion Snapshot**: Mỗi lần xuất bản sẽ tạo một bản chụp đề thi bất biến, ngăn chặn việc sửa đổi đề làm sai lệch kết quả của các thí sinh đang thi.
  - Kiểm định quy chuẩn xuất bản (`PublishingPolicy`): Chặn xuất bản khi đề trống, điểm bằng 0 hoặc cấu hình chấm sai lệch.
- **Delivery Sub-domain (Tổ chức thi & Nộp bài)**:
  - Quản lý phiên làm bài thông qua Aggregate Root `Attempt`.
  - **AttemptManifest**: Đóng băng trật tự câu hỏi và thứ tự các phương án xáo trộn riêng biệt cho từng thí sinh, đảm bảo refresh trang không bị đổi đề.
  - **AttemptPolicy**: Kiểm soát số lần thi tối đa (`maxAttempts`) và tự động khôi phục ca thi đang làm (`Resume Attempt`) khi mở lại trình duyệt hoặc nhiều tab.

### 2. Question Engine Registry (Open-Closed Principle)
Thiết kế theo **Registry Pattern**, cho phép bổ sung loại câu hỏi mới mà không sửa đổi mã nguồn hiện có:
- **Single-choice**: Trắc nghiệm 1 đáp án đúng.
- **Multiple-choice**: Trắc nghiệm chọn nhiều đáp án đúng.
- **True/False**: Câu hỏi Đúng / Sai.

### 3. Chiến Lược Chấm Điểm Linh Hoạt (Pluggable Scoring Strategies)
- **ExactMatchScoringStrategy**: Yêu cầu chọn chính xác 100% các đáp án đúng để đạt điểm tối đa.
- **PartialCreditScoringStrategy**: Cho điểm từng phần dựa trên tỷ lệ đáp án đúng chọn được và phạt điểm khi chọn phương án sai.
- **NegativeMarkingScoringStrategy**: Trừ điểm khi chọn sai để hạn chế thí sinh đoán mò ngẫu nhiên.

### 4. Bảo Mật Đề Thi & Chống Xung Đột Dữ Liệu
- **DeliverySanitizer**: Bóc tách triệt để `correctAnswer`, `correctOptionId`, `gradingRubric`, `explanation` ngay tại ranh giới Server trước khi dữ liệu đến tay thí sinh.
- **Concurrency & Idempotency**: Mọi thao tác lưu câu trả lời đều mang theo `clientTimestamp`, ngăn chặn ghi đè câu trả lời do mạng trễ hoặc các request đến sai thứ tự.
- **Graceful Auto-Submit**: Tự động thu bài và chấm điểm các câu đã làm khi hết thời gian thay vì hủy kết quả.

---

## 🔌 Chuẩn Giao Tiếp RESTful API v1

Hệ thống giao tiếp trực tiếp qua chuẩn RESTful primitives (đã loại bỏ tầng Facade quá độ):

### 📋 Authoring & Catalog APIs (`/v1/quizzes`)
| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/v1/quizzes` | Lấy danh sách đề thi đã xuất bản (Status: `PUBLISHED`) |
| `POST` | `/v1/quizzes` | Tạo mới đề thi ở trạng thái bản nháp (`DRAFT`) |
| `GET` | `/v1/quizzes/:id` | Xem chi tiết thông tin và các phiên bản của đề thi |
| `POST` | `/v1/quizzes/:id/versions` | Tạo phiên bản mới (`QuizVersion`) cho đề thi |
| `POST` | `/v1/quizzes/:id/publish` | Xuất bản đề thi theo phiên bản chỉ định |

### 🎯 Delivery APIs (`/v1/attempts`)
| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| `POST` | `/v1/attempts` | Tạo mới hoặc khôi phục ca thi của thí sinh |
| `POST` | `/v1/attempts/:id/start` | Bắt đầu tính giờ & nhận đề thi đã khử khuẩn (`Sanitized Manifest`) |
| `GET` | `/v1/attempts/:id` | Xem tiến độ ca thi hiện tại |
| `PUT` | `/v1/attempts/:id/answers/:questionId` | Lưu câu trả lời từng câu (kèm `clientTimestamp`) |
| `POST` | `/v1/attempts/:id/submit` | Khóa bài thi, tính điểm chính thức và trả về kết quả |

---

## 🛠️ Hướng Dẫn Cài Đặt & Khởi Chạy (Getting Started)

### Yêu cầu môi trường
- **Node.js**: >= 18.0.0
- **npm** hoặc **bun** / **pnpm**

### Lệnh thực thi chính

```bash
# 1. Cài đặt toàn bộ dependencies
npm install

# 2. Chạy toàn bộ 101 Automated Unit & Integration Tests
npm test

# 3. Kiểm tra tĩnh kiểu dữ liệu (Type-check / Lint)
npm run lint

# 4. Biên dịch dự án
npm run build

# 5. Khởi chạy môi trường phát triển (Dev Server)
npm run dev
```

---

## 🧪 Kết Quả Kiểm Thử (Test Suites)

Toàn bộ **101 unit/integration tests** thuộc **13 test files** đều đạt trạng thái **PASS 100%**:
- `services/quiz/tests/domain/authoring/quiz.spec.ts`: Quản lý trạng thái và phiên bản đề thi.
- `services/quiz/tests/domain/authoring/attempt-policy.spec.ts`: Chính sách giới hạn lượt thi và khôi phục ca thi.
- `services/quiz/tests/domain/delivery/attempt-state-machine.spec.ts`: FSM ca thi và kiểm soát thời gian.
- `services/quiz/tests/domain/delivery/attempt-manifest.spec.ts`: Bất biến xáo trộn câu hỏi và đáp án.
- `services/quiz/tests/scoring/scoring.spec.ts`: Các chiến lược tính điểm (Exact, Partial, Negative).
- `services/quiz/tests/security/sanitization-boundary.spec.ts`: Lọc dữ liệu nhạy cảm trước khi gửi client.
- `services/quiz/tests/security/principal-context.spec.ts`: Bảo vệ quyền sở hữu ca thi theo JWT.
- `services/quiz/tests/presentation/assessment-api.spec.ts`: RESTful API Endpoints (`/v1/quizzes`, `/v1/attempts`).
- `packages/api-client/tests/api-client.spec.ts`: Type-Safe SDK Client.
- `packages/auth-client/tests/auth-client.spec.ts` & `services/auth/tests/auth.spec.ts`: Dịch vụ xác thực.