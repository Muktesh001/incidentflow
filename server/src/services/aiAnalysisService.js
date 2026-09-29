const { GoogleGenerativeAI } = require("@google/generative-ai");
const { logger } = require("../config/logger");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
const INCIDENTFLOW_API_BASE = process.env.INCIDENTFLOW_API_BASE || "http://localhost:5000";

const SEVERITY_WEIGHTS = { critical: 4, high: 3, medium: 2, low: 1 };
const STATUS_PRIORITY = { open: 4, investigating: 3, mitigated: 2, resolved: 1, closed: 0 };

const KNOWN_CATEGORIES = [
  "Database",
  "Network",
  "Compute / Resource Exhaustion",
  "Deployment / Release",
  "Third-Party Service / Dependency",
  "Authentication / Authorization",
  "Storage",
  "CDN / Edge",
  "Configuration Change",
  "Unknown / Needs Triage"
];

function buildFallbackRecommendations(incident) {
  const severity = (incident.severity || "low").toLowerCase();
  const service = incident.service || "unknown";
  const recs = [];

  recs.push({
    priority: 1,
    title: "Confirm impact scope",
    steps: [
      `Verify how many users/customers are affected by the ${service} incident`,
      "Check monitoring dashboards for error rate, latency, and saturation",
      "Post a status-page update if impact is customer-facing"
    ]
  });

  if (severity === "critical" || severity === "high") {
    recs.push({
      priority: 2,
      title: "Page on-call and open war-room channel",
      steps: [
        `Trigger PagerDuty/OpsGenie for the ${service} on-call rotation`,
        "Create a dedicated Slack incident channel and invite stakeholders",
        "Assign an Incident Commander (IC) and Scribe"
      ]
    });
    recs.push({
      priority: 3,
      title: "Rollback recent changes",
      steps: [
        "List last 3 deployments to this service in the past 24h",
        "Rollback to previous known-good release if a deploy correlates",
        "Compare feature-flag toggles that changed in the last hour"
      ]
    });
  } else if (severity === "medium") {
    recs.push({
      priority: 2,
      title: "Triage logs and recent events",
      steps: [
        `Search ${service} application logs for ERROR entries in the last 60 minutes`,
        "Cross-reference with any recent config changes or dependency updates",
        "Run health-checks against upstream dependencies"
      ]
    });
  } else {
    recs.push({
      priority: 2,
      title: "Low-severity auto-triage",
      steps: [
        "Verify if this is a known issue or false-positive alert",
        "Link to any existing runbook for this alert pattern",
        "Schedule for follow-up during business hours if not customer-impacting"
      ]
    });
  }

  recs.push({
    priority: recs.length + 1,
    title: "Post-incident review preparation",
    steps: [
      "Ensure all relevant events are captured in the incident timeline",
      "Export monitoring screenshots and logs once mitigated",
      `Open a blameless postmortem at ${INCIDENTFLOW_API_BASE}/#/incidents/${incident._id || incident.id || ""}`
    ]
  });

  return recs;
}

function buildFallbackSuggestedCommands(incident) {
  const service = incident.service || "app";
  return [
    { label: `Check ${service} pods`, command: `kubectl get pods -l app=${service} -o wide` },
    { label: `Tail ${service} errors`, command: `kubectl logs -l app=${service} --tail=200 --since=1h | grep -i error` },
    { label: `Recent deploys`, command: `kubectl rollout history deploy/${service}` },
    { label: `Resource usage`, command: `kubectl top pods -l app=${service}` }
  ];
}

function buildFallbackUsefulLinks(incident) {
  const service = incident.service || "app";
  const links = [];
  links.push({ label: "Incident Timeline", url: `${INCIDENTFLOW_API_BASE}/#/incidents/${incident._id || incident.id || ""}` });
  links.push({ label: `${service} Dashboard (Grafana)`, url: "http://localhost:3000/d/service-overview" });
  links.push({ label: "Error Tracker (Sentry)", url: "http://localhost:9000" });
  links.push({ label: "Runbooks", url: "http://localhost:8080/runbooks" });
  return links;
}

