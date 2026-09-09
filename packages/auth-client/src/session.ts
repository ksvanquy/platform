import type { Principal } from '@platform/contracts';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn?: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  roles: readonly string[];
  permissions?: readonly string[];
  metadata?: Record<string, unknown>;
  avatarUrl?: string;
  [key: string]: any;
}

export interface AuthSessionData {
  tokens: AuthTokens | null;
  user: UserProfile | null;
  principal: Principal | null;
  expiresAt?: number | null;
}

export interface AuthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryAuthStorage implements AuthStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export class BrowserLocalStorage implements AuthStorage {
  getItem(key: string): string | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage quota exceeded or disabled
    }
  }

  removeItem(key: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
}

export const AUTH_STORAGE_KEY = 'platform_auth_session';

/**
 * Decodes standard JWT payload without requiring native buffer or external libraries
 */
export function decodeJwtPayload<T = any>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // Base64url decode
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const globalBuf = (globalThis as any).Buffer;
    if (typeof atob === 'function') {
      return JSON.parse(atob(base64));
    }
    if (globalBuf) {
      return JSON.parse(globalBuf.from(base64, 'base64').toString('utf8'));
    }
    return null;
  } catch {
    return null;
  }
}

export class SessionManager {
  private storage: AuthStorage;
  private sessionData: AuthSessionData;

  constructor(storage?: AuthStorage) {
    this.storage =
      storage ??
      (typeof window !== 'undefined' && window.localStorage
        ? new BrowserLocalStorage()
        : new MemoryAuthStorage());
    this.sessionData = this.loadFromStorage();
  }

  private loadFromStorage(): AuthSessionData {
    try {
      const raw = this.storage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed: AuthSessionData = JSON.parse(raw);
        const accessToken = parsed.tokens?.accessToken;
        
        // Tự động kiểm tra tính hợp lệ và thời hạn của token khi nạp từ storage
        if (!accessToken || typeof accessToken !== 'string') {
          this.storage.removeItem(AUTH_STORAGE_KEY);
          return { tokens: null, user: null, principal: null, expiresAt: null };
        }

        const decoded = decodeJwtPayload<{ exp?: number; sub?: string }>(accessToken);
        if (!decoded || !decoded.sub) {
          // Token bị lỗi cấu trúc / hỏng -> tự động dọn sạch
          this.storage.removeItem(AUTH_STORAGE_KEY);
          return { tokens: null, user: null, principal: null, expiresAt: null };
        }

        // Nếu token đã hết hạn (kèm buffer 5 giây) -> tự động dọn sạch
        const expirationTime = parsed.expiresAt ?? (decoded.exp ? decoded.exp * 1000 : null);
        if (expirationTime && Date.now() >= expirationTime - 5000) {
          this.storage.removeItem(AUTH_STORAGE_KEY);
          return { tokens: null, user: null, principal: null, expiresAt: null };
        }

        return parsed;
      }
    } catch {
      try {
        this.storage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    return { tokens: null, user: null, principal: null, expiresAt: null };
  }

  private saveToStorage(): void {
    try {
      this.storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.sessionData));
    } catch {
      // ignore
    }
  }

  setSession(tokens: AuthTokens, user?: UserProfile | null): void {
    let expiresAt: number | null = null;
    if (tokens.expiresIn) {
      expiresAt = Date.now() + tokens.expiresIn * 1000;
    } else if (tokens.accessToken) {
      const decoded = decodeJwtPayload<{ exp?: number }>(tokens.accessToken);
      if (decoded?.exp) {
        expiresAt = decoded.exp * 1000;
      }
    }

    this.sessionData = {
      tokens,
      user: user ?? this.sessionData.user,
      principal: user
        ? { id: user.id, roles: user.roles, permissions: user.permissions, metadata: user.metadata }
        : this.extractPrincipalFromToken(tokens.accessToken),
      expiresAt,
    };

    this.saveToStorage();
  }

  private extractPrincipalFromToken(accessToken: string): Principal | null {
    const payload = decodeJwtPayload<{ sub?: string; id?: string; roles?: string[]; permissions?: string[]; metadata?: Record<string, unknown> }>(accessToken);
    if (!payload) return null;
    const id = payload.sub || payload.id;
    if (!id) return null;
    return {
      id,
      roles: payload.roles || ['CANDIDATE'],
      permissions: payload.permissions || [],
      metadata: payload.metadata,
    };
  }

  updateTokens(tokens: AuthTokens): void {
    this.setSession(tokens, this.sessionData.user);
  }

  setUser(user: UserProfile): void {
    this.sessionData.user = user;
    this.sessionData.principal = {
      id: user.id,
      roles: user.roles,
      permissions: user.permissions || [],
      metadata: user.metadata,
    };
    this.saveToStorage();
  }

  clear(): void {
    this.sessionData = { tokens: null, user: null, principal: null, expiresAt: null };
    this.storage.removeItem(AUTH_STORAGE_KEY);
  }

  getTokens(): AuthTokens | null {
    return this.sessionData.tokens;
  }

  getAccessToken(): string | null {
    return this.sessionData.tokens?.accessToken ?? null;
  }

  getRefreshToken(): string | null {
    return this.sessionData.tokens?.refreshToken ?? null;
  }

  getUser(): UserProfile | null {
    return this.sessionData.user;
  }

  getPrincipal(): Principal | null {
    return this.sessionData.principal;
  }

  isAuthenticated(): boolean {
    return !!this.getAccessToken() && !this.isExpired();
  }

  isExpired(): boolean {
    if (!this.sessionData.expiresAt) {
      const token = this.getAccessToken();
      if (token) {
        const decoded = decodeJwtPayload<{ exp?: number }>(token);
        if (decoded?.exp) {
          return Date.now() >= decoded.exp * 1000 - 5000;
        }
      }
      return false;
    }
    // Margin of 5 seconds
    return Date.now() >= this.sessionData.expiresAt - 5000;
  }

  getSession(): Readonly<AuthSessionData> {
    return { ...this.sessionData };
  }
}
