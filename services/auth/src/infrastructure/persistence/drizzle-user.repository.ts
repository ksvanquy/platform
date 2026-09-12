import crypto from 'node:crypto';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { User } from '../../domain/user/user.entity.js';
import { Role } from '../../domain/role/role.entity.js';
import { Permission } from '../../domain/role/permission.entity.js';
import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { ITokenStorage, TokenRecord } from '../../domain/token/token.storage.port.js';
import {
  users,
  roles,
  permissions,
  userRoles,
  rolePermissions,
  refreshTokens,
} from '../db/schema.js';
import { getAuthDb } from '../db/connection.js';

export class DrizzleUserRepository implements IUserRepository {
  private readonly db: any;

  constructor(db?: any) {
    this.db = db || getAuthDb();
  }

  private mapRowsToUser(rows: any[]): User | null {
    if (!rows || rows.length === 0) return null;
    const first = rows[0];

    // Map roles and their nested permissions
    const roleMap = new Map<string, { roleProps: any; perms: Permission[] }>();

    for (const r of rows) {
      if (r.roleId && !roleMap.has(r.roleId)) {
        roleMap.set(r.roleId, {
          roleProps: {
            id: r.roleId,
            code: r.roleCode,
            name: r.roleName,
            description: r.roleDesc || undefined,
            isSystem: Boolean(r.roleIsSystem),
          },
          perms: [],
        });
      }
      if (r.roleId && r.permId && r.permCode) {
        roleMap.get(r.roleId)!.perms.push(
          new Permission({
            id: r.permId,
            code: r.permCode,
            resource: r.permResource || '',
            action: r.permAction || '',
            description: r.permDesc || undefined,
          })
        );
      }
    }

    const domainRoles = Array.from(roleMap.values()).map(
      (entry) => new Role({ ...entry.roleProps, permissions: entry.perms })
    );

    return new User({
      id: first.userId,
      email: first.userEmail,
      name: first.userName,
      passwordHash: first.userPasswordHash,
      roles: domainRoles,
      metadata: (first.userMetadata as Record<string, unknown>) || {},
      isActive: first.userIsActive,
      createdAt: first.userCreatedAt,
      updatedAt: first.userUpdatedAt,
    });
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select({
        userId: users.id,
        userEmail: users.email,
        userName: users.name,
        userPasswordHash: users.passwordHash,
        userMetadata: users.metadata,
        userIsActive: users.isActive,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
        roleId: roles.id,
        roleCode: roles.code,
        roleName: roles.name,
        roleDesc: roles.description,
        roleIsSystem: roles.isSystem,
        permId: permissions.id,
        permCode: permissions.code,
        permResource: permissions.resource,
        permAction: permissions.action,
        permDesc: permissions.description,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(users.id, id));

    return this.mapRowsToUser(rows);
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    const rows = await this.db
      .select({
        userId: users.id,
        userEmail: users.email,
        userName: users.name,
        userPasswordHash: users.passwordHash,
        userMetadata: users.metadata,
        userIsActive: users.isActive,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
        roleId: roles.id,
        roleCode: roles.code,
        roleName: roles.name,
        roleDesc: roles.description,
        roleIsSystem: roles.isSystem,
        permId: permissions.id,
        permCode: permissions.code,
        permResource: permissions.resource,
        permAction: permissions.action,
        permDesc: permissions.description,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(users.email, normalized));

    return this.mapRowsToUser(rows);
  }

  async getRoleByCode(code: string): Promise<Role | null> {
    const normalized = code.toUpperCase().trim();
    const rows = await this.db
      .select({
        roleId: roles.id,
        roleCode: roles.code,
        roleName: roles.name,
        roleDesc: roles.description,
        roleIsSystem: roles.isSystem,
        permId: permissions.id,
        permCode: permissions.code,
        permResource: permissions.resource,
        permAction: permissions.action,
        permDesc: permissions.description,
      })
      .from(roles)
      .leftJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(roles.code, normalized));

    if (rows.length === 0) return null;

    const perms: Permission[] = [];
    for (const r of rows) {
      if (r.permId && r.permCode) {
        perms.push(
          new Permission({
            id: r.permId,
            code: r.permCode,
            resource: r.permResource || '',
            action: r.permAction || '',
            description: r.permDesc || undefined,
          })
        );
      }
    }

    const first = rows[0];
    return new Role({
      id: first.roleId,
      code: first.roleCode,
      name: first.roleName,
      description: first.roleDesc || undefined,
      isSystem: Boolean(first.roleIsSystem),
      permissions: perms,
    });
  }

  async save(user: User): Promise<void> {
    // 1. Upsert bảng users (Identity)
    await this.db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        name: user.name,
        passwordHash: user.passwordHash,
        metadata: user.metadata || {},
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          metadata: user.metadata || {},
          isActive: user.isActive,
          updatedAt: new Date(),
        },
      });

    // 2. Đồng bộ bảng user_roles (RBAC assignment)
    if (user.roles.length > 0) {
      for (const role of user.roles) {
        // Đảm bảo role đã tồn tại trong bảng roles
        const existingRole = await this.db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.code, role.code))
          .limit(1);

        const targetRoleId = existingRole.length > 0 ? existingRole[0].id : role.id;

        await this.db
          .insert(userRoles)
          .values({
            userId: user.id,
            roleId: targetRoleId,
            assignedAt: new Date(),
          })
          .onConflictDoNothing();
      }
    }
  }

  async list(): Promise<User[]> {
    const userRows = await this.db.select().from(users);
    const result: User[] = [];
    for (const u of userRows) {
      const fullUser = await this.findById(u.id);
      if (fullUser) result.push(fullUser);
    }
    return result;
  }

  async listRoles(): Promise<Role[]> {
    const allRoles = await this.db.select().from(roles);
    const result: Role[] = [];
    for (const r of allRoles) {
      const fullRole = await this.getRoleByCode(r.code);
      if (fullRole) result.push(fullRole);
    }
    return result;
  }

  async listPermissions(): Promise<Permission[]> {
    const permRows = await this.db.select().from(permissions);
    return permRows.map(
      (p: any) =>
        new Permission({
          id: p.id,
          code: p.code,
          resource: p.resource,
          action: p.action,
          description: p.description || undefined,
          createdAt: p.createdAt,
        })
    );
  }

  async assignRoles(userId: string, roleCodes: string[]): Promise<User | null> {
    const existing = await this.findById(userId);
    if (!existing) return null;

    // Delete existing user_roles
    await this.db.delete(userRoles).where(eq(userRoles.userId, userId));

    // Insert new user_roles
    for (const code of roleCodes) {
      const normalized = code.toUpperCase().trim();
      const roleRow = await this.db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.code, normalized))
        .limit(1);

      if (roleRow.length > 0) {
        await this.db
          .insert(userRoles)
          .values({
            userId,
            roleId: roleRow[0].id,
            assignedAt: new Date(),
          })
          .onConflictDoNothing();
      }
    }

    return await this.findById(userId);
  }

  async updateStatus(id: string, isActive: boolean): Promise<User | null> {
    await this.db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, id));

    return await this.findById(id);
  }
}

