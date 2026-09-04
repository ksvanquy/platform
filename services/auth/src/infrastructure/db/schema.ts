import { pgTable, varchar, text, timestamp, boolean, primaryKey } from 'drizzle-orm/pg-core';

/**
 * 1. Bảng Users chuẩn hóa (Identity-only bounded context).
 * Không còn chứa mảng chuỗi roles tĩnh. Mọi phân quyền thông qua user_roles.
 */
export const users = pgTable('users', {
  id: varchar('id', { length: 64 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull().default('tenant_default'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/**
 * 2. Bảng Roles (Danh mục vai trò người dùng trong hệ thống)
 */
export const roles = pgTable('roles', {
  id: varchar('id', { length: 64 }).primaryKey(),
  code: varchar('code', { length: 64 }).notNull().unique(), // 'ADMIN', 'INSTRUCTOR', 'STUDENT'
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RoleRow = typeof roles.$inferSelect;
export type NewRoleRow = typeof roles.$inferInsert;

/**
 * 3. Bảng Permissions (Danh mục quyền hạn nguyên tử - Fine-grained actions)
 */
export const permissions = pgTable('permissions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  code: varchar('code', { length: 128 }).notNull().unique(), // 'quiz:create', 'attempt:submit', '*'
  resource: varchar('resource', { length: 64 }).notNull(),   // 'quiz', 'attempt', 'user', 'system'
  action: varchar('action', { length: 64 }).notNull(),       // 'read', 'write', 'create', 'delete'
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PermissionRow = typeof permissions.$inferSelect;
export type NewPermissionRow = typeof permissions.$inferInsert;

/**
 * 4. Bảng User - Roles (Quan hệ nhiều - nhiều giữa User và Role)
 */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: varchar('user_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: varchar('role_id', { length: 64 })
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    assignedBy: varchar('assigned_by', { length: 64 })
      .references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
  ]
);

export type UserRoleRow = typeof userRoles.$inferSelect;
export type NewUserRoleRow = typeof userRoles.$inferInsert;

/**
 * 5. Bảng Role - Permissions (Quan hệ nhiều - nhiều giữa Role và Permission)
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: varchar('role_id', { length: 64 })
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: varchar('permission_id', { length: 64 })
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
  ]
);

export type RolePermissionRow = typeof rolePermissions.$inferSelect;
export type NewRolePermissionRow = typeof rolePermissions.$inferInsert;

/**
 * 6. Bảng Refresh Tokens lưu trữ phiên làm việc lâu dài (được băm SHA-256)
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
