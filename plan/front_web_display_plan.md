# 🎨 KẾ HOẠCH THIẾT KẾ & TRIỂN KHAI FRONT-WEB (CORE-FOCUSED PLAN)
### Tối Ưu Hóa Trải Nghiệm Khảo Thí Cốt Lõi Thí Sinh (`apps/quiz-web`)
**React 19 • Tailwind CSS • Unified Gateway (Port 3000) • Khám Phá Tự Do (Guest Browsing) • Tập Trung Nghiệp Vụ Khảo Thí Cốt Lõi**

> 🚦 **QUY TRÌNH KHẢO THÍ CỐT LÕI (4 BƯỚC ĐỒNG BỘ CODEBASE)**:  
> **Bước 1: Khám phá & Chọn đề (Khách xem thoải mái, không chặn đăng nhập)** $\longrightarrow$ **Bước 2: Thi thì Đăng nhập (1-Chạm kích hoạt, ghi nhớ đề thi)** $\longrightarrow$ **Bước 3: Phòng thi Online (Đồng hồ đồng bộ, Autosave, 6 dạng câu hỏi, Palette điều hướng) $\rightarrow$ Modal nộp bài an toàn** $\longrightarrow$ **Bước 4: Bảng điểm & Kết quả khảo thí chi tiết**.  
> *Đã loại bỏ toàn bộ phần mở rộng không cần thiết (KaTeX, gắn cờ phức tạp, phân tích phổ Bloom) để bám sát 100% cấu trúc thực tế của codebase.*

---

## 1. 🔍 BẢNG ĐỐI SOÁT KIẾN TRÚC CỐT LÕI (CORE ARCHITECTURE MATRIX)

| STT | Khối Chức Năng Cốt Lõi | Hiện trạng trong Codebase (`apps/quiz-web`) | Tình Trạng Triển Khai |
|:---:|---|---|---|
| **1** | **Khám Phá & Chọn Đề (Guest Mode)** | `App.tsx` & `QuizStartView.tsx`: Cho phép khách vãng lai tự do duyệt môn học, lọc lớp, xem thông tin đề. | ✅ **Đã hoàn thành (FW-1.2)** |
| **2** | **Bộ Lọc Khối Lớp Tinh Gọn** | `TaxonomyTreeSidebar.tsx` và thanh lọc 2D trong `QuizContentArea.tsx` trực quan, không chữ thừa. | ✅ **Đã hoàn thành (FW-1.1)** |
| **3** | **Thi Thì Đăng Nhập (Auth on Start)** | Khi bấm `[ 🚀 BẮT ĐẦU CA THI ]`, nếu chưa đăng nhập sẽ ghi nhớ `pendingQuizId`, đăng nhập xong tự động vào thi ngay. | ✅ **Đã hoàn thành (FW-1.3, FW-1.4)** |
| **4** | **Đồng Hồ Máy Chủ & Lưu Nháp** | `TimeSyncManager.ts` (Cristian), `QuizTimer.tsx`, `useQuizSession.ts` (debounce 300ms, queue flush tự động). | ✅ **Đã hoàn thành** |
| **5** | **6 Dạng Câu Hỏi Khảo Thí** | 6 components thuần React/Tailwind: `SingleChoice`, `MultipleChoice`, `FillIn`, `Matching`, `Numeric`, `Ordering`. | ✅ **Đã hoàn thành** (Hiển thị văn bản chuẩn, không phụ thuộc thư viện ngoài) |
| **6** | **Mục Lục Câu Hỏi (Question Palette)** | `QuestionPalette.tsx`: Hiển thị lưới câu hỏi trực quan với 3 trạng thái: Đang làm, Đã trả lời, Chưa làm. | ✅ **Đã hoàn thành** |
| **7** | **Hộp Thoại Xác Nhận Nộp Bài** | `QuizFooter.tsx`: Modal xác nhận nộp bài, thống kê số câu chưa làm, cảnh báo đóng băng phiên thi. | ✅ **Đã hoàn thành** |
| **8** | **Bảng Điểm & Kết Quả Khảo Thí** | `ScoreSummaryCard.tsx` (Điểm, tỷ lệ %, Đạt/Chưa đạt) + `QuestionFeedbackList.tsx` (Chi tiết từng câu). | ✅ **Đã hoàn thành** |

