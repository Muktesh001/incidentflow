const { ObjectId } = require("mongodb");
const { getDatabase } = require("../config/database");
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
      throw {
        type: "validation",
        field: "status",
        value: s,
        message: "Invalid status: " + s,
        allowed: VALID_STATUSES
      };
    }
  }

  for (const s of severityList) {
    if (!isValidSeverity(s)) {
      throw {
        type: "validation",
        field: "severity",
        value: s,
        message: "Invalid severity: " + s,
        allowed: VALID_SEVERITIES
      };
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
        throw {
          type: "validation",
          field: "from",
          value: from,
          message: "Invalid from date: " + from
        };
      }
    }
    if (to !== undefined) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        query.createdAt.$lte = d;
      } else {
        throw {
          type: "validation",
          field: "to",
          value: to,
          message: "Invalid to date: " + to
        };
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
      throw {
        type: "validation",
        field: "limit",
        value: limit,
        message: "Invalid limit: " + limit
      };
    }
  }
  if (offset !== undefined) {
    parsedOffset = parseInt(offset, 10);
    if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
      throw {
        type: "validation",
        field: "offset",
        value: offset,
        message: "Invalid offset: " + offset
      };
    }
  }

  return { query, limit: parsedLimit, offset: parsedOffset };
}

async function createIncidentHandler(req, res) {
  try {
    const { title, description, service, severity } = req.body;

    if (!title || !description || !service) {
      return res.status(400).json({
        error: "title, description and service are required"
      });
    }

    if (severity !== undefined && !isValidSeverity(severity)) {
      return res.status(400).json({
        error: "Invalid severity",
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

    res.status(201).json({
      id: result.insertedId,
      ...incident
    });
  } catch (error) {
    console.error("Create incident error:", error);

    res.status(500).json({
      error: "Failed to create incident"
    });
  }
}

async function getIncidentsHandler(req, res) {
  try {
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

    res.json(incidents);
  } catch (error) {
    if (error && error.type === "validation") {
      return res.status(400).json({
        error: error.message,
        field: error.field,
        value: error.value,
        allowedValues: error.allowed
      });
    }

    console.error("Get incidents error:", error);

    res.status(500).json({
      error: "Failed to fetch incidents"
    });
  }
}

async function getIncidentStatsHandler(req, res) {
  try {
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
  } catch (error) {
    console.error("Get incident stats error:", error);

    res.status(500).json({
      error: "Failed to fetch incident statistics"
    });
  }
}

async function getIncidentHandler(req, res) {
  try {
    const { id } = req.params;

    if (!isValidIncidentId(id)) {
      return res.status(400).json({
        error: "Invalid incident ID"
      });
    }

    const db = getDatabase();

    const incident = await db.collection("incidents").findOne({
      _id: new ObjectId(id)
    });

    if (!incident) {
      return res.status(404).json({
        error: "Incident not found"
      });
    }

    res.json(incident);
  } catch (error) {
    console.error("Get incident error:", error);

    res.status(500).json({
      error: "Failed to fetch incident"
    });
  }
}

async function updateIncidentHandler(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!isValidIncidentId(id)) {
      return res.status(400).json({
        error: "Invalid incident ID"
      });
    }

    if (updates.status !== undefined && !isValidStatus(updates.status)) {
      return res.status(400).json({
        error: "Invalid status",
        allowedValues: VALID_STATUSES
      });
    }

    if (updates.severity !== undefined && !isValidSeverity(updates.severity)) {
      return res.status(400).json({
        error: "Invalid severity",
        allowedValues: VALID_SEVERITIES
      });
    }

    const db = getDatabase();

    const existing = await db.collection("incidents").findOne({
      _id: new ObjectId(id)
    });

    if (!existing) {
      return res.status(404).json({
        error: "Incident not found"
      });
    }

    const previous = { ...existing };
    const updated = updateIncident(existing, updates);

    await db.collection("incidents").replaceOne(
      { _id: new ObjectId(id) },
      updated
    );

    notifyIncidentUpdated(updated, previous);

    res.json(updated);
  } catch (error) {
    console.error("Update incident error:", error);

    res.status(500).json({
      error: "Failed to update incident"
    });
  }
}

async function deleteIncidentHandler(req, res) {
  try {
    const { id } = req.params;

    if (!isValidIncidentId(id)) {
      return res.status(400).json({
        error: "Invalid incident ID"
      });
    }

    const db = getDatabase();

    const result = await db.collection("incidents").deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: "Incident not found"
      });
    }

    res.json({
      message: "Incident deleted successfully",
      id
    });
  } catch (error) {
    console.error("Delete incident error:", error);

    res.status(500).json({
      error: "Failed to delete incident"
    });
  }
}

module.exports = {
  createIncidentHandler,
  getIncidentsHandler,
  getIncidentStatsHandler,
  getIncidentHandler,
  updateIncidentHandler,
  deleteIncidentHandler
};
