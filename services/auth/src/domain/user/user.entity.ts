import type { Principal } from '@platform/contracts';
import { Role } from '../role/role.entity.js';

export interface UserProps {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  roles: readonly Role[];
  tenantId?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Aggregate Root: User
 * Quản lý định danh tài khoản và danh sách các vai trò (Roles) được gán từ PostgreSQL.
 * Quyền hạn (Permissions) được tính toán động (Dynamic Effective Permissions) từ các Roles trong DB.
 */
export class User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly roles: readonly Role[];
  readonly tenantId: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email.toLowerCase().trim();
    this.name = props.name.trim();
    this.passwordHash = props.passwordHash;
    this.roles = Object.freeze([...props.roles]);
    this.tenantId = props.tenantId || 'tenant_default';
    this.isActive = props.isActive !== undefined ? props.isActive : true;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  getRoleCodes(): readonly string[] {
    return Object.freeze(this.roles.map((r) => r.code));
  }

  /**
   * Tính toán tập hợp quyền hạn hiệu lực (Effective Permissions)
   * Nguồn gốc từ các permissions của từng vai trò được lưu trong PostgreSQL.
   */
  getEffectivePermissions(): readonly string[] {
    const permCodes = new Set<string>();
    for (const role of this.roles) {
      for (const perm of role.permissions) {
        permCodes.add(perm.code);
      }
    }
    return Object.freeze(Array.from(permCodes));
  }

  toPrincipal(): Principal {
    return {
      id: this.id,
      roles: this.getRoleCodes(),
      permissions: this.getEffectivePermissions(),
      tenantId: this.tenantId,
    };
  }

  toSafeProfile() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      roles: this.getRoleCodes(),
      permissions: this.getEffectivePermissions(),
      tenantId: this.tenantId,
      isActive: this.isActive,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
