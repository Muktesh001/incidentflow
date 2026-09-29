const { ObjectId } = require("mongodb");
const { getDatabase } = require("../config/database");
const { logger } = require("../config/logger");
const { getRequestId } = require("../middleware/requestId");
const {
  isValidIncidentId,
  updateIncident,
  isValidStatus,
  isValidSeverity,
  VALID_STATUSES,
  VALID_SEVERITIES
} = require("../models/incident");
const {
  createValidationError,
  createNotFoundError,
  createUnauthorizedError,
  createForbiddenError
} = require("../utils/errors");
const {
  notifyIncidentUpdated,
  notifyIncidentCreated
} = require("../services/automationService");
const {
  recordIncidentUpdatedAsync,
  recordIncidentCreated,
  recordAutomationEvent,
  recordAutomationEventAsync
} = require("../services/incidentHistoryService");
const { createHistoryEntry } = require("../models/incidentHistory");

const N8N_API_KEY = process.env.N8N_API_KEY || "";
const N8N_SIGNATURE_HEADER = "x-n8n-api-key";
const INCIDENTFLOW_API_BASE =
  process.env.INCIDENTFLOW_API_BASE || "http://localhost:5000";

function buildChanges(previous, current) {
  const COMPARABLE_FIELDS = [
    "title",
    "description",
    "service",
    "severity",
    "status"
  ];
  const changes = {};
  for (const field of COMPARABLE_FIELDS) {
    const prev = previous ? previous[field] : undefined;
    const curr = current ? current[field] : undefined;
    if (prev !== curr) {
      changes[field] = {
        from: prev !== undefined ? prev : null,
        to: curr !== undefined ? curr : null
      };
    }
  }
  return changes;
}

function authenticateN8NRequest(req) {
  if (!N8N_API_KEY || N8N_API_KEY.length === 0) {
    logger.warn("[n8n-webhook] N8N_API_KEY is empty; rejecting request");
    throw createForbiddenError(
      "n8n webhook is not configured on this server (N8N_API_KEY missing)"
    );
  }
  const provided = req.headers[N8N_SIGNATURE_HEADER];
  if (!provided || String(provided).trim() !== String(N8N_API_KEY).trim()) {
    throw createUnauthorizedError("Invalid or missing n8n API key", {
      field: N8N_SIGNATURE_HEADER
    });
  }
  return true;
}

const KNOWN_ACTIONS = [
  "ping",
  "incident.update",
  "incident.add_note",
  "incident.close",
  "incident.reopen",
  "incident.create",
  "automation.log"
];

function validateActionPayload(action, payload) {
  if (!action || typeof action !== "string") {
    throw createValidationError("action is required and must be a string");
  }
  if (!KNOWN_ACTIONS.includes(action)) {
    throw createValidationError(`Unknown action: ${action}`, {
      field: "action",
      value: action,
      allowedValues: KNOWN_ACTIONS
    });
  }

  const normalized = payload && typeof payload === "object" ? { ...payload } : {};

  switch (action) {
    case "ping":
      return { action, payload: normalized };

    case "incident.update": {
      if (!normalized.incidentId || !isValidIncidentId(String(normalized.incidentId))) {
        throw createValidationError("incidentId is required (valid MongoDB ID)", {
          field: "incidentId"
        });
      }
      const updates = normalized.updates || {};
      if (updates.status !== undefined && !isValidStatus(updates.status)) {
        throw createValidationError("Invalid status", {
          field: "updates.status",
          value: updates.status,
          allowedValues: VALID_STATUSES
        });
      }
      if (updates.severity !== undefined && !isValidSeverity(updates.severity)) {
        throw createValidationError("Invalid severity", {
          field: "updates.severity",
          value: updates.severity,
          allowedValues: VALID_SEVERITIES
        });
      }
      return { action, payload: { ...normalized, updates } };
    }

    case "incident.add_note": {
      if (!normalized.incidentId || !isValidIncidentId(String(normalized.incidentId))) {
        throw createValidationError("incidentId is required (valid MongoDB ID)", {
          field: "incidentId"
        });
      }
      if (!normalized.note || typeof normalized.note !== "string" || normalized.note.trim().length === 0) {
        throw createValidationError("note is required (non-empty string)", {
          field: "note"
        });
      }
      return { action, payload: normalized };
    }

    case "incident.close":
    case "incident.reopen": {
      if (!normalized.incidentId || !isValidIncidentId(String(normalized.incidentId))) {
        throw createValidationError("incidentId is required (valid MongoDB ID)", {
          field: "incidentId"
        });
      }
      return { action, payload: normalized };
    }

    case "incident.create": {
      if (!normalized.title || typeof normalized.title !== "string") {
        throw createValidationError("title is required", { field: "title" });
      }
      if (!normalized.description || typeof normalized.description !== "string") {
        throw createValidationError("description is required", { field: "description" });
      }
      if (!normalized.service || typeof normalized.service !== "string") {
        throw createValidationError("service is required", { field: "service" });
      }
      if (normalized.severity !== undefined && !isValidSeverity(normalized.severity)) {
        throw createValidationError("Invalid severity", {
          field: "severity",
          value: normalized.severity,
          allowedValues: VALID_SEVERITIES
        });
      }
      return { action, payload: normalized };
    }

    case "automation.log": {
      if (!normalized.incidentId || !isValidIncidentId(String(normalized.incidentId))) {
        throw createValidationError("incidentId is required (valid MongoDB ID)", {
          field: "incidentId"
        });
      }
      return { action, payload: normalized };
    }

    default:
      throw createValidationError(`Unknown action: ${action}`, {
        field: "action",
        value: action
      });
  }
}

