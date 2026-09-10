# BÁO CÁO AUDIT MẪU SEED DỮ LIỆU & LUỒNG KHỞI TẠO CA THI

> **Dự án**: Nền tảng Khảo thí & Thi Trắc nghiệm Trực tuyến (Quiz & Assessment Platform)  
> **Thư mục lưu trữ**: `/audit/seed-and-attempt-flow-audit.md`  
> **Người thực hiện**: Hệ thống Đánh giá Kiến trúc Nền tảng  
> **Ngày lập báo cáo**: Tháng 09/2026  
> **Trạng thái**: Hoàn thành đánh giá chi tiết (Audit Completed)  
> **Mục tiêu**:
> 1. Kiểm tra sự phù hợp và độ phủ của các mẫu dữ liệu khởi tạo (Seed Data) đối với tính năng lọc đề thi theo Cấp học, Khối lớp, Môn học/Chủ đề.
> 2. Phân tích nguyên nhân gốc rễ (Root Cause Analysis) và chuỗi sự kiện dẫn đến lỗi khởi tạo ca thi:  
>    `Lỗi khởi tạo bài thi: User authentication or userId in body is required to start an attempt`.

---

## 📑 MỤC LỤC BÁO CÁO

1. [Tóm tắt Điều hành (Executive Summary)](#1-tóm-tắt-điều-hành-executive-summary)
2. [Phần I: Đánh giá Mẫu Seed Dữ liệu & Tính phù hợp với Bộ lọc Đề thi](#2-phần-i-đánh-giá-mẫu-seed-dữ-liệu--tính-phù-hợp-với-bộ-lọc-đề-thi)
   - [1. Hiện trạng Hệ thống Phân loại (Taxonomy Seed)](#1-hiện-trạng-hệ-thống-phân-loại-taxonomy-seed)
   - [2. Hiện trạng Đề thi Khảo thí (Exam Seed)](#2-hiện-trạng-đề-thi-khảo-thí-exam-seed)
   - [3. Khoảng trống Dữ liệu (Coverage Gap Analysis)](#3-khoảng-trống-dữ-liệu-coverage-gap-analysis)
   - [4. Lỗi Đứt gãy Hợp đồng Dữ liệu Bộ lọc (Data Contract Disconnect Bug)](#4-lỗi-đứt-gãy-hợp-đồng-dữ-liệu-bộ-lọc-data-contract-disconnect-bug)
3. [Phần II: Kiểm tra Luồng Khởi tạo Ca thi (Attempt Initiation Flow)](#3-phần-ii-kiểm-tra-luồng-khởi-tạo-ca-thi-attempt-initiation-flow)
   - [1. Sơ đồ Luồng Thực thi (End-to-End Execution Flow)](#1-sơ-đồ-luồng-thực-thi-end-to-end-execution-flow)
   - [2. Phân tích Nguyên nhân Gốc rễ Lỗi 401 (Root Cause Analysis)](#2-phân-tích-nguyên-nhân-gốc-rễ-lỗi-401-root-cause-analysis)
   - [3. Bóc tách 3 Lỗ hổng Kỹ thuật trong Chuỗi Gọi API](#3-bóc-tách-3-lỗ-hổng-kỹ-thuật-trong-chuỗi-gọi-api)
4. [Phần III: Ma trận Mẫu Seed Đề xuất cho Kiểm thử Toàn diện](#4-phần-iii-ma-trận-mẫu-seed-đề-xuất-cho-kiểm-thử-toàn-diện)
5. [Phần IV: Kế hoạch Khắc phục & Hoàn thiện (Remediation Roadmap)](#5-phần-iv-kế-hoạch-khắc-phục--hoàn-thiện-remediation-roadmap)

---

## 1. TÓM TẮT ĐIỀU HÀNH (EXECUTIVE SUMMARY)

Qua rà soát toàn diện mã nguồn các dịch vụ backend (`taxonomy`, `question`, `assessment`, `exam`, `attempt`, `auth`), các thư viện dùng chung (`@platform/contracts`, `@platform/api-client`, `@platform/auth-client`) và ứng dụng phía học viên (`apps/quiz-web`), chúng tôi xác nhận:

1. **Về Mẫu Seed Dữ liệu (Seed Data)**:
   - **Đánh giá**: **HOÀN TOÀN CHÍNH XÁC** như phản ánh của người dùng. Hệ thống hạt giống (seed data) hiện tại **hoàn toàn mất cân đối và không đủ điều kiện để kiểm thử tính năng lọc đa chiều (Faceted Filtering)**.
   - **Thực tế**: Trong khi cây Phân loại (`tax_grade`) định nghĩa đầy đủ 3 cấp học (Tiểu học, THCS, THPT) với 12 khối lớp, thì dịch vụ Đề thi (`services/exam`) **chỉ tạo đúng 2 đề thi** (`EXM_TOAN10_HK1` và `EXM_IT_SQL_01`), và **cả 2 đều gắn cứng vào Lớp 10 (THPT)**. Cấp 1 (Lớp 1-5), Cấp 2 (Lớp 6-9), Lớp 11-12 và các môn học khác (Vật lý, Tiếng Anh...) đều có **0 đề thi**, khiến các nhánh bộ lọc này luôn rơi vào trạng thái rỗng.
   - **Lỗi kỹ thuật nghiêm trọng**: Có sự lệch chuẩn (mismatch) giữa dữ liệu trả về của API `GET /v1/exams` (Exam Service) và logic lọc phía `QuizStartView.tsx`. Frontend lọc theo `e.assessment.primaryTopicNodeId` và `e.assessment.gradeNodeId`, nhưng `ExamDTO` từ backend **không chứa đối tượng `assessment` lồng nhau**, dẫn đến việc mọi đề thi đều có mã phân loại là `undefined`, khiến bộ lọc bị vô hiệu hóa 100%.

2. **Về Luồng Khởi tạo Ca thi (Attempt Initiation Flow)**:
   - **Nguyên nhân sự cố**: Lỗi `User authentication or userId in body is required to start an attempt` xảy ra do sự đứt gãy truyền thông tin định danh thí sinh qua các tầng frontend:
     1. Hook `useQuizSession.ts` nhận `user.id` từ giao diện (`App.tsx`), nhưng hàm `quizApi.startQuiz(quizId)` lại **bỏ qua tham số này**, không gửi xuống `ApiClient`.
     2. Gói `packages/api-client` trong phương thức `attempts.createOrRecover` **không cho phép truyền `userId`** trong body.
     3. Khi token xác thực trong phiên làm việc bị quá hạn (TTL) hoặc dịch vụ Auth ở môi trường dev chưa cấp JWT hợp lệ qua Header `Authorization: Bearer <token>`, backend `services/attempt` tìm kiếm `req.principal.id` và `req.body.userId`. Do cả 2 giá trị này đều bị thiếu, controller lập tức trả về mã lỗi `401 Unauthorized`.

---

## 2. PHẦN I: ĐÁNH GIÁ MẪU SEED DỮ LIỆU & TÍNH PHÙ HỢP VỚI BỘ LỌC ĐỀ THI

### 1. Hiện trạng Hệ thống Phân loại (Taxonomy Seed)
File nguồn: `services/taxonomy/src/infrastructure/db/seed.ts`

Hệ thống taxonomy được cấu trúc với 4 danh mục chuẩn:
- `tax_topic` (Chủ đề kiến thức - Cây phân cấp đa tầng):
  - **Toán học** (`node_topic_math`):
    - Đại số (`node_topic_math_algebra`) -> Đại số 10 (`node_topic_math_algebra_10`) -> Phương trình bậc hai (`node_math_quad_eq`).
    - Hình học (`node_topic_math_geometry`).
  - **Vật lý**: Động học chất điểm (`node_phys_kinematics`).
  - **Công nghệ thông tin / Tin học**: Cơ sở dữ liệu (`node_topic_it_db`).
  - **Ngoại ngữ**: Tiếng Anh tổng quát (`node_topic_english`).
- `tax_grade` (Cây Cấp học & Khối lớp chuẩn EdTech):
  - **Tiểu học** (`node_grade_primary`): Lớp 1 (`node_grade_1`) đến Lớp 5 (`node_grade_5`).
  - **Trung học cơ sở** (`node_grade_secondary`): Lớp 6 (`node_grade_6`) đến Lớp 9 (`node_grade_9`).
  - **Trung học phổ thông** (`node_grade_high`): Lớp 10 (`node_grade_10`), Lớp 11 (`node_grade_11`), Lớp 12 (`node_grade_12`).
- `tax_difficulty` (Mức độ nhận thức): REMEMBER, UNDERSTAND, APPLY, ANALYZE.
- `tax_tag` (Thẻ chuyên đề): Ôn tập, Giữa kỳ, Cuối kỳ, HSG.

### 2. Hiện trạng Đề thi Khảo thí (Exam Seed)
File nguồn: `services/exam/src/infrastructure/db/seed.ts` và `services/assessment/src/infrastructure/db/seed.ts`

Hệ thống hiện tại chỉ khởi tạo 3 ma trận bài kiểm tra (Assessment) và 2 đề thi chính thức (Exam):
1. **Assessment 1 (`asm_math10_midterm`)**: Đề kiểm tra giữa kỳ 1 - Toán 10.
   - `gradeNodeId`: `node_grade_10` (Lớp 10).
   - `primaryTopicNodeId`: `node_math_quad_eq` (Phương trình bậc hai).
   - Đã sinh Exam: `EXM_TOAN10_HK1` (4 mã đề: 101, 102, 103, 104).
2. **Assessment 2 (`asm_it_sql`)**: Kiểm tra Cơ sở dữ liệu quan hệ & SQL.
   - `gradeNodeId`: `node_grade_10` (Gán tạm thời vào Lớp 10).
   - `primaryTopicNodeId`: `node_topic_it_db` (Cơ sở dữ liệu).
   - Đã sinh Exam: `EXM_IT_SQL_01` (2 mã đề: 101, 102).
3. **Assessment 3 (`asm_phys10_review`)**: Bài tập trắc nghiệm Động học chất điểm - Vật lý 10.
   - Trạng thái: `DRAFT` (Nháp), **chưa sinh Exam**.

### 3. Khoảng trống Dữ liệu (Coverage Gap Analysis)

Bảng đối chiếu giữa Cấu trúc Phân loại và Số lượng Đề thi Khả dụng:

| Cấp học / Khối lớp | Phân cấp Taxonomy | Số Đề thi Thực tế (Seed) | Đánh giá Khả năng Kiểm thử Bộ lọc |
| :--- | :--- | :---: | :--- |
| **Tiểu học (Cấp 1)** | Lớp 1, 2, 3, 4, 5 | **0** | ❌ **Liệt bộ lọc**: Chọn Tiểu học hoặc Lớp 1-5 ra 0 kết quả. |
| **THCS (Cấp 2)** | Lớp 6, 7, 8, 9 | **0** | ❌ **Liệt bộ lọc**: Chọn THCS hoặc Lớp 6-9 ra 0 kết quả. |
| **THPT - Lớp 10** | Lớp 10 | **2** | ⚠️ Đạt yêu cầu tối thiểu (Toán 10, SQL). |
| **THPT - Lớp 11** | Lớp 11 | **0** | ❌ Không có bài thi để kiểm tra lọc theo lớp. |
| **THPT - Lớp 12** | Lớp 12 | **0** | ❌ Không có bài thi để kiểm tra kỳ thi tốt nghiệp / THPTQG. |
| **Môn Tiếng Anh** | Chủ đề Ngoại ngữ | **0** | ❌ Không kiểm thử được môn ngôn ngữ. |
| **Môn Vật lý** | Động học chất điểm | **0** | ❌ Assessment ở trạng thái Draft, chưa có Exam. |

**Kết luận**: Nhận định của người dùng là chính xác 100%. Dữ liệu mẫu hiện tại không thể phục vụ việc kiểm thử bộ lọc cấp học, khối lớp và chủ đề.

### 4. Lỗi Đứt gãy Hợp đồng Dữ liệu Bộ lọc (Data Contract Disconnect Bug)

Bên cạnh sự thiếu hụt mẫu seed, quá trình audit phát hiện một lỗi logic nghiêm trọng trong việc ánh xạ dữ liệu giữa Frontend và Backend khiến bộ lọc bị vô hiệu hóa:

- **Phía Frontend (`apps/quiz-web/src/views/QuizStartView.tsx`)**:
  ```typescript
  // Dòng 160-161:
  primaryNodeId: e.assessment?.primaryTopicNodeId,
  gradeNodeId: e.assessment?.gradeNodeId,
  ```
  Bộ lọc 2 chiều (2D Faceted Filter) dựa vào `q.primaryNodeId` và `q.gradeNodeId` để đối chiếu với tập nút con cháu (descendants):
  ```typescript
  // Dòng 284-301:
  if (selectedCategoryNodeId) {
    if (!q.primaryNodeId) return false;
    ...
  }
  if (selectedGradeNodeId) {
    if (!q.gradeNodeId) return false;
    ...
  }
  ```

- **Phía Backend (`services/exam/src/domain/entities/exam.entity.ts`)**:
  DTO của Exam (`ExamDTO`) trả về từ API `/v1/exams` chỉ bao gồm:
  ```typescript
  export interface ExamDTO {
    id: string;
    assessmentId: string; // <-- Chỉ có ID của assessment, KHÔNG có object assessment
    code: string;
    title: string;
    durationMinutes: number;
    isPublished: boolean;
    status: ExamStatus;
    variants?: ExamVariantSummary[];
  }
  ```
- **Hậu quả**: Khi danh sách đề thi được tải về, `e.assessment` luôn là `undefined`, dẫn đến `primaryNodeId` và `gradeNodeId` của tất cả bài thi đều là `undefined`. **Ngay khi người dùng nhấp vào bất kỳ Chủ đề hoặc Khối lớp nào trên thanh điều hướng, danh sách bài thi lập tức bị lọc sạch (0 bài thi)!**

---

## 3. PHẦN II: KIỂM TRA LUỒNG KHỞI TẠO CA THI (ATTEMPT INITIATION FLOW)

### 1. Sơ đồ Luồng Thực thi (End-to-End Execution Flow)

```
[Người dùng / Học viên]
        │
        ▼ Bấm "Bắt đầu ca thi" (QuizContentArea.tsx:467)
[QuizStartView.tsx] ──── gọi onStart(quizId)
        │
        ▼
[App.tsx: handleStart]
        │  Kiểm tra: if (!isAuthenticated || !user) -> Chuyển LoginView
        │  Đã xác thực: user.id = 'usr_student_local'
        ▼
[useQuizSession.ts: start(quizId, customUserId)]
        │  ⚠️ LỖI 1: Nhận customUserId nhưng KHÔNG truyền vào quizApi.startQuiz()
        ▼
[quiz-api.ts: startQuiz(quizOrExamId)]
        │  ⚠️ LỖI 2: Gọi apiClient.attempts.createOrRecover() không có trường userId
        ▼
[ApiClient (packages/api-client)]
        │  Gửi HTTP POST /v1/attempts
        │  Headers: Authorization: Bearer <token> (⚠️ LỖI 3: Token có thể null/expired)
        │  Body: { examId: "EXM_IT_SQL_01", quizId: "EXM_IT_SQL_01", autoStart: true }
        ▼
[Gateway (/v1/attempts)] ─── chuyển tiếp tới Attempt Service Router
        │
        ▼
[AttemptController: createOrRecover (attempt.controller.ts:40-48)]
        │  const principal = req.principal;
        │  const userId = principal?.id || (req.body && req.body.userId);
        │
        ├──> if (!userId) {
        │      res.status(401).json({
        │        success: false,
        │        message: 'User authentication or userId in body is required to start an attempt'
        │      });
        │      return; // ❌ DỪNG LẠI TẠI ĐÂY (HTTP 401)
        │    }
        ▼
[Frontend UI]
        │
        └──> Hiển thị banner đỏ:
             "Lỗi khởi tạo bài thi: User authentication or userId in body is required to start an attempt"
```

### 2. Phân tích Nguyên nhân Gốc rễ Lỗi 401 (Root Cause Analysis)

Mã nguồn tại `services/attempt/src/presentation/controllers/attempt.controller.ts`:
```typescript
const principal = req.principal;
const userId = principal?.id || (req.body && req.body.userId);
if (!userId) {
  res.status(401).json({
    success: false,
    message: 'User authentication or userId in body is required to start an attempt',
  });
  return;
}
```

Kiến trúc backend của `AttemptController` đã được thiết kế sẵn cơ chế phòng vệ kép (Dual Defense):
1. **Cách 1 (Primary)**: Lấy ID từ `req.principal.id` (được giải mã từ JWT Bearer Token bởi middleware `extractAuth`).
2. **Cách 2 (Fallback)**: Lấy ID từ `req.body.userId` (dành cho client gửi định danh trực tiếp hoặc môi trường thử nghiệm).

Tuy nhiên, lỗi 401 đã xảy ra vì **cả hai nguồn định danh đều đồng thời bị triệt tiêu**:

### 3. Bóc tách 3 Lỗ hổng Kỹ thuật trong Chuỗi Gọi API

#### Lỗ hổng 1: Bỏ rơi định danh tại Hook `useQuizSession.ts`
Trong `apps/quiz-web/src/hooks/useQuizSession.ts`:
```typescript
// Dòng 27-34:
const start = useCallback(async (quizId: string, customUserId?: string) => {
  try {
    setErrorMessage(null);
    const activeUserId = customUserId?.trim() || userId;
    if (customUserId?.trim()) {
      setUserId(customUserId.trim());
    }

    // ❌ LỖI: activeUserId được tính toán nhưng KHÔNG truyền vào quizApi.startQuiz()
    const data = await quizApi.startQuiz(quizId);
```
Hàm nhận `customUserId` từ `App.tsx` (chính là `user.id`), lưu vào state nội bộ nhưng khi gọi API thì lại chỉ truyền đúng 1 tham số `quizId`.

#### Lỗ hổng 2: Thiếu trường `userId` trong `quiz-api.ts` và `api-client`
Trong `apps/quiz-web/src/api/quiz-api.ts`:
```typescript
// Dòng 85-92:
async startQuiz(quizOrExamId: string, variantCode?: string): Promise<StartQuizResponse['data']> {
  const createRes: any = await apiClient.attempts.createOrRecover({
    examId: quizOrExamId,
    quizId: quizOrExamId,
    variantCode,
    autoStart: true,
    // ❌ KHÔNG TRUYỀN userId VÀO BODY
  });
```
Và trong `packages/api-client/src/client.ts`:
```typescript
// Dòng 226-232:
createOrRecover: async (payload: {
  examId?: string;
  quizId?: string;
  variantCode?: string;
  autoStart?: boolean;
  // ❌ Type definition và body payload không có userId
  metadata?: Record<string, unknown>;
})
```

#### Lỗ hổng 3: Token hết hạn và sự cố Refresh Token trong môi trường Sandbox
Trong `packages/auth-client/src/client.ts`:
```typescript
async getAccessToken(): Promise<string | null> {
  if (this.session.isExpired() && this.autoRefresh && this.session.getRefreshToken()) {
    try {
      const refreshed = await this.refresh();
      return refreshed.accessToken;
    } catch {
      return null; // ⚠️ Nếu refresh thất bại, trả về null
    }
  }
  return this.session.getAccessToken();
}
```
Khi học viên mở trình duyệt, nếu access token trong `localStorage` đã qua thời hạn 15 phút, `getAccessToken()` cố gắng refresh. Nếu dịch vụ Auth ở môi trường dev không thể refresh token, phương thức này trả về `null`. Khi đó `ApiClient` không đính kèm header `Authorization: Bearer <token>`. Vì vậy `req.principal` trên máy chủ là `undefined`. Kết hợp với Lỗ hổng 1 & 2 (không có `userId` trong body), hệ thống hoàn toàn mất dấu định danh người dùng.

---

## 4. PHẦN III: MA TRẬN MẪU SEED ĐỀ XUẤT CHO KIỂM THỬ TOÀN DIỆN

Để đáp ứng đầy đủ yêu cầu kiểm thử tính năng lọc (Cấp học, Khối lớp, Chuyên đề) và kiểm thử luồng thi đa dạng, hệ thống cần được bổ sung bộ mẫu seed tối thiểu theo ma trận sau:

| Mã Đề thi (Code) | Tiêu đề Bài thi | Cấp học | Khối lớp (`gradeNodeId`) | Môn / Chủ đề (`topicNodeId`) | Thời gian | Số câu | Mục đích Kiểm thử |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `EXM_PRI_MATH_01` | Khảo sát Năng lực Toán Lớp 1 | Tiểu học | Lớp 1 (`node_grade_1`) | Số học & Phép cộng trừ | 15 phút | 10 | Kiểm thử lọc Cấp 1 & Khối 1 |
| `EXM_PRI_MATH_05` | Đề Ôn tập Cuối kỳ Toán Lớp 5 | Tiểu học | Lớp 5 (`node_grade_5`) | Phân số & Hình học cơ bản | 30 phút | 15 | Kiểm thử lọc Cấp 1 & Khối 5 |
| `EXM_SEC_MATH_09` | Đề Luyện thi Tuyển sinh Vào 10 | THCS | Lớp 9 (`node_grade_9`) | Đại số & Hình học 9 | 45 phút | 20 | Kiểm thử lọc Cấp 2 & Khối 9 |
| `EXM_SEC_ENG_08` | Bài thi Trắc nghiệm Tiếng Anh Lớp 8 | THCS | Lớp 8 (`node_grade_8`) | Ngữ pháp & Từ vựng Anh | 30 phút | 20 | Kiểm thử lọc môn Ngoại ngữ Cấp 2 |
| `EXM_TOAN10_HK1` | Đề Thi Giữa Kỳ 1 Môn Toán Lớp 10 | THPT | Lớp 10 (`node_grade_10`) | Phương trình bậc hai | 45 phút | 10 | Đề hiện hữu (Đã có 4 mã đề) |
| `EXM_IT_SQL_01` | Bài Kiểm Tra SQL & Cơ Sở Dữ Liệu | Đào tạo / THPT | Lớp 10 (`node_grade_10`) | Tin học / CSDL Quan hệ | 15 phút | 5 | Đề hiện hữu (Đã có 2 mã đề) |
| `EXM_PHYS_10_01` | Đề Kiểm tra Vật lý 10: Động học | THPT | Lớp 10 (`node_grade_10`) | Vật lý: Động học chất điểm | 30 phút | 15 | Kích hoạt từ Assessment nháp |
| `EXM_THPT_QG_12` | Đề Thi Thử Tốt Nghiệp THPT Môn Toán | THPT | Lớp 12 (`node_grade_12`) | Hàm số, Tích phân, Không gian | 90 phút | 50 | Kiểm thử ca thi lớn, Khối 12 |

---

## 5. PHẦN IV: KẾ HOẠCH KHẮC PHỤC & HOÀN THIỆN (REMEDIATION ROADMAP)

### Giai đoạn 1: Sửa triệt để Lỗi Khởi tạo Ca thi (Khẩn cấp) - ✅ [ĐÃ HOÀN THÀNH]
1. **Cập nhật `packages/contracts/src/attempt/attempt.ts`**:
   - Bổ sung `userId?: string` vào các interface hợp đồng `StartAttemptInput`, `AutosaveAnswerInput`, `SubmitAttemptInput`.
2. **Cập nhật `packages/api-client/src/client.ts`**:
   - Mở rộng kiểu dữ liệu payload của `attempts.create`, `attempts.createOrRecover` và `attempts.start` để chấp nhận và serialize thuộc tính `userId?: string`.
3. **Cập nhật `packages/auth-client/src/client.ts`**:
   - Bổ sung phương thức `isExpired(): boolean` để UI có thể chủ động kiểm tra trạng thái token chuẩn bị làm mới trước các thao tác nhạy cảm.
4. **Cập nhật `apps/quiz-web/src/api/quiz-api.ts`**:
   - Bổ sung tham số `userId?: string` vào `startQuiz(quizOrExamId, variantCode, userId)`.
   - Chuyển `userId` vào `apiClient.attempts.createOrRecover({ ..., userId })` và `apiClient.attempts.start(attempt.id, { userId })`.
   - Chuyển `userId` vào `saveAnswer` và `submitQuiz`.
5. **Cập nhật `apps/quiz-web/src/hooks/useQuizSession.ts`**:
   - Chuyển `activeUserId` vào lời gọi `quizApi.startQuiz(quizId, undefined, activeUserId)`.
6. **Bổ sung cơ chế làm mới Token tự động khi bấm bắt đầu thi**:
   - Trong `App.tsx`, trước khi gọi `start()`, chủ động kiểm tra `authClient.isExpired()` và gọi `authClient.refresh()` để lấy JWT tươi mới trước khi khởi tạo ca thi.
7. **Kiểm thử & Verification**:
   - `build:packages` hoàn tất không lỗi.
   - `compile_applet` & `lint_applet` hoàn tất thành công.
   - Bộ test `services/attempt/tests/attempt-service.spec.ts` (12 tests) và `packages/api-client/tests/api-client.spec.ts` (14 tests) đều đạt 100% PASS.

### Giai đoạn 2: Sửa lỗi Đứt gãy Hợp đồng Dữ liệu Bộ lọc (Filter Bug Fix) - ✅ [ĐÃ HOÀN THÀNH THEO CÁCH 1 (BACKEND)]
1. **Chuẩn hóa Hợp đồng Dữ liệu `ExamDTO` (`packages/contracts/src/exam/exam.ts`)**:
   - Khai báo interface `ExamAssessmentMeta` (`id`, `code`, `title`, `primaryTopicNodeId`, `gradeNodeId`, `description`).
   - Mở rộng `ExamDTO` với trường `assessment?: ExamAssessmentMeta`.
2. **Cập nhật Cổng Giao tiếp `AssessmentClientPort` & Adapter (`services/exam`)**:
   - Bổ sung `getAssessment?(assessmentIdOrCode)` vào `AssessmentClientPort` (`services/exam/src/domain/ports/exam.repository.port.ts`).
   - Triển khai `getAssessment` trong `DirectAssessmentClientAdapter` (`services/exam/src/infrastructure/adapters/direct-assessment-client.adapter.ts`).
3. **Cập nhật Domain Entity `Exam` (`services/exam/src/domain/entities/exam.entity.ts`)**:
   - Nâng cấp phương thức `Exam.toDTO(variants, assessment)` để gắn kết siêu dữ liệu phân loại.
4. **Làm giàu Dữ liệu trong Use Cases (`services/exam/src/application/use-cases`)**:
   - `ListExamsUseCase`: Bổ sung `assessmentClient?: AssessmentClientPort` kết hợp cơ chế bộ nhớ đệm `assessmentCache` (Map) để tránh truy vấn lặp lại khi nhiều đề thi thuộc cùng một bài thi gốc; đính kèm `assessment` metadata (`primaryTopicNodeId`, `gradeNodeId`) vào từng phần tử của danh sách trả về.
   - `GetExamUseCase`: Bổ sung `assessmentClient?: AssessmentClientPort` để trả về siêu dữ liệu đầy đủ cho từng đề thi.
5. **Định tuyến & Tiêm phụ thuộc (`services/exam/src/presentation/routes/v1-exams.routes.ts`)**:
   - Truyền `assessmentClient` vào `ListExamsUseCase` và `GetExamUseCase` trong hàm khởi tạo `createExamRouter`.
6. **Kiểm thử & Verification**:
   - Biên dịch thành công các gói hợp đồng `npm run build:packages`.
   - Bổ sung ca kiểm thử `it('GET /v1/exams - should return exams enriched with assessment metadata...')` trong `services/exam/tests/exam-service.spec.ts`.
   - Toàn bộ 11/11 tests của `services/exam/tests` và 10/10 tests của `services/gateway/tests` đều đạt PASS 100%.
   - `compile_applet` và `lint_applet` hoàn tất thành công. Khi giao diện thí sinh gọi `quizApi.listExams()`, các thuộc tính `e.assessment.primaryTopicNodeId` và `e.assessment.gradeNodeId` được cung cấp đầy đủ, sửa triệt để lỗi bộ lọc 2D biến mất toàn bộ danh sách đề thi.

### Giai đoạn 3: Làm giàu Mẫu Seed Dữ liệu (Seed Enrichment)
1. Cập nhật `services/assessment/src/infrastructure/db/seed.ts` để bổ sung các Assessment đại diện cho:
   - Tiểu học (Toán 1, Toán 5).
   - THCS (Toán 9, Tiếng Anh 8).
   - THPT (Vật lý 10, Toán 12 THPTQG).
2. Cập nhật `services/exam/src/infrastructure/db/seed.ts` để sinh đề thi tương ứng (tối thiểu 2 mã đề cho mỗi bài thi mới).
3. Chạy lệnh tái tạo dữ liệu sạch `npm run seed:all` để đồng bộ toàn bộ cơ sở dữ liệu.

---
*Báo cáo được hoàn thành và đối chiếu trực tiếp với hiện trạng codebase của hệ thống.*
