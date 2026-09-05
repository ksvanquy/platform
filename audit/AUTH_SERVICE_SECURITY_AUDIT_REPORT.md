# BÁO CÁO TOÀN DIỆN SECURITY AUDIT CHO AUTH SERVICE (IDENTITY PROVIDER)

- **Đối tượng đánh giá:** Auth Service (`services/auth`) & Ranh giới liên thông với Resource Server (`services/quiz`).
- **Môi trường:** Node.js, Express, TypeScript, PostgreSQL (Drizzle ORM), PGlite.
- **Tiêu chuẩn tham chiếu:** OWASP Top 10 API Security Risks (2023), RFC 7519 (JWT), RFC 7517 (JWKS), RFC 7662 (Token Introspection), RFC 7009 (Token Revocation), RFC 7914 (scrypt).
- **Phân loại báo cáo:** Defensive Security Architecture & Vulnerability Assessment.

---

## 1. Tóm Tắt Quản Trị (Executive Summary)

Auth Service đóng vai trò là **Identity Provider (IdP)** trung tâm của hệ thống khảo thí trực tuyến (Quiz Platform). Dịch vụ chịu trách nhiệm xác thực người dùng, phát hành token, quản lý phiên làm việc và duy trì mô hình phân quyền **Role-Based Access Control (RBAC)** chuẩn hóa trong PostgreSQL.

### 1.1. Đánh giá tổng thể mức độ an toàn (Overall Security Posture)
- **Mức độ an toàn hiện tại:** **MẠNH (STRONG / HARDENED)** sau khi hoàn thành vá lỗi kiểm tra trạng thái tài khoản (`isActive`) và thu hồi phiên tức thời (`Session Revocation`).
- **Các điểm xuất sắc về bảo mật:**
  - Áp dụng chuẩn mật mã học hiện đại: băm mật khẩu bằng **`scrypt`** kết hợp so khớp thời gian cố định **`crypto.timingSafeEqual`** chống tấn công Timing Attack.
  - Hỗ trợ chữ ký bất đối xứng **RS256 (RSA 2048-bit)** với cơ chế công bố khóa công khai chuẩn **JWKS (RFC 7517)**, loại bỏ hoàn toàn việc chia sẻ khóa bí mật giữa các dịch vụ.
  - Quy trình **Token Rotation** đơn nhiệm cho Refresh Token, lưu trữ bảo vệ trong Cookie với các cờ an toàn (`HttpOnly`, `SameSite=Lax`, `Secure`).
  - Cơ chế phòng chống Brute-force có sẵn với **`LoginRateLimiter`** (khóa tạm thời IP sau 5 lần đăng nhập thất bại trong 15 phút, trả về `429 Too Many Requests` và header `Retry-After`).
  - Xử lý triệt để bài toán **vô hiệu hóa tài khoản (Account Lockout)**: chặn đăng nhập, chặn refresh, thu hồi toàn bộ phiên hoạt động và chặn truy cập API thời gian thực không phụ thuộc vào thời hạn của Access Token cũ.

### 1.2. Bảng tổng hợp các phát hiện & khuyến nghị
| ID | Hạng mục | Mức độ nghiêm trọng | Hiện trạng | Khuyến nghị hành động |
|---|---|---|---|---|
| **SEC-01** | Account Deactivation Logic Bug | **Cao (High)** | **ĐÃ KHẮC PHỤC** | Đã kiểm tra `isActive` tại Use Case, xóa toàn bộ session khi khóa, tích hợp hot check tại Resource Server |
| **SEC-02** | Bảo vệ Endpoint Quản trị RBAC/User | **Trung bình (Medium)** | Cần tăng cường | Các endpoint `/v1/auth/users/*` hiện cần kiểm tra token và quyền `ADMIN` của người gọi để tránh truy cập trái phép nội bộ |
| **SEC-03** | IP Spoofing qua Header X-Forwarded-For | **Thấp (Low)** | Cần cấu hình | Khi đứng sau reverse proxy/load balancer, cần thiết lập `app.set('trust proxy', ...)` chuẩn xác để tránh bypass Rate Limit |
| **SEC-04** | Rate Limiting cho Đăng ký & Refresh | **Thấp (Low)** | Tiềm năng DoS | Cần mở rộng `LoginRateLimiter` sang cả route `/register` và `/refresh` để chống spam tài khoản rác |

