const { AsyncLocalStorage } = require("async_hooks");
const crypto = require("crypto");

const HEADER_NAME = "x-request-id";
const asyncLocalStorage = new AsyncLocalStorage();

function getRequestId() {
  const store = asyncLocalStorage.getStore();
  return store && store.requestId ? store.requestId : null;
}

function getRequestStore() {
  return asyncLocalStorage.getStore() || {};
}

function requestIdMiddleware(req, res, next) {
  const existing = req.headers[HEADER_NAME];
  const requestId =
    typeof existing === "string" && existing.length > 0
      ? existing
      : crypto.randomUUID();

  res.setHeader(HEADER_NAME, requestId);
  req.requestId = requestId;

  const store = { requestId, method: req.method, url: req.originalUrl };
  asyncLocalStorage.run(store, () => {
    next();
  });
}

module.exports = {
  requestIdMiddleware,
  getRequestId,
  getRequestStore,
  HEADER_NAME
};
