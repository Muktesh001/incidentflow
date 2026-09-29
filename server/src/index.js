const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "..", ".env")
});

const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pinoHttp = require("pino-http");
const express = require("express");

const incidentRoutes = require("./routes/incidentRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const userRoutes = require("./routes/userRoutes");
const { connectDatabase } = require("./config/database");
const { ensureIndexes } = require("./services/incidentHistoryService");
const { logger } = require("./config/logger");
const { requestIdMiddleware, getRequestId } = require("./middleware/requestId");
const { authMiddleware, AUTH_REQUIRED } = require("./middleware/auth");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

const NODE_ENV = (process.env.NODE_ENV || "development").toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";
const IS_TEST = NODE_ENV === "test";

function parsePositiveInt(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = parseInt(String(raw), 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

async function createApp() {
  const app = express();

  const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
  const GLOBAL_RATE_WINDOW_MS =
    parsePositiveInt(process.env.RATE_LIMIT_WINDOW_SEC, 60) * 1000;
  const GLOBAL_RATE_MAX = parsePositiveInt(process.env.RATE_LIMIT_MAX, 600);
  const AUTH_RATE_WINDOW_MS =
    parsePositiveInt(process.env.RATE_LIMIT_AUTH_WINDOW_SEC, 900) * 1000;
  const AUTH_RATE_MAX = parsePositiveInt(process.env.RATE_LIMIT_AUTH_MAX, 15);

  app.set("trust proxy", 1);

  if (!IS_TEST) {
    app.use(
      helmet({
        contentSecurityPolicy: IS_PRODUCTION ? undefined : false,
        crossOriginEmbedderPolicy: !IS_PRODUCTION ? false : undefined,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
      })
    );
  }

  app.use(requestIdMiddleware);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = getRequestId() || req.requestId;
        if (id && res) {
          try {
            res.setHeader("x-request-id", id);
          } catch (_err) {
            /* ignore */
          }
        }
        return id;
      },
      autoLogging: {
        ignore: (req) => req.url === "/health" && req.method === "GET"
      }
    })
  );

  app.use(
    cors({
      origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: CORS_ORIGIN !== "*",
      exposedHeaders: ["x-request-id"],
      maxAge: 600
    })
  );

  if (!IS_TEST) {
    const globalLimiter = rateLimit({
      windowMs: GLOBAL_RATE_WINDOW_MS,
      max: GLOBAL_RATE_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: "Too many requests",
        code: "RATE_LIMITED",
        retryAfterSec: Math.ceil(GLOBAL_RATE_WINDOW_MS / 1000)
      },
      keyGenerator: (req) =>
        req.ip || (req.headers["x-forwarded-for"] || "").toString().split(",")[0] || "unknown"
    });
    app.use(globalLimiter);

    const authLimiter = rateLimit({
      windowMs: AUTH_RATE_WINDOW_MS,
      max: AUTH_RATE_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      message: {
        error: "Too many auth attempts. Please slow down.",
        code: "AUTH_RATE_LIMITED",
        retryAfterSec: Math.ceil(AUTH_RATE_WINDOW_MS / 1000)
      },
      keyGenerator: (req) =>
        req.ip || (req.headers["x-forwarded-for"] || "").toString().split(",")[0] || "unknown"
    });
    app.use("/api/auth/login", authLimiter);
    app.use("/api/auth/register", authLimiter);
  }

  app.use(express.json({ limit: "1mb" }));

  app.use(authMiddleware);

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "incidentflow-api",
      timestamp: new Date().toISOString(),
      requestId: getRequestId() || req.requestId,
      auth: {
        required: AUTH_REQUIRED,
        authenticated: !!req.user,
        user: req.user
          ? { id: req.user.id, role: req.user.role }
          : null
      },
      integrations: {
        n8nWebhook: process.env.N8N_WEBHOOK_URL ? "configured" : "not_configured",
        n8nApiKey: process.env.N8N_API_KEY ? "configured" : "not_configured",
        gemini: process.env.GEMINI_API_KEY ? "configured" : "not_configured",
        jwt: process.env.JWT_SECRET ? "configured" : "not_configured"
      }
    });
  });

  app.use("/api/incidents", incidentRoutes);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/auth", userRoutes);
  app.use("/api/users", userRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function startServer() {
  try {
    await connectDatabase();
    ensureIndexes();

    const app = await createApp();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      logger.info(`IncidentFlow API running on port ${PORT}`);
    });
  } catch (error) {
    logger.fatal(
      { err: error, message: error && error.message ? error.message : String(error) },
      "Server startup failed"
    );
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