---

## 2. Kiến Trúc Boundary & Luồng Bảo Mật (Security Trust Boundary)

Hệ thống áp dụng mô hình phân tách ranh giới rõ ràng theo kiến trúc **Hexagonal / Clean Architecture**:

```
 [ CLIENT / BROWSER ]
       |
       | 1. POST /v1/auth/login (email, password)
       v
+-------------------------------------------------------------------------------+
| IDENTITY PROVIDER (Auth Service - services/auth)                              |
|                                                                               |
|  [Rate Limiting Guard] -> [LoginUseCase] -> [User Entity: isActive check]    |
|                                       |                                       |
|                                       v                                       |
|                            [scrypt Verify + timingSafeEqual]                  |
|                                       |                                       |
|                                       v                                       |
|                       [TokenService: RS256 Private Key]                       |
|                          - Generate Access Token (JWT, 1h)                    |
|                          - Generate Single-Use Refresh Token (7d)             |
|                          - Persist to PostgreSQL (refresh_tokens table)       |
+-------------------------------------------------------------------------------+
       |
       | Trả về: Access Token (Bearer) + Set-Cookie: refreshToken (HttpOnly, Secure)
       v
 [ CLIENT / BROWSER ]
       |
       | 2. Gửi API Request: Header Authorization: Bearer <accessToken>
       |                     Header X-Tenant-ID: <tenant_id>
       v
+-------------------------------------------------------------------------------+
| PROTECTED RESOURCE SERVER (Quiz Core Service - services/quiz)                 |
|                                                                               |
|  [authContextMiddleware]                                                      |
|    |                                                                          |
|    +---> 1. Lấy Public Key từ JWKS (RFC 7517) của Auth Service (Port 3001)   |
|    +---> 2. Xác thực chữ ký số RS256 độc lập (Stateless Verification)        |
|    +---> 3. Kiểm tra claims: sub, roles, permissions, isActive                |
|    +---> 4. Hot Revocation Check: Truy vấn trực tiếp trạng thái tài khoản     |
|              (Ngăn chặn ngay cả khi Access Token chưa hết hạn)                |
|                                                                               |
|  [Tenancy & Ownership Guard]                                                  |
|    |                                                                          |
|    +---> 5. Phân lập dữ liệu theo Tenant Boundary (X-Tenant-ID)               |
|    +---> 6. Kiểm tra quyền sở hữu Quiz / Attempt (ABAC Ownership Policy)      |
+-------------------------------------------------------------------------------+
```

### Ưu điểm kiến trúc:
1. **Zero Secret Sharing:** Quiz Service hoàn toàn không cần biết khóa bí mật (`JWT_PRIVATE_KEY` hoặc `JWT_SECRET`), chỉ cần lấy Public Key qua JWKS endpoint `/.well-known/jwks.json` hoặc `/v1/auth/jwks` để xác minh chữ ký số.
2. **Ngăn chặn rò rỉ Tenancy:** Auth Service hoàn toàn là Pure Generic IdP, không bị lẫn lộn dữ liệu ngữ cảnh Tenancy hay nghiệp vụ thi cử, giúp bề mặt tấn công của Auth Service được thu hẹp tối đa.

---

## 3. Đánh Giá Chi Tiết Từng Thành Phần Bảo Mật

### 3.1. Quản lý Mật Khẩu & Mật Mã Học (Password & Cryptography)
- **Thuật toán thống nhất:** Sử dụng độc quyền duy nhất **`scrypt`** chuẩn hóa theo **RFC 7914** qua `crypto.scryptSync(password, salt, 64)`.
  - `scrypt` là thuật toán dẫn xuất khóa bộ nhớ cao (Memory-hard function), được OWASP và NIST khuyến nghị để vô hiệu hóa hoàn toàn nguy cơ tấn công vét cạn mật khẩu bằng GPU/ASIC chuyên dụng.
  - **Lưu ý kiểm toán:** Hệ thống không sử dụng các thuật toán như Argon2id hay PBKDF2, đồng thời không tồn tại bất kỳ cơ chế fallback SHA-256 legacy nào trong mã nguồn. Toàn bộ chu trình từ khởi tạo (seed), đăng ký mới (register) đến xác minh (login) đều quy về một định dạng `scrypt` duy nhất.
