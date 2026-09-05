import { createAuthClient, AuthClient } from '@platform/auth-client';
import { createApiClient, ApiClient } from '@platform/api-client';

const STORAGE_WORKSPACE_KEY = 'admin_active_workspace_id';
export const DEFAULT_WORKSPACE_ID = 'tenant_core';

/**
 * Lấy mã tổ chức/workspace đang hoạt động của Admin Portal
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
 * Cập nhật mã tổ chức/workspace đang hoạt động cho Admin Portal
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
 * - Tự động đính kèm header "X-Tenant-ID: <activeWorkspaceId>" theo chuẩn Domain-Driven Tenancy
 * - Cung cấp generic HTTP methods và domain resources
 */
export const apiClient: ApiClient = createApiClient({
  baseUrl: (import.meta as any).env?.VITE_QUIZ_API_URL || '',
  getToken: () => authClient.getAccessToken(),
  getTenantId: () => getActiveWorkspaceId(),
});

export { authClient as auth, apiClient as api };
