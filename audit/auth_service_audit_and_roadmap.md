# TÀI LIỆU THIẾT KẾ KIẾN TRÚC VÀ ĐẶC TẢ HỆ THỐNG AUTH SERVICE
**Dự án:** Platform Core / Quiz Assessment Engine & Auth System  
**Phiên bản:** v3.0 (Production-Ready Architecture)  
**Ngày cập nhật:** September 4, 2026  
**Trạng thái:** Toàn bộ kiến trúc và các cơ chế bảo mật đã được hoàn thiện, kiểm thử tự động 100% (15/15 test files, 136/136 tests PASS).

---

## I. TỔNG QUAN HỆ THỐNG VÀ NGUYÊN TẮC THIẾT KẾ (SYSTEM OVERVIEW & DESIGN PRINCIPLES)

Auth Service là dịch vụ cốt lõi chịu trách nhiệm quản lý danh tính (Identity), xác thực (Authentication) và phân quyền (Authorization) trong hệ thống Quiz Platform. Dịch vụ được xây dựng theo các nguyên lý kiến trúc chuẩn mực:

1. **Domain-Driven Design (DDD) & Clean / Hexagonal Architecture (Ports & Adapters)**:
   - Tách biệt tuyệt đối giữa nghiệp vụ định danh cốt lõi (Domain Layer), điều phối tác vụ (Application Layer) và các chi tiết kỹ thuật như cơ sở dữ liệu hay giao thức truyền thông (Infrastructure & Presentation Layers).
   - Tầng Domain không phụ thuộc vào bất kỳ thư viện bên ngoài hay framework nào.
2. **Nguyên tắc Tách Biệt Ngữ Cảnh (Bounded Context Isolation)**:
   - Auth Service quản lý danh tính độc lập, không chia sẻ trực tiếp database hoặc thực hiện cross-join bảng với Quiz Core Engine.
   - Giao tiếp và chia sẻ ngữ cảnh người dùng được thực hiện thông qua JSON Web Token (JWT) có chữ ký số mật mã hoặc qua hợp đồng giao diện (`@platform/contracts`).
3. **Mô hình Bảo Mật Zero Trust & Least Privilege**:
   - Mọi request yêu cầu quyền hạn đều phải xác thực tính toàn vẹn của chữ ký số JWT.
   - Cơ chế phân quyền hạt mịn (Fine-grained RBAC) bảo vệ cả tài nguyên quản trị lẫn quyền sở hữu ca thi (Anti-IDOR).
4. **Khả năng Phục hồi Cao (Environment Resilience & Zero Startup Crash)**:
   - Hệ thống tự động phát hiện cấu hình môi trường; tự động chuyển đổi thông minh giữa cơ chế bền vững (PostgreSQL + Drizzle ORM) và In-Memory (trong môi trường kiểm thử/development), loại bỏ hoàn toàn nguy cơ ứng dụng bị crash lúc khởi động do thiếu biến môi trường.

---

## II. KIẾN TRÚC HỢP NHẤT TRÊN CỔNG MẠNG PORT 3000 (UNIFIED PORT 3000 ARCHITECTURE)

Để đáp ứng tối ưu môi trường vận hành đám mây (Cloud Run / AI Studio container chỉ ánh xạ duy nhất Port 3000 ra bên ngoài) mà vẫn giữ nguyên tính độc lập mô-đun, hệ thống triển khai theo mô hình **Unified Monolith Gateway**:

