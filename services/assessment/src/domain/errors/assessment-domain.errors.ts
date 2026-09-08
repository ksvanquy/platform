export class AssessmentDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssessmentDomainError';
  }
}

export class AssessmentNotFoundError extends AssessmentDomainError {
  constructor(identifier: string) {
    super(`Assessment with identifier '${identifier}' was not found.`);
    this.name = 'AssessmentNotFoundError';
  }
}

export class AssessmentCodeAlreadyExistsError extends AssessmentDomainError {
  constructor(code: string) {
    super(`Assessment with code '${code}' already exists.`);
    this.name = 'AssessmentCodeAlreadyExistsError';
  }
}

export class BlueprintNotFoundError extends AssessmentDomainError {
  constructor(identifier: string) {
    super(`Blueprint with identifier '${identifier}' was not found.`);
    this.name = 'BlueprintNotFoundError';
  }
}

export class InvalidBlueprintCriteriaError extends AssessmentDomainError {
  constructor(reason: string) {
    super(`Invalid blueprint criteria: ${reason}`);
    this.name = 'InvalidBlueprintCriteriaError';
  }
}

export class BlueprintLockedError extends AssessmentDomainError {
  constructor(message = 'Blueprint is locked and cannot be modified once approved/published.') {
    super(message);
    this.name = 'BlueprintLockedError';
  }
}

export class UnauthorizedAssessmentAccessError extends AssessmentDomainError {
  constructor(message = 'User is not authorized to modify this assessment.') {
    super(message);
    this.name = 'UnauthorizedAssessmentAccessError';
  }
}
