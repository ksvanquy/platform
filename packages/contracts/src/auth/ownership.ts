import type { OwnedResource } from './principal.js';

export interface ResourceOwnershipContext extends OwnedResource {
  resourceType?: 'quiz' | 'attempt' | 'user' | string;
  resourceId?: string;
  ownerId?: string;
}

export interface OwnershipEvaluationResult {
  allowed: boolean;
  reason?: string;
  isOwner: boolean;
  isAdminBypass: boolean;
}
