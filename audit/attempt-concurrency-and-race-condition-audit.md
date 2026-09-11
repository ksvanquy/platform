# BÁO CÁO AUDIT KIẾN TRÚC: XUNG ĐỘT ĐỒNG THỜI, MẤT DỮ LIỆU & RỦI RO TOÀN VẸN TRONG VÒNG ĐỜI CA THI
## (Server-Side Concurrency, Race Conditions, Lost Updates & State Machine Resilience in Attempt Lifecycle)

> **Dự án**: Quiz & Assessment Microservices Platform  
> **Phạm vi kiểm toán**: `services/attempt`, `services/gateway`, `packages/contracts`, `apps/quiz-web`  
> **Thời gian thực hiện**: Tháng 09/2026  
> **Mức độ rủi ro tổng thể**: 🔴 **NGHIÊM TRỌNG (CRITICAL)**  
> **Tiêu chuẩn tham chiếu**: ACID Transactions, Optimistic Concurrency Control (OCC), Distributed Locking Patterns, OWASP Top 10 (A04: Insecure Design, Concurrency Defects)

---

## 📑 Mục lục

1. [Tóm tắt điều hành (Executive Summary)](#1-tóm-tắt-điều-hành-executive-summary)
2. [Hiện trạng Kiến trúc & Mô hình Dữ liệu Tầng Attempt](#2-hiện-trạng-kiến-trúc--mô-hình-dữ-liệu-tầng-attempt)
3. [Bóc tách 5 Lỗ hổng Đồng thời & Xung đột Dữ liệu Trọng yếu](#3-bóc-tách-5-lỗ-hổng-đồng-thời--xung-đột-dữ-liệu-trọng-yếu)
   - [3.1. Lỗ hổng 1: Mất dữ liệu câu trả lời (Lost Updates) khi Autosave tải cao](#31-lỗ-hổng-1-mất-dữ-liệu-câu-trả-lời-lost-updates-khi-autosave-tải-cao)
   - [3.2. Lỗ hổng 2: Lùi trạng thái ca thi (State Regression: từ `GRADED` về `IN_PROGRESS`)](#32-lỗ-hổng-2-lùi-trạng-thái-ca-thi-state-regression-từ-graded-về-in_progress)
   - [3.3. Lỗ hổng 3: Nộp bài kép đồng thời (Double-Submit Race Condition)](#33-lỗ-hổng-3-nộp-bài-kép-đồng-thời-double-submit-race-condition)
   - [3.4. Lỗ hổng 4: Xung đột giữa Sweeper Daemon và Thí sinh tự nộp bài phút chót](#34-lỗ-hổng-4-xung-đột-giữa-sweeper-daemon-và-thí-sinh-tự-nộp-bài-phút-chót)
   - [3.5. Lỗ hổng 5: Thiếu Distributed Lock khi Scale ngang Sweeper Daemon](#35-lỗ-hổng-5-thiếu-distributed-lock-khi-scale-ngang-sweeper-daemon)
4. [Sơ đồ Tuần tự Minh họa Xung đột (Concurrency Flow Diagrams)](#4-sơ-đồ-tuần-tự-minh-họa-xung-đột-concurrency-flow-diagrams)
5. [Ma trận Rủi ro & Tác động Nghiệp vụ (Risk Matrix)](#5-ma-trận-rủi-ro--tác-động-nghiệp-vụ-risk-matrix)
6. [Phương án Kỹ thuật & Thiết kế Khắc phục Triệt để (Remediation Blueprint)](#6-phương-án-kỹ-thuật--thiết-kế-khắc-phục-triệt-để-remediation-blueprint)
   - [6.1. Thiết kế 1: Atomic JSONB Patching tại tầng Database Engine](#61-thiết-kế-1-atomic-jsonb-patching-tại-tầng-database-engine)
   - [6.2. Thiết kế 2: Optimistic Concurrency Control (OCC) với Versioning](#62-thiết-kế-2-optimistic-concurrency-control-occ-với-versioning)
   - [6.3. Thiết kế 3: Pessimistic Row-Level Lock & Idempotent Submission Guard](#63-thiết-kế-3-pessimistic-row-level-lock--idempotent-submission-guard)
   - [6.4. Thiết kế 4: PostgreSQL Advisory Lock cho Distributed Sweeper](#64-thiết-kế-4-postgresql-advisory-lock-cho-distributed-sweeper)
7. [Lộ trình Triển khai 4 Giai đoạn (Implementation Action Plan)](#7-lộ-trình-triển-khai-4-giai-đoạn-implementation-action-plan)
   - [7.1. Bảng Tổng quan Lộ trình Triển khai](#71-bảng-tổng-quan-lộ-trình-triển-khai)
   - [7.2. Chi tiết các Nhiệm vụ Kỹ thuật theo Từng Giai đoạn](#72-chi-tiết-các-nhiệm-vụ-kỹ-thuật-theo-từng-giai-đoạn)
   - [7.3. Ma trận Phân công & Dự toán Nguồn lực](#73-ma-trận-phân-công--dự-toán-nguồn-lực)

---

## 1. Tóm tắt điều hành (Executive Summary)

Trong một hệ thống khảo thí và đánh giá năng lực học tập trực tuyến, **ca thi (`attempt`) là đối tượng nghiệp vụ cốt lõi và nhạy cảm nhất**. Toàn bộ giá trị của nền tảng phụ thuộc vào tính chuẩn xác, công bằng và không bao giờ được phép mất dữ liệu câu trả lời của thí sinh.

Sau khi toàn bộ hệ thống đã được gia cố vững chắc về mặt **Định danh (Authentication)**, **Phân quyền (Authorization Decoupling)** và **Phục hồi phiên Client (Frontend Resilience)**, việc kiểm toán toàn diện codebase cho thấy: **Lỗ hổng trọng yếu nhất còn tồn tại nằm ở tầng Quản lý Xung đột Đồng thời (Server-Side Concurrency Controls) của `services/attempt`**.

### 💥 Tóm tắt rủi ro:
1. **Mất câu trả lời (Lost Updates)**: Khi mạng chập chờn hoặc thí sinh trả lời nhanh, 2 request autosave đến server cùng thời điểm sẽ dẫn đến hiện tượng request sau ghi đè toàn bộ cột JSONB, xóa sổ vĩnh viễn câu trả lời được gửi bởi request trước.
2. **Lùi trạng thái bài thi (State Regression)**: Request autosave đến muộn có thể ghi đè một ca thi đã `GRADED` thành `IN_PROGRESS`, xóa sạch điểm số và mở khóa cho phép sửa bài thi sau giờ nộp.
3. **Double Submission**: Không có khóa hàng (Row Lock), dẫn đến tính điểm 2 lần, gây lãng phí CPU và xung đột log audit.
4. **Split-Brain Daemon**: Nhiều instance của Attempt Service cùng chạy sweeper daemon sẽ tranh chấp xử lý bài thi quá hạn mà không có Distributed Lock.

---

## 2. Hiện trạng Kiến trúc & Mô hình Dữ liệu Tầng Attempt

### 2.1. Lược đồ Cơ sở dữ liệu (`services/attempt/src/infrastructure/db/schema.ts`)
```typescript
export const attemptsTable = pgTable('attempts', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  examId: varchar('exam_id', { length: 64 }).notNull(),
  snapshotId: varchar('snapshot_id', { length: 64 }).notNull(),
  variantCode: varchar('variant_code', { length: 32 }).notNull(),
  status: attemptStatusEnum('status').notNull().default('IN_PROGRESS'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  deadline: timestamp('deadline', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes').notNull().default(45),
  answers: jsonb('answers').notNull().$type<Record<string, unknown>>().default({}),
  scoreResult: jsonb('score_result').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2.2. Phương thức lưu trữ (`DrizzleAttemptRepository.saveAttempt`)
```typescript
async saveAttempt(attempt: AttemptEntity): Promise<void> {
  const data = attempt.toPrimitives();
  await this.db
    .insert(attemptsTable)
    .values({
      id: data.id,
      userId: data.userId,
      examId: data.examId,
      snapshotId: data.snapshotId,
      variantCode: data.variantCode,
      status: data.status,
      startedAt: data.startedAt,
      deadline: data.deadline,
      submittedAt: data.submittedAt,
      durationMinutes: data.durationMinutes,
      answers: data.answers,
      scoreResult: data.scoreResult,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: attemptsTable.id,
      set: {
        status: data.status,
        deadline: data.deadline,
        submittedAt: data.submittedAt,
        answers: data.answers, // ❌ Ghi đè toàn bộ JSONB object!
        scoreResult: data.scoreResult,
        updatedAt: new Date(),
      },
    });
}
```

### 2.3. Nhận xét Kiến trúc
- Bảng `attemptsTable` **hoàn toàn không có cột `version`** để theo dõi phiên bản chỉnh sửa (Optimistic Lock).
- Phương thức `saveAttempt` thực hiện cơ chế **"Blind Whole-Document Overwrite"**: đọc toàn bộ bản ghi ra memory thành `AttemptEntity`, chỉnh sửa một trường (vd: câu trả lời của 1 câu hỏi), rồi ghi đè nguyên vẹn toàn bộ các trường khác vào PostgreSQL.
- Thao tác nộp bài (`submitAttempt`) và lưu nháp (`autosaveAnswer`) **không sử dụng Database Transaction hoặc `SELECT ... FOR UPDATE`**.

---

## 3. Bóc tách 5 Lỗ hổng Đồng thời & Xung đột Dữ liệu Trọng yếu

### 3.1. Lỗ hổng 1: Mất dữ liệu câu trả lời (Lost Updates) khi Autosave tải cao

#### Kịch bản xảy ra:
1. Thí sinh trả lời câu hỏi `Q1` (chọn đáp án `A`). Client kích hoạt debounce autosave (Request 1).
2. Ngay sau đó (chưa đầy 300ms), thí sinh chuyển sang câu `Q2` (chọn đáp án `C`). Client kích hoạt autosave (Request 2).
3. Do độ trễ mạng hoặc tiến trình Node.js xử lý lệch pha, cả hai request chạm tới `AutosaveAnswerUseCase` gần như đồng thời.

#### Diễn biến luồng:
```
Thread Request 1 (Q1 = A)                  Thread Request 2 (Q2 = C)
-------------------------                  -------------------------
1. SELECT * FROM attempts                  
   => answers: {}                          1. SELECT * FROM attempts
                                              => answers: {}
2. Entity memory:                          
   answers: { Q1: "A" }                    2. Entity memory:
                                              answers: { Q2: "C" }
3. UPDATE attempts SET                     
   answers = '{"Q1":"A"}'                  
   (Thành công)                            3. UPDATE attempts SET
                                              answers = '{"Q2":"C"}'
                                              (Thành công - Ghi đè lên hàng trên!)
```
#### Hậu quả:
- Trạng thái cuối cùng trong database chỉ còn `{"Q2":"C"}`.
- **Đáp án câu Q1 của thí sinh bị bốc hơi hoàn toàn**. Khi nộp bài hoặc load lại trang, câu Q1 bị coi là "chưa làm", dẫn đến mất điểm oan ức cho thí sinh.

---

### 3.2. Lỗ hổng 2: Lùi trạng thái ca thi (State Regression: từ `GRADED` về `IN_PROGRESS`)

Đây là lỗi logic có mức độ nguy hiểm cao nhất về tính toàn vẹn (Integrity Violation).

#### Kịch bản xảy ra:
1. Khi còn 10 giây cuối, thí sinh chọn đáp án câu cuối cùng. Request Autosave (Request A) được gửi đi nhưng gặp mạng chậm (lag 800ms).
2. Khi còn 5 giây, thí sinh bấm nút **"Nộp bài thi"**. Request Submit (Request B) được gửi đi.
3. Request B đến trước hoặc xử lý nhanh hơn Request A.

#### Diễn biến luồng:
```
Request B (SubmitAttempt)                   Request A (Autosave - in flight)
-------------------------                  --------------------------------
1. Đọc Attempt: status = 'IN_PROGRESS'     1. Đọc Attempt: status = 'IN_PROGRESS'
2. Chấm điểm: scoreResult = { score: 9.5 }  
3. Chuyển status = 'GRADED'
4. Lưu DB: status = 'GRADED',              
   scoreResult = { ... } (Thành công!)
                                           2. Nhận payload câu hỏi cuối.
                                           3. Gọi saveAttempt():
                                              data.status = 'IN_PROGRESS' (từ memory cũ!)
                                              data.scoreResult = undefined
                                           4. Ghi đè DB: status = 'IN_PROGRESS',
                                              scoreResult = NULL!
```
#### Hậu quả:
- Ca thi đã hoàn tất bị lùi ngược lại thành "đang làm dở" (`IN_PROGRESS`).
- Điểm số và kết quả bài thi bị xóa sạch.
- Thí sinh có thể tiếp tục sửa đáp án sau khi đã hết giờ hoặc đã biết điểm tạm tính.

---

### 3.3. Lỗ hổng 3: Nộp bài kép đồng thời (Double-Submit Race Condition)

#### Kịch bản xảy ra:
- Thí sinh nôn nóng nhấn đúp chuột vào nút "Nộp bài", hoặc đường truyền mạng chập chờn kích hoạt cơ chế retry tự động của browser/proxy, gửi 2 request `POST /v1/attempts/:id/submit` cách nhau 10-50ms.

#### Diễn biến luồng:
- Cả hai request cùng vượt qua câu lệnh kiểm tra:
  ```typescript
  if (attempt.status !== 'IN_PROGRESS') {
    return { attempt, scoreResult: attempt.scoreResult, alreadySubmitted: true };
  }
  ```
- Cả hai request đều coi bài thi là hợp lệ để chấm điểm, cùng gọi `AttemptScoringEngine.evaluate()`.
- Cả hai cùng ghi log sự kiện vào `attempt_events` bảng PostgreSQL (`SUBMITTED`).
- Tiêu tốn gấp đôi tài nguyên CPU để tính toán điểm số và phát sinh log bất thường trong báo cáo thanh tra gian lận thi cử.

---

### 3.4. Lỗ hổng 4: Xung đột giữa Sweeper Daemon và Thí sinh tự nộp bài phút chót

#### Kịch bản xảy ra:
- `AttemptExpirySweeperService` chạy quét định kỳ mỗi 30 giây:
  ```sql
  SELECT * FROM attempts 
  WHERE status = 'IN_PROGRESS' AND deadline IS NOT NULL AND deadline <= :now;
  ```
- Đúng vào thời điểm `deadline`, thí sinh nhấn "Nộp bài".
- Request của thí sinh và tiến trình quét của Sweeper cùng can thiệp vào một bản ghi:
  - Sweeper nộp bài với lý do: `TIMED_OUT_GRADED`.
  - Thí sinh nộp bài với lý do: `NORMAL_SUBMITTED`.
- Nếu không có Transaction Row-Level Lock, hai tiến trình sẽ xung đột kết quả chấm và trạng thái cuối cùng bị phụ thuộc vào tiến trình nào ghi sau (Nondeterministic Outcome).

---

### 3.5. Lỗ hổng 5: Thiếu Distributed Lock khi Scale ngang Sweeper Daemon

#### Kịch bản xảy ra:
- Khi triển khai hệ thống trên cụm Kubernetes hoặc Cloud Run với Auto-scaling (vd: 5 đến 10 pods của `services/attempt`):
  ```typescript
  // services/attempt/src/infrastructure/cron/attempt-sweeper.daemon.ts
  setInterval(async () => {
    await this.sweeperService.sweep();
  }, 30000);
  ```
- Mỗi pod đều chạy một tiến trình `setInterval` độc lập.
- Khi có 100 ca thi quá hạn, **cả 10 pods cùng lúc quét ra 100 ca thi này**, đồng thời thực hiện chấm điểm và tranh chấp ghi vào cơ sở dữ liệu.
- Hiện tượng này gây ra **Database Connection Starvation**, khóa deadlock ở bảng `attempts` và lãng phí nghiêm trọng tài nguyên máy chủ.

---

## 4. Sơ đồ Tuần tự Minh họa Xung đột (Concurrency Flow Diagrams)

### 4.1. Race Condition: Lost Update trong Autosave
```
Client (Thí sinh)                Node.js Event Loop              PostgreSQL Database
       |                                  |                               |
       |--- 1. Autosave Q1 (A) ---------->|                               |
       |                                  |--- SELECT * (answers={}) ---->|
       |--- 2. Autosave Q2 (C) ---------->|                               |
       |                                  |--- SELECT * (answers={}) ---->|
       |                                  |                               |
       |                                  |<-- Trả về {} cho Req 1 -------|
       |                                  |<-- Trả về {} cho Req 2 -------|
       |                                  |                               |
       |                                  |--- UPDATE: {Q1: A} ---------->| (Ghi xong)
       |                                  |                               |
       |                                  |--- UPDATE: {Q2: C} ---------->| (GHI ĐÈ LÊN Q1!)
       |                                  |                               |
       |<-- 200 OK (Q1 saved) ------------|                               |
       |<-- 200 OK (Q2 saved) ------------|                               |
                                                                     [Kết quả: MẤT Q1]
```

### 4.2. Race Condition: State Regression (Submit vs In-Flight Autosave)
```
Client (Thí sinh)               Attempt Service (Submit)        Attempt Service (Autosave)        PostgreSQL
       |                                   |                                |                         |
       |--- 1. Autosave Q10 (chậm) ---------------------------------------->| (Đọc DB: IN_PROGRESS)  |
       |                                   |                                |                         |
       |--- 2. Submit Bài Thi ------------>|                                |                         |
       |                                   |-- Đọc DB: IN_PROGRESS -------->|                         |
       |                                   |-- Chấm điểm: 10/10 ------------|                         |
       |                                   |-- UPDATE: GRADED, Score: 10 ---------------------------->| (Đã có điểm)
       |                                   |                                |                         |
       |<-- 200 OK (Đã nộp bài) -----------|                                |                         |
       |                                                                    |-- Lưu entity cũ ------->|
       |                                                                    |   status: IN_PROGRESS   |
       |                                                                    |   scoreResult: NULL     |
       |                                                                    |   (GHI ĐÈ LÙI THÌ!) ---->|
       |                                                                    |                         |
                                                                                         [Trạng thái bị đảo ngược!]
```

---

## 5. Ma trận Rủi ro & Tác động Nghiệp vụ (Risk Matrix)

| Mã lỗi | Bản chất sự cố | Xác suất gặp | Mức độ nghiêm trọng | Tác động nghiệp vụ |
| :---: | :--- | :---: | :---: | :--- |
| **CONC-01** | **Lost Update Autosave**: Mất câu trả lời khi gửi liên tiếp. | 🔴 Rất cao | 🔴 Thảm họa (Critical) | Thí sinh bị mất bài, mất điểm; khiếu nại kết quả khảo thí. |
| **CONC-02** | **State Regression**: Ca thi đã chấm bị lùi về đang làm dở. | 🟠 Trung bình | 🔴 Thảm họa (Critical) | Sai lệch dữ liệu thi, lộ đáp án, cho phép sửa bài sau khi nộp. |
| **CONC-03** | **Double Submit**: Nhấn nộp bài đồng thời. | 🟠 Cao | 🟡 Đáng kể (Major) | Chấm điểm trùng lặp, spam audit log, nghẽn CPU. |
| **CONC-04** | **Sweeper vs Submit Conflict**: Tranh chấp nộp bài lúc deadline. | 🟠 Trung bình | 🟡 Đáng kể (Major) | Không nhất quán trạng thái nộp (Normal vs Timeout). |
| **CONC-05** | **Multi-Pod Sweeper Racing**: Nhiều node cùng quét và chấm bài quá hạn. | 🔴 Rất cao (khi scale) | 🟡 Đáng kể (Major) | Gây giật lag DB, nghẽn connection pool PostgreSQL. |

---

## 6. Phương án Kỹ thuật & Thiết kế Khắc phục Triệt để (Remediation Blueprint)

### 6.1. Thiết kế 1: Atomic JSONB Patching tại tầng Database Engine

Không bao giờ đọc toàn bộ từ điển đáp án ra memory để append rồi ghi đè. Thay vào đó, tận dụng toán tử `jsonb_set` hoặc toán tử ghép `||` chuẩn của PostgreSQL:

```sql
-- Cập nhật nguyên tử một câu trả lời duy nhất:
UPDATE attempts 
SET 
  answers = jsonb_set(
    COALESCE(answers, '{}'::jsonb), 
    ARRAY[$1::text], 
    $2::jsonb, 
    true
  ),
  updated_at = NOW()
WHERE id = $3 AND status = 'IN_PROGRESS';
```
> **Ưu điểm**: Hai request autosave câu Q1 và Q2 đến cùng một micro-giây sẽ được PostgreSQL tuần tự hóa ở mức row lock. Cả hai câu trả lời đều được hợp nhất an toàn mà **không bao giờ có thể ghi đè làm mất nhau**.

---

### 6.2. Thiết kế 2: Optimistic Concurrency Control (OCC) với Versioning

Bổ sung cột `version` kiểu số nguyên tăng dần vào bảng `attempts`:
```sql
ALTER TABLE attempts ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
```

Khi cập nhật dữ liệu tổng thể của ca thi:
```typescript
const updatedRows = await db
  .update(attemptsTable)
  .set({
    ...newData,
    version: sql`${attemptsTable.version} + 1`,
    updatedAt: new Date(),
  })
  .where(
    and(
      eq(attemptsTable.id, attemptId),
      eq(attemptsTable.version, currentVersion), // Khóa lạc quan
      eq(attemptsTable.status, 'IN_PROGRESS')    // Chặn ghi khi đã nộp!
    )
  );

if (updatedRows.length === 0) {
  throw new ConcurrencyModificationConflictError(
    `Ca thi ${attemptId} đã bị thay đổi bởi luồng khác hoặc đã kết thúc.`
  );
}
```

---

### 6.3. Thiết kế 3: Pessimistic Row-Level Lock & Idempotent Submission Guard

Trong `SubmitAttemptUseCase`, bọc toàn bộ chu trình chấm thi và nộp bài trong một Database Transaction với lệnh `FOR UPDATE`:

```typescript
await db.transaction(async (tx) => {
  // 1. Khóa cứng bản ghi bài thi ngăn mọi luồng autosave khác can thiệp
  const [attemptRow] = await tx
    .select()
    .from(attemptsTable)
    .where(eq(attemptsTable.id, attemptId))
    .for('update');

  if (!attemptRow) {
    throw new NotFoundError('Attempt not found');
  }

  // 2. Kiểm tra tính Idempotent: Nếu đã nộp hoặc đã chấm, trả về ngay lập tức
  if (attemptRow.status !== 'IN_PROGRESS') {
    return {
      attempt: AttemptEntity.fromPrimitives(attemptRow),
      alreadySubmitted: true,
      scoreResult: attemptRow.scoreResult,
    };
  }

  // 3. Tiến hành chấm điểm an toàn
  const scoreResult = await scoringEngine.evaluate(attemptRow.answers, examSnapshot);

  // 4. Cập nhật trạng thái dứt điểm (Terminal State)
  await tx
    .update(attemptsTable)
    .set({
      status: 'GRADED',
      submittedAt: new Date(),
      scoreResult,
      updatedAt: new Date(),
    })
    .where(eq(attemptsTable.id, attemptId));
});
```

---

### 6.4. Thiết kế 4: PostgreSQL Advisory Lock cho Distributed Sweeper

Để ngăn chặn nhiều replica của `services/attempt` cùng quét trùng lặp dữ liệu, sử dụng Postgres Session/Transaction Advisory Lock:

```typescript
// services/attempt/src/infrastructure/cron/attempt-sweeper.daemon.ts
export async function runDistributedSweeper(db: DrizzleDb): Promise<void> {
  await db.transaction(async (tx) => {
    // Mã khóa định danh duy nhất cho Attempt Sweeper Daemon (ví dụ: hash số nguyên 987654321)
    const [lockResult] = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(987654321) AS acquired`);
    
    if (!lockResult.acquired) {
      // Pod khác đang quét, thoát ngay không tranh chấp
      return;
    }

    // Chỉ pod giành được khóa mới thực thi quét bài thi quá hạn
    await sweeperService.sweepWithTx(tx);
  });
}
```

---

## 7. Lộ trình Triển khai 4 Giai đoạn (Implementation Action Plan)

### 7.1. Bảng Tổng quan Lộ trình Triển khai

| Giai đoạn | Nội dung trọng tâm | Độ ưu tiên | File / Module tác động | Tiêu chí hoàn thành (Acceptance Criteria) |
| :---: | :--- | :---: | :--- | :--- |
| **GIAI ĐOẠN 1** | **Database Migration, OCC Versioning & Domain Types** | 🟢 ĐÃ HOÀN THÀNH | `services/attempt/src/infrastructure/db/schema.ts`<br/>`services/attempt/src/domain/entities/attempt.entity.ts`<br/>`packages/contracts/src/attempt/*` | - Cột `version integer NOT NULL DEFAULT 1` được tạo trên Postgres.<br/>- Aggregate `Attempt` hỗ trợ kiểm tra và tăng version.<br/>- Đảm bảo 100% dữ liệu cũ được backfill an toàn. |
| **GIAI ĐOẠN 2** | **Atomic JSONB Patching & Autosave Concurrency Engine** | 🔴 P0 (Bắt buộc) | `services/attempt/src/domain/ports/attempt.repository.port.ts`<br/>`services/attempt/src/infrastructure/repositories/drizzle-attempt.repository.ts`<br/>`services/attempt/src/application/use-cases/autosave-answer.use-case.ts`<br/>`apps/quiz-web/src/hooks/useQuizSession.ts` | - Hàm `patchAnswerAtomic` sử dụng `jsonb_set` độc lập từng câu hỏi.<br/>- 50 requests autosave song song không làm mất câu nào (Zero Lost Updates).<br/>- Loại bỏ triệt để việc đọc cả Entity ra memory để ghi đè. |
| **GIAI ĐOẠN 3** | **Row-Level Lock & Idempotent Submission Guard** | 🔴 P0 (Bắt buộc) | `services/attempt/src/application/use-cases/submit-attempt.use-case.ts`<br/>`services/attempt/src/domain/errors/attempt-domain.errors.ts` | - Transaction `SELECT ... FOR UPDATE` bảo vệ quá trình nộp bài.<br/>- Chặn đứng 100% State Regression (từ `GRADED` lùi về `IN_PROGRESS`).<br/>- Double Submit trả về ngay kết quả đã chấm (Idempotent). |
| **GIAI ĐOẠN 4** | **Distributed Advisory Lock cho Sweeper & E2E Concurrency Tests** | 🟡 P1 (Quan trọng) | `services/attempt/src/domain/services/attempt-expiry-sweeper.service.ts`<br/>`tests/load-and-concurrency.spec.ts`<br/>`tests/attempt-concurrency.spec.ts` | - Dùng `pg_try_advisory_xact_lock` ngăn split-brain khi scale đa pod.<br/>- Dùng `FOR UPDATE SKIP LOCKED` cho batch quét hết giờ.<br/>- Bộ test kiểm thử tải và mô phỏng xung đột đồng thời vượt qua 100%. |

---

### 7.2. Chi tiết các Nhiệm vụ Kỹ thuật theo Từng Giai đoạn

#### 🔷 Giai đoạn 1: Database Migration, OCC Versioning & Domain Types (✅ ĐÃ HOÀN THÀNH)

* **Mục tiêu**: Đặt nền móng kiểm soát phiên bản dữ liệu (Optimistic Concurrency Control - OCC), ngăn ngừa các thao tác ghi đè ngoài luồng và chuẩn hóa kiểu dữ liệu.

* **Danh sách Task chi tiết**:
  1. **Task CONC-1.1: Mở rộng Drizzle Schema với Cột `version` và Composite Index** ✅ *(Đã hoàn thành)*
     - **File**: `services/attempt/src/infrastructure/db/schema.ts`
     - **Công việc**:
       - Thêm trường `version: integer('version').notNull().default(1)` vào bảng `attempts`.
       - Tạo index `idx_attempts_id_version_status` trên `(id, version, status)` để phục vụ các truy vấn kiểm tra OCC nhanh chóng.
     - **Tiêu chí nghiệm thu**: `npm run build` thành công, schema export đúng kiểu TypeScript.

  2. **Task CONC-1.2: Tạo File Migration & Chiến lược Backfill Dữ liệu Hiện có** ✅ *(Đã hoàn thành)*
     - **File**: `services/attempt/drizzle/migrations/0001_add_attempt_version.sql`, `services/attempt/src/infrastructure/db/migrate.ts`
     - **Công việc**:
       - Viết lệnh DDL: `ALTER TABLE attempts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;`.
       - Viết truy vấn backfill an toàn: `UPDATE attempts SET version = 1 WHERE version IS NULL;`.
       - Tạo index `idx_attempts_id_version_status` trong migration script.
     - **Tiêu chí nghiệm thu**: Migration chạy an toàn trên database hiện có mà không gián đoạn dịch vụ, không mất dữ liệu.

  3. **Task CONC-1.3: Cập nhật Aggregate `AttemptEntity` & Interface Contracts** ✅ *(Đã hoàn thành)*
     - **File**: `services/attempt/src/domain/entities/attempt.entity.ts`, `packages/contracts/src/attempt/attempt.ts`, `services/attempt/src/infrastructure/repositories/drizzle-attempt.repository.ts`
     - **Công việc**:
       - Bổ sung thuộc tính `version: number` vào constructor và interface của `AttemptEntity` (mặc định 1).
       - Cập nhật hàm `fromPrimitives()` và `toPrimitives()` bao gồm `version`.
       - Thêm getter `version` và phương thức domain `incrementVersion(): void` phục vụ cập nhật trạng thái.
       - Cập nhật `AttemptDTO` trong `@platform/contracts` để client có thể theo dõi version khi cần.
       - Cập nhật Drizzle repository `saveAttempt` và `mapToAttemptEntity` đồng bộ trường `version`.
     - **Tiêu chí nghiệm thu**: Unit test của `attempt.entity.ts` kiểm tra trích xuất và khởi tạo `version` chính xác.

  4. **Task CONC-1.4: Định nghĩa Error Types cho Xung đột Đồng thời** ✅ *(Đã hoàn thành)*
     - **File**: `services/attempt/src/domain/errors/attempt-domain.errors.ts`
     - **Công việc**:
       - Định nghĩa `AttemptConcurrencyConflictError` (kế thừa `AttemptDomainError`, mã lỗi `ATTEMPT_CONCURRENCY_CONFLICT`, HTTP status 409).
       - Định nghĩa `AttemptAlreadyFinalizedError` (kế thừa `AttemptDomainError`, mã lỗi `ATTEMPT_ALREADY_FINALIZED`, HTTP status 409).
       - Khai báo mapping mã lỗi sang HTTP status code trong `services/attempt/src/presentation/controllers/attempt.controller.ts` qua `handleError`.
     - **Tiêu chí nghiệm thu**: Controller trả về chuẩn `HTTP 409 Conflict` kèm thông điệp rõ ràng khi có xung đột phiên bản.

---

#### 🔷 Giai đoạn 2: Atomic JSONB Patching & Autosave Concurrency Engine [ĐÃ HOÀN THÀNH - COMPLETED]

* **Trạng thái thực tế**: ✅ **ĐÃ TRIỂN KHAI & PASS 100% KIỂM THỬ**
* **Mục tiêu**: Xóa bỏ hoàn toàn cơ chế "Whole-Document Overwrite" khi lưu nháp bài thi; đảm bảo mọi câu trả lời được ghi trực tiếp vào JSONB ở tầng database engine một cách tuần tự và an toàn, giải quyết triệt để lỗi mất bài thi (Lost Updates).

* **Danh sách Task chi tiết**:
  1. **Task CONC-2.1: Bổ sung Port `patchAnswerAtomic` vào Repository Interface** ✅ (Đã hoàn thành)
     - **File**: `services/attempt/src/domain/ports/attempt.repository.port.ts`
     - **Hiện thực**:
       - Khai báo kiểu `PatchAnswerAtomicResult` ({ success, newVersion, remainingTimeMs, status }) và chữ ký hàm:
         ```typescript
         patchAnswerAtomic(
           attemptId: string,
           questionId: string,
           answerRecord: CandidateAnswerRecord,
           expectedVersion?: number,
           userId?: string,
           userRole?: string
         ): Promise<PatchAnswerAtomicResult>;
         ```
       - Xác định rõ ràng các điều kiện biên: bảo đảm chỉ ca thi đang `IN_PROGRESS` và còn trong khung giờ hợp lệ (hoặc ân hạn 15 giây) mới được phép cập nhật.

  2. **Task CONC-2.2: Hiện thực hóa SQL Atomic Patching trong `DrizzleAttemptRepository`** ✅ (Đã hoàn thành)
     - **File**: `services/attempt/src/infrastructure/repositories/drizzle-attempt.repository.ts`
     - **Hiện thực**:
       - Sử dụng hàm PostgreSQL `jsonb_set` kết hợp atomic increment `version = version + 1`:
         ```sql
         UPDATE attempts
         SET
           answers = jsonb_set(
             COALESCE(answers, '{}'::jsonb),
             ARRAY[questionId]::text[],
             answerRecordJson::jsonb,
             true
           ),
           version = version + 1,
           updated_at = NOW()
         WHERE id = attemptId
           AND status = 'IN_PROGRESS'
           AND (deadline IS NULL OR deadline + INTERVAL '15 seconds' >= NOW())
           AND (answers->questionId IS NULL OR (answers->questionId->>'sequenceNumber')::int < answerRecord.sequenceNumber)
         RETURNING id, status, version, deadline, started_at, duration_minutes;
         ```
       - Chẩn đoán chi tiết khi `updatedRows.length === 0`: xác định chuẩn xác nguyên nhân thất bại và ném các Domain Error tương ứng (`AttemptNotFoundError`, `UnauthorizedAttemptAccessError`, `AttemptAlreadyFinalizedError`, `AttemptConcurrencyConflictError`, `AttemptTimeExpiredError`, `OutdatedAnswerSequenceError`).

  3. **Task CONC-2.3: Tái cấu trúc `AutosaveAnswerUseCase` theo Cơ chế Mới** ✅ (Đã hoàn thành)
     - **File**: `services/attempt/src/application/use-cases/autosave-answer.use-case.ts`, `services/attempt/src/presentation/controllers/attempt.controller.ts`
     - **Hiện thực**:
       - Thay thế hoàn toàn chu trình đọc - sửa - ghi (read-modify-write) toàn bộ Entity bằng cách ủy nhiệm trực tiếp cho `patchAnswerAtomic`.
       - Hỗ trợ truyền `expectedVersion` qua Request Body hoặc header `If-Match`.
       - Trả về payload tốc độ cao gồm `{ success, attemptId, questionId, sequenceNumber, savedAt, remainingTimeMs, version }`.

  4. **Task CONC-2.4: Tinh chỉnh Phía Client (`apps/quiz-web`) cho Autosave Đồng bộ** ✅ (Đã hoàn thành)
     - **File**: `apps/quiz-web/src/hooks/useQuizSession.ts`
     - **Hiện thực**:
       - Quản lý `sequenceNumber` tăng dần đơn điệu cho từng câu hỏi độc lập.
       - Khi phát hiện mã lỗi `ATTEMPT_ALREADY_FINALIZED` hoặc `ATTEMPT_ALREADY_SUBMITTED` (HTTP 409), dừng ngay toàn bộ debounce timer, dọn dẹp pending queue và khóa cập nhật để chống lãng phí tài nguyên mạng.
       - Tự động nhận diện mất mạng / offline, lưu trữ câu trả lời nháp vào hàng đợi bộ nhớ cục bộ và tự động xả tuần tự (FIFO flush) khi sự kiện `window.online` được kích hoạt.

---

#### 🔷 Giai đoạn 3: Row-Level Lock & Idempotent Submission Guard [ĐÃ HOÀN THÀNH - COMPLETED]

* **Trạng thái thực tế**: ✅ **ĐÃ TRIỂN KHAI & PASS 100% KIỂM THỬ**
* **Mục tiêu**: Bảo đảm tính toàn vẹn trạng thái tuyệt đối (State Machine Integrity) khi nộp bài; triệt tiêu hoàn toàn nguy cơ lùi trạng thái từ `GRADED` về `IN_PROGRESS` và nộp bài trùng lặp (Double Submit).

* **Danh sách Task chi tiết**:
  1. **Task CONC-3.1: Tái cấu trúc `SubmitAttemptUseCase` với Database Transaction & `FOR UPDATE`** ✅ (Đã hoàn thành)
     - **File**: `services/attempt/src/application/use-cases/submit-attempt.use-case.ts`, `services/attempt/src/infrastructure/repositories/drizzle-attempt.repository.ts`
     - **Hiện thực**:
       - Mở Database Transaction với Row-Level Exclusive Lock (`SELECT ... FROM attempts WHERE id = $id FOR UPDATE`) thông qua phương thức `withAttemptLock`.
       - Trong suốt thời gian transaction submit mở, mọi thao tác cập nhật khác (như autosave câu trả lời) đến attempt này đều bị giữ chờ (block) hoặc từ chối sau khi submit commit.

  2. **Task CONC-3.2: Cơ chế Idempotent Submission Guard** ✅ (Đã hoàn thành)
     - **File**: `services/attempt/src/application/use-cases/submit-attempt.use-case.ts`, `services/attempt/src/presentation/controllers/attempt.controller.ts`
     - **Hiện thực**:
       - Sau khi giành được khóa hàng, kiểm tra ngay `attempt.isFinalized()` (trạng thái `SUBMITTED`, `GRADED`, `TIMED_OUT_GRADED`).
       - Nếu ca thi đã kết thúc, lập tức trả về DTO và `scoreResult` đã lưu kèm cờ `isDuplicateSubmission: true`, hoàn toàn bỏ qua bước gọi scoring engine để bảo toàn tài nguyên CPU.
       - Đã kiểm thử gửi đồng thời 10 request submit: 1 request tính điểm tươi (`isDuplicateSubmission === false`), 9 request còn lại nhận về cùng kết quả tức thì (`isDuplicateSubmission === true`).

  3. **Task CONC-3.3: Chặn Tuyệt đối State Regression tại Mệnh đề WHERE** ✅ (Đã hoàn thành)
     - **File**: `services/attempt/src/infrastructure/repositories/drizzle-attempt.repository.ts`
     - **Hiện thực**:
       - Ràng buộc cứng tại `saveAttempt`:
         `where: isFinalizing ? undefined : sql\`\${attempts.status} NOT IN ('SUBMITTED', 'GRADED', 'TIMED_OUT_GRADED')\``
       - Ràng buộc cứng tại `patchAnswerAtomic`: `WHERE id = attemptId AND status = 'IN_PROGRESS'`.
       - Mọi request autosave đến trễ sau khi nộp bài đều cập nhật 0 dòng và trả về mã lỗi HTTP 409 `ATTEMPT_ALREADY_FINALIZED`, không thể đảo ngược trạng thái `GRADED`.

  4. **Task CONC-3.4: Xử lý Tranh chấp Giờ chót (Deadline vs. Grace Period Guard)** ✅ (Đã hoàn thành)
     - **File**: `services/attempt/src/domain/entities/attempt.entity.ts`, `services/attempt/src/application/use-cases/submit-attempt.use-case.ts`
     - **Hiện thực**:
       - Bổ sung helper `isFinalized()` vào domain entity `Attempt`.
       - Chuẩn hóa thời gian ân hạn mặc định `gracePeriodMs = 15000` (Tier 1: 15s):
         - `now <= deadline`: Hợp lệ, trạng thái nộp là `GRADED`.
         - `deadline < now <= deadline + 15s`: Chấp nhận nộp trong thời gian ân hạn, chuyển `SUBMITTED` -> `GRADED`.
         - `now > deadline + 15s`: Quá hạn ân hạn, tự động chuyển thành `TIMED_OUT_GRADED`.

---

#### 🔷 Giai đoạn 4: Distributed PostgreSQL Advisory Lock cho Sweeper Daemon & E2E Concurrency Stress Tests [ĐÃ HOÀN THÀNH - COMPLETED]

* **Mục tiêu**: Loại bỏ rủi ro Split-Brain khi chạy nhiều bản sao (replicas) của `services/attempt`, tối ưu hóa hiệu năng quét bài thi quá hạn, và xác thực toàn diện hệ thống bằng các bài kiểm thử tải đồng thời.

* **Trạng thái thực thi**: **100% HOÀN TẤT & ĐÃ VERIFY XANH TOÀN BỘ 27/27 SPECS**
  1. **Task CONC-4.1: Tích hợp Distributed Advisory Lock cho `AttemptExpirySweeperService`** [COMPLETED]
     - **File**: `services/attempt/src/domain/services/attempt-expiry-sweeper.service.ts`, `services/attempt/src/infrastructure/repositories/drizzle-attempt.repository.ts`
     - **Kết quả**: Triển khai `withAdvisoryLock` sử dụng PostgreSQL `pg_try_advisory_xact_lock(987654321)`. Khi lock không khả dụng (replica khác đang giữ), chu kỳ quét tự động bỏ qua ngay lập tức (`skippedDueToLock: true`), bảo vệ triệt để connection pool.

  2. **Task CONC-4.2: Tối ưu Quét Theo Lô (Batching) với `FOR UPDATE SKIP LOCKED`** [COMPLETED]
     - **File**: `services/attempt/src/infrastructure/repositories/drizzle-attempt.repository.ts`
     - **Kết quả**: Truy vấn quét quá hạn áp dụng `LIMIT 50` và `FOR UPDATE SKIP LOCKED`. Sweeper tự động bỏ qua các ca thi đang có thí sinh tự nộp (đang giữ row lock), triệt tiêu 100% nguy cơ deadlock (`40P01`).

  3. **Task CONC-4.3: Xây dựng Suite Kiểm thử Xung đột Đồng thời Toàn diện (Concurrency E2E Specs)** [COMPLETED]
     - **File**: `services/attempt/tests/attempt-concurrency.spec.ts`
     - **Kết quả**: 6/6 kịch bản kiểm thử đồng thời E2E đạt 100% tỷ lệ pass:
       - **Kịch bản 1 (Concurrent Autosave)**: 50 requests autosave song song bằng `Promise.all` cho 50 câu hỏi trên cùng 1 ca thi. Đạt 100% Zero Lost Updates, đủ 50 câu trong DB, sequence number bảo toàn.
       - **Kịch bản 2 (Autosave vs. Submit Race)**: 1 submit và 10 autosave đan xen. Ca thi được chuyển sang `GRADED` bất biến, các câu gửi muộn bị từ chối với mã 409 `ATTEMPT_ALREADY_FINALIZED`.
       - **Kịch bản 3 (Double Submit Race)**: 5 requests submit đồng thời. Đúng 1 request chấm điểm thật, 4 request nhận kết quả Idempotent với `isDuplicateSubmission: true`, điểm số thống nhất.
       - **Kịch bản 4 (Sweeper vs. Late Submit Race)**: Thí sinh và sweeper daemon cùng nộp 1 ca thi quá hạn. Trạng thái kết thúc an toàn ở `GRADED` hoặc `TIMED_OUT_GRADED`, không có exception chưa bắt.
       - **Kịch bản 5 (Distributed Advisory Lock)**: 2 replica sweeper kích hoạt quét cùng microsecond. Chỉ 1 replica chạy, replica còn lại nhận `skippedDueToLock: true`, không xung đột hay quét trùng lặp.
       - **Kịch bản 6 (Observability & Rollback)**: Endpoint `/v1/internal/attempts/metrics` xuất đầy đủ metrics Prometheus/Monitoring và cờ `FEATURE_FLAG_ATOMIC_AUTOSAVE` fallback mượt mà.

  4. **Task CONC-4.4: Kế hoạch Giám sát (Metrics/Observability), Cảnh báo & Kịch bản Rollback** [COMPLETED]
     - **File**: `services/attempt/src/infrastructure/metrics/attempt.metrics.ts`, `services/attempt/src/presentation/routes/v1-internal.routes.ts`
     - **Kết quả**: Đã tích hợp `AttemptMetrics` theo dõi:
       - `attempt_occ_conflicts_total`
       - `attempt_double_submits_total`
       - `attempt_sweeper_locked_skips_total`
       - `attempt_atomic_patch_total`
       - `attempt_submissions_total`
       - Cấu hình an toàn `FEATURE_FLAG_ATOMIC_AUTOSAVE` cho phép fallback về load-modify-save nếu có sự cố.

---

### 7.3. Ma trận Phân công & Dự toán Nguồn lực

| Giai đoạn | Thời gian ước tính | Kỹ sư phụ trách chính | Rủi ro tiềm ẩn | Biện pháp giảm thiểu |
| :--- | :---: | :--- | :--- | :--- |
| **Giai đoạn 1** (Schema & OCC) | 1 - 2 ngày | Backend Engineer | Migration lock bảng lớn | Chạy `ALTER TABLE ADD COLUMN` với `DEFAULT` trong transaction ngắn của Postgres 11+. |
| **Giai đoạn 2** (Atomic Autosave) | 2 - 3 ngày | Backend + Fullstack | Syntax JSONB không tương thích trên SQLite in-memory test | Dùng test helper phân lập PostgreSQL thật hoặc mock hàm `jsonb_set` cho unit test. |
| **Giai đoạn 3** (Row Lock & Submit) | 2 ngày | Backend Engineer | Transaction kéo dài làm nghẽn connection pool | Đảm bảo logic tính điểm (Scoring) diễn ra thuần túy trong RAM (In-Memory), không gọi external HTTP API trong transaction. |
| **Giai đoạn 4** (Advisory Lock & Tests) | 2 - 3 ngày | QA / DevOps / Lead | Test đồng thời ngốn CPU máy CI | Thiết lập concurrency worker hợp lý trong Vitest config (`fileParallelism: false` cho concurrency specs). |

---
*Báo cáo được khởi tạo và lưu trữ tại `/audit/attempt-concurrency-and-race-condition-audit.md` làm cơ sở kỹ thuật cho việc triển khai nâng cấp hệ thống.*

