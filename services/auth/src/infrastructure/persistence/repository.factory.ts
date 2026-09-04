import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { InMemoryUserRepository } from './in-memory-user.repository.js';
import { DrizzleUserRepository } from './drizzle-user.repository.js';
import { isAuthDbConfigured } from '../db/connection.js';

/**
 * Factory khởi tạo UserRepository tuân thủ Dependency Inversion Principle.
 * Tự động chọn DrizzleUserRepository khi có kết nối PostgreSQL (AUTH_DATABASE_URL),
 * hoặc InMemoryUserRepository trong môi trường kiểm thử / in-memory.
 */
export function createUserRepository(): IUserRepository {
  if (isAuthDbConfigured()) {
    console.log('📦 Initializing DrizzleUserRepository (PostgreSQL - Database-per-Service)');
    return new DrizzleUserRepository();
  }
  console.log('🧠 Initializing InMemoryUserRepository (Local / Testing Mode)');
  return new InMemoryUserRepository();
}
