import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { DrizzleUserRepository } from './drizzle-user.repository.js';
import { InMemoryUserRepository } from './in-memory-user.repository.js';
import { getAuthDb, isAuthDbConfigured } from '../db/connection.js';

let sharedInMemoryRepo: InMemoryUserRepository | null = null;

export function createUserRepository(db?: any): IUserRepository {
  if (db) {
    return new DrizzleUserRepository(db);
  }

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    if (!isAuthDbConfigured()) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: AUTH_DATABASE_URL is required. In-memory mode has been permanently removed.'
      );
    }
  }

  if (!isAuthDbConfigured()) {
    console.warn('⚠️ AUTH_DATABASE_URL not configured: Falling back to In-Memory User Repository with pre-seeded users and roles.');
    if (!sharedInMemoryRepo) {
      sharedInMemoryRepo = new InMemoryUserRepository();
    }
    return sharedInMemoryRepo;
  }

  try {
    console.log('📦 Initializing DrizzleUserRepository (PostgreSQL - Database-per-Service)');
    return new DrizzleUserRepository(getAuthDb());
  } catch (err) {
    console.warn('⚠️ Failed to connect to PostgreSQL Auth DB, falling back to in-memory mode:', err);
    if (!sharedInMemoryRepo) {
      sharedInMemoryRepo = new InMemoryUserRepository();
    }
    return sharedInMemoryRepo;
  }
}
