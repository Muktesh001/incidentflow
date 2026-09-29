const { ObjectId } = require("mongodb");
const { getDatabase } = require("../config/database");
const { logger } = require("../config/logger");
const {
  createIncident,
  updateIncident,
  isValidIncidentId,
  isValidStatus,
  isValidSeverity,
  VALID_STATUSES,
  VALID_SEVERITIES
} = require("../models/incident");
const {
  notifyIncidentCreated,
  notifyIncidentUpdated
} = require("../services/automationService");
const {
  recordIncidentCreatedAsync,
  recordIncidentUpdatedAsync,
  getIncidentHistory
} = require("../services/incidentHistoryService");
const {
  createValidationError,
  createNotFoundError
} = require("../utils/errors");

const COMPARABLE_FIELDS = ["title", "description", "service", "severity", "status"];

function buildChanges(previous, current) {
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

function splitCsv(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((v) => String(v).split(","))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFilterQuery(req) {
  const { status, severity, service, search, from, to, limit, offset } = req.query;

  const statusList = splitCsv(status);
  const severityList = splitCsv(severity);

  for (const s of statusList) {
    if (!isValidStatus(s)) {
      throw createValidationError("Invalid status: " + s, {
        field: "status",
        value: s,
        allowedValues: VALID_STATUSES
      });
    }
  }

  for (const s of severityList) {
    if (!isValidSeverity(s)) {
      throw createValidationError("Invalid severity: " + s, {
        field: "severity",
        value: s,
        allowedValues: VALID_SEVERITIES
      });
    }
  }

  const query = {};

  if (statusList.length > 0) {
    query.status = { $in: statusList };
  }

  if (severityList.length > 0) {
    query.severity = { $in: severityList };
  }

  if (service !== undefined && service !== "") {
    query.service = String(service);
  }

  if (search !== undefined && search !== "") {
    const escaped = String(search).replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    query.$or = [
      { title: { $regex: escaped, $options: "i" } },
      { description: { $regex: escaped, $options: "i" } }
    ];
  }

  if (from !== undefined || to !== undefined) {
    query.createdAt = {};
    if (from !== undefined) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) {
        query.createdAt.$gte = d;
      } else {
        throw createValidationError("Invalid from date: " + from, {
          field: "from",
          value: from
        });
      }
    }
    if (to !== undefined) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        query.createdAt.$lte = d;
      } else {
        throw createValidationError("Invalid to date: " + to, {
          field: "to",
          value: to
        });
      }
    }
    if (Object.keys(query.createdAt).length === 0) {
      delete query.createdAt;
    }
  }

  let parsedLimit;
  let parsedOffset;
  if (limit !== undefined) {
    parsedLimit = parseInt(limit, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 0) {
      throw createValidationError("Invalid limit: " + limit, {
        field: "limit",
        value: limit
      });
    }
  }
  if (offset !== undefined) {
    parsedOffset = parseInt(offset, 10);
    if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
      throw createValidationError("Invalid offset: " + offset, {
        field: "offset",
        value: offset
      });
    }
  }

  return { query, limit: parsedLimit, offset: parsedOffset };
}

async function createIncidentHandler(req, res) {
  const { title, description, service, severity } = req.body;

  if (!title || !description || !service) {
    throw createValidationError("title, description and service are required");
  }

  if (severity !== undefined && !isValidSeverity(severity)) {
    throw createValidationError("Invalid severity", {
      field: "severity",
      value: severity,
      allowedValues: VALID_SEVERITIES
    });
  }

  const incident = createIncident({
    title,
    description,
    service,
    severity
  });

  const db = getDatabase();

  const result = await db.collection("incidents").insertOne(incident);

  const persisted = {
    ...incident,
    _id: result.insertedId
  };

  notifyIncidentCreated(persisted);
  recordIncidentCreatedAsync(persisted);

  logger.info(
    { incidentId: String(result.insertedId), severity: incident.severity, service: incident.service },
    "Incident created"
  );

  res.status(201).json({
    id: result.insertedId,
    ...incident
  });
}

async function getIncidentsHandler(req, res) {
  const { query, limit, offset } = parseFilterQuery(req);

  const db = getDatabase();

  let cursor = db
    .collection("incidents")
    .find(query)
    .sort({ createdAt: -1 });

  if (offset !== undefined) {
    cursor = cursor.skip(offset);
  }
  if (limit !== undefined) {
    cursor = cursor.limit(limit);
  }

  const incidents = await cursor.toArray();

  logger.debug(
    { count: incidents.length, limit, offset, queryKeys: Object.keys(query) },
    "Incidents listed"
  );

  res.json(incidents);
}