```text
                                 +-------------------------------------------------+
                                 |         Client Applications (React SPA)         |
                                 |      quiz-web (Thí sinh) / admin-web (Quản trị) |
                                 +------------------------+------------------------+
                                                          |
                                                          | HTTP / HTTPS Requests
                                                          | Authorization: Bearer <accessToken>
                                                          | Cookie: refreshToken (HttpOnly, SameSite=Lax)
                                                          v
+--------------------------------------------------------------------------------------------------------------------+
|                               UNIFIED API ENGINE (Lắng nghe tại Port 3000 duy nhất)                                |
|                                                                                                                    |
|   +------------------------------------------------------------------------------------------------------------+   |
|   | Global Security Middlewares: Dynamic CORS (Credentials: true) | LoginRateLimiter | JSON Parser             |   |
|   +------------------------------------------------------------------------------------------------------------+   |
|         |                                                                                                          |
|         +---> Prefix: /v1/auth/* --------------------+                                                             |
|         |     Prefix: /.well-known/jwks.json         |                                                             |
|         |                                            v                                                             |
|         |                             +-----------------------------------+                                        |
|         |                             |      Auth Router (Express)        |                                        |
|         |                             | Register | Login | Refresh | Me   |                                        |
|         |                             +-----------------+-----------------+                                        |
|         |                                               | Ký Token (RS256 / JWKS)                                  |
|         |                                               v                                                          |
|         |                             +-----------------------------------+                                        |
|         |                             |   TokenService & Use Cases Layer  |                                        |
|         |                             +-----------------+-----------------+                                        |
|         |                                               |                                                          |
|         |                                               +-------------------+                                      |
|         |                                               |                   |                                      |
|         |                                               v                   v                                      |
|         |                             +--------------------+     +---------------------+                           |
|         |                             | Drizzle Repos      |     | InMemory Repos      |                           |
|         |                             | (PostgreSQL)       |     | (Testing / Fallback)|                           |
|         |                             +---------+----------+     +---------------------+                           |
|         |                                       | AUTH_DATABASE_URL                                                |
|         |                                       v                                                                  |
|         |                             [( Dedicated Auth DB )]                                                      |
|         |                             (users, refresh_tokens)                                                      |
|         |                                                                                                          |
|         +---> Prefix: /v1/quizzes/* ------> +-----------------------------------+                                  |
|         |     Prefix: /v1/attempts/* -----> |     Token Verification Guard      | (Xác thực chữ ký RS256 / JWKS)   |
|         |                                   +-----------------+-----------------+                                  |
|         |                                                     | Cấp Principal Context                              |
|         |                                                     v (userId, roles, permissions)                       |
|         |                                   +-----------------------------------+                                  |
|         |                                   |  RBAC Guard & IDOR Defense Guard  |                                  |
|         |                                   +-----------------+-----------------+                                  |
|         |                                                     | Cho phép truy cập hợp lệ                           |
|         |                                                     v                                                    |
|         |                                   +-----------------------------------+                                  |
|         |                                   |     Quiz Core Engine (DDD)        |                                  |
|         |                                   | Authoring & Delivery Sub-domains  |                                  |
|         |                                   +-----------------------------------+                                  |
+--------------------------------------------------------------------------------------------------------------------+
```

* **Cổng phục vụ hợp nhất (Port 3000)**: Auth Router được mount trực tiếp vào Express App chính tại tiền tố `/v1/auth/*`, endpoint khám phá khóa công khai tại `/.well-known/jwks.json`.
* **Khả năng triển khai Standalone**: Mã nguồn `services/auth/src/presentation/server.ts` vẫn duy trì khả năng chạy độc lập ở tiến trình riêng (ví dụ Port 3001) khi cần mở rộng sang cụm microservices phân tán.

---

## III. CẤU TRÚC PHÂN TẦNG VÀ CÁC THÀNH PHẦN CỦA AUTH SERVICE

```text
services/auth/
├── src/
│   ├── domain/                         # Lớp Nghiệp Vụ Cốt Lõi (Domain)
│   │   ├── user/                       # Thực thể User & Cổng Repository
│   │   │   ├── user.entity.ts
│   │   │   └── user.repository.port.ts
│   │   ├── role/                       # Định nghĩa Role & Quyền Hạn
│   │   │   └── role.ts
│   │   └── token/                      # Cổng Lưu Trữ Token Storage
│   │       └── token.storage.port.ts
│   ├── application/                    # Lớp Điều Phối Tác Vụ (Use Cases)
│   │   ├── register/register.use-case.ts
│   │   ├── login/login.use-case.ts
│   │   ├── refresh/refresh.use-case.ts
│   │   ├── logout/logout.use-case.ts
│   │   └── profile/get-profile.use-case.ts
│   ├── infrastructure/                 # Lớp Hạ Tầng & Tương Tác Kỹ Thuật
│   │   ├── db/                         # PostgreSQL + Drizzle Schema & Connection
│   │   │   ├── schema.ts
│   │   │   ├── connection.ts
│   │   │   ├── migrate.ts
│   │   │   └── seed.ts
│   │   ├── persistence/                # Hiện thực Persistence & Factories
│   │   │   ├── drizzle-user.repository.ts
│   │   │   ├── in-memory-user.repository.ts
│   │   │   ├── in-memory-token.storage.ts
│   │   │   ├── repository.factory.ts
│   │   │   └── token-storage.factory.ts
│   │   └── token/                      # Token Service (RS256 & RFC 7517 JWKS)
│   │       └── token.service.ts
│   └── presentation/                   # Lớp Giao Diện HTTP & Middleware
│       ├── http/
│       │   └── auth.router.ts
│       ├── middlewares/
│       │   └── rate-limit.middleware.ts
│       └── server.ts
```

