/**
 * Pure Type Definitions for System Roles & Identity Principals (Zero Runtime Logic)
 */

export type RoleType = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

export interface Role {
  readonly name: RoleType;
  readonly description: string;
  readonly permissions: readonly string[];
}

/**
 * Interface Principal đại diện cho danh tính người dùng thuần túy (Zero-Tenant Identity).
 */
export interface Principal {
  readonly id: string;
  readonly roles: readonly string[];
  readonly permissions?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface OwnedResource {
  readonly ownerId?: string;
  readonly instructorId?: string;
  readonly userId?: string;
}
