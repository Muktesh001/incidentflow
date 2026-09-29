const client = require("prom-client");

const collectDefaultMetrics = client.collectDefaultMetrics;
const Registry = client.Registry;
const register = new Registry();

collectDefaultMetrics({
  register,
  prefix: "incidentflow_",
  labels: { app: "incidentflow-api" },
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  eventLoopLagBuckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

const httpRequestsTotal = new client.Counter({
  name: "incidentflow_http_requests_total",
  help: "Total number of HTTP requests made",
  labelNames: ["method", "route", "status_code"],
  registers: [register]
});

const httpRequestDurationMs = new client.Histogram({
  name: "incidentflow_http_request_duration_ms",
  help: "HTTP request latencies in milliseconds",
  labelNames: ["method", "route"],
  buckets: [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register]
});

const httpErrorsTotal = new client.Counter({
  name: "incidentflow_http_errors_total",
  help: "Total number of HTTP error responses (4xx or 5xx)",
  labelNames: ["method", "route", "status_code", "error_type"],
  registers: [register]
});

function normalizeRoute(req) {
  const original = req.baseUrl
    ? (req.baseUrl + (req.route ? req.route.path || "" : ""))
    : (req.originalUrl || req.url || "/");
  let base = (original || "/").split("?")[0];
  // Collapse MongoDB _id-like hex path segments (24 hex chars) into ":id"
  base = base.replace(/\/[a-f0-9]{24}(?=\/|$)/gi, "/:id");
  // Collapse numeric path segments too (like pagination id refs)
  base = base.replace(/\/\d+(?=\/|$)/g, "/:num");
  return base;
}

function metricsMiddleware(req, res, next) {
  const startAt = process.hrtime.bigint();

  res.on("finish", () => {
    const deltaNs = process.hrtime.bigint() - startAt;
    const durationMs = Number(deltaNs) / 1e6;

    const route = normalizeRoute(req);
    const method = (req.method || "GET").toUpperCase();
    const status = String(res.statusCode);

    httpRequestDurationMs.labels({ method, route }).observe(durationMs);
    httpRequestsTotal.labels({ method, route, status_code: status }).inc();

    if (res.statusCode >= 400) {
      const type = res.statusCode >= 500 ? "5xx" : "4xx";
      httpErrorsTotal.labels({ method, route, status_code: status, error_type: type }).inc();
    }
  });

  next();
}

async function metricsHandler(_req, res) {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err && err.message ? err.message : String(err));
  }
}

function getRegister() {
  return register;
}

module.exports = {
  metricsMiddleware,
  metricsHandler,
  getRegister
};
