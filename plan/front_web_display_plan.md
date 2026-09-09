# 🎨 KẾ HOẠCH THIẾT KẾ & TRIỂN KHAI FRONT-WEB (AUDITED & VISUAL SPECIFICATION PLAN)
### Tối Ưu Hóa Trải Nghiệm Khảo Thí Thí Sinh (`apps/quiz-web`) Theo Kiến Trúc 6 Microservices
**Chuẩn Monorepo PNPM • React 19 • Tailwind CSS • Unified Gateway (Port 3000) • Server-Authoritative Timing (Cristian) • KaTeX/LaTeX • Anti-Cheat Telemetry**

> 🚦 **TRẠNG THÁI HIỆN TẠI**: **ĐÃ AUDIT CODEBASE & ĐẶC TẢ CHI TIẾT GIAO DIỆN — ĐANG CHỜ LỆNH CODE (WAITING FOR CODE INSTRUCTION)**  
> Tài liệu này cung cấp đầy đủ các bản vẽ phác thảo (ASCII Wireframes), cấu trúc thành phần, luồng tương tác và bảng màu sắc của từng trang trong Front-Web để người đọc dễ dàng hình dung 100% trải nghiệm trước khi bắt đầu viết code.

---

## 1. 🔍 KẾT QUẢ AUDIT ĐỐI SOÁT HIỆN TRẠNG (CODEBASE AUDIT MATRIX)

Sau khi kiểm tra chi tiết toàn bộ các file tại `apps/quiz-web/src`, bảng đối soát hiện trạng giữa **Mã nguồn hiện có** và **Khoảng cách cần hoàn thiện (Delta Gaps)**:

| Module / Tính năng | Hiện trạng trong Codebase (`apps/quiz-web`) | Đánh giá & Khoảng cách cần hoàn thiện (Delta Gaps) |
|---|---|---|
| **1. Cây Tri Thức & Duyệt Đề** | Đã có `TaxonomyTreeSidebar.tsx` nạp cây `TOPIC` và `QuizContentArea.tsx` hỗ trợ lọc theo khối lớp `gradeTree` (`GRADE`). | ⚠️ **Cần hoàn thiện**: Chưa có Modal cho thí sinh xem chi tiết quy chế thi và **chọn Mã đề biến thể (Variant Selection: 101, 102...)** trước khi bấm bắt đầu ca thi. |
| **2. Đồng Hồ Máy Chủ (Server Timing)** | Đã có `TimeSyncManager.ts` áp dụng thuật toán Cristian, `useServerCountdown.ts` và `QuizTimer.tsx`. |  Đã đạt chuẩn đồng bộ thời gian máy chủ. Cần kết nối trực quan với thanh tiến trình Header. |
| **3. Bộ Render 6 Dạng Câu Hỏi** | Đã có `QuestionRegistry.tsx` và 6 components (`SingleChoiceQuestion.tsx`, `MultipleChoiceQuestion.tsx`, `FillInQuestion.tsx`, `MatchingQuestion.tsx`, `NumericQuestion.tsx`, `OrderingQuestion.tsx`). | ⚠️ **Cần hoàn thiện**: **Chưa cài đặt thư viện `katex`**; chưa có component `KaTeXViewer.tsx` để render công thức toán học nội dòng (`$...$`) và khối (`$$...$$`). |
| **4. Bảng Điều Hướng (Question Palette)** | Đã có `QuestionPalette.tsx` hiển thị danh sách câu hỏi và trạng thái đã làm/chưa làm. | ⚠️ **Cần hoàn thiện**: **Chưa có tính năng Đánh dấu xem lại (Flag for Review 🚩)** kèm màu hổ phách/cam để thí sinh ghi nhớ câu phân vân. |
| **5. Lưu Nháp (Autosave Engine)** | Đã có `useQuizSession.ts` với debounce 300ms, monotonic sequence number và flush queue trước khi submit. |  Cơ chế lưu nháp rất tốt. Cần bổ sung cờ trạng thái trực quan kết nối với thanh header và thông báo khi mất mạng tạm thời. |
| **6. Phòng Vệ Gian Lận (Anti-Cheat)** | Gateway và Attempt Service đã có endpoint `POST /v1/attempts/:id/events` và bảng `attempt_events`. | ❌ **CHƯA CÓ TRÊN FRONTEND**: Chưa có hook `useAntiCheatTelemetry.ts` để ngầm bắt sự kiện chuyển tab (`visibilitychange`, `blur`), thoát toàn màn hình (`fullscreen`) hoặc paste dữ liệu; chưa có banner nhắc nhở. |
| **7. Hộp Thoại Xác Nhận Nộp Bài** | Nút "Nộp bài" hiện tại submit trực tiếp qua `window.confirm` hoặc gọi thẳng `onSubmit()`. | ⚠️ **Cần hoàn thiện**: Cần component `SubmitConfirmModal.tsx` tổng hợp số câu đã làm, số câu bỏ trống, số câu đánh dấu xem lại trước khi nộp chính thức. |
| **8. Bảng Điểm & Phân Tích Bloom** | Đã có `ScoreSummaryCard.tsx` và `QuestionFeedbackList.tsx` trong `QuizResultView.tsx`. | ⚠️ **Cần hoàn thiện**: Chưa có biểu đồ phân tích năng lực theo 4 mức độ tư duy Bloom (Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao); chưa render KaTeX trong phần giải thích. |

---

## 2. 🖼️ ĐẶC TẢ CHI TIẾT GIAO DIỆN & TRẢI NGHIỆM FRONT-WEB (VISUAL WIREFRAMES & SPECS)

Front-Web (`apps/quiz-web`) được tổ chức thành **4 Màn hình chính** cùng **2 Hộp thoại Modal chức năng**. Dưới đây là phác thảo trực quan và mô tả chi tiết:

