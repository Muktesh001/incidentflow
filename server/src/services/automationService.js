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
    return;
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
      console.warn(
        `[automation] n8n webhook returned ${response.status} for ${eventType}: ${text}`
      );
      return { ok: false, status: response.status };
    }

    const responseBody = await response.text().catch(() => "");
    console.log(
      `[automation] ${eventType} delivered to n8n (status=${response.status})`
    );
    return { ok: true, status: response.status, body: responseBody };
  } catch (error) {
    console.warn(
      `[automation] Failed to deliver ${eventType} webhook: ${error.message}`
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
      console.warn(`[automation] notifyIncidentCreated error: ${err.message}`)
    );
}

function notifyIncidentUpdated(incident, previous) {
  const changes = buildChanges(previous, incident);

  if (!hasChanges(changes)) {
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
      console.warn(`[automation] notifyIncidentUpdated error: ${err.message}`)
    );
}

module.exports = {
  notifyIncidentCreated,
  notifyIncidentUpdated
};
