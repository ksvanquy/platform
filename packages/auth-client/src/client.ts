import type { Principal } from '@platform/contracts';
import {
  SessionManager,
  AuthTokens,
  UserProfile,
  AuthStorage,
} from './session.js';

export interface AuthClientConfig {
  baseUrl?: string;
  storage?: AuthStorage;
  autoRefresh?: boolean;
  fetchFn?: typeof fetch;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponseData {
  tokens: AuthTokens;
  user: UserProfile;
}

export interface RegisterData {
  email: string;
  name: string;
  password: string;
  metadata?: Record<string, unknown>;
}

export interface RegisterResponseData {
  tokens: AuthTokens;
  user: UserProfile;
  principal: Principal;
}

export type AuthStateListener = (isAuthenticated: boolean) => void;

export class AuthClient {
  private baseUrl: string;
  private session: SessionManager;
  private autoRefresh: boolean;
  private fetchFn: typeof fetch;
  private listeners: Set<AuthStateListener> = new Set();
  private refreshPromise: Promise<AuthTokens> | null = null;

  constructor(config: AuthClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? '/v1/auth').replace(/\/$/, '');
    this.session = new SessionManager(config.storage);
    this.autoRefresh = config.autoRefresh ?? true;
    this.fetchFn = config.fetchFn ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as any));
  }

  private async parseJsonResponse(response: Response, actionName: string): Promise<any> {
    try {
      if (typeof (response as any).text === 'function') {
        const text = await response.text();
        if (!text || !text.trim()) {
          throw new Error(
            `Không thể kết nối đến Auth Service (Cổng 3001) - Phản hồi rỗng (HTTP ${response.status}). Vui lòng kiểm tra Auth Service đã chạy bằng lệnh 'pnpm run dev:auth'.`
          );
        }
        try {
          return JSON.parse(text);
        } catch {
          if (!response.ok) {
            throw new Error(`Lỗi kết nối Auth Service (HTTP ${response.status}): ${text.slice(0, 150)}`);
          }
          throw new Error(`Dữ liệu JSON từ Auth Service (${actionName}) không hợp lệ.`);
        }
      }
      return await response.json();
    } catch (err: any) {
      if (err.message && err.message.includes('Auth Service')) {
        throw err;
      }
      if (!response.ok) {
        throw new Error(
          `Không thể kết nối đến Auth Service (HTTP ${response.status}). Vui lòng đảm bảo Auth Service đã chạy trên cổng 3001.`
        );
      }
      throw new Error(`Dữ liệu JSON từ Auth Service (${actionName}) không hợp lệ.`);
    }
  }

  /**
   * Đăng ký tài khoản người dùng mới.
   * Tự động lưu Token và User Profile vào Session.
   */
  async register(data: RegisterData): Promise<RegisterResponseData> {
    const url = `${this.baseUrl}/register`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include' as any,
    });

    const json = await this.parseJsonResponse(response, 'register');
    if (!response.ok || !json.success) {
      throw new Error(json.message || json.error || `Registration failed with status ${response.status}`);
    }

    const resData: RegisterResponseData = json.data;
    this.session.setSession(resData.tokens, resData.user);
    this.notifyListeners(true);
    return resData;
  }

  /**
   * Đăng nhập với Email và Mật khẩu.
   * Lưu Token và User Profile vào Session tự động.
   */
  async login(credentials: LoginCredentials): Promise<LoginResponseData> {
    const url = `${this.baseUrl}/login`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
      credentials: 'include' as any,
    });

    const json = await this.parseJsonResponse(response, 'login');
    if (!response.ok || !json.success) {
      throw new Error(json.message || json.error || `Login failed with status ${response.status}`);
    }

    const data: LoginResponseData = json.data;
    this.session.setSession(data.tokens, data.user);
    this.notifyListeners(true);
    return data;
  }

  /**
   * Lấy thông tin người dùng hiện tại (Current User Profile & Principal) từ Auth Service.
   */
  async me(): Promise<UserProfile> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated: No access token available');
    }

    const url = `${this.baseUrl}/me`;
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include' as any,
    });

    const json = await this.parseJsonResponse(response, 'me');
    if (!response.ok || !json.success) {
      if (response.status === 401) {
        this.session.clear();
        this.notifyListeners(false);
      }
      throw new Error(json.message || json.error || `Failed to fetch user profile with status ${response.status}`);
    }

    const profile: UserProfile = json.data?.profile || json.data?.user || json.data;
    if (profile) {
      this.session.setUser(profile);
    }
    return profile;
  }

  /**
   * Làm mới Access Token sử dụng Refresh Token
   */
  async refresh(): Promise<AuthTokens> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = this.session.getRefreshToken();
    if (!refreshToken) {
      this.logout();
      throw new Error('No refresh token available');
    }

    this.refreshPromise = (async () => {
      try {
        const url = `${this.baseUrl}/refresh`;
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
          credentials: 'include' as any,
        });

        const json = await this.parseJsonResponse(response, 'refresh');
        if (!response.ok || !json.success) {
          this.logout();
          throw new Error(json.message || 'Token refresh failed');
        }

        const tokens: AuthTokens = json.data.tokens || json.data;
        this.session.updateTokens(tokens);
        return tokens;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Đăng xuất và dọn dẹp Session
   */
  async logout(): Promise<void> {
    try {
      const refreshToken = this.session.getRefreshToken();
      if (refreshToken) {
        try {
          const url = `${this.baseUrl}/logout`;
          await this.fetchFn(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
            credentials: 'include' as any,
          });
        } catch {
          // Silently ignore logout request failure, still clear client session
        }
      }
    } finally {
      this.session.clear();
      this.notifyListeners(false);
    }
  }

  /**
   * Wrapper cho fetch tự động gắn Authorization Bearer token và
   * tự động thực hiện Silent Refresh khi nhận HTTP 401 Unauthorized trước khi trả về lỗi.
   */
  async fetchWithAuth(url: string, options: any = {}): Promise<Response> {
    let token = await this.getAccessToken();
    const headers = { ...(options.headers || {}) };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await this.fetchFn(url, {
      ...options,
      headers,
      credentials: options.credentials ?? 'include',
    });

    if (response.status === 401 && this.autoRefresh && this.session.getRefreshToken()) {
      try {
        const refreshed = await this.refresh();
        headers['Authorization'] = `Bearer ${refreshed.accessToken}`;
        response = await this.fetchFn(url, {
          ...options,
          headers,
          credentials: options.credentials ?? 'include',
        });
      } catch {
        // Refresh failed, return original 401 response
      }
    }

    if (response.status === 401) {
      this.session.clear();
      this.notifyListeners(false);
    }

    return response;
  }

  /**
   * Lấy Access Token hiện tại, tự động refresh nếu sắp hết hạn
   */
  async getAccessToken(): Promise<string | null> {
    if (this.session.isExpired() && this.autoRefresh && this.session.getRefreshToken()) {
      try {
        const refreshed = await this.refresh();
        return refreshed.accessToken;
      } catch {
        return null;
      }
    }
    return this.session.getAccessToken();
  }

  /**
   * Lấy User Profile đang lưu trong bộ nhớ / session
   */
  getUser(): UserProfile | null {
    return this.session.getUser();
  }

  /**
   * Lấy Principal đang lưu trong bộ nhớ / session
   */
  getPrincipal(): Principal | null {
    return this.session.getPrincipal();
  }

  /**
   * Kiểm tra xem người dùng đã đăng nhập và token còn hiệu lực không
   */
  isAuthenticated(): boolean {
    return this.session.isAuthenticated();
  }

  /**
   * Kiểm tra xem Access Token hiện tại đã hết hạn (hoặc sắp hết hạn trong 5 giây tới) chưa
   */
  isExpired(): boolean {
    return this.session.isExpired();
  }

  /**
   * Lấy Session Manager bên dưới nếu cần tùy biến sâu
   */
  getSession(): SessionManager {
    return this.session;
  }

  /**
   * Đăng ký lắng nghe sự kiện thay đổi trạng thái xác thực
   */
  onAuthStateChange(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(isAuthenticated: boolean): void {
    this.listeners.forEach((listener) => {
      try {
        listener(isAuthenticated);
      } catch {
        // Ignore listener error
      }
    });
  }
}

/**
 * Factory function để khởi tạo AuthClient
 */
export function createAuthClient(config?: AuthClientConfig): AuthClient {
  return new AuthClient(config);
}
