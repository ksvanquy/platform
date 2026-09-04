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
}