---

## 2. 🖼️ BẢN ĐỒ & ĐẶC TẢ GIAO DIỆN CỐT LÕI (CORE FLOW & WIREFRAMES)

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       LUỒNG KHẢO THÍ CỐT LÕI (4 BƯỚC CHUẨN UX)                                         │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                        │
│   [BƯỚC 1: KHÁM PHÁ & CHỌN ĐỀ] ──────► [BƯỚC 2: BẮT ĐẦU CA THI] ──────► [BƯỚC 3: PHÒNG THI ONLINE] ──► [BƯỚC 4: KẾT QUẢ]│
│   • Khách duyệt đề tự do               • Chưa login: Yêu cầu login      • Đồng hồ Cristian chuẩn xác   • Điểm số & Đạt │
│   • Cây môn học & Bộ lọc lớp             (Lưu pendingQuizId vào ngay)   • 6 dạng câu hỏi tương tác     • Tỷ lệ % đúng  │
│   • Xem thời gian, số câu, điểm đạt    • Đã login: Vào thẳng phòng thi  • Mục lục câu hỏi (Palette)    • Chi tiết từng │
│                                                                         • Tự động lưu nháp 300ms         câu & ghi chú │
│                                                                                  │                                     │
│                                                                                  ▼                                     │
│                                                                         [Modal Xác Nhận Nộp]                           │
│                                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 📚 BƯỚC 1: KHÁM PHÁ & CHỌN ĐỀ THI (`QuizStartView.tsx`)
*Mục tiêu: Cho phép người dùng và khách vãng lai tự do khám phá danh mục đề thi, lọc khối lớp và tìm kiếm môn học mà không bị ép đăng nhập.*

#### Bố cục Wireframe ASCII
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
│ 📁 Vật lý                          │ DANH SÁCH BÀI THI (Xem thông tin khảo thí)                                             │
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

---

### 🔐 BƯỚC 2: BẮT ĐẦU CA THI & XÁC THỰC TÀI KHOẢN (THI THÌ ĐĂNG NHẬP)
*Mục tiêu: Đảm bảo trải nghiệm liền mạch khi bắt đầu làm bài.*

1. **Người dùng ĐÃ ĐĂNG NHẬP**:
   - Nhấn `[ 🚀 BẮT ĐẦU CA THI ]` $\rightarrow$ Nút chuyển loading xoay $\rightarrow$ Gọi API tạo ca thi $\rightarrow$ Vào thẳng phòng thi `QuizActiveView.tsx`.
2. **Người dùng là KHÁCH (CHƯA ĐĂNG NHẬP)**:
   - Nhấn `[ 🚀 BẮT ĐẦU CA THI ]` $\rightarrow$ Hệ thống lưu mã đề vào bộ nhớ tạm (`pendingQuizId = quiz.id`).
   - Hiển thị màn hình đăng nhập `LoginView.tsx`:
     - Thông báo rõ ràng: *"Vui lòng đăng nhập để bắt đầu ca thi bạn đã chọn"*.
     - Cung cấp sẵn thông tin tài khoản mẫu (`student@quiz.com` / `student123`).
   - Sau khi đăng nhập thành công $\rightarrow$ Hệ thống tự động kích hoạt ca thi `pendingQuizId` và đưa thí sinh vào phòng thi ngay lập tức.

---

### ⏱️ BƯỚC 3: PHÒNG THI TRỰC TUYẾN CHUẨN XÁC (`QuizActiveView.tsx`)
*Mục tiêu: Giao diện thi tập trung, hiển thị câu hỏi rõ ràng, đồng hồ đếm ngược chính xác, lưu nháp tự động và nộp bài an toàn.*

