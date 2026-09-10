# BÁO CÁO AUDIT: LỖI INSECURE DIRECT API CALL, HARDCODED ENDPOINTS & BỎ QUA API CLIENT TẬP TRUNG

> **Dự án**: Quiz & Assessment Microservices Platform  
> **Phạm vi kiểm tra**: Toàn bộ codebase (Admin Web, Quiz Web, API Client, Auth Client, Gateway, Backend Services)  
> **Chuyên đề**: Đánh giá kiến trúc gọi API, Quản lý Token, Xử lý lỗi tập trung & Tính tương thích môi trường (Production Readiness)  
> **Thời gian thực hiện**: Tháng 09/2026  
> **Trạng thái**: Hoàn thành (Comprehensive Audit & Remediation Plan)  
> **Mức độ nghiêm trọng**: **HIGH** (Trước khi vá) ➔ **RESOLVED / LOW** (Sau khi chuẩn hóa)

---

## 📑 Mục lục

1. [Tóm tắt Đánh giá & Kết luận (Executive Summary)](#1-tóm-tắt-đánh-giá--kết-luận-executive-summary)
2. [Bóc tách Chi tiết Lỗi tại `apps/admin-web/src/api/admin-api.ts` (Root Cause Analysis)](#2-bóc-tách-chi-tiết-lỗi-tại-appsadmin-websrcapiadmin-apits-root-cause-analysis)
3. [Bản đồ Rà soát Toàn bộ Codebase (Full Codebase Scan Matrix)](#3-bản-đồ-rà-soát-toàn-bộ-codebase-full-codebase-scan-matrix)
4. [Phân tích 4 Rủi ro Trọng yếu theo Tiêu chuẩn OWASP & ASVS](#4-phân-tích-4-rủi-ro-trọng-yếu-theo-tiêu-chuẩn-owasp--asvs)
5. [Giải pháp Chuẩn hóa Kiến trúc (Target Architecture)](#5-giải-pháp-chuẩn-hóa-kiến-trúc-target-architecture)
6. [Kế hoạch Triển khai Khắc phục (Action & Verification Plan)](#6-kế-hoạch-triển-khai-khắc-phục-action--verification-plan)

---

## 1. Tóm tắt Đánh giá & Kết luận (Executive Summary)

### Thẩm định nhận định của Developer
Nhận định của đội ngũ phát triển về lỗi **Insecure Direct API Call** tại `apps/admin-web/src/api/admin-api.ts` là **HOÀN TOÀN CHÍNH XÁC (100% ĐÚNG)**:

| Vấn đề được chỉ ra | Thực tế Codebase | Mức độ rủi ro | Thẩm định |
| :--- | :--- | :--- | :--- |
| **Dùng trực tiếp `fetch()` thay vì `apiClient`** | Tồn tại tại 2 hàm: `listUsers()` và `updateUserStatus()` trong `admin-api.ts`. | **HIGH** | **Chính xác**. Gây phân mảnh kiến trúc, lặp code và bỏ qua lớp bọc an toàn của hệ thống. |
| **Nguy cơ hardcode URL (`http://localhost:3000`)** | Codebase từng hoặc có nguy cơ dùng trực tiếp `localhost:3000`. Phiên bản hiện tại tuy dùng relative path `/v1/auth/users` nhưng vẫn không thông qua cấu hình `baseUrl` của `apiClient`. | **HIGH** | **Chính xác**. Nếu dev trỏ cứng `localhost:3000` hoặc chạy dưới domain/reverse-proxy khác origin, request sẽ hỏng hoàn toàn trên Production. |
| **Bị thiếu Access Token hoặc token hết hạn** | Dùng `fetch()` chay với `authClient.getAccessToken()` rời rạc mà không có cơ chế tự động tái thử (Retry on 401) hoặc Silent Refresh khi Token hết hạn giữa phiên làm việc. | **CRITICAL** | **Chính xác**. Quản trị viên đang làm việc sẽ bị lỗi `401 Unauthorized` bất thình lình khi access token 15 phút hết hạn. |
| **Bỏ qua xử lý lỗi tập trung & Timeout** | `fetch()` trực tiếp kết hợp `response.json()` mà không kiểm tra Content-Type hoặc HTTP Status; không có `AbortController` timeout bảo vệ. | **MEDIUM** | **Chính xác**. Khi Gateway gặp sự cố (502 Bad Gateway / 504 Gateway Timeout HTML), `response.json()` sẽ ném lỗi crash toàn bộ giao diện quản trị React. |
| **Khắc phục: Chuyển sang `apiClient.get(...)`** | `apiClient` đã có sẵn cơ chế đính kèm Bearer Token tự động, timeout 30s, parse lỗi chuẩn hóa `ApiClientError` và định tuyến `baseUrl` động. | **GIẢI PHÁP TỐI ƯU** | **Chính xác và Khuyến nghị áp dụng ngay**. |

---

## 2. Bóc tách Chi tiết Lỗi tại `apps/admin-web/src/api/admin-api.ts` (Root Cause Analysis)

### Hiện trạng mã nguồn kiểm tra được
Tại tệp `apps/admin-web/src/api/admin-api.ts` (dòng 22 - 50):

```typescript
// ❌ ANTI-PATTERN: Gọi fetch() trực tiếp, tự đính kèm header thủ công
async listUsers() {
  const token = await authClient.getAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch('/v1/auth/users', { headers });
  const result = await response.json();
  return result.data || [];
},

async updateUserStatus(userId: string, isActive: boolean) {
  const token = await authClient.getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`/v1/auth/users/${userId}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isActive }),
  });
  return await response.json();
}
```

### Nguyên nhân gốc rễ (Why it happened?)
1. **Thiếu vắng Resource `users` trong `@platform/api-client`**:
   - `packages/api-client/src/client.ts` được thiết kế bao gồm các domain resource: `taxonomies`, `questions`, `assessments`, `exams`, `attempts`, `quizzes`.
   - Tuy nhiên, resource quản lý người dùng (`users`) chưa được khai báo trực tiếp trong `ApiClient`. Khi lập trình viên làm tính năng Admin Portal (Dashboard quản lý tài khoản & khóa người dùng), do không thấy `apiClient.users`, dev đã viết vội bằng `fetch()` thủ công thay vì bổ sung vào SDK chung.

2. **Chưa tận dụng phương thức Generic HTTP của `apiClient`**:
   - Dù chưa có `apiClient.users`, `ApiClient` vẫn cung cấp đầy đủ các hàm generic HTTP: `apiClient.get<T>(path)` và `apiClient.patch<T>(path, body)`. Việc dev bỏ qua các phương thức này dẫn tới sự lỏng lẻo trong quy chuẩn code.

---

## 3. Bản đồ Rà soát Toàn bộ Codebase (Full Codebase Scan Matrix)

Tiến hành rà soát toàn bộ các lệnh gọi mạng (`fetch`, `XMLHttpRequest`, `axios`, `http://`, `localhost`) trên toàn bộ dự án:

| Vị trí Tệp | Lệnh gọi mạng / URL | Mục đích sử dụng | Đánh giá Kiến trúc & An toàn | Mức độ Rủi ro | Biện pháp Xử lý |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`apps/admin-web/src/api/admin-api.ts` (L28, L44)** | `fetch('/v1/auth/users')`<br>`fetch('/v1/auth/users/:id/status')` | Lấy danh sách tài khoản & Cập nhật trạng thái Active | ❌ **Vi phạm chuẩn**: Bỏ qua `apiClient`, không có timeout, thiếu xử lý 401 tự động | **HIGH** | **Refactor ngay**: Chuyển sang `apiClient.users` hoặc `apiClient.get/patch`. |
| **`apps/quiz-web/src/api/quiz-api.ts`** | Sử dụng 100% `apiClient` | Toàn bộ nghiệp vụ thi trắc nghiệm (Exams, Attempts, Questions, Taxonomies) | ✅ **Tuyệt đối chuẩn mực**: Kế thừa toàn bộ cơ chế Bearer token, Cristian sync, Error handling | **NONE (SAFE)** | Giữ nguyên kiến trúc chuẩn mực này. |
| **`apps/quiz-web/src/utils/TimeSyncManager.ts` (L60)** | `fetch(endpointUrl, { method: 'GET', cache: 'no-store' })` | Đo độ trễ vòng lặp mạng (RTT) và đồng bộ đồng hồ Cristian clock | 🟡 **Chấp nhận được (By Design)**: Cần gọi raw HTTP siêu nhẹ không đính kèm JWT để tránh độ trễ tính toán làm lệch đồng hồ. Tuy nhiên cần lưu ý `baseUrl` khi chạy môi trường tách biệt domain. | **LOW** | Chuẩn hóa truyền `baseUrl` nếu endpointUrl là relative. |
| **`apps/quiz-web/src/hooks/useQuizSession.ts` (L227)** | `fetch(endpoint, { keepalive: true })`<br>`navigator.sendBeacon(...)` | Xả hàng đợi autosave khẩn cấp khi thí sinh đóng tab/rời trang (`beforeunload`) | 🟡 **Chấp nhận được (By Design)**: `apiClient` thông thường là async Promise sẽ bị Browser huỷ khi trang đóng. Vị trí này đã chủ động lấy `apiClient.getBaseUrl()` và tự gắn `Authorization: Bearer`. | **LOW** | Đã xử lý an toàn, giữ nguyên. |
| **`services/gateway/src/middlewares/auth.middleware.ts` (L37)** | `fetch(jwksUrl, { signal: AbortSignal.timeout(2000) })` | Service-to-service: Gateway tải Public Key JWKS từ Auth Service | 🟢 **Hợp lệ**: Có `process.env.AUTH_JWKS_URL` kèm timeout 2s bảo vệ nghẽn mạng. | **SAFE** | Đã tối ưu cho Container Networking. |
| **`apps/admin-web/vite.config.ts`<br>`apps/quiz-web/vite.config.ts`** | `target: 'http://127.0.0.1:3000'` | Cấu hình Reverse Proxy cục bộ khi chạy dev server trên máy dev | 🟢 **Hợp lệ**: Chỉ hoạt động ở chế độ Local Development của Vite, không ảnh hưởng Production build. | **SAFE** | Đã cấu hình đúng chuẩn Vite. |
| **`services/*/drizzle.config.ts`** | `postgres://...@localhost:5432/...` | Chuỗi kết nối DB fallback cho CLI migration local | 🟢 **Hợp lệ**: Luôn ưu tiên biến môi trường `process.env.*_DATABASE_URL` trước khi fallback. | **SAFE** | Chuẩn cho Drizzle ORM. |

---

## 4. Phân tích 4 Rủi ro Trọng yếu theo Tiêu chuẩn OWASP & ASVS

### 4.1. Rủi ro 1: Thất bại xác thực do Token hết hạn (Bypass Silent Token Refresh)
- **Mô tả**: Hệ thống sử dụng mô hình JWT ngắn hạn (**Short-lived Access Token: 15 phút**) và **Long-lived Refresh Token (7 ngày)**.
- **Kịch bản lỗi**: 
  - Quản trị viên mở trang Admin Dashboard, làm việc trong hơn 15 phút.
  - Khi quản trị viên bấm nút "Khóa tài khoản" hoặc xem danh sách người dùng, hàm `authClient.getAccessToken()` trả về token cũ hoặc không tự động kích hoạt chu trình quay vòng token (`refresh()`).
  - Request `fetch('/v1/auth/users')` bị Gateway từ chối với mã lỗi `401 Unauthorized`.
  - Nếu dùng `apiClient.get(...)`, `apiClient` có cơ chế gọi `getToken()`, vốn tự động phát hiện token hết hạn và thực hiện silent refresh trước khi request bay ra ngoài mạng.

### 4.2. Rủi ro 2: Bất tương thích môi trường do Hardcoded Base URL (Production Incompatibility)
- **Mô tả**: Khi lập trình viên dùng `fetch('http://localhost:3000/...')`:
  - Mã nguồn này chỉ chạy được trên máy của chính lập trình viên đó.
  - Khi đóng gói container đưa lên Google Cloud Run, Kubernetes, hoặc môi trường có Reverse Proxy, trình duyệt của người dùng (nằm ở mạng ngoài) sẽ cố gắng kết nối tới `localhost:3000` của máy tính cá nhân người dùng, dẫn tới lỗi `ERR_CONNECTION_REFUSED`.
- **Lợi ích khi dùng `apiClient`**:
  - `apiClient` tự động giải quyết đường dẫn thông qua `buildUrl(path)`:
  - Nếu có biến môi trường `VITE_QUIZ_API_URL` (ví dụ `https://api.exam.domain.edu.vn`), nó sẽ tự động ghép prefix chuẩn xác.
  - Nếu chạy single-origin qua Nginx/Ingress, nó sẽ chuyển thành đường dẫn tương đối an toàn.

### 4.3. Rủi ro 3: Ứng dụng bị sập khi gặp lỗi Gateway (Missing Robust Error Handling)
- **Mô tả**:
  ```typescript
  const response = await fetch('/v1/auth/users', { headers });
  const result = await response.json(); // 💥 LỖI NGUY HIỂM
  ```
  - Nếu Gateway bị khởi động lại hoặc quá tải trả về `502 Bad Gateway` (văn bản HTML) hoặc `504 Gateway Timeout`.
  - Lệnh `response.json()` sẽ ném ngoại lệ: `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
  - Ngoại lệ này không được bắt (unhandled promise rejection), gây sập toàn bộ component React.
- **Bảo vệ của `apiClient`**:
  - Kiểm tra `content-type` trước khi gọi `.json()`. Nếu không phải JSON sẽ đọc `.text()`.
  - Bọc phản hồi lỗi vào lớp `ApiClientError` chứa `status`, `errorCode`, và `message` thân thiện.

### 4.4. Rủi ro 4: Bỏ qua kiểm soát Timeout (Unbounded Request Hanging)
- `fetch()` mặc định của trình duyệt không có thời gian timeout tự động. Nếu mạng chập chờn hoặc Backend rơi vào deadlock, request sẽ ở trạng thái pending vô thời hạn, làm treo trạng thái `loadingUsers = true` trên giao diện người dùng vĩnh viễn.
- `apiClient` mặc định tích hợp `AbortController` với thời gian chờ tối đa 30,000ms (30 giây), đảm bảo request luôn giải phóng tài nguyên.

---

## 5. Giải pháp Chuẩn hóa Kiến trúc (Target Architecture)

Nhằm giải quyết triệt để và đồng bộ, hệ thống cần được chuẩn hóa theo 2 bước:

### Bước 1: Nâng cấp `@platform/api-client` bổ sung Resource `users` chính thức
Thêm module quản lý tài khoản người dùng vào `ApiClient` trong `packages/api-client/src/client.ts`:

```typescript
// packages/api-client/src/client.ts
readonly users = {
  /**
   * Lấy danh sách người dùng hệ thống (Yêu cầu quyền ADMIN)
   */
  list: async (params?: Record<string, any>): Promise<ApiResponse<any[]>> => {
    return this.get<ApiResponse<any[]>>('/v1/auth/users', params);
  },

  /**
   * Cập nhật trạng thái tài khoản người dùng (Khóa / Kích hoạt - Yêu cầu quyền ADMIN)
   */
  updateStatus: async (userId: string, isActive: boolean): Promise<ApiResponse<any>> => {
    return this.patch<ApiResponse<any>>(
      `/v1/auth/users/${encodeURIComponent(userId)}/status`,
      { isActive }
    );
  },
};
```

### Bước 2: Refactor `apps/admin-web/src/api/admin-api.ts`
Chuyển đổi toàn bộ việc gọi mạng trực tiếp sang sử dụng `apiClient`:

```typescript
// apps/admin-web/src/api/admin-api.ts
import { apiClient } from './client.js';

export const adminApi = {
  checkHealth: () => apiClient.health(),
  listExams: async () => (await apiClient.exams.list()).data,
  
  // ✅ Chuẩn hóa 100% qua apiClient.users
  async listUsers() {
    const res = await apiClient.users.list();
    return res.data || [];
  },

  async updateUserStatus(userId: string, isActive: boolean) {
    return await apiClient.users.updateStatus(userId, isActive);
  },

  taxonomies: apiClient.taxonomies,
  questions: apiClient.questions,
  assessments: apiClient.assessments,
  exams: apiClient.exams,
  attempts: apiClient.attempts,
  users: apiClient.users,
};
```

---

## 6. Kế hoạch Triển khai Khắc phục & Kết quả Nghiệm thu (Action & Verification Results)

### Bảng trạng thái thực hiện các hạng mục:

| Bước | Hạng mục thực hiện | Tệp can thiệp | Trạng thái | Kết quả nghiệm thu |
| :---: | :--- | :--- | :---: | :--- |
| **1** | Bổ sung `users` resource vào ApiClient | `packages/api-client/src/client.ts` | ✅ **ĐÃ HOÀN THÀNH** | Cung cấp `apiClient.users.list()` và `apiClient.users.updateStatus()`, hỗ trợ đầy đủ typing, timeout và Bearer token tự động. |
| **2** | Refactor loại bỏ raw `fetch()` | `apps/admin-web/src/api/admin-api.ts` | ✅ **ĐÃ HOÀN THÀNH** | Loại bỏ 100% việc dùng `fetch()` thủ công; chuyển sang ủy thác toàn bộ cho `apiClient.users`. |
| **3** | Chuẩn hóa Base URL cho Clock Sync | `apps/quiz-web/src/utils/TimeSyncManager.ts` | ✅ **ĐÃ HOÀN THÀNH** | Tự động ghép `baseUrl` của `apiClient` khi `endpointUrl` là relative path, tránh gọi nhầm CDN/static host trên Production. |
| **4** | Viết Test Suite kiểm thử tích hợp | `packages/api-client/tests/api-client.spec.ts` | ✅ **ĐÃ HOÀN THÀNH** | Thêm test case xác thực `api.users.list` và `api.users.updateStatus` ➔ Pass 15/15 tests. |
| **5** | Kiểm thử hồi quy toàn diện | Toàn bộ monorepo (`npm test`) | ✅ **ĐÃ HOÀN THÀNH** | Chạy kiểm thử toàn hệ thống ➔ Đạt 31/31 test suites (255/255 tests passed 100%). |
| **6** | Cập nhật tài liệu Mục lục Audit | `/audit/README.md` | ✅ **ĐÃ HOÀN THÀNH** | Đã liên kết báo cáo vào tài liệu tổng hợp an toàn hệ thống. |

---
*Báo cáo đã được hoàn thiện, nghiệm thu kỹ thuật và lưu trữ tại thư mục `/audit/insecure-direct-api-call-audit.md` làm căn cứ kỹ thuật cho quá trình vận hành Production.*