function guessCategoryHeuristically(incident) {
  const text = `${incident.title || ""} ${incident.description || ""} ${incident.service || ""}`.toLowerCase();
  if (/timeout|dns|latency|connection|ssl|tls|50[234]/.test(text)) return "Network";
  if (/out.?of.?memory|oom|cpu|disk|load average|throttl/.test(text)) return "Compute / Resource Exhaustion";
  if (/deploy|rollout|release|version|migrat/.test(text)) return "Deployment / Release";
  if (/postgres|mysql|mongo|redis|query|deadlock|connection pool/.test(text)) return "Database";
  if (/stripe|sendgrid|twilio|aws|gcp|azure|github|downstream/.test(text)) return "Third-Party Service / Dependency";
  if (/auth|jwt|token|login|permission|401|403|oauth/.test(text)) return "Authentication / Authorization";
  if (/s3|volume|disk|bucket|upload|download/.test(text)) return "Storage";
  if (/cdn|cloudfront|fastly|cache|edge/.test(text)) return "CDN / Edge";
  if (/config|feature.?flag|toggle|env var|environment variable/.test(text)) return "Configuration Change";
  return "Unknown / Needs Triage";
}

function severitySanityCheck(incident) {
  const title = (incident.title || "").toLowerCase();
  const description = (incident.description || "").toLowerCase();
  const combined = `${title} ${description}`;
  const declared = (incident.severity || "medium").toLowerCase();
  let suggested = declared;
  let reasons = [];

  if (/outage|down|completely.*broken|p0|sev.?0|data.*loss|data breach/.test(combined)) {
    suggested = "critical";
    reasons.push("Keywords suggesting outage/data-loss pattern");
  } else if (/broken|major|sev.?1|p1|errors.*spiking|5xx|elevated.*errors/.test(combined)) {
    suggested = "high";
    reasons.push("Keywords suggesting major customer impact or elevated errors");
  } else if (/minor|warning|degraded|intermittent/.test(combined)) {
    suggested = "medium";
    reasons.push("Keywords suggesting degraded/intermittent impact");
  } else if (/cosmetic|typo|non.*blocking|low.*priority|info/.test(combined)) {
    suggested = "low";
    reasons.push("Keywords suggesting non-blocking or cosmetic issue");
  }

  const isSane = suggested === declared;
  return {
    declaredSeverity: declared,
    suggestedSeverity: suggested,
    isSane,
    reasons: reasons.length ? reasons : (isSane ? ["No red flags found in title/description"] : ["Based on service and default heuristics"]),
    recommendation: isSane
      ? `Declared severity "${declared}" looks appropriate.`
      : `Consider re-classifying from "${declared}" → "${suggested}" based on title/description signals.`
  };
}

function priorityScore(incident) {
  const sev = SEVERITY_WEIGHTS[(incident.severity || "low").toLowerCase()] || 1;
  const st = STATUS_PRIORITY[(incident.status || "open").toLowerCase()] || 0;
  const timeOpenMs = Date.now() - new Date(incident.createdAt || Date.now()).getTime();
  const ageHours = Math.max(0, Math.floor(timeOpenMs / 3600000));
  const ageBonus = Math.min(ageHours, 6);
  return sev * 10 + st * 2 + ageBonus;
}

