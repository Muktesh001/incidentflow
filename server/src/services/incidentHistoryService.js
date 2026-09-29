const { ObjectId } = require("mongodb");
const { getDatabase } = require("../config/database");
const { logger } = require("../config/logger");
const { createHistoryEntry, normalizeChanges } = require("../models/incidentHistory");

const COLLECTION = "incidentHistory";

async function ensureIndexes() {
  try {
    const db = getDatabase();
    const collection = db.collection(COLLECTION);

    await collection.createIndex(
      { incidentId: 1, timestamp: -1 },
      { name: "incidentId_timestamp_desc" }
    );
    await collection.createIndex(
      { incidentId: 1, type: 1, timestamp: -1 },
      { name: "incidentId_type_timestamp_desc" }
    );
    logger.info({ collection: COLLECTION, indexes: 2 }, "History indexes ensured");
  } catch (error) {
    logger.warn({ collection: COLLECTION, err: error, message: error && error.message ? error.message : String(error) }, "[history] ensureIndexes failed (non-fatal)");
  }
}

function fireAndForget(promise, label) {
  Promise.resolve(promise).catch((error) => {
    logger.warn({ label, err: error, message: error && error.message ? error.message : String(error) }, `[history] ${label} fireAndForget error`);
  });
}

async function insertOne(entry) {
  const db = getDatabase();
  const result = await db.collection(COLLECTION).insertOne(entry);
  return result.insertedId;
}

async function recordIncidentCreated(incident, actor) {
  try {
    const entry = createHistoryEntry({
      incidentId: incident._id || incident.id,
      type: "created",
      actor: actor || { type: "system", name: "incidentflow-api" },
      metadata: {
        status: incident.status,
        severity: incident.severity,
        service: incident.service
      }
    });
    const id = await insertOne(entry);
    logger.debug({ historyId: id, incidentId: String(incident._id || incident.id), type: "created" }, "Recorded incident created history");
    return id;
  } catch (error) {
    logger.warn({ err: error, message: error && error.message ? error.message : String(error) }, "[history] recordIncidentCreated failed");
    throw error;
  }
}

function recordIncidentCreatedAsync(incident, actor) {
  fireAndForget(recordIncidentCreated(incident, actor), "recordIncidentCreated");
}

async function recordIncidentUpdated(incident, previous, changes, actor) {
  try {
    const normalizedChanges = normalizeChanges(changes);
    if (normalizedChanges.length === 0) {
      return null;
    }

    const entry = createHistoryEntry({
      incidentId: incident._id || incident.id,
      type: "updated",
      actor: actor || { type: "system", name: "incidentflow-api" },
      changes: normalizedChanges
    });
    const id = await insertOne(entry);
    logger.debug({ historyId: id, incidentId: String(incident._id || incident.id), type: "updated", changedFields: normalizedChanges.map((c) => c.field) }, "Recorded incident updated history");
    return id;
  } catch (error) {
    logger.warn({ err: error, message: error && error.message ? error.message : String(error) }, "[history] recordIncidentUpdated failed");
    throw error;
  }
}

function recordIncidentUpdatedAsync(incident, previous, changes, actor) {
  fireAndForget(
    recordIncidentUpdated(incident, previous, changes, actor),
    "recordIncidentUpdated"
  );
}

async function recordAutomationEvent(incidentId, eventType, details) {
  try {
    const entry = createHistoryEntry({
      incidentId,
      type: "automation",
      actor: { type: "n8n", name: "n8n-automation" },
      summary: details && details.summary
        ? String(details.summary)
        : `Automation: ${eventType}`,
      metadata: {
        eventType,
        ...(details && typeof details === "object" ? details : { details })
      }
    });
    const id = await insertOne(entry);
    logger.debug({ historyId: id, incidentId: String(incidentId), eventType }, "Recorded automation event");
    return id;
  } catch (error) {
    logger.warn({ err: error, message: error && error.message ? error.message : String(error) }, "[history] recordAutomationEvent failed");
    throw error;
  }
}

function recordAutomationEventAsync(incidentId, eventType, details) {
  fireAndForget(
    recordAutomationEvent(incidentId, eventType, details),
    "recordAutomationEvent"
  );
}

async function getIncidentHistory(incidentId, options = {}) {
  if (!incidentId) {
    throw new Error("incidentId is required");
  }

  const id =
    incidentId instanceof ObjectId
      ? incidentId
      : ObjectId.isValid(incidentId)
        ? new ObjectId(incidentId)
        : null;

  if (!id) {
    throw new Error("Invalid incidentId");
  }

  const db = getDatabase();
  let cursor = db
    .collection(COLLECTION)
    .find({ incidentId: id })
    .sort({ timestamp: 1, _id: 1 });

  const { limit, offset } = options;
  if (offset !== undefined && Number.isInteger(offset) && offset >= 0) {
    cursor = cursor.skip(offset);
  }
  if (limit !== undefined && Number.isInteger(limit) && limit >= 0) {
    cursor = cursor.limit(limit);
  }

  const entries = await cursor.toArray();

  const total = await db
    .collection(COLLECTION)
    .countDocuments({ incidentId: id });

  return {
    incidentId: id.toString(),
    total,
    limit: limit !== undefined ? limit : null,
    offset: offset !== undefined ? offset : 0,
    entries
  };
}

module.exports = {
  ensureIndexes,
  recordIncidentCreated,
  recordIncidentCreatedAsync,
  recordIncidentUpdated,
  recordIncidentUpdatedAsync,
  recordAutomationEvent,
  recordAutomationEventAsync,
  getIncidentHistory
};
