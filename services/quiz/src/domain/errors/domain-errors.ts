export class DomainError extends Error {
  readonly errorCode: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(message: string, errorCode: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class QuizNotFoundError extends DomainError {
  constructor(quizId: string) {
    super(`Quiz with ID "${quizId}" was not found`, 'QUIZ_NOT_FOUND', 404);
  }
}

export class QuizNotPublishedError extends DomainError {
  constructor(quizId: string) {
    super(`Quiz "${quizId}" is not in PUBLISHED status`, 'QUIZ_NOT_PUBLISHED', 400);
  }
}

export class QuizPublishInvariantViolationError extends DomainError {
  constructor(reason: string, details?: unknown) {
    super(`Cannot publish quiz: ${reason}`, 'QUIZ_PUBLISH_INVARIANT_VIOLATION', 422, details);
  }
}

export class AttemptNotFoundError extends DomainError {
  constructor(attemptId: string) {
    super(`Attempt with ID "${attemptId}" was not found`, 'ATTEMPT_NOT_FOUND', 404);
  }
}

export class AttemptAlreadySubmittedError extends DomainError {
  constructor(attemptId: string) {
    super(`Attempt "${attemptId}" is already submitted and locked for edits`, 'ATTEMPT_ALREADY_SUBMITTED', 409);
  }
}

export class AttemptAlreadyInProgressError extends DomainError {
  constructor(userId: string, quizId: string, existingAttemptId: string) {
    super(
      `User "${userId}" already has an active attempt "${existingAttemptId}" in progress for quiz "${quizId}"`,
      'ATTEMPT_ALREADY_IN_PROGRESS',
      409,
      { existingAttemptId }
    );
  }
}

export class MaxAttemptsExceededError extends DomainError {
  constructor(userId: string, quizId: string, maxAttempts: number) {
    super(
      `User "${userId}" has reached the maximum allowed attempts (${maxAttempts}) for quiz "${quizId}"`,
      'MAX_ATTEMPTS_EXCEEDED',
      403,
      { maxAttempts }
    );
  }
}

export class AttemptTimeExpiredError extends DomainError {
  constructor(attemptId: string) {
    super(`Attempt "${attemptId}" time limit has expired`, 'ATTEMPT_TIME_EXPIRED', 400);
  }
}

export class OutdatedAnswerTimestampError extends DomainError {
  constructor(questionId: string, incomingTimestamp: number, currentTimestamp: number) {
    super(
      `Rejected out-of-order answer for question "${questionId}": incoming timestamp ${incomingTimestamp} is older than recorded ${currentTimestamp}`,
      'OUTDATED_ANSWER_TIMESTAMP',
      409,
      { incomingTimestamp, currentTimestamp }
    );
  }
}

export class InvalidAnswerPayloadError extends DomainError {
  constructor(questionId: string, reason: string) {
    super(`Invalid answer payload for question "${questionId}": ${reason}`, 'INVALID_ANSWER_PAYLOAD', 422);
  }
}

export class InvalidAttemptStateTransitionError extends DomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Illegal attempt state transition from "${fromStatus}" to "${toStatus}"`,
      'INVALID_STATE_TRANSITION',
      409
    );
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Access denied: You do not have permission to perform this action') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication required. Please provide a valid Bearer token') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
