import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { DrizzleUserRepository } from './drizzle-user.repository.js';
import { getAuthDb, isAuthDbConfigured } from '../db/connection.js';

/**
 * Factory khởi tạo UserRepository tuân thủ Dependency Inversion Principle.
 * 100% PostgreSQL - Không hỗ trợ bất kỳ giải pháp In-Memory nào.
 * Fail-Fast nếu thiếu kết nối database.
 */
export function createUserRepository(db?: any): IUserRepository {
  if (db) {
    return new DrizzleUserRepository(db);
  }

  if (!isAuthDbConfigured()) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: AUTH_DATABASE_URL is required. In-memory mode has been permanently removed.'
    );
  }

  console.log('📦 Initializing DrizzleUserRepository (PostgreSQL - Database-per-Service)');
  return new DrizzleUserRepository(getAuthDb());
}
