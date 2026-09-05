import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getAuthDb, closeAuthDb, isAuthDbConfigured } from './connection.js';
import { users, roles, permissions, rolePermissions, userRoles } from './schema.js';
import { hashPassword } from '../crypto/password.js';
import { DEFAULT_PERMISSIONS_DATA } from '../../domain/role/default-rbac.data.js';
import { eq } from 'drizzle-orm';

export const SEED_ROLES = [
  {
    id: 'role_student',
    code: 'STUDENT',
    name: 'Student',
    description: 'Standard end-user or student',
    isSystem: true,
  },
  {
    id: 'role_instructor',
    code: 'INSTRUCTOR',
    name: 'Instructor',
    description: 'Content author or instructor',
    isSystem: true,
  },
  {
    id: 'role_admin',
    code: 'ADMIN',
    name: 'Administrator',
    description: 'System administrator with full privileges',
    isSystem: true,
  },
];

export const SEED_ROLE_PERMISSIONS: Record<string, string[]> = {
  role_student: ['user:read', 'user:write'],
  role_instructor: ['user:read', 'user:write'],
  role_admin: ['*'],
};

export const SEED_USERS = [
  {
    id: 'usr_admin_01',
    email: 'admin@quiz.com',
    name: 'System Administrator',
    passwordHash: hashPassword('admin123'),
    metadata: {},
    roleCode: 'ADMIN',
  },
  {
    id: 'usr_instructor_01',
    email: 'instructor@quiz.com',
    name: 'Tran Thi Giảng Viên',
    passwordHash: hashPassword('teacher123'),
    metadata: {},
    roleCode: 'INSTRUCTOR',
  },
  {
    id: 'usr_student_01',
    email: 'student@quiz.com',
    name: 'Nguyen Van Học Viên',
    passwordHash: hashPassword('student123'),
    metadata: {},
    roleCode: 'STUDENT',
  },
  {
    id: 'usr_admin_local',
    email: 'admin@quiz.local',
    name: 'System Administrator (Local)',
    passwordHash: hashPassword('admin123'),
    metadata: {},
    roleCode: 'ADMIN',
  },
  {
    id: 'usr_instructor_local',
    email: 'instructor@quiz.local',
    name: 'Tran Thi Giảng Viên (Local)',
    passwordHash: hashPassword('teacher123'),
    metadata: {},
    roleCode: 'INSTRUCTOR',
  },
  {
    id: 'usr_student_local',
    email: 'student@quiz.local',
    name: 'Nguyen Van Học Viên (Local)',
    passwordHash: hashPassword('student123'),
    metadata: {},
    roleCode: 'STUDENT',
  },
];

export async function seedAuthDb(targetDb?: any): Promise<void> {
  const db = targetDb || (isAuthDbConfigured() ? getAuthDb() : null);
  if (!db) {
    console.warn('⚠️ AUTH_DATABASE_URL is not configured. Skipping PostgreSQL seeding.');
    return;
  }

  console.log('🌱 Seeding Normalized RBAC into PostgreSQL Auth Service DB...');

  // 1. Seed Permissions
  console.log('  1/5 Seeding permissions...');
  for (const perm of DEFAULT_PERMISSIONS_DATA) {
    await db
      .insert(permissions)
      .values({
        id: perm.id,
        code: perm.code,
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
      })
      .onConflictDoNothing();
  }

  // 2. Seed Roles
  console.log('  2/5 Seeding roles...');
  for (const role of SEED_ROLES) {
    await db
      .insert(roles)
      .values(role)
      .onConflictDoNothing();
  }

  // 3. Seed Role-Permissions
  console.log('  3/5 Mapping role permissions...');
  for (const [roleId, permCodes] of Object.entries(SEED_ROLE_PERMISSIONS)) {
    for (const code of permCodes) {
      const permRow = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.code, code))
        .limit(1);

      if (permRow.length > 0) {
        await db
          .insert(rolePermissions)
          .values({
            roleId,
            permissionId: permRow[0].id,
          })
          .onConflictDoNothing();
      }
    }
  }

  // 4. Seed Users & User-Roles
  console.log('  4/5 Seeding users & assigning roles...');
  for (const user of SEED_USERS) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email))
      .limit(1);

    let userId = user.id;
    if (existing.length === 0) {
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        name: user.name,
        passwordHash: user.passwordHash,
        metadata: user.metadata || {},
        isActive: true,
      });
      console.log(`    + Seeded user: ${user.email}`);
    } else {
      userId = existing[0].id;
    }

    // Assign role
    const roleRow = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, user.roleCode))
      .limit(1);

    if (roleRow.length > 0) {
      await db
        .insert(userRoles)
        .values({
          userId,
          roleId: roleRow[0].id,
        })
        .onConflictDoNothing();
    }
  }

  console.log('✅ Normalized RBAC Auth DB seeding finished.');
}

// Direct execution support
const isDirectRun = Boolean(
  process.argv[1] &&
  (
    path.normalize(fileURLToPath(import.meta.url)).toLowerCase() ===
      path.normalize(path.resolve(process.argv[1])).toLowerCase() ||
    process.argv[1].replace(/\\/g, '/').endsWith('seed.ts') ||
    process.argv[1].replace(/\\/g, '/').endsWith('seed.js')
  )
);

if (isDirectRun) {
  seedAuthDb()
    .then(() => closeAuthDb())
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}