```text
                                  ┌──────────────────────────────────────────────────────────┐
                                  │                BẢN ĐỒ MÀN HÌNH FRONT-WEB                 │
                                  └─────────────────────────────┬────────────────────────────┘
                                                                │
                                                                ▼
                                      ┌──────────────────────────────────────────────────┐
                                      │ MÀN HÌNH 1: ĐĂNG NHẬP THÍ SINH (LoginView)       │
                                      │ - Nhập tài khoản học sinh / Click tài khoản mẫu   │
                                      └─────────────────────────┬────────────────────────┘
                                                                │ Đăng nhập thành công
                                                                ▼
                                      ┌──────────────────────────────────────────────────┐
                                      │ MÀN HÌNH 2: KHÁM PHÁ & CHỌN ĐỀ (QuizStartView)   │
                                      │ - Cây tri thức môn học + Bộ lọc Khối lớp         │
                                      │ - Lưới thẻ đề thi & Xem chi tiết                 │
                                      └─────────────────────────┬────────────────────────┘
                                                                │ Bấm "Vào thi ngay"
                                                                ▼
                                      ┌──────────────────────────────────────────────────┐
                                      │ [MODAL]: CHỌN MÃ ĐỀ BIẾN THỂ (VariantSelectModal)│
                                      │ - Xem thể lệ, chọn Mã 101, 102... hoặc ngẫu nhiên│
                                      └─────────────────────────┬────────────────────────┘
                                                                │ Xác nhận vào phòng thi
                                                                ▼
                                      ┌──────────────────────────────────────────────────┐
                                      │ MÀN HÌNH 3: PHÒNG THI ONLINE (QuizActiveView)    │
                                      │ - Đồng hồ Cristian, Autosave, Telemetry          │
                                      │ - Render 6 dạng câu hỏi + Công thức KaTeX        │
                                      │ - Question Palette & Đánh dấu cờ xem lại 🚩      │
                                      └─────────────────────────┬────────────────────────┘
                                                                │ Hết giờ hoặc Bấm "Nộp bài"
                                                                ▼
                                      ┌──────────────────────────────────────────────────┐
                                      │ [MODAL]: XÁC NHẬN NỘP BÀI (SubmitConfirmModal)   │
                                      │ - Thống kê số câu đã làm / bỏ trống / xem lại    │
                                      └─────────────────────────┬────────────────────────┘
                                                                │ Xác nhận nộp bài
                                                                ▼
                                      ┌──────────────────────────────────────────────────┐
                                      │ MÀN HÌNH 4: BẢNG ĐIỂM & KẾT QUẢ (QuizResultView) │
                                      │ - Điểm chính thức, Tỷ lệ đúng, Trạng thái Đạt    │
                                      │ - Biểu đồ phổ điểm Bloom, Xem lại đáp án & KaTeX │
                                      └──────────────────────────────────────────────────┘
```

---

### 📱 MÀN HÌNH 1: ĐĂNG NHẬP THÍ SINH (`LoginView.tsx`)

