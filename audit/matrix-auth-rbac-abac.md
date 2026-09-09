# MA TRẬN PHÂN QUYỀN API & KIỂM SOÁT SỞ HỮU (ACCESS CONTROL MATRIX)
## (ENDPOINTS, ROLES, PERMISSIONS & ABAC RULES MAPPING)

Tài liệu này cung cấp bảng tra cứu chi tiết toàn bộ các điểm cuối API (Endpoints) trong hệ sinh thái Microservices của hệ thống thi trắc nghiệm, bao gồm: giao thức, vai trò yêu cầu, quyền hạn bắt buộc, kiểm tra sở hữu tài nguyên (ABAC) và biện pháp phòng chống rủi ro bảo mật tương ứng.

---

## 1. DỊCH VỤ XÁC THỰC & ĐỊNH DANH (AUTH SERVICE - `/v1/auth`)

| HTTP | Đường dẫn (Route) | Quyền truy cập (Role / Perm) | Kiểm tra Nghiệp vụ / ABAC | Biện pháp Bảo mật & Chống Tấn công |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/v1/auth/register` | Public (Không yêu cầu) | Kiểm tra Email duy nhất, Mật khẩu tối thiểu 8 ký tự | Ngăn chặn đăng ký trùng lặp, băm mật khẩu bằng Bcrypt. |
| `POST` | `/v1/auth/login` | Public (Không yêu cầu) | So khớp mật khẩu đã băm, kiểm tra `isActive` | **LoginRateLimiter**: Khóa IP sau 5 lần thất bại liên tiếp trong 15 phút (`429 Too Many Requests`). |
| `POST` | `/v1/auth/refresh` | Public (Kèm Refresh Token) | Tìm kiếm SHA-256 Hash của token trong DB | **Token Reuse Detection & Family Revocation**: Thu hồi toàn bộ token trong chuỗi gia đình nếu phát hiện tái sử dụng. |
| `POST` | `/v1/auth/logout` | Authenticated (Hoặc gửi token) | Tìm và đánh dấu `is_revoked = true` cho token | Vô hiệu hóa phiên làm việc ngay lập tức, xóa Cookie. |
| `GET` | `/v1/auth/me` | Authenticated (`requireAuth`) | `principal.id` từ Access Token | Trả về thông tin User Profile an toàn (loại bỏ `passwordHash`). |

---

## 2. DỊCH VỤ QUẢN LÝ NGƯỜI DÙNG & VAI TRÒ ADMIN (`/v1/auth/admin/*`)

| HTTP | Đường dẫn (Route) | Quyền truy cập (Role / Perm) | Kiểm tra Nghiệp vụ / ABAC | Biện pháp Bảo mật & Chống Tấn công |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/v1/auth/admin/users` | `ADMIN`, `SUPER_ADMIN` hoặc `admin:manage_users` | Chỉ quản trị viên mới được liệt kê danh sách tài khoản | RBAC Gatekeeper chặn người dùng bình thường (`STUDENT`, `INSTRUCTOR`). |
| `POST` | `/v1/auth/admin/users` | `ADMIN`, `SUPER_ADMIN` | Khởi tạo tài khoản quản trị/giảng viên mới | Kiểm tra tính hợp lệ của Roles gán mới. |
| `GET` | `/v1/auth/admin/users/:id`| `ADMIN`, `SUPER_ADMIN` | Xem chi tiết thông tin và phân quyền tài khoản | Trả về thông tin Profile kèm Effective Permissions. |
| `PATCH`| `/v1/auth/admin/users/:id/roles` | `ADMIN`, `SUPER_ADMIN` | Gán hoặc thu hồi vai trò của người dùng | Đồng bộ hóa lại bảng quan hệ `user_roles`. |
| `PATCH`| `/v1/auth/admin/users/:id/status`| `ADMIN`, `SUPER_ADMIN` | Bật/Tắt trạng thái kích hoạt (`isActive`) | **Instant Account Lockdown**: Ngăn chặn tài khoản bị khóa tiếp tục gọi API. |

---

## 3. DỊCH VỤ CA THI & PHIÊN LÀM BÀI (ATTEMPT SERVICE - `/v1/attempts`)

| HTTP | Đường dẫn (Route) | Quyền truy cập (Role / Perm) | Kiểm tra Nghiệp vụ / ABAC | Biện pháp Bảo mật & Chống Tấn công |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/v1/attempts` | `STUDENT`, `INSTRUCTOR`, `ADMIN` (`quiz:start`) | **Tạo hoặc Phục hồi phiên**: Thí sinh tạo ca thi mới gắn liền với `principal.id`. Phục hồi ca thi dở dang nếu cùng `userId`. | Ngăn chặn việc tạo vô hạn ca thi chưa nộp; gán cố định quyền sở hữu cho người tạo. |
| `POST` | `/v1/attempts/:id/start` | `STUDENT` hoặc Chủ sở hữu | `attempt.userId === principal.id \|\| isAdmin` | Khởi động đồng hồ đếm ngược phía server (Server-Authoritative Clock). |
| `GET` | `/v1/attempts/:id` | `STUDENT` (chủ sở hữu), `INSTRUCTOR`, `ADMIN` | **Kiểm tra Sở hữu**: Thí sinh chỉ được xem bài của mình. Giảng viên/Admin được xem để giám sát. | **Sanitized Manifest**: Loại bỏ đáp án đúng khỏi gói đề thi gửi xuống thí sinh. |
| `POST` | `/v1/attempts/:id/answers` | `STUDENT` (chủ sở hữu) hoặc `ADMIN` | **Kiểm tra Sở hữu & Deadline**: `attempt.userId === principal.id`. Kiểm tra FSM (phải là `IN_PROGRESS`), kiểm tra Grace Period (15s). | **Anti-Tampering**: Kiểm tra Sequence Number chống tráo gói tin cũ; từ chối khi hết giờ thi. |
| `PUT` | `/v1/attempts/:id/answers/:questionId` | `STUDENT` (chủ sở hữu) hoặc `ADMIN` | **Autosave SLA < 25ms**: Cập nhật câu trả lời kèm `sequenceNumber`. | Bảo vệ tính toàn vẹn dữ liệu và quyền sở hữu ca thi. |
| `POST` | `/v1/attempts/:id/events` | `STUDENT` (chủ sở hữu) | Ghi nhận sự kiện telemetry chống gian lận (`TAB_SWITCH`, `FULLSCREEN_EXIT`). | Gắn nhãn `clientTimestamp` và `serverTimestamp` phát hiện hành vi gian lận. |
| `GET` | `/v1/attempts/:id/events` | `INSTRUCTOR`, `ADMIN` | Xem lịch sử nhật ký giám sát ca thi | Thí sinh thường không được tự xem log giám sát thi của mình. |
| `POST` | `/v1/attempts/:id/submit` | `STUDENT` (chủ sở hữu) hoặc `ADMIN` | **Nộp bài thi**: Chuyển trạng thái sang `SUBMITTED`, đóng băng câu trả lời, kích hoạt bộ chấm điểm tự động. | Không cho phép chỉnh sửa sau khi đã nộp bài (`FSM Violation Guard`). |
| `GET` | `/v1/attempts` | `STUDENT`, `INSTRUCTOR`, `ADMIN` | **Lọc danh sách theo quyền**: Thí sinh chỉ thấy danh sách bài của mình (`userId = principal.id`). Admin thấy tất cả. | Chống rò rỉ danh sách bài thi của các thí sinh khác. |

---

## 4. DỊCH VỤ ĐỀ THI & BIẾN THỂ (EXAM SERVICE - `/v1/exams`)

| HTTP | Đường dẫn (Route) | Quyền truy cập (Role / Perm) | Kiểm tra Nghiệp vụ / ABAC | Biện pháp Bảo mật & Chống Tấn công |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/v1/exams` | Public (cho đề Published) / Authenticated | Nếu chưa đăng nhập: chỉ thấy đề thi công khai (`status = PUBLISHED`). Giảng viên thấy đề của mình tạo. | Lọc dữ liệu theo trạng thái xuất bản và quyền sở hữu. |
| `GET` | `/v1/exams/:id` | Authenticated | Thí sinh xem đề thi đã làm sạch. Tác giả/Admin xem cấu trúc chi tiết. | Bảo vệ ma trận đề thi gốc và ngân hàng biến thể. |
| `POST` | `/v1/exams` | `INSTRUCTOR`, `ADMIN` (`quiz:create`) | Chỉ Giảng viên hoặc Quản trị viên được tạo đề thi | Chặn học viên khởi tạo đề thi trên hệ thống. |
| `PUT` | `/v1/exams/:id` | `INSTRUCTOR` (tác giả) hoặc `ADMIN` | **Kiểm tra Tác giả**: `exam.authorId === principal.id \|\| isAdmin` | Ngăn chặn giảng viên khác sửa đề thi không thuộc phạm vi quản lý. |
| `DELETE`| `/v1/exams/:id` | `INSTRUCTOR` (tác giả) hoặc `ADMIN` | Không cho phép xóa đề thi khi đã có ca thi đang thực hiện | Bảo vệ tính toàn vẹn dữ liệu lịch sử thi cử. |
| `POST` | `/v1/exams/:id/publish`| `INSTRUCTOR` (tác giả) hoặc `ADMIN` | Kiểm tra đề thi đã có ít nhất 1 biến thể hợp lệ và câu hỏi được nghiệm thu | Đảm bảo chất lượng đề thi trước khi mở cho học viên. |
| `POST` | `/v1/exams/:id/variants`| `INSTRUCTOR`, `ADMIN` | Sinh các mã đề hoán vị câu hỏi / đáp án (Shuffling) | Lưu trữ Snapshot bất biến phục vụ chấm thi công bằng. |

---

## 5. DỊCH VỤ ĐÁNH GIÁ (ASSESSMENT SERVICE - `/v1/assessments`)

| HTTP | Đường dẫn (Route) | Quyền truy cập (Role / Perm) | Kiểm tra Nghiệp vụ / ABAC | Biện pháp Bảo mật & Chống Tấn công |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/v1/assessments` | Authenticated | Học viên chỉ xem bài đã `PUBLISHED`; Tác giả xem bản nháp của mình | Phân tách không gian xem theo vai trò và trạng thái vòng đời. |
| `POST` | `/v1/assessments` | `INSTRUCTOR`, `ADMIN` | Khởi tạo ma trận kiến thức bài đánh giá | Ràng buộc tác giả với `principal.id`. |
| `PUT` | `/v1/assessments/:id/blueprint` | `INSTRUCTOR` (tác giả) hoặc `ADMIN` | Chỉ cho phép chỉnh sửa blueprint khi ở trạng thái `DRAFT` | Ngăn chặn sửa đổi tiêu chí đánh giá khi kỳ thi đang diễn ra. |
| `PATCH`| `/v1/assessments/:id/status` | `INSTRUCTOR` (tác giả) hoặc `ADMIN` | Chuyển đổi trạng thái `DRAFT` -> `PUBLISHED` -> `ARCHIVED` | Kiểm soát vòng đời bài đánh giá nghiêm ngặt. |

---

## 6. DỊCH VỤ NGÂN HÀNG CÂU HỎI (QUESTION SERVICE - `/v1/questions`)

| HTTP | Đường dẫn (Route) | Quyền truy cập (Role / Perm) | Kiểm tra Nghiệp vụ / ABAC | Biện pháp Bảo mật & Chống Tấn công |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/v1/questions` | `INSTRUCTOR`, `ADMIN` | Quản lý ngân hàng câu hỏi | Thí sinh tuyệt đối không được truy cập trực tiếp ngân hàng câu hỏi gốc. |
| `POST` | `/v1/questions` | `INSTRUCTOR`, `ADMIN` | Khởi tạo câu hỏi, đáp án, giải thích chi tiết | Ghi nhận tác giả tạo câu hỏi (`authorId`). |
| `PUT` | `/v1/questions/:id` | `INSTRUCTOR` (tác giả) hoặc `ADMIN` | Tạo Revision mới (Bất biến phiên bản cũ) | Không ghi đè trực tiếp câu hỏi đã được dùng trong đề thi trước đó. |
| `GET` | `/v1/questions/:id/revisions`| `INSTRUCTOR`, `ADMIN` | Xem lịch sử các phiên bản sửa đổi | Audit Trail truy vết người sửa và nội dung sửa. |

---

## 7. DỊCH VỤ PHÂN LOẠI & DANH MỤC (TAXONOMY SERVICE - `/v1/taxonomies`)

| HTTP | Đường dẫn (Route) | Quyền truy cập (Role / Perm) | Kiểm tra Nghiệp vụ / ABAC | Biện pháp Bảo mật & Chống Tấn công |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/v1/taxonomies` | Authenticated (hoặc Public read) | Xem danh mục cây chủ đề, khối lớp, độ khó | Cho phép tất cả người dùng xem để chọn chủ đề. |
| `POST` | `/v1/taxonomies` | `ADMIN`, `SUPER_ADMIN` (`requireAdmin`) | Chỉ Quản trị viên mới được tạo mới cây phân loại | Chặn giảng viên và học viên chỉnh sửa danh mục chuẩn hệ thống. |
| `POST` | `/v1/taxonomies/:id/nodes` | `ADMIN`, `SUPER_ADMIN` (`requireAdmin`) | Thêm nút nhánh hoặc nút lá vào cây phân loại | Kiểm tra tính hợp lệ của phân cấp phân loại. |
| `PUT`/`DELETE`| `/v1/taxonomies/nodes/:id` | `ADMIN`, `SUPER_ADMIN` (`requireAdmin`) | Chỉnh sửa, di chuyển hoặc xóa nút danh mục | Ngăn chặn việc xóa nút khi vẫn còn câu hỏi liên kết. |

---

## 8. TỔNG KẾT QUY TẮC PHÒNG THỦ TOÀN DIỆN (DEFENSE IN DEPTH RULES)

1. **Rule 1 (Fail-Closed Default)**: Bất kỳ request nào không có thông tin xác thực hoặc token không hợp lệ đều mặc định bị từ chối với `HTTP 401 Unauthorized`.
2. **Rule 2 (Role Check First, Ownership Second)**: Gateway kiểm tra RBAC tổng quát; khi request đến domain service, nghiệp vụ kiểm tra quyền sở hữu đối tượng cụ thể (ABAC). Nếu không phải tác giả và không phải Admin, trả về `HTTP 403 Forbidden`.
3. **Rule 3 (No Plaintext Secrets)**: Mật khẩu, Refresh Token, Khóa bí mật JWT tuyệt đối không xuất hiện ở dạng rõ trong logs, database, hay trả về client.
4. **Rule 4 (Strict Lifecycle Guard)**: Các thao tác làm bài thi, nộp bài, chỉnh sửa đề thi đều được bảo vệ bởi Finite State Machine (FSM) và Server-Authoritative Clock.
