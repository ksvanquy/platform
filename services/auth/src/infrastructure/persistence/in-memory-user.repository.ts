import { User } from '../../domain/user/user.entity.js';
import { Role } from '../../domain/role/role.entity.js';
import { Permission } from '../../domain/role/permission.entity.js';
import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { ITokenStorage, TokenRecord } from '../../domain/token/token.storage.port.js';
import { createDefaultPermissions, createDefaultRoles } from '../../domain/role/default-rbac.data.js';
import { SEED_USERS } from '../db/seed.js';

export class InMemoryUserRepository implements IUserRepository {
  private users: Map<string, User> = new Map();
  private roles: Map<string, Role> = new Map();
  private permissions: Map<string, Permission> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const perms = createDefaultPermissions();
    for (const p of perms) {
      this.permissions.set(p.code, p);
    }

    const defaultRoles = createDefaultRoles();
    for (const r of defaultRoles) {
      this.roles.set(r.code, r);
    }

    for (const seed of SEED_USERS) {
      const role = this.roles.get(seed.roleCode);
      const user = new User({
        id: seed.id,
        email: seed.email,
        name: seed.name,
        passwordHash: seed.passwordHash,
        roles: role ? [role] : [],
        metadata: seed.metadata || {},
        isActive: true,
      });
      this.users.set(user.id, user);
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
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

  async updateStatus(id: string, isActive: boolean): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = user.withActiveStatus(isActive);
    this.users.set(id, updated);
    return updated;
  }

  getRoleByCode(code: string): Role | null {
    return this.roles.get(code.toUpperCase().trim()) || null;
  }

  listRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  listPermissions(): Permission[] {
    return Array.from(this.permissions.values());
  }
}

export class InMemoryTokenStorage implements ITokenStorage {
  private tokens = new Map<string, { userId: string; expiresAt: Date; revokedAt: Date | null; familyId?: string }>();

  saveRefreshToken(token: string, userId: string, expiresAt: Date, familyId?: string): void {
    this.tokens.set(token, { userId, expiresAt, revokedAt: null, familyId });
  }

  validateRefreshToken(token: string): { userId: string; familyId?: string } | null {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (entry.revokedAt !== null) return null;
    if (new Date() > entry.expiresAt) return null;
    return { userId: entry.userId, familyId: entry.familyId };
  }

  inspectRefreshToken(token: string): TokenRecord | null {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    const now = new Date();
    return {
      userId: entry.userId,
      familyId: entry.familyId,
      expiresAt: entry.expiresAt,
      revokedAt: entry.revokedAt,
      isRevoked: entry.revokedAt !== null,
      isExpired: entry.expiresAt <= now,
    };
  }

  revokeRefreshToken(token: string): boolean {
    const entry = this.tokens.get(token);
    if (!entry) return false;
    entry.revokedAt = new Date();
    return true;
  }

  revokeAllUserTokens(userId: string): void {
    const now = new Date();
    for (const entry of this.tokens.values()) {
      if (entry.userId === userId && !entry.revokedAt) {
        entry.revokedAt = now;
      }
    }
  }

  revokeTokenFamily(familyId: string): void {
    const now = new Date();
    for (const entry of this.tokens.values()) {
      if (entry.familyId === familyId && !entry.revokedAt) {
        entry.revokedAt = now;
      }
    }
  }
}
