# IncidentFlow 🔴🟡🟢

Automated Incident & DevOps Response System.

An incident enters through the API → stored in MongoDB → broadcast to an **n8n** workflow for severity-based automation and **AI (Gemini + heuristic fallback) analysis** → timelined per-incident with full change history → managed from a React + Tailwind dashboard (login-protected by JWT, optional mode for local dev).

```
  Incident source (alert, manual, API, n8n webhook)
                    │
                    ▼
         IncidentFlow REST API (Express)
                    │
                    ▼
              MongoDB (mongo:7)
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
  n8n automation            AI incident analysis
  (severity routing,         (Gemini if key set,
   notifications)             heuristic fallback)
       │                         │
       └────────────┬────────────┘
                    ▼
      Incident timeline + automation history
                    │
                    ▼
        React + Tailwind dashboard
           (JWT auth, optional)
```

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js 20 + Express 4 |
| Database | MongoDB 7 (native driver, no ODM) |
| DevOps | Docker + Docker Compose |
| Automation | n8n |
| Auth | JWT (argon2id password hashing), optional-mode for local dev |
| AI | Google Gemini (`gemini-1.5-flash-latest`) with deterministic heuristic fallback |
| Observability | Pino JSON logs + X-Request-IDs + Prometheus `/metrics` |
| Testing | Jest + Supertest (34 tests) |
| API Docs | Swagger UI at `/api-docs` |
| Security | Helmet headers + env-configurable global + auth rate limiting |

---

## 5 ways to run IncidentFlow

### 1) Full Docker Compose (recommended for production / full stack)

Everything: MongoDB → API → n8n → React client (nginx).

```bash
cp .env.example .env
# Edit .env — at minimum, set a real JWT_SECRET and optionally GEMINI_API_KEY.

docker compose up -d --build
```

Ports:
- **http://localhost:8080** — React dashboard (nginx serves SPA + reverse proxies `/api` to API)
- **http://localhost:5000** — Express API
- **http://localhost:5000/api-docs** — Swagger UI
- **http://localhost:5678** — n8n UI (user: `admin`, password: `n8n-admin-change-in-production`)
- **mongodb://localhost:27017** — MongoDB

Stop:
```bash
docker compose down       # keep volumes
docker compose down -v    # wipe DB + n8n data
```

---

### 2) Local dev (frontend + backend hot reload, only MongoDB in Docker)

Terminal 1 (MongoDB):
```bash
docker compose up -d mongodb
```

Terminal 2 (API, port 5000):
```bash
cp .env.example .env      # if not done yet
cd server
npm install
npm start
```

Terminal 3 (React, port 5173):
```bash
cd client
npm install
npm run dev
```

Browse:
- Dashboard: http://localhost:5173
- API health: http://localhost:5000/health
- Swagger: http://localhost:5000/api-docs
- Prometheus metrics: http://localhost:5000/metrics

---

### 3) Local dev + n8n (full automation pipeline)

Same as #2 plus:
```bash
docker compose up -d n8n
# http://localhost:5678
```

Now import the workflow templates in `./n8n/*.json`:
- `receive-incident-webhook.json` → inbound webhook that creates an incident through the API
- `incident-response-workflow.json` → severity-based routing + notifications

In n8n: **Settings → API** → create an API key, then put it in `.env`:
```
N8N_API_KEY=<your-key>
N8N_WEBHOOK_URL=http://localhost:5678/webhook/incidentflow
```

---

### 4) Build + run locally (no Docker for Node)

```bash
cd server && npm install && npm start            # port 5000
cd client && npm install && npm run build        # ./client/dist
# Serve dist with any static server or mount in nginx
```

---

### 5) Run the tests

```bash
cd server
npm test            # run full suite (creates + drops incidentflow_test DB)
npm run test:watch  # watch mode
```

Expected output:
```
Test Suites: 3 passed, 3 total
Tests:       34 passed, 34 total
```

---

## Environment variables (`.env` at repo root)

