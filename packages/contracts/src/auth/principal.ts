export type RoleType = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

export interface Role {
  readonly name: RoleType;
  readonly description: string;
  readonly permissions: readonly string[];
}

export const SYSTEM_ROLES: Record<RoleType, Role> = {
  STUDENT: {
    name: 'STUDENT',
    description: 'Student or examinee taking quizzes',
    permissions: [
      'quiz:read',
      'attempt:create',
      'attempt:start',
      'attempt:record_answer',
      'attempt:submit',
      'attempt:read_own',
      'attempt:read_self',
    ],
  },
  INSTRUCTOR: {
    name: 'INSTRUCTOR',
    description: 'Instructor or teacher creating and reviewing quizzes',
    permissions: [
      'quiz:read',
      'quiz:write',
      'quiz:create',
      'quiz:update',
      'quiz:delete',
      'quiz:publish',
      'attempt:read',
      'attempt:read_self',
      'attempt:review',
    ],
  },
  ADMIN: {
    name: 'ADMIN',
    description: 'System administrator with full privileges',
    permissions: ['*'],
  },
};

export function resolvePermissionsForRoles(roles: readonly string[]): readonly string[] {
  const perms = new Set<string>();
  for (const role of roles) {
    const roleDef = SYSTEM_ROLES[role as RoleType];
    if (roleDef) {
      for (const p of roleDef.permissions) {
        perms.add(p);
      }
    }
  }
  return Object.freeze(Array.from(perms));
}

export interface Principal {
  id: string;
  roles: readonly string[];
  permissions?: readonly string[];
  tenantId?: string;
}
