const { logger } = require("../config/logger");
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const COMPARABLE_FIELDS = ["title", "description", "service", "severity", "status"];
const SIGNIFICANT_FIELDS = ["severity", "status"];
const {
  recordAutomationEventAsync
} = require("./incidentHistoryService");

function serializeId(incident) {
  if (!incident) return null;

  const serialized = { ...incident };

  if (serialized._id && typeof serialized._id.toString === "function") {
    serialized.id = serialized._id.toString();
    delete serialized._id;
  } else if (serialized._id) {
    serialized.id = serialized._id;
    delete serialized._id;
  }

  return serialized;
}

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

function hasChanges(changes) {
  return Object.keys(changes).length > 0;
}

function hasSignificantChanges(changes) {
  return SIGNIFICANT_FIELDS.some((field) => changes[field] !== undefined);
}

async function emitEvent(eventType, payload) {
  if (!WEBHOOK_URL) {
    logger.debug({ eventType }, "[automation] N8N_WEBHOOK_URL not set; skipping emit");
    return { ok: false, skipped: true, reason: "no_webhook_url" };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "incidentflow-api/1.0"
      },
      body: JSON.stringify({
        event: eventType,
        timestamp: new Date().toISOString(),
        source: "incidentflow-api",
        ...payload
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn(
        { eventType, status: response.status, responsePreview: text.slice(0, 500) },
        `[automation] n8n webhook returned ${response.status} for ${eventType}`
      );
      return { ok: false, status: response.status };
    }

    const responseBody = await response.text().catch(() => "");
    logger.info(
      { eventType, status: response.status, bodyPreview: responseBody.slice(0, 200) },
      `[automation] ${eventType} delivered to n8n`
    );
    return { ok: true, status: response.status, body: responseBody };
  } catch (error) {
    logger.warn(
      { eventType, err: error, message: error && error.message ? error.message : String(error) },
      `[automation] Failed to deliver ${eventType} webhook`
    );
    return { ok: false, error: error.message };
  }
}

function notifyIncidentCreated(incident) {
  const payload = {
    incident: serializeId(incident)
  };

  const incidentId = incident && (incident.id || incident._id);

  Promise.resolve()
    .then(() => emitEvent("incident.created", payload))
    .then((result) => {
      if (incidentId) {
        const details = {
          summary: result && result.ok
            ? "Webhook incident.created delivered to n8n"
            : result
              ? "Webhook incident.created failed to deliver"
              : "Webhook incident.created skipped (no N8N_WEBHOOK_URL)",
          delivery: result || { skipped: true, reason: "no_webhook_url" }
        };
        recordAutomationEventAsync(incidentId, "incident.created", details);
      }
      return result;
    })
    .catch((err) =>
      logger.warn({ err, message: err && err.message ? err.message : String(err) }, "[automation] notifyIncidentCreated error")
    );
}

function notifyIncidentUpdated(incident, previous) {
  const changes = buildChanges(previous, incident);

  if (!hasChanges(changes)) {
    logger.debug({ incidentId: String(incident && (incident.id || incident._id || "?")) }, "[automation] no changes detected; skipping notifyIncidentUpdated");
    return;
  }

  const payload = {
    incident: serializeId(incident),
    previous: serializeId(previous),
    changes,
    significant: hasSignificantChanges(changes)
  };

  const incidentId = incident && (incident.id || incident._id);

  Promise.resolve()
    .then(() => emitEvent("incident.updated", payload))
    .then((result) => {
      if (incidentId) {
        const details = {
          summary: result && result.ok
            ? "Webhook incident.updated delivered to n8n"
            : result
              ? "Webhook incident.updated failed to deliver"
              : "Webhook incident.updated skipped (no N8N_WEBHOOK_URL)",
          delivery: result || { skipped: true, reason: "no_webhook_url" },
          significant: payload.significant,
          changedFields: Object.keys(changes)
        };
        recordAutomationEventAsync(incidentId, "incident.updated", details);
      }
      return result;
    })
    .catch((err) =>
      logger.warn({ err, message: err && err.message ? err.message : String(err) }, "[automation] notifyIncidentUpdated error")
    );
}

module.exports = {
  notifyIncidentCreated,
  notifyIncidentUpdated
};
