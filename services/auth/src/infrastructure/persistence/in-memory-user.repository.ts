import crypto from 'node:crypto';
import { User } from '../../domain/user/user.entity.js';
import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { Role } from '../../domain/role/role.entity.js';
import { Permission } from '../../domain/role/permission.entity.js';
import { createDefaultRoles, createDefaultPermissions } from '../../domain/role/default-rbac.data.js';

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
 * Kiểm tra mật khẩu khớp với chuỗi băm.
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

  // Legacy fallback if any
  const legacyHash = crypto.createHash('sha256').update(`quiz_salt_${password}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(legacyHash, 'utf8'), Buffer.from(storedHash, 'utf8'));
}

export class InMemoryUserRepository implements IUserRepository {
  private readonly users: Map<string, User> = new Map();
  private readonly roles: Map<string, Role> = new Map();
  private readonly permissions: Map<string, Permission> = new Map();

  constructor() {
    this.seedRbac();
    this.seedUsers();
  }

  private seedRbac(): void {
    for (const perm of createDefaultPermissions()) {
      this.permissions.set(perm.id, perm);
    }
    for (const role of createDefaultRoles()) {
      this.roles.set(role.code, role);
    }
  }

  private seedUsers(): void {
    const studentRole = this.roles.get('STUDENT')!;
    const instructorRole = this.roles.get('INSTRUCTOR')!;
    const adminRole = this.roles.get('ADMIN')!;

    const defaultUsers = [
      new User({
        id: 'usr_student_01',
        email: 'student@quiz.local',
        name: 'Nguyen Van Học Viên',
        passwordHash: hashPassword('student123'),
        roles: [studentRole],
        tenantId: 'tenant_default',
      }),
      new User({
        id: 'usr_instructor_01',
        email: 'instructor@quiz.local',
        name: 'Tran Thi Giảng Viên',
        passwordHash: hashPassword('teacher123'),
        roles: [instructorRole],
        tenantId: 'tenant_default',
      }),
      new User({
        id: 'usr_admin_01',
        email: 'admin@quiz.local',
        name: 'Administrator',
        passwordHash: hashPassword('admin123'),
        roles: [adminRole],
        tenantId: 'tenant_default',
      }),
    ];

    for (const user of defaultUsers) {
      this.users.set(user.id, user);
    }
  }

  getRoleByCode(code: string): Role | null {
    return this.roles.get(code.toUpperCase()) || null;
  }

  listRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  listPermissions(): Permission[] {
    return Array.from(this.permissions.values());
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
