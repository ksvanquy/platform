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

  /**
   * Kiểm tra vai trò có sở hữu quyền hạn cụ thể hoặc Wildcard (*) không.
   */
  hasPermission(targetCode: string): boolean {
    return this.permissions.some((p) => p.matches(targetCode));
  }

  /**
   * Kiểm tra xem vai trò này có phải là vai trò quản trị viên toàn quyền hay không.
   */
  isAdministrator(): boolean {
    return this.code === 'ADMIN' || this.hasPermission('*');
  }

  /**
   * Tạo bản sao Role mới với danh sách quyền hạn được cập nhật.
   */
  withPermissions(permissions: readonly Permission[]): Role {
    return new Role({
      id: this.id,
      code: this.code,
      name: this.name,
      description: this.description,
      isSystem: this.isSystem,
      permissions,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  toJSON() {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      description: this.description,
      isSystem: this.isSystem,
      permissions: this.permissions.map((p) => (typeof p.toJSON === 'function' ? p.toJSON() : p)),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
