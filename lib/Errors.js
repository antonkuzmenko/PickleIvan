export class AppError extends Error {
  constructor (message) {
    // Calling parent constructor of base Error class.
    super(message);
    // Saving class name in the property of our custom error as a shortcut.
    this.name = this.constructor.name;
    // Capturing stack trace, excluding constructor call from it.
    Error.captureStackTrace(this, this.constructor);
  }
};

export class NoRepositoriesFoundError extends AppError {};
export class InsufficientCertaintyError extends AppError {
  constructor (message, repositories) {
    super(message);
    this.repositories = repositories;
  }
};
export class CreateReleaseError extends AppError {};
