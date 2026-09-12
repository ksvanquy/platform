# KẾ HOẠCH TOÀN DIỆN: LOẠI BỎ HOÀN TOÀN CƠ CHẾ AUTOSAVE (KHÔNG TRUNG GIAN)

> **Mã tài liệu:** PLAN-REMOVE-AUTOSAVE-001  
> **Ngày lập:** 2026-09-12  
> **Phạm vi:** Toàn bộ hệ thống Quiz Core (Monorepo: `apps/web`, `packages/contracts`, `packages/api-client`, `services/attempt`, `services/gateway`)  
> **Mục tiêu:** Loại bỏ triệt để luồng Autosave trung gian per-question, chuyển sang mô hình Client-Side State & Single Submission Payload khi nộp bài.

---

## 1. TỔNG QUAN & LÝ DO THỰC HIỆN

### 1.1 Vấn đề của cơ chế Autosave hiện tại
1. **Áp lực I/O và Concurrency quá lớn:** Mỗi thao tác click chọn đáp án đều phát sinh HTTP request (`PUT/POST /v1/attempts/:id/answers/:questionId`), làm gia tăng đột biến số lượng kết nối đến Gateway và Database (jsonb_set locking, OCC conflicts).
2. **Độ phức tạp thừa thãi (Over-engineering):** Đòi hỏi quản lý số thứ tự tuần tự monotonic (`sequenceNumber`), hàng đợi pending saves (`pendingSavesRef`), in-flight locks (`inFlightSavesRef`), logic retry và xử lý lỗi mạng phức tạp.
3. **Trải nghiệm người dùng bị gián đoạn:** Khi kết nối mạng chập chờn hoặc token tạm thời hết hạn, giao diện liên tục nhấp nháy cảnh báo lỗi `⚠️ Lỗi lưu bài` dù thí sinh vẫn đang làm bài bình thường.

### 1.2 Mô hình đích (Target Architecture - Trực tiếp & Không trung gian)
- **Client-Side State (Độc lập tại Browser):** Trong suốt thời gian làm bài, toàn bộ câu trả lời của thí sinh được lưu trữ thuần túy trong React State (kèm backup nhẹ tại `localStorage` của trình duyệt để phòng ngừa tình huống tắt tab / F5).
- **Single Submission Payload (Một lần duy nhất khi nộp):** Khi thí sinh ấn **"Nộp bài"** hoặc khi bộ đếm thời gian **Countdown Timer hết giờ (Auto-submit)**, client đóng gói toàn bộ bảng đáp án `answers: Record<string, unknown>` và gửi một request duy nhất `POST /v1/attempts/:id/submit`.
- **Server Chấm Điểm & Lưu Trữ Tức Thời:** Backend nhận toàn bộ payload `answers`, cập nhật trực tiếp vào bản ghi Ca thi (Attempt) trong một Database Transaction duy nhất, chấm điểm qua `AttemptScoringEngine` và trả về kết quả ngay lập tức.

---

## 2. SO SÁNH KIẾN TRÚC TRƯỚC VÀ SAU

| Tiêu chí | Trước khi thay đổi (Autosave liên tục) | Sau khi thay đổi (Client State + Submit Payload) |
| :--- | :--- | :--- |
| **Tần suất Request** | Hàng chục / hàng trăm request per attempt (`PUT /answers/:qId`) | **1 request duy nhất** lúc nộp bài (`POST /submit`) |
| **Quản lý trạng thái** | Phân tán giữa Client State, Debounce Timers, và DB jsonb_set | Tập trung tại **Client Memory / React State** |
| **Xử lý xung đột** | Phức tạp (Monotonic Sequence Numbers, OCC Versioning) | **Đơn giản, Idempotent** tại thời điểm nộp bài |
| **Phụ thuộc Network** | Yêu cầu kết nối mạng liên tục từng giây từng câu | **Chỉ cần mạng lúc bắt đầu lấy đề & lúc nộp bài** |
| **Độ trễ giao diện** | Có thể bị block hoặc báo lỗi nếu mạng lag | **Tức thì (0ms latency cho mọi thao tác chọn)** |
| **Giao diện thí sinh** | Hiển thị badge: `Đang lưu...`, `Đã lưu`, `Lỗi lưu bài` | Giao diện thanh thoát, không badge trạng thái lưu |

---

## 3. LỘ TRÌNH THỰC HIỆN CHI TIẾT (PHASE BY PHASE)

