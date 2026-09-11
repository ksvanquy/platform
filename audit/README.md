# BÁO CÁO AUDIT KIẾN TRÚC & LUỒNG BUSINESS AUTH (AUTHENTICATION & AUTHORIZATION)

> **Dự án**: Quiz & Assessment Microservices Platform  
> **Phạm vi**: Toàn bộ codebase (Auth Service, Gateway, Attempt, Exam, Assessment, Question, Taxonomy, Shared Packages, Admin Web, Quiz Web)  
> **Thời gian thực hiện**: Tháng 09/2026  
> **Trạng thái**: Hoàn thành (Comprehensive Audit)  
> **Tiêu chuẩn tham chiếu**: OWASP ASVS 4.0, NIST SP 800-63B, Zero Trust Architecture

---

## 📑 Mục lục tài liệu Audit

1. **[Báo cáo Audit chi tiết (business-auth-audit.md)](./business-auth-audit.md)**:
   - Phân tích chi tiết từng tầng: Domain Identity, Token Management, API Gateway, Microservice Auth, RBAC, ABAC/Ownership, Frontend Client SDKs.
   - Cơ chế bảo mật trọng yếu: RS256/HS256 Dual Verification, Token Family Revocation & Reuse Detection, Rate Limiting & Anti-Brute-force, Account Deactivation Guard.
   - Đánh giá theo OWASP Top 10 (A01: Broken Access Control, A02: Cryptographic Failures, A07: Identification and Authentication Failures).
   - Ma trận rủi ro & Kế hoạch khắc phục (Hardening Action Plan).

2. **[Ma trận Quyền hạn API & Kiểm soát Sở hữu (matrix-auth-rbac-abac.md)](./matrix-auth-rbac-abac.md)**:
   - Bảng tra cứu toàn diện 40+ endpoints trong hệ sinh thái microservices.
   - Chi tiết: Method, Route, Required Role, Required Permission, ABAC/Ownership Check, Threat Vector & Mitigation.

3. **[Báo cáo Audit Mẫu Seed & Luồng Khởi tạo Ca thi (seed-and-attempt-flow-audit.md)](./seed-and-attempt-flow-audit.md)**:
   - Phân tích sự phù hợp của dữ liệu mẫu seed đối với bộ lọc Cấp học, Khối lớp, Chuyên đề kiến thức.
   - Bóc tách nguyên nhân gốc rễ (RCA) của lỗi `User authentication or userId in body is required to start an attempt`.
   - Ma trận mẫu seed đề xuất phủ đủ 3 cấp học và kế hoạch khắc phục 3 giai đoạn.

4. **[Báo cáo Audit Tính năng Ca thi, Cơ chế Chịu lỗi & Lỗi Ngoại biên (exam-session-resilience-audit.md)](./exam-session-resilience-audit.md)**:
   - Bóc tách nguyên nhân gốc rễ (RCA) hiện tượng khi tắt tab hoặc ấn nhầm Backspace bị mất/thoát vĩnh viễn ca thi hiện tại.
   - Kiểm tra toàn diện 6 lỗi ngoại biên (In-Flight Debounced Autosave Loss, Sequence Number Conflict, Sweeper Grace Period, Deserialization Bug, Multi-tab Racing, v.v.).
   - Ma trận rủi ro và Kế hoạch khắc phục kiến trúc 3 giai đoạn bảo đảm Zero Data Loss và phục hồi ca thi tức thì.

5. **[Báo cáo Audit Lỗi Insecure Direct API Call & Hardcoded Endpoints (insecure-direct-api-call-audit.md)](./insecure-direct-api-call-audit.md)**:
   - Bóc tách rủi ro gọi trực tiếp `fetch()` và hardcode endpoint trong frontend client apps (`apps/admin-web/src/api/admin-api.ts`).
   - Phân tích rủi ro thất bại xác thực (Bypass Silent Token Refresh), gãy định tuyến môi trường Production, thiếu timeout và lỗi parse JSON khi Gateway sập (502/504).
   - Bản đồ rà soát toàn diện các điểm gọi HTTP trên toàn codebase và phương án chuẩn hóa qua `@platform/api-client`.

6. **[Báo cáo Audit Rủi ro Build Frontend lúc Gateway Startup & Phân định Build-Time vs Runtime (frontend-build-lifecycle-audit.md)](./frontend-build-lifecycle-audit.md)**:
   - Thẩm định nhận định: Tách bạch hoàn toàn Build-time (CI/Docker/Deploy) và Runtime (API Gateway & Reverse Proxy).
   - Bóc tách 7 rủi ro vận hành chí mạng: Cold Start Delay & Container CrashLoopBackOff, Event Loop Blocking với `execSync`, Out-of-Memory (OOM) Kill, xung đột Read-only Filesystem, tê liệt Auto-scaling (HPA), và vi phạm Twelve-Factor App.
   - Giải pháp chuẩn hóa: Loại bỏ `execSync` khỏi Gateway, cấu hình Multi-stage Dockerfile và CI/CD Pipeline chuẩn Cloud-Native.

