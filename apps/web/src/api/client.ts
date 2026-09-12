import { createAuthClient, AuthClient } from '@platform/auth-client';
import { createApiClient, ApiClient } from '@platform/api-client';
import { TimeSyncManager } from '../utils/TimeSyncManager.js';

/**
 * Singleton AuthClient phục vụ toàn bộ Frontend:
 * - Tự động quản lý Access Token & Refresh Token trong session
 * - Tự động decode và lưu trữ Principal/User Profile
 * - Frontend không cần tự implement JWT handling ở nhiều nơi
 */
const gatewayBaseUrl = (import.meta as any).env?.VITE_API_GATEWAY_URL || '';

export const authClient: AuthClient = createAuthClient({
  baseUrl:
    (import.meta as any).env?.VITE_AUTH_API_URL ||
    (gatewayBaseUrl ? `${gatewayBaseUrl.replace(/\/$/, '')}/v1/auth` : '/v1/auth'),
});

/**
 * Singleton ApiClient kết nối tới Quiz Service / API Gateway:
 * - Tự động inject header "Authorization: Bearer <token>" từ authClient
 * - Cung cấp generic HTTP methods, typed domain resources (exams, attempts, delivery)
 * - Tự động đồng bộ đồng hồ máy chủ (Cristian Algorithm clock offset)
 * - Tương thích Decoupled Static Hosting khi frontend chạy trên CDN độc lập
 */
export const apiClient: ApiClient = createApiClient({
  baseUrl:
    (import.meta as any).env?.VITE_QUIZ_API_URL ||
    (gatewayBaseUrl ? gatewayBaseUrl.replace(/\/$/, '') : ''),
  getToken: () => authClient.getAccessToken(),
  onTimeSync: (serverTime) => {
    TimeSyncManager.getInstance().syncFromTimestamp(serverTime);
  },
});

/**
 * Delivery API alias cho Web Client
 */
export const quizApi = apiClient.delivery;

