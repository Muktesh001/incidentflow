const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "..", ".env")
});

const cors = require("cors");
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

async function createApp() {
  const app = express();

  const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

  app.set("trust proxy", 1);

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
