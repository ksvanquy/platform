# 🎨 KẾ HOẠCH THIẾT KẾ & TRIỂN KHAI FRONT-WEB (AUDITED & CORE-FOCUSED PLAN)
### Tối Ưu Hóa Trải Nghiệm Khảo Thí Cốt Lõi Thí Sinh (`apps/quiz-web`)
**React 19 • Tailwind CSS • Unified Gateway (Port 3000) • Khám Phá Tự Do (Guest Browsing) • KaTeX Math Rendering • Tập Trung Nghiệp Vụ Khảo Thí Cốt Lõi**

> 🚦 **QUY TRÌNH CHUẨN XÁC ĐÃ AUDIT**:  
> **Bước 1: Khám phá & Chọn đề (Khách xem thoải mái, không chặn đăng nhập)** $\longrightarrow$ **Bước 2: Thi thì Đăng nhập (1-Chạm kích hoạt, ghi nhớ đề thi)** $\longrightarrow$ **Bước 3: Phòng thi Online (KaTeX + 6 dạng câu hỏi + Đánh dấu cờ 🚩) $\rightarrow$ Modal nộp bài** $\longrightarrow$ **Bước 4: Bảng điểm & Phân tích phổ Bloom**.  
> *Đã loại bỏ 100% tính năng rườm rà: Thể lệ dài dòng, bốc thăm ngẫu nhiên, cảnh báo gian lận gây phiền toái, nhãn chữ thừa chiếm diện tích.*

---

## 1. 🔍 BẢNG ĐỐI SOÁT KIẾN TRÚC CỐT LÕI (CORE ARCHITECTURE MATRIX)

| STT | Khối Chức Năng Cốt Lõi | Hiện trạng trong Codebase (`apps/quiz-web`) | Khoảng cách Kỹ thuật cần triển khai (Delta Gaps) |
|:---:|---|---|---|
| **1** | **Khám Phá & Chọn Đề (Guest Mode)** | `App.tsx` đang chặn bắt buộc đăng nhập ngay đầu (`if (!isAuthenticated) return <LoginView />`). | ⚡ **Cần chỉnh (Task FW-1.2)**: Cho phép khách vãng lai tự do duyệt cây môn học, lọc cấp học/khối lớp và xem chi tiết bài thi mà không cần đăng nhập trước. |
| **2** | **Bộ Lọc Khối Lớp Tinh Gọn** | Đã có `TaxonomyTreeSidebar.tsx` và thanh lọc 2D trong `QuizContentArea.tsx`. |  **Hoàn thành Task FW-1.1**. Giao diện trực quan, không chữ thừa, hiển thị trực tiếp các nút chọn. |
| **3** | **Thi Thì Đăng Nhập (Auth on Start)** | Đang bắt đăng nhập trước khi vào app. | ⚡ **Cần làm (Task FW-1.3)**: Khi nhấn `[ 🚀 BẮT ĐẦU CA THI ]`, nếu chưa đăng nhập $\rightarrow$ chuyển sang đăng nhập, lưu `pendingQuizId` để đăng nhập xong vào thi ngay. |
| **4** | **Đồng Hồ Máy Chủ & Lưu Nháp** | Đã có `TimeSyncManager.ts` (Cristian), `QuizTimer.tsx`, `useQuizSession.ts` (debounce 300ms, queue flush). |  Cơ chế đồng bộ thời gian và lưu nháp đã chuẩn. |
| **5** | **Render Công Thức KaTeX** | Chưa cài đặt thư viện `katex`. | ⚠️ **Cần làm (Task FW-2.1 $\rightarrow$ FW-2.3)**: Cài đặt `katex`, viết `KaTeXViewer.tsx`, tích hợp hiển thị công thức `$..$` và `$$..$$` cho đề bài và cả 6 dạng câu hỏi. |
| **6** | **6 Dạng Câu Hỏi Khảo Thí** | Đã có 6 components (`SingleChoice`, `MultipleChoice`, `FillIn`, `Matching`, `Numeric`, `Ordering`). | ⚠️ **Cần làm**: Tích hợp `KaTeXViewer` vào nội dung lựa chọn, mệnh đề và vế ghép của cả 6 components. |
| **7** | **Bảng Điều Hướng & Gắn Cờ 🚩** | Đã có `QuestionPalette.tsx` hiển thị lưới câu hỏi (Đã làm / Chưa làm). | ⚠️ **Cần làm (Task FW-3.1 & FW-3.2)**: Thêm State `flaggedQuestions`, nút 🚩 *"Đánh dấu xem lại"* và đổi màu cam nổi bật trên Question Palette. |
| **8** | **Hộp Thoại Xác Nhận Nộp Bài** | Đang dùng `window.confirm` đơn giản. | ⚠️ **Cần làm (Task FW-4.1)**: Tạo `SubmitConfirmModal.tsx` cảnh báo rõ: Đã làm $X/N$, Chưa làm $Y/N$, Đang gắn cờ $Z$ câu để tránh nộp nhầm. |
| **9** | **Bảng Điểm & Phân Tích Bloom** | Đã có `ScoreSummaryCard.tsx` và `QuestionFeedbackList.tsx`. | ⚠️ **Cần làm (Task FW-4.2 $\rightarrow$ FW-4.4)**: Thêm biểu đồ phân tích 4 cấp độ tư duy Bloom (Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao); render KaTeX trong lời giải. |

