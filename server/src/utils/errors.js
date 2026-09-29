class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = options.statusCode || 500;
    this.code = options.code || "INTERNAL_ERROR";
    this.field = options.field || undefined;
    this.value = options.value !== undefined ? options.value : undefined;
    this.allowedValues = options.allowedValues || undefined;
    this.isOperational = options.isOperational !== false;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

function createValidationError(message, options = {}) {
  return new AppError(message, {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    ...options,
    isOperational: true
  });
}

function createNotFoundError(message = "Resource not found", options = {}) {
  return new AppError(message, {
    statusCode: 404,
    code: "NOT_FOUND",
    ...options,
    isOperational: true
  });
}

function createUnauthorizedError(message = "Unauthorized", options = {}) {
  return new AppError(message, {
    statusCode: 401,
    code: "UNAUTHORIZED",
    ...options,
    isOperational: true
  });
}

function createForbiddenError(message = "Forbidden", options = {}) {
  return new AppError(message, {
    statusCode: 403,
    code: "FORBIDDEN",
    ...options,
    isOperational: true
  });
}

module.exports = {
  AppError,
  createValidationError,
  createNotFoundError,
  createUnauthorizedError,
  createForbiddenError
};
