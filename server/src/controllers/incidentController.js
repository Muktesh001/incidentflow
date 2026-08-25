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
    const db = getDatabase();

    const incidents = await db
      .collection("incidents")
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.json(incidents);
  } catch (error) {
    console.error("Get incidents error:", error);

    res.status(500).json({
      error: "Failed to fetch incidents"
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

    const updated = updateIncident(existing, updates);

    await db.collection("incidents").replaceOne(
      { _id: new ObjectId(id) },
      updated
    );

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
  getIncidentHandler,
  updateIncidentHandler,
  deleteIncidentHandler
};