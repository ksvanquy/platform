import { Permission } from './permission.entity.js';
import { Role } from './role.entity.js';

export interface DefaultPermissionData {
  id: string;
  code: string;
  resource: string;
  action: string;
  description: string;
}

export const DEFAULT_PERMISSIONS_DATA: DefaultPermissionData[] = [
  { id: 'perm_all', code: '*', resource: '*', action: '*', description: 'Super administrator full access (Ownership bypass)' },
  { id: 'perm_quiz_read', code: 'quiz:read', resource: 'quiz', action: 'read', description: 'View available quizzes' },
  { id: 'perm_quiz_create', code: 'quiz:create', resource: 'quiz', action: 'create', description: 'Create quizzes (sets ownerId)' },
  { id: 'perm_quiz_write', code: 'quiz:write', resource: 'quiz', action: 'write', description: 'Write or modify quiz content' },
  { id: 'perm_quiz_update', code: 'quiz:update', resource: 'quiz', action: 'update', description: 'Update quiz parameters (owned quiz)' },
  { id: 'perm_quiz_delete', code: 'quiz:delete', resource: 'quiz', action: 'delete', description: 'Delete quizzes (owned quiz)' },
  { id: 'perm_quiz_publish', code: 'quiz:publish', resource: 'quiz', action: 'publish', description: 'Publish quizzes for examinees (owned quiz)' },
  { id: 'perm_quiz_manage_all', code: 'quiz:manage_all', resource: 'quiz', action: 'manage_all', description: 'Manage and modify any quiz across instructors' },
  { id: 'perm_attempt_create', code: 'attempt:create', resource: 'attempt', action: 'create', description: 'Start personal quiz attempt' },
  { id: 'perm_attempt_submit', code: 'attempt:submit', resource: 'attempt', action: 'submit', description: 'Submit attempt answers (owned attempt)' },
  { id: 'perm_attempt_read_self', code: 'attempt:read_self', resource: 'attempt', action: 'read_self', description: 'Read own attempt results' },
  { id: 'perm_attempt_read_all', code: 'attempt:read_all', resource: 'attempt', action: 'read_all', description: 'Read all attempt results across examinees' },
  { id: 'perm_attempt_read', code: 'attempt:read', resource: 'attempt', action: 'read', description: 'Read attempt results' },
  { id: 'perm_attempt_review', code: 'attempt:review', resource: 'attempt', action: 'review', description: 'Review and grade attempts of owned quizzes' },
  { id: 'perm_user_manage', code: 'user:manage', resource: 'user', action: 'manage', description: 'Manage users and roles' },
  { id: 'perm_system_config', code: 'system:config', resource: 'system', action: 'config', description: 'Configure system settings' },
];

export function createDefaultPermissions(): Permission[] {
  return DEFAULT_PERMISSIONS_DATA.map((p) => new Permission(p));
}

export function createDefaultRoles(): Role[] {
  const permMap = new Map<string, Permission>();
  for (const p of createDefaultPermissions()) {
    permMap.set(p.code, p);
  }

  const getPerms = (codes: string[]) =>
    codes.map((c) => permMap.get(c)).filter((p): p is Permission => Boolean(p));

  return [
    new Role({
      id: 'role_student',
      code: 'STUDENT',
      name: 'Student',
      description: 'Student or examinee taking quizzes',
      isSystem: true,
      permissions: getPerms(['quiz:read', 'attempt:create', 'attempt:submit', 'attempt:read_self']),
    }),
    new Role({
      id: 'role_instructor',
      code: 'INSTRUCTOR',
      name: 'Instructor',
      description: 'Instructor or teacher creating and reviewing quizzes',
      isSystem: true,
      permissions: getPerms([
        'quiz:read',
        'quiz:write',
        'quiz:create',
        'quiz:update',
        'quiz:delete',
        'quiz:publish',
        'attempt:read',
        'attempt:read_self',
        'attempt:review',
      ]),
    }),
    new Role({
      id: 'role_admin',
      code: 'ADMIN',
      name: 'Administrator',
      description: 'System administrator with full privileges',
      isSystem: true,
      permissions: getPerms(['*']),
    }),
  ];
}
