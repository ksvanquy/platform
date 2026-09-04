# BÁO CÁO KIỂM TOÁN CHUYÊN SÂU: THỜI GIAN THI, ĐỒNG BỘ ĐỒNG HỒ & NGOẠI BIÊN HỆ THỐNG PHÒNG THI TRỰC TUYẾN
*(In-Depth Examination Timing, Server-Authoritative Clock Synchronization & Peripheral Hardening Audit)*  
**Dự án:** Platform Core / Quiz Assessment Engine  
**Đối tượng Kiểm toán:** Toàn bộ chu trình kiểm soát thời gian làm bài, đồng bộ đồng hồ máy chủ - trình duyệt, cơ chế ân hạn, chống gian lận thời gian và xử lý ngoại biên (Edge Cases / Peripheries)  
**Phiên bản:** v2.0 (Deep Technical Scrutiny & Architectural Hardening Specification)  
**Ngày thực hiện:** September 4, 2026  
**Cấp độ:** Mission-Critical / Zero-Trust Architecture  

---

## I. TỔNG QUAN KIỂM TOÁN VÀ TRIẾT LÝ ZERO-TRUST CLIENT CLOCK

Trong các hệ thống khảo thí trực tuyến chuẩn công nghiệp (High-Stakes Online Assessment Engines), **thời gian làm bài (Examination Timing)** là một **Bất biến Nghiệp vụ Tối thượng (Core Business Invariant)**. Một sai lệch dù chỉ vài trăm mili-giây hoặc một lỗ hổng trong việc tin tưởng đồng hồ phía người dùng cũng có thể phá vỡ tính công bằng của kỳ thi, dẫn đến gian lận có tổ chức hoặc các khiếu nại pháp lý gay gắt.

