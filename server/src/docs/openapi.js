module.exports = {
  openapi: "3.0.3",
  info: {
    title: "IncidentFlow API",
    version: "0.1.0",
    description:
      "Automated Incident & DevOps Response System — MongoDB + n8n + AI. " +
      "Authentication is optional. Set `AUTH_REQUIRED=true` in `.env` to enable. " +
      "When enabled, call `/api/auth/register` then `/api/auth/login` to receive a JWT, " +
      "and pass it as `Authorization: Bearer <token>`."
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Local development"
    }
  ],
  tags: [
    { name: "Health", description: "Service and connectivity checks" },
    { name: "Incidents", description: "Incident CRUD, stats, history, AI analysis" },
    { name: "Auth", description: "User registration, login, session info" },
    { name: "Users", description: "User directory (admin only)" },
    { name: "Webhooks", description: "Inbound integrations + n8n events" },
    { name: "Observability", description: "Metrics and telemetry" }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Service health + integration status",
        responses: {
          "200": {
            description: "Service is running",
            content: {
              "application/json": {
                example: {
                  status: "ok",
                  service: "incidentflow-api",
                  timestamp: "2025-09-29T08:00:00.000Z",
                  requestId: "xxxx-xxxx-xxxx",
                  auth: { required: false, authenticated: false, user: null },
                  integrations: {
                    n8nWebhook: "configured",
                    n8nApiKey: "not_configured",
                    gemini: "configured",
                    jwt: "configured"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/metrics": {
      get: {
        tags: ["Observability"],
        summary: "Prometheus metrics (request latency, error rate, default Node runtime)",
        responses: {
          "200": {
            description: "Prometheus text-format metrics",
            content: { "text/plain": {} }
          }
        }
      }
    },

    "/api/incidents": {
      get: {
        tags: ["Incidents"],
        summary: "List incidents with optional filters, search, pagination",
        parameters: [
          { in: "query", name: "status", schema: { type: "string" }, example: "open,investigating", description: "Comma-separated status(es)" },
          { in: "query", name: "severity", schema: { type: "string" }, example: "critical,high" },
          { in: "query", name: "service", schema: { type: "string" }, example: "checkout-api" },
          { in: "query", name: "search", schema: { type: "string" }, description: "Case-insensitive match on title/description" },
          { in: "query", name: "from", schema: { type: "string", format: "date" }, description: "ISO date, inclusive" },
          { in: "query", name: "to", schema: { type: "string", format: "date" } },
          { in: "query", name: "limit", schema: { type: "integer" }, example: 25 },
          { in: "query", name: "offset", schema: { type: "integer" }, example: 0 }
        ],
        responses: { "200": { description: "Array of incidents" } }
      },
      post: {
        tags: ["Incidents"],
        summary: "Create a new incident",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "description", "service"],
                properties: {
                  title: { type: "string", minLength: 3, maxLength: 200 },
                  description: { type: "string", minLength: 10 },
                  service: { type: "string", minLength: 2, maxLength: 100 },
                  severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                  status: { type: "string", enum: ["open", "investigating", "mitigated", "resolved", "closed"] }
                }
              },
              example: {
                title: "API latency spike on checkout",
                description: "p99 latency jumped from 120ms to 1.8s",
                service: "checkout-api",
                severity: "high"
              }
            }
          }
        },
        responses: {
          "201": { description: "Created" },
          "400": { description: "Validation error" }
        }
      }
    },

    "/api/incidents/stats": {
      get: {
        tags: ["Incidents"],
        summary: "Aggregate counts: total, openCritical, openHigh, byStatus, bySeverity, byService, createdToday, activeLast7Days",
        responses: { "200": { description: "Aggregate stats object" } }
      }
    },

    "/api/incidents/{id}": {
      parameters: [
        { in: "path", name: "id", required: true, schema: { type: "string" }, example: "000000000000000000000000" }
      ],
      get: { tags: ["Incidents"], summary: "Get one incident by ID", responses: { "200": {}, "400": {}, "404": {} } },
      put: {
        tags: ["Incidents"],
        summary: "Update an incident (title, description, service, severity, status). Triggers history + webhook.",
        requestBody: {
          content: {
            "application/json": {
              example: { status: "investigating", severity: "medium" }
            }
          }
        },
        responses: { "200": {}, "400": {}, "404": {} }
      },
      delete: {
        tags: ["Incidents"],
        summary: "Delete an incident and its history",
        responses: { "200": {}, "404": {} }
      }
    },

    "/api/incidents/{id}/history": {
      parameters: [
        { in: "path", name: "id", required: true, schema: { type: "string" } },
        { in: "query", name: "limit", schema: { type: "integer" } },
        { in: "query", name: "offset", schema: { type: "integer" } }
      ],
      get: {
        tags: ["Incidents"],
        summary: "Timeline of all changes / AI / webhook / automation events for an incident",
        responses: { "200": { description: "{total, entries: [...]}" } }
      }
    },

    "/api/incidents/{id}/ai-analysis": {
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Incidents"],
        summary: "Return latest AI analysis for the incident",
        responses: { "200": {}, "404": {} }
      },
      post: {
        tags: ["Incidents"],
        summary: "Re-run AI analysis now (Gemini if configured, heuristic fallback otherwise)",
        responses: { "200": {}, "404": {} }
      }
    },

    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user. First user in the DB is granted `admin` role, all others are `user`.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 6 },
                  name: { type: "string", minLength: 2, maxLength: 100 }
                }
              },
              example: { email: "alice@example.com", password: "good-password-123", name: "Alice SRE" }
            }
          }
        },
        responses: { "201": {}, "400": {}, "409": {} }
      }
    },

    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Exchange email + password for a JWT Bearer token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { email: "alice@example.com", password: "good-password-123" }
            }
          }
        },
        responses: { "200": {}, "400": {}, "401": {}, "429": { description: "Auth rate limited (15 / 15min per IP)" } }
      }
    },

    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Return the currently authenticated user (or authenticated=false if no token)",
        security: [{ BearerAuth: [] }],
        responses: { "200": {} }
      }
    },

    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "List all users (admin-only when AUTH_REQUIRED=true)",
        security: [{ BearerAuth: [] }],
        responses: { "200": {}, "401": {}, "403": {} }
      }
    },

    "/api/webhooks/n8n/incident": {
      post: {
        tags: ["Webhooks"],
        summary: "Inbound webhook from n8n. Can create or patch an incident.",
        requestBody: {
          content: {
            "application/json": {
              example: {
                title: "Inbound webhook incident",
                description: "Created by n8n via webhook",
                service: "n8n-test",
                severity: "medium",
                status: "open"
              }
            }
          }
        },
        responses: { "200": { description: "Incident created or patched" }, "400": {} }
      }
    },

    "/api/webhooks/n8n/workflow/events": {
      get: {
        tags: ["Webhooks"],
        summary: "List recent n8n automation events (outbound + inbound)",
        parameters: [
          { in: "query", name: "limit", schema: { type: "integer" }, example: 50 },
          { in: "query", name: "offset", schema: { type: "integer" }, example: 0 },
          { in: "query", name: "incidentId", schema: { type: "string" } }
        ],
        responses: { "200": {} }
      }
    }
  },

  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  }
};
