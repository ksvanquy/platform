import { Permission } from './permission.entity.js';

export interface RoleProps {
  id: string;
  code: string;
  name: string;
  description?: string;
  isSystem?: boolean;
  permissions?: readonly Permission[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Thực thể Role đại diện cho một vai trò người dùng trong hệ thống RBAC động.
 * Nguồn dữ liệu tin cậy duy nhất: Bảng `roles` và `role_permissions` trong PostgreSQL.
 */
export class Role {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly isSystem: boolean;
  readonly permissions: readonly Permission[];
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: RoleProps) {
    this.id = props.id;
    this.code = props.code.toUpperCase().trim();
    this.name = props.name.trim();
    this.description = props.description;
    this.isSystem = Boolean(props.isSystem);
    this.permissions = Object.freeze(props.permissions ? [...props.permissions] : []);
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  getPermissionCodes(): readonly string[] {
    return Object.freeze(this.permissions.map((p) => p.code));
  }
}