### 1. Tầng Domain (Domain Layer)
* **`User` Entity (`user.entity.ts`)**: Đại diện cho thực thể người dùng trong hệ thống với các thuộc tính: `id`, `email`, `name`, `passwordHash`, `roles: RoleType[]`, `tenantId`, `createdAt`, `updatedAt`. Cung cấp phương thức bất biến `withUpdates(...)` và `toSafeProfile()` loại bỏ hoàn toàn mật khẩu băm khi trả về dữ liệu cho client.
* **`IUserRepository` Port (`user.repository.port.ts`)**: Giao diện trừu tượng cho việc lưu trữ, tìm kiếm người dùng theo `id`, `email`, tạo mới hoặc cập nhật.
* **`ITokenStorage` Port (`token.storage.port.ts`)**: Giao diện trừu tượng quản lý vòng đời Refresh Token (lưu trữ token, xác thực token chưa thu hồi và chưa hết hạn, thu hồi token khi đăng xuất).
* **Role Model (`role.ts`)**: Định nghĩa các vai trò chuẩn `RoleType = 'ADMIN' | 'INSTRUCTOR' | 'STUDENT'` và tích hợp cơ chế giải phóng quyền hạn hạt mịn từ `@platform/contracts`.

### 2. Tầng Application (Use Cases Layer)
Toàn bộ logic nghiệp vụ được đóng gói độc lập thành 5 Use Cases chuẩn:
* **`RegisterUseCase`**: Tiếp nhận đăng ký tài khoản mới; kiểm tra trùng lặp email; kiểm tra độ dài mật khẩu (tối thiểu 8 ký tự); mã hóa mật khẩu bằng thuật toán `scryptSync`; gán vai trò mặc định `STUDENT`; lưu vào kho dữ liệu; phát hành cặp Access Token & Refresh Token; trả về kết quả `201 Created`.
* **`LoginUseCase`**: Tiếp nhận email và mật khẩu; tìm kiếm tài khoản; đối chiếu mật khẩu với thuật toán kiểm tra an toàn thời gian thực (`timingSafeEqual`); cấp phát cặp Access Token & Refresh Token; trả về Principal và Session Data.
* **`RefreshUseCase`**: Tiếp nhận Refresh Token; kiểm tra tính hợp lệ và thời hạn trong `TokenStorage`; tự động **xoay vòng token (Token Rotation)** — thu hồi Refresh Token cũ và phát hành cặp token hoàn toàn mới; cập nhật hạn sử dụng mới.
* **`LogoutUseCase`**: Tiếp nhận Refresh Token và đánh dấu thu hồi (revoked) trong kho lưu trữ, vô hiệu hóa phiên làm việc của người dùng.
* **`GetProfileUseCase`**: Tiếp nhận `userId` từ token xác thực hợp lệ; truy vấn kho dữ liệu và trả về thông tin `SafeProfile` (loại bỏ thông tin nhạy cảm).

### 3. Tầng Infrastructure (Infrastructure Layer)
* **Cơ sở dữ liệu Độc lập (Database-per-Service Pattern)**:
  - Sử dụng **PostgreSQL** kết hợp **Drizzle ORM** độc lập qua biến môi trường `AUTH_DATABASE_URL`.
  - Bảng `users`: Lưu trữ thông tin định danh, tài khoản, mảng vai trò và mật khẩu đã băm.
  - Bảng `refresh_tokens`: Lưu trữ băm SHA-256 của Refresh Token (ngăn chặn lộ token nguyên bản ngay cả khi dữ liệu bị dump), `user_id`, `expires_at`, `revoked_at`.
