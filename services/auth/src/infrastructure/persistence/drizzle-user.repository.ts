import crypto from 'node:crypto';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { User } from '../../domain/user/user.entity.js';
import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { ITokenStorage } from '../../domain/token/token.storage.port.js';
import { users, refreshTokens } from '../db/schema.js';
import { getAuthDb } from '../db/connection.js';

export class DrizzleUserRepository implements IUserRepository {
  private readonly db = getAuthDb();

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];

    return new User({
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.passwordHash,
      roles: row.roles,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];

    return new User({
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.passwordHash,
      roles: row.roles,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
    });
  }

  async save(user: User): Promise<void> {
    await this.db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        name: user.name,
        passwordHash: user.passwordHash,
        roles: [...user.roles],
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          roles: [...user.roles],
          tenantId: user.tenantId,
          updatedAt: new Date(),
        },
      });
  }

  async list(): Promise<User[]> {
    const rows = await this.db.select().from(users);
    return rows.map(
      (row) =>
        new User({
          id: row.id,
          email: row.email,
          name: row.name,
          passwordHash: row.passwordHash,
          roles: row.roles,
          tenantId: row.tenantId,
          createdAt: row.createdAt,
        })
    );
  }
}

/**
 * Lưu trữ Refresh Token trong PostgreSQL qua Drizzle ORM.
 * Token được băm SHA-256 trước khi lưu để bảo vệ người dùng ngay cả khi DB bị dump.
 */
export class DrizzleTokenStorage implements ITokenStorage {
  private readonly db = getAuthDb();

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async saveRefreshToken(token: string, userId: string, expiresAt: Date): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.db.insert(refreshTokens).values({
      tokenHash,
      userId,
      expiresAt,
      createdAt: new Date(),
    });
  }

  async validateRefreshToken(token: string): Promise<{ userId: string } | null> {
    const tokenHash = this.hashToken(token);
    const now = new Date();

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

    if (rows.length === 0) return null;
    return { userId: rows[0].userId };
  }

  async revokeRefreshToken(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const result = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));

    return true;
  }
}