#### 1. Bố cục Wireframe ASCII
```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                  │
│                                 🎓 HỆ THỐNG KHẢO THÍ TRỰC TUYẾN                                  │
│                                  Nền tảng kiểm tra & đánh giá năng lực                           │
│                                                                                                  │
│                     ┌──────────────────────────────────────────────────────┐                     │
│                     │ 🔐 ĐĂNG NHẬP VÀO PHÒNG THI                           │                     │
│                     ├──────────────────────────────────────────────────────┤                     │
│                     │ Email / Tên đăng nhập:                               │                     │
│                     │ ┌──────────────────────────────────────────────────┐ │                     │
│                     │ │ student@quiz.com                                 │ │                     │
│                     │ └──────────────────────────────────────────────────┘ │                     │
│                     │ Mật khẩu:                                            │                     │
│                     │ ┌──────────────────────────────────────────────────┐ │                     │
│                     │ │ ••••••••••••                                     │ │                     │
│                     │ └──────────────────────────────────────────────────┘ │                     │
│                     │                                                      │                     │
│                     │ [          ĐĂNG NHẬP VÀO THI NGAY         ]          │                     │
│                     │                                                      │                     │
│                     │ ──────────────── Hoặc chọn nhanh ──────────────────  │                     │
│                     │ ┌──────────────────────────────────────────────────┐ │                     │
│                     │ │ 👤 Thí sinh mẫu: student@quiz.com (student123)  │ │                     │
│                     │ └──────────────────────────────────────────────────┘ │                     │
│                     └──────────────────────────────────────────────────────┘                     │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 2. Đặc tả Thành phần & Tương tác
- **Tông màu**: Nền tối `bg-slate-950`, Card đăng nhập `bg-slate-900` viền `border-slate-800` với bo góc `rounded-2xl` (16px).
- **Hộp chọn nhanh (Quick Preset Pill)**: Nhấp chuột vào thẻ *"Thí sinh mẫu"* sẽ tự động điền `student@quiz.com` và `student123`.
- **Trạng thái nút bấm**: Khi đang gọi API `/v1/auth/login`, nút hiển thị hiệu ứng xoay tròn và vô hiệu hóa click đúp.
- **Bắt lỗi**: Hiển thị hộp cảnh báo màu đỏ (`bg-rose-500/10 text-rose-400 border-rose-500/30`) nếu mật khẩu sai hoặc server ngoại tuyến.

---

### 📚 MÀN HÌNH 2: KHÁM PHÁ & CHỌN ĐỀ THI (`QuizStartView.tsx`)

#### 1. Bố cục Wireframe ASCII (Khớp 100% Codebase & Cây Taxonomy Thực Tế)
```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🎓 [Hệ Thống Thi Trắc Nghiệm]                          │ 👤 Nguyễn Văn A (student@quiz.com) [STUDENT] [▾]                  │
│    Cổng Khảo Thí & Phân Loại Đề Theo Cây Tri Thức       │    (Nhấp xem: Hồ sơ thí sinh / Đăng xuất)                         │
├─────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────┤
│ 📚 CÂY THƯ MỤC TRI THỨC            │ 📍 Breadcrumb: Chủ đề / Toán học / Đại số / Đại số 10                                  │
│    [ Mở tất cả ] / [ Thu gọn ]     │ 🏷️ H1: Đại số 10  [3 đề thi]                     [🔍 Tìm theo tên hoặc mã đề...  ✕]    │
│ ┌────────────────────────────────┐ ├────────────────────────────────────────────────────────────────────────────────────────┤
│ │ 🔍 Tìm môn học, chủ đề...    ✕ │ │ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ └────────────────────────────────┘ │ │ 🎓 LỌC THEO KHỐI LỚP & CẤP HỌC:                                                    │ │
│ 🗂️ Tất cả môn / chủ đề      (12)  │ │ ├─ Hàng trên (Cấp học):  [Tất cả khối] │ [Tiểu học]  [THCS]  [THPT (Đang chọn)]     │ │
│ 📁 Toán học                        │ │ ├─ Hàng dưới (Khối lớp): [Lớp 10 (3) - Đang chọn]  [Lớp 11]  [Lớp 12]                 │ │
│   ├─ 📂 Đại số                     │ │ └─ Hàng lọc (Đang lọc):  Đang lọc: [🏷️ Đại số 10 ✕] [🎓 Lớp 10 ✕]    [Đặt lại bộ lọc]│ │
│   │   ├─ 📄 Đại số 10              │ │ └────────────────────────────────────────────────────────────────────────────────────┘ │
│   │   │   └─ 📄 PT bậc hai         ├─────────────────────────────────────────────┬──────────────────────────────────────────┤
│   ├─ 📂 Đại số                     │ CỘT 1: DANH SÁCH BÀI THI (60% - 7 cols)     │ CỘT 2: THÔNG TIN CA THI (40% - 5 cols)   │
│   │   ├─ 📄 Đại số 10              │                                             │                                          │
│   │   │   └─ 📄 PT bậc hai         │ ┌─────────────────────────────────────────┐ │ ┌──────────────────────────────────────┐ │
│   │   └─ 📄 Hình học               │ │ 📝 KIỂM TRA GIỮA KỲ TOÁN 10             │ │ │ 📋 ĐỀ ĐANG CHỌN:                     │ │
│   └─ 📂 Hình học                   │ │    [Chính thức] [Đang mở]               │ │ │ KIỂM TRA GIỮA KỲ TOÁN 10             │ │
│ 📁 Tin học & Lập trình             │ │ Mệnh đề, tập hợp, BPT và hàm số bậc hai.│ │ │ Mã: EXAM_MATH10_MIDTERM              │ │
│   ├─ 📄 Phát triển Web             │ │ Mã: EXAM_MATH10_MIDTERM                 │ │ ├──────────────────────────────────────┤ │
│   └─ 📄 Cơ sở dữ liệu              │ │ 🏷️ Đại số 10  •  🎓 Lớp 10              │ │ │ 👤 THÍ SINH: Nguyễn Văn A (cand_01)  │ │
│ 📁 Ngoại ngữ                       │ │                       [ ✓ Đang chọn ]   │ │ ├──────────────────────────────────────┤ │
│   └─ 📄 Tiếng Anh                  │ └─────────────────────────────────────────┘ │ │ ⏱️ 45 phút       | 🎯 5.0 điểm đạt     │ │
│ 📁 Vật lý: Động học chất điểm      │ ┌─────────────────────────────────────────┐ │ │ ❓ 20 câu hỏi    | 🛡️ 3 lượt thi        │ │
│                                    │ │ 📝 ĐẠI SỐ 10: PHƯƠNG TRÌNH BẬC HAI      │ │ ├──────────────────────────────────────┤ │
│                                    │ │    [Khảo sát] [Đang mở]                 │ │ │ 🛡️ Quy chế: Đồng hồ RFC máy chủ,    │ │
│                                    │ │ Định lý Vi-ét và dấu tam thức bậc hai.  │ │ │   chống chuyển tab, tự lưu nháp...   │ │
│                                    │ │ Mã: EXAM_MATH10_EQUATION                │ │ ├──────────────────────────────────────┤ │
│                                    │ │ 🏷️ PT bậc hai  •  🎓 Lớp 10             │ │ │ [ 🚀 BẮT ĐẦU VÀO CA THI ]            │ │
│                                    │ │                       [   Chọn đề   ]   │ │ │ (Mở Modal chọn Mã đề biến thể)       │ │
│ ────────────────────────────────── │ └─────────────────────────────────────────┘ │ └──────────────────────────────────────┘ │
│ Chuẩn phân loại: TOPIC (Tri Thức)  │                                             │                                          │
└────────────────────────────────────┴─────────────────────────────────────────────┴──────────────────────────────────────────┘
```

#### 2. Đặc tả Thành phần & Tương tác (Đã đối soát Codebase)
- **Thanh Tiêu Đề Trên Cùng (`TopBar.tsx`)**:
  - Bên trái: Biểu tượng mũ cử nhân gradient xanh, Tiêu đề chính *"Hệ Thống Thi Trắc Nghiệm"*, Tiêu đề phụ *"Cổng Khảo Thí & Phân Loại Đề Theo Cây Tri Thức"*.
  - Bên phải: Avatar chữ cái viết tắt, Tên học viên, Email, Huy hiệu `STUDENT` màu xanh lam. Khi nhấp mở Menu thả xuống (`Xem hồ sơ học viên` $\rightarrow$ Mở `StudentProfileModal`, `Đăng xuất`).
- **Thanh Cây Thư Mục Tri Thức (`TaxonomyTreeSidebar.tsx` - Chiếm ~25-28% chiều ngang)**:
  - Header: Tiêu đề `CÂY THƯ MỤC TRI THỨC`, nút chuyển đổi nhanh `[ Mở tất cả ] / [ Thu gọn ]`.
  - Ô tìm kiếm danh mục: `Tìm môn học, chủ đề...` có nút [✕] xóa nhanh.
  - Tùy chọn gốc: `Tất cả môn / chủ đề` kèm số lượng tổng đề thi (`totalQuizzesCount`).
  - Cây danh mục chuẩn hóa theo CSDL `services/taxonomy` (`tax_topic`):
    - 📁 *Toán học* (`node_topic_math`) $\rightarrow$ 📂 *Đại số* $\rightarrow$ 📄 *Đại số 10* $\rightarrow$ 📄 *Phương trình bậc hai* / 📂 *Hình học*.
    - 📁 *Tin học & Lập trình* (`node_topic_it`) $\rightarrow$ 📄 *Phát triển Web* / 📄 *Cơ sở dữ liệu*.
    - 📁 *Ngoại ngữ* (`node_topic_lang`) $\rightarrow$ 📄 *Tiếng Anh*.
    - 📁 *Vật lý: Động học chất điểm* (`node_phys_kinematics`).
  - Khi nhấp vào từng node, cây tự động lọc danh sách đề thi tương ứng ở khung giữa.
- **Thanh Lọc Khối Lớp & Cấp Học Đa Chiều (`QuizContentArea.tsx` - 2D Facet Filter Bar)**: Khung viền chính `LỌC THEO KHỐI LỚP & CẤP HỌC` được giữ nguyên vẹn, bên trong chia tách mạch lạc thành 3 hàng ngang phân định rõ ràng:
  - **Hàng 1 (Bên trên - Bậc/Cấp học)**: Nút `[ Tất cả khối ]` phân cách `|` với các bậc học: `[ Tiểu học ]`, `[ THCS ]`, `[ THPT ]` (kèm badge đếm tổng số bài thi tương ứng của từng cấp học).
  - **Hàng 2 (Hàng ngang bên dưới - Khối lớp tương ứng)**: Hiển thị các khối lớp con tương ứng với cấp học đang chọn (ví dụ: khi chọn THPT thì hiển thị `[ Lớp 10 (3) ]`, `[ Lớp 11 ]`, `[ Lớp 12 ]`; nếu chọn Tất cả khối thì hiển thị tất cả các lớp).
  - **Hàng 3 (Hàng dưới cùng - Bộ thẻ đang lọc & Đặt lại)**: `Đang lọc theo:` các thẻ chip đa chiều `[🏷️ Chủ đề: Đại số 10 ✕]`, `[🎓 Khối: Lớp 10 ✕]` cùng nút `[Đặt lại tất cả bộ lọc]`.
- **Khung Nội Dung Chính: Bố Cục Master-Detail (Grid 12 Cột)**:
  - **Cột Trái (7 cols - 60%): Danh Sách Bài Thi Tương Ứng**:
    - Hiển thị danh sách thẻ bài thi được lọc. Thí sinh nhấp vào thẻ bài thi bất kỳ để chọn đề (`onSelectQuiz`).
    - Thẻ được chọn sẽ sáng viền xanh ngọc (`ring-sky-500`), nền chuyển màu gradient và nút hiển thị `✓ Đang chọn`.
  - **Cột Phải (5 cols - 40%): Thông Tin Ca Thi (`exam-session-info-card`)**:
    - Hiển thị thông số chi tiết của đề thi đang được chọn: Tiêu đề, Mã đề, Mô tả, Thông tin thí sinh (`candidate_01`).
    - Lưới 4 thông số: Thời gian làm bài (`durationMinutes`), Điểm đạt tối thiểu (`passingScore`), Tổng số câu hỏi (`totalQuestions`), Số lượt thi tối đa (`maxAttempts`).
    - Hộp quy chế khảo thí & an ninh phòng thi (4 gạch đầu dòng).
    - Nút hành động chính: `[ 🚀 BẮT ĐẦU VÀO CA THI ]` (`btn-start-exam`). Khi nhấp sẽ mở Modal Chọn Biến Thể Mã Đề (`ExamVariantSelectModal.tsx`).

---

### 🔀 [MODAL 1]: CHỌN BIẾN THỂ MÃ ĐỀ & XÁC NHẬN VÀO THI (`ExamVariantSelectModal.tsx`)

#### 1. Bố cục Wireframe ASCII
```text
┌──────────────────────────────────────────────────────────────────────┐
│ 📝 XÁC NHẬN VÀO CA THI                                           [X] │
├──────────────────────────────────────────────────────────────────────┤
│ Tên kỳ thi: KIỂM TRA GIỮA KỲ TOÁN HỌC 10 (NĂM HỌC 2026)              │
│ Mã kỳ thi:  EXAM_MATH10_MIDTERM                                      │
│                                                                      │
│ 📋 THÔNG SỐ KHẢO THÍ:                                                │
│ • Thời gian làm bài: 45 phút (Đồng hồ đếm ngược tuyệt đối từ máy chủ)│
│ • Số lượng câu hỏi:  20 câu trắc nghiệm khách quan                   │
│ • Điểm đạt yêu cầu:  5.0 / 10.0 (50%)                                │
│ • Chính sách chấm:   Chấm từng phần cho câu nhiều lựa chọn (PARTIAL) │
│                                                                      │
│ 🎯 LỰA CHỌN MÃ ĐỀ BIẾN THỂ:                                          │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ (*) [x] Hệ thống tự động bốc thăm ngẫu nhiên mã đề               │ │
│ │ ( ) [ ] Mã đề 101 (Đã xáo trộn trật tự câu hỏi & phương án)      │ │
│ │ ( ) [ ] Mã đề 102 (Đã xáo trộn trật tự câu hỏi & phương án)      │ │
│ │ ( ) [ ] Mã đề 103 (Đã xáo trộn trật tự câu hỏi & phương án)      │ │
│ │ ( ) [ ] Mã đề 104 (Đã xáo trộn trật tự câu hỏi & phương án)      │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ⚠️ Lưu ý: Trong lúc làm bài, hệ thống sẽ ghi nhận thao tác rời màn   │
│           hình thi (chuyển tab/thoát toàn màn hình).                 │
├──────────────────────────────────────────────────────────────────────┤
│ [ Hủy bỏ ]                              [ 🚀 BẮT ĐẦU LÀM BÀI THI ]   │
└──────────────────────────────────────────────────────────────────────┘
```

#### 2. Đặc tả Thành phần & Tương tác
- **Mục đích**: Loại bỏ trải nghiệm bắt đầu đột ngột, giúp thí sinh nắm rõ quy chế và có thể chọn đúng mã đề thi được giám thị chỉ định (hoặc để ngẫu nhiên).
- **Trường dữ liệu**:
  - Nhóm radio buttons chọn `variantCode`: Mặc định là `auto` (Ngẫu nhiên).
  - Tóm tắt thể lệ và cảnh báo giám thị.
- **Hành động**: Nhấn `"BẮT ĐẦU LÀM BÀI THI"` sẽ gọi `apiClient.attempts.createOrRecover` kèm `variantCode` và chuyển sang màn hình làm bài.

---

### ⏱️ MÀN HÌNH 3: PHÒNG THI TRỰC TUYẾN CHUẨN XÁC (`QuizActiveView.tsx`)

#### 1. Bố cục Wireframe ASCII
```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📝 Kiểm tra giữa kỳ Toán 10 (Mã ca: att_7f8a)   │ ⏱️ CÒN LẠI: 38:42 │ 🟢 Đã lưu │ Tiến độ: 8/20 câu│
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠️ [BANNER CẢNH BÁO]: Bạn vừa chuyển tab! Hành vi này đã được ghi vào nhật ký giám thị.     [X]  │
├──────────────────────────────────────────────────────────────────┬───────────────────────────────┤
│ KHUNG HIỂN THỊ CÂU HỎI (2/3 màn hình)                            │ MỤC LỤC CÂU HỎI (1/3)         │
│                                                                  │                               │
│ ┌──────────────────────────────────────────────────────────────┐ │ ┌───────────────────────────┐ │
│ │ Câu 8 / 20  •  0.5 điểm      [ 🚩 Đánh dấu xem lại câu này ] │ │ │ [1]  [2]  [3]  [4]  [5]   │ │
│ ├──────────────────────────────────────────────────────────────┤ │ │ [6]  [7]  [8*] [9]  [10]  │ │
│ │ ĐỀ BÀI:                                                      │ │ │ [11] [12] [13] [14] [15]  │ │
│ │ Cho tam thức bậc hai:                                        │ │ │ [16] [17] [18] [19] [20]  │ │
│ │                   $$f(x) = ax^2 + bx + c \quad (a \neq 0)$$  │ │ └───────────────────────────┘ │
│ │ Điều kiện cần và đủ để $f(x) > 0, \forall x \in \mathbb{R}$? │ │                               │
│ │                                                              │ │ 🎨 CHÚ THÍCH TRẠNG THÁI:      │
│ │ CÁC PHƯƠNG ÁN LỰA CHỌN:                                      │ │ 🔵 Xanh: Đã làm (8 câu)      │
│ │ ┌──────────────────────────────────────────────────────────┐ │ │ ⚪ Xám: Chưa làm (11 câu)    │
│ │ │ ( ) A. $a > 0$ và $\Delta > 0$                           │ │ │ 🟠 Cam 🚩: Xem lại (1 câu) │
│ │ ├──────────────────────────────────────────────────────────┤ │ │ 🟢 Viền sáng: Đang mở (Câu 8)│
│ │ │ (*) B. $a > 0$ và $\Delta < 0$  (Đang chọn)             │ │ └───────────────────────────┘ │
│ │ ├──────────────────────────────────────────────────────────┤ │                               │
│ │ │ ( ) C. $a < 0$ và $\Delta < 0$                           │ │                               │
│ │ ├──────────────────────────────────────────────────────────┤ │                               │
│ │ │ ( ) D. $a > 0$ và $\Delta \le 0$                         │ │                               │
│ │ └──────────────────────────────────────────────────────────┘ │                               │
│ └──────────────────────────────────────────────────────────────┘ │                               │
├──────────────────────────────────────────────────────────────────┴───────────────────────────────┤
│ [ ⬅️ Câu trước ]                     Câu 8 / 20                      [ Câu tiếp ➡️ ] [ 🔴 NỘP BÀI ]│
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 2. Đặc tả Thành phần & Tương tác
- **Thanh Tiêu Đề Phòng Thi (QuizHeader)**:
  - **Đồng hồ đếm ngược máy chủ (`QuizTimer`)**:
    - Chạy độc lập với giờ máy tính dựa trên mốc `deadline` và độ lệch Cristian $\Delta$.
    - Mức hiển thị: Bình thường (Màu xanh lam) $\rightarrow$ Dưới 5 phút (Vàng cảnh báo) $\rightarrow$ Dưới 1 phút (Đỏ rực nhấp nháy chu kỳ 1s).
    - Khi chạm mốc `00:00:00`, khóa toàn bộ tương tác và kích hoạt nộp bài tự động.
  - **Chỉ báo lưu nháp (`SaveStatusIndicator`)**:
    - 🟢 *Đã lưu*: Hiển thị sau khi request PATCH lưu thành công.
    - 🟡 *Đang lưu...*: Khi thí sinh vừa đổi đáp án (đang debounce 300ms).
    - 🔴 *Lỗi lưu bài - Đang thử lại*: Cảnh báo khi mất kết nối.
  - **Thanh tiến trình (Progress Bar)**: Chiều dài tỷ lệ thuận với số câu đã chọn.