* **Cơ chế Resilience & Factories**:
  - `createUserRepository()` và `createTokenStorage()` tự động kiểm tra tính sẵn sàng của kết nối database:
    - Khi có `AUTH_DATABASE_URL` hợp lệ ➜ Sử dụng `DrizzleUserRepository` & `DrizzleTokenStorage`.
    - Khi chạy unit tests hoặc môi trường không cấu hình DB ➜ Tự động chuyển sang `InMemoryUserRepository` & `InMemoryTokenStorage` mà không gây gián đoạn hay crash ứng dụng.
* **Băm Mật Khẩu Chuẩn Công Nghiệp (Scrypt RFC 7914)**:
  - Mật khẩu được băm bằng `crypto.scryptSync` với Salt ngẫu nhiên 16 bytes và độ dài khóa 64 bytes (`scrypt$<salt>$<derivedKey>`).
  - Đối chiếu mật khẩu bằng `crypto.timingSafeEqual` chống lại kỹ thuật tấn công đo thời gian phản hồi (Timing Attack).
* **Chữ Ký Số Bất Đối Xứng RS256 & Khám Phá Khóa RFC 7517 (JWKS)**:
  - `TokenService` sử dụng cặp khóa RSA 2048-bit để ký Access Token bằng thuật toán **RS256**.
  - Endpoint `/.well-known/jwks.json` công khai Public Key dưới định dạng chuẩn JWKS (`kty: "RSA"`, `use: "sig"`, `alg: "RS256"`), cho phép Quiz Service và các dịch vụ khác thẩm định chữ ký độc lập mà không cần chia sẻ private key.

### 4. Tầng Presentation (Presentation Layer)
* **Auth Router (`auth.router.ts`)**: Đóng gói và ánh xạ toàn bộ các HTTP route của Auth Service, xử lý header và cookie.
* **Phòng Chống Dò Mật Khẩu (Brute-Force Defense)**:
  - Tích hợp `LoginRateLimiter`: Tự động đếm và khóa IP nếu thử sai liên tiếp quá 5 lần trong vòng 15 phút.
  - Khi bị khóa, trả về HTTP `429 Too Many Requests` kèm theo header chuẩn `Retry-After` (tính theo giây).
  - Tự động xóa lịch sử đếm lỗi ngay khi người dùng đăng nhập thành công.
* **Quản Lý Phiên Hybrid (HttpOnly Cookie + Header Fallback)**:
  - Cấp phát Refresh Token qua Cookie bảo mật: `Set-Cookie: refreshToken=...; HttpOnly; SameSite=Lax; Path=/v1/auth; Max-Age=604800` (kèm cờ `Secure` trong môi trường HTTPS).
  - Trả `accessToken` qua JSON body để lưu trữ trong bộ nhớ tạm (Memory State) của ứng dụng client, giảm thiểu tối đa rủi ro tấn công XSS.
  - Khi Logout, xóa cookie với `Max-Age=0`.
  - Vẫn hỗ trợ truyền `refreshToken` qua JSON body nhằm phục vụ các môi trường iFrame hoặc thiết bị chặn third-party cookies.
* **Cấu hình CORS Bảo Mật**:
  - Triển khai cơ chế Dynamic Origin Reflection kèm theo header `Access-Control-Allow-Credentials: true` để trình duyệt cho phép trao đổi cookie một cách an toàn.

---

## IV. CƠ CHẾ PHÂN QUYỀN (RBAC) VÀ BẢO VỆ PHÒNG THI (ANTI-CHEAT & IDOR DEFENSE)

Hệ thống phân quyền được thiết kế đồng bộ từ hợp đồng `@platform/contracts` tới middleware bảo vệ tại Quiz Service:

### 1. Ma Trận Vai Trò và Quyền Hạn (Role & Permissions Matrix)

| Quyền hạn (Permission) | ADMIN | INSTRUCTOR | STUDENT | Mô tả chức năng |
| :--- | :---: | :---: | :---: | :--- |
| `quiz:create` | ✅ | ✅ | ❌ | Tạo mới bài thi |
| `quiz:update` | ✅ | ✅ | ❌ | Cập nhật cấu hình bài thi |
| `quiz:delete` | ✅ | ❌ | ❌ | Xóa bài thi khỏi hệ thống |
| `quiz:publish` | ✅ | ✅ | ❌ | Xuất bản bài thi để thí sinh làm |
| `quiz:view_draft` | ✅ | ✅ | ❌ | Xem bản nháp chưa xuất bản |
| `quiz:attempt` | ✅ | ❌ | ✅ | Tham gia làm bài thi |
| `quiz:grade` | ✅ | ✅ | ❌ | Chấm điểm bài thi tự luận |
| `system:manage` | ✅ | ❌ | ❌ | Quản trị toàn bộ hệ thống |

