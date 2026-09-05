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
  { id: 'perm_user_read', code: 'user:read', resource: 'user', action: 'read', description: 'Read user profile and identity info' },
  { id: 'perm_user_write', code: 'user:write', resource: 'user', action: 'write', description: 'Update own user profile' },
  { id: 'perm_user_manage', code: 'user:manage', resource: 'user', action: 'manage', description: 'Manage users and assign roles' },
  { id: 'perm_role_read', code: 'role:read', resource: 'role', action: 'read', description: 'Read system roles and permission mappings' },
  { id: 'perm_role_write', code: 'role:write', resource: 'role', action: 'write', description: 'Create and update roles' },
  { id: 'perm_permission_read', code: 'permission:read', resource: 'permission', action: 'read', description: 'List available system permissions' },
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
      description: 'Standard end-user or student',
      isSystem: true,
      permissions: getPerms(['user:read', 'user:write']),
    }),
    new Role({
      id: 'role_instructor',
      code: 'INSTRUCTOR',
      name: 'Instructor',
      description: 'Content author or instructor',
      isSystem: true,
      permissions: getPerms(['user:read', 'user:write']),
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

export function resolvePermissionsForRoles(roles: readonly string[]): readonly string[] {
  const defaultRoles = createDefaultRoles();
  const perms = new Set<string>();
  for (const roleCode of roles) {
    const r = defaultRoles.find((dr) => dr.code.toUpperCase() === roleCode.toUpperCase());
    if (r) {
      for (const p of r.permissions) {
        perms.add(p.code);
      }
    }
  }
  return Object.freeze(Array.from(perms));
}

