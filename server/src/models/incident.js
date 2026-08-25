const { ObjectId } = require("mongodb");

const VALID_STATUSES = ["open", "investigating", "mitigated", "resolved", "closed"];
const VALID_SEVERITIES = ["critical", "high", "medium", "low"];

function createIncident(data) {
  const now = new Date();

  return {
    title: data.title,
    description: data.description,
    service: data.service,
    severity: data.severity || "medium",
    status: "open",
    createdAt: now,
    updatedAt: now
  };
}

function updateIncident(existing, updates) {
  const now = new Date();
  const updatableFields = ["title", "description", "service", "severity", "status"];
  const merged = { ...existing };

  for (const field of updatableFields) {
    if (updates[field] !== undefined) {
      merged[field] = updates[field];
    }
  }

  merged.updatedAt = now;

  return merged;
}

function isValidIncidentId(id) {
  return ObjectId.isValid(id);
}

function isValidStatus(status) {
  return VALID_STATUSES.includes(status);
}

function isValidSeverity(severity) {
  return VALID_SEVERITIES.includes(severity);
}

module.exports = {
  VALID_STATUSES,
  VALID_SEVERITIES,
  createIncident,
  updateIncident,
  isValidIncidentId,
  isValidStatus,
  isValidSeverity
};