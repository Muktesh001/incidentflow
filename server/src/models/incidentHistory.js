const { ObjectId } = require("mongodb");

const VALID_TYPES = [
  "created",
  "updated",
  "status_changed",
  "severity_changed",
  "automation",
  "note"
];

const VALID_ACTOR_TYPES = ["system", "user", "n8n"];

function isValidHistoryType(type) {
  return VALID_TYPES.includes(type);
}

function isValidActorType(actorType) {
  return VALID_ACTOR_TYPES.includes(actorType);
}

function normalizeChanges(changes) {
  if (!changes || typeof changes !== "object") {
    return [];
  }

  if (Array.isArray(changes)) {
    return changes
      .filter((c) => c && typeof c === "object" && c.field !== undefined)
      .map((c) => ({
        field: String(c.field),
        from: c.from !== undefined ? c.from : null,
        to: c.to !== undefined ? c.to : null
      }));
  }

  return Object.entries(changes)
    .filter(([field, value]) => value && typeof value === "object" && ("from" in value || "to" in value))
    .map(([field, value]) => ({
      field,
      from: value.from !== undefined ? value.from : null,
      to: value.to !== undefined ? value.to : null
    }));
}

function buildSummary(type, changes, providedSummary) {
  if (providedSummary) {
    return String(providedSummary);
  }

  switch (type) {
    case "created":
      return "Incident created";
    case "automation":
      return "Automation event received";
    case "note":
      return "Note added";
    case "status_changed": {
      const statusChange = Array.isArray(changes)
        ? changes.find((c) => c.field === "status")
        : changes && changes.status;
      if (statusChange) {
        const from = statusChange.from;
        const to = statusChange.to;
        return `Status changed from ${from} to ${to}`;
      }
      return "Status changed";
    }
    case "severity_changed": {
      const sevChange = Array.isArray(changes)
        ? changes.find((c) => c.field === "severity")
        : changes && changes.severity;
      if (sevChange) {
        return `Severity changed from ${sevChange.from} to ${sevChange.to}`;
      }
      return "Severity changed";
    }
    case "updated":
    default: {
      const list = normalizeChanges(changes);
      if (list.length === 0) {
        return "Incident updated";
      }
      const fields = list.map((c) => c.field).join(", ");
      return `Updated fields: ${fields}`;
    }
  }
}

function createHistoryEntry({ incidentId, type, actor, changes, summary, metadata }) {
  if (!incidentId) {
    throw new Error("incidentId is required");
  }

  if (!isValidHistoryType(type)) {
    throw new Error(`Invalid history type: ${type}`);
  }

  const incidentObjectId =
    incidentId instanceof ObjectId
      ? incidentId
      : ObjectId.isValid(incidentId)
        ? new ObjectId(incidentId)
        : null;

  if (!incidentObjectId) {
    throw new Error("Invalid incidentId");
  }

  let actorRecord = { type: "system" };
  if (actor && typeof actor === "object") {
    actorRecord = {
      type: isValidActorType(actor.type) ? actor.type : "system"
    };
    if (actor.id !== undefined) actorRecord.id = String(actor.id);
    if (actor.name !== undefined) actorRecord.name = String(actor.name);
  }

  const normalizedChanges = normalizeChanges(changes);
  const resolvedType = resolveDerivedType(type, normalizedChanges);
  const resolvedSummary = buildSummary(resolvedType, normalizedChanges, summary);

  const now = new Date();
  const entry = {
    incidentId: incidentObjectId,
    timestamp: now,
    type: resolvedType,
    actor: actorRecord,
    summary: resolvedSummary
  };

  if (normalizedChanges.length > 0) {
    entry.changes = normalizedChanges;
  }
  if (metadata !== undefined && metadata !== null) {
    entry.metadata = typeof metadata === "object" ? { ...metadata } : { value: metadata };
  }

  return entry;
}

function resolveDerivedType(type, changesList) {
  if (type !== "updated") {
    return type;
  }

  const fields = changesList.map((c) => c.field);
  const hasStatus = fields.includes("status");
  const hasSeverity = fields.includes("severity");

  if (hasStatus && !hasSeverity && fields.length === 1) {
    return "status_changed";
  }
  if (hasSeverity && !hasStatus && fields.length === 1) {
    return "severity_changed";
  }

  return "updated";
}

module.exports = {
  VALID_TYPES,
  VALID_ACTOR_TYPES,
  isValidHistoryType,
  isValidActorType,
  normalizeChanges,
  createHistoryEntry
};