async function handlePing(req, res) {
  const requestId = getRequestId() || req.requestId;
  logger.info({ requestId }, "[n8n-webhook] ping received");
  return res.json({
    ok: true,
    action: "ping",
    message: "IncidentFlow API received n8n ping",
    requestId,
    timestamp: new Date().toISOString(),
    apiBase: INCIDENTFLOW_API_BASE
  });
}

async function handleIncidentUpdate(actionPayload, actor) {
  const { incidentId, updates, note, summary } = actionPayload;
  const db = getDatabase();

  const existing = await db.collection("incidents").findOne({
    _id: new ObjectId(String(incidentId))
  });
  if (!existing) {
    throw createNotFoundError("Incident not found", { field: "incidentId", value: incidentId });
  }

  const previous = { ...existing };
  const updated = updateIncident(existing, updates);

  await db.collection("incidents").replaceOne(
    { _id: new ObjectId(String(incidentId)) },
    updated
  );

  const changes = buildChanges(previous, updated);
  notifyIncidentUpdated(updated, previous);
  recordIncidentUpdatedAsync(updated, previous, changes, actor);

  if (note && typeof note === "string" && note.trim().length > 0) {
    try {
      const db2 = getDatabase();
      const entry = createHistoryEntry({
        incidentId: updated._id || updated.id || incidentId,
        type: "note",
        actor,
        summary: summary || "Automation note added",
        metadata: {
          note: note.trim(),
          source: actionPayload.source || "n8n"
        }
      });
      await db2.collection("incidentHistory").insertOne(entry);
    } catch (noteErr) {
      logger.warn({ err: noteErr, incidentId }, "[n8n-webhook] Failed to add note alongside update");
    }
  }

  return {
    incident: updated,
    changedFields: Object.keys(changes)
  };
}

async function handleAddNote(actionPayload, actor) {
  const { incidentId, note, summary } = actionPayload;
  const db = getDatabase();

  const existing = await db.collection("incidents").findOne({
    _id: new ObjectId(String(incidentId))
  });
  if (!existing) {
    throw createNotFoundError("Incident not found", { field: "incidentId", value: incidentId });
  }

  const entry = createHistoryEntry({
    incidentId,
    type: "note",
    actor,
    summary: summary || "Note added via n8n automation",
    metadata: {
      note: note.trim(),
      source: actionPayload.source || "n8n"
    }
  });

  const result = await db.collection("incidentHistory").insertOne(entry);

  return {
    noteAdded: true,
    noteId: result.insertedId,
    incidentId: String(incidentId)
  };
}

async function handleCloseOrReopen(action, actionPayload, actor) {
  const targetStatus = action === "incident.reopen" ? "open" : "closed";
  return handleIncidentUpdate(
    {
      ...actionPayload,
      updates: { status: targetStatus },
      summary: actionPayload.summary || (targetStatus === "closed" ? "Incident closed by n8n automation" : "Incident reopened by n8n automation")
    },
    actor
  );
}

