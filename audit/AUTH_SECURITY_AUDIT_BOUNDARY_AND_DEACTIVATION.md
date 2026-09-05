# Báo Cáo Audit Kiến Trúc Boundary & Khắc Phục Lỗi Logic Khóa/Vô Hiệu Hóa Tài Khoản (Auth Service)

---

## 1. Tổng Quan & Phạm Vi Kiến Trúc Boundary Của Auth Services

Hệ thống Quiz Assessment Platform áp dụng kiến trúc **Hexagonal / Clean Architecture** phân tách rõ rệt giữa:
- **Identity Provider (IdP) - Auth Service (`services/auth`)**: Chịu trách nhiệm xác thực danh tính (Authentication), cấp phát token (JWT Access Token & Rotation Refresh Token), quản lý cơ chế RBAC (Roles & Permissions) chuẩn hóa trong PostgreSQL, và quản lý vòng đời tài khoản người dùng (`User` aggregate).
- **Resource Server - Quiz Core Service (`services/quiz`)**: Chịu trách nhiệm nghiệp vụ khảo thí (Authoring & Delivery), xác thực chữ ký số JWT phân tán qua public key (JWKS RFC 7517), thực thi kiểm soát truy cập phân quyền RBAC/ABAC (Ownership Policy) và cô lập đa khách thuê (Clean-cut Tenancy qua header `X-Tenant-ID`).

```
                                      [ Identity & Token Provider ]
                                       services/auth (Auth Service)
                                                   |
              +------------------------------------+------------------------------------+
              |                                    |                                    |
     [User Registration / Login]            [Token Lifecycle]                 [Admin User Management]
     - LoginUseCase                         - TokenService                     - PATCH /users/:id/status
     - RefreshUseCase                       - Refresh Token Storage            - POST/PUT /users/:id/roles
     - Password verification (scrypt RFC 7914) - JWKS RFC 7517                 - GET /users, GET /roles
              |                                    |                                    |
              +------------------------------------+------------------------------------+
                                                   |
                             [JWT Token with claims: sub, roles, permissions, isActive]
                                                   |
                                                   v
                                      [ Protected Resource Server ]
                                       services/quiz (Quiz Service)
                                                   |
                             +---------------------+---------------------+
                             |                                           |
                   [authContextMiddleware]                    [Ownership & Tenant Guard]
                   - JWT RS256/HS256 Signature Verify         - X-Tenant-ID Header Boundary
                   - Account isActive Claim Check             - Principal-based Ownership
                   - Real-time DB Status Guard (Hot Revocation)- Authoring & Delivery Execution
```

---

## 2. Phân Tích Lỗi Logic: Chức Năng Khóa/Vô Hiệu Hóa Tài Khoản (Account Lockout Vulnerability)

### 2.1. Thực trạng trước khi khắc phục
Trước khi rà soát, trường `is_active` (`isActive`) dù đã có trong bảng CSDL `users` nhưng tồn tại các lỗ hổng nghiêm trọng trong luồng xử lý xác thực:
1. **Bỏ qua kiểm tra `isActive` khi đăng nhập:** `LoginUseCase` chỉ kiểm tra tính hợp lệ của mật khẩu (`verifyPassword`) mà không kiểm tra cờ `user.isActive`. Tài khoản đã bị Admin khóa vẫn có thể đăng nhập và nhận cặp token mới bình thường.
2. **Bỏ qua kiểm tra `isActive` khi cấp lại token (Refresh Token):** `RefreshUseCase` khi nhận refresh token chỉ tìm `user` theo ID mà không kiểm tra `user.isActive`. Người dùng bị khóa vẫn liên tục refresh lấy access token mới.
3. **Không thu hồi phiên cũ khi bị khóa:** Khi một tài khoản bị vô hiệu hóa hoặc nghi ngờ bị xâm nhập, các refresh token cũ đã phát hành vẫn tồn tại trong CSDL và vẫn có thể sử dụng được.
4. **Access Token không chứa trạng thái tài khoản:** Token JWT được cấp trước đó không chứa claim `isActive`. Do Quiz Service thực hiện xác thực token độc lập (stateless qua JWKS), Quiz Service hoàn toàn không biết tài khoản đã bị khóa, cho phép user bị khóa tiếp tục gọi API, làm bài thi hoặc sửa đề thi trong suốt thời gian token còn hiệu lực (1 giờ).

---

## 3. Các Giải Pháp & Thành Phần Đã Triển Khai

