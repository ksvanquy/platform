import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestPostgresDb, TestPostgresContext } from './helpers/test-db.helper.js';
import { DrizzleUserRepository, DrizzleTokenStorage } from '../src/infrastructure/persistence/drizzle-user.repository.js';
import { InMemoryUserRepository, InMemoryTokenStorage } from '../src/infrastructure/persistence/in-memory-user.repository.js';
import { TokenService } from '../src/infrastructure/token/token.service.js';
import { LoginUseCase } from '../src/application/login/login.use-case.js';
import { RefreshUseCase, RefreshTokenReuseError } from '../src/application/refresh/refresh.use-case.js';
import { LogoutUseCase } from '../src/application/logout/logout.use-case.js';
import { createAuthApp } from '../src/presentation/server.js';
import type { Express } from 'express';

describe('5.3. Ưu tiên 3 (P3): Triển khai Refresh Token Reuse Detection & Token Family Revocation', () => {
  describe('PostgreSQL Drizzle Persistence & Clean Architecture Use Cases', () => {
    let testContext: TestPostgresContext;
    let userRepo: DrizzleUserRepository;
    let tokenStorage: DrizzleTokenStorage;
    let tokenService: TokenService;
    let loginUseCase: LoginUseCase;
    let refreshUseCase: RefreshUseCase;
    let logoutUseCase: LogoutUseCase;

    beforeAll(async () => {
      testContext = await setupTestPostgresDb();
      userRepo = testContext.userRepo;
      tokenStorage = testContext.tokenStorage;
      tokenService = new TokenService({
        secret: 'test-secret-key-32-chars-long-strictly',
        issuer: 'auth-service',
        audience: 'quiz-platform',
        tokenStorage,
      });
      loginUseCase = new LoginUseCase(userRepo, tokenService);
      refreshUseCase = new RefreshUseCase(userRepo, tokenService);
      logoutUseCase = new LogoutUseCase(tokenService);
    });

    afterAll(async () => {
      await testContext.cleanup();
    });

    it('nên tự động gán Token Family khi đăng nhập và bảo toàn Family ID qua Token Rotation', async () => {
      const loginRes = await loginUseCase.execute({
        email: 'student@quiz.local',
        password: 'student123',
      });

      expect(loginRes.tokens.refreshToken).toBeDefined();
      expect(loginRes.tokens.familyId).toBeDefined();
      const initialFamilyId = loginRes.tokens.familyId;

      // Kiểm tra trong Storage
      const inspection1 = await tokenStorage.inspectRefreshToken(loginRes.tokens.refreshToken);
      expect(inspection1).not.toBeNull();
      expect(inspection1?.familyId).toBe(initialFamilyId);
      expect(inspection1?.isRevoked).toBe(false);

      // Thực hiện Token Rotation lần 1
      const refreshRes1 = await refreshUseCase.execute({
        refreshToken: loginRes.tokens.refreshToken,
      });

      expect(refreshRes1.tokens.refreshToken).toBeDefined();
      expect(refreshRes1.tokens.refreshToken).not.toBe(loginRes.tokens.refreshToken);
      // Family ID phải được kế thừa để duy trì cùng chuỗi Token Family
      expect(refreshRes1.tokens.familyId).toBe(initialFamilyId);

      // Token cũ phải được đánh dấu revoked
      const inspectionOld = await tokenStorage.inspectRefreshToken(loginRes.tokens.refreshToken);
      expect(inspectionOld?.isRevoked).toBe(true);
      expect(inspectionOld?.revokedAt).toBeInstanceOf(Date);

      // Token mới phải hợp lệ
      const inspectionNew = await tokenStorage.inspectRefreshToken(refreshRes1.tokens.refreshToken);
      expect(inspectionNew?.isRevoked).toBe(false);
    });

    it('Kịch bản Tấn công 1: Kẻ tấn công tái sử dụng Refresh Token cũ (Token Theft) -> Kích hoạt Token Family Revocation', async () => {
      // 1. Người dùng hợp lệ đăng nhập
      const loginRes = await loginUseCase.execute({
        email: 'instructor@quiz.local',
        password: 'teacher123',
      });
      const stolenToken = loginRes.tokens.refreshToken;

      // 2. Người dùng hợp lệ refresh token -> Nhận token mới T2, stolenToken bị revoke
      const refreshRes = await refreshUseCase.execute({
        refreshToken: stolenToken,
      });
      const userActiveToken = refreshRes.tokens.refreshToken;

      // 3. Kẻ tấn công (đã trộm stolenToken trước đó) cố tình gửi stolenToken để refresh
      await expect(
        refreshUseCase.execute({ refreshToken: stolenToken })
      ).rejects.toThrow(RefreshTokenReuseError);

      // 4. Token Family Revocation: Tất cả token trong chuỗi gia đình (bao gồm userActiveToken) phải bị thu hồi ngay lập tức
      const inspectionUserToken = await tokenStorage.inspectRefreshToken(userActiveToken);
      expect(inspectionUserToken?.isRevoked).toBe(true);

      // Người dùng hợp lệ khi dùng userActiveToken cũng bị từ chối và buộc phải đăng nhập lại bằng mật khẩu
      await expect(
        refreshUseCase.execute({ refreshToken: userActiveToken })
      ).rejects.toThrow(RefreshTokenReuseError);
    });

    it('Kịch bản Tấn công 2: Kẻ tấn công refresh trước, người dùng hợp lệ gửi token cũ sau -> Thu hồi token của kẻ tấn công', async () => {
      // 1. Người dùng đăng nhập
      const loginRes = await loginUseCase.execute({
        email: 'student@quiz.local',
        password: 'student123',
      });
      const originalToken = loginRes.tokens.refreshToken;

      // 2. Kẻ tấn công đánh cắp originalToken và thực hiện refresh trước người dùng
      const attackerRefresh = await refreshUseCase.execute({
        refreshToken: originalToken,
      });
      const attackerToken = attackerRefresh.tokens.refreshToken;

      // 3. Sau đó người dùng hợp lệ cố gắng refresh bằng originalToken
      // Hệ thống phát hiện originalToken đã bị dùng (revokedAt != null)
      await expect(
        refreshUseCase.execute({ refreshToken: originalToken })
      ).rejects.toThrow('Refresh token reuse detected');

      // 4. Token của kẻ tấn công (cùng Token Family) bị thu hồi ngay lập tức
      const attackerInspection = await tokenStorage.inspectRefreshToken(attackerToken);
      expect(attackerInspection?.isRevoked).toBe(true);

      // Kẻ tấn công không thể tiếp tục refresh nữa
      await expect(
        refreshUseCase.execute({ refreshToken: attackerToken })
      ).rejects.toThrow(RefreshTokenReuseError);
    });

    it('Kịch bản Tấn công 3: Tái sử dụng Refresh Token sau khi đã Logout', async () => {
      const loginRes = await loginUseCase.execute({
        email: 'admin@quiz.local',
        password: 'admin123',
      });
      const token = loginRes.tokens.refreshToken;

      // Người dùng đăng xuất
      await logoutUseCase.execute({ refreshToken: token });

      // Token đã bị revoke
      const inspection = await tokenStorage.inspectRefreshToken(token);
      expect(inspection?.isRevoked).toBe(true);

      // Kẻ tấn công cố tình sử dụng token đã đăng xuất để refresh
      await expect(
        refreshUseCase.execute({ refreshToken: token })
      ).rejects.toThrow(RefreshTokenReuseError);
    });
  });

  describe('HTTP REST API: POST /v1/auth/refresh với Token Reuse Detection', () => {
    let testContext: TestPostgresContext;
    let userRepo: DrizzleUserRepository;
    let tokenStorage: DrizzleTokenStorage;
    let tokenService: TokenService;
    let app: Express;

    beforeAll(async () => {
      testContext = await setupTestPostgresDb();
      userRepo = testContext.userRepo;
      tokenStorage = testContext.tokenStorage;
      tokenService = new TokenService({
        secret: 'test-secret-key-32-chars-long-strictly',
        issuer: 'auth-service',
        audience: 'quiz-platform',
        tokenStorage,
      });
      const instance = createAuthApp(userRepo, tokenService);
      app = instance.app;
    });

    afterAll(async () => {
      await testContext.cleanup();
    });

    it('nên trả về 403 Forbidden và xóa Cookie khi phát hiện Token Reuse qua HTTP', async () => {
      // 1. Đăng nhập để nhận refresh token
      const loginRes = await request(app)
        .post('/v1/auth/login')
        .send({ email: 'student@quiz.local', password: 'student123' });

      expect(loginRes.status).toBe(200);
      const token1 = loginRes.body.data.tokens.refreshToken;

      // 2. Refresh hợp lệ lần 1
      const refreshRes1 = await request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: token1 });

      expect(refreshRes1.status).toBe(200);
      const token2 = refreshRes1.body.data.tokens.refreshToken;

      // 3. Tái sử dụng token1 qua HTTP API
      const reuseRes = await request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: token1 });

      expect(reuseRes.status).toBe(403);
      expect(reuseRes.body.success).toBe(false);
      expect(reuseRes.body.errorCode).toBe('TOKEN_REUSE_DETECTED');
      expect(reuseRes.body.error).toContain('reuse detected');

      // Cookie bị xóa
      const setCookie = reuseRes.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie[0]).toContain('refreshToken=;');

      // 4. Token2 trong gia đình cũng đã bị thu hồi do Token Family Revocation
      const followUpRes = await request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: token2 });

      expect(followUpRes.status).toBe(403);
      expect(followUpRes.body.errorCode).toBe('TOKEN_REUSE_DETECTED');
    });
  });

  describe('In-Memory Fallback Implementation', () => {
    it('nên phát hiện Token Reuse và kích hoạt Family Revocation trên InMemoryTokenStorage', async () => {
      const inMemoryStorage = new InMemoryTokenStorage();
      const inMemoryRepo = new InMemoryUserRepository();
      const inMemoryTokenService = new TokenService({
        secret: 'test-secret-key-32-chars-long-strictly',
        issuer: 'auth-service',
        audience: 'quiz-platform',
        tokenStorage: inMemoryStorage,
      });

      const loginUseCase = new LoginUseCase(inMemoryRepo, inMemoryTokenService);
      const refreshUseCase = new RefreshUseCase(inMemoryRepo, inMemoryTokenService);

      const loginRes = await loginUseCase.execute({
        email: 'student@quiz.local',
        password: 'student123',
      });

      const t1 = loginRes.tokens.refreshToken;
      const refreshRes = await refreshUseCase.execute({ refreshToken: t1 });
      const t2 = refreshRes.tokens.refreshToken;

      // Tái sử dụng t1
      await expect(
        refreshUseCase.execute({ refreshToken: t1 })
      ).rejects.toThrow(RefreshTokenReuseError);

      // t2 cũng bị revoke
      const inspection2 = inMemoryStorage.inspectRefreshToken(t2);
      expect(inspection2?.isRevoked).toBe(true);
    });
  });
});
