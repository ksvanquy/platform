import { describe, it, expect, vi } from 'vitest';
import { User } from '../src/domain/user/user.entity.js';
import { createUserRepository } from '../src/infrastructure/persistence/repository.factory.js';
import { createTokenStorage } from '../src/infrastructure/persistence/token-storage.factory.js';
import { InMemoryUserRepository } from '../src/infrastructure/persistence/in-memory-user.repository.js';
import { InMemoryTokenStorage } from '../src/infrastructure/persistence/in-memory-token.storage.js';
import { isAuthDbConfigured } from '../src/infrastructure/db/connection.js';

describe('Auth Service Phase 4: Database-per-Service & Persistence Factories', () => {
  it('should initialize InMemoryUserRepository when AUTH_DATABASE_URL is not set', () => {
    delete process.env.AUTH_DATABASE_URL;
    expect(isAuthDbConfigured()).toBe(false);

    const userRepo = createUserRepository();
    expect(userRepo).toBeInstanceOf(InMemoryUserRepository);
  });

  it('should initialize InMemoryTokenStorage when AUTH_DATABASE_URL is not set', () => {
    delete process.env.AUTH_DATABASE_URL;
    expect(isAuthDbConfigured()).toBe(false);

    const tokenStorage = createTokenStorage();
    expect(tokenStorage).toBeInstanceOf(InMemoryTokenStorage);
  });

  it('should correctly manage refresh token lifecycle in TokenStorage', async () => {
    const storage = new InMemoryTokenStorage();
    const token = 'sample_refresh_token_xyz_123';
    const userId = 'usr_test_01';
    const futureExpiry = new Date(Date.now() + 3600 * 1000);

    // Save
    storage.saveRefreshToken(token, userId, futureExpiry);

    // Validate
    const validation = await storage.validateRefreshToken(token);
    expect(validation).not.toBeNull();
    expect(validation?.userId).toBe(userId);

    // Revoke
    const revoked = await storage.revokeRefreshToken(token);
    expect(revoked).toBe(true);

    // Validate after revoke
    const validationAfterRevoke = await storage.validateRefreshToken(token);
    expect(validationAfterRevoke).toBeNull();
  });

  it('should reject expired tokens in TokenStorage', async () => {
    const storage = new InMemoryTokenStorage();
    const token = 'expired_refresh_token_abc_789';
    const userId = 'usr_test_expired';
    const pastExpiry = new Date(Date.now() - 1000); // 1 second ago

    storage.saveRefreshToken(token, userId, pastExpiry);

    const validation = await storage.validateRefreshToken(token);
    expect(validation).toBeNull();
  });
});
