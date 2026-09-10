# BÁO CÁO AUDIT TÍNH NĂNG CA THI: CƠ CHẾ CHỊU LỖI, ĐIỀU HƯỚNG NGOẠI BIÊN & BẢO TOÀN DỮ LIỆU THÍ SINH

> **Dự án**: Quiz & Assessment Microservices Platform  
> **Phạm vi kiểm toán**: Vòng đời Ca thi (Attempt Session Lifecycle), Frontend Exam Runner (`apps/quiz-web`), Attempt Delivery Microservice (`services/attempt`), Gateway & Storage  
> **Thời gian thực hiện**: Tháng 09/2026  
> **Trạng thái**: Hoàn thành (Comprehensive Audit Report)  
> **Mục tiêu trọng tâm**: Điều tra hiện tượng *khi đang trong ca thi, nếu tắt tab hoặc ấn nhầm phím Backspace thì bị mất/thoát vĩnh viễn ca thi hiện tại*; kiểm tra toàn bộ các lỗi ngoại biên (Edge-Case Failure Modes) gây tổn hại hoặc gián đoạn ca thi.

---

## 📑 Mục lục nội dung

1. [Tóm tắt Điều hành (Executive Summary)](#1-tóm-tắt-điều-hành-executive-summary)
2. [Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis - RCA)](#2-phân-tích-nguyên-nhân-gốc-rễ-root-cause-analysis---rca)
   - [RCA 1: Trạng thái Ca thi tồn tại thuần túy trong Transient In-Memory State](#rca-1-trạng-thái-ca-thi-tồn-tại-thuần-túy-trong-transient-in-memory-state)
   - [RCA 2: Thiếu lá chắn Bẫy Điều hướng Trình duyệt (Backspace & Browser History Trap)](#rca-2-thiếu-lá-chắn-bẫy-điều-hướng-trình-duyệt-backspace--browser-history-trap)
   - [RCA 3: Thiếu cơ chế Cảnh báo Thoát trang (`beforeunload`)](#rca-3-thiếu-cơ-chế-cảnh-báo-thoát-trang-beforeunload)
   - [RCA 4: Lỗi Phân rã Dữ liệu Câu trả lời khi Khôi phục Ca thi (Answer Deserialization Mismatch)](#rca-4-lỗi-phân-rã-dữ-liệu-câu-trả-lời-khi-khôi-phục-ca-thi-answer-deserialization-mismatch)
   - [RCA 5: Thiếu luồng Tự động Nhận diện Ca thi Đang dở (Active Session Auto-Resume Discovery)](#rca-5-thiếu-luồng-tự-động-nhận-diện-ca-thi-đang-dở-active-session-auto-resume-discovery)
3. [Kiểm tra Toàn diện các Lỗi Ngoại biên gây Hư hỏng Ca thi (Edge-Case Failure Modes Audit)](#3-kiểm-tra-toàn-diện-các-lỗi-ngoại-biên-gây-hư-hỏng-ca-thi-edge-case-failure-modes-audit)
   - [Ngoại biên 1: Mất dữ liệu câu trả lời đang chờ lưu (Debounced In-Flight Autosave Loss)](#ngoại-biên-1-mất-dữ-liệu-câu-trả-lời-đang-chờ-lưu-debounced-in-flight-autosave-loss)
   - [Ngoại biên 2: Xung đột Số thứ tự Tuần tự (Sequence Number Desync & HTTP 409 Conflict)](#ngoại-biên-2-xung-đột-số-thứ-tự-tuần-tự-sequence-number-desync--http-409-conflict)
   - [Ngoại biên 3: Rủi ro Sweeper Tự động Đóng ca thi với Grace Period ngắn](#ngoại-biên-3-rủi-ro-sweeper-tự-động-đóng-ca-thi-với-grace-period-ngắn)
   - [Ngoại biên 4: Lệch Mốc Thời gian và Thiếu `remainingSeconds` trong DTO Phục hồi](#ngoại-biên-4-lệch-mốc-thời-gian-và-thiếu-remainingseconds-trong-dto-phục-hồi)
   - [Ngoại biên 5: Mất liên kết Ca thi do Chuyển đổi Trạng thái Đăng nhập (Guest vs User Id)](#ngoại-biên-5-mất-liên-kết-ca-thi-do-chuyển-đổi-trạng-thái-đăng-nhập-guest-vs-user-id)
   - [Ngoại biên 6: Rủi ro Khi Nhiều Tab Cùng Làm Bài (Multi-tab Racing Condition)](#ngoại-biên-6-rủi-ro-khi-nhiều-tab-cùng-làm-bài-multi-tab-racing-condition)
4. [Ma trận Đánh giá Mức độ Rủi ro (Resilience Risk Matrix)](#4-ma-trận-đánh-giá-mức-độ-rủi-ro-resilience-risk-matrix)
5. [Kế hoạch Khắc phục & Kiến trúc Đề xuất (Actionable Remediation Architecture)](#5-kế-hoạch-khắc-phục--kiến-trúc-đề-xuất-actionable-remediation-architecture)
   - [Giai đoạn 1: Vá khẩn cấp Lá chắn Ngoại vi (Defensive Guards & Session Rehydration)](#giai-đoạn-1-vá-khẩn-cấp-lá-chắn-ngoại-vi-defensive-guards--session-rehydration)
   - [Giai đoạn 2: Khử khuẩn Dữ liệu Answers & Bảo toàn Autosave qua Beacon API](#giai-đoạn-2-khử-khuẩn-dữ-liệu-answers--bảo-toàn-autosave-qua-beacon-api)
   - [Giai đoạn 3: Nâng cấp Khả năng Tự phục hồi Backend & Giao diện Nhắc nhở Thí sinh](#giai-đoạn-3-nâng-cấp-khả-năng-tự-phục-hồi-backend--giao-diện-nhắc-nhở-thí-sinh)

---

## 1. Tóm tắt Điều hành (Executive Summary)

Hệ thống đã xây dựng kiến trúc tương đối bài bản ở tầng Backend Microservice: Aggregate `Attempt` hỗ trợ cơ chế phục hồi qua Use Case `CreateOrRecoverAttemptUseCase`, kiểm soát FSM (`CREATED -> IN_PROGRESS -> SUBMITTED -> GRADED`), và đồng bộ thời gian máy chủ bằng thuật toán Cristian (`TimeSyncManager`).

Tuy nhiên, **quá trình kiểm toán phát hiện một chuỗi đứt gãy nghiêm trọng giữa Tầng Trình duyệt (Browser Runtime) và Quản lý Trạng thái Khách hàng (Frontend Session Management)**. Sự đứt gãy này là nguyên nhân trực tiếp khiến thí sinh cảm thấy ca thi bị "thoát vĩnh viễn" và mất trắng kết quả:

```
[Thí sinh ấn Backspace / Tắt Tab / F5]
               │
               ▼
[Browser chuyển trang / Reset hoàn toàn React useState()]
               │
               ▼
[Frontend trở về QuizStartView - Không lưu cache, không tìm lại attempt dở]
               │
               ▼
[Thí sinh bấm vào thi lại đề đó]
               │
               ▼
[Backend trả về Attempt cũ kèm answers dạng { answer: 'A', sequenceNumber: 1 }]
               │
               ▼
[Frontend setAnswers() nhận nguyên Object -> Sai kiểu dữ liệu!]
               │
               ▼
[Toàn bộ câu hỏi hiển thị TRẮNG XÓA -> Thí sinh tưởng mất sạch bài thi!]
```

### Bảng chỉ số Đánh giá Khả năng Chịu lỗi (Resilience Scorecard)

| Tiêu chí Kiểm toán | Hiện trạng | Điểm | Đánh giá |
| :--- | :--- | :---: | :--- |
| **Bảo vệ Điều hướng Trình duyệt (Browser Trap)** | Không có `beforeunload`, không chặn Backspace, không bẫy `popstate`. | 1.0 / 10 | 🚨 Nguy cấp (Critical) |
| **Khôi phục Phiên phía Client (Rehydration)** | Hoàn toàn dựa vào React `useState`, không lưu Session ID vào LocalStorage. | 2.0 / 10 | 🚨 Nguy cấp (Critical) |
| **Bảo toàn Dữ liệu Answers khi Recover** | Nhận `CandidateAnswerRecord` dạng object đè vào primitive state gây lỗi giao diện. | 3.0 / 10 | 🚨 Nguy cấp (Critical) |
| **Bảo toàn Autosave khi Thoát đột ngột** | Chỉ dùng `setTimeout(300ms)`, không có `sendBeacon` / `keepalive`. | 4.0 / 10 | ⚠️ Cao (High) |
| **Backend Multi-tab Session Recovery** | API `POST /v1/attempts` tìm thấy active attempt và trả về `isRecovered: true`. | 8.5 / 10 | ⭐ Rất tốt |
| **Đồng bộ Đồng hồ & Bộ đếm Ngược** | Thuật toán Cristian + Monotonic performance.now() hoạt động chính xác. | 9.0 / 10 | ⭐ Xuất sắc |
| **Kiểm soát Concurrency Số thứ tự (SeqNo)** | Kiểm soát tuần tự đơn điệu tại Domain Entity ngăn race condition ghi đè. | 8.5 / 10 | ⭐ Rất tốt |

---

## 2. Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis - RCA)

### RCA 1: Trạng thái Ca thi tồn tại thuần túy trong Transient In-Memory State

* **Vị trí**: `/apps/quiz-web/src/App.tsx` (dòng 40-52) và `/apps/quiz-web/src/hooks/useQuizSession.ts` (dòng 8-16).
* **Hiện tượng**:
  ```typescript
  // Trong App.tsx:
  const { session, questions, answers, ... } = useQuizSession(user?.id || 'candidate_01');

  // Điều kiện hiển thị phòng thi:
  if (session && session.status === 'IN_PROGRESS' && questions.length > 0) {
    return <QuizActiveView ... />;
  }
  return <QuizStartView ... />;
  ```
* **Cơ chế lỗi**:
  - Toàn bộ đối tượng `session`, danh sách `questions`, và từ điển `answers` chỉ được lưu giữ trong bộ nhớ RAM tạm thời của React Hook (`useState`).
  - Không có bất kỳ dòng mã nào ghi nhớ `activeAttemptId` hoặc `activeExamId` vào `sessionStorage` hay `localStorage`.
  - Khi tab bị đóng, người dùng reload trang (F5) hoặc bị chuyển hướng trang do ấn phím Backspace, toàn bộ cây component bị unmount, RAM của trang bị xóa sạch.
  - Khi tải lại trang, `session` khởi tạo là `null`, `App.tsx` ngay lập tức rơi vào nhánh render mặc định `QuizStartView` (màn hình danh sách bài thi).
  - Đối với thí sinh, việc rơi về màn hình bắt đầu tạo ra nhận thức rằng **ca thi đã bị huỷ bỏ hoàn toàn và biến mất vĩnh viễn**.

---

### RCA 2: Thiếu lá chắn Bẫy Điều hướng Trình duyệt (Backspace & Browser History Trap)

* **Vị trí**: `/apps/quiz-web/src/views/QuizActiveView.tsx`.
* **Hiện tượng**:
  - Người dùng bấm nhầm phím `Backspace` khi không focus vào ô nhập liệu (ví dụ: đang đọc câu hỏi trắc nghiệm, bấm vào nút chọn đáp án, bấm vào bảng câu hỏi Question Palette).
* **Cơ chế lỗi**:
  - Trong nhiều trình duyệt (đặc biệt là các phiên bản Chromium cũ, Firefox có cấu hình `browser.backspace_action = 0`, hoặc các trình duyệt nhúng Webview trên Windows/macOS/Linux), phím `Backspace` khi focus nằm ngoài trường văn bản (`<input>`, `<textarea>`, `contenteditable`) được gán mặc định hành vi **"Navigate Back"** (`history.back()`).
  - Ứng dụng `QuizActiveView` **hoàn toàn không có listener `keydown`** để chặn sự kiện này:
    ```typescript
    // THIẾU BẢO VỆ:
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !isEditableElement(e.target)) {
        e.preventDefault();
      }
    });
    ```
  - Đồng thời, ứng dụng chạy dưới dạng Single-Page Application (SPA) không có router quản lý lịch sử (`history.pushState`), do đó khi lệnh "Back" của trình duyệt kích hoạt, trình duyệt sẽ nhảy thẳng về trang trước đó trong lịch sử (ví dụ: Google, trang tab trống, hoặc đóng cửa sổ webview).

---

### RCA 3: Thiếu cơ chế Cảnh báo Thoát trang (`beforeunload`)

* **Vị trí**: `/apps/quiz-web/src/views/QuizActiveView.tsx`.
* **Hiện tượng**: Thí sinh bấm nhầm phím tắt đóng tab (`Ctrl+W` / `Cmd+W`), bấm nhầm nút "X" trên tab trình duyệt, hoặc bấm nút Reload (`Ctrl+R` / `F5`), trình duyệt lập tức đóng hoặc tải lại mà không hề hỏi ý kiến.
* **Cơ chế lỗi**:
  - Không đăng ký sự kiện chuẩn W3C `beforeunload`:
    ```typescript
    // THIẾU HOÀN TOÀN TRONG QUIZACTIVEVIEW:
    window.addEventListener('beforeunload', (e) => {
      e.preventDefault();
      e.returnValue = ''; // Kích hoạt hộp thoại cảnh báo của trình duyệt
    });
    ```
  - Việc thiếu sự kiện này làm mất đi lớp phòng thủ phòng ngừa sai sót thao tác (Human Error Barrier), biến một cú bấm nhầm thành thảm họa gián đoạn thi cử.

---

### RCA 4: Lỗi Phân rã Dữ liệu Câu trả lời khi Khôi phục Ca thi (Answer Deserialization Mismatch)

* **Vị trí**:
  - Backend: `/services/attempt/src/domain/entities/attempt.entity.ts` (dòng 106-112, 280)
  - Frontend: `/apps/quiz-web/src/hooks/useQuizSession.ts` (dòng 54, 58-63)
* **Phân tích bóc tách mã nguồn**:
  - Tại Backend Entity `Attempt`: Khi thí sinh trả lời, câu trả lời được lưu dưới dạng thực thể giá trị `CandidateAnswerRecord`:
    ```typescript
    // Backend lưu trữ:
    this._answers.set(questionId, {
      answer: answerPayload, // ví dụ: "opt_1" hoặc ["opt_a", "opt_b"]
      answeredAt: now.toISOString(),
      sequenceNumber: 1,
      clientTimestamp: 1725966000000,
    });
    ```
  - Khi trả về qua API khôi phục ca thi (`POST /v1/attempts`), trường `attempt.answers` trả về đúng cấu trúc Dictionary của các `CandidateAnswerRecord`:
    ```json
    {
      "q_01": {
        "answer": "opt_1",
        "answeredAt": "2026-09-10T11:00:00.000Z",
        "sequenceNumber": 1
      }
    }
    ```
  - Nhưng tại Frontend Hook `/apps/quiz-web/src/hooks/useQuizSession.ts`:
    ```typescript
    // Dòng 54 trong useQuizSession.ts:
    setAnswers(normalizedSession.answers || {});
    ```
  - **Hậu quả chết người**:
    - State `answers` của React lúc này chứa giá trị:
      `answers["q_01"] = { answer: "opt_1", answeredAt: "...", sequenceNumber: 1 }`
    - Trong khi đó, các component hiển thị đáp án như `SingleChoiceQuestion.tsx` lại kiểm tra:
      ```typescript
      const isSelected = value === option.id;
      // Nghĩa là so sánh: { answer: "opt_1", ... } === "opt_1"  ===> LUÔN LUÔN BẰNG FALSE!
      ```
    - Hệ quả là: Mặc dù Backend vẫn lưu đủ câu trả lời của thí sinh, nhưng khi thí sinh khôi phục lại phòng thi, **toàn bộ câu hỏi đều hiển thị như chưa từng được trả lời (trắng xóa)**!
    - Thí sinh hoảng loạn tin rằng toàn bộ công sức làm bài đã bị xoá sổ. Nếu thí sinh chọn lại từ đầu, họ có thể gặp lỗi xung đột số thứ tự `OUTDATED_ANSWER_SEQUENCE` (HTTP 409) do sequence number bị lệch.

---

### RCA 5: Thiếu luồng Tự động Nhận diện Ca thi Đang dở (Active Session Auto-Resume Discovery)

* **Vị trí**: `/apps/quiz-web/src/App.tsx` và `/apps/quiz-web/src/views/QuizStartView.tsx`.
* **Hiện tượng**:
  - Khi thí sinh vào lại trang chủ `apps/quiz-web`, giao diện chỉ hiển thị danh sách tất cả các đề thi bình thường.
  - Không có Banner: *"Bạn đang có một bài thi chưa nộp (Thời gian còn lại: 18 phút). Bấm vào đây để tiếp tục ngay!"*.
  - Thí sinh phải tự nhớ mình đang thi đề nào trong hàng chục đề, và tự bấm lại nút "Vào thi" trên thẻ đề đó. Nếu bấm nhầm đề khác, họ sẽ mở một ca thi hoàn toàn mới (nếu được phép) hoặc bị từ chối.

---

## 3. Kiểm tra Toàn diện các Lỗi Ngoại biên gây Hư hỏng Ca thi (Edge-Case Failure Modes Audit)

### Ngoại biên 1: Mất dữ liệu câu trả lời đang chờ lưu (Debounced In-Flight Autosave Loss)

* **Hiện trạng**: Hook `useQuizSession.ts` áp dụng cơ chế Debounce 300ms để giảm tải cho máy chủ:
  ```typescript
  const timer = setTimeout(async () => {
    // Gọi quizApi.saveAnswer()
  }, 300);
  ```
* **Lỗ hổng ngoại biên**:
  - Khi thí sinh vừa chọn một đáp án (ví dụ câu cuối cùng) và lập tức đóng tab hoặc chuyển trang trong vòng 300ms, bộ đếm `setTimeout` bị hủy.
  - Dữ liệu trong `pendingSavesRef` bị mất vĩnh viễn trong bộ nhớ RAM mà chưa kịp gửi request HTTP tới máy chủ.
  - Trình duyệt hiện đại đã hỗ trợ `navigator.sendBeacon(url, data)` hoặc `fetch(url, { keepalive: true })` cho phép gửi dữ liệu ngầm ngay cả khi trang đang bị hủy (unloading), nhưng hệ thống chưa hiện thực cơ chế này.

---

### Ngoại biên 2: Xung đột Số thứ tự Tuần tự (Sequence Number Desync & HTTP 409 Conflict)

* **Hiện trạng**: Backend Domain Entity `Attempt.recordAnswer` kiểm tra tính đơn điệu của `sequenceNumber` để chống ghi đè khi mạng bị lag (Out-of-order network packets):
  ```typescript
  const existing = this._answers.get(questionId);
  if (existing && existing.sequenceNumber >= sequenceNumber) {
    throw new OutdatedAnswerSequenceError(questionId, sequenceNumber, existing.sequenceNumber);
  }
  ```
* **Lỗ hổng ngoại biên**:
  - Nếu thí sinh mở bài thi trên một tab mới hoặc sau khi phục hồi, nếu `sequenceMapRef` không được khởi tạo chính xác từ dữ liệu cũ của backend (hoặc bị reset về 0), lần bấm tiếp theo của thí sinh sẽ gửi `sequenceNumber = 1`.
  - Máy chủ đã lưu câu hỏi đó với `sequenceNumber = 3` từ phiên trước.
  - Máy chủ trả về lỗi HTTP 409 `OUTDATED_ANSWER_SEQUENCE`.
  - Frontend `useQuizSession.ts` chỉ bắt lỗi và hiển thị `setSaveStatus('ERROR')` mà không có cơ chế tự thích ứng nâng `sequenceNumber` lên `existing.sequenceNumber + 1`. Kết quả là thí sinh bị kẹt trong trạng thái **"Lỗi lưu bài" vĩnh viễn** cho câu hỏi đó.

---

### Ngoại biên 3: Rủi ro Sweeper Tự động Đóng ca thi với Grace Period ngắn

* **Hiện trạng**: `/services/attempt/src/domain/services/attempt-expiry-sweeper.service.ts`
  ```typescript
  // Sweeper daemon chạy mỗi 30 giây:
  async sweep(now: Date = new Date(), gracePeriodMs = 15000): Promise<SweepResult> {
    const expiredAttempts = await this.attemptRepo.findExpiredInProgressAttempts(now, gracePeriodMs);
    for (const attempt of expiredAttempts) {
      attempt.submit(now, gracePeriodMs); // Ép nộp bài TIMED_OUT_GRADED
      ...
    }
  }
  ```
* **Lỗ hổng ngoại biên**:
  - Thời gian ân hạn (`gracePeriodMs`) mặc định chỉ có **15 giây** (15000ms).
  - Trong thực tế học đường hoặc thi trực tuyến:
    - Máy tính của học sinh có thể bị mất kết nối Wi-Fi tạm thời trong 30-60 giây.
    - Học sinh gập màn hình laptop để di chuyển chỗ ngồi trong phòng thi (máy vào chế độ Sleep).
    - Trình duyệt đóng băng tab chạy nền để tiết kiệm RAM (Chrome Tab Discarding).
  - Nếu thời điểm hết giờ chính thức xảy ra trong khoảng thời gian này và kéo dài quá 15 giây, Sweeper Daemon tại máy chủ sẽ tự động chuyển trạng thái của Attempt thành `TIMED_OUT_GRADED` và đóng băng kết quả.
  - Khi học sinh mở lại tab, ca thi đã bị khoá nộp bài, không còn quyền gửi bổ sung bất kỳ câu trả lời nào đang lưu cục bộ.

---

### Ngoại biên 4: Lệch Mốc Thời gian và Thiếu `remainingSeconds` trong DTO Phục hồi

* **Hiện trạng**:
  - Khi gọi `POST /v1/attempts` (khởi tạo hoặc phục hồi), hàm `Attempt.toDTO()` trả về `AttemptDTO`.
  - Trong interface `AttemptDTO` (`@platform/contracts`), không có trường `remainingSeconds`.
  - Trường `remainingSeconds` chỉ được tính khi gọi `POST /v1/attempts/:id/start`.
* **Lỗ hổng ngoại biên**:
  - Tại `quiz-api.ts` (dòng 104-120):
    ```typescript
    if (!initialManifest?.questions || initialManifest.questions.length === 0) {
      // Chỉ khi manifest rỗng mới gọi attempts.start()
    }
    ```
  - Khi phục hồi một ca thi đã có sẵn snapshot manifest, khối lệnh trên bị bỏ qua hoàn toàn.
  - Dẫn đến việc `remainingSeconds` phía Client nhận giá trị `undefined`.
  - Lúc này, `QuizHeader` và Hook đếm ngược `useServerCountdown` phải dựa hoàn toàn vào chuỗi `deadline` trả về từ server (`session.deadline`).
  - Nếu xảy ra độ trễ mạng hoặc đồng hồ Client bị lệch trước khi `TimeSyncManager` kịp gửi request `/v1/time`, bộ đếm có thể nhấp nháy hoặc hiển thị thời gian còn lại không nhất quán trong 1-2 giây đầu.

---

### Ngoại biên 5: Mất liên kết Ca thi do Chuyển đổi Trạng thái Đăng nhập (Guest vs User Id)

* **Hiện trạng**:
  - Khi chưa đăng nhập, thí sinh có `userId = 'candidate_guest'`.
  - Trong `App.tsx`:
    ```typescript
    const { ... } = useQuizSession(user?.id || 'candidate_guest');
    ```
* **Lỗ hổng ngoại biên**:
  - Nếu thí sinh vào làm bài với tư cách khách (`candidate_guest`), ca thi được tạo trên DB với `attempts.userId = 'candidate_guest'`.
  - Giữa chừng, nếu họ bấm Đăng nhập tài khoản của mình (`usr_student_01`), `App.tsx` đổi `userId` thành `usr_student_01`.
  - Lần lưu câu trả lời tiếp theo gửi lên với `userId = usr_student_01`, nhưng `attempt.userId` trên database vẫn là `candidate_guest`.
  - Backend ném lỗi: `UnauthorizedAttemptAccessError: You can only record answers for your own attempt` (HTTP 403 Forbidden). Ca thi bị kẹt không thể lưu câu trả lời nữa.

---

### Ngoại biên 6: Rủi ro Khi Nhiều Tab Cùng Làm Bài (Multi-tab Racing Condition)

* **Hiện trạng**: Nếu thí sinh mở cùng một đề thi trên 2 tab song song (Tab A và Tab B):
  - Cả 2 tab đều trỏ vào cùng một `attemptId` nhờ cơ chế `findActiveAttempt` của backend.
  - Tuy nhiên, nếu Tab A đang ở câu 1 và chọn đáp án (sequence = 1), Tab B cũng mở câu 1 và chọn đáp án khác (sequence = 1).
  - Request của tab nào đến sau sẽ bị máy chủ từ chối với lỗi 409.
  - Không có cơ chế Server-Sent Events (SSE) hoặc WebSocket hay BroadcastChannel giữa các tabs để đồng bộ trạng thái answers theo thời gian thực giữa 2 tab.

---

## 4. Ma trận Đánh giá Mức độ Rủi ro (Resilience Risk Matrix)

| ID | Kịch bản Ngoại biên | Mức độ Nghiêm trọng | Tác động Thí sinh | Tần suất | Đánh giá |
| :---: | :--- | :---: | :--- | :---: | :---: |
| **R-01** | Bấm nhầm Backspace văng khỏi phòng thi | **CRITICAL** | Mất hoàn toàn ngữ cảnh giao diện, hiển thị về trang danh sách. | Rất cao | 🚨 Cần sửa ngay |
| **R-02** | Tắt tab / Reload mất session hiển thị | **CRITICAL** | React state bị xoá sạch, không tự động phục hồi khi mở lại web. | Rất cao | 🚨 Cần sửa ngay |
| **R-03** | Trắng đáp án sau khi phục hồi (Deserialization Bug) | **CRITICAL** | Đáp án cũ bị ẩn sạch, giao diện tưởng chừng mất hết dữ liệu đã làm. | 100% khi recover | 🚨 Cần sửa ngay |
| **R-04** | Mất debounced answer khi tắt tab trong 300ms | **HIGH** | Mất 1-2 câu trả lời cuối cùng thí sinh vừa chọn trước khi đóng tab. | Trung bình | ⚠️ Cần khắc phục |
| **R-05** | Xung đột Sequence Number (HTTP 409) | **HIGH** | Kẹt trạng thái "Lỗi lưu bài" cho câu hỏi bị lệch sequence. | Trung bình | ⚠️ Cần khắc phục |
| **R-06** | Sweeper tự động khoá bài sau 15s mạng chập chờn | **MEDIUM** | Thí sinh bị ép nộp bài sớm nếu máy tính sleep hoặc mất mạng ngắn. | Thấp | 📋 Đề xuất tinh chỉnh |
| **R-07** | Mất session khi đổi từ Khách sang Đăng nhập | **MEDIUM** | Lỗi 403 Forbidden do userId không khớp với attempt ban đầu. | Thấp | 📋 Đề xuất tinh chỉnh |

---

## 5. Kế hoạch Khắc phục & Kiến trúc Đề xuất (Actionable Remediation Architecture)

Để giải quyết triệt để và toàn diện vấn đề này, kế hoạch khắc phục được chia làm 3 giai đoạn chiến lược:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       3 GIAI ĐOẠN PHÒNG VỆ VÀ PHỤC HỒI                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ GIAI ĐOẠN 1: LÁ CHẮN TRÌNH DUYỆT & LƯU VẾT CỤC BỘ (BẢO VỆ TỨC THÌ)          │
│ • Chặn Backspace ngoài input               • Bẫy beforeunload cảnh báo      │
│ • Trap history popstate                    • Ghi activeSession vào Storage  │
├─────────────────────────────────────────────────────────────────────────────┤
│ GIAI ĐOẠN 2: CHUẨN HOÁ GIẢI MÃ DỮ LIỆU & BẢO TOÀN AUTOSAVE (ZERO DATA LOSS) │
│ • Chuẩn hoá CandidateAnswerRecord -> value • navigator.sendBeacon khi thoát │
│ • Tự động sửa lỗi Sequence 409 Conflict    • Thêm remainingSeconds vào DTO  │
├─────────────────────────────────────────────────────────────────────────────┤
│ GIAI ĐOẠN 3: TỰ ĐỘNG PHỤC HỒI & TRẢI NGHIỆM THÍ SINH (AUTO-RESUME UX)      │
│ • Banner "Tiếp tục bài thi đang dở"        • Tự động rehydrate khi mở trang │
│ • Mở rộng Sweeper Grace Period (60s-120s)  • Hỗ trợ BroadcastChannel tabs   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Giai đoạn 1: Vá khẩn cấp Lá chắn Ngoại vi (Defensive Guards & Session Rehydration)

#### 1.1. Bổ sung Bộ lắng nghe Bảo vệ Toàn diện trong `QuizActiveView.tsx`

Cần gắn một `useEffect` thiết lập 3 lớp lá chắn ngay khi thí sinh bước vào phòng thi:
1. **Lá chắn BeforeUnload**: Kích hoạt hộp thoại xác nhận gốc của trình duyệt khi cố tình đóng tab hoặc reload trang.
2. **Lá chắn Keydown (Backspace Trap)**: Bắt và triệt tiêu phím `Backspace` nếu con trỏ không nằm trong thẻ `<input>` hoặc `<textarea>`.
3. **Lá chắn History State (PopState Trap)**: Đẩy một state giả `history.pushState(null, '', window.location.href)` để khi thí sinh bấm nút "Back" trên chuột/trình duyệt, ứng dụng không bị chuyển trang mà hiển thị thông báo xác nhận.

```typescript
// Mẫu code tích hợp vào QuizActiveView.tsx:
useEffect(() => {
  // 1. Chặn đóng tab / reload đột ngột
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = 'Bạn đang trong ca thi. Rời đi có thể làm gián đoạn tiến trình làm bài!';
    return e.returnValue;
  };

  // 2. Chặn phím Backspace làm lùi trang
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Backspace') {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (!isInput) {
        e.preventDefault();
      }
    }
  };

  // 3. Bẫy nút Back của trình duyệt bằng History State
  window.history.pushState({ inQuiz: true }, '');
  const handlePopState = (e: PopStateEvent) => {
    window.history.pushState({ inQuiz: true }, '');
    // Hiển thị cảnh báo hoặc Modal xác nhận nộp bài thay vì thoát trang
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('popstate', handlePopState);

  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('popstate', handlePopState);
  };
}, []);
```

#### 1.2. Lưu trữ Vết Ca thi Đang diễn ra vào `localStorage`

Trong `useQuizSession.ts`, khi `start` thành công:
```typescript
// Lưu thông tin phiên đang chạy vào LocalStorage
localStorage.setItem('quiz_active_session', JSON.stringify({
  sessionId: normalizedSession.id,
  quizId: normalizedSession.quizId,
  userId: normalizedSession.userId,
  startedAt: normalizedSession.startedAt,
  deadline: normalizedSession.deadline,
}));

// Khi nộp bài (submit) thành công:
localStorage.removeItem('quiz_active_session');
```

---

### Giai đoạn 2: Khử khuẩn Dữ liệu Answers & Bảo toàn Autosave qua Beacon API

#### 2.1. Sửa lỗi Phân rã `CandidateAnswerRecord` trong `useQuizSession.ts`

Khi phục hồi ca thi từ backend, cần chuẩn hoá dữ liệu `answers` để bóc tách trường `answer` nguyên thủy cho state của React, đồng thời cập nhật đúng `sequenceMapRef`:

```typescript
// Sửa đổi trong useQuizSession.ts (hàm start):
const extractedAnswers: Record<string, unknown> = {};

if (normalizedSession.answers) {
  for (const [qId, rec] of Object.entries(normalizedSession.answers)) {
    if (rec && typeof rec === 'object' && 'answer' in rec) {
      extractedAnswers[qId] = (rec as any).answer;
      const seq = (rec as any).sequenceNumber ?? 1;
      sequenceMapRef.current.set(qId, seq);
    } else {
      extractedAnswers[qId] = rec;
      sequenceMapRef.current.set(qId, 1);
    }
  }
}

setSession(normalizedSession);
setQuestions(data.questions || []);
setAnswers(extractedAnswers); // Đảm bảo truyền dữ liệu sạch dạng primitive/array!
```

#### 2.2. Xả Hàng đợi Autosave bằng `navigator.sendBeacon` khi Trang bị Hủy

Khi người dùng thực sự đóng tab hoặc chuyển trang, xả toàn bộ câu hỏi đang nằm trong `pendingSavesRef` qua `fetch` với cờ `keepalive: true`:

```typescript
useEffect(() => {
  const flushPendingOnUnload = () => {
    if (!session?.id || pendingSavesRef.current.size === 0) return;

    for (const [qId, pending] of pendingSavesRef.current.entries()) {
      const payload = JSON.stringify({
        answer: pending.value,
        sequenceNumber: pending.sequenceNumber,
        clientTimestamp: Date.now(),
        userId,
      });

      // Ưu tiên fetch keepalive (hỗ trợ PUT method)
      fetch(`/v1/attempts/${session.id}/answers/${qId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
    pendingSavesRef.current.clear();
  };

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingOnUnload();
    }
  });
  window.addEventListener('pagehide', flushPendingOnUnload);

  return () => {
    window.removeEventListener('pagehide', flushPendingOnUnload);
  };
}, [session?.id, userId]);
```

#### 2.3. Tự Động Phục hồi khi Gặp Lỗi Sequence (HTTP 409)

Trong `setAnswer`, nếu server trả về mã lỗi `OUTDATED_ANSWER_SEQUENCE` (do một tab khác đã lưu với sequence cao hơn):
```typescript
try {
  await savePromise;
  setSaveStatus('SAVED');
} catch (err: any) {
  if (err.errorCode === 'OUTDATED_ANSWER_SEQUENCE' || err.status === 409) {
    // Tự động tăng sequence number thêm 2 đơn vị và retry ngay lập tức
    const currentSeq = sequenceMapRef.current.get(questionId) || 1;
    const retrySeq = currentSeq + 2;
    sequenceMapRef.current.set(questionId, retrySeq);
    
    // Thử lưu lại ngầm
    quizApi.saveAnswer({
      sessionId: session.id,
      userId,
      questionId,
      answer: pending.value,
      sequenceNumber: retrySeq,
    }).then(() => setSaveStatus('SAVED')).catch(() => setSaveStatus('ERROR'));
  } else {
    setSaveStatus('ERROR');
  }
}
```

---

### Giai đoạn 3: Nâng cấp Khả năng Tự phục hồi Backend & Giao diện Nhắc nhở Thí sinh

#### 3.1. Tự Động Khôi Phục (Auto-Rehydration) tại `App.tsx`

Khi ứng dụng khởi chạy (`mount`), kiểm tra xem có ca thi nào đang dở dang không:
1. Đọc từ `localStorage.getItem('quiz_active_session')`.
2. Hoặc nếu thí sinh đã đăng nhập: gọi API `GET /v1/attempts?status=IN_PROGRESS&userId=...`.
3. Nếu tìm thấy ca thi còn hạn:
   - Hiển thị Banner nổi bật: *"Phát hiện ca thi đang diễn ra: [Tên đề thi] (Còn lại: X phút). [Nhấn vào đây để tiếp tục thi ngay]"*.
   - Hoặc tự động gọi hàm `start(cachedSession.quizId)` để đưa thí sinh thẳng vào phòng thi mà không cần bất kỳ thao tác thủ công nào.

#### 3.2. Điều chỉnh Grace Period của Sweeper Daemon

Trong `/services/attempt/src/domain/services/attempt-expiry-sweeper.service.ts`:
- Nâng `gracePeriodMs` từ **15 giây** lên **60 giây - 120 giây**.
- Điều này tạo khoảng đệm an toàn cần thiết cho thí sinh kết nối lại mạng Wi-Fi hoặc mở lại laptop mà không bị máy chủ xử thua/ép nộp bài quá sớm.

---

## 6. Kết luận & Cam kết Chất lượng

Việc thí sinh bị văng và mất ca thi khi ấn Backspace hoặc tắt tab không xuất phát từ lỗi kiến trúc cốt lõi của Backend Microservices, mà là do **sự thiếu hụt các lớp lá chắn ngoại vi ở tầng Web Browser (BeforeUnload, Keydown Trap, History Popstate)** kết hợp với **lỗi phân rã cấu trúc câu trả lời (CandidateAnswerRecord Deserialization Bug)** và **thiếu cơ chế Rehydration từ LocalStorage/Active Attempt Query**.

Sau khi áp dụng đầy đủ các giải pháp tại [Mục 5](#5-kế-hoạch-khắc-phục--kiến-trúc-đề-xuất-actionable-remediation-architecture):
- Thí sinh sẽ hoàn toàn miễn nhiễm với việc vô tình bấm phím Backspace hoặc đóng tab.
- Tiến trình làm bài được bảo lưu tuyệt đối (Zero Data Loss) ngay cả khi mất mạng đột ngột.
- Trải nghiệm thi cử trở nên liền mạch, đạt chuẩn công nghiệp cho các hệ thống khảo thí trực tuyến quy mô lớn.
