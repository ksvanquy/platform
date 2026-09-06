export class TaxonomyNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Taxonomy not found: ${identifier}`);
    this.name = 'TaxonomyNotFoundError';
  }
}

export class TaxonomyNodeNotFoundError extends Error {
  constructor(nodeId: string) {
    super(`Taxonomy node not found: ${nodeId}`);
    this.name = 'TaxonomyNodeNotFoundError';
  }
}

export class DuplicateTaxonomyCodeError extends Error {
  constructor(code: string) {
    super(`Taxonomy code already exists: ${code}`);
    this.name = 'DuplicateTaxonomyCodeError';
  }
}

export class DuplicateNodeSlugError extends Error {
  constructor(taxonomyId: string, slug: string) {
    super(`Node slug already exists in taxonomy ${taxonomyId}: ${slug}`);
    this.name = 'DuplicateNodeSlugError';
  }
}

export class CycleDetectedError extends Error {
  constructor(nodeId: string, targetParentId: string) {
    super(`Cannot move node ${nodeId} under ${targetParentId}: cycle hierarchy detected.`);
    this.name = 'CycleDetectedError';
  }
}

export class InvalidHierarchyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHierarchyError';
  }
}

export class TaxonomyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxonomyValidationError';
  }
}