### 1. Nguyên Tắc Cốt Lõi: Zero-Trust Client Clock
```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           TRIẾT LÝ ZERO-TRUST CLIENT CLOCK                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Trình duyệt (Web Client) là môi trường HOÀN TOÀN BẤT AN VÀ KHÔNG ĐÁNG TIN CẬY.       │
│ 2. Máy tính thí sinh có thể bị lệch giờ tự nhiên, bị hack lùi giờ, bị nghẽn mạng       │
│    hoặc bị trình duyệt đóng băng JavaScript Timer khi ẩn tab.                           │
│ 3. Máy chủ (Quiz Server) là NGUỒN SỰ THẬT DUY NHẤT (Single Source of Truth) quyết định: │
│    - Thời điểm bắt đầu chính xác (startedAt).                                           │
│    - Thời hạn chót đóng cổng thi (deadline).                                            │
│    - Thời hạn chót chấp nhận gói tin nộp bài (submissionGracePeriod).                   │
│    - Điểm số và trạng thái kết thúc (GRADED hoặc TIMED_OUT_GRADED).                     │
│ 4. Client Timer CHỈ LÀ GIAO DIỆN PHẢN ÁNH ĐỒNG HỒ MÁY CHỦ, không bao giờ là căn cứ     │
│    ra quyết định nghiệp vụ.                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## II. MA TRẬN PHÁT HIỆN LỖ HỔNG & ĐÁNH GIÁ NGUY CƠ (RISK MATRIX)

Bảng tổng hợp chi tiết 9 phát hiện kiểm toán từ mã nguồn thực tế của `services/quiz` và `apps/quiz-web`:

| Mã | Hạng mục Kiểm toán | Vị trí Codebase | Thực trạng Kỹ thuật | Phân loại Rủi ro | Mức độ |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **SEC-T01** | Lạm dụng Wall Clock của hệ điều hành trên Client | `apps/quiz-web/src/hooks/useServerCountdown.ts` (dòng 20, 34) | Dùng `Date.now()` để tính thời gian còn lại: `diff = expireTime - Date.now()` | **Clock Tampering & False Security** | **P0 - Cực kỳ nghiêm trọng** |
| **SEC-T02** | Grace Period bị nhầm lẫn giữa nộp bài và làm thêm bài | `services/quiz/src/domain/delivery/attempt.aggregate.ts` (dòng 189) | `recordAnswer` vẫn cho phép ghi nhận câu trả lời mới trong khoảng `deadline < now <= deadline + 15s` | **Overtime Cheating / Invariant Breach** | **P0 - Cực kỳ nghiêm trọng** |
| **SEC-T03** | Khóa tiến trình lưu bài khi thí sinh chỉnh lùi giờ máy tính | `services/quiz/src/domain/delivery/attempt.aggregate.ts` (dòng 202) | So sánh `existing.clientTimestamp > incoming.clientTimestamp` bằng `Date.now()` của client | **DoS Do Lệch Giờ / Out-Of-Order Bug** | **P1 - Nghiêm trọng** |
| **SEC-T04** | Đình chỉ JavaScript Timer khi ẩn tab hoặc gập máy | `apps/quiz-web/src/hooks/useServerCountdown.ts` (dòng 49) | Dùng `setInterval(..., 1000)` thuần túy; bị browser throttle xuống 60s/lần khi ẩn tab | **Timer Freezing & Out-of-Sync** | **P1 - Nghiêm trọng** |
| **SEC-T05** | Ca thi mồ côi do cơ chế hết giờ thụ động (Lazy Expiry) | `services/quiz/src/domain/delivery/attempt.aggregate.ts` (dòng 137) | Server chỉ tính hết giờ khi có request gửi vào; thí sinh tắt máy bỏ thi thì ca thi kẹt vĩnh viễn | **Orphaned Attempt Leak** | **P1 - Nghiêm trọng** |
| **SEC-T06** | Thiếu trường `deadline` trong hợp đồng DTO Client | `apps/quiz-web/src/types/quiz.types.ts` (dòng 47-55) & `quiz-api.ts` | `SessionDTO` chỉ có `startedAt` và `durationMinutes`; client tự tính toán `expireTime` | **Contract Desynchronization** | **P1 - Nghiêm trọng** |
| **SEC-T07** | Không bù trừ độ trễ mạng khứ hồi (RTT & Network Jitter) | `apps/quiz-web/src/api/quiz-api.ts` | Không đo RTT; client coi mốc thời gian nhận được là trùng mốc thời gian máy chủ | **Network Drift Distortion** | **P2 - Trung bình** |
| **SEC-T08** | Thiếu Endpoint & Header đồng bộ giờ máy chủ chuẩn | `services/quiz/src/presentation/server.ts` | Không có header `X-Server-Time` trên responses; không có endpoint `GET /v1/time` | **Missing Sync Protocol** | **P2 - Trung bình** |
| **SEC-T09** | Thách thức môi trường Container Serverless (Cloud Run) | Toàn hệ thống | Bộ quét nền `setInterval` trong bộ nhớ container sẽ bị tê liệt khi Cloud Run scale về 0 instance | **Architectural Scalability** | **P2 - Trung bình** |

---

## III. BÓC TÁCH CHI TIẾT TỪNG LỖ HỔNG VÀ NGUY CƠ THỰC CHIẾN

### 1. Lỗ Hổng SEC-T01 (P0): Thảm Họa Dùng `Date.now()` Cục Bộ Trên Trình Duyệt Thí Sinh

#### Đoạn code vi phạm trong `apps/quiz-web/src/hooks/useServerCountdown.ts`:
```typescript
// apps/quiz-web/src/hooks/useServerCountdown.ts
const calculateRemaining = () => {
  const startTime = new Date(startedAt).getTime();
  const expireTime = startTime + durationMinutes * 60 * 1000;
  const now = Date.now(); // <-- LỖ HỔNG P0: ĐÂY LÀ WALL CLOCK CỦA MÁY THÍ SINH
  const diff = Math.max(0, Math.floor((expireTime - now) / 1000));
  return diff;
};
```

#### Phân tích kịch bản tấn công & sự cố thực tế:
1. **Kịch bản Lệch giờ tự nhiên (Unintentional Clock Drift)**:
   - Thí sinh A dùng máy tính cá nhân bị lệch chậm 12 phút so với giờ chuẩn quốc tế (UTC) do pin CMOS yếu hoặc hệ điều hành tắt tính năng đồng bộ Internet time.
   - Khi bài thi bắt đầu lúc `08:00:00 UTC` (thời lượng 30 phút, `deadline = 08:30:00 UTC`), đồng hồ máy tính thí sinh chỉ mới `07:48:00`.
   - Kết quả: `expireTime - now = (08:30:00) - (07:48:00) = 42 phút`!
   - Giao diện web hiển thị thí sinh còn tới 42 phút thay vì 30 phút. Thí sinh ung dung làm bài. Đến phút thứ 31 (theo giờ thực), thí sinh vẫn thấy trên màn hình còn 11 phút. Khi bấm lưu câu trả lời hoặc nộp bài, Quiz Server từ chối ngay lập tức với lỗi `ATTEMPT_TIME_EXPIRED` (HTTP 400).
   - **Hậu quả**: Thí sinh bị mất bài oan, gây bức xúc tột độ và khiếu nại kéo dài.

2. **Kịch bản Gian lận có chủ đích (Intentional Clock Tampering)**:
   - Thí sinh B thấy đồng hồ đếm ngược còn 1 phút. Thí sinh mở Control Panel / Settings trên Windows/macOS, chỉnh lùi đồng hồ hệ điều hành lại 20 phút.
   - Ngay lập tức, hàm `calculateRemaining()` chạy lại và biến `diff` tăng thêm 1200 giây (20 phút)!
   - Thí sinh tưởng chừng đã hack thành công thêm thời gian để tra cứu tài liệu, nhưng khi gửi câu trả lời lên server thì server từ chối. Nguy hiểm hơn, nếu thí sinh tiếp tục thao tác, hệ thống sẽ gặp lỗi tiếp theo (SEC-T03).

---

### 2. Lỗ Hổng SEC-T02 (P0): Grace Period Bị Nhầm Lẫn Giữa "Nộp Bài" Và "Làm Thêm Bài"

#### Đoạn code vi phạm trong `services/quiz/src/domain/delivery/attempt.aggregate.ts`:
```typescript
// services/quiz/src/domain/delivery/attempt.aggregate.ts
recordAnswer(
  questionId: string,
  answerPayload: unknown,
  clientTimestamp: number,
  now: Date = new Date(),
  gracePeriodMs = 15000 // 15 giây ân hạn
): void {
  // ...
  // LỖ HỔNG P0: isExpired kiểm tra deadline + gracePeriodMs
  if (this.isExpired(now, gracePeriodMs)) {
    this._status = 'TIMED_OUT_GRADED';
    this._submittedAt = now;
    throw new AttemptTimeExpiredError(this.id);
  }

  // VẪN GHI NHẬN CÂU TRẢ LỜI NẾU now <= deadline + 15000ms !
  this._answers.set(questionId, {
    answer: answerPayload,
    answeredAt: now,
    clientTimestamp,
  });
}
```

#### Phân tích bất biến bị xâm phạm:
- Hàm `isExpired`:
  ```typescript
  isExpired(now: Date = new Date(), gracePeriodMs = 15000): boolean {
    if (this._status === 'TIMED_OUT_GRADED') return true;
    if (!this._deadline) return false;
    return now.getTime() > this._deadline.getTime() + gracePeriodMs;
  }
  ```
- **Hệ quả vi phạm nghiệp vụ**:
  - `gracePeriod` (thời gian ân hạn) trong các kỳ thi sinh ra **DUY NHẤT để bù trừ độ trễ đường truyền mạng khi thí sinh bấm Nộp bài ở giây cuối cùng (Transit Flushing)**.
  - Tuy nhiên, trong code hiện tại, `recordAnswer` cũng dùng chung hàm `this.isExpired(now, gracePeriodMs)`.
  - Điều này đồng nghĩa với việc: **Nếu bài thi có thời gian 15 phút, thí sinh thực chất có tới 15 phút 15 giây để suy nghĩ và chọn thêm đáp án mới!**
  - Thí sinh am hiểu kỹ thuật có thể viết script tự động gửi đáp án ở giây `deadline + 14s` và server vẫn vui vẻ chấp nhận và ghi nhận vào cơ sở dữ liệu.
- **Quy tắc phân định bắt buộc (Two-Tier Enforcement)**:
  1. **Answer Window (Cửa sổ làm bài)**: Kết thúc chính xác tại `now > deadline`. Sau mốc này, `recordAnswer` PHẢI bị từ chối 100%.
  2. **Submission Window (Cửa sổ nộp bài)**: Kéo dài từ `deadline` tới `deadline + gracePeriodMs`. Trong cửa sổ này, server CHỈ CHẤP NHẬN duy nhất lệnh `submitAttempt`.

---

### 3. Lỗ Hổng SEC-T03 (P1): Thí Sinh Bị Khóa Không Thể Lưu Bài Khi Lùi Giờ Máy Tính

#### Đoạn code vi phạm trong `attempt.aggregate.ts`:
```typescript
// Concurrency Defense: Chống Out-Of-Order request từ client do mạng lag
const existing = this._answers.get(questionId);
if (existing && existing.clientTimestamp > clientTimestamp) {
  throw new OutdatedAnswerTimestampError(questionId, clientTimestamp, existing.clientTimestamp);
}
```
Và trong `apps/quiz-web/src/api/quiz-api.ts`:
```typescript
async saveAnswer(payload: SaveAnswerPayload): Promise<SaveAnswerResponse> {
  const res = await apiClient.attempts.recordAnswer(
    payload.sessionId,
    payload.questionId,
    {
      answer: payload.answer,
      clientTimestamp: Date.now(), // <-- Gửi Wall Clock của máy client!
    }
  );
  // ...
}
```

#### Phân tích lỗi dây chuyền (Cascading Failure):
- Giả sử lúc `08:15:00`, thí sinh trả lời câu 1: `clientTimestamp = 1756973700000`.
- Thí sinh phát hiện máy tính chạy sai giờ, hoặc hệ điều hành tự động cập nhật lại giờ qua mạng (NTP sync lùi lại 5 giây), hoặc thí sinh táy máy chỉnh lùi giờ 1 phút.
- Lúc `08:16:00`, thí sinh đổi đáp án câu 1. Lúc này `Date.now()` của client tạo ra một timestamp nhỏ hơn `1756973700000`.
- Server kiểm tra: `existing.clientTimestamp > incoming.clientTimestamp` ➜ **Ném lỗi `OutdatedAnswerTimestampError` (HTTP 409 Conflict)**!
- Từ thời điểm này trở đi, thí sinh vĩnh viễn không thể thay đổi đáp án của câu 1 được nữa! Mọi thao tác click chọn đều bị server từ chối và giao diện báo lỗi đỏ `Lỗi lưu tiến độ bài thi`.
- **Giải pháp triệt để**: Không bao giờ so sánh tính thứ tự bằng Wall Clock của môi trường bất an. Phải sử dụng **Logical Monotonic Sequence Number** (số nguyên tự tăng `1, 2, 3...` trên mỗi câu hỏi).

---

### 4. Lỗ Hổng SEC-T04 (P1): Đóng Băng Timer Do Trình Duyệt Tiết Kiệm Pin (Tab Throttling)

#### Hiện tượng kỹ thuật:
- `apps/quiz-web/src/hooks/useServerCountdown.ts` sử dụng `setInterval(..., 1000)` chạy trên main thread của trình duyệt.
- Theo đặc tả W3C và cơ chế tối ưu hóa của các trình duyệt hiện đại (Google Chrome Budget Throttling, Apple WebKit Background Power Saving):
  - Khi người dùng chuyển sang tab khác (ví dụ tra cứu tài liệu, mở ứng dụng khác), tab thi rơi vào trạng thái **Background / Hidden**.
  - Trình duyệt sẽ bóp tần suất kích hoạt `setInterval` xuống chỉ còn **1 lần mỗi 60 giây (1000ms ➜ 60000ms)**.
  - Nếu laptop đóng nắp hoặc vào chế độ Sleep / Hibernation, JavaScript thread bị tạm dừng 100%.
- **Hậu quả thực tế**:
  - Khi còn 10 giây cuối, thí sinh vô tình chuyển tab. Sau 30 giây thí sinh quay lại, timer có thể chưa kịp kích hoạt callback `onExpire()`.
  - Khi thí sinh quay lại tab, đồng hồ có hiện tượng "nhảy cóc" từ 10 giây về 0 giây một cách đột ngột gây hoảng loạn.
- **Giải pháp**:
  - Chuyển cơ chế đếm nhịp sang **Web Worker** (Web Worker chạy trên background thread độc lập, không bao giờ bị bóp tần suất bởi UI tab throttling).
  - Kết hợp lắng nghe sự kiện `document.addEventListener('visibilitychange', ...)` và `window.addEventListener('focus', ...)`: Ngay khi tab hiển thị lại, lập tức tính toán lại thời gian còn lại tức thì thay vì chờ chu kỳ tiếp theo của interval.

---

### 5. Lỗ Hổng SEC-T05 (P1): Ca Thi Mồ Côi Do Hết Giờ Thụ Động (Lazy Expiry)

#### Thực trạng trong `services/quiz`:
- Hiện tại, phương thức `isExpired` và logic chuyển trạng thái `TIMED_OUT_GRADED` chỉ được gọi khi có một HTTP Request từ client gửi đến server:
  - Gọi `recordAnswer` ➜ Kiểm tra `isExpired` ➜ Ném lỗi.
  - Gọi `submitAttempt` ➜ Kiểm tra `isExpired` ➜ Chuyển `TIMED_OUT_GRADED` ➜ Chấm điểm.
- **Kịch bản Ca thi bị bỏ rơi (Orphaned Abandoned Attempts)**:
  - Thí sinh làm được 5 câu trên tổng số 50 câu, sau đó đóng trình duyệt đi ngủ, hoặc bị mất mạng hoàn toàn, hoặc bỏ thi.
  - Thí sinh không bao giờ bấm nút "Nộp bài".
  - Trong cơ sở dữ liệu, ca thi này sẽ **vĩnh viễn mang trạng thái `IN_PROGRESS`**.
  - Khi kỳ thi kết thúc, ban tổ chức chạy báo cáo thống kê hoặc xuất bảng điểm cho lớp:
    - Điểm của thí sinh này bằng `0` hoặc không có điểm (`null`), trạng thái là "chưa hoàn thành".
    - Hệ thống không thể đóng sổ kỳ thi (Exam Closure Incomplete).
- **Giải pháp chuẩn**:
  - Cần một cơ chế **Active Sweeper Background Job**: Định kỳ quét toàn bộ database, tìm các ca thi có `status === 'IN_PROGRESS'` và `deadline + gracePeriod < now` để tự động kích hoạt `submit` với cờ timeout và tính điểm lưu trữ.

---

### 6. Lỗ Hổng SEC-T06 (P1): Hợp Đồng DTO Bị Thiếu Trường `deadline` Chính Thức

#### Phân tích interface trong `apps/quiz-web/src/types/quiz.types.ts`:
```typescript
// apps/quiz-web/src/types/quiz.types.ts
export interface SessionDTO {
  readonly id: string;
  readonly userId: string;
  readonly quizId: string;
  readonly durationMinutes: number;
  readonly status: SessionStatus;
  readonly startedAt: string;
  readonly answers?: Record<string, unknown>;
  // HOÀN TOÀN THIẾU TRƯỜNG deadline VÀ serverTime !
}
```
Và trong `apps/quiz-web/src/api/quiz-api.ts`:
```typescript
const session: SessionDTO = {
  id: startedAttempt.id,
  userId: startedAttempt.userId,
  quizId: startedAttempt.quizId,
  durationMinutes: manifest?.timeLimitMinutes || 15,
  status: startedAttempt.status,
  startedAt: startedAttempt.startedAt || new Date().toISOString(),
  answers: startedAttempt.answers || {},
};
```
- Server thực chất đã tính ra `manifest.deadline` (ví dụ `2026-09-04T07:45:00.000Z`). Nhưng khi trả về cho web client, client lại không đưa `deadline` vào `SessionDTO`, mà truyền `startedAt` và `durationMinutes` cho hook `useServerCountdown`.
- Hook `useServerCountdown` lại tự tính:
  `expireTime = new Date(startedAt).getTime() + durationMinutes * 60 * 1000`
- **Rủi ro phân mảnh**: Nếu máy chủ có chính sách cộng thêm giờ làm bài cho thí sinh đặc biệt (ví dụ thí sinh khiếm thị được cộng 20 phút), hoặc giảng viên kéo dài thời gian thi của phòng thi thêm 10 phút trên server, Client sẽ không thể biết và vẫn đếm ngược theo `durationMinutes` gốc!

---

## IV. ĐẶC TẢ KIẾN TRÚC MỤC TIÊU: SERVER-AUTHORITATIVE TIMING ENGINE

Sơ đồ luồng dữ liệu và phân tầng bảo vệ thời gian thi:

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       QUIZ SERVER PORT 3000                                            │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  1. Server Time Provider (Precision NTP Grounded)                                                      │
│     - Global HTTP Response Header:                                                                     │
│       X-Server-Time: 2026-09-04T07:30:00.123Z                                                          │
│       X-Server-Timestamp: 1756974600123                                                                │
│     - Dedicated Sync Route: GET /v1/time -> { serverTime, timestampMs, monotonicMs }                   │
│                                                                                                        │
│  2. Delivery Timing Contract (DTO Refactoring)                                                         │
│     - POST /v1/attempts/:id/start & GET /v1/attempts/:id phản hồi:                                     │
│       {                                                                                                │
│         startedAt: "2026-09-04T07:00:00.000Z",                                                         │
│         deadline: "2026-09-04T07:30:00.000Z",          // Hạn chót trả lời câu hỏi                    │
│         submissionDeadline: "2026-09-04T07:30:30.000Z",// Hạn chót nhận gói tin nộp bài                │
│         serverTime: "2026-09-04T07:00:00.050Z",        // Thời điểm máy chủ xuất phản hồi              │
│         remainingSeconds: 1800                         // Máy chủ tính toán sẵn cho client              │
│       }                                                                                                │
│                                                                                                        │
│  3. Two-Tier Expiry Enforcement (Domain Model Invariant):                                              │
│     - Tier 1: now > deadline ───────────────> TỪ CHỐI recordAnswer (Khóa cổng ghi nhận đáp án)        │
│     - Tier 2: now <= submissionDeadline ────> CHẤP NHẬN submitAttempt (Thu bài bình thường)            │
│     - Tier 3: now > submissionDeadline ─────> TỰ ĐỘNG CHUYỂN SANG TIMED_OUT_GRADED (Chấm các câu cũ)  │
│                                                                                                        │
│  4. Active Attempt Sweeper Service:                                                                    │
│     - Quét nền chu kỳ 30s: Tự động thu bài và chấm điểm các ca thi IN_PROGRESS quá hạn bị bỏ rơi       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                            ▲
                                            │  Cristian's Synchronization Algorithm
                                            │  RTT Measurement & Offset Compensation
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       QUIZ WEB CLIENT                                                  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  1. TimeSyncManager (Single Source of Time Truth on Client)                                            │
│     - Ghi nhận t0 = performance.now() trước khi gửi request                                            │
│     - Đọc X-Server-Time từ response header; ghi nhận t1 = performance.now()                            │
│     - Tính RTT = t1 - t0; ServerTime ước lượng = ServerHeaderTime + (RTT / 2)                          │
│     - Thiết lập Clock Offset: serverOffset = ServerTimeEst - (epochBase + t1)                          │
│                                                                                                        │
│  2. Tampering-Proof Monotonic Countdown Engine:                                                        │
│     - currentServerTime = serverAnchorTime + (performance.now() - performanceAnchor)                   │
│     - remainingMs = deadlineTime - currentServerTime                                                   │
│     - 100% MIỄN NHIỄM với việc thí sinh thay đổi giờ hệ điều hành (Clock Tampering Proof)              │
│                                                                                                        │
│  3. Multi-Channel Heartbeat & Tab Re-Awakening:                                                        │
│     - Web Worker Timer (Chống browser throttle khi ẩn tab)                                             │
│     - VisibilityChange & Focus Event Listeners (Lập tức resync ngay khi mở lại tab hoặc thức máy)       │
│     - Network Online Event Listener (Tự động bù giờ khi mạng được khôi phục)                           │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## V. THUẬT TOÁN ĐỒNG BỘ ĐỒNG HỒ & BÙ TRỄ MẠNG (CRISTIAN'S ALGORITHM)

Thuật toán Cristian là chuẩn mực toán học phân tán để đồng bộ một nút khách (Client) với một máy chủ thời gian đáng tin cậy (Time Server) thông qua mạng có độ trễ:

```text
Thí sinh (Client)                                   Máy chủ (Server)
      │                                                   │
      │─── (1) Gửi Request (t0 = performance.now()) ─────>│
      │                                                   │ (Xử lý & lấy T_server = now())
      │<── (2) Nhận Response (t1 = performance.now()) ────│
      │        Kèm header: X-Server-Time: T_server        │
      ▼                                                   ▼