/**
 * Lưu trữ Refresh Token trong PostgreSQL qua Drizzle ORM.
 * Token được băm SHA-256 trước khi lưu để bảo vệ người dùng.
 */
export class DrizzleTokenStorage implements ITokenStorage {
  private readonly db: any;

  private inMemoryFallback = new Map<string, { userId: string; familyId?: string; expiresAt: Date; revokedAt: Date | null }>();

  constructor(db?: any) {
    this.db = db || getAuthDb();
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async saveRefreshToken(token: string, userId: string, expiresAt: Date, familyId?: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    this.inMemoryFallback.set(tokenHash, {
      userId,
      familyId,
      expiresAt,
      revokedAt: null,
    });
    try {
      await this.db
        .insert(refreshTokens)
        .values({
          tokenHash,
          userId,
          familyId: familyId || null,
          expiresAt,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    } catch {
      // Gracefully fall back to inMemoryFallback
    }
  }

  async validateRefreshToken(token: string): Promise<{ userId: string; familyId?: string } | null> {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    try {
      const rows = await this.db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tokenHash, tokenHash),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, now)
          )
        )
        .limit(1);

      if (rows.length > 0) {
        return {
          userId: rows[0].userId,
          familyId: rows[0].familyId || undefined,
        };
      }
    } catch {
      // Fall through to memory fallback
    }

    const cached = this.inMemoryFallback.get(tokenHash);
    if (cached && cached.revokedAt === null && cached.expiresAt > now) {
      return {
        userId: cached.userId,
        familyId: cached.familyId,
      };
    }
    return null;
  }

  async inspectRefreshToken(token: string): Promise<TokenRecord | null> {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    try {
      const rows = await this.db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);

      if (rows.length > 0) {
        const row = rows[0];
        return {
          userId: row.userId,
          familyId: row.familyId || undefined,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          isRevoked: row.revokedAt !== null,
          isExpired: row.expiresAt <= now,
        };
      }
    } catch {
      // Fall through to memory fallback
    }

    const cached = this.inMemoryFallback.get(tokenHash);
    if (cached) {
      return {
        userId: cached.userId,
        familyId: cached.familyId,
        expiresAt: cached.expiresAt,
        revokedAt: cached.revokedAt,
        isRevoked: cached.revokedAt !== null,
        isExpired: cached.expiresAt <= now,
      };
    }
    return null;
  }

  async revokeRefreshToken(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const cached = this.inMemoryFallback.get(tokenHash);
    if (cached) {
      cached.revokedAt = new Date();
    }
    try {
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash));
    } catch {
      // Handled via memory fallback
    }

    return true;
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    for (const record of this.inMemoryFallback.values()) {
      if (record.userId === userId && !record.revokedAt) {
        record.revokedAt = new Date();
      }
    }
    try {
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    } catch {
      // Handled via memory fallback
    }
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    for (const record of this.inMemoryFallback.values()) {
      if (record.familyId === familyId && !record.revokedAt) {
        record.revokedAt = new Date();
      }
    }
    try {
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
    } catch {
      // Handled via memory fallback
    }
  }
}