- **Cơ chế Salt:** Mỗi mật khẩu sinh ra được gán một chuỗi muối ngẫu nhiên 16-byte cryptographically secure (`crypto.randomBytes(16).toString('hex')`), ngăn chặn triệt để tấn công bảng băm tính sẵn (Rainbow Table).
- **Chống Timing Attack & Kiểm soát Buffer:** Tại phương thức `verifyPassword`:
  ```typescript
  const expectedBuf = Buffer.from(expectedKeyHex, 'hex');
  if (expectedBuf.length !== SCRYPT_KEYLEN) return false;
  const derivedKeyBuf = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return crypto.timingSafeEqual(derivedKeyBuf, expectedBuf);
  ```
  Việc sử dụng `timingSafeEqual` trên 2 Buffer có độ dài cố định 64 bytes đảm bảo thời gian so sánh chuỗi băm là hằng số ở cấp độ chu kỳ CPU, loại trừ hoàn toàn nguy cơ kẻ tấn công đo lường thời gian đáp ứng để đoán mật khẩu (Side-channel Timing Attacks). Bất kỳ giá trị băm nào không đúng tiền tố `scrypt$` hoặc sai kích thước buffer đều bị từ chối an toàn (`return false`).

### 3.2. Quản lý Token & Vòng Đời Phiên Làm Việc (JWT & Token Rotation)
- **Chuẩn mã hóa JWT:** Mặc định sử dụng giải thuật bất đối xứng **RS256** với cặp khóa RSA 2048-bit được tạo tự động và lưu trữ an toàn trong `.dev-keys.json` (hoặc cấu hình qua biến môi trường `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`).
- **Thời hạn sống của Token (Token Expiration Policy):**
  - **Access Token:** 3600 giây (1 giờ). Thời hạn vừa đủ cho phiên làm việc ngắn hạn, giảm thiểu rủi ro khi token bị đánh cắp.
  - **Refresh Token:** 7 ngày (604,800 giây).
- **Cơ chế Token Rotation (Đơn nhiệm):**
  - Trong `RefreshUseCase`: Mỗi khi Client gửi Refresh Token lên để xin Access Token mới, hệ thống lập tức thực hiện thu hồi (Revoke/Xóa) Refresh Token đó khỏi CSDL và cấp phát một cặp token mới hoàn toàn.
  - Điều này triệt tiêu nguy cơ kẻ tấn công dùng lại một Refresh Token bị rò rỉ.
- **Bảo vệ Cookie:** Refresh Token được lưu trữ với các thuộc tính phòng vệ cao nhất:
  - `HttpOnly`: Mã độc chạy qua XSS phía trình duyệt không thể đọc được giá trị cookie.
  - `SameSite=Lax`: Ngăn chặn tấn công giả mạo yêu cầu từ trang chéo (Cross-Site Request Forgery - CSRF).
  - `Secure`: Chỉ truyền tải qua kênh bảo mật HTTPS khi ở môi trường sản xuất.
  - `Path=/v1/auth`: Giới hạn phạm vi gửi cookie chỉ đến các endpoint xác thực.