async function analyzeWithGemini(incident) {
  const prompt = `You are a Senior Site Reliability Engineer performing automated incident triage.

Analyze the incident below. Return STRICT VALID JSON with NO markdown fences, NO prose, NO extra text, ONLY a single JSON object with this exact schema:
{
  "category": (one of: ${KNOWN_CATEGORIES.map(c => `"${c}"`).join(", ")}),
  "summary": (1 short sentence, max 140 chars: what is broken and likely root cause),
  "severitySanity": {
    "declaredSeverity": (string, repeat declared severity),
    "suggestedSeverity": (string, "critical"|"high"|"medium"|"low"),
    "isSane": (boolean),
    "reasons": (array of strings, why the suggestion was made),
    "recommendation": (1 short sentence)
  },
  "recommendations": [
    { "priority": (number 1..N), "title": (string), "steps": (array of strings, 2-4 concrete bullets) }
  ],
  "suggestedCommands": [ { "label": (string), "command": (string) } ],
  "usefulLinks": [ { "label": (string), "url": (string) } ]
}

INCIDENT DATA:
- _id: ${incident._id || incident.id || ""}
- title: ${incident.title || ""}
- description: ${incident.description || ""}
- service: ${incident.service || ""}
- severity: ${incident.severity || "medium"}
- status: ${incident.status || "open"}
- createdAt: ${incident.createdAt || new Date().toISOString()}
`;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  let raw = response.text().trim();

  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(raw);

  if (!KNOWN_CATEGORIES.includes(parsed.category)) {
    parsed.category = "Unknown / Needs Triage";
  }
  if (!Array.isArray(parsed.recommendations)) parsed.recommendations = [];
  if (!Array.isArray(parsed.suggestedCommands)) parsed.suggestedCommands = [];
  if (!Array.isArray(parsed.usefulLinks)) parsed.usefulLinks = [];
  if (!parsed.severitySanity || typeof parsed.severitySanity !== "object") {
    parsed.severitySanity = severitySanityCheck(incident);
  } else {
    parsed.severitySanity.declaredSeverity = parsed.severitySanity.declaredSeverity || (incident.severity || "medium");
    if (!["critical", "high", "medium", "low"].includes(parsed.severitySanity.suggestedSeverity)) {
      parsed.severitySanity.suggestedSeverity = (incident.severity || "medium");
    }
    parsed.severitySanity.isSane = !!parsed.severitySanity.isSane;
    parsed.severitySanity.reasons = Array.isArray(parsed.severitySanity.reasons) ? parsed.severitySanity.reasons : [];
    parsed.severitySanity.recommendation = parsed.severitySanity.recommendation || "";
  }

  return parsed;
}

async function analyzeIncident(incident, options = {}) {
  if (!incident) {
    throw new Error("analyzeIncident requires an incident object");
  }

  const base = {
    ready: !!GEMINI_API_KEY,
    model: GEMINI_API_KEY ? GEMINI_MODEL : "heuristic-fallback",
    analyzedAt: new Date().toISOString(),
    incidentId: incident._id || incident.id || null,
    priorityScore: priorityScore(incident)
  };

  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim().length === 0) {
    if (options.log !== false) {
      logger.warn({ incidentId: base.incidentId }, "[ai-analysis] GEMINI_API_KEY not configured; returning heuristic-based fallback analysis");
    }
    return {
      ...base,
      source: "heuristic-fallback",
      category: guessCategoryHeuristically(incident),
      summary: `${(incident.service || "Service").replace(/^./, s => s.toUpperCase())} ${incident.status || "open"} incident (${incident.severity || "medium"}): ${incident.title || "Untitled"}`,
      severitySanity: severitySanityCheck(incident),
      recommendations: buildFallbackRecommendations(incident),
      suggestedCommands: buildFallbackSuggestedCommands(incident),
      usefulLinks: buildFallbackUsefulLinks(incident)
    };
  }

  try {
    const geminiResult = await analyzeWithGemini(incident);
    return {
      ...base,
      source: "gemini",
      ...geminiResult
    };
  } catch (err) {
    logger.error({ err, incidentId: base.incidentId }, "[ai-analysis] Gemini call failed; falling back to heuristics");
    return {
      ...base,
      source: "gemini-error-fallback",
      error: err.message ? String(err.message).slice(0, 200) : "Unknown error",
      category: guessCategoryHeuristically(incident),
      summary: `${(incident.service || "Service").replace(/^./, s => s.toUpperCase())} ${incident.status || "open"} incident (${incident.severity || "medium"}): ${incident.title || "Untitled"}`,
      severitySanity: severitySanityCheck(incident),
      recommendations: buildFallbackRecommendations(incident),
      suggestedCommands: buildFallbackSuggestedCommands(incident),
      usefulLinks: buildFallbackUsefulLinks(incident)
    };
  }
}

module.exports = {
  analyzeIncident,
  severitySanityCheck,
  guessCategoryHeuristically,
  priorityScore,
  buildFallbackRecommendations,
  KNOWN_CATEGORIES
};
