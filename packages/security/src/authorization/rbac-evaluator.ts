import type { Principal, RoleType, Role } from '@platform/contracts';

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
      'user:read',
      'user:write',
    ],
  },
  INSTRUCTOR: {
    name: 'INSTRUCTOR',
    description: 'Instructor or teacher creating and reviewing quizzes and questions',
    permissions: [
      'quiz:read',
      'quiz:write',
      'quiz:create',
      'quiz:update',
      'quiz:delete',
      'quiz:publish',
      'question:read',
      'question:create',
      'question:update',
      'question:delete',
      'assessment:read',
      'assessment:create',
      'assessment:update',
      'exam:read',
      'exam:generate',
      'attempt:read',
      'attempt:read_self',
      'attempt:review',
      'taxonomy:read',
      'user:read',
      'user:write',
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

export function matchPermission(required: string, held: string): boolean {
  if (held === '*' || held === required) {
    return true;
  }
  if (held.endsWith(':*')) {
    const prefix = held.slice(0, -2);
    if (required.startsWith(prefix + ':')) {
      return true;
    }
  }
  // Special alias mapping
  if (required === 'quiz:update' && held === 'quiz:write') {
    return true;
  }
  return false;
}

export function hasPermission(principal: Principal, requiredPermission: string): boolean {
  const permissions = principal.permissions || [];
  if (permissions.includes('*')) {
    return true;
  }
  return permissions.some((p) => matchPermission(requiredPermission, p));
}

export function hasAnyRole(principal: Principal, allowedRoles: readonly string[]): boolean {
  return allowedRoles.some((role) => principal.roles.includes(role));
}

export function hasAllRoles(principal: Principal, requiredRoles: readonly string[]): boolean {
  return requiredRoles.every((role) => principal.roles.includes(role));
}