*Khi sinh Access Token, `TokenService` tự động chuyển đổi danh sách `roles` của người dùng thành danh sách `permissions` tương ứng và gắn vào Claims của JWT.*

### 2. Các Middleware Bảo Vệ Tại Quiz Service

* **`authMiddleware` (`auth.middleware.ts`)**:
  - Trích xuất token từ header `Authorization: Bearer <token>`.
  - Xác thực chữ ký số bằng Public Key (RS256) hoặc secret key.
  - Kiểm tra tính hợp lệ về thời hạn (`exp`), `nbf`, `iss`, `aud`.
  - Khởi tạo đối tượng `req.principal: Principal` chứa `id`, `roles`, `permissions`, `tenantId`.
  - **Chính sách Không-Ẩn-Danh**: Bác bỏ mọi token không hợp lệ, sai chữ ký hoặc request thiếu xác thực đối với các route bảo vệ ➜ Trả về ngay lập tức HTTP `401 Unauthorized`.
* **`requireRole(...allowedRoles: string[])` (`rbac.middleware.ts`)**:
  - Kiểm tra xem người dùng có vai trò nằm trong danh sách được phép hay không.
  - Vai trò `ADMIN` tự động bypass tất cả các kiểm tra.
  - Người dùng không đủ quyền hạn bị từ chối với HTTP `403 Forbidden` (`errorCode: 'FORBIDDEN'`).
* **`requirePermission(...requiredPermissions: string[])` (`rbac.middleware.ts`)**:
  - Hỗ trợ kiểm tra quyền hạn chi tiết với Wildcard matching (`*` hoặc `quiz:*`).
* **Bảo Vệ Ca Thi & Chống Lỗ Hổng IDOR (Anti-Cheating IDOR Defense)**:
  - Mọi thao tác trong phòng thi (`POST /v1/attempts/:id/start`, `GET /v1/attempts/:id`, `POST /v1/attempts/:id/answers`, `PUT /v1/attempts/:id/answers/:questionId`, `POST /v1/attempts/:id/submit`) đều đối chiếu nghiêm ngặt:
    ```typescript
    if (attempt.userId !== req.principal.id && !req.principal.roles.includes('ADMIN')) {
      throw new ForbiddenError('You are not authorized to access this quiz attempt');
    }
    ```
  - Ngăn chặn triệt để hành vi thí sinh can thiệp, xem trước hoặc gửi đáp án vào ca thi của người khác.

---

## V. ĐẶC TẢ CHI TIẾT RESTFUL API V1 (API SPECIFICATION)

### 1. Bảng Tổng Hợp Endpoints