### 3.1. Cập nhật Domain Entity & Ports (`services/auth/src/domain`)
- **`User` Entity (`user.entity.ts`):** Bổ sung các domain methods mang tính bất biến:
  - `withActiveStatus(isActive: boolean): User`
  - `deactivate(): User`
  - `activate(): User`
- **`IUserRepository` Port (`user.repository.port.ts`):** Khai báo method:
  - `updateStatus(id: string, isActive: boolean): Promise<User | null>`
- **`ITokenStorage` Port (`token.storage.port.ts`):** Khai báo method thu hồi toàn diện:
  - `revokeAllUserTokens(userId: string): Promise<void>`

### 3.2. Triển khai Persistence Layer (PostgreSQL & In-Memory)
- **`DrizzleUserRepository` & `DrizzleTokenStorage`:**
  - Cập nhật trường `is_active` trong bảng `users` an toàn bằng Drizzle ORM.
  - Xóa toàn bộ refresh tokens thuộc về `user_id` trong bảng `refresh_tokens` khi tài khoản bị khóa.
- **`InMemoryUserRepository` & `InMemoryTokenStorage`:** Cập nhật đồng bộ để toàn bộ test suites và môi trường isolated hoạt động chính xác.

### 3.3. Siết chặt Use Cases (`services/auth/src/application`)
- **`LoginUseCase`:** Kiểm tra `if (!user.isActive) throw new Error('Account is deactivated. Please contact administrator.');`. Chặn đăng nhập và trả về mã lỗi `403 Forbidden`.
- **`RefreshUseCase`:** Khi tài khoản không còn active, ngay lập tức thu hồi token gửi lên, thu hồi toàn bộ token của người dùng và trả về lỗi `Account is deactivated` (`403 Forbidden`).
- **`GetProfileUseCase`:** Chặn lấy profile nếu tài khoản bị khóa.

### 3.4. Lan truyền trạng thái trong JWT & Hot Revocation Guard
- **`TokenService` (`token.service.ts`):** Đưa `isActive: boolean` vào payload JWT của Access Token.
- **`authContextMiddleware` (`services/quiz`):**
  1. Kiểm tra ngay lập tức claim `payload.isActive === false` -> Chặn với `403 Forbidden` (`Account is deactivated. Access denied.`).
  2. Bổ sung `globalUserActiveChecker` kết nối trực tiếp với DB: Cho phép Resource Server phát hiện ngay lập tức tài khoản vừa bị khóa trong DB mà không cần chờ Access Token 1 giờ hết hạn (Khắc phục hoàn toàn bài toán token vô hiệu hóa thời gian thực).

### 3.5. Endpoint Quản Trị & Giao Diện Admin Web
- **REST Endpoints Mới:**
  - `PATCH /v1/auth/users/:id/status` (hoặc `PUT /v1/auth/users/:id/status`): Nhận payload `{ "isActive": false }` hoặc `{ "isActive": true }`.
  - Khi `isActive: false`, tự động gọi `tokenService.revokeAllUserTokens(userId)`.
- **Token Introspection (`POST /v1/auth/tokens/verify` RFC 7662):** Kiểm tra trạng thái người dùng trong DB; nếu tài khoản đã bị khóa hoặc xóa, trả về `{ success: true, active: false, error: 'User account is deactivated or deleted' }`.
- **Giao diện Admin Portal (`apps/admin-web`):**
  - Hiển thị bảng người dùng với Role, Email và huy hiệu trạng thái (🟢 Đang hoạt động / 🔴 Đã khóa).
  - Nút bấm trực quan **"🔒 Khóa tài khoản"** / **"🔓 Mở khóa"** với cơ chế bảo vệ không cho Admin tự khóa chính mình.

---

## 4. Kết Quả Kiểm Thử Tự Động (Automated Verification)

Toàn bộ 15 kịch bản kiểm thử trong `services/auth/tests/rbac-admin-api.spec.ts` đều đã vượt qua (15/15 Passed):
1. Khóa tài khoản thành công qua API `PATCH /v1/auth/users/:id/status`.
2. Đăng nhập bị chặn lập tức (403 Forbidden) kèm thông báo "Account is deactivated".
3. Refresh token cũ bị vô hiệu hóa và từ chối.
4. Lấy thông tin cá nhân `/v1/auth/me` bị chặn (403 Forbidden).
5. Endpoint Introspection `/v1/auth/tokens/verify` trả về `active: false`.
6. Mở khóa tài khoản khôi phục quyền đăng nhập bình thường.
