import { useEffect, useMemo, useState } from "react";
import { getIncidentStats, listIncidents, healthCheck, createIncident, updateIncident, deleteIncident } from "../api/incidents.js";
import { SeverityBadge, StatusBadge } from "./Badges.jsx";
import IncidentFormModal from "./IncidentFormModal.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "investigating", "mitigated", "resolved", "closed"];
const PAGE_SIZE = 25;

function formatDate(value) {
  try {
    const d = new Date(value);
    return d.toLocaleString();
  } catch {
    return String(value);
  }
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

export default function Dashboard({ onOpenIncident, authUser, onLogout, onGoLogin }) {
  const [stats, setStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [incidentsTotal, setIncidentsTotal] = useState(null);
  const [apiStatus, setApiStatus] = useState({
    ok: false,
    loading: true,
    error: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    search: "",
    severity: [],
    status: [],
    service: "",
    from: "",
    to: ""
  });
  const [filtersDraft, setFiltersDraft] = useState(filters);
  const [page, setPage] = useState(0);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }

  function toggleList(list, value) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function resetFilters() {
    const fresh = { search: "", severity: [], status: [], service: "", from: "", to: "" };
    setFilters(fresh);
    setFiltersDraft(fresh);
    setPage(0);
  }

  function applyFilters() {
    setFilters(filtersDraft);
    setPage(0);
  }

  const offset = page * PAGE_SIZE;
  const activeFilters = useMemo(() => {
    const f = {};
    if (filters.search) f.search = filters.search;
    if (filters.severity.length) f.severity = filters.severity.join(",");
    if (filters.status.length) f.status = filters.status.join(",");
    if (filters.service) f.service = filters.service;
    if (filters.from) f.from = filters.from;
    if (filters.to) f.to = filters.to;
    return f;
  }, [filters]);

  const serviceOptions = useMemo(() => {
    if (!stats || !stats.byService) return [];
    return Object.keys(stats.byService).sort();
  }, [stats]);

  const hasAnyFilter =
    !!filters.search ||
    filters.severity.length > 0 ||
    filters.status.length > 0 ||
    !!filters.service ||
    !!filters.from ||
    !!filters.to;

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
        listIncidents({ ...activeFilters, limit: PAGE_SIZE, offset })
      ]);
      setStats(s);
      if (Array.isArray(list)) {
        setIncidents(list || []);
        setIncidentsTotal(list.length < PAGE_SIZE ? offset + list.length : null);
      } else if (list && Array.isArray(list.entries)) {
        setIncidents(list.entries || []);
        setIncidentsTotal(list.total ?? null);
      } else {
        setIncidents([]);
        setIncidentsTotal(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activeFilters), page]);

  async function handleCreate(payload) {
    await createIncident(payload);
    setCreating(false);
    showToast("success", "Incident created");
    await loadAll();
  }

  async function handleUpdate(payload) {
    if (!editing) return;
    await updateIncident(editing._id, payload);
    setEditing(null);
    showToast("success", "Incident updated");
    await loadAll();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const id = confirmDelete._id;
    try {
      await deleteIncident(id);
      showToast("success", `Deleted: ${confirmDelete.title}`);
    } finally {
      setConfirmDelete(null);
      await loadAll();
    }
  }

  const sortedIncidents = [...incidents].sort((a, b) => {
    const sev =
      (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    if (sev !== 0) return sev;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return (
    <div>
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
            {authUser ? (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600/80 text-xs font-semibold">
                  {String(authUser.name || authUser.email || "?").slice(0,1).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-medium text-slate-100">
                    {authUser.name || authUser.email}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    {authUser.role || "user"}
                  </p>
                </div>
                <button
                  onClick={onLogout}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={onGoLogin}
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700"
              >
                Sign In
              </button>
            )}
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
                offline
              </span>
            )}
            <button
              onClick={loadAll}
              disabled={loading}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button
              onClick={() => setCreating(true)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              + New Incident
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

        <section className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                Filters
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {hasAnyFilter
                  ? `${filters.severity.length + filters.status.length + (filters.service ? 1 : 0) + (filters.search ? 1 : 0) + ((filters.from || filters.to) ? 1 : 0)} filter${"s"} active`
                  : "No active filters — showing all incidents"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasAnyFilter}
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                Apply Filters
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                Search
              </label>
              <input
                type="text"
                value={filtersDraft.search}
                onChange={(e) =>
                  setFiltersDraft((f) => ({ ...f, search: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
                placeholder="Search title or description…"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                Service
              </label>
              <select
                value={filtersDraft.service}
                onChange={(e) =>
                  setFiltersDraft((f) => ({ ...f, service: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="">All services</option>
                {serviceOptions.map((svc) => (
                  <option key={svc} value={svc}>
                    {svc}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                  From
                </label>
                <input
                  type="date"
                  value={filtersDraft.from}
                  onChange={(e) =>
                    setFiltersDraft((f) => ({ ...f, from: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                  To
                </label>
                <input
                  type="date"
                  value={filtersDraft.to}
                  onChange={(e) =>
                    setFiltersDraft((f) => ({ ...f, to: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-400">
                Severity
              </div>
              <div className="flex flex-wrap gap-2">
                {SEVERITIES.map((s) => {
                  const active = filtersDraft.severity.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setFiltersDraft((f) => ({
                          ...f,
                          severity: toggleList(f.severity, s)
                        }))
                      }
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
                        active ? "" : "opacity-60 hover:opacity-100"
                      }`}
                    >
                      <SeverityBadge severity={s} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-400">
                Status
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => {
                  const active = filtersDraft.status.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setFiltersDraft((f) => ({
                          ...f,
                          status: toggleList(f.status, s)
                        }))
                      }
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
                        active ? "" : "opacity-60 hover:opacity-100"
                      }`}
                    >
                      <StatusBadge status={s} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Incidents
              {!loading && incidents.length > 0 && (
                <span className="ml-2 text-slate-500">
                  (showing {incidents.length}
                  {incidentsTotal !== null
                    ? ` of ${incidentsTotal}`
                    : ""}
                  {hasAnyFilter ? " — filtered" : ""})
                </span>
              )}
            </h2>
            {hasAnyFilter && (
              <span className="badge bg-indigo-600/15 text-indigo-300 ring-1 ring-inset ring-indigo-600/30">
                Filters active
              </span>
            )}
          </div>

          {loading ? (
            <div className="card divide-y divide-slate-800">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse" />
              ))}
            </div>
          ) : sortedIncidents.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">
              {hasAnyFilter ? (
                <>
                  <p>No incidents match your filters.</p>
                  <button
                    onClick={resetFilters}
                    className="mt-3 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p>No incidents yet.</p>
                  <button
                    onClick={() => setCreating(true)}
                    className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
                  >
                    Create the first incident
                  </button>
                </>
              )}
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
                    <th className="px-5 py-3 font-semibold text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {sortedIncidents.map((inc) => (
                    <tr key={inc._id} className="hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <SeverityBadge severity={inc.severity} />
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => onOpenIncident && onOpenIncident(inc._id)}
                          className="text-left font-medium text-slate-100 hover:text-indigo-400"
                        >
                          {inc.title}
                        </button>
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
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => onOpenIncident && onOpenIncident(inc._id)}
                            className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => setEditing(inc)}
                            className="rounded-md border border-indigo-700/50 bg-indigo-600/20 px-2.5 py-1 text-xs text-indigo-300 hover:bg-indigo-600/30"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setConfirmDelete(inc)}
                            className="rounded-md border border-red-800/50 bg-red-600/10 px-2.5 py-1 text-xs text-red-400 hover:bg-red-600/20"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(page > 0 || incidents.length >= PAGE_SIZE) && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-400 tabular-nums">
                Page {page + 1}
                {incidentsTotal !== null && (
                  <> · of {Math.max(1, Math.ceil(incidentsTotal / PAGE_SIZE))}</>
                )}
                <span className="ml-2 text-slate-500">
                  ({offset + 1}–{offset + incidents.length}
                  {incidentsTotal !== null ? ` / ${incidentsTotal}` : ""})
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                  className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={incidents.length < PAGE_SIZE || loading}
                  className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        IncidentFlow — v0.1 (early access)
      </footer>

      <IncidentFormModal
        open={creating}
        mode="create"
        onSubmit={handleCreate}
        onCancel={() => setCreating(false)}
      />
      <IncidentFormModal
        open={!!editing}
        mode="edit"
        initial={editing}
        onSubmit={handleUpdate}
        onCancel={() => setEditing(null)}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete this incident?"
        message={
          confirmDelete
            ? `You are about to permanently delete "${confirmDelete.title}". This cannot be undone.`
            : ""
        }
        confirmLabel="Delete Incident"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in">
          <div
            className={`card px-4 py-3 text-sm shadow-xl ${
              toast.type === "success"
                ? "border-emerald-700/60 bg-emerald-600/15 text-emerald-300"
                : "border-red-700/60 bg-red-600/15 text-red-300"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
