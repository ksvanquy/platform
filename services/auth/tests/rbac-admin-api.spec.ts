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
      expect(instructor.permissions).toContain('quiz:create');
      expect(instructor.permissions).toContain('quiz:publish');
      expect(instructor.permissions).toContain('attempt:review');
    });

    it('GET /v1/auth/roles/:code should return full details of a specific role', async () => {
      const res = await request(app).get('/v1/auth/roles/INSTRUCTOR');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('INSTRUCTOR');
      expect(res.body.data.name).toBe('Instructor');
      expect(res.body.data.permissions).toContain('quiz:update');
      expect(res.body.data.permissions).toContain('quiz:delete');
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
      expect(res.body.data.length).toBeGreaterThanOrEqual(14);

      const codes = res.body.data.map((p: any) => p.code);
      expect(codes).toContain('*');
      expect(codes).toContain('quiz:read');
      expect(codes).toContain('quiz:create');
      expect(codes).toContain('quiz:update');
      expect(codes).toContain('quiz:delete');
      expect(codes).toContain('quiz:publish');
      expect(codes).toContain('quiz:manage_all');
      expect(codes).toContain('attempt:create');
      expect(codes).toContain('attempt:submit');
      expect(codes).toContain('attempt:read_self');
      expect(codes).toContain('attempt:read_all');
      expect(codes).toContain('attempt:review');
    });
  });

  describe('3. Quản lý Người dùng & Gán Vai trò (/v1/auth/users)', () => {
    it('GET /v1/auth/users should return registered users with roles and effective permissions', async () => {
      const res = await request(app).get('/v1/auth/users');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const adminUser = res.body.data.find((u: any) => u.email === 'admin@quiz.local');
      expect(adminUser).toBeDefined();
      expect(adminUser.roles).toContain('ADMIN');
      expect(adminUser.permissions).toContain('*');
    });

    it('POST /v1/auth/users/:id/roles should assign new roles to an existing user', async () => {
      // Find student user
      const student = await userRepo.findByEmail('student@quiz.local');
      expect(student).not.toBeNull();

      // Promote student to INSTRUCTOR
      const res = await request(app)
        .post(`/v1/auth/users/${student!.id}/roles`)
        .send({ roles: ['INSTRUCTOR'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.roles).toEqual(['INSTRUCTOR']);
      expect(res.body.data.permissions).toContain('quiz:create');

      // Verify in database
      const reloaded = await userRepo.findById(student!.id);
      expect(reloaded?.getRoleCodes()).toEqual(['INSTRUCTOR']);

      // Revert back to STUDENT
      const revertRes = await request(app)
        .put(`/v1/auth/users/${student!.id}/roles`)
        .send({ roles: ['STUDENT'] });
      expect(revertRes.status).toBe(200);
      expect(revertRes.body.data.roles).toEqual(['STUDENT']);
    });

    it('POST /v1/auth/users/:id/roles should return 404 for unknown user', async () => {
      const res = await request(app)
        .post('/v1/auth/users/unknown_id_123/roles')
        .send({ roles: ['STUDENT'] });
      expect(res.status).toBe(404);
    });

    it('POST /v1/auth/users/:id/roles should return 400 when body is invalid', async () => {
      const res = await request(app)
        .post('/v1/auth/users/some_id/roles')
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
      expect(res.body.payload.permissions).toContain('quiz:create');
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

      // 3. Attempting to use the revoked token to refresh should fail (401)
      const refreshRes = await request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken });
      expect(refreshRes.status).toBe(401);
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
});
