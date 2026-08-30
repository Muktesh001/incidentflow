import { useEffect, useState } from "react";
import { getIncidentStats, listIncidents, healthCheck } from "./api/incidents.js";

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function formatDate(value) {
  try {
    const d = new Date(value);
    return d.toLocaleString();
  } catch {
    return String(value);
  }
}

function SeverityBadge({ severity }) {
  if (!severity) return null;
  return (
    <span className={`badge badge-severity-${severity.toLowerCase()}`}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }) {
  if (!status) return null;
  return (
    <span className={`badge badge-status-${status.toLowerCase()}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value, tone = "default" }) {
  const tones = {
    default: "text-slate-100",
    critical: "text-severity-critical",
    high: "text-severity-high",
    accent: "text-indigo-400"
  };
  return (
    <div className="card p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

export default function App() {
  const [stats, setStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [apiStatus, setApiStatus] = useState({
    ok: false,
    loading: true,
    error: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const h = await healthCheck();
      setApiStatus({ ok: h.status === "ok", loading: false, error: null });
    } catch (err) {
      setApiStatus({ ok: false, loading: false, error: err.message });
    }
    try {
      const [s, list] = await Promise.all([
        getIncidentStats(),
        listIncidents({ limit: 20 })
      ]);
      setStats(s);
      setIncidents(list || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const sortedIncidents = [...incidents].sort((a, b) => {
    const sev =
      (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    if (sev !== 0) return sev;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold">
              IF
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                IncidentFlow
              </h1>
              <p className="text-xs text-slate-400">
                Automated Incident & DevOps Response
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">API</span>
            {apiStatus.loading ? (
              <span className="badge bg-slate-700/40 text-slate-300 ring-1 ring-inset ring-slate-600/40">
                checking…
              </span>
            ) : apiStatus.ok ? (
              <span className="badge bg-status-resolved/20 text-status-resolved ring-1 ring-inset ring-status-resolved/40">
                connected
              </span>
            ) : (
              <span className="badge bg-status-open/20 text-status-open ring-1 ring-inset ring-status-open/40">
                offline: {apiStatus.error || "unknown"}
              </span>
            )}
            <button
              onClick={loadAll}
              disabled={loading}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Overview
          </h2>
          {loading && !stats ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="card h-24 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="card p-5 text-sm text-red-400">
              Failed to load dashboard: {error}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Incidents" value={stats?.total ?? 0} tone="accent" />
              <StatCard
                label="Open Critical"
                value={stats?.openCritical ?? 0}
                tone="critical"
              />
              <StatCard
                label="Open High"
                value={stats?.openHigh ?? 0}
                tone="high"
              />
              <StatCard
                label="Affected Services"
                value={Object.keys(stats?.byService ?? {}).length}
              />
            </div>
          )}
        </section>

        {stats && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                By Status
              </h3>
              <ul className="space-y-2">
                {Object.entries(stats.byStatus || {}).map(([key, count]) => (
                  <li key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={key} />
                      <span className="capitalize text-sm text-slate-300">
                        {key}
                      </span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                By Severity
              </h3>
              <ul className="space-y-2">
                {Object.entries(stats.bySeverity || {}).map(([key, count]) => (
                  <li key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={key} />
                      <span className="capitalize text-sm text-slate-300">
                        {key}
                      </span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Recent Incidents
              {!loading && incidents.length > 0 && (
                <span className="ml-2 text-slate-500">
                  ({incidents.length}{" "}
                  {incidents.length === 1 ? "incident" : "incidents"})
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <div className="card divide-y divide-slate-800">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse" />
              ))}
            </div>
          ) : sortedIncidents.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">
              No incidents yet. Create one via{" "}
              <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                POST /api/incidents
              </code>{" "}
              to see it here.
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                <thead className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Severity</th>
                    <th className="px-5 py-3 font-semibold">Title</th>
                    <th className="px-5 py-3 font-semibold">Service</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {sortedIncidents.map((inc) => (
                    <tr key={inc._id} className="hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <SeverityBadge severity={inc.severity} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-100">
                          {inc.title}
                        </div>
                        <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                          {inc.description}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-300">{inc.service}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={inc.status} />
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400 tabular-nums">
                        {formatDate(inc.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        IncidentFlow — v0.1 (early access)
      </footer>
    </div>
  );
}
