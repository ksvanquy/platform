import { User } from './user.entity.js';
import { Role } from '../role/role.entity.js';
import { Permission } from '../role/permission.entity.js';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  list(): Promise<User[]>;
  updateStatus?(id: string, isActive: boolean): Promise<User | null>;
  getRoleByCode?(code: string): Promise<Role | null> | (Role | null);
  listRoles?(): Promise<Role[]> | Role[];
  listPermissions?(): Promise<Permission[]> | Permission[];
  assignRoles?(userId: string, roleCodes: string[]): Promise<User | null>;
}
