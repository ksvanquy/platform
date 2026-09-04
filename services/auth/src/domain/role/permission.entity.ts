export interface PermissionProps {
  id: string;
  code: string;
  resource: string;
  action: string;
  description?: string;
  createdAt?: Date;
}

/**
 * Thực thể Permission đại diện cho một quyền hạn nguyên tử trong hệ thống (Fine-grained Action).
 * Nguồn dữ liệu tin cậy duy nhất: Bảng `permissions` trong PostgreSQL.
 */
export class Permission {
  readonly id: string;
  readonly code: string;
  readonly resource: string;
  readonly action: string;
  readonly description?: string;
  readonly createdAt: Date;

  constructor(props: PermissionProps) {
    this.id = props.id;
    this.code = props.code.trim();
    this.resource = props.resource.trim().toLowerCase();
    this.action = props.action.trim().toLowerCase();
    this.description = props.description;
    this.createdAt = props.createdAt || new Date();
  }

  /**
   * Kiểm tra quyền hạn có phải là Wildcard tối cao (*) hay không.
   */
  isWildcard(): boolean {
    return this.code === '*';
  }

  /**
   * Khớp mã quyền hạn với mã yêu cầu (hỗ trợ wildcard).
   */
  matches(requiredCode: string): boolean {
    if (this.isWildcard()) return true;
    return this.code === requiredCode.trim();
  }

  /**
   * Kiểm tra quyền có phạm vi can thiệp toàn cục (Bypass ownership) hay không.
   */
  isManageAll(): boolean {
    return this.isWildcard() || this.action === 'manage_all' || this.action === 'read_all';
  }

  toJSON(): PermissionProps {
    return {
      id: this.id,
      code: this.code,
      resource: this.resource,
      action: this.action,
      description: this.description,
      createdAt: this.createdAt,
    };
  }
}