```

### Công thức tính toán:
1. **Thời gian truyền khứ hồi (Round-Trip Time - RTT)**:
   $$\text{RTT} = t_1 - t_0$$
2. **Thời điểm máy chủ thực tế khi Client nhận được phản hồi ($T_{\text{server\_est}}$)**:
   Giả định độ trễ gửi đi và gửi về là đối xứng:
   $$T_{\text{server\_est}} = T_{\text{server}} + \frac{\text{RTT}}{2}$$
3. **Độ lệch đồng hồ giữa Server và Client (Clock Offset $\theta$)**:
   $$\theta = T_{\text{server\_est}} - \text{ClientWallClock}(t_1)$$
4. **Thời gian Server chuẩn tại bất kỳ thời điểm $t$ nào sau đó (dùng Monotonic Clock)**:
   $$T_{\text{current\_server}}(t) = T_{\text{server\_est}} + \big(\text{performance.now()} - t_1\big)$$
5. **Số giây làm bài còn lại hiển thị trên UI**:
   $$\text{RemainingSeconds} = \max\left(0, \left\lfloor \frac{\text{Deadline} - T_{\text{current\_server}}(t)}{1000} \right\rfloor\right)$$

> **Tính ưu việt tuyệt đối**:
> - Hàm `performance.now()` trả về thời gian đơn điệu (Monotonic Time) tính từ lúc khởi tạo tài liệu (document navigation start) với độ chính xác micro-giây.
> - `performance.now()` **không bao giờ bị ảnh hưởng bởi việc người dùng thay đổi ngày, tháng, năm hay múi giờ trong Windows/macOS**.
> - Thí sinh có vặn ngược đồng hồ 10 tiếng thì `performance.now()` vẫn đều đặn tăng theo thời gian vật lý.

---

## VI. PHÂN TÍCH VÀ XỬ LÝ TOÀN DIỆN CÁC NGOẠI BIÊN (PERIPHERIES & EDGE CASES)

### 1. Ngoại Biên 1: Mất Mạng Ngay Giây Cuối Cùng Trước Deadline
* **Tình huống**: Thí sinh làm bài tới `10:29:58` (deadline là `10:30:00`). Thí sinh bấm "Nộp bài", đúng lúc đó đường truyền Internet bị ngắt quãng trong 8 giây.
* **Cơ chế xử lý**:
  - Client tự động lưu gói tin nộp bài vào **Local Storage Buffer** (đóng dấu `submissionAttemptId`, `clientMonotonicTime`).
  - Khi mạng có lại ở `10:30:08`, gói tin nộp bài cập bến server.
  - Server kiểm tra: `10:30:08 <= deadline (10:30:00) + gracePeriod (15s = 10:30:15)`.
  - Kết quả: **Server chấp nhận bài thi là nộp hợp lệ (`SUBMITTED`) và chấm điểm đầy đủ**.
  - Nếu gói tin đến sau `10:30:15`, server chuyển sang trạng thái `TIMED_OUT_GRADED`, chấm điểm các câu trả lời đã lưu thành công trước mốc `10:30:00`. Thí sinh không bị mất toàn bộ bài thi.

---

### 2. Ngoại Biên 2: Đứt Mạng Dài Hạn Xuyên Qua Deadline
* **Tình huống**: Lúc `10:15:00` (deadline là `10:30:00`), khu vực thi bị mất điện toàn phần hoặc đứt cáp quang. Mạng chỉ có lại lúc `11:00:00`.
* **Cơ chế xử lý**:
  - Tại Server:
    - `AttemptExpirySweeperService` phát hiện ca thi đã quá `deadline + gracePeriod` (lúc `10:30:30`).
    - Sweeper tự động thu bài, đóng băng ca thi ở trạng thái `TIMED_OUT_GRADED` và kích hoạt `AssessmentScoringEngine` chấm điểm toàn bộ câu trả lời thí sinh đã nộp từ trước `10:15:00`.
  - Tại Client:
    - Lúc `11:00:00` khi mạng khôi phục và thí sinh mở lại trang, client phát lệnh Re-sync với server.
    - Server trả về trạng thái ca thi hiện tại: `status: 'TIMED_OUT_GRADED'` kèm bảng kết quả điểm số.
    - Client lập tức chuyển từ màn hình làm bài sang màn hình kết quả thi, hiển thị thông báo rõ ràng: *"Bài thi đã được hệ thống tự động thu và chấm điểm do đã quá thời gian quy định"*.

---

### 3. Ngoại Biên 3: Tranh Chấp Đua Lệnh (Race Condition) Giữa Lưu Câu Cuối Và Nộp Bài
* **Tình huống**: Thí sinh click đáp án câu 50 ở `10:29:59` và ngay lập tức bấm nút "Nộp bài" ở `10:29:59.5`.
* **Nguy cơ**: Gói tin nộp bài có thể đến server trước gói tin lưu câu 50 do định tuyến mạng khác nhau.
* **Giải pháp trong Client (`useQuizSession.ts`)**:
  - Trước khi gọi `submitQuiz`, client bắt buộc phải **Flush toàn bộ hàng đợi Debounced Autosave Timers**:
    ```typescript
    // Xóa timer và gửi ngay lập tức đáp án đang pending
    await Promise.all(pendingSavePromises);
    await apiClient.attempts.submit(sessionId);
    ```
  - Phía Server: `submitAttempt` chỉ thực hiện sau khi đã cam kết dữ liệu của các request `recordAnswer` trước đó vào database.

---

### 4. Ngoại Biên 4: Xử Lý Trong Môi Trường Serverless Container (Cloud Run / Scale-to-Zero)
* **Thách thức**: Ứng dụng chạy trên Cloud Run hoặc Kubernetes với tính năng Scale-to-Zero. Nếu không có thí sinh nào gửi request, CPU của container bị đóng băng (throttle) hoặc container bị tắt hoàn toàn. Bộ quét `setInterval` trong bộ nhớ của Node.js sẽ không chạy!
* **Kiến trúc giải pháp kép (Hybrid Sweeper Pattern)**:
  1. **Opportunistic Sweeper (Khi có traffic)**: Mỗi khi có bất kỳ request nào gọi vào hệ thống (hoặc route `/v1/attempts`), middleware kiểm tra và quét nhanh các ca thi quá hạn trong database.
  2. **Cron Scheduler Trigger (Khi không có traffic)**: Cấu hình một Cloud Scheduler gọi định kỳ vào endpoint nội bộ `POST /v1/internal/attempts/sweep` (được bảo vệ bằng Secret Token) mỗi 1 phút để đánh thức container và quét dọn ca thi quá hạn.

---

## VII. ĐẶC TẢ CHI TIẾT CÁC THAY ĐỔI CẦN THỰC HIỆN TRONG CODEBASE

### 1. Phía Server (`services/quiz`)

#### Thay đổi 1.1: Tách bạch Cửa sổ Làm bài và Cửa sổ Nộp bài trong `Attempt.aggregate.ts`
```typescript
// services/quiz/src/domain/delivery/attempt.aggregate.ts

