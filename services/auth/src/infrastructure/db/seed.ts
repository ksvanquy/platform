import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getAuthDb, closeAuthDb, isAuthDbConfigured } from './connection.js';
import { users } from './schema.js';
import { hashPassword } from '../persistence/in-memory-user.repository.js';
import { eq } from 'drizzle-orm';

export const SEED_USERS = [
  {
    id: 'usr_admin_01',
    email: 'admin@quiz.com',
    name: 'System Administrator',
    passwordHash: hashPassword('admin123'),
    roles: ['ADMIN'],
    tenantId: 'tenant_default',
  },
  {
    id: 'usr_instructor_01',
    email: 'instructor@quiz.com',
    name: 'Tran Thi Giảng Viên',
    passwordHash: hashPassword('teacher123'),
    roles: ['INSTRUCTOR'],
    tenantId: 'tenant_default',
  },
  {
    id: 'usr_student_01',
    email: 'student@quiz.com',
    name: 'Nguyen Van Học Viên',
    passwordHash: hashPassword('student123'),
    roles: ['STUDENT'],
    tenantId: 'tenant_default',
  },
  {
    id: 'usr_admin_local',
    email: 'admin@quiz.local',
    name: 'System Administrator (Local)',
    passwordHash: hashPassword('admin123'),
    roles: ['ADMIN'],
    tenantId: 'tenant_default',
  },
  {
    id: 'usr_instructor_local',
    email: 'instructor@quiz.local',
    name: 'Tran Thi Giảng Viên (Local)',
    passwordHash: hashPassword('teacher123'),
    roles: ['INSTRUCTOR'],
    tenantId: 'tenant_default',
  },
  {
    id: 'usr_student_local',
    email: 'student@quiz.local',
    name: 'Nguyen Van Học Viên (Local)',
    passwordHash: hashPassword('student123'),
    roles: ['STUDENT'],
    tenantId: 'tenant_default',
  },
];

export async function seedAuthDb(): Promise<void> {
  if (!isAuthDbConfigured()) {
    console.warn('⚠️ AUTH_DATABASE_URL is not configured. Skipping PostgreSQL seeding.');
    return;
  }

  console.log('🌱 Seeding default accounts into Auth Service DB...');
  const db = getAuthDb();

  for (const user of SEED_USERS) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, user.email))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(users).values(user);
      console.log(`  + Seeded user: ${user.email} (${user.roles.join(', ')})`);
    } else {
      console.log(`  = User already exists: ${user.email}`);
    }
  }

  console.log('✅ Auth DB seeding finished.');
}

// Allow direct execution (cross-platform Windows & POSIX support)
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
