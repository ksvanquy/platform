# 💻 Quiz Frontend (Standalone Client)

Ứng dụng Frontend độc lập dành cho thí sinh làm bài thi trắc nghiệm trực tuyến, kết nối với **Quiz Core Backend Engine**.

---

## 🚀 Tính Năng Nổi Bật

1. **Kiến trúc Registry Pattern (`QuestionRegistry`)**: Hỗ trợ 6 dạng câu hỏi linh hoạt (`SINGLE`, `MULTIPLE`, `FILL_IN`, `MATCHING`, `ORDERING`, `NUMERIC`) với component độc lập.
2. **Debounced Autosave (Optimistic UI)**: Tự động lưu bài sau 300ms, hiển thị trạng thái lưu trực quan (Đang lưu / Đã lưu / Lỗi).
3. **Đồng hồ đếm ngược Server-Authoritative**: Đồng bộ thời gian với Server Time, tự động đổi màu cảnh báo khi còn dưới 2 phút và dưới 30 giây, tự động nộp bài khi hết giờ.
4. **Mục lục câu hỏi thông minh (`QuestionPalette`)**: Theo dõi tiến độ câu hỏi (Đang làm, Đã trả lời, Chưa làm) và chuyển câu hỏi nhanh chóng.
5. **Màn hình kết quả tổng kết trực quan (`ScoreSummaryCard` & `QuestionFeedbackList`)**: Tổng điểm, tỷ lệ %, huy hiệu Đạt/Không đạt và chi tiết từng câu hỏi.

---

## 🛠️ Hướng Dẫn Tách Và Chạy Riêng (Standalone Setup)

### Bước 1: Sao chép thư mục `quiz-frontend` ra ngoài dự án mới
```bash
cp -r quiz-frontend /duong-dan/den/project-moi/
cd /duong-dan/den/project-moi/
```

### Bước 2: Cài đặt thư viện dependencies
```bash
npm install
```

### Bước 3: Khởi chạy môi trường phát triển (Dev Server)
```bash
npm run dev
```
Mặc định ứng dụng sẽ chạy tại cổng `http://localhost:5173` và tự động proxy các request `/api/*` về Backend `http://localhost:3000`.

### Bước 4: Đóng gói sản phẩm (Production Build)
```bash
npm run build
```
Mã nguồn tĩnh hoàn chỉnh sẽ được tạo trong thư mục `dist/`.
