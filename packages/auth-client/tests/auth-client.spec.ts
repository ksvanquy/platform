import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAuthClient,
  AuthClient,
  SessionManager,
  MemoryAuthStorage,
  decodeJwtPayload,
} from '../src/index.js';

describe('Bước 4 — packages/auth-client', () => {
  let memoryStorage: MemoryAuthStorage;
  let auth: AuthClient;

  const mockTokens = {
    accessToken: 'mock_access_token_123',
    refreshToken: 'mock_refresh_token_456',
    expiresIn: 900,
  };

  const mockUser = {
    id: 'usr_student_01',
    email: 'student@example.com',
    name: 'Alice Student',
    roles: ['STUDENT'] as const,
    tenantId: 'tenant_default',
  };

  beforeEach(() => {
    memoryStorage = new MemoryAuthStorage();
  });

  describe('SessionManager & Storage', () => {
    it('should store and retrieve session tokens and user properly', () => {
      const session = new SessionManager(memoryStorage);
      expect(session.isAuthenticated()).toBe(false);
      expect(session.getAccessToken()).toBeNull();

      session.setSession(mockTokens, mockUser);
      expect(session.isAuthenticated()).toBe(true);
      expect(session.getAccessToken()).toBe(mockTokens.accessToken);
      expect(session.getRefreshToken()).toBe(mockTokens.refreshToken);
      expect(session.getUser()?.email).toBe(mockUser.email);
      expect(session.getPrincipal()?.id).toBe(mockUser.id);
    });

    it('should clear session upon logout', () => {
      const session = new SessionManager(memoryStorage);
      session.setSession(mockTokens, mockUser);
      expect(session.isAuthenticated()).toBe(true);

      session.clear();
      expect(session.isAuthenticated()).toBe(false);
      expect(session.getAccessToken()).toBeNull();
      expect(session.getUser()).toBeNull();
    });

    it('should correctly decode base64 JWT payload', () => {
      const payload = { sub: 'usr_test_99', roles: ['ADMIN'], exp: 1893456000 };
      const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
      const fakeJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${base64}.signature`;

      const decoded = decodeJwtPayload(fakeJwt);
      expect(decoded).toEqual(payload);
    });
  });

  describe('AuthClient HTTP operations (login, me, refresh, logout)', () => {
    it('should login successfully, store tokens, and notify listeners', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            tokens: mockTokens,
            user: mockUser,
          },
        }),
      });

      auth = createAuthClient({
        baseUrl: 'http://auth.local/v1/auth',
        storage: memoryStorage,
        fetchFn: mockFetch as any,
      });

      let authChangedStatus: boolean | null = null;
      auth.onAuthStateChange((isAuthed) => {
        authChangedStatus = isAuthed;
      });

      const res = await auth.login({
        email: 'student@example.com',
        password: 'Password123!',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://auth.local/v1/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'student@example.com',
            password: 'Password123!',
          }),
        })
      );

      expect(res.user.id).toBe(mockUser.id);
      expect(auth.isAuthenticated()).toBe(true);
      expect(await auth.getAccessToken()).toBe(mockTokens.accessToken);
      expect(auth.getUser()?.name).toBe('Alice Student');
      expect(authChangedStatus).toBe(true);
    });

    it('should fetch user profile with Bearer token using auth.me()', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            profile: mockUser,
            principal: { id: mockUser.id, roles: mockUser.roles },
          },
        }),
      });

      auth = createAuthClient({
        baseUrl: 'http://auth.local/v1/auth',
        storage: memoryStorage,
        fetchFn: mockFetch as any,
      });

      // Pre-seed token
      auth.getSession().setSession(mockTokens);

      const profile = await auth.me();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://auth.local/v1/auth/me',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockTokens.accessToken}`,
          }),
        })
      );

      expect(profile.id).toBe(mockUser.id);
      expect(auth.getUser()?.id).toBe(mockUser.id);
    });

    it('should refresh tokens when requested or when expired', async () => {
      const newTokens = {
        accessToken: 'new_access_token_789',
        refreshToken: 'new_refresh_token_012',
        expiresIn: 900,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { tokens: newTokens },
        }),
      });

      auth = createAuthClient({
        baseUrl: 'http://auth.local/v1/auth',
        storage: memoryStorage,
        fetchFn: mockFetch as any,
      });

      auth.getSession().setSession(mockTokens, mockUser);

      const refreshed = await auth.refresh();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://auth.local/v1/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: mockTokens.refreshToken }),
        })
      );

      expect(refreshed.accessToken).toBe('new_access_token_789');
      expect(await auth.getAccessToken()).toBe('new_access_token_789');
    });

    it('should handle logout and clear state completely', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Logged out' }),
      });

      auth = createAuthClient({
        baseUrl: 'http://auth.local/v1/auth',
        storage: memoryStorage,
        fetchFn: mockFetch as any,
      });

      auth.getSession().setSession(mockTokens, mockUser);
      expect(auth.isAuthenticated()).toBe(true);

      await auth.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://auth.local/v1/auth/logout',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: mockTokens.refreshToken }),
        })
      );

      expect(auth.isAuthenticated()).toBe(false);
      expect(await auth.getAccessToken()).toBeNull();
      expect(auth.getUser()).toBeNull();
    });

    it('should register a new user and establish session', async () => {
      const registerRes = {
        tokens: {
          accessToken: 'registered_access_token',
          refreshToken: 'registered_refresh_token',
          expiresIn: 900,
        },
        user: {
          id: 'usr_new_99',
          email: 'newuser@example.com',
          name: 'Bob New',
          roles: ['STUDENT'],
        },
        principal: {
          id: 'usr_new_99',
          roles: ['STUDENT'],
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: registerRes }),
      });

      auth = createAuthClient({
        baseUrl: 'http://auth.local/v1/auth',
        storage: memoryStorage,
        fetchFn: mockFetch as any,
      });

      const res = await auth.register({
        email: 'newuser@example.com',
        name: 'Bob New',
        password: 'password123',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://auth.local/v1/auth/register',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'newuser@example.com',
            name: 'Bob New',
            password: 'password123',
          }),
        })
      );

      expect(res.user.email).toBe('newuser@example.com');
      expect(auth.isAuthenticated()).toBe(true);
      expect(await auth.getAccessToken()).toBe('registered_access_token');
    });

    it('should perform silent refresh on 401 and retry original request via fetchWithAuth', async () => {
      const refreshedTokens = {
        accessToken: 'refreshed_access_token',
        refreshToken: 'refreshed_refresh_token',
        expiresIn: 900,
      };

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/refresh')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: { tokens: refreshedTokens } }),
          };
        }

        callCount++;
        if (callCount === 1) {
          // First call returns 401 Unauthorized
          return {
            ok: false,
            status: 401,
            json: async () => ({ success: false, message: 'Expired' }),
          };
        }

        // Second call succeeds after refresh
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { result: 'ok' } }),
        };
      });

      auth = createAuthClient({
        baseUrl: 'http://auth.local/v1/auth',
        storage: memoryStorage,
        fetchFn: mockFetch as any,
      });

      auth.getSession().setSession(mockTokens, mockUser);

      const response = await auth.fetchWithAuth('http://api.local/v1/quizzes');
      expect(response.status).toBe(200);
      expect(callCount).toBe(2);
      expect(await auth.getAccessToken()).toBe('refreshed_access_token');
    });
  });
});