#### Bố cục Wireframe ASCII
```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📝 Kiểm tra giữa kỳ Toán 10 (Mã ca: att_7f8a)   │ ⏱️ CÒN LẠI: 38:42 │ 🟢 Đã lưu │ Tiến độ: 8/20 câu│
├──────────────────────────────────────────────────────────────────┬───────────────────────────────┤
│ KHUNG HIỂN THỊ CÂU HỎI (2/3 màn hình)                            │ MỤC LỤC CÂU HỎI (1/3)         │
│                                                                  │                               │
│ ┌──────────────────────────────────────────────────────────────┐ │ ┌───────────────────────────┐ │
│ │ Câu 8 / 20  •  0.5 điểm                                      │ │ │ [1]  [2]  [3]  [4]  [5]   │ │
│ ├──────────────────────────────────────────────────────────────┤ │ │ [6]  [7]  [8*] [9]  [10]  │ │
│ │ ĐỀ BÀI:                                                      │ │ │ [11] [12] [13] [14] [15]  │ │
│ │ Cho tam thức bậc hai f(x) = ax^2 + bx + c (a khác 0).        │ │ │ [16] [17] [18] [19] [20]  │ │
│ │ Điều kiện cần và đủ để f(x) > 0 với mọi x thuộc R là gì?     │ │ └───────────────────────────┘ │
│ │                                                              │ │                               │
│ │ CÁC PHƯƠNG ÁN LỰA CHỌN:                                      │ │ 🎨 CHÚ THÍCH TRẠNG THÁI:      │
│ │ ┌──────────────────────────────────────────────────────────┐ │ │ 🔵 Xanh: Đang làm (Câu 8)   │
│ │ │ ( ) A. a > 0 và Delta > 0                                │ │ │ 🟢 Lục: Đã trả lời (7 câu)  │
│ │ ├──────────────────────────────────────────────────────────┤ │ │ ⚪ Xám: Chưa làm (12 câu)   │
│ │ │ (*) B. a > 0 và Delta < 0  (Đang chọn)                   │ │ └───────────────────────────┘ │
│ │ ├──────────────────────────────────────────────────────────┤ │                               │
│ │ │ ( ) C. a < 0 và Delta < 0                                │ │                               │
│ │ ├──────────────────────────────────────────────────────────┤ │                               │
│ │ │ ( ) D. a > 0 và Delta <= 0                               │ │                               │
│ │ └──────────────────────────────────────────────────────────┘ │                               │
│ └──────────────────────────────────────────────────────────────┘ │                               │
├──────────────────────────────────────────────────────────────────┴───────────────────────────────┤
│ [ ⬅️ Câu trước ]                     Câu 8 / 20                      [ Câu tiếp ➡️ ] [ 🟢 NỘP BÀI ]│
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Hộp thoại cảnh báo nộp bài (`QuizFooter.tsx`)
```text
┌──────────────────────────────────────────────────────────────────────┐
│ ⚠️ XÁC NHẬN NỘP BÀI THI                                          [X] │
├──────────────────────────────────────────────────────────────────────┤
│ Bạn có chắc chắn muốn kết thúc và nộp bài thi này?                   │
│ Sau khi nộp bài, phiên thi sẽ được đóng băng hoàn toàn.             │
│                                                                      │
│ ⚠️ Bạn còn 2 câu chưa trả lời. Bạn có chắc chắn muốn nộp lúc này?    │
├──────────────────────────────────────────────────────────────────────┤
│ [ Tiếp tục làm bài ]                           [ Đồng ý nộp bài ]    │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 📊 BƯỚC 4: BẢNG ĐIỂM & KẾT QUẢ KHẢO THÍ (`QuizResultView.tsx`)
*Mục tiêu: Đánh giá điểm số tức thì, hiển thị rõ ràng tỷ lệ đúng, trạng thái Đạt/Chưa đạt và chi tiết điểm từng câu hỏi.*

