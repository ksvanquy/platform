import { createAuthClient, AuthClient } from '@platform/auth-client';
import { createApiClient, ApiClient } from '@platform/api-client';

/**
 * Singleton AuthClient phục vụ toàn bộ Frontend:
 * - Tự động quản lý Access Token & Refresh Token trong session
 * - Tự động decode và lưu trữ Principal/User Profile
 * - Frontend không cần tự implement JWT handling ở nhiều nơi
 */
export const authClient: AuthClient = createAuthClient({
  baseUrl: (import.meta as any).env?.VITE_AUTH_API_URL || '/v1/auth',
});

/**
 * Singleton ApiClient kết nối tới Quiz Service:
 * - Tự động inject header "Authorization: Bearer <token>" từ authClient
 * - Cung cấp generic HTTP methods và typed domain resources (quizzes, sessions)
 */
export const apiClient: ApiClient = createApiClient({
  baseUrl: (import.meta as any).env?.VITE_QUIZ_API_URL || '',
  getToken: () => authClient.getAccessToken(),
});