- **Khung Câu Hỏi Trọng Tâm**:
  - Hiển thị số thứ tự câu và barem điểm.
  - **Nút bật cờ 🚩 (`Flag for Review`)**: Khi nhấp, nút chuyển sang màu cam và biểu tượng cờ cam xuất hiện trên ô câu hỏi tương ứng bên Question Palette.
  - **Trình kết xuất toán học (`KaTeXViewer`)**: Render mượt mà mọi công thức `$..$` và `$$..$$` với font chuẩn Computer Modern.
  - Hỗ trợ đầy đủ **6 dạng câu hỏi**:
    1. *Single Choice*: 4 thẻ Radio to, rõ nét, hover đổi màu viền.
    2. *Multiple Choice*: Checkboxes có chỉ dẫn *"Chọn nhiều đáp án đúng"*.
    3. *Fill-in-the-blank*: Khung nhập liệu văn bản với phím Enter chuyển nhanh.
    4. *Matching*: Cột A và Cột B với Dropdown ghép cặp trực quan.
    5. *Numeric*: Ô nhập số thực chuẩn xác.
    6. *Ordering*: Các bước với 2 nút [⬆️ Lên] và [⬇️ Xuống] để đổi vị trí.
- **Bảng Điều Hướng Câu Hỏi (`QuestionPalette`)**:
  - Lưới các nút câu hỏi dạng ô vuông $44 \times 44\text{px}$ (chuẩn touch target).
  - Nhấp vào bất kỳ ô nào sẽ nhảy ngay đến câu hỏi đó mà không bị giật màn hình.
  - Thống kê tóm tắt ở chân: Đã làm: $X$ • Chưa làm: $Y$ • Cần xem lại: $Z$.
