const { ObjectId } = require("mongodb");
const { getDatabase } = require("../config/database");
const { logger } = require("../config/logger");
const { getRequestId } = require("../middleware/requestId");
const {
  createValidationError,
  createNotFoundError
} = require("../utils/errors");
const { isValidIncidentId } = require("../models/incident");
const { analyzeIncident } = require("../services/aiAnalysisService");
const {
  recordAutomationEventAsync
} = require("../services/incidentHistoryService");

async function analyzeIncidentHandler(req, res) {
  const requestId = getRequestId() || req.requestId;
  const { id } = req.params;

  if (!id || !isValidIncidentId(String(id))) {
    throw createValidationError("Invalid incident ID", {
      field: "id",
      value: id
    });
  }

  const db = getDatabase();
  const incident = await db.collection("incidents").findOne({
    _id: new ObjectId(String(id))
  });

  if (!incident) {
    throw createNotFoundError("Incident not found", {
      field: "id",
      value: id
    });
  }

  const persist = req.query.persist !== "false" && req.body && req.body.persist !== false;

  logger.info(
    { requestId, incidentId: String(id), persist },
    "[ai] analyzing incident"
  );

  const analysis = await analyzeIncident(incident);

  if (persist) {
    try {
      recordAutomationEventAsync(
        id,
        "ai.analysis",
        {
          summary: `Automated AI analysis completed (${analysis.source})`,
          category: analysis.category,
          severitySanity: analysis.severitySanity,
          recommendationsCount: Array.isArray(analysis.recommendations) ? analysis.recommendations.length : 0,
          source: analysis.source,
          model: analysis.model,
          priorityScore: analysis.priorityScore,
          requestId
        }
      );
    } catch (err) {
      logger.warn({ err, incidentId: id }, "[ai] Failed to persist AI analysis automation event");
    }
  }

  return res.status(200).json({
    ok: true,
    requestId,
    timestamp: new Date().toISOString(),
    incidentId: String(id),
    analysis
  });
}

module.exports = {
  analyzeIncidentHandler
};