---

## 2. 🖼️ BẢN ĐỒ & ĐẶC TẢ GIAO DIỆN CỐT LÕI (CORE FLOW & WIREFRAMES)

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       LUỒNG KHẢO THÍ CỐT LÕI (4 BƯỚC CHUẨN UX)                                         │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                        │
│   [BƯỚC 1: KHÁM PHÁ & CHỌN ĐỀ] ──────► [BƯỚC 2: BẮT ĐẦU CA THI] ──────► [BƯỚC 3: PHÒNG THI ONLINE] ──► [BƯỚC 4: KẾT QUẢ]│
│   • Khách xem thoải mái                • Chưa login: Yêu cầu login      • Đề thi KaTeX chuẩn xác       • Điểm số & Đạt │
│   • Cây môn học & Lọc khối               (Lưu pendingQuizId để vào ngay)• 6 dạng câu hỏi tương tác     • Phân tích 4   │
│   • Xem mô tả, thời gian, số câu       • Đã login: Vào thẳng phòng thi  • Đánh dấu xem lại cờ 🚩         mức Bloom     │
│                                                                         • Lưu nháp ngầm 300ms          • Lời giải KaTeX│
│                                                                                  │                                     │
│                                                                                  ▼                                     │
│                                                                         [Modal Xác Nhận Nộp]                           │
│                                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 📚 BƯỚC 1: KHÁM PHÁ & CHỌN ĐỀ THI (`QuizStartView.tsx`)
*Mục tiêu: Người dùng/Khách vãng lai tự do khám phá danh mục đề thi, lọc khối lớp và tìm kiếm môn học mà không bị ép đăng nhập ngay.*