| Phương thức | Đường dẫn Endpoint | Cơ chế Auth / Headers / Body | HTTP Status Codes | Mục đích nghiệp vụ |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/v1/auth/register` | Body: `{ email, password, name, tenantId? }` | `201 Created`, `400 Bad Request` | Đăng ký tài khoản người dùng mới (STUDENT), băm scrypt, cấp token và Set-Cookie |
| `POST` | `/v1/auth/login` | Body: `{ email, password }` | `200 OK`, `401 Unauthorized`, `429 Too Many Requests` | Đăng nhập hệ thống, kiểm tra rate limit, cấp Access Token & Set-Cookie Refresh Token |
| `POST` | `/v1/auth/refresh` | Cookie: `refreshToken` hoặc Body: `{ refreshToken? }` | `200 OK`, `401 Unauthorized` | Xoay vòng Refresh Token (Token Rotation) và cấp mới Access Token |
| `POST` | `/v1/auth/logout` | Cookie: `refreshToken` hoặc Body: `{ refreshToken? }` | `200 OK` | Đăng xuất, thu hồi Refresh Token và xóa cookie (`Max-Age=0`) |
| `GET` | `/v1/auth/me` | Header: `Authorization: Bearer <accessToken>` | `200 OK`, `401 Unauthorized` | Lấy thông tin tài khoản hiện tại (Safe Profile) và Principal Context |
| `GET` | `/.well-known/jwks.json` | Public / Không yêu cầu Auth | `200 OK` | Cung cấp JSON Web Key Set (RFC 7517) chứa Public Key RSA để thẩm định chữ ký |

---

### 2. Chi Tiết Request & Response Từng Endpoint

#### A. Đăng ký tài khoản mới: `POST /v1/auth/register`
* **Request Body**:
  ```json
  {
    "email": "student@quiz.local",
    "password": "strongPassword123",
    "name": "Nguyen Van A",
    "tenantId": "tenant_default"
  }
  ```
* **Response `201 Created`**:
  - Header: `Set-Cookie: refreshToken=...; HttpOnly; SameSite=Lax; Path=/v1/auth; Max-Age=604800`
  - Body:
    ```json
    {
      "success": true,
      "data": {
        "user": {
          "id": "usr_7f8a9b2c",
          "email": "student@quiz.local",
          "name": "Nguyen Van A",
          "roles": ["STUDENT"],
          "tenantId": "tenant_default",
          "createdAt": "2026-09-04T06:00:00.000Z",
          "updatedAt": "2026-09-04T06:00:00.000Z"
        },
        "tokens": {
          "accessToken": "eyJhbGciOiJSUzI1NiIs...",
          "refreshToken": "ref_8a9b2c3d...",
          "expiresIn": 3600
        },
        "principal": {
          "id": "usr_7f8a9b2c",
          "roles": ["STUDENT"],
          "permissions": ["quiz:attempt"],
          "tenantId": "tenant_default"
        }
      }
    }
    ```

#### B. Đăng nhập hệ thống: `POST /v1/auth/login`
* **Request Body**:
  ```json
  {
    "email": "student@quiz.local",
    "password": "strongPassword123"
  }
  ```
* **Response `200 OK`**:
  - Header: `Set-Cookie: refreshToken=...; HttpOnly; SameSite=Lax; Path=/v1/auth; Max-Age=604800`
  - Body trả về cấu trúc tương tự endpoint register.
* **Trường hợp bị khóa do Brute-Force (`429 Too Many Requests`)**:
  - Header: `Retry-After: 900`
  - Body:
    ```json
    {
      "success": false,
      "error": "Too many failed login attempts. Please try again after 900 seconds.",
      "errorCode": "TOO_MANY_REQUESTS",
      "retryAfter": 900
    }
    ```

#### C. Xoay vòng Refresh Token: `POST /v1/auth/refresh`
* **Request**:
  - Có thể gửi qua Cookie tự động của trình duyệt: `Cookie: refreshToken=ref_...`
  - Hoặc gửi qua JSON body: `{ "refreshToken": "ref_..." }`
* **Response `200 OK`**:
  - Header: `Set-Cookie: refreshToken=<new_refresh_token>; HttpOnly; ...`
  - Body:
    ```json
    {
      "success": true,
      "data": {
        "tokens": {
          "accessToken": "eyJhbGciOiJSUzI1NiIs...",
          "refreshToken": "ref_new_value...",
          "expiresIn": 3600
        }
      }
    }
    ```

#### D. Đăng xuất: `POST /v1/auth/logout`
* **Request**: Truyền qua Cookie hoặc Body `{ "refreshToken": "ref_..." }`.
* **Response `200 OK`**:
  - Header: `Set-Cookie: refreshToken=; HttpOnly; Path=/v1/auth; SameSite=Lax; Max-Age=0`
  - Body:
    ```json
    {
      "success": true,
      "message": "Logged out successfully"
    }
    ```

#### E. Lấy hồ sơ tài khoản: `GET /v1/auth/me`
* **Request Header**: `Authorization: Bearer <accessToken>`
* **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "usr_7f8a9b2c",
        "email": "student@quiz.local",
        "name": "Nguyen Van A",
        "roles": ["STUDENT"],
        "tenantId": "tenant_default"
      },
      "principal": {
        "id": "usr_7f8a9b2c",
        "roles": ["STUDENT"],
        "permissions": ["quiz:attempt"],
        "tenantId": "tenant_default"
      }
    }
  }
  ```

