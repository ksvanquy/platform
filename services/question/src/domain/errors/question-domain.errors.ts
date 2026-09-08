export class QuestionDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestionDomainError';
  }
}

export class QuestionNotFoundError extends QuestionDomainError {
  constructor(identifier: string) {
    super(`Question with identifier '${identifier}' was not found.`);
    this.name = 'QuestionNotFoundError';
  }
}

export class QuestionCodeAlreadyExistsError extends QuestionDomainError {
  constructor(code: string) {
    super(`Question with code '${code}' already exists.`);
    this.name = 'QuestionCodeAlreadyExistsError';
  }
}

export class InvalidQuestionDataError extends QuestionDomainError {
  constructor(reason: string) {
    super(`Invalid question data: ${reason}`);
    this.name = 'InvalidQuestionDataError';
  }
}

export class QuestionRevisionNotFoundError extends QuestionDomainError {
  constructor(questionId: string, revisionNumber: number) {
    super(`Revision ${revisionNumber} for question '${questionId}' was not found.`);
    this.name = 'QuestionRevisionNotFoundError';
  }
}

export class UnauthorizedQuestionAccessError extends QuestionDomainError {
  constructor(message = 'User is not authorized to modify this question.') {
    super(message);
    this.name = 'UnauthorizedQuestionAccessError';
  }
}