- **Banner Cảnh Báo Gian Lận Ngầm (`AntiCheatWarningBanner`)**:
  - Xuất hiện dạng trượt nhẹ từ trên xuống khi thí sinh chuyển tab hoặc thoát fullscreen.
  - Tự động ẩn sau 4 giây, không che khuất đề bài.

---

### ⚠️ [MODAL 2]: XÁC NHẬN NỘP BÀI THI (`SubmitConfirmModal.tsx`)

#### 1. Bố cục Wireframe ASCII
```text
┌──────────────────────────────────────────────────────────────────────┐
│ ⚠️ XÁC NHẬN NỘP BÀI THI                                          [X] │
├──────────────────────────────────────────────────────────────────────┤
│ Bạn có chắc chắn muốn kết thúc và nộp bài thi này?                   │
│                                                                      │
│ 📊 THỐNG KÊ TIẾN ĐỘ BÀI LÀM:                                         │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │  ✅ Số câu đã hoàn thành:       18 / 20 câu                     │ │
│ │  ⚠️ Số câu CHƯA TRẢ LỜI:        02 / 20 câu (Câu 14, 19)        │ │
│ │  🚩 Số câu ĐÁNH DẤU XEM LẠI:    01 câu (Câu 8)                  │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ⏱️ Thời gian còn lại: 15 phút 20 giây                                │
│                                                                      │
│ ❗ Lưu ý: Sau khi nộp bài, bạn sẽ KHÔNG THỂ chỉnh sửa đáp án nữa.   │
│           Hệ thống sẽ tiến hành chấm điểm tự động ngay lập tức.      │
├──────────────────────────────────────────────────────────────────────┤
│ [ ⬅️ Quay lại làm tiếp ]                    [ 🔴 XÁC NHẬN NỘP BÀI ]   │
└──────────────────────────────────────────────────────────────────────┘
```