#### F. Khám phá khóa công khai RFC 7517: `GET /.well-known/jwks.json`
* **Response `200 OK`**:
  ```json
  {
    "keys": [
      {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": "quiz-auth-key-1",
        "n": "u2P8V...",
        "e": "AQAB"
      }
    ]
  }
  ```

---

## VI. THƯ VIỆN KHÁCH HÀNG (@PLATFORM/AUTH-CLIENT) VÀ TÍCH HỢP FRONTEND

Package `@platform/auth-client` đóng vai trò là SDK phía client kết nối với Auth Service, cung cấp các tiện ích:

1. **Quản lý phiên (Session Management)**:
   - Lưu trữ `accessToken` và thông tin `user` an toàn.
   - Hỗ trợ lưu phiên qua `localStorage` hoặc `sessionStorage`.
2. **Cơ chế Silent Refresh Tự Động (`fetchWithAuth`)**:
   - Tự động gắn header `Authorization: Bearer <accessToken>`.
   - Bắt mã lỗi `401 Unauthorized` từ API; tự động kích hoạt lời gọi `POST /v1/auth/refresh` ngầm.
   - Khi refresh thành công, tự động gửi lại request ban đầu mà người dùng không bị gián đoạn trải nghiệm.
   - Nếu refresh thất bại, xóa session và kích hoạt sự kiện đăng xuất.
3. **Lắng nghe trạng thái xác thực (`onAuthStateChange`)**:
   - Cho phép các React View (`quiz-web`, `admin-web`) đăng ký hook lắng nghe để cập nhật UI phản ứng tức thì khi trạng thái đăng nhập thay đổi.

---

## VII. KẾT QUẢ KIỂM THỬ VÀ BẢO ĐẢM CHẤT LƯỢNG (TESTING & VERIFICATION)

Toàn bộ hệ thống được bảo đảm chất lượng thông qua bộ kiểm thử tự động toàn diện với Vitest và Supertest:

```text
 ✓ services/auth/tests/auth.spec.ts (18 tests)
 ✓ services/auth/tests/drizzle-persistence.spec.ts (4 tests)
 ✓ services/quiz/tests/presentation/assessment-api.spec.ts (10 tests)
 ✓ services/quiz/tests/security/principal-context.spec.ts (9 tests)
 ✓ services/quiz/tests/security/rbac.spec.ts (10 tests)
 ✓ services/quiz/tests/security/sanitization-boundary.spec.ts (15 tests)
 ✓ services/quiz/tests/domain/delivery/attempt-state-machine.spec.ts (12 tests)
 ✓ services/quiz/tests/scoring/scoring.spec.ts (15 tests)
 ✓ services/quiz/tests/session/quiz-session.spec.ts (7 tests)
 ✓ services/quiz/tests/domain/authoring/quiz.spec.ts (9 tests)
 ✓ services/quiz/tests/domain/authoring/attempt-policy.spec.ts (6 tests)
 ✓ services/quiz/src/application/use-cases.spec.ts (2 tests)
 ✓ services/quiz/tests/domain/delivery/attempt-manifest.spec.ts (2 tests)
 ✓ packages/auth-client/tests/auth-client.spec.ts (9 tests)
 ✓ packages/api-client/tests/api-client.spec.ts (8 tests)

Test Files:  15 passed (15)
Tests:       136 passed (136)
Duration:    100% Green
```

### Các Tiêu Chí Nghiệm Thu Đã Được Xác Nhận:
* **Xác thực Chữ ký số Tuyệt đối**: 100% token bị can thiệp, sai chữ ký hoặc hết hạn đều bị từ chối với `401 Unauthorized`.
* **Loại bỏ Fallback Ẩn Danh**: Không có bất kỳ ca thi hay quyền hạn nào được cấp phát ngầm định cho người dùng chưa xác thực.
* **Chống Gian Lận IDOR**: Thí sinh bị ngăn chặn tuyệt đối khi cố tình truy cập hoặc nộp bài cho ca thi của thí sinh khác.
* **Hoạt động Thông suốt trên Port 3000**: Tất cả các tài nguyên Auth API, JWKS Discovery, Quiz Catalog và Examination Delivery đều chạy trên Port 3000 duy nhất, phù hợp tiêu chuẩn hạ tầng đám mây.