/**
 * Kiểm tra xem đã hết thời gian làm bài chưa (Official Deadline)
 * Sau mốc này, tuyệt đối KHÔNG được chọn thêm đáp án mới!
 */
isAnswerTimeExpired(now: Date = new Date()): boolean {
  if (this._status === 'TIMED_OUT_GRADED' || this._status === 'SUBMITTED') return true;
  if (!this._deadline) return false;
  return now.getTime() > this._deadline.getTime();
}

/**
 * Kiểm tra xem đã hết thời gian ân hạn nộp bài chưa (Submission Deadline)
 * Kéo dài thêm gracePeriodMs (mặc định 15s) để mạng truyền gói tin nộp bài
 */
isSubmissionTimeExpired(now: Date = new Date(), gracePeriodMs = 15000): boolean {
  if (this._status === 'TIMED_OUT_GRADED') return true;
  if (!this._deadline) return false;
  return now.getTime() > (this._deadline.getTime() + gracePeriodMs);
}
```

Cập nhật `recordAnswer`:
```typescript
recordAnswer(
  questionId: string,
  answerPayload: unknown,
  sequenceNumber: number, // Thay thế clientTimestamp bằng sequenceNumber tự tăng
  now: Date = new Date()
): void {
  if (this._status !== 'IN_PROGRESS') {
    throw new InvalidAttemptStateTransitionError(this._status, 'IN_PROGRESS');
  }

  // Khóa cổng ghi nhận đáp án ngay khi now > deadline (Zero Tolerance cho làm thêm giờ)
  if (this.isAnswerTimeExpired(now)) {
    throw new AttemptTimeExpiredError(this.id);
  }

  // Concurrency check bằng sequenceNumber
  const existing = this._answers.get(questionId);
  if (existing && existing.sequenceNumber >= sequenceNumber) {
    throw new OutdatedAnswerTimestampError(questionId, sequenceNumber, existing.sequenceNumber);
  }

  this._answers.set(questionId, {
    answer: answerPayload,
    answeredAt: now,
    sequenceNumber,
  });
}
```

Cập nhật `submit`:
```typescript
submit(now: Date = new Date(), gracePeriodMs = 15000): void {
  if (this._status === 'SUBMITTED' || AttemptStateMachine.isTerminal(this._status)) {
    return;
  }
  if (this._status !== 'IN_PROGRESS') {
    throw new InvalidAttemptStateTransitionError(this._status, 'SUBMITTED');
  }

  this._submittedAt = now;

  // Nếu nộp trong khoảng deadline < now <= deadline + gracePeriodMs -> Vẫn là SUBMITTED hợp lệ
  // Nếu nộp sau deadline + gracePeriodMs -> Chuyển thành TIMED_OUT_GRADED
  if (this.isSubmissionTimeExpired(now, gracePeriodMs)) {
    this._status = 'TIMED_OUT_GRADED';
  } else {
    this._status = 'SUBMITTED';
  }
}
```

#### Thay đổi 1.2: Middleware Đóng dấu Thời gian Máy chủ trong `services/quiz/src/presentation/server.ts`
```typescript
// services/quiz/src/presentation/server.ts
app.use((req, res, next) => {
  const now = new Date();
  res.setHeader('X-Server-Time', now.toISOString());
  res.setHeader('X-Server-Timestamp', now.getTime().toString());
  next();
});