### GIAI ĐOẠN 1: CẬP NHẬT CONTRACTS & DTOs (`packages/contracts`)
1. **File:** `packages/contracts/src/attempt/attempt.ts`
   - Cập nhật `SubmitAttemptRequest` (hoặc `SubmitAttemptInput`):
     ```typescript
     export interface SubmitAttemptRequest {
       userId?: string;
       answers?: Record<string, unknown>; // Thêm bảng câu trả lời gửi kèm
       clientTimestamp?: string;
     }
     ```
   - Xóa bỏ hoặc đánh dấu deprecated các type liên quan autosave:
     - `AutosaveAnswerInput`
     - `AutosaveAnswerResult`
     - `AutosaveBatchInput`
2. **File:** `packages/contracts/src/index.ts`
   - Dọn dẹp export của các contracts liên quan autosave.

---

### GIAI ĐOẠN 2: CẬP NHẬT ATTEMPT SERVICE BACKEND (`services/attempt`)
1. **Use Case Nộp bài:** `services/attempt/src/application/use-cases/submit-attempt.use-case.ts`
   - Mở rộng `SubmitAttemptInput`:
     ```typescript
     export interface SubmitAttemptInput {
       attemptId: string;
       userId: string;
       userRole?: string;
       answers?: Record<string, unknown>; // Nhận toàn bộ answers từ client
       gracePeriodMs?: number;
     }
     ```
   - Trong `withAttemptLock`:
     - Nếu payload có truyền `answers`: Cập nhật trực tiếp `attempt.updateAnswers(answers)` trước khi chấm điểm.
     - Tiếp tục thực hiện `attempt.submit(now, gracePeriodMs)` và `AttemptScoringEngine.evaluate()`.
2. **Controller:** `services/attempt/src/presentation/controllers/attempt.controller.ts`
   - Phương thức `submit`:
     - Trích xuất `answers: req.body.answers` từ `req.body`.
     - Truyền vào `submitAttemptUseCase.execute({ attemptId, userId, answers, ... })`.
   - Xóa bỏ phương thức `autosaveAnswer`.
3. **Routes:** `services/attempt/src/presentation/routes/v1-attempts.routes.ts`
   - Xóa bỏ 2 routes:
     - `POST /:id/answers`
     - `PUT /:id/answers/:questionId`
   - Xóa bỏ dependency `AutosaveAnswerUseCase` khỏi constructor của Controller và Router.
4. **Use Case Dọn dẹp:**
   - Xóa file `services/attempt/src/application/use-cases/autosave-answer.use-case.ts`.
5. **Repository:** `services/attempt/src/infrastructure/repositories/drizzle-attempt.repository.ts`
   - Loại bỏ các hàm cập nhật vi mô không còn sử dụng: `patchAnswerAtomic`, `patchAnswersBatch`.

---

### GIAI ĐOẠN 3: CẬP NHẬT API CLIENT & FRONTEND STATE (`apps/web`, `packages/api-client`)
1. **API Client:** `packages/api-client/src/client.ts` & `apps/web/src/api/quiz-api.ts`
   - Xóa `saveAnswer(attemptId, questionId, answer, sequenceNumber)`.
   - Xóa `batchSaveAnswers(...)`.
   - Cập nhật `submitQuiz(attemptId: string, answers?: Record<string, unknown>, userId?: string)`.
2. **Hook làm bài thi:** `apps/web/src/hooks/useQuizSession.ts`
   - **Xóa bỏ các Refs & States liên quan autosave:**
     - Xóa `saveStatus` (`'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'`).
     - Xóa `sequenceMapRef`, `pendingSavesRef`, `saveTimerMapRef`, `inFlightSavesRef`.
     - Xóa hàm `flushPendingSaves()`.
   - **Đơn giản hóa `setAnswer`:**
     ```typescript
     const setAnswer = useCallback((questionId: string, value: unknown) => {
       setAnswers((prev) => {
         const updated = { ...prev, [questionId]: value };
         // Backup tức thì vào localStorage phòng sự cố sập nguồn / F5 (Client-Only)
         try {
           localStorage.setItem(`quiz_answers_${session?.id}`, JSON.stringify(updated));
         } catch {}
         return updated;
       });
     }, [session?.id]);
     ```
   - **Cập nhật `submit`:**
     - Lấy `answers` hiện tại từ React state (hoặc tham số truyền vào).
     - Gửi `POST /v1/attempts/:id/submit` kèm payload `{ answers }`.
     - Dọn dẹp cache `localStorage` sau khi nộp bài thành công.
3. **Giao diện thí sinh (Active View & Runner Components):**
   - `apps/web/src/views/QuizActiveView.tsx`:
     - Bỏ truyền prop `saveStatus`.
     - Xóa bỏ banner hiển thị `⚠️ Lỗi lưu bài`.
   - `apps/web/src/components/runner/QuizHeader.tsx` & `QuizFooter.tsx`:
     - Xóa bỏ các icon xoay "Đang lưu...", "Đã lưu", "Lỗi lưu bài".

