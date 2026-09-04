import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestPostgresDb, TestPostgresContext } from './helpers/test-db.helper.js';
import { DrizzleUserRepository, DrizzleTokenStorage } from '../src/infrastructure/persistence/drizzle-user.repository.js';
import { TokenService } from '../src/infrastructure/token/token.service.js';
import { LoginUseCase } from '../src/application/login/login.use-case.js';
import { RegisterUseCase } from '../src/application/register/register.use-case.js';
import { GetProfileUseCase } from '../src/application/profile/get-profile.use-case.js';
import { RefreshUseCase } from '../src/application/refresh/refresh.use-case.js';
import { LogoutUseCase } from '../src/application/logout/logout.use-case.js';
import { createAuthApp } from '../src/presentation/server.js';

describe('Auth Service Core & Use Cases', () => {
  let testContext: TestPostgresContext;
  let userRepo: DrizzleUserRepository;
  let tokenStorage: DrizzleTokenStorage;
  let tokenService: TokenService;

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
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  describe('RegisterUseCase', () => {
    it('should register a new student and generate tokens', async () => {
      const registerUseCase = new RegisterUseCase(userRepo, tokenService);
      const result = await registerUseCase.execute({
        email: 'newstudent@quiz.local',
        name: 'New Student',
        password: 'securePassword123',
      });

      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.user.email).toBe('newstudent@quiz.local');
      expect(result.user.roles).toEqual(['STUDENT']);
      expect(result.principal.id).toBe(result.user.id);

      // User must be persisted in repository
      const saved = await userRepo.findByEmail('newstudent@quiz.local');
      expect(saved).not.toBeNull();
      expect(saved?.name).toBe('New Student');
    });

    it('should reject registration if email is already taken', async () => {
      const registerUseCase = new RegisterUseCase(userRepo, tokenService);
      await expect(
        registerUseCase.execute({
          email: 'student@quiz.local', // Already seeded
          name: 'Duplicate Student',
          password: 'securePassword123',
        })
      ).rejects.toThrow('Email is already registered');
    });

    it('should reject registration if password is shorter than 8 chars', async () => {
      const registerUseCase = new RegisterUseCase(userRepo, tokenService);
      await expect(
        registerUseCase.execute({
          email: 'shortpass@quiz.local',
          name: 'Short Pass',
          password: 'short',
        })
      ).rejects.toThrow('Password must be at least 8 characters long');
    });
  });

  describe('GetProfileUseCase', () => {
    it('should return safe profile and principal for existing user', async () => {
      const student = await userRepo.findByEmail('student@quiz.local');
      expect(student).not.toBeNull();
      const getProfileUseCase = new GetProfileUseCase(userRepo);
      const result = await getProfileUseCase.execute({ userId: student!.id });

      expect(result.profile.id).toBe(student!.id);
      expect(result.profile.email).toBe('student@quiz.local');
      expect((result.profile as any).passwordHash).toBeUndefined();
      expect(result.principal.roles).toContain('STUDENT');
    });

    it('should throw when user is not found', async () => {
      const getProfileUseCase = new GetProfileUseCase(userRepo);
      await expect(
        getProfileUseCase.execute({ userId: 'usr_non_existent' })
      ).rejects.toThrow('User not found');
    });
  });

  describe('LoginUseCase', () => {
    it('should authenticate valid user and return Principal in JWT', async () => {
      const loginUseCase = new LoginUseCase(userRepo, tokenService);
      const result = await loginUseCase.execute({
        email: 'student@quiz.local',
        password: 'student123',
      });

      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.user.email).toBe('student@quiz.local');
      expect(result.user.roles).toContain('STUDENT');

      // Verify token contains Principal payload
      const payload = tokenService.verifyAccessToken(result.tokens.accessToken);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe(result.user.id);
      expect(payload?.roles).toContain('STUDENT');
      expect(payload?.tenantId).toBe('tenant_default');
    });

    it('should reject incorrect password', async () => {
      const loginUseCase = new LoginUseCase(userRepo, tokenService);
      await expect(
        loginUseCase.execute({
          email: 'student@quiz.local',
          password: 'wrongpassword',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should reject non-existent email', async () => {
      const loginUseCase = new LoginUseCase(userRepo, tokenService);
      await expect(
        loginUseCase.execute({
          email: 'unknown@quiz.local',
          password: 'password',
        })
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('RefreshUseCase & LogoutUseCase', () => {
    it('should rotate token upon refresh', async () => {
      const loginUseCase = new LoginUseCase(userRepo, tokenService);
      const refreshUseCase = new RefreshUseCase(userRepo, tokenService);

      const loginRes = await loginUseCase.execute({
        email: 'instructor@quiz.local',
        password: 'teacher123',
      });

      const refreshRes = await refreshUseCase.execute({
        refreshToken: loginRes.tokens.refreshToken,
      });

      expect(refreshRes.tokens.accessToken).toBeDefined();
      expect(refreshRes.tokens.refreshToken).not.toBe(loginRes.tokens.refreshToken);

      // Old refresh token must be invalidated
      await expect(
        refreshUseCase.execute({ refreshToken: loginRes.tokens.refreshToken })
      ).rejects.toThrow('Invalid or expired refresh token');
    });

    it('should revoke refresh token on logout', async () => {
      const loginUseCase = new LoginUseCase(userRepo, tokenService);
      const refreshUseCase = new RefreshUseCase(userRepo, tokenService);
      const logoutUseCase = new LogoutUseCase(tokenService);

      const loginRes = await loginUseCase.execute({
        email: 'admin@quiz.local',
        password: 'admin123',
      });

      const logoutRes = await logoutUseCase.execute({
        refreshToken: loginRes.tokens.refreshToken,
      });
      expect(logoutRes.success).toBe(true);

      // Refreshing with revoked token fails
      await expect(
        refreshUseCase.execute({ refreshToken: loginRes.tokens.refreshToken })
      ).rejects.toThrow('Invalid or expired refresh token');
    });
  });

  describe('Hybrid Cookie Session & HTTP Endpoints', () => {
    it('POST /v1/auth/register should set HttpOnly refresh cookie and status 201', async () => {
      const { app } = createAuthApp(userRepo, tokenService);
      const res = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'hybrid_user@quiz.local',
          name: 'Hybrid Student',
          password: 'password_123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
      const cookies = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie'].join('; ')
        : res.headers['set-cookie'];
      expect(cookies).toContain('refreshToken=');
      expect(cookies).toContain('HttpOnly');
      expect(cookies).toContain('Path=/v1/auth');
    });

    it('POST /v1/auth/login and refresh via Cookie fallback', async () => {
      const { app } = createAuthApp(userRepo, tokenService);
      const loginRes = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'student@quiz.local',
          password: 'student123',
        });

      expect(loginRes.status).toBe(200);
      const setCookie = loginRes.headers['set-cookie'];
      expect(setCookie).toBeDefined();

      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const refreshTokenValue = cookieStr.split(';')[0]; // refreshToken=...

      // Call refresh with Cookie header without sending body
      const refreshRes = await request(app)
        .post('/v1/auth/refresh')
        .set('Cookie', refreshTokenValue)
        .send({});

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.tokens.accessToken).toBeDefined();
      expect(refreshRes.headers['set-cookie']).toBeDefined();
    });

    it('POST /v1/auth/logout should clear HttpOnly refresh cookie', async () => {
      const { app } = createAuthApp(userRepo, tokenService);
      const loginRes = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'student@quiz.local',
          password: 'student123',
        });

      const setCookie = loginRes.headers['set-cookie'];
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const refreshTokenValue = cookieStr.split(';')[0];

      const logoutRes = await request(app)
        .post('/v1/auth/logout')
        .set('Cookie', refreshTokenValue)
        .send({});

      expect(logoutRes.status).toBe(200);
      const logoutCookies = logoutRes.headers['set-cookie'];
      expect(logoutCookies).toBeDefined();
      const logoutCookieStr = Array.isArray(logoutCookies) ? logoutCookies.join(';') : logoutCookies;
      expect(logoutCookieStr).toContain('Max-Age=0');
    });
  });

  describe('JWKS & Asymmetric Key Discovery (RFC 7517)', () => {
    it('should return valid RFC 7517 RSA key discovery info by default (RS256)', () => {
      const jwks = tokenService.getJwks();
      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0].kid).toBe('quiz-auth-key-1');
      expect(jwks.keys[0].alg).toBe('RS256');
      expect(jwks.keys[0].kty).toBe('RSA');
      expect(jwks.keys[0].use).toBe('sig');
      expect((jwks.keys[0] as any).n).toBeDefined();
      expect((jwks.keys[0] as any).e).toBeDefined();
    });

    it('should support legacy HS256 JWKS when explicitly configured', () => {
      const hsService = new TokenService({ algorithm: 'HS256', secret: 'test-secret', tokenStorage });
      const jwks = hsService.getJwks();
      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0].alg).toBe('HS256');
      expect(jwks.keys[0].kty).toBe('oct');
    });

    it('should verify RS256 token signature using asymmetric cryptography', () => {
      const tokens = tokenService.generateTokens({
        sub: 'usr_student_01',
        roles: ['STUDENT'],
      });

      const payload = tokenService.verifyAccessToken(tokens.accessToken);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe('usr_student_01');

      // Tampering test: signature mismatch
      const parts = tokens.accessToken.split('.');
      const tampered = `${parts[0]}.${parts[1]}.invalid_signature`;
      expect(tokenService.verifyAccessToken(tampered)).toBeNull();
    });
  });

  describe('Rate Limiting on POST /v1/auth/login (Brute-force Protection)', () => {
    it('should lock IP after 5 consecutive failed attempts and return HTTP 429', async () => {
      const { app } = createAuthApp(userRepo, tokenService);
      const testIp = '192.168.1.50';

      // 4 failed attempts should return HTTP 401
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post('/v1/auth/login')
          .set('X-Forwarded-For', testIp)
          .send({
            email: 'student@quiz.local',
            password: `wrong_attempt_${i}`,
          });
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }

      // 5th failed attempt should trigger 429 lock
      const fifthRes = await request(app)
        .post('/v1/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({
          email: 'student@quiz.local',
          password: 'wrong_attempt_5',
        });
      expect(fifthRes.status).toBe(429);
      expect(fifthRes.body.success).toBe(false);
      expect(fifthRes.body.errorCode).toBe('TOO_MANY_REQUESTS');
      expect(fifthRes.headers['retry-after']).toBeDefined();

      // Subsequent attempt while locked also returns 429 immediately
      const lockedRes = await request(app)
        .post('/v1/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({
          email: 'student@quiz.local',
          password: 'student123', // even with correct password!
        });
      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.errorCode).toBe('TOO_MANY_REQUESTS');
    });

    it('should reset failure count upon successful login', async () => {
      const { app } = createAuthApp(userRepo, tokenService);
      const testIp = '192.168.1.51';

      // 2 failed attempts
      for (let i = 1; i <= 2; i++) {
        await request(app)
          .post('/v1/auth/login')
          .set('X-Forwarded-For', testIp)
          .send({
            email: 'student@quiz.local',
            password: 'wrong_password',
          });
      }

      // Successful login resets counter
      const successRes = await request(app)
        .post('/v1/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({
          email: 'student@quiz.local',
          password: 'student123',
        });
      expect(successRes.status).toBe(200);
      expect(successRes.body.success).toBe(true);

      // Subsequent 4 failed attempts should not trigger 429
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post('/v1/auth/login')
          .set('X-Forwarded-For', testIp)
          .send({
            email: 'student@quiz.local',
            password: `wrong_${i}`,
          });
        expect(res.status).toBe(401);
      }
    });
  });

  describe('Dynamic Normalized RBAC (PostgreSQL / SoT Model)', () => {
    it('should compute dynamic effective permissions for Student and Instructor', async () => {
      const loginUseCase = new LoginUseCase(userRepo, tokenService);

      // Student permissions
      const studentLogin = await loginUseCase.execute({
        email: 'student@quiz.local',
        password: 'student123',
      });
      expect(studentLogin.user.roles).toContain('STUDENT');
      expect(studentLogin.user.permissions).toContain('quiz:read');
      expect(studentLogin.user.permissions).toContain('attempt:create');
      expect(studentLogin.user.permissions).toContain('attempt:submit');
      expect(studentLogin.user.permissions).not.toContain('quiz:create');

      // Instructor permissions
      const instructorLogin = await loginUseCase.execute({
        email: 'instructor@quiz.local',
        password: 'teacher123',
      });
      expect(instructorLogin.user.roles).toContain('INSTRUCTOR');
      expect(instructorLogin.user.permissions).toContain('quiz:create');
      expect(instructorLogin.user.permissions).toContain('quiz:publish');
      expect(instructorLogin.user.permissions).toContain('attempt:review');

      // Admin permissions
      const adminLogin = await loginUseCase.execute({
        email: 'admin@quiz.local',
        password: 'admin123',
      });
      expect(adminLogin.user.roles).toContain('ADMIN');
      expect(adminLogin.user.permissions).toContain('*');
    });

    it('should expose GET /v1/auth/roles and GET /v1/auth/permissions', async () => {
      const { app } = createAuthApp(userRepo, tokenService);

      const rolesRes = await request(app).get('/v1/auth/roles');
      expect(rolesRes.status).toBe(200);
      expect(rolesRes.body.success).toBe(true);
      expect(rolesRes.body.data.length).toBeGreaterThanOrEqual(3);
      const studentRole = rolesRes.body.data.find((r: any) => r.code === 'STUDENT');
      expect(studentRole).toBeDefined();
      expect(studentRole.permissions).toContain('attempt:submit');

      const permsRes = await request(app).get('/v1/auth/permissions');
      expect(permsRes.status).toBe(200);
      expect(permsRes.body.success).toBe(true);
      expect(permsRes.body.data.some((p: any) => p.code === 'quiz:create')).toBe(true);
    });
  });
});