async function getIncidentStatsHandler(req, res) {
  const db = getDatabase();

  const pipeline = [
    {
      $facet: {
        total: [{ $count: "value" }],
        byStatus: [
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ],
        bySeverity: [
          { $group: { _id: "$severity", count: { $sum: 1 } } }
        ],
        byService: [
          { $group: { _id: "$service", count: { $sum: 1 } } }
        ],
        openCritical: [
          { $match: { status: "open", severity: "critical" } },
          { $count: "value" }
        ],
        openHigh: [
          { $match: { status: "open", severity: "high" } },
          { $count: "value" }
        ]
      }
    }
  ];

  const aggResult = await db
    .collection("incidents")
    .aggregate(pipeline)
    .toArray();

  const result = aggResult[0] || {};

  const emptyStatusBucket = Object.fromEntries(
    VALID_STATUSES.map((s) => [s, 0])
  );
  const emptySeverityBucket = Object.fromEntries(
    VALID_SEVERITIES.map((s) => [s, 0])
  );
  const byStatus = { ...emptyStatusBucket };
  const bySeverity = { ...emptySeverityBucket };
  const byService = {};

  for (const row of result.byStatus || []) {
    byStatus[row._id] = row.count;
  }
  for (const row of result.bySeverity || []) {
    bySeverity[row._id] = row.count;
  }
  for (const row of result.byService || []) {
    byService[row._id] = row.count;
  }

  const total =
    (result.total && result.total[0] && result.total[0].value) || 0;
  const openCritical =
    (result.openCritical &&
      result.openCritical[0] &&
      result.openCritical[0].value) ||
    0;
  const openHigh =
    (result.openHigh && result.openHigh[0] && result.openHigh[0].value) || 0;

  res.json({
    total,
    byStatus,
    bySeverity,
    byService,
    openCritical,
    openHigh
  });
}

async function getIncidentHandler(req, res) {
  const { id } = req.params;

  if (!isValidIncidentId(id)) {
    throw createValidationError("Invalid incident ID", { field: "id", value: id });
  }

  const db = getDatabase();

  const incident = await db.collection("incidents").findOne({
    _id: new ObjectId(id)
  });

  if (!incident) {
    throw createNotFoundError("Incident not found", { field: "id", value: id });
  }

  res.json(incident);
}

async function updateIncidentHandler(req, res) {
  const { id } = req.params;
  const updates = req.body;

  if (!isValidIncidentId(id)) {
    throw createValidationError("Invalid incident ID", { field: "id", value: id });
  }

  if (updates.status !== undefined && !isValidStatus(updates.status)) {
    throw createValidationError("Invalid status", {
      field: "status",
      value: updates.status,
      allowedValues: VALID_STATUSES
    });
  }

  if (updates.severity !== undefined && !isValidSeverity(updates.severity)) {
    throw createValidationError("Invalid severity", {
      field: "severity",
      value: updates.severity,
      allowedValues: VALID_SEVERITIES
    });
  }

  const db = getDatabase();

  const existing = await db.collection("incidents").findOne({
    _id: new ObjectId(id)
  });

  if (!existing) {
    throw createNotFoundError("Incident not found", { field: "id", value: id });
  }

  const previous = { ...existing };
  const updated = updateIncident(existing, updates);

  await db.collection("incidents").replaceOne(
    { _id: new ObjectId(id) },
    updated
  );

  notifyIncidentUpdated(updated, previous);

  const changes = buildChanges(previous, updated);
  recordIncidentUpdatedAsync(updated, previous, changes);

  logger.info(
    {
      incidentId: id,
      changedFields: Object.keys(changes),
      prevStatus: previous.status,
      newStatus: updated.status,
      prevSeverity: previous.severity,
      newSeverity: updated.severity
    },
    "Incident updated"
  );

  res.json(updated);
}

async function getIncidentHistoryHandler(req, res) {
  const { id } = req.params;

  if (!isValidIncidentId(id)) {
    throw createValidationError("Invalid incident ID", { field: "id", value: id });
  }

  const db = getDatabase();
  const incident = await db.collection("incidents").findOne({
    _id: new ObjectId(id)
  });

  if (!incident) {
    throw createNotFoundError("Incident not found", { field: "id", value: id });
  }

  const { limit, offset } = req.query;
  const options = {};
  if (limit !== undefined) {
    const parsedLimit = parseInt(limit, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 0) {
      throw createValidationError("Invalid limit: " + limit, {
        field: "limit",
        value: limit
      });
    }
    options.limit = parsedLimit;
  }
  if (offset !== undefined) {
    const parsedOffset = parseInt(offset, 10);
    if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
      throw createValidationError("Invalid offset: " + offset, {
        field: "offset",
        value: offset
      });
    }
    options.offset = parsedOffset;
  }

  const history = await getIncidentHistory(id, options);

  res.json(history);
}

async function deleteIncidentHandler(req, res) {
  const { id } = req.params;

  if (!isValidIncidentId(id)) {
    throw createValidationError("Invalid incident ID", { field: "id", value: id });
  }

  const db = getDatabase();

  const result = await db.collection("incidents").deleteOne({
    _id: new ObjectId(id)
  });

  if (result.deletedCount === 0) {
    throw createNotFoundError("Incident not found", { field: "id", value: id });
  }

  logger.info({ incidentId: id }, "Incident deleted");

  res.json({
    message: "Incident deleted successfully",
    id
  });
}

module.exports = {
  createIncidentHandler,
  getIncidentsHandler,
  getIncidentStatsHandler,
  getIncidentHandler,
  getIncidentHistoryHandler,
  updateIncidentHandler,
  deleteIncidentHandler
};