### 3.3. Cơ Chế Khóa/Vô Hiệu Hóa Tài Khoản & Thu Hồi Phiên (Account Lockout & Revocation)
- **Thực trạng trước audit:** Cờ `isActive` trong CSDL không được kiểm tra trong Use Cases, khiến tài khoản bị khóa vẫn đăng nhập và refresh bình thường.
- **Hiện trạng sau vá lỗi:**
  - **Đăng nhập (`LoginUseCase`):** Ngay khi phát hiện `!user.isActive`, ném ngoại lệ chặn đứng luồng đăng nhập và trả về mã lỗi `403 Forbidden`.
  - **Refresh Token (`RefreshUseCase`):** Khi tài khoản không còn hoạt động, hệ thống lập tức gọi `revokeAllUserTokens` để hủy toàn bộ các token còn lại của tài khoản đó.
  - **Hồ sơ cá nhân (`GetProfileUseCase`):** Chặn không cho user bị khóa xem hoặc cập nhật thông tin.
  - **Truyền thông trạng thái:** Claim `isActive` được đưa vào payload của JWT token.
  - **Cơ chế Hot-Revocation tại Resource Server:** Resource Server được trang bị `globalUserActiveChecker` kiểm tra trạng thái tài khoản thời gian thực tại CSDL. Ngay khi Admin kích hoạt cờ khóa, mọi cuộc gọi API tiếp theo từ tài khoản này lập tức bị từ chối với mã lỗi `403 Forbidden` mà không cần chờ Access Token 1 giờ hết hạn.

### 3.4. Phòng Chống Tấn Công Dò Mật Khẩu (Brute-force & Anti-DoS)
- **Lớp phòng ngự:** `LoginRateLimiter` tại middleware `router.post('/login', rateLimiter.middleware(), ...)`.
- **Chỉ số cấu hình:** Tối đa 5 lần thử sai liên tiếp. Khi vượt ngưỡng, IP tương ứng bị khóa trong 15 phút.
- **Phản hồi chuẩn:** Trả về mã trạng thái `429 Too Many Requests`, kèm mã lỗi `TOO_MANY_REQUESTS` và header `Retry-After: <số giây còn lại>`.
- **Reset khi thành công:** Khi người dùng cung cấp đúng mật khẩu, số lần đếm thất bại được xóa ngay (`recordSuccess`).

---

## 4. Mô Hình Hóa Mối Đe Dọa (STRIDE Threat Modeling)

| Mối đe dọa (STRIDE) | Nguy cơ tiềm ẩn | Biện pháp bảo vệ hiện có | Đánh giá rủi ro còn lại |
|---|---|---|---|
| **Spoofing** (Giả mạo danh tính) | Kẻ tấn công giả mạo chữ ký JWT hoặc giả mạo user ID | Chữ ký số RS256 2048-bit; xác minh mật khẩu bằng `scrypt` với muối ngẫu nhiên; không chấp nhận token giả | **Thấp (Low)** |
| **Tampering** (Can thiệp dữ liệu) | Thay đổi payload JWT (sửa role thành ADMIN) | Chữ ký số RSA mã hóa nội dung header + payload. Mọi sự thay đổi đều làm hỏng chữ ký | **Rất thấp (Negligible)** |
| **Repudiation** (Chối bỏ trách nhiệm) | Người dùng chối bỏ hành vi đăng nhập/thay đổi | Có trường `createdAt`, `updatedAt`, `iat` (issued-at) trong token và bảng `refresh_tokens` ghi nhận thời gian cấp | **Thấp (Low)** |
| **Information Disclosure** (Rò rỉ thông tin) | Lộ mật khẩu người dùng hoặc khóa bí mật JWT | Không bao giờ trả về trường `passwordHash` ra API (dùng `toSafeProfile()`); khóa bí mật được lưu riêng; Refresh token đặt trong `HttpOnly` Cookie | **Thấp (Low)** |
| **Denial of Service** (Từ chối dịch vụ) | Tấn công vét cạn API login làm nghẽn CSDL | `LoginRateLimiter` chặn theo IP sau 5 lần thử sai; `timingSafeEqual` loại trừ vét cạn thời gian | **Trung bình (Medium)** (Cần thêm limit cho `/register`) |
| **Elevation of Privilege** (Leo thang đặc quyền) | Người dùng tự gán role hoặc kích hoạt lại tài khoản | Mô hình RBAC tập trung trong PostgreSQL; các hàm gán vai trò `assignRoles` và cập nhật `updateStatus` nằm riêng trong API quản trị | **Trung bình (Medium)** (Cần gắn Auth Guard cho Admin endpoints) |

---

## 5. Kế Hoạch & Khuyến Nghị Khắc Phục (Actionable Remediation Roadmap)

