export class AttemptDomainError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly errorCode: string = 'ATTEMPT_DOMAIN_ERROR'
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AttemptNotFoundError extends AttemptDomainError {
  constructor(attemptId: string) {
    super(`Attempt with ID "${attemptId}" was not found`, 404, 'ATTEMPT_NOT_FOUND');
  }
}

export class AttemptAlreadySubmittedError extends AttemptDomainError {
  constructor(attemptId: string) {
    super(`Attempt "${attemptId}" has already been submitted and cannot be modified`, 409, 'ATTEMPT_ALREADY_SUBMITTED');
  }
}

export class AttemptAlreadyFinalizedError extends AttemptDomainError {
  constructor(attemptId: string, status: string = 'SUBMITTED') {
    super(
      `Attempt "${attemptId}" is already finalized with status "${status}" and cannot be modified`,
      409,
      'ATTEMPT_ALREADY_FINALIZED'
    );
  }
}

export class AttemptConcurrencyConflictError extends AttemptDomainError {
  constructor(
    attemptId: string,
    currentVersion?: number,
    expectedVersion?: number,
    customMessage?: string
  ) {
    const detail =
      currentVersion !== undefined && expectedVersion !== undefined
        ? ` (expected version ${expectedVersion}, but found version ${currentVersion})`
        : '';
    super(
      customMessage || `Optimistic concurrency conflict on attempt "${attemptId}"${detail}. Please reload and retry.`,
      409,
      'ATTEMPT_CONCURRENCY_CONFLICT'
    );
  }
}

export class AttemptTimeExpiredError extends AttemptDomainError {
  constructor(attemptId: string) {
    super(
      `Attempt "${attemptId}" has expired official time limit. New answers cannot be recorded`,
      403,
      'ATTEMPT_TIME_EXPIRED'
    );
  }
}

export class OutdatedAnswerSequenceError extends AttemptDomainError {
  constructor(questionId: string, receivedSeq: number, currentSeq: number) {
    super(
      `Rejected out-of-order answer for question "${questionId}". Received sequence #${receivedSeq} is older than current #${currentSeq}`,
      409,
      'OUTDATED_ANSWER_SEQUENCE'
    );
  }
}

export class InvalidAttemptStateTransitionError extends AttemptDomainError {
  constructor(fromState: string, toState: string) {
    super(`Invalid attempt state transition from "${fromState}" to "${toState}"`, 400, 'INVALID_STATE_TRANSITION');
  }
}

export class UnauthorizedAttemptAccessError extends AttemptDomainError {
  constructor(message = 'You are not authorized to access this attempt session') {
    super(message, 403, 'FORBIDDEN_ATTEMPT_ACCESS');
  }
}

export class ExamNotFoundError extends AttemptDomainError {
  constructor(examId: string) {
    super(`Exam with ID "${examId}" was not found`, 404, 'EXAM_NOT_FOUND');
  }
}

export class ExamNotActiveError extends AttemptDomainError {
  constructor(message: string) {
    super(message, 400, 'EXAM_NOT_ACTIVE');
  }
}

export class ExamSnapshotNotFoundError extends AttemptDomainError {
  constructor(examId: string, variantCode: string) {
    super(
      `Exam snapshot not found for exam "${examId}" and variant "${variantCode}"`,
      404,
      'EXAM_SNAPSHOT_NOT_FOUND'
    );
  }
}
