import { ITokenStorage } from '../../domain/token/token.storage.port.js';
import { DrizzleTokenStorage } from './drizzle-user.repository.js';
import { getAuthDb, isAuthDbConfigured } from '../db/connection.js';

/**
 * Factory khởi tạo TokenStorage tuân thủ Dependency Inversion Principle.
 * 100% PostgreSQL - Không hỗ trợ bất kỳ giải pháp In-Memory nào.
 * Fail-Fast nếu thiếu kết nối database.
 */
export function createTokenStorage(db?: any): ITokenStorage {
  if (db) {
    return new DrizzleTokenStorage(db);
  }

  if (!isAuthDbConfigured()) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: AUTH_DATABASE_URL is required. In-memory mode has been permanently removed.'
    );
  }

  console.log('📦 Initializing DrizzleTokenStorage (PostgreSQL - Database-per-Service)');
  return new DrizzleTokenStorage(getAuthDb());
}
