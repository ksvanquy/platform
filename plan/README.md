# Kế Hoạch & Tài Liệu Chuyển Đổi Hệ Thống (Architecture & Migration Plans)

Thư mục này chứa các tài liệu phân tích kiến trúc, chiến lược refactor và kế hoạch từng bước nhằm tối ưu hóa và đơn giản hóa hệ thống Quiz.

---

## Danh Sách Tài Liệu

1. **[Kế Hoạch Loại Bỏ Multi-Tenant & Đơn Giản Hóa Hệ Thống Quiz](./SIMPLIFY_QUIZ_SINGLE_TENANT_PLAN.md)**
   - Phân tích hiện trạng kiến trúc (Auth Service Generic Identity vs. Quiz Service Multi-Tenancy).
   - Động lực và lợi ích của việc chuyển đổi sang mô hình Single-Tenant / Flat Organization.
   - Bản đồ tác động chi tiết (Impact Matrix across Database, Domain, Application, Presentation, Contracts, Client & Frontends).
   - Lộ trình 5 giai đoạn thực thi an toàn (Phased Rollout).
   - Chiến lược Migration dữ liệu & Database DDL (Drizzle ORM).
   - Chiến lược tương thích ngược (Backward Compatibility) và Kế hoạch Rollback dự phòng.

2. **[Hướng Dẫn Thực Thi Từng Bước (Step-by-Step Implementation Guide)](./MIGRATION_STEP_BY_STEP_GUIDE.md)**
   - Danh sách file cần sửa / xóa / thêm mới.
   - Code diff mẫu cho từng tầng kiến trúc (Schema, Domain, Use-cases, Middlewares, Routes, Frontends).
   - Các lệnh kiểm tra, linting và chạy kiểm thử tự động (Unit & Integration Tests).
