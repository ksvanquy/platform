import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { User } from '../src/domain/user/user.entity.js';
import { createUserRepository } from '../src/infrastructure/persistence/repository.factory.js';
import { createTokenStorage } from '../src/infrastructure/persistence/token-storage.factory.js';
import { DrizzleUserRepository, DrizzleTokenStorage } from '../src/infrastructure/persistence/drizzle-user.repository.js';
import { sanitizePostgresUrl } from '../src/infrastructure/db/connection.js';
import { setupTestPostgresDb, TestPostgresContext } from './helpers/test-db.helper.js';

describe('Auth Service Phase 4: 100% PostgreSQL Persistence & Fail-Fast', () => {
  let testContext: TestPostgresContext;

  beforeAll(async () => {
    testContext = await setupTestPostgresDb();
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  describe('Factory Fail-Fast Validation', () => {
    it('should throw fatal configuration error when AUTH_DATABASE_URL is not set', () => {
      const originalAuthUrl = process.env.AUTH_DATABASE_URL;
      const originalDbUrl = process.env.DATABASE_URL;
      delete process.env.AUTH_DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        expect(() => createUserRepository()).toThrow(
          'FATAL CONFIGURATION ERROR: AUTH_DATABASE_URL is required. In-memory mode has been permanently removed.'
        );
        expect(() => createTokenStorage()).toThrow(
          'FATAL CONFIGURATION ERROR: AUTH_DATABASE_URL is required. In-memory mode has been permanently removed.'
        );
      } finally {
        if (originalAuthUrl) process.env.AUTH_DATABASE_URL = originalAuthUrl;
        if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
      }
    });

    it('should initialize DrizzleUserRepository and DrizzleTokenStorage when db instance is supplied', () => {
      const userRepo = createUserRepository(testContext.db);
      expect(userRepo).toBeInstanceOf(DrizzleUserRepository);

      const tokenStorage = createTokenStorage(testContext.db);
      expect(tokenStorage).toBeInstanceOf(DrizzleTokenStorage);
    });

    it('should sanitize ?schema= query parameter from PostgreSQL URLs to prevent code 42704 startup error', () => {
      // Common Prisma/Supabase pattern that triggers PostgresError: unrecognized configuration parameter "schema"
      const urlWithSchema = 'postgres://postgres:admin123@localhost:5432/auth_db?schema=public';
      const sanitized = sanitizePostgresUrl(urlWithSchema);
      expect(sanitized).not.toContain('schema=public');
      expect(sanitized).toBe('postgres://postgres:admin123@localhost:5432/auth_db');

      // Schema with other parameters
      const urlWithOtherParams = 'postgresql://user:pass@localhost:5432/db?schema=public&sslmode=disable';
      const sanitizedOther = sanitizePostgresUrl(urlWithOtherParams);
      expect(sanitizedOther).not.toContain('schema=public');
      expect(sanitizedOther).toContain('sslmode=disable');

      // Custom non-public schema mapped to search_path
      const urlCustomSchema = 'postgres://user:pass@localhost:5432/db?schema=tenant_1';
      const sanitizedCustom = sanitizePostgresUrl(urlCustomSchema);
      expect(sanitizedCustom).not.toContain('schema=tenant_1');
      expect(sanitizedCustom).toContain('search_path=tenant_1');
    });
  });

  describe('DrizzleTokenStorage (PostgreSQL Lifecycle & Revocation)', () => {
    it('should correctly manage refresh token lifecycle in PostgreSQL table', async () => {
      const storage = testContext.tokenStorage;
      const token = 'sample_postgres_refresh_token_xyz_123';
      const userId = 'usr_student_local';
      const futureExpiry = new Date(Date.now() + 3600 * 1000);

      // Save token into Postgres
      await storage.saveRefreshToken(token, userId, futureExpiry);

      // Validate unrevoked token
      const validation = await storage.validateRefreshToken(token);
      expect(validation).not.toBeNull();
      expect(validation?.userId).toBe(userId);

      // Revoke token
      const revoked = await storage.revokeRefreshToken(token);
      expect(revoked).toBe(true);

      // Validate after revocation must return null
      const validationAfterRevoke = await storage.validateRefreshToken(token);
      expect(validationAfterRevoke).toBeNull();
    });

    it('should reject expired tokens in PostgreSQL storage', async () => {
      const storage = testContext.tokenStorage;
      const token = 'expired_postgres_token_abc_789';
      const userId = 'usr_student_local';
      const pastExpiry = new Date(Date.now() - 1000); // 1 second ago

      await storage.saveRefreshToken(token, userId, pastExpiry);

      const validation = await storage.validateRefreshToken(token);
      expect(validation).toBeNull();
    });
  });

  describe('DrizzleUserRepository (Relational Single-Query JOIN & Normalization)', () => {
    it('should retrieve seeded user with joined roles and permissions directly from PostgreSQL', async () => {
      const userRepo = testContext.userRepo;
      const student = await userRepo.findByEmail('student@quiz.local');

      expect(student).not.toBeNull();
      expect(student?.id).toBe('usr_student_local');
      expect(student?.email).toBe('student@quiz.local');
      expect(student?.roles.map((r) => r.code)).toContain('STUDENT');

      // Check joined permissions from role_permissions table
      const permissions = student?.roles[0].permissions.map((p) => p.code) || [];
      expect(permissions).toContain('user:read');
      expect(permissions).toContain('user:write');
      expect(permissions).not.toContain('quiz:read');
      expect(permissions).not.toContain('attempt:create');
    });

    it('should persist a new user and map user_roles relationship in PostgreSQL', async () => {
      const userRepo = testContext.userRepo;
      const studentRole = await userRepo.getRoleByCode('STUDENT');
      expect(studentRole).not.toBeNull();

      const newUser = new User({
        id: 'usr_new_test_001',
        email: 'drizzle_test@quiz.local',
        name: 'Drizzle Test User',
        passwordHash: 'hashed_password_sample',
        roles: [studentRole!],
        metadata: { locale: 'vi-VN', department: 'Engineering' },
      });

      await userRepo.save(newUser);

      const fetched = await userRepo.findById('usr_new_test_001');
      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe('Drizzle Test User');
      expect(fetched?.roles[0].code).toBe('STUDENT');
      expect(fetched?.hasPermission('user:read')).toBe(true);
      expect(fetched?.metadata).toEqual({ locale: 'vi-VN', department: 'Engineering' });
      expect((fetched as any)?.tenantId).toBeUndefined();
    });

    it('should list all system roles with their full permissions from PostgreSQL', async () => {
      const userRepo = testContext.userRepo;
      const roles = await userRepo.listRoles();

      const roleCodes = roles.map((r) => r.code);
      expect(roleCodes).toContain('STUDENT');
      expect(roleCodes).toContain('INSTRUCTOR');
      expect(roleCodes).toContain('ADMIN');

      const adminRole = roles.find((r) => r.code === 'ADMIN');
      expect(adminRole?.hasPermission('*')).toBe(true);
      expect(adminRole?.isAdministrator()).toBe(true);
    });

    it('should list all normalized system permissions from PostgreSQL', async () => {
      const userRepo = testContext.userRepo;
      const perms = await userRepo.listPermissions();

      expect(perms.length).toBeGreaterThanOrEqual(8);
      const permCodes = perms.map((p) => p.code);
      expect(permCodes).toContain('*');
      expect(permCodes).toContain('user:read');
      expect(permCodes).toContain('user:write');
      expect(permCodes).toContain('user:manage');
      expect(permCodes).toContain('role:read');
      expect(permCodes).toContain('role:write');
      expect(permCodes).toContain('permission:read');
      expect(permCodes).toContain('system:config');

      // Purged domain permissions
      expect(permCodes).not.toContain('quiz:read');
      expect(permCodes).not.toContain('quiz:manage_all');
      expect(permCodes).not.toContain('attempt:read_self');
      expect(permCodes).not.toContain('attempt:read_all');
    });
  });
});
