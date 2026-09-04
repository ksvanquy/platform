import { Role } from './role.entity.js';
import { Permission } from './permission.entity.js';

export interface IRbacRepository {
  findRoleByCode(code: string): Promise<Role | null>;
  findRoleById(id: string): Promise<Role | null>;
  listRoles(): Promise<Role[]>;
  listPermissions(): Promise<Permission[]>;
  assignRolesToUser(userId: string, roleCodes: string[], assignedBy?: string): Promise<void>;
  revokeRoleFromUser(userId: string, roleCode: string): Promise<void>;
  getUserRolesAndPermissions(userId: string): Promise<{ roles: Role[]; permissions: string[] }>;
}
