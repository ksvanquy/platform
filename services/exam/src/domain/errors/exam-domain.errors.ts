export class ExamDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExamDomainError';
  }
}

export class ExamNotFoundError extends ExamDomainError {
  constructor(identifier: string) {
    super(`Exam not found: ${identifier}`);
    this.name = 'ExamNotFoundError';
  }
}

export class ExamSnapshotNotFoundError extends ExamDomainError {
  constructor(identifier: string) {
    super(`Exam snapshot not found: ${identifier}`);
    this.name = 'ExamSnapshotNotFoundError';
  }
}

export class ExamAlreadyExistsError extends ExamDomainError {
  constructor(code: string) {
    super(`Exam with code '${code}' already exists`);
    this.name = 'ExamAlreadyExistsError';
  }
}

export class InvalidExamDataError extends ExamDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidExamDataError';
  }
}

export class ExamMatrixResolutionError extends ExamDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'ExamMatrixResolutionError';
  }
}

export class ExamImmutableError extends ExamDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'ExamImmutableError';
  }
}
