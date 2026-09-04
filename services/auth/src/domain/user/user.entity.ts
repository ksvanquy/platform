import type { Principal } from '@platform/contracts';
import { resolvePermissionsForRoles } from '../role/role.js';

export interface UserProps {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  roles: readonly string[];
  tenantId?: string;
  createdAt?: Date;
}

export class User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly roles: readonly string[];
  readonly tenantId?: string;
  readonly createdAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email.toLowerCase().trim();
    this.name = props.name;
    this.passwordHash = props.passwordHash;
    this.roles = Object.freeze([...props.roles]);
    this.tenantId = props.tenantId;
    this.createdAt = props.createdAt || new Date();
  }

  toPrincipal(): Principal {
    return {
      id: this.id,
      roles: this.roles,
      permissions: resolvePermissionsForRoles(this.roles),
      tenantId: this.tenantId,
    };
  }

  toSafeProfile() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      roles: this.roles,
      permissions: resolvePermissionsForRoles(this.roles),
      tenantId: this.tenantId,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
