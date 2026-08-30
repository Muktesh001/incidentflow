const { ObjectId } = require("mongodb");
const { getDatabase } = require("../config/database");
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
  } catch (error) {
    console.warn("[history] ensureIndexes failed (non-fatal):", error.message);
  }
}

function fireAndForget(promise, label) {
  Promise.resolve(promise).catch((error) => {
    console.warn(`[history] ${label} fireAndForget error:`, error.message);
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
    return await insertOne(entry);
  } catch (error) {
    console.warn("[history] recordIncidentCreated failed:", error.message);
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
    return await insertOne(entry);
  } catch (error) {
    console.warn("[history] recordIncidentUpdated failed:", error.message);
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
    return await insertOne(entry);
  } catch (error) {
    console.warn("[history] recordAutomationEvent failed:", error.message);
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
