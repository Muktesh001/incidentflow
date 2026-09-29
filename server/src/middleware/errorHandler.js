const { logger } = require("../config/logger");
const { getRequestId } = require("./requestId");
const { AppError } = require("../utils/errors");

function classifyError(err) {
  if (err instanceof AppError && err.isOperational) {
    return {
      isOperational: true,
      statusCode: err.statusCode || 500,
      code: err.code || "ERROR",
      message: err.message,
      extra: Object.fromEntries(
        Object.entries({
          field: err.field,
          value: err.value !== undefined ? err.value : undefined,
          allowedValues: err.allowedValues
        }).filter(([_k, v]) => v !== undefined)
      )
    };
  }

  if (err && err.type === "entity.parse.failed") {
    return {
      isOperational: true,
      statusCode: err.statusCode || err.status || 400,
      code: "INVALID_JSON",
      message: "Invalid JSON payload",
      extra: {}
    };
  }

  if (err instanceof SyntaxError && String(err.message).includes("JSON")) {
    return {
      isOperational: true,
      statusCode: 400,
      code: "INVALID_JSON",
      message: "Invalid JSON payload",
      extra: {}
    };
  }

  return {
    isOperational: false,
    statusCode: err && (err.statusCode || err.status) ? err.statusCode || err.status : 500,
    code: err && err.code ? err.code : "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    extra: {}
  };
}

function notFoundHandler(req, res) {
  const requestId = getRequestId() || req.requestId || res.getHeader("x-request-id");
  res.status(404).json({
    error: `Route ${req.method} ${req.originalUrl} not found`,
    code: "ROUTE_NOT_FOUND",
    requestId
  });
}

function errorHandler(err, req, res, _next) {
  const requestId = getRequestId() || req.requestId || res.getHeader("x-request-id");
  const info = classifyError(err);

  const baseBody = {
    error: info.message,
    code: info.code,
    requestId,
    ...info.extra
  };

  if (info.isOperational) {
    const level = info.statusCode >= 500 ? "warn" : "debug";
    logger[level](
      { err, statusCode: info.statusCode, requestId, method: req.method, url: req.originalUrl },
      `[${info.code}] ${err && err.message ? err.message : info.message}`
    );
  } else {
    logger.error(
      { err, statusCode: info.statusCode, requestId, method: req.method, url: req.originalUrl, stack: err && err.stack },
      `Unhandled error: ${err && err.message ? err.message : String(err)}`
    );
  }

  if (!res.headersSent) {
    res.status(info.statusCode).json(baseBody);
  }
}

module.exports = { errorHandler, notFoundHandler };