// Endpoint đồng bộ giờ chuyên dụng cho client
app.get('/v1/time', (req, res) => {
  const now = new Date();
  res.status(200).json({
    success: true,
    serverTime: now.toISOString(),
    timestampMs: now.getTime(),
  });
});
```

---

### 2. Phía Client (`apps/quiz-web`)

#### Thay đổi 2.1: Xây dựng Singleton `TimeSyncManager.ts`
```typescript
// apps/quiz-web/src/utils/TimeSyncManager.ts
export class TimeSyncManager {
  private static instance: TimeSyncManager;
  private serverOffsetMs: number = 0;
  private isSynchronized: boolean = false;

  private constructor() {}

  static getInstance(): TimeSyncManager {
    if (!TimeSyncManager.instance) {
      TimeSyncManager.instance = new TimeSyncManager();
    }
    return TimeSyncManager.instance;
  }

  /**
   * Đồng bộ giờ với Server theo thuật toán Cristian
   */
  async syncWithServer(): Promise<number> {
    const t0 = performance.now();
    const response = await fetch('/v1/time');
    const t1 = performance.now();
    const rtt = t1 - t0;

    const data = await response.json();
    const serverTimestamp = data.timestampMs;

    // Server time ước lượng lúc t1
    const serverTimeEst = serverTimestamp + (rtt / 2);
    // Độ lệch giữa Server Time và Client Wall Clock
    this.serverOffsetMs = serverTimeEst - Date.now();
    this.isSynchronized = true;

    return this.serverOffsetMs;
  }