#### Bố cục Wireframe ASCII
```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🎓 KẾT QUẢ KHẢO THÍ CHÍNH THỨC                                          [ 🏠 Về trang chủ ]      │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│    ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│    │ 🎉 CHÚC MỪNG: BẠN ĐÃ ĐẠT BÀI THI (PASSED)                                              │    │
│    │        ĐIỂM SỐ:  8.5 / 10.0 điểm            TỶ LỆ CHÍNH XÁC: 85%                       │    │
│    └────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                  │
│    📋 CHI TIẾT ĐIỂM SỐ TỪNG CÂU:                                                             │
│    ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│    │ [✓ Chính xác] Câu 1: Tìm nghiệm của phương trình căn(x-1) = 2                          │    │
│    │               Điểm: 0.5 / 0.5đ                                                         │    │
│    │ ────────────────────────────────────────────────────────────────────────────────────── │    │
│    │ [✗ Chưa đúng] Câu 2: Xác định tập hợp các số thực x thoả mãn điều kiện...              │    │
│    │               Điểm: 0.0 / 0.5đ                                                         │    │
│    └────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 🗺️ LỘ TRÌNH 5 GIAI ĐOẠN CỐT LÕI (LEAN ROADMAP)

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             5 GIAI ĐOẠN TRIỂN KHAI CỐT LÕI (FW-1 -> FW-5)                        │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  [EPIC FW-1] Khám Phá Tự Do Cho Khách & Cơ Chế "Thi Thì Đăng Nhập" (Auth on Start)              │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-2] Phòng Thi Trực Tuyến & 6 Dạng Câu Hỏi Khảo Thí (Core Question Registry)             │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-3] Bảng Mục Lục Câu Hỏi (Question Palette - Đang làm, Đã làm, Chưa làm)                │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-4] Hộp Thoại Nộp Bài An Toàn & Đóng Băng Phiên Thi                                     │
│       │                                                                                          │
│       ▼                                                                                          │
│  [EPIC FW-5] Bảng Điểm, Kết Quả Khảo Thí & Kiểm Thử Toàn Trình                                   │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 📋 DANH MỤC CÁC TASK THỰC THI (ACTIONABLE CHECKLIST)

---

### 🗂️ EPIC FW-1: Khám Phá Tự Do Cho Khách & Cơ Chế "Thi Thì Đăng Nhập" (Auth on Start)
*Mục tiêu: Cho phép khách xem thoải mái danh mục bài thi và cây môn học; chỉ khi bấm vào thi mới yêu cầu đăng nhập và tự động vào thẳng ca thi.*

- [x] **Task FW-1.1**: Tinh gọn thanh lọc khối lớp trong `QuizContentArea.tsx` *(Đã hoàn thành)*
  - Hiển thị trực tiếp các nút chọn cấp học, khối lớp con và chip đang lọc.
  - Loại bỏ các nhãn chữ thừa không cần thiết.
- [x] **Task FW-1.2**: Mở khóa Chế độ Khách vãng lai (`Guest Browsing`) trong `App.tsx` & `TopBar.tsx` *(Đã hoàn thành)*
  - Khách vãng lai vào thẳng màn hình khám phá đề thi `QuizStartView.tsx`.
  - `TopBar.tsx` hiển thị nút `[ 🔐 Đăng nhập ]` tiện lợi khi chưa đăng nhập.
- [x] **Task FW-1.3**: Triển khai cơ chế "Thi Thì Đăng Nhập" (Auth On Start Flow) trong `App.tsx` *(Đã hoàn thành)*
  - Ghi nhớ `pendingQuizId` khi khách bấm nút thi.
  - Đăng nhập xong tự động kích hoạt ca thi và vào phòng thi ngay lập tức.
- [x] **Task FW-1.4**: Nút bấm thi thích ứng trên thẻ đề thi *(Đã hoàn thành)*
  - Nút `[ 🚀 Bắt đầu ca thi ]` 1-chạm tích hợp trực tiếp trên từng thẻ bài thi.

---

### 📝 EPIC FW-2: Phòng Thi Trực Tuyến & 6 Dạng Câu Hỏi Khảo Thí (Core Runner)
*Mục tiêu: Hiển thị câu hỏi rõ nét bằng chữ thuần phong cách Tailwind, không phụ thuộc thư viện render toán học cồng kềnh.*

- [x] **Task FW-2.1**: Đảm bảo 6 dạng câu hỏi hoạt động ổn định và chính xác:
  - `SingleChoiceQuestion.tsx`: Chọn một đáp án duy nhất (radio style).
  - `MultipleChoiceQuestion.tsx`: Chọn nhiều đáp án (checkbox style).
  - `FillInQuestion.tsx`: Điền từ / cụm từ vào chỗ trống.
  - `MatchingQuestion.tsx`: Ghép đôi hai vế tương ứng.
  - `NumericQuestion.tsx`: Nhập giá trị số học chính xác.
  - `OrderingQuestion.tsx`: Kéo / chuyển vị trí thứ tự mệnh đề.
- [x] **Task FW-2.2**: Cơ chế đồng bộ đồng hồ máy chủ Cristian (`TimeSyncManager.ts` & `QuizTimer.tsx`).
- [x] **Task FW-2.3**: Cơ chế lưu nháp câu trả lời tự động (`useQuizSession.ts` debounce 300ms với queue flush an toàn).

---

### 🚩 EPIC FW-3: Bảng Mục Lục Câu Hỏi (Question Palette Đơn Giản)
*Mục tiêu: Cung cấp giao diện bảng số câu hỏi tinh gọn theo đúng codebase hiện tại.*

- [x] **Task FW-3.1**: Hiển thị bảng số câu hỏi trực quan trong `QuestionPalette.tsx`:
  - 🔵 *Xanh dương*: Câu đang được hiển thị.
  - 🟢 *Xanh lục*: Câu đã trả lời.
  - ⚪ *Xám*: Câu chưa làm.
- [x] **Task FW-3.2**: Chuyển câu hỏi 1-chạm khi nhấn vào số câu tương ứng.

---

### 📊 EPIC FW-4: Hộp Thoại Nộp Bài An Toàn & Đóng Băng Phiên Thi
*Mục tiêu: Tránh nộp nhầm và thông báo rõ ràng trước khi đóng phiên thi.*

- [x] **Task FW-4.1**: Modal xác nhận nộp bài trong `QuizFooter.tsx`:
  - Cảnh báo số lượng câu hỏi chưa trả lời (nếu có).
  - Nút *"Tiếp tục làm bài"* và *"Đồng ý nộp bài"*.
- [x] **Task FW-4.2**: Đóng băng phiên thi và ngăn chỉnh sửa sau khi đã gửi lệnh nộp.

---

### 🧪 EPIC FW-5: Bảng Điểm, Đánh Giá Kết Quả & Nghiệm Thu
*Mục tiêu: Hiển thị kết quả đánh giá minh bạch, rõ ràng theo đúng dữ liệu trả về từ Gateway.*

- [x] **Task FW-5.1**: Hiển thị tổng điểm và huy hiệu Đạt/Chưa đạt tại `ScoreSummaryCard.tsx`.
- [x] **Task FW-5.2**: Hiển thị chi tiết điểm số từng câu tại `QuestionFeedbackList.tsx`.
- [x] **Task FW-5.3**: Kiểm tra tuân thủ Type-check và Build Production cho toàn bộ workspace.

---

## 5. 🎯 QUY TẮC THỰC THI

1. **Bám sát Codebase Hiện Tại**: Giữ nguyên kiến trúc React 19 + Tailwind CSS gọn nhẹ, không thêm các thư viện bên thứ ba không cần thiết.
2. **Kiểm Tra Tính Toàn Vẹn**: Chạy `compile_applet` để xác nhận toàn bộ ứng dụng build thành công.
3. **Kết Nối API Thực**: Sử dụng API thực tế của Gateway (Port 3000), không dùng mock giả lập.