#### Bố cục Wireframe ASCII (Hỗ trợ cả Khách vãng lai & Học viên đã đăng nhập)
```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🎓 Hệ Thống Khảo Thí Trực Tuyến                        │ [Nếu là Khách: [ 🔐 Đăng nhập ] ]                                  │
│                                                        │ [Nếu đã Đăng nhập: 👤 Nguyễn Văn A (student@quiz.com) [▾] ]        │
├─────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────┤
│ 📚 CÂY MÔN HỌC & CHỦ ĐỀ            │ 📍 Breadcrumb: Toán học / Đại số / Đại số 10                                           │
│ ┌────────────────────────────────┐ │ 🏷️ H1: Đại số 10  [3 đề thi]                     [🔍 Tìm theo tên hoặc mã đề...  ✕]    │
│ │ 🔍 Tìm môn học, chủ đề...    ✕ │ ├────────────────────────────────────────────────────────────────────────────────────────┤
│ └────────────────────────────────┘ │ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ 🗂️ Tất cả môn học           (12)  │ │ 🎓 LỌC THEO KHỐI LỚP & CẤP HỌC                                                     │ │
│ 📁 Toán học                        │ │ [Tất cả khối lớp] │ [Tiểu học (1)]  [THCS (4)]  [THPT (7)]                         │ │
│   ├─ 📂 Đại số                     │ │ ────────────────────────────────────────────────────────────────────────────────── │ │
│   │   ├─ 📄 Đại số 10              │ │ [Lớp 10 (3)]  [Lớp 11 (2)]  [Lớp 12 (2)]                                           │ │
│   │   │   └─ 📄 PT bậc hai         │ │ ────────────────────────────────────────────────────────────────────────────────── │ │
│   │   └─ 📄 Hình học               │ │ [🏷️ Chủ đề: Đại số 10 ✕]  [🎓 Khối: Lớp 10 ✕]                     [Đặt lại bộ lọc] │ │
│ 📁 Tin học                         │ │ └────────────────────────────────────────────────────────────────────────────────────┘ │
│ 📁 Ngoại ngữ                       ├────────────────────────────────────────────────────────────────────────────────────────┤
│ 📁 Vật lý                          │ DANH SÁCH BÀI THI (Xem thoải mái thông tin khảo thí)                                   │
│                                    │ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│                                    │ │ 📝 KIỂM TRA GIỮA KỲ TOÁN 10                 [Chính thức]  [Đang mở]                │ │
│                                    │ │ Mô tả: Mệnh đề, tập hợp, bất phương trình và dấu của tam thức bậc hai...           │ │
│                                    │ │ ────────────────────────────────────────────────────────────────────────────────── │ │
│                                    │ │ 🏷️ Mã: EXAM_MATH10_MIDTERM  •  📂 Đại số 10  •  🎓 Lớp 10                          │ │
│                                    │ │ ⏱️ 45 phút  •  ❓ 20 câu hỏi  •  🎯 Điểm đạt: 5.0  •  🛡️ 3 lượt thi                 │ │
│                                    │ │                                                        [ 🚀 BẮT ĐẦU CA THI ]       │ │
│                                    │ └────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Quy chuẩn trải nghiệm
- **Khách xem tự do**: Người dùng chưa đăng nhập vẫn duyệt được cây môn học, lọc các lớp, tìm kiếm bài thi và đọc toàn bộ thông tin đề thi.
- **TopBar thích ứng**: 
  - Khách vãng lai: Hiển thị nút `[ 🔐 Đăng nhập ]` nổi bật ở góc phải.
  - Đã đăng nhập: Hiển thị tên học viên, email, avatar và menu hồ sơ / đăng xuất.
- **Bộ lọc khối lớp không nhãn thừa**: Các nút cấp học, khối lớp con và chip lọc hiển thị trực tiếp, không in chữ thừa ("Hàng 1, 2, 3", "Khối lớp:").

---

### 🔐 BƯỚC 2: BẮT ĐẦU CA THI & XÁC THỰC TÀI KHOẢN (THI THÌ ĐĂNG NHẬP)
*Mục tiêu: Khi người dùng bấm `[ 🚀 BẮT ĐẦU CA THI ]`, kiểm tra trạng thái đăng nhập.*

#### Kịch bản xử lý thông minh
1. **Trường hợp A: Người dùng ĐÃ ĐĂNG NHẬP**:
   - Nhấn `[ 🚀 BẮT ĐẦU CA THI ]` $\rightarrow$ Nút chuyển sang trạng thái loading xoay $\rightarrow$ Tạo ca thi trên Gateway $\rightarrow$ Chuyển thẳng vào phòng thi `QuizActiveView.tsx` (1-chạm mượt mà).
2. **Trường hợp B: Người dùng là KHÁCH (CHƯA ĐĂNG NHẬP)**:
   - Nhấn `[ 🚀 BẮT ĐẦU CA THI ]` $\rightarrow$ Hệ thống lưu mã đề vào bộ nhớ tạm (`pendingQuizId = quiz.id`).
   - Hiển thị màn hình hoặc modal đăng nhập nhanh:
     - Gợi ý sẵn tài khoản mẫu tiện lợi: `student@quiz.com` / `student123`.
     - Thông báo rõ ràng: *"Vui lòng đăng nhập để bắt đầu bài thi: [Tên đề thi]"*.
   - Sau khi đăng nhập thành công $\rightarrow$ Hệ thống **tự động kích hoạt ngay ca thi `pendingQuizId`** và đưa thí sinh thẳng vào phòng thi, **không bắt thí sinh phải tìm lại bài thi để bấm lần nữa**.

---

### ⏱️ BƯỚC 3: PHÒNG THI TRỰC TUYẾN CHUẨN XÁC (`QuizActiveView.tsx`)
*Mục tiêu: Đọc đề sắc nét với KaTeX, trả lời linh hoạt 6 dạng câu, đánh dấu cờ 🚩, lưu nháp tự động và nộp bài an toàn.*

#### Bố cục Wireframe ASCII
```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📝 Kiểm tra giữa kỳ Toán 10 (Mã ca: att_7f8a)   │ ⏱️ CÒN LẠI: 38:42 │ 🟢 Đã lưu │ Tiến độ: 8/20 câu│
├──────────────────────────────────────────────────────────────────┬───────────────────────────────┤
│ KHUNG HIỂN THỊ CÂU HỎI (2/3 màn hình)                            │ MỤC LỤC CÂU HỎI (1/3)         │
│                                                                  │                               │
│ ┌──────────────────────────────────────────────────────────────┐ │ ┌───────────────────────────┐ │
│ │ Câu 8 / 20  •  0.5 điểm      [ 🚩 Đánh dấu xem lại câu này ] │ │ │ [1]  [2]  [3]  [4]  [5]   │ │
│ ├──────────────────────────────────────────────────────────────┤ │ │ [6]  [7]  [8*] [9]  [10]  │ │
│ │ ĐỀ BÀI (KaTeX Rendering):                                    │ │ │ [11] [12] [13] [14] [15]  │ │
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