#### 2. Đặc tả Thành phần & Tương tác
- **Mục đích**: Ngăn ngừa hoàn toàn hành vi nộp nhầm, nhắc nhở thí sinh nếu còn câu chưa làm hoặc còn câu đang đánh dấu xem lại.
- **Hành vi**:
  - Nhấp `"Quay lại làm tiếp"`: Đóng modal, giữ nguyên trạng thái phòng thi.
  - Nhấp `"Xác nhận nộp bài"`: Flush toàn bộ hàng đợi lưu nháp $\rightarrow$ Gọi API `POST /v1/attempts/:id/submit` $\rightarrow$ Chuyển sang màn hình Bảng điểm.

---

### 📊 MÀN HÌNH 4: BẢNG ĐIỂM & KẾT QUẢ KHẢO THÍ (`QuizResultView.tsx`)

#### 1. Bố cục Wireframe ASCII
```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🎓 KẾT QUẢ KHẢO THÍ CHÍNH THỨC                                          [ 🏠 Về trang chủ ]      │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│    ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│    │ 🟢 KẾT QUẢ: ĐẠT YÊU CẦU (PASSED)                                                       │    │
│    │                                                                                        │    │
│    │        ĐIỂM SỐ:  8.5 / 10.0                 TỶ LỆ ĐÚNG:  85% (17/20 câu)               │    │
│    │        THỜI GIAN LÀM: 32 phút 15 giây       THỜI ĐIỂM NỘP: 09:32:15 09/09/2026         │    │
│    └────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                  │
│    📊 PHÂN TÍCH NĂNG LỰC THEO CẤP ĐỘ BLOOM (Bloom Mastery Breakdown):                            │
│    ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│    │ 🟢 Nhận biết (Remember):   [████████████████████] 100% (6/6 câu)                       │    │
│    │ 🔵 Thông hiểu (Understand):[████████████████░░░░]  80% (4/5 câu)                       │    │
│    │ 🟡 Vận dụng (Apply):       [███████████████░░░░░]  75% (6/8 câu)                       │    │
│    │ 🟣 Vận dụng cao (Analyze): [██████████░░░░░░░░░░]  50% (1/2 câu)                       │    │
│    └────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                  │
│    📝 CHI TIẾT CÂU TRẢ LỜI & LỜI GIẢI:                                                           │
│    ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│    │ [✓ ĐÚNG] Câu 1: Giải phương trình $\sqrt{x-1} = 2$                                    │    │
│    │          • Bạn chọn: B. $x = 5$                                                        │    │
│    │          • Đáp án đúng: B. $x = 5$  (+0.5 điểm)                                        │    │
│    │          • Giải thích: Bình phương hai vế ta được $x - 1 = 4 \iff x = 5$.              │    │
│    ├────────────────────────────────────────────────────────────────────────────────────────┤
│    │ [✗ SAI]  Câu 8: Cho $f(x) = ax^2 + bx + c$. Điều kiện để $f(x) > 0, \forall x$?       │    │
│    │          • Bạn chọn: A. $a > 0$ và $\Delta > 0$                                        │    │
│    │          • Đáp án đúng: B. $a > 0$ và $\Delta < 0$  (0 / 0.5 điểm)                     │    │
│    │          • Giải thích: Để tam thức cùng dấu với hệ số $a > 0$ trên toàn $\mathbb{R}$,  │    │
│    │            điều kiện cần và đủ là biệt thức $\Delta < 0$.                              │    │
│    └────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 2. Đặc tả Thành phần & Tương tác
- **Thẻ Tổng Kết Điểm Số (`ScoreSummaryCard`)**:
  - Huy hiệu cỡ lớn: 🟢 `ĐẠT (PASSED)` hoặc 🔴 `CHƯA ĐẠT (FAILED)` dựa vào ngưỡng `passingPercentage`.
  - Điểm số to rõ ràng: `8.5 / 10.0` điểm; tỷ lệ hoàn thành chính xác.
  - Thời lượng làm bài thực tế giúp học sinh tự đánh giá tốc độ làm bài.
- **Biểu Đồ Năng Lực Bloom (`BloomMasteryBreakdown`)**:
  - Phân tích phổ điểm theo 4 cấp độ nhận thức.
  - Thanh tiến trình trực quan với 4 màu sắc chuẩn nhận thức học thuật: Xanh lục (Nhận biết) $\rightarrow$ Xanh lam (Thông hiểu) $\rightarrow$ Vàng (Vận dụng) $\rightarrow$ Tím (Vận dụng cao).
- **Danh Sách Xem Lại Chi Tiết (`QuestionFeedbackList`)**:
  - Chỉ hiển thị khi đề thi cấu hình cho phép xem đáp án sau khi thi (`revealAnswers = true`).
  - Mỗi câu hỏi hiển thị rõ: Đề bài, Lựa chọn của thí sinh, Đáp án chuẩn của hệ thống, Barem điểm và Lời giải thích chi tiết có công thức toán học KaTeX.
- **Nút Hành Động**:
  - Nút `"Về trang chủ"` quay lại danh mục đề thi.

---

## 3. 🗺️ LỘ TRÌNH TRIỂN KHAI FRONT-WEB (ROADMAP THEO ĐÚNG DELTA)

Lộ trình tập trung vào việc **lấp đầy các khoảng cách kỹ thuật đã phát hiện trong audit**, chia làm **6 Giai đoạn (Epics)** tuần tự:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                FRONT-WEB FOCUSED EXECUTION ROADMAP                               │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  [EPIC FW-1] Hoàn Thiện Modal Chọn Biến Thể Mã Đề & Chi Tiết Kỳ Thi (Catalog & Variant Selector)   │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-2] Tích Hợp Thư Viện KaTeX & Render Công Thức Toán Học Cho 6 Dạng Câu Hỏi             │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-3] Nâng Cấp Question Palette (Tính Năng Đánh Dấu Xem Lại - Flag For Review)            │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-4] Xây Dựng Động Cơ Telemetry Chống Gian Lận Ngầm (Anti-Cheat Ingestion)               │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-5] Hộp Thoại Nộp Bài Chuyên Nghiệp & Phân Tích Năng Lực Bloom Tại Màn Hình Kết Quả     │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-6] Kiểm Thử Tích Hợp Toàn Trình (E2E Test, Resilience & Production Build)             │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 📋 DANH MỤC CÁC TASK THỰC THI (ACTIONABLE CHECKLIST)

Các task dưới đây sử dụng **đúng tên tệp và đường dẫn thực tế** trong `apps/quiz-web`, sẵn sàng để tick `[x]` khi triển khai:

---

### 🗂️ EPIC FW-1: Modal Chi Tiết Kỳ Thi & Lựa Chọn Biến Thể Mã Đề
*Mục tiêu: Cho phép thí sinh xem quy chế, chọn mã đề biến thể (ví dụ: Mã 101, Mã 102) hoặc để hệ thống bốc thăm ngẫu nhiên trước khi vào phòng thi.*

- [ ] **Task FW-1.1**: Xây dựng component `ExamVariantSelectModal.tsx` tại `apps/quiz-web/src/components/dashboard/`
  - Hiển thị thông tin tổng quan: Tên kỳ thi, Mã đề gốc (`exm_...`), Thời lượng, Số câu, Điểm đạt.
  - Danh sách chọn mã đề biến thể (`variantCode`) lấy từ `quizDetails.variants` (nếu có).
  - Tùy chọn mặc định: *"Hệ thống tự động phát đề ngẫu nhiên"*.
  - Nút bấm `"Xác Nhận & Bắt Đầu Ca Thi"` kèm trạng thái loading chống click đúp.
- [ ] **Task FW-1.2**: Tích hợp Modal vào `QuizContentArea.tsx` và `QuizStartView.tsx`
  - Khi thí sinh bấm *"Vào thi ngay"*, mở `ExamVariantSelectModal` để xác nhận thay vì bắt đầu ngay lập tức.
  - Truyền `variantCode` đã chọn vào hàm `handleStart(quizId, variantCode)`.
- [ ] **Task FW-1.3**: Cập nhật `useQuizSession.ts` và `quizApi.startQuiz` nhận `variantCode`
  - Đảm bảo `variantCode` được gửi lên payload của `apiClient.attempts.createOrRecover({ examId, variantCode, autoStart: true })`.
- [x] **Task FW-1.4**: Phân tách 3 hàng ngang cho `grade-facet-filter-bar` trong `QuizContentArea.tsx` (Hoàn thành)
  - Giữ nguyên khung chính `LỌC THEO KHỐI LỚP & CẤP HỌC`, chia thành 3 hàng ngang trực quan:
    - **Hàng 1 (Bên trên)**: `[ Tất cả khối ] | [ Tiểu học ] [ THCS ] [ THPT ]`.
    - **Hàng 2 (Bên dưới)**: `[ Lớp 10 (3) ] [ Lớp 11 ] [ Lớp 12 ]` các lớp tương ứng với khối/cấp học được chọn.
    - **Hàng 3 (Dưới cùng)**: `Đang lọc: [🏷️ Chủ đề: Đại số 10 ✕] [🎓 Khối: Lớp 10 ✕] [Đặt lại tất cả bộ lọc]`.
  - Tối ưu hóa trải nghiệm responsive và animation mượt mà khi chuyển cấp học/khối lớp.

---

### 📐 EPIC FW-2: Tích Hợp KaTeX & Hiển Thị Công Thức Toán Học Cho 6 Dạng Câu Hỏi
*Mục tiêu: Đảm bảo toàn bộ công thức toán học, biểu thức lý/hóa (`$...$` và `$$...$$`) hiển thị sắc nét, không vỡ layout.*

- [ ] **Task FW-2.1**: Cài đặt gói `katex` và `@types/katex` vào `apps/quiz-web`
  - Cập nhật `apps/quiz-web/package.json` và nạp stylesheet KaTeX CSS (`katex/dist/katex.min.css`) vào `apps/quiz-web/src/index.css`.
- [ ] **Task FW-2.2**: Xây dựng component `KaTeXViewer.tsx` tại `apps/quiz-web/src/components/common/`
  - Parser thông minh: Tách chuỗi văn bản thành các đoạn văn thường và đoạn công thức toán học.
  - Hỗ trợ công thức nội dòng `$f(x) = ax^2 + bx + c$` (`displayMode: false`).
  - Hỗ trợ công thức khối `$$\int_{a}^{b} f(x) dx$$` (`displayMode: true`).
  - Bọc `try/catch` an toàn: Nếu công thức sai cú pháp LaTeX thì hiển thị chuỗi gốc kèm cảnh báo nhẹ thay vì làm sập ứng dụng.
- [ ] **Task FW-2.3**: Tích hợp `KaTeXViewer` vào đề mục câu hỏi và 6 components câu hỏi
  - Tích hợp vào `QuizActiveView.tsx` (phần render đề bài `currentQuestion.prompt`).
  - Tích hợp vào `SingleChoiceQuestion.tsx` và `MultipleChoiceQuestion.tsx` (nội dung đáp án `opt.content`).
  - Tích hợp vào `MatchingQuestion.tsx` (các vế ghép đôi).
  - Tích hợp vào `OrderingQuestion.tsx` (các mệnh đề cần sắp xếp).
  - Tích hợp vào `FillInQuestion.tsx` và `NumericQuestion.tsx`.

---

### 🚩 EPIC FW-3: Nâng Cấp Question Palette (Tính Năng Đánh Dấu Xem Lại)
*Mục tiêu: Giúp thí sinh dễ dàng gắn cờ các câu hỏi chưa chắc chắn để quay lại kiểm tra trước khi nộp bài.*

- [ ] **Task FW-3.1**: Bổ sung State `flaggedQuestions` vào `QuizActiveView.tsx`
  - Sử dụng `Set<string>` để quản lý danh sách ID các câu hỏi đang được gắn cờ xem lại.
  - Cung cấp nút chuyển đổi (Toggle): 🚩 *"Đánh dấu xem lại câu này"* đặt dưới mỗi câu hỏi.
- [ ] **Task FW-3.2**: Nâng cấp giao diện `QuestionPalette.tsx`
  - Bổ sung màu sắc trạng thái thứ 3:
    - *Xám/Tối*: Chưa làm.
    - *Xanh lam*: Đã chọn đáp án.
    - *Hổ phách/Vàng cam có biểu tượng cờ 🚩*: Đã đánh dấu xem lại.
    - *Viền sáng phát sáng*: Câu hỏi đang được kích hoạt hiển thị.
  - Thống kê ở chân Palette: `Đã làm: X` • `Chưa làm: Y` • `Xem lại: Z`.

---

### 🛡️ EPIC FW-4: Động Cơ Telemetry Chống Gian Lận Ngầm (Anti-Cheat Engine)
*Mục tiêu: Ngầm ghi nhận các hành vi chuyển tab, thoát toàn màn hình, dán đáp án và gửi lên máy chủ.*

- [ ] **Task FW-4.1**: Tạo Hook `useAntiCheatTelemetry.ts` tại `apps/quiz-web/src/hooks/`
  - Nhận tham số: `attemptId`, `enabled: boolean`.
  - Lắng nghe sự kiện `visibilitychange` (chuyển sang tab khác hoặc thu nhỏ trình duyệt).
  - Lắng nghe sự kiện `window.blur` (nhấp chuột ra ngoài cửa sổ thi).
  - Lắng nghe sự kiện `fullscreenchange` (nếu ca thi yêu cầu toàn màn hình).
  - Lắng nghe sự kiện `paste` trên các ô nhập liệu của bài thi.
  - Gửi ngầm lên endpoint: `POST /v1/attempts/:id/events` qua `apiClient.attempts.recordEvent(attemptId, eventData)`.
- [ ] **Task FW-4.2**: Xây dựng component `AntiCheatWarningBanner.tsx` tại `apps/quiz-web/src/components/runner/`
  - Hiển thị thông báo nhắc nhở tinh tế khi phát hiện chuyển tab lần đầu:
    - *"Cảnh báo: Thao tác chuyển tab đã được ghi nhận vào nhật ký kiểm soát phòng thi."*
  - Tự động ẩn sau 4 giây để không làm thí sinh mất tập trung.
- [ ] **Task FW-4.3**: Tích hợp `useAntiCheatTelemetry` và Banner vào `QuizActiveView.tsx`

---

### 📊 EPIC FW-5: Hộp Thoại Nộp Bài & Phân Tích Phổ Điểm Bloom Tại Kết Quả
*Mục tiêu: Đem lại trải nghiệm kết thúc bài thi an toàn, không nộp nhầm và phân tích năng lực sâu sắc.*

- [ ] **Task FW-5.1**: Tạo component `SubmitConfirmModal.tsx` tại `apps/quiz-web/src/components/runner/`
  - Mở ra khi thí sinh bấm nút `"Nộp bài"`.
  - Bảng tổng kết trước nộp:
    - ✅ Số câu đã hoàn thành: **$A / N$**
    - ⚠️ Số câu chưa chọn đáp án: **$B / N$**
    - 🚩 Số câu đang đánh dấu xem lại: **$C$**
  - Hai nút hành động rõ ràng: `"Quay lại kiểm tra"` (Secondary) và `"Xác nhận nộp bài"` (Danger/Primary).
- [ ] **Task FW-5.2**: Nâng cấp `ScoreSummaryCard.tsx` tại `apps/quiz-web/src/components/results/`
  - Hiển thị điểm số chính thức: Điểm đạt / Thang điểm 10 (hoặc 100).
  - Huy hiệu trạng thái lớn: 🟢 **ĐẠT (PASSED)** hoặc 🔴 **CHƯA ĐẠT (FAILED)** dựa theo `result.passed`.
  - Hiển thị thời gian hoàn thành bài thi và thời điểm nộp bài.
- [ ] **Task FW-5.3**: Tạo component `BloomMasteryBreakdown.tsx` tại `apps/quiz-web/src/components/results/`
  - Nhóm các câu hỏi theo 4 cấp độ tư duy Bloom:
    - 🟢 Nhận biết (Remember)
    - 🔵 Thông hiểu (Understand)
    - 🟡 Vận dụng (Apply)
    - 🟣 Vận dụng cao (Analyze)
  - Hiển thị thanh tiến trình trực quan (% câu đúng) cho từng cấp độ năng lực.
- [ ] **Task FW-5.4**: Tích hợp `KaTeXViewer` vào `QuestionFeedbackList.tsx`
  - Đảm bảo lời giải thích (`explanation`) và nội dung đáp án trong màn hình xem lại kết quả đều hiển thị công thức toán học sắc nét.

---

### 🧪 EPIC FW-6: Kiểm Thử Toàn Trình, Độ Bền Mạng & Nghiệm Thu
*Mục tiêu: Đảm bảo 100% tính năng hoạt động mượt mà không có lỗi runtime hay vỡ giao diện.*

- [ ] **Task FW-6.1**: Kiểm thử luồng thi Thí sinh thực tế (End-to-End Walkthrough)
  - Đăng nhập `student@quiz.com` / `student123`.
  - Chọn môn học Toán Học Lớp 10 $\rightarrow$ Mở modal chọn Mã đề 101 $\rightarrow$ Bắt đầu thi.
  - Làm bài với công thức KaTeX $\rightarrow$ Đánh dấu cờ câu phân vân $\rightarrow$ Thử chuyển tab kiểm tra telemetry.
  - Bấm Nộp bài qua `SubmitConfirmModal` $\rightarrow$ Xem bảng điểm và phân tích cấp độ Bloom.
- [ ] **Task FW-6.2**: Kiểm thử độ bền lưu nháp (Autosave & Network Resilience)
  - F5 tải lại trang giữa lúc đang thi $\rightarrow$ Ca thi tự khôi phục nguyên vẹn các câu đã tích.
  - Đồng hồ đếm ngược giữ nguyên độ chính xác theo server (không bị reset về thời gian đầu).
- [ ] **Task FW-6.3**: Kiểm tra tuân thủ Type-check và Build Production
  - Chạy `pnpm lint` thành công.
  - Chạy `pnpm build` biên dịch trơn tru toàn bộ ứng dụng.

---

## 5. 🎯 QUY TẮC CẬP NHẬT TRẠNG THÁI TIẾN ĐỘ TRONG QUÁ TRÌNH CODE

Khi người dùng ra lệnh bắt đầu code, các bước thực hiện sẽ tuân thủ nghiêm ngặt nguyên tắc:
1. **Một việc tại một thời điểm**: Thực hiện từng task theo đúng thứ tự từ `Task FW-1.1` đến `Task FW-6.3`.
2. **Kiểm tra ngay sau mỗi task**: Chạy lint hoặc build để đảm bảo không phát sinh lỗi biên dịch.
3. **Cập nhật Checklist**: Chuyển ngay `- [ ]` thành `- [x]` trong tệp `/plan/front_web_display_plan.md` cho task vừa hoàn tất.
4. **Không mock data**: 100% dữ liệu tương tác với các API thực tế của Gateway (Port 3000).

---

> 🚦 **TRẠNG THÁI CHỜ LỆNH**:  
> Toàn bộ nội dung audit, đặc tả giao diện trực quan và danh mục task đã được hoàn thiện 100%.  
> **Hệ thống đang chờ lệnh code từ bạn (ví dụ: "Bắt đầu code EPIC FW-1" hoặc "Triển khai lần lượt từ Task FW-1.1").**
