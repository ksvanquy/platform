import type { Principal } from '@platform/contracts';
import { Role } from '../role/role.entity.js';

export interface UserProps {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  roles: readonly Role[];
  metadata?: Record<string, unknown>;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Aggregate Root: User
 * Quản lý định danh tài khoản và danh sách các vai trò (Roles) được gán từ PostgreSQL.
 * Quyền hạn (Permissions) được tính toán động (Dynamic Effective Permissions) từ các Roles trong DB.
 * Pure Identity Model: 100% Generic IdP không chứa khái niệm tenancy.
 */
export class User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly roles: readonly Role[];
  readonly metadata: Record<string, unknown>;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email.toLowerCase().trim();
    this.name = props.name.trim();
    this.passwordHash = props.passwordHash;
    this.roles = Object.freeze([...props.roles]);
    this.metadata = Object.freeze({ ...(props.metadata || {}) });
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
      metadata: this.metadata,
    };
  }

  /**
   * Kiểm tra người dùng có được gán vai trò cụ thể hay không.
   */
  hasRole(roleCode: string): boolean {
    const target = roleCode.toUpperCase().trim();
    return this.roles.some((r) => r.code === target);
  }

  /**
   * Kiểm tra người dùng có quyền thực hiện một hành động cụ thể không.
   * Tự động trả về true nếu người dùng có vai trò ADMIN hoặc quyền wildcard (*).
   */
  hasPermission(permissionCode: string): boolean {
    if (this.isAdmin()) return true;
    const target = permissionCode.trim();
    return this.roles.some((r) => r.hasPermission(target));
  }

  /**
   * Xác định người dùng có phải là Quản trị viên tối cao hay không.
   */
  isAdmin(): boolean {
    return this.roles.some((r) => r.isAdministrator());
  }

  /**
   * Tạo bản sao User mới với danh sách roles được cập nhật.
   */
  withRoles(roles: readonly Role[]): User {
    return new User({
      id: this.id,
      email: this.email,
      name: this.name,
      passwordHash: this.passwordHash,
      roles,
      metadata: this.metadata,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Tạo bản sao User mới với trạng thái kích hoạt được cập nhật.
   */
  withActiveStatus(isActive: boolean): User {
    return new User({
      id: this.id,
      email: this.email,
      name: this.name,
      passwordHash: this.passwordHash,
      roles: this.roles,
      metadata: this.metadata,
      isActive,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  deactivate(): User {
    return this.withActiveStatus(false);
  }

  activate(): User {
    return this.withActiveStatus(true);
  }

  toSafeProfile() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      roles: this.getRoleCodes(),
      permissions: this.getEffectivePermissions(),
      metadata: this.metadata,
      isActive: this.isActive,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