---

### GIAI ĐOẠN 4: CẬP NHẬT KIỂM THỬ (TEST SUITES & VERIFICATION)
1. **Unit & Integration Tests:**
   - Cập nhật `services/attempt/tests/attempt-service.spec.ts`: Kiểm tra luồng `submit` với payload `answers` đầy đủ.
   - Dọn dẹp hoặc cập nhật các test giả lập autosave concurrency trong `services/attempt/tests/attempt-concurrency.spec.ts` và `apps/web/tests/quiz-api-concurrency.spec.ts`.
2. **E2E Tests:**
   - Kiểm tra `tests/e2e-quiz-decomposition.spec.ts`: Luồng Thí sinh bắt đầu ca thi -> Chọn đáp án -> Nộp bài với bảng đáp án -> Nhận kết quả chấm điểm.

---

## 4. DANH SÁCH TỆP TIN TÁC ĐỘNG

| Tệp tin | Hành động | Mô tả thay đổi |
| :--- | :--- | :--- |
| `packages/contracts/src/attempt/attempt.ts` | **Modify** | Bổ sung `answers` vào `SubmitAttemptRequest`, dọn dẹp autosave types |
| `services/attempt/src/application/use-cases/submit-attempt.use-case.ts` | **Modify** | Nhận `answers` và gán vào attempt trước khi đánh giá kết quả |
| `services/attempt/src/application/use-cases/autosave-answer.use-case.ts` | **Delete** | Xóa bỏ use-case autosave |
| `services/attempt/src/presentation/controllers/attempt.controller.ts` | **Modify** | Cập nhật `submit` nhận `req.body.answers`, xóa `autosaveAnswer` |
| `services/attempt/src/presentation/routes/v1-attempts.routes.ts` | **Modify** | Xóa bỏ routes `/:id/answers` và `/:id/answers/:questionId` |
| `services/attempt/src/infrastructure/repositories/drizzle-attempt.repository.ts` | **Modify** | Xóa bỏ `patchAnswerAtomic`, `patchAnswersBatch` |
| `packages/api-client/src/client.ts` | **Modify** | Cập nhật `submitAttempt` với `answers`, xóa `saveAnswer` |
| `apps/web/src/api/quiz-api.ts` | **Modify** | Cập nhật `submitQuiz` với `answers`, xóa `saveAnswer` |
| `apps/web/src/hooks/useQuizSession.ts` | **Modify** | Xóa bỏ toàn bộ timer, sequence, pending saves; nộp bài gửi `answers` |
| `apps/web/src/views/QuizActiveView.tsx` | **Modify** | Loại bỏ `saveStatus` và UI báo lỗi lưu bài |
| `apps/web/src/components/runner/QuizHeader.tsx` | **Modify** | Loại bỏ badge hiển thị trạng thái lưu |
| `apps/web/src/components/runner/QuizFooter.tsx` | **Modify** | Loại bỏ trạng thái lưu ở footer |

---

## 5. RỦI RO & BIỆN PHÁP DỰ PHÒNG

1. **Rủi ro mất bài khi thí sinh vô tình đóng trình duyệt (F5/Reload):**
   - *Biện pháp:* Lưu trữ snapshot `answers` vào `localStorage` của trình duyệt theo key `quiz_answers_${attemptId}` mỗi khi chọn câu trả lời (hoàn toàn tại Client, 0 cost mạng). Khi load lại trang, hook `useQuizSession` đọc từ `localStorage` để phục hồi đầy đủ.
2. **Rủi ro rớt mạng đúng thời điểm bấm nộp bài:**
   - *Biện pháp:* Client hiển thị nút "Thử nộp lại" và lưu giữ nguyên vẹn bảng câu trả lời trên màn hình cho đến khi request `POST /submit` thành công.
3. **Rủi ro quá hạn thời gian làm bài (Deadline Timeout):**
   - *Biện pháp:* Cơ chế Grace Period (15 giây) trên Server vẫn được giữ nguyên để chấp nhận submission gửi lên ngay khi vừa hết giờ.

---

## 6. KẾT LUẬN

Kế hoạch này giúp tinh gọn toàn bộ kiến trúc hệ thống:
- Giảm **95%+ số lượng HTTP requests** phát sinh trong quá trình thi.
- Loại bỏ hoàn toàn các lỗi `500 Internal Server Error` và tình trạng nhấp nháy `⚠️ Lỗi lưu bài` do autosave gây ra.
- Đơn giản hóa mã nguồn, tăng tính ổn định, dễ bảo trì và mở rộng hệ thống cho hàng nghìn thí sinh thi đồng thời.
