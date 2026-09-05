import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestPostgresDb, TestPostgresContext } from './helpers/test-db.helper.js';
import { DrizzleUserRepository, DrizzleTokenStorage } from '../src/infrastructure/persistence/drizzle-user.repository.js';
import { TokenService } from '../src/infrastructure/token/token.service.js';
import { createAuthApp } from '../src/presentation/server.js';
import type { Express } from 'express';

describe('Gói WP-7: Endpoints Quản trị RBAC & Token Service', () => {
  let testContext: TestPostgresContext;
  let userRepo: DrizzleUserRepository;
  let tokenStorage: DrizzleTokenStorage;
  let tokenService: TokenService;
  let app: Express;
  let adminToken: string;
  let studentToken: string;

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

    const adminUser = await userRepo.findByEmail('admin@quiz.local');
    adminToken = tokenService.generateTokens({
      sub: adminUser!.id,
      roles: ['ADMIN'],
      permissions: ['*'],
    }).accessToken;

    const studentUser = await userRepo.findByEmail('student@quiz.local');
    studentToken = tokenService.generateTokens({
      sub: studentUser!.id,
      roles: ['STUDENT'],
      permissions: ['user:read'],
    }).accessToken;
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  describe('1. Quản trị Danh mục Roles (/v1/auth/roles)', () => {
    it('GET /v1/auth/roles should list all system roles directly from PostgreSQL SoT', async () => {
      const res = await request(app).get('/v1/auth/roles');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);

      const codes = res.body.data.map((r: any) => r.code);
      expect(codes).toContain('STUDENT');
      expect(codes).toContain('INSTRUCTOR');
      expect(codes).toContain('ADMIN');

      const instructor = res.body.data.find((r: any) => r.code === 'INSTRUCTOR');
      expect(instructor).toBeDefined();
      expect(instructor.permissions).toContain('user:read');
      expect(instructor.permissions).toContain('user:write');
      expect(instructor.permissions).not.toContain('quiz:create');
    });

    it('GET /v1/auth/roles/:code should return full details of a specific role', async () => {
      const res = await request(app).get('/v1/auth/roles/INSTRUCTOR');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('INSTRUCTOR');
      expect(res.body.data.name).toBe('Instructor');
      expect(res.body.data.permissions).toContain('user:read');
      expect(res.body.data.permissions).toContain('user:write');
      expect(res.body.data.permissions).not.toContain('quiz:update');
    });

    it('GET /v1/auth/roles/:code should return 404 for non-existent role', async () => {
      const res = await request(app).get('/v1/auth/roles/NON_EXISTENT_ROLE');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('2. Quản trị Danh mục Permissions (/v1/auth/permissions)', () => {
    it('GET /v1/auth/permissions should list all system permissions directly from PostgreSQL SoT', async () => {
      const res = await request(app).get('/v1/auth/permissions');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(8);

      const codes = res.body.data.map((p: any) => p.code);
      expect(codes).toContain('*');
      expect(codes).toContain('user:read');
      expect(codes).toContain('user:write');
      expect(codes).toContain('user:manage');
      expect(codes).toContain('role:read');
      expect(codes).toContain('role:write');
      expect(codes).toContain('permission:read');
      expect(codes).toContain('system:config');

      // Assert complete purge of domain permissions from Auth Service
      expect(codes).not.toContain('quiz:read');
      expect(codes).not.toContain('quiz:create');
      expect(codes).not.toContain('quiz:manage_all');
      expect(codes).not.toContain('attempt:create');
      expect(codes).not.toContain('attempt:submit');
      expect(codes).not.toContain('attempt:review');
    });
  });

  describe('3. Quản lý Người dùng & Gán Vai trò (/v1/auth/users) - Auth Guard P1', () => {
    it('GET /v1/auth/users should return 401 Unauthorized when no Authorization header is provided', async () => {
      const res = await request(app).get('/v1/auth/users');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('GET /v1/auth/users should return 403 Forbidden when caller is not an ADMIN', async () => {
      const res = await request(app)
        .get('/v1/auth/users')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Forbidden');
    });

    it('GET /v1/auth/users should return registered users with roles and effective permissions when caller is ADMIN', async () => {
      const res = await request(app)
        .get('/v1/auth/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const adminUser = res.body.data.find((u: any) => u.email === 'admin@quiz.local');
      expect(adminUser).toBeDefined();
      expect(adminUser.roles).toContain('ADMIN');
      expect(adminUser.permissions).toContain('*');
    });

    it('POST /v1/auth/users/:id/roles should reject 401 without token and 403 with non-admin token', async () => {
      const student = await userRepo.findByEmail('student@quiz.local');
      expect(student).not.toBeNull();

      // No token -> 401
      const resNoToken = await request(app)
        .post(`/v1/auth/users/${student!.id}/roles`)
        .send({ roles: ['INSTRUCTOR'] });
      expect(resNoToken.status).toBe(401);

      // Student token -> 403
      const resForbidden = await request(app)
        .post(`/v1/auth/users/${student!.id}/roles`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ roles: ['INSTRUCTOR'] });
      expect(resForbidden.status).toBe(403);
    });

    it('POST /v1/auth/users/:id/roles should assign new roles to an existing user when called by ADMIN', async () => {
      // Find student user
      const student = await userRepo.findByEmail('student@quiz.local');
      expect(student).not.toBeNull();

      // Promote student to INSTRUCTOR
      const res = await request(app)
        .post(`/v1/auth/users/${student!.id}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roles: ['INSTRUCTOR'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.roles).toEqual(['INSTRUCTOR']);
      expect(res.body.data.permissions).toContain('user:read');
      expect(res.body.data.permissions).not.toContain('quiz:create');

      // Verify in database
      const reloaded = await userRepo.findById(student!.id);
      expect(reloaded?.getRoleCodes()).toEqual(['INSTRUCTOR']);

      // Revert back to STUDENT
      const revertRes = await request(app)
        .put(`/v1/auth/users/${student!.id}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roles: ['STUDENT'] });
      expect(revertRes.status).toBe(200);
      expect(revertRes.body.data.roles).toEqual(['STUDENT']);
    });

    it('POST /v1/auth/users/:id/roles should return 404 for unknown user', async () => {
      const res = await request(app)
        .post('/v1/auth/users/unknown_id_123/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roles: ['STUDENT'] });
      expect(res.status).toBe(404);
    });

    it('POST /v1/auth/users/:id/roles should return 400 when body is invalid', async () => {
      const res = await request(app)
        .post('/v1/auth/users/some_id/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roles: 'not_an_array' });
      expect(res.status).toBe(400);
    });
  });

  describe('4. Token Service Endpoints (Introspection RFC 7662, Revocation RFC 7009 & JWKS)', () => {
    it('POST /v1/auth/tokens/verify should introspect and validate an active access token', async () => {
      const student = await userRepo.findByEmail('student@quiz.local');
      expect(student).not.toBeNull();

      const tokens = tokenService.generateTokens({
        sub: student!.id,
        roles: ['INSTRUCTOR'],
        tenantId: 'tenant_default',
      });

      const res = await request(app)
        .post('/v1/auth/tokens/verify')
        .send({ token: tokens.accessToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.active).toBe(true);
      expect(res.body.payload.sub).toBe(student!.id);
      expect(res.body.payload.roles).toContain('INSTRUCTOR');
      expect(res.body.payload.permissions).toContain('user:read');
    });

    it('POST /v1/auth/tokens/verify should return active: false for invalid or forged token', async () => {
      const res = await request(app)
        .post('/v1/auth/tokens/verify')
        .send({ token: 'invalid.forged.jwt.token' });

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(false);
    });

    it('POST /v1/auth/tokens/verify should accept Bearer token in Authorization header', async () => {
      const student = await userRepo.findByEmail('student@quiz.local');
      expect(student).not.toBeNull();

      const tokens = tokenService.generateTokens({
        sub: student!.id,
        roles: ['STUDENT'],
      });

      const res = await request(app)
        .post('/v1/auth/tokens/verify')
        .set('Authorization', `Bearer ${tokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(true);
      expect(res.body.payload.sub).toBe(student!.id);
    });

    it('POST /v1/auth/tokens/revoke should revoke a refresh token and prevent future refresh', async () => {
      // 1. Login to get fresh tokens
      const loginRes = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'student@quiz.local',
          password: 'student123',
        });
      expect(loginRes.status).toBe(200);
      const { refreshToken } = loginRes.body.data.tokens;
      expect(refreshToken).toBeDefined();

      // 2. Explicitly revoke the refresh token
      const revokeRes = await request(app)
        .post('/v1/auth/tokens/revoke')
        .send({ token: refreshToken });
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);
      expect(revokeRes.body.revoked).toBe(true);

      // 3. Attempting to use the revoked token to refresh should fail (403 TOKEN_REUSE_DETECTED)
      const refreshRes = await request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken });
      expect(refreshRes.status).toBe(403);
      expect(refreshRes.body.errorCode).toBe('TOKEN_REUSE_DETECTED');
    });

    it('GET /.well-known/jwks.json and GET /v1/auth/jwks should provide public RSA keys', async () => {
      const res1 = await request(app).get('/.well-known/jwks.json');
      expect(res1.status).toBe(200);
      expect(Array.isArray(res1.body.keys)).toBe(true);
      expect(res1.body.keys[0].kty).toBe('RSA');
      expect(res1.body.keys[0].use).toBe('sig');

      const res2 = await request(app).get('/v1/auth/jwks');
      expect(res2.status).toBe(200);
      expect(res2.body).toEqual(res1.body);
    });
  });

  describe('4. Quản trị Khóa / Mở Khóa Tài Khoản & Session Revocation (/v1/auth/users/:id/status) - Auth Guard P1', () => {
    it('PATCH /v1/auth/users/:id/status should reject 401 without token and 403 with non-admin token', async () => {
      const student = await userRepo.findByEmail('student@quiz.local');
      expect(student).not.toBeNull();

      // No token -> 401
      const resNoToken = await request(app)
        .patch(`/v1/auth/users/${student!.id}/status`)
        .send({ isActive: false });
      expect(resNoToken.status).toBe(401);

      // Student token -> 403
      const resForbidden = await request(app)
        .patch(`/v1/auth/users/${student!.id}/status`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ isActive: false });
      expect(resForbidden.status).toBe(403);
    });

    it('should deactivate user, revoke all sessions, and block login/refresh/profile/verify', async () => {
      // 1. Tạo hoặc lấy user đang hoạt động và đăng nhập thành công
      const loginRes = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'student@quiz.local',
          password: 'student123',
        });
      expect(loginRes.status).toBe(200);
      const studentId = loginRes.body.data.user.id;
      const { accessToken, refreshToken } = loginRes.body.data.tokens;
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();

      // Xác minh trước khi khóa: verify token trả về active = true
      const verifyBefore = await request(app)
        .post('/v1/auth/tokens/verify')
        .send({ token: accessToken });
      expect(verifyBefore.status).toBe(200);
      expect(verifyBefore.body.active).toBe(true);

      // 2. Admin gọi PATCH /v1/auth/users/:id/status để KHÓA tài khoản (isActive: false)
      const deactivateRes = await request(app)
        .patch(`/v1/auth/users/${studentId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(deactivateRes.status).toBe(200);
      expect(deactivateRes.body.success).toBe(true);
      expect(deactivateRes.body.data.isActive).toBe(false);

      // 3. User bị khóa cố gắng đăng nhập lại -> Phải bị chặn 403 Forbidden
      const loginBlockedRes = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'student@quiz.local',
          password: 'student123',
        });
      expect(loginBlockedRes.status).toBe(403);
      expect(loginBlockedRes.body.error).toContain('Account is deactivated');

      // 4. User bị khóa cố gắng refresh token cũ -> Bị từ chối (401 do token đã bị revoke hoặc 403 do tài khoản bị khóa)
      const refreshBlockedRes = await request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken });
      expect([401, 403]).toContain(refreshBlockedRes.status);

      // 5. User bị khóa cố gắng gọi /v1/auth/me -> Phải bị chặn 403 Forbidden
      const meBlockedRes = await request(app)
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(meBlockedRes.status).toBe(403);
      expect(meBlockedRes.body.error).toContain('Account is deactivated');

      // 6. Token Introspection /v1/auth/tokens/verify phải trả về active: false
      const verifyAfter = await request(app)
        .post('/v1/auth/tokens/verify')
        .send({ token: accessToken });
      expect(verifyAfter.status).toBe(200);
      expect(verifyAfter.body.active).toBe(false);
      expect(verifyAfter.body.error).toContain('deactivated');

      // 7. Admin MỞ KHÓA tài khoản (isActive: true)
      const activateRes = await request(app)
        .patch(`/v1/auth/users/${studentId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });
      expect(activateRes.status).toBe(200);
      expect(activateRes.body.success).toBe(true);
      expect(activateRes.body.data.isActive).toBe(true);

      // 8. Đăng nhập lại thành công sau khi mở khóa
      const loginSuccessRes = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'student@quiz.local',
          password: 'student123',
        });
      expect(loginSuccessRes.status).toBe(200);
      expect(loginSuccessRes.body.success).toBe(true);
    });

    it('should reject status update with non-boolean isActive or non-existent user', async () => {
      const badValueRes = await request(app)
        .patch('/v1/auth/users/usr_any/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: 'invalid-string' });
      expect(badValueRes.status).toBe(400);

      const notFoundRes = await request(app)
        .patch('/v1/auth/users/usr_non_existent/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(notFoundRes.status).toBe(404);
    });
  });
});
