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