7. **[Báo cáo Audit Phân quyền, Coupling & Tách tầng Security Package (authorization-coupling-and-security-package-audit.md)](./authorization-coupling-and-security-package-audit.md)**:
   - Phân tích rủi ro Coupling khi đưa logic authorization vào gói hợp đồng lớn `@platform/contracts` và việc các microservice phụ thuộc trực tiếp vào `@platform/auth-service`.
   - Bóc tách 5 Anti-patterns: God Contracts Package, IdP Source Leakage, Duplicate Middlewares, Broken PEP, và thiếu Remote JWKS dynamic key discovery.
   - Thiết kế chuẩn hóa mô hình 3 tầng: `Service → @platform/security → @platform/contracts`, với `Auth-service` đóng vai trò Identity Provider độc lập tạo/quản lý danh tính, còn `@platform/security` kiểm tra và thực thi phân quyền.
   - **Đánh giá độc lập & 5 Biện pháp đối phó cạm bẫy kiến trúc**: Tránh "Shared Library Hell", tối ưu Dual-mode CPU (Strict vs Mesh-Trust), phân định ABAC Pure Functions với tầng DB, xử lý Token Revocation tức thì, và quản trị phiên bản SemVer.
   - Bản vẽ kiến trúc chi tiết, sơ đồ tuần tự (Sequence Diagram), ma trận so sánh Trước/Sau và Lộ trình di chuyển 5 bước.

8. **[Báo cáo Audit Xung đột Đồng thời, Mất dữ liệu & Vòng đời Ca thi (attempt-concurrency-and-race-condition-audit.md)](./attempt-concurrency-and-race-condition-audit.md)**:
   - Đánh giá lỗ hổng nghiêm trọng nhất hiện tại trong nghiệp vụ Khảo thí: Xung đột đồng thời (Concurrency) và Tranh chấp ghi đè dữ liệu (Race Conditions) trong `services/attempt`.
   - Bóc tách 5 sự cố trọng yếu: Mất câu trả lời (Lost Updates) khi autosave liên tiếp do ghi đè toàn bộ JSONB; Lùi trạng thái ca thi (State Regression) từ `GRADED` về `IN_PROGRESS`; Nộp bài kép (Double-Submit); Tranh chấp nộp bài phút chót với Sweeper Daemon; và Xung đột nhiều pod khi scale ngang thiếu Distributed Lock.
   - Bản thiết kế khắc phục triệt để: Atomic JSONB Patching (`jsonb_set`), Optimistic Concurrency Control (OCC) với cột `version`, Pessimistic Row Lock (`SELECT ... FOR UPDATE`), và PostgreSQL Advisory Lock (`pg_try_advisory_xact_lock`).


---

## 🎯 Tóm tắt kết quả Audit (Executive Summary)

### 1. Điểm mạnh nổi bật (Architectural Highlights)

| Thành phần | Cơ chế đã hiện thực | Đánh giá |
| :--- | :--- | :--- |
| **Mô hình Định danh** | **Pure Identity Aggregate Root**: Không rò rỉ khái niệm tổ chức/tenancy vào Core IdP, chuẩn hóa theo DDD Clean Architecture. | ⭐ Xuất sắc |
| **Bảo vệ Refresh Token** | **Token Family Rotation & Reuse Detection**: Phát hiện tái sử dụng token ngay lập tức (Hash SHA-256), tự động thu hồi toàn bộ chuỗi token gia đình (Family Revocation) ngăn chặn Token Theft. | ⭐ Xuất sắc |
| **Ký & Xác thực JWT** | **RS256 Asymmetric Encryption** kết hợp fallback HS256: Private Key giữ bí mật tại Auth Service, Downstream Services chỉ cần Public Key để verify offline không gây nghẽn Auth DB. | ⭐ Xuất sắc |
| **Kiểm soát Truy cập (RBAC + ABAC)** | **2 lớp phòng thủ**: API Gateway lọc RBAC thô (Role & Wildcard `*`), Domain Service thực thi ABAC sâu (Resource Ownership, Deadline Tiering, Grace Period). | ⭐ Rất tốt |
| **Bảo vệ Brute Force** | **LoginRateLimiter sliding-window**: Khóa IP sau 5 lần thử sai trong 15 phút, trả về chuẩn RFC `Retry-After: 900`. | ⭐ Tốt |
| **Account Lifecycle** | **Deactivated Account Guard**: Chặn tức thời token của tài khoản bị vô hiệu hóa (`isActive === false`) ngay tại Gateway và Downstream middlewares. | ⭐ Tốt |

---

### 2. Bảng chỉ số Audit (Scorecard)

```
[+] Authentication Architecture      : 9.5 / 10 (A+)
[+] Token Lifecycle & Security       : 9.5 / 10 (A+)
[+] Role-Based Access Control (RBAC) : 9.0 / 10 (A)
[+] Attribute-Based Access (ABAC)   : 9.0 / 10 (A)
[+] Service-to-Service Propagation   : 8.5 / 10 (B+)
[+] Frontend Token Lifecycle         : 8.5 / 10 (B+)
--------------------------------------------------
TỔNG THỂ RỦI RO HỆ THỐNG             : THẤP (LOW RISK)
```

---

## 🔍 Khuyến nghị ưu tiên sản xuất (Production Recommendations)

1. **Phân phối Public Key qua JWKS endpoint (`/.well-known/jwks.json`)**: Chuyển đổi cơ chế chia sẻ RSA Public Key từ shared package sang HTTP JWKS endpoint có TTL cache để thuận tiện xoay key định kỳ (Key Rotation).
2. **Distributed Store cho Rate Limiting & Revocation List**: Đưa Redis vào thay thế in-memory `Map` cho `LoginRateLimiter` khi chạy horizontal multi-instance sau Load Balancer.
3. **Internal Gateway Header Stripping**: Đảm bảo reverse proxy (Nginx / Cloud Run Gateway) luôn strip bỏ các headers giả mạo `x-user-id`, `x-user-roles` từ Internet trước khi đẩy vào downstream services.
