import { createAuthClient, AuthClient } from '@platform/auth-client';
import { createApiClient, ApiClient } from '@platform/api-client';

/**
 * Singleton AuthClient cho Admin Portal:
 * - Quản lý token & session đăng nhập của Quản trị viên (ADMIN) và Giảng viên (INSTRUCTOR)
 * - Tự động trích xuất User Profile (roles, permissions)
 */
export const authClient: AuthClient = createAuthClient({
  baseUrl: (import.meta as any).env?.VITE_AUTH_API_URL || '/v1/auth',
});

/**
 * Singleton ApiClient cho Admin Portal kết nối tới Quiz Service:
 * - Tự động gắn Authorization: Bearer <token> từ authClient
 * - Cung cấp generic HTTP methods và domain resources
 */
export const apiClient: ApiClient = createApiClient({
  baseUrl: (import.meta as any).env?.VITE_QUIZ_API_URL || '',
  getToken: () => authClient.getAccessToken(),
});

export { authClient as auth, apiClient as api };