#### Hộp thoại cảnh báo duy nhất: Xác Nhận Nộp Bài (`SubmitConfirmModal.tsx`)
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
│ ❗ Sau khi nộp bài, bạn sẽ không thể chỉnh sửa đáp án được nữa.      │
├──────────────────────────────────────────────────────────────────────┤
│ [ ⬅️ Quay lại làm tiếp ]                    [ 🔴 XÁC NHẬN NỘP BÀI ]   │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 📊 BƯỚC 4: BẢNG ĐIỂM & KẾT QUẢ KHẢO THÍ (`QuizResultView.tsx`)
*Mục tiêu: Công bố điểm tức thì, đánh giá năng lực tư duy Bloom, đối soát đáp án và lời giải KaTeX chi tiết.*

#### Bố cục Wireframe ASCII
```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🎓 KẾT QUẢ KHẢO THÍ CHÍNH THỨC                                          [ 🏠 Về trang chủ ]      │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│    ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│    │ 🟢 KẾT QUẢ: ĐẠT YÊU CẦU (PASSED)                                                       │    │
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
│    📝 CHI TIẾT CÂU TRẢ LỜI & LỜI GIẢI (Có công thức KaTeX):                                      │
│    ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│    │ [✓ ĐÚNG] Câu 1: Giải phương trình $\sqrt{x-1} = 2$                                    │    │
│    │          • Bạn chọn: B. $x = 5$                                                        │    │
│    │          • Đáp án đúng: B. $x = 5$  (+0.5 điểm)                                        │    │
│    │          • Giải thích: Bình phương hai vế ta được $x - 1 = 4 \iff x = 5$.              │    │
│    └────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 🗺️ LỘ TRÌNH 5 GIAI ĐOẠN TINH GỌN (LEAN EXECUTION ROADMAP)

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            5 GIAI ĐOẠN TRIỂN KHAI CỐT LÕI (EPIC FW-1 -> FW-5)                    │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  [EPIC FW-1] Khám Phá Tự Do Cho Khách & Cơ Chế "Thi Thì Đăng Nhập" (Auth on Start)              │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-2] Tích Hợp Thư Viện KaTeX & Render Công Thức Toán Học Cho 6 Dạng Câu Hỏi             │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-3] Nâng Cấp Question Palette & Tính Năng Đánh Dấu Xem Lại (Flag 🚩)                    │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-4] Hộp Thoại Xác Nhận Nộp Bài & Phân Tích Phổ Điểm Bloom Tại Kết Quả                  │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-5] Kiểm Thử Toàn Trình, Độ Bền Mạng & Build Production                                │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 📋 DANH MỤC CÁC TASK THỰC THI (ACTIONABLE CHECKLIST)

---

### 🗂️ EPIC FW-1: Khám Phá Tự Do Cho Khách & Cơ Chế "Thi Thì Đăng Nhập" (Auth on Start)
*Mục tiêu: Cho phép khách xem thỏa mái danh mục bài thi và cây môn học; chỉ khi bấm vào thi mới yêu cầu đăng nhập và tự động vào ca thi.*

- [x] **Task FW-1.1**: Tinh gọn thanh `grade-facet-filter-bar` trong `QuizContentArea.tsx` *(Đã hoàn thành)*
  - Giữ nguyên khung chính `LỌC THEO KHỐI LỚP & CẤP HỌC`.
  - Hiển thị trực tiếp các nút bấm cấp học, khối lớp con và chip đang lọc.
  - Loại bỏ hoàn toàn các nhãn thừa ("Hàng 1", "Hàng 2", "Hàng 3", "Khối lớp:") để tiết kiệm tối đa diện tích.
- [x] **Task FW-1.2**: Mở khóa Chế độ Khách vãng lai (`Guest Browsing`) trong `App.tsx` & `TopBar.tsx` *(Đã hoàn thành)*
  - Không chặn `LoginView` ngay khi chưa đăng nhập. Mặc định cho phép người dùng vào ngay `QuizStartView`.
  - `TopBar.tsx`: Nếu `user === null`, hiển thị nút `[ 🔐 Đăng nhập ]` tiện lợi ở góc phải thay vì menu hồ sơ. Bấm nút có thể chủ động mở màn hình đăng nhập.
- [x] **Task FW-1.3**: Triển khai cơ chế "Thi Thì Đăng Nhập" (Auth On Start Flow) trong `App.tsx` *(Đã hoàn thành)*
  - Khi người dùng bấm `[ 🚀 BẮT ĐẦU CA THI ]`:
    - Nếu đã đăng nhập $\rightarrow$ Gọi API tạo ca thi và vào thẳng phòng thi `QuizActiveView.tsx`.
    - Nếu CHƯA đăng nhập $\rightarrow$ Lưu lại `pendingQuizId`, chuyển sang màn hình `LoginView` (hoặc modal đăng nhập) kèm thông báo: *"Vui lòng đăng nhập để bắt đầu ca thi bạn đã chọn"*.
    - Ngay khi đăng nhập thành công $\rightarrow$ Tự động kích hoạt ca thi `pendingQuizId` và đưa thí sinh vào phòng thi ngay lập tức.
- [x] **Task FW-1.4**: Tinh gọn nút `[ 🚀 BẮT ĐẦU CA THI ]` trong `QuizContentArea.tsx` *(Đã hoàn thành)*
  - Gắn nút `[ 🚀 Bắt đầu ca thi ]` 1-chạm trực tiếp trên mỗi thẻ bài thi.
  - Bổ sung hiệu ứng loading spinner và nhãn thích ứng (`BẮT ĐẦU VÀO CA THI` / `ĐĂNG NHẬP & BẮT ĐẦU THI`).

---


### 🚩 EPIC FW-3: Question Palette đơn giản như codebase hiện tại
*Mục tiêu: chức năng cơ bản nhất 

---

### 📊 EPIC FW-4: Hộp Thoại Nộp Bài 
*Mục tiêu: chức năng cơ bản nhất
  - Hai nút hành động rõ ràng: *"Quay lại làm tiếp"* (Secondary) và *"Xác nhận nộp bài"* (Danger/Primary).
---

### 🧪 EPIC FW-5: Kiểm Thử Toàn Trình, Độ Bền Mạng & Nghiệm Thu
*Mục tiêu: Đảm bảo 100% tính năng hoạt động mượt mà không có lỗi runtime hay vỡ giao diện.*

---

## 5. 🎯 QUY TẮC THỰC THI

1. **Một việc tại một thời điểm**: Thực hiện tuần tự từng task từ `Task FW-1.2` đến `Task FW-5.3`.
2. **Kiểm tra ngay sau mỗi task**: Xác minh tính toàn vẹn (compile/lint) để đảm bảo không có lỗi phát sinh.
3. **Cập nhật Checklist**: Chuyển `- [ ]` thành `- [x]` ngay khi hoàn thành mỗi task.
4. **Kết nối API thực**: Sử dụng 100% API thực tế của Gateway (Port 3000), không dùng dữ liệu giả lập.