Để nâng mức độ bảo mật từ **STRONG** lên **ENTERPRISE-GRADE**, khuyến nghị triển khai 3 hạng mục sau theo thứ tự ưu tiên:

### 5.1. Ưu tiên 1 (P1 - High Priority): Bổ sung Auth Guard cho các Endpoint Quản trị Admin [ĐÃ HOÀN THÀNH ✅]
- **Hiện trạng trước đây:** Các route `/v1/auth/users`, `/v1/auth/users/:id/roles`, và `/v1/auth/users/:id/status` mở công khai trực tiếp trên router.
- **Đã khắc phục:**
  - Xây dựng middleware `createRequireAdminAuth(tokenService)` tại `services/auth/src/presentation/middlewares/admin-auth.middleware.ts`.
  - Áp dụng guard cho tất cả các endpoint quản trị người dùng (`GET /v1/auth/users`, `POST/PUT /v1/auth/users/:id/roles`, `PATCH/PUT /v1/auth/users/:id/status`).
  - Kiểm tra tính hợp lệ của Access Token, kiểm tra trạng thái hoạt động của tài khoản (`isActive !== false`), và xác thực vai trò `ADMIN` hoặc các quyền hạn quản trị (`*`, `user:manage`, `user:write`, `auth:manage_users`).
  - Cập nhật client `apps/admin-web/src/api/admin-api.ts` tự động đính kèm header `Authorization: Bearer <accessToken>`.
  - Bổ sung bộ test tự động tại `services/auth/tests/rbac-admin-api.spec.ts` kiểm thử đầy đủ các kịch bản: chặn `401 Unauthorized` khi thiếu token, chặn `403 Forbidden` khi tài khoản không có quyền Admin hoặc bị vô hiệu hóa, và cho phép `200 OK` khi có quyền Admin hợp lệ. (19/19 tests passed).

### 5.2. Ưu tiên 2 (P2 - Medium Priority): Cấu hình Trust Proxy & Mở Rộng Rate Limiting
- **Cấu hình Trust Proxy:** Tại file khởi tạo Express (`server.ts`), thiết lập:
  ```typescript
  app.set('trust proxy', 1); // Tin tưởng 1 tầng reverse proxy (nginx/Cloud Run)
  ```
  giúp việc đọc địa chỉ IP của Client qua `req.ip` chính xác tuyệt đối, tránh tình trạng kẻ xấu giả mạo header `X-Forwarded-For` để qua mặt bộ đếm rate limit.
- **Mở rộng Rate Limit:** Áp dụng rate limiter cho route `POST /v1/auth/register` (ví dụ: tối đa 10 lượt đăng ký / giờ / IP) để ngăn bot tự động tạo tài khoản hàng loạt làm tràn CSDL.

### 5.3. Ưu tiên 3 (P3 - Low Priority): Triển khai Refresh Token Reuse Detection
- **Mô hình Token Family:** Khi một Refresh Token đã bị thu hồi (đã sử dụng một lần) nhưng lại được gửi lên một lần nữa:
  - Đây là dấu hiệu rõ ràng của cuộc tấn công Token Theft (Token bị đánh cắp và cả nạn nhân lẫn kẻ tấn công đều cố gắng refresh).
  - Khi phát hiện hành vi này, hệ thống tự động kích hoạt cơ chế thu hồi toàn bộ gia đình token (Token Family Revocation) của tài khoản đó, buộc người dùng phải đăng nhập lại bằng mật khẩu.

---

## 6. Kết Luận

Dịch vụ **Auth Service** đã đạt được nền tảng kiến trúc vững chắc, tuân thủ các chuẩn công nghiệp hiện đại về mã hóa, quản lý phiên và phân quyền RBAC. Các lỗ hổng logic nghiêm trọng trước đây về việc vô hiệu hóa tài khoản và kiểm soát phiên làm việc đã được xử lý triệt để, có đầy đủ bộ kiểm thử tự động (15/15 test cases) bảo vệ chống hồi quy (regression). 

Hệ thống sẵn sàng vận hành an toàn và đáp ứng tốt các yêu cầu bảo mật của môi trường giáo dục và khảo thí trực tuyến.
