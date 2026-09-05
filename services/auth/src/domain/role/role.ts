export { Permission, type PermissionProps } from './permission.entity.js';
export { Role, type RoleProps } from './role.entity.js';
export { type IRbacRepository } from './rbac.repository.port.js';
export {
  DEFAULT_PERMISSIONS_DATA,
  createDefaultPermissions,
  createDefaultRoles,
  resolvePermissionsForRoles,
} from './default-rbac.data.js';