async function handleIncidentCreate(actionPayload, actor) {
  const { title, description, service, severity } = actionPayload;
  const { createIncident } = require("../models/incident");

  const incident = createIncident({
    title: String(title).trim(),
    description: String(description).trim(),
    service: String(service).trim(),
    severity: severity ? String(severity).toLowerCase() : undefined
  });

  const db = getDatabase();
  const result = await db.collection("incidents").insertOne(incident);

  const persisted = { ...incident, _id: result.insertedId };

  notifyIncidentCreated(persisted);
  await recordIncidentCreated(persisted, actor);

  return {
    created: true,
    incident: persisted
  };
}

async function handleAutomationLog(actionPayload, actor) {
  const { incidentId, eventType, details, summary } = actionPayload;
  const id = await recordAutomationEvent(
    incidentId,
    eventType || "automation.log",
    {
      summary: summary || (details && details.summary) || "Automation log from n8n",
      ...(details && typeof details === "object" ? details : { details })
    }
  );

  return {
    logged: true,
    historyId: id,
    incidentId: String(incidentId)
  };
}

async function n8nWebhookHandler(req, res) {
  authenticateN8NRequest(req);

  const requestId = getRequestId() || req.requestId;
  const { action, payload, source } = req.body || {};

  const validated = validateActionPayload(action, payload);

  const actor = {
    type: "n8n",
    name: source && source.name ? String(source.name) : "n8n-automation",
    id: source && source.id ? String(source.id) : undefined
  };

  logger.info(
    { requestId, action: validated.action, incidentId: validated.payload && validated.payload.incidentId ? String(validated.payload.incidentId) : undefined },
    `[n8n-webhook] processing action: ${validated.action}`
  );

  let result;
  switch (validated.action) {
    case "ping":
      return handlePing(req, res);
    case "incident.update":
      result = await handleIncidentUpdate(validated.payload, actor);
      break;
    case "incident.add_note":
      result = await handleAddNote(validated.payload, actor);
      break;
    case "incident.close":
    case "incident.reopen":
      result = await handleCloseOrReopen(validated.action, validated.payload, actor);
      break;
    case "incident.create":
      result = await handleIncidentCreate(validated.payload, actor);
      break;
    case "automation.log":
      result = await handleAutomationLog(validated.payload, actor);
      break;
    default:
      throw createValidationError(`Unknown action: ${validated.action}`, {
        field: "action",
        value: validated.action
      });
  }

  await recordAutomationEventAsync(
    validated.payload.incidentId || (result && result.incident && (result.incident._id || result.incident.id)),
    `n8n.${validated.action}`,
    {
      summary: `n8n action executed: ${validated.action}`,
      result: Object.fromEntries(
        Object.entries(result).filter(([k, _v]) => k !== "incident")
      ),
      action: validated.action,
      requestId
    }
  );

  res.status(200).json({
    ok: true,
    action: validated.action,
    requestId,
    timestamp: new Date().toISOString(),
    ...result
  });
}

async function automationHistoryHandler(req, res) {
  const db = getDatabase();

  const { limit, offset, incidentId, eventType } = req.query;
  const query = { type: "automation" };

  if (incidentId && isValidIncidentId(String(incidentId))) {
    query.incidentId = new ObjectId(String(incidentId));
  } else if (incidentId) {
    throw createValidationError("Invalid incidentId filter", {
      field: "incidentId",
      value: incidentId
    });
  }
  if (eventType && typeof eventType === "string") {
    query["metadata.eventType"] = eventType;
  }

  const parsedLimit =
    limit !== undefined
      ? Math.min(parseInt(limit, 10) || 50, 200)
      : 50;
  const parsedOffset =
    offset !== undefined ? Math.max(parseInt(offset, 10) || 0, 0) : 0;

  const cursor = db
    .collection("incidentHistory")
    .find(query)
    .sort({ timestamp: -1, _id: -1 })
    .skip(parsedOffset)
    .limit(parsedLimit);

  const entries = await cursor.toArray();
  const total = await db.collection("incidentHistory").countDocuments(query);

  res.json({
    total,
    limit: parsedLimit,
    offset: parsedOffset,
    entries
  });
}

module.exports = {
  n8nWebhookHandler,
  automationHistoryHandler,
  authenticateN8NRequest,
  KNOWN_ACTIONS
};