See [`.env.example`](./.env.example) for the full list with comments. Key ones:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5000` | API port |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB URI (in docker-compose: `mongodb://mongodb:27017`) |
| `MONGO_DB_NAME` | `incidentflow` | DB (use `incidentflow_test` when running tests — it's set automatically via `npm test`) |
| `JWT_SECRET` | *set this!* | JWT signing secret (32+ chars strongly recommended) |
| `JWT_EXPIRES_IN` | `7d` | JWT TTL (vercel/ms syntax) |
| `AUTH_REQUIRED` | `false` | If `true`, every non-health endpoint needs a valid JWT. The `/api/auth/me` endpoint always works regardless. |
| `CORS_ORIGIN` | `*` | CORS origin(s), comma-separated |
| `LOG_LEVEL` | `info` | Pino level: `fatal` / `error` / `warn` / `info` / `debug` / `trace` |
| `NODE_ENV` | `development` | Set to `production` to enable Helmet CSP + HSTS |
| `GEMINI_API_KEY` | *(empty)* | If unset, AI endpoints use the deterministic heuristic fallback so they never fail. |
| `GEMINI_MODEL` | `gemini-1.5-flash-latest` | Gemini model name |
| `N8N_WEBHOOK_URL` | *(empty)* | Outbound broadcast: on every create/update we POST event payload here |
| `N8N_API_KEY` | *(empty)* | Reserved for future n8n-API integrations |
| `INCIDENTFLOW_API_BASE` | `http://localhost:5000` | Used by n8n templates so they know where to call us back |
| `RATE_LIMIT_WINDOW_SEC` / `RATE_LIMIT_MAX` | `60` / `600` | Global limiter (10 req/s per IP). Disabled in `NODE_ENV=test`. |
| `RATE_LIMIT_AUTH_WINDOW_SEC` / `RATE_LIMIT_AUTH_MAX` | `900` / `15` | Auth limiter (15 logins/registers / 15 min per IP). Disabled in test. |

---

## API (see http://localhost:5000/api-docs for the interactive version)

### Health & observability
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + integration status (JWT/n8n/Gemini configured?) |
| GET | `/metrics` | Prometheus scrape endpoint |
| GET | `/api-docs` | Swagger UI |
| GET | `/api-docs.json` | Raw OpenAPI 3.0.3 JSON |
| GET | `/` | Redirects to `/api-docs` |

### Incidents
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/incidents` | List + filter (`?status=open,investigating`, `?severity=`, `?service=`, `?search=`, `?from=`, `?to=`, `?limit=`, `?offset=`) |
| POST | `/api/incidents` | Create an incident |
| GET | `/api/incidents/stats` | Aggregate counts + dashboard card data |
| GET | `/api/incidents/:id` | Fetch one by ID |
| PUT | `/api/incidents/:id` | Patch incident (triggers n8n webhook + history entry) |
| DELETE | `/api/incidents/:id` | Delete incident + its history |
| GET | `/api/incidents/:id/history` | Timeline events (created, status change, automation, AI analysis, note, etc.) |
| GET | `/api/incidents/:id/ai-analysis` | Latest AI analysis |
| POST | `/api/incidents/:id/ai-analysis` | Re-run AI analysis now |

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register. **First user = admin role**, others = user role. |
| POST | `/api/auth/login` | Exchange email/password for a JWT Bearer token. |
| GET | `/api/auth/me` | Who am I? (Returns `{authenticated: false}` when no JWT is provided) |
| GET | `/api/users` | List all users — admin-only when `AUTH_REQUIRED=true`. |

### Webhooks / n8n
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/n8n/incident` | Inbound: n8n creates or patches an incident |
| GET | `/api/webhooks/n8n/workflow/events` | Automation event log (outbound + inbound) |

Valid incident severities: `critical`, `high`, `medium`, `low`.
Valid incident statuses: `open`, `investigating`, `mitigated`, `resolved`, `closed`.

---

## Production checklist

- `AUTH_REQUIRED=true`
- `NODE_ENV=production`
- Set `JWT_SECRET` to a real random 32+ char value (`openssl rand -hex 32`)
- Set `JWT_EXPIRES_IN=15m` (use a refresh token if you need longer sessions)
- `CORS_ORIGIN=https://app.yourdomain.com` (never `*`)
- Put the service behind a real reverse proxy (nginx / Cloudflare) — set `trust proxy` in Express (already done)
- Point Prometheus at `http://<api>:5000/metrics` and Grafana on top of Prometheus — `incidentflow_http_request_duration_ms` + `incidentflow_http_requests_total` + `incidentflow_http_errors_total` give you RED metrics by route
- Import the n8n templates in `./n8n/*.json` and configure Slack/email/PagerDuty credentials for the notification nodes
- Set real `GEMINI_API_KEY` for production-grade incident analysis summaries and recommendations
- Change the n8n admin password! It's hard-coded in `docker-compose.yml` for local-only convenience.
- Consider adding MongoDB user + password and volume backups

---

## Project structure

```
incidentflow/
├── client/                     # React + Vite + Tailwind dashboard
│   ├── Dockerfile              # Multi-stage: node build → nginx
│   ├── nginx.conf              # SPA fallback, gzip, /api proxy → api:5000
│   └── src/
│       ├── api/                # HTTP client for incidents + auth
│       ├── components/         # Dashboard, IncidentDetails, Badges, Forms, Modals, AuthPage
│       ├── App.jsx             # Router-like state: dashboard ↔ details ↔ auth page
│       └── main.jsx
│
├── server/                     # Express API
│   ├── Dockerfile              # node:20-alpine, runs as non-root
│   ├── jest.config.js
│   └── src/
│       ├── config/             # database.js, logger.js
│       ├── controllers/        # incidentController.js, userController.js
│       ├── middleware/         # auth.js, errorHandler.js, requestId.js, metrics.js
│       ├── models/             # (Plain MongoDB collections)
│       ├── routes/             # incidentRoutes.js, userRoutes.js, webhookRoutes.js
│       ├── services/           # aiAnalysisService.js, automationService.js,
│       │                         incidentHistoryService.js, n8nWebhookService.js
│       ├── docs/               # openapi.js (Swagger spec)
│       └── index.js            # createApp() + startServer()
│
├── tests/ (server/tests)       # Jest + Supertest (34 tests)
│   ├── setup.js                # Test DB lifecycle, supertest agent, per-test cleanup
│   ├── 01-health.test.js
│   ├── 02-incidents.test.js
│   └── 03-auth.test.js
│
├── n8n/                        # Workflow JSON templates
│   ├── receive-incident-webhook.json
│   └── incident-response-workflow.json
│
├── docker/                     # Reserved for future Dockerfile overrides / init scripts
├── docs/                       # Reserved for future architecture docs
│
├── .env.example                # Environment template (see list above)
├── .gitignore
├── docker-compose.yml          # mongodb, n8n, api (builds server/Dockerfile), client (builds client/Dockerfile)
└── README.md                   # This file
```

---

## Git history conventions

Each module was built and committed independently with a fine-grained, real GitHub history. Every commit was tested immediately before push. If you see something odd, `git bisect` + `cd server && npm test` should narrow it down quickly.

Enjoy IncidentFlow 🚒
