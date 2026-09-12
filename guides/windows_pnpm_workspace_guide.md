# HƯỚNG DẪN CÁC LỆNH THAO TÁC TRỰC TIẾP TRÊN MÁY WINDOWS VỚI PNPM WORKSPACE

> **Mục tiêu:** Cung cấp tài liệu tra cứu toàn diện các câu lệnh thao tác trên hệ điều hành **Windows** (PowerShell, Command Prompt, VS Code Terminal) cho dự án Quiz Platform Monorepo sử dụng **PNPM Workspace**, bao gồm: cài đặt, thao tác cơ sở dữ liệu PostgreSQL (Drizzle Push & Clean Seed), chạy dev servers, build production và kiểm thử tự động.

---

## MỤC LỤC

1. [Chuẩn bị môi trường trên Windows](#1-chuẩn-bị-môi-trường-trên-windows)
2. [Cài đặt thư viện với PNPM Workspace](#2-cài-đặt-thư-viện-với-pnpm-workspace)
3. [Thao tác Cơ sở dữ liệu PostgreSQL (Schema-First Drizzle Push)](#3-thao-tác-cơ-sở-dữ-liệu-postgresql)
4. [Khởi chạy ứng dụng và dịch vụ (Dev Mode)](#4-khởi-chạy-ứng-dụng-và-dịch-vụ-dev-mode)
5. [Biên dịch và đóng gói (Build Production)](#5-biên-dịch-và-đóng-gói-build-production)
6. [Kiểm thử và kiểm tra mã nguồn (Test & Lint)](#6-kiểm-thử-và-kiểm-tra-mã-nguồn-test--lint)
7. [Bảng tra cứu nhanh lệnh PNPM Filter cho từng Package](#7-bảng-tra-cứu-nhanh-lệnh-pnpm-filter)
8. [Xử lý các lỗi phổ biến trên Windows](#8-xử-lý-các-lỗi-phổ-biến-trên-windows)

---

## 1. CHUẨN BỊ MÔI TRƯỜNG TRÊN WINDOWS

### 1.1. Yêu cầu phần mềm
- **Node.js**: Phiên bản 20.x hoặc 22.x LTS trở lên ([Tải tại nodejs.org](https://nodejs.org/)).
- **pnpm**: Trình quản lý gói tối ưu hóa cho monorepo.
  ```powershell
  # Cài đặt pnpm qua npm hoặc corepack trên Windows:
  npm install -g pnpm
  # Hoặc kích hoạt corepack tích hợp sẵn trong Node.js:
  corepack enable
  corepack prepare pnpm@latest --activate
  ```
  Kiểm tra phiên bản:
  ```powershell
  pnpm -v
  ```
- **PostgreSQL**: PostgreSQL 15+ đang chạy dịch vụ (`services.msc`) trên cổng mặc định `5432`.

### 1.2. Thiết lập biến môi trường (.env) ở thư mục gốc
Tạo tệp `.env` tại thư mục gốc của dự án (`quiz-platform-monorepo/.env`):

```env
# ============================================================================
# CƠ SỞ DỮ LIỆU POSTGRESQL THẬT (DATABASE-PER-SERVICE)
# ============================================================================
AUTH_DATABASE_URL=postgres://postgres:root@localhost:5432/auth_db
TAXONOMY_DATABASE_URL=postgres://postgres:root@localhost:5432/taxonomy_db
QUESTION_DATABASE_URL=postgres://postgres:root@localhost:5432/question_db
ASSESSMENT_DATABASE_URL=postgres://postgres:root@localhost:5432/assessment_db
EXAM_DATABASE_URL=postgres://postgres:root@localhost:5432/exam_db
ATTEMPT_DATABASE_URL=postgres://postgres:root@localhost:5432/attempt_db

# ============================================================================
# BẢO MẬT XÁC THỰC (JWT RS256 / SECRETS)
# ============================================================================
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long_for_security
JWT_PRIVATE_KEY=
JWT_PUBLIC_KEY=

# ============================================================================
# CỔNG GIAO TIẾP DỊCH VỤ (SERVICE PORTS)
# ============================================================================
GATEWAY_PORT=3000
AUTH_PORT=3001
TAXONOMY_PORT=3002
QUESTION_PORT=3003
ASSESSMENT_PORT=3004
EXAM_PORT=3005
ATTEMPT_PORT=3006
```

---

## 2. CÀI ĐẶT THƯ VIỆN VỚI PNPM WORKSPACE

Mở **PowerShell** hoặc **Terminal trong VS Code** tại thư mục gốc của dự án:

```powershell
# Cài đặt toàn bộ dependencies cho tất cả packages, services và apps trong monorepo
pnpm install
```

### Thêm hoặc gỡ package:
```powershell
# Cài đặt package dùng chung ở cấp root (-w: workspace root)
pnpm add -w -D typescript @types/node

# Cài đặt package vào MỘT service cụ thể (dùng --filter)
pnpm --filter @platform/auth-service add bcrypt
pnpm --filter @platform/web add lucide-react

# Cài đặt dependency giữa các package nội bộ (Internal Workspace link)
pnpm --filter @platform/auth-service add @platform/contracts
```

---

## 3. THAO TÁC CƠ SỞ DỮ LIỆU POSTGRESQL

Cơ chế hiện tại sử dụng **Schema-First Drizzle Push** kết hợp **Clean Seeding**, đẩy cấu trúc trực tiếp từ mã nguồn `schema.ts` vào PostgreSQL trên Windows mà **không cần sinh bất kỳ file migration trung gian nào**.

### 3.1. Chuẩn bị Database trên PostgreSQL Windows
Mở công cụ quản trị (pgAdmin, DBeaver hoặc SQL Shell `psql`) và tạo 6 database riêng biệt:
```sql
CREATE DATABASE auth_db;
CREATE DATABASE taxonomy_db;
CREATE DATABASE question_db;
CREATE DATABASE assessment_db;
CREATE DATABASE exam_db;
CREATE DATABASE attempt_db;
```

### 3.2. Đẩy Schema (Tạo bảng tự động vào PostgreSQL)
Bạn có thể đẩy schema cho từng service hoặc chạy hàng loạt:

```powershell
# 1. Đẩy schema Auth Service (Users, Roles, Permissions, Tokens)
pnpm run db:push:auth

# 2. Đẩy schema Taxonomy Service (Categories, Topics, Skill Nodes)
pnpm run db:push:taxonomy

# 3. Đẩy schema Question Bank Service (Questions, Answers, Bloom Matrix)
pnpm run db:push:question

# 4. Đẩy schema Assessment Service (Assessment Blueprints, Criteria)
pnpm run db:push:assessment

# 5. Đẩy schema Exam Engine Service (Exam Matrix, Variants 101-104)
pnpm run db:push:exam

# 6. Đẩy schema Attempt Service (Student Attempts, Responses, Audit Logs)
pnpm run db:push:attempt
```

> **Lệnh 1 dòng đẩy toàn bộ schema của cả 6 services (PowerShell):**
> ```powershell
> pnpm run db:push:auth; pnpm run db:push:taxonomy; pnpm run db:push:question; pnpm run db:push:assessment; pnpm run db:push:exam; pnpm run db:push:attempt
> ```

### 3.3. Nạp dữ liệu mẫu sạch chuẩn hóa (Seed Clean Data)
Sau khi các bảng đã được tạo, chạy lệnh seed master:
```powershell
pnpm run seed:all
```
*Lệnh này sẽ tuần tự nạp dữ liệu chuẩn mực theo đúng phụ thuộc: Roles & Permissions $\rightarrow$ Taxonomy $\rightarrow$ Ngân hàng 100 câu hỏi Bloom $\rightarrow$ Ma trận đề thi $\rightarrow$ Phiên thi mẫu.*

### 3.4. Seed riêng từng service khi cần
```powershell
pnpm run db:seed:auth
pnpm run db:seed:taxonomy
pnpm run db:seed:question
pnpm run db:seed:assessment
pnpm run db:seed:exam
pnpm run db:seed:attempt
```

### 3.5. Làm mới hoàn toàn Database (Reset sạch sẽ 100%)
Khi bạn thay đổi nhiều trường trong `schema.ts` và muốn làm mới hoàn toàn dữ liệu:
1. Chạy câu lệnh SQL trong `psql` / DBeaver / pgAdmin:
   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   ```
2. Đẩy lại schema và nạp dữ liệu:
   ```powershell
   pnpm run db:push:auth; pnpm run db:push:taxonomy; pnpm run db:push:question; pnpm run db:push:assessment; pnpm run db:push:exam; pnpm run db:push:attempt
   pnpm run seed:all
   ```

---

## 4. KHỞI CHẠY ỨNG DỤNG VÀ DỊCH VỤ (DEV MODE)

### 4.1. Khởi chạy toàn bộ hệ thống qua Gateway (Khuyến nghị)
API Gateway tích hợp sẵn cả 6 microservices và phục vụ frontend tại cổng **3000**:
```powershell
pnpm run dev
# hoặc:
pnpm run dev:gateway
```
Sau khi khởi động, mở trình duyệt:
- **Ứng dụng thi học viên (Quiz Web):** `http://localhost:3000/`
- **Cổng quản trị khảo thí (Admin Web):** `http://localhost:3000/admin`
- **API Gateway Root & Discovery:** `http://localhost:3000/v1/time`

### 4.2. Khởi chạy riêng rẽ từng Frontend Client
Nếu bạn muốn dùng Vite Dev Server với Hot-Module-Replacement (HMR) độc lập:
```powershell
# Chạy ứng dụng Quiz Web (mặc định cổng 5173):
pnpm run dev:web
# hoặc:
pnpm --filter @platform/web dev

# Chạy cổng quản trị Admin Web (mặc định cổng 5174):
pnpm run dev:admin
# hoặc:
pnpm --filter @platform/admin-web dev
```

### 4.3. Khởi chạy riêng rẽ từng Microservice độc lập
Nếu bạn đang phát triển hoặc debug sâu một backend service cụ thể:
```powershell
# Chạy Auth Service độc lập:
pnpm run dev:auth

# Chạy Taxonomy Service độc lập:
pnpm run dev:taxonomy

# Chạy Question Service độc lập:
pnpm run dev:question

# Chạy Assessment Service độc lập:
pnpm run dev:assessment

# Chạy Exam Service độc lập:
pnpm run dev:exam

# Chạy Attempt Service độc lập:
pnpm run dev:attempt
```

---

## 5. BIÊN DỊCH VÀ ĐÓNG GÓI (BUILD PRODUCTION)

### 5.1. Build các Packages dùng chung (Contracts, Security, Clients)
Trước khi build toàn hệ thống lần đầu hoặc sau khi sửa `@platform/contracts`:
```powershell
pnpm run build:packages
```

### 5.2. Build các ứng dụng Frontend (Tạo thư mục `dist`)
```powershell
pnpm run build:frontend:cdn
```
*Lệnh này sẽ biên dịch `apps/web/dist` và `apps/admin-web/dist` để Gateway có thể phục vụ tĩnh.*

### 5.3. Build toàn bộ dự án
```powershell
pnpm run build
```

---

## 6. KIỂM THỬ VÀ KIỂM TRA MÃ NGUỒN (TEST & LINT)

### 6.1. Chạy toàn bộ bài kiểm thử tự động (Vitest)
```powershell
pnpm test
```

### 6.2. Chạy kiểm thử cho từng Service cụ thể
```powershell
# Chạy test Auth Service:
pnpm --filter @platform/auth-service test

# Chạy test Question Bank:
pnpm --filter @platform/question-service test

# Chạy test Exam Engine:
pnpm --filter @platform/exam-service test

# Chạy test Attempt Service:
pnpm --filter @platform/attempt-service test
```

### 6.3. Chạy test giao diện tương tác (Watch Mode)
```powershell
npx vitest
```

### 6.4. Kiểm tra kiểu dữ liệu TypeScript (Lint)
```powershell
pnpm run lint
```

---

## 7. BẢNG TRA CỨU NHANH LỆNH PNPM FILTER

Trong `pnpm-workspace.yaml`, tên định danh của từng package được định nghĩa trong `package.json` tương ứng:

| Tên Package | Thư mục | Lệnh Dev | Lệnh Test |
| :--- | :--- | :--- | :--- |
| `@platform/gateway` | `services/gateway` | `pnpm --filter @platform/gateway dev` | `pnpm --filter @platform/gateway test` |
| `@platform/auth-service` | `services/auth` | `pnpm --filter @platform/auth-service dev` | `pnpm --filter @platform/auth-service test` |
| `@platform/taxonomy-service` | `services/taxonomy` | `pnpm --filter @platform/taxonomy-service dev` | `pnpm --filter @platform/taxonomy-service test` |
| `@platform/question-service` | `services/question` | `pnpm --filter @platform/question-service dev` | `pnpm --filter @platform/question-service test` |
| `@platform/assessment-service` | `services/assessment` | `pnpm --filter @platform/assessment-service dev` | `pnpm --filter @platform/assessment-service test` |
| `@platform/exam-service` | `services/exam` | `pnpm --filter @platform/exam-service dev` | `pnpm --filter @platform/exam-service test` |
| `@platform/attempt-service` | `services/attempt` | `pnpm --filter @platform/attempt-service dev` | `pnpm --filter @platform/attempt-service test` |
| `@platform/web` | `apps/web` | `pnpm --filter @platform/web dev` | `pnpm --filter @platform/web test` |
| `@platform/admin-web` | `apps/admin-web` | `pnpm --filter @platform/admin-web dev` | `pnpm --filter @platform/admin-web test` |
| `@platform/contracts` | `packages/contracts` | `pnpm --filter @platform/contracts build` | - |

---

## 8. XỬ LÝ CÁC LỖI PHỔ BIẾN TRÊN WINDOWS

### 8.1. Lỗi PowerShell: `File ... cannot be loaded because running scripts is disabled on this system`
- **Nguyên nhân**: Windows PowerShell mặc định chặn thực thi script (`ExecutionPolicy: Restricted`).
- **Khắc phục**: Mở PowerShell với quyền Administrator và chạy lệnh:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

### 8.2. Lỗi cổng bị chiếm dụng: `Error: listen EADDRINUSE: address already in use 0.0.0.0:3000`
- **Nguyên nhân**: Một tiến trình Node.js trước đó chưa được tắt hoàn toàn.
- **Khắc phục trên Windows PowerShell**:
  ```powershell
  # Tìm PID đang chiếm cổng 3000:
  Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess
  
  # Dừng tiến trình đó ngay lập tức:
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
  ```
  *(Hoặc mở **Task Manager** (`Ctrl + Shift + Esc`) $\rightarrow$ Tìm `Node.js JavaScript Runtime` $\rightarrow$ Chọn `End task`).*

### 8.3. Dọn dẹp bộ nhớ đệm (Clean PNPM Cache & Reinstall)
Khi gặp xung đột phiên bản package hoặc lỗi symlink workspace trên Windows:
```powershell
# Xóa thư mục node_modules trên toàn bộ workspace (PowerShell):
Get-ChildItem -Path . -Include "node_modules" -Recurse -Directory | Remove-Item -Recurse -Force

# Cài đặt lại sạch sẽ:
pnpm install
```

### 8.4. Lỗi ký tự ngắt dòng (CRLF vs LF) trên Windows
Nếu Git trên Windows tự động đổi đuôi dòng gây cảnh báo linter:
```powershell
git config core.autocrlf true
```
```powershell
copy .env.example .env
```
---

*Tài liệu được cập nhật cho phiên bản hệ thống Microservices Monorepo với Drizzle ORM và PNPM Workspace.*
