export { Permission, type PermissionProps } from './permission.entity.js';
export { Role, type RoleProps } from './role.entity.js';
export { type IRbacRepository } from './rbac.repository.port.js';
export {
  type RoleType,
  type Role as RoleContract,
  SYSTEM_ROLES,
  resolvePermissionsForRoles,
} from '@platform/contracts';
