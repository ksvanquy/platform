import { createAuthClient, AuthClient } from '@platform/auth-client';
import { createApiClient, ApiClient } from '@platform/api-client';

const STORAGE_WORKSPACE_KEY = 'quiz_active_workspace_id';
export const DEFAULT_WORKSPACE_ID = 'tenant_core';

/**
 * Lấy mã tổ chức/workspace đang hoạt động của phiên làm việc
 */
export function getActiveWorkspaceId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_WORKSPACE_KEY) || DEFAULT_WORKSPACE_ID;
    }
  } catch {
    // fallback
  }
  return DEFAULT_WORKSPACE_ID;
}

/**
 * Cập nhật mã tổ chức/workspace đang hoạt động
 */
export function setActiveWorkspaceId(workspaceId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_WORKSPACE_KEY, workspaceId.trim() || DEFAULT_WORKSPACE_ID);
    }
  } catch {
    // fallback
  }
}

export const getActiveTenantId = getActiveWorkspaceId;
export const setActiveTenantId = setActiveWorkspaceId;

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

export { authClient as auth, apiClient as api };