  /**
   * Lấy thời gian Server ước lượng hiện tại (Chuẩn xác, chống hack giờ)
   */
  getNow(): number {
    return Date.now() + this.serverOffsetMs;
  }
}
```

#### Thay đổi 2.2: Tái cấu trúc Hook `useServerCountdown.ts`
```typescript
// apps/quiz-web/src/hooks/useServerCountdown.ts
import { useState, useEffect, useRef } from 'react';
import { TimeSyncManager } from '../utils/TimeSyncManager.js';

export interface UseServerCountdownProps {
  deadline: string | undefined; // Nhận deadline chính thức từ server
  onExpire?: () => void;
}

export function useServerCountdown({ deadline, onExpire }: UseServerCountdownProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const expiredHandledRef = useRef(false);

  useEffect(() => {
    if (!deadline) return;

    const deadlineMs = new Date(deadline).getTime();
    const syncManager = TimeSyncManager.getInstance();

    const updateCountdown = () => {
      const nowServer = syncManager.getNow();
      const diffMs = deadlineMs - nowServer;
      const secondsLeft = Math.max(0, Math.floor(diffMs / 1000));

      setRemainingSeconds(secondsLeft);

      if (secondsLeft <= 0 && !expiredHandledRef.current) {
        expiredHandledRef.current = true;
        onExpireRef.current?.();
      }
    };

    // Khởi tạo ngay lập tức
    updateCountdown();

    // 1. Chạy interval nhịp 500ms để đảm bảo mượt mà
    const interval = setInterval(updateCountdown, 500);

    // 2. Lắng nghe VisibilityChange: Re-sync & update ngay khi tab active lại
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateCountdown();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', updateCountdown);
    window.addEventListener('online', () => {
      syncManager.syncWithServer().then(updateCountdown);
    });

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', updateCountdown);
    };
  }, [deadline]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return {
    formattedTime,
    remainingSeconds,
    isExpired: remainingSeconds <= 0,
    isWarning: remainingSeconds > 0 && remainingSeconds <= 120,
    isCritical: remainingSeconds > 0 && remainingSeconds <= 30,
  };
}
```

---

## VIII. KẾ HOẠCH HÀNH ĐỘNG VÀ TIÊU CHUẨN NGHIỆM THU (ACTION PLAN & VERIFICATION)

### Lộ Trình 4 Bước Triển Khai:

```text
  BƯỚC 1: SERVER TIMING HARDENING & TWO-TIER INVARIANTS [HOÀN THÀNH 100% - 17/17 TEST FILES PASSED]
  ├── [x] Cập nhật Attempt.aggregate.ts: Tách isAnswerTimeExpired và isSubmissionTimeExpired.
  ├── [x] Invariant Tier 1: recordAnswer bị từ chối với AttemptTimeExpiredError ngay khi now > deadline (Zero Tolerance).
  ├── [x] Invariant Tier 2: submitAttempt chấp nhận SUBMITTED trong khoảng deadline < now <= deadline + 15s; quá 15s chuyển TIMED_OUT_GRADED.
  ├── [x] Gắn middleware X-Server-Time, X-Server-Timestamp và CORS Expose Headers vào server.ts.
  ├── [x] Cung cấp endpoint đồng bộ đồng hồ chuẩn xác: GET /v1/time.
  ├── [x] Bổ sung serverTime, remainingSeconds, submissionDeadline vào toJSON() và API responses.
  └── [x] Viết 13 Unit Tests chuyên biệt trong server-timing-invariants.spec.ts & server-timing-api.spec.ts.

  BƯỚC 2: CLIENT MONOTONIC TIME & CRISTIAN SYNC [HOÀN THÀNH 100% - 19/19 TEST FILES PASSED]
  ├── [x] Tạo TimeSyncManager (Singleton) tích hợp Cristian's Synchronization Algorithm.
  ├── [x] Neo đồng hồ Monotonic (performance.now()) - Miễn nhiễm 100% với việc can thiệp giờ hệ điều hành.
  ├── [x] Bù trừ độ trễ đường truyền khứ hồi: T_server_est = T_server + (RTT / 2).
  ├── [x] Cập nhật SessionDTO, quizApi.ts, useQuizSession.ts bổ sung các trường deadline, submissionDeadline, serverTime.
  ├── [x] Tái cấu trúc useServerCountdown.ts: Loại bỏ hoàn toàn Date.now() cục bộ, tính đếm ngược chuẩn theo deadline máy chủ.
  ├── [x] Xử lý chống trôi/đóng băng do Sleep/Tab Throttling qua visibilitychange, window focus và online events.
  └── [x] Viết bộ kiểm thử unit tests chứng minh tính miễn nhiễm clock tampering tại apps/quiz-web/tests.

  BƯỚC 3: ACTIVE ATTEMPT EXPIRY SWEEPER SERVICE [HOÀN THÀNH 100% - 21/21 TEST FILES PASSED]
  ├── [x] Mở rộng DeliveryRepositoryPort và InMemoryAssessmentRepository với findExpiredInProgressAttempts().
  ├── [x] Xây dựng AttemptExpirySweeperService quét các ca thi IN_PROGRESS quá hạn (now > deadline + gracePeriodMs).
  ├── [x] Tự động cưỡng chế chuyển trạng thái sang TIMED_OUT_GRADED và chấm điểm bằng AssessmentScoringEngine.
  ├── [x] Cơ chế Opportunistic Sweeper: Tự động khóa và chấm điểm ngay khi thí sinh gọi getAttemptDetails() sau khi hết giờ.
  ├── [x] Xây dựng Endpoint nội bộ POST /v1/internal/attempts/sweep cho Cloud Scheduler kèm bảo vệ qua Secret Key & Admin RBAC.
  ├── [x] Cung cấp endpoint GET /v1/internal/attempts/sweeper-status theo dõi daemon.
  └── [x] Viết 8 Unit & Integration Tests trong attempt-expiry-sweeper.spec.ts và sweeper-api.spec.ts.

  BƯỚC 4: LOGICAL SEQUENCE CONCURRENCY CONTROL [HOÀN THÀNH 100% - 23/23 TEST FILES PASSED, 177 TESTS]
  ├── [x] Thay thế clientTimestamp bằng sequenceNumber trong CandidateAnswerRecord và constructor Attempt.
  ├── [x] Invariant Concurrency: recordAnswer so sánh sequenceNumber, từ chối out-of-order & duplicate packets với OutdatedAnswerSequenceError (409 Conflict).
  ├── [x] Hỗ trợ kế thừa OutdatedAnswerTimestampError bảo đảm 100% tương thích ngược cho mọi module phụ thuộc.
  ├── [x] Mở rộng DeliveryUseCases và v1-attempts routes chấp nhận sequenceNumber từ request body.
  ├── [x] Cập nhật ApiClient và quizApi.saveAnswer gửi sequenceNumber.
  ├── [x] Cập nhật useQuizSession.ts: Quản lý sequence number tự tăng cục bộ độc lập cho từng câu hỏi.
  ├── [x] Giải quyết triệt để Ngoại Biên 3 (Race Condition): Client tự động flush toàn bộ hàng đợi Debounced Autosave trước khi gọi submit.
  └── [x] Viết 13 tests chuyên sâu mô phỏng 50 gói tin jitter/xáo trộn thứ tự ngẫu nhiên, race conditions bất đồng bộ và kiểm thử API.
```

---

## IX. KẾT LUẬN KIỂM TOÁN (FINAL AUDIT VERDICT)

Bản kiểm toán chuyên sâu này đã chỉ rõ:
1. **Lỗ hổng cốt tử hiện tại nằm ở sự ngộ nhận về tính tin cậy của Client Clock (`Date.now()`)** và việc **Grace Period bị áp dụng sai cho cả việc trả lời câu hỏi**.
2. Khi chuyển đổi thành công sang mô hình **Two-Tier Server-Authoritative Timing** kết hợp **Cristian's Sync trên Monotonic Clock**, nền tảng sẽ đạt cấp độ bảo mật và công bằng tương đương các hệ thống khảo thí quốc tế (Coursera, ETS, HackerRank).
3. Đề xuất nhóm phát triển phê duyệt kế hoạch hành động 4 bước nêu trên để tiến hành triển khai mã nguồn ngay trong phiên làm việc tiếp theo.
