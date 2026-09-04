import { ITokenStorage } from '../../domain/token/token.storage.port.js';
import { InMemoryTokenStorage } from './in-memory-token.storage.js';
import { DrizzleTokenStorage } from './drizzle-user.repository.js';
import { isAuthDbConfigured } from '../db/connection.js';

/**
 * Factory khởi tạo TokenStorage tuân thủ Dependency Inversion Principle.
 * Tự động chọn DrizzleTokenStorage khi có kết nối PostgreSQL (AUTH_DATABASE_URL),
 * hoặc InMemoryTokenStorage trong môi trường kiểm thử / local mode.
 */
export function createTokenStorage(): ITokenStorage {
  if (isAuthDbConfigured()) {
    console.log('📦 Initializing DrizzleTokenStorage (PostgreSQL - Database-per-Service)');
    return new DrizzleTokenStorage();
  }
  console.log('🧠 Initializing InMemoryTokenStorage (Local / Testing Mode)');
  return new InMemoryTokenStorage();
}
