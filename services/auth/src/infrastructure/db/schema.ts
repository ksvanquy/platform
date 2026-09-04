import { pgTable, varchar, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Bảng Users độc lập của Auth Service (Database-per-Service bounded context).
 * Quản lý định danh, thông tin tài khoản và phân quyền người dùng.
 */
export const users = pgTable('users', {
  id: varchar('id', { length: 64 }).primaryKey(), // 'usr_...'
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  roles: text('roles').array().notNull().default(['STUDENT']),
  tenantId: varchar('tenant_id', { length: 64 }).notNull().default('tenant_default'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/**
 * Bảng refresh_tokens lưu trữ và quản lý phiên làm việc lâu dài (thay thế in-memory map).
 * Token được băm SHA-256 trước khi lưu để chống rò rỉ token nếu database bị dump.
 */
export const refreshTokens = pgTable('refresh_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: varchar('user_id', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRow = typeof refreshTokens.$inferInsert;
