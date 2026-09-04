import crypto from 'node:crypto';
import { User } from '../../domain/user/user.entity.js';
import { IUserRepository } from '../../domain/user/user.repository.port.js';

const SCRYPT_KEYLEN = 64;

/**
 * Băm mật khẩu bằng scrypt chuẩn native Node.js (RFC 7914).
 * Định dạng lưu trữ: `scrypt$<salt_hex>$<hash_hex>`
 */
export function hashPassword(password: string, salt?: string): string {
  const generatedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, generatedSalt, SCRYPT_KEYLEN);
  return `scrypt$${generatedSalt}$${derivedKey.toString('hex')}`;
}

/**
 * Kiểm tra mật khẩu khớp với chuỗi băm (hỗ trợ cả scrypt và legacy sha256 salt nếu có).
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expectedKey = parts[2];
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(derivedKey, 'hex'), Buffer.from(expectedKey, 'hex'));
  }

  // Backward compatibility fallback for legacy sha256 hash: quiz_salt_${password}
  const legacyHash = crypto.createHash('sha256').update(`quiz_salt_${password}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(legacyHash, 'utf8'), Buffer.from(storedHash, 'utf8'));
}

export class InMemoryUserRepository implements IUserRepository {
  private readonly users: Map<string, User> = new Map();

  constructor() {
    this.seedUsers();
  }

  private seedUsers(): void {
    const defaultUsers = [
      new User({
        id: 'usr_student_01',
        email: 'student@quiz.local',
        name: 'Nguyen Van Học Viên',
        passwordHash: hashPassword('student123'),
        roles: ['STUDENT'],
        tenantId: 'tenant_default',
      }),
      new User({
        id: 'usr_instructor_01',
        email: 'instructor@quiz.local',
        name: 'Tran Thi Giảng Viên',
        passwordHash: hashPassword('teacher123'),
        roles: ['INSTRUCTOR'],
        tenantId: 'tenant_default',
      }),
      new User({
        id: 'usr_admin_01',
        email: 'admin@quiz.local',
        name: 'Administrator',
        passwordHash: hashPassword('admin123'),
        roles: ['ADMIN'],
        tenantId: 'tenant_default',
      }),
    ];

    for (const user of defaultUsers) {
      this.users.set(user.id, user);
    }
  }

  async findById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email === normalized) {
        return user;
      }
    }
    return null;
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async list(): Promise<User[]> {
    return Array.from(this.users.values());
  }
}
