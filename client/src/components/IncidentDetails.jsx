import { useEffect, useMemo, useState } from "react";
import { getIncident, getIncidentHistory, updateIncident, deleteIncident, analyzeIncident } from "../api/incidents.js";
import { SeverityBadge, StatusBadge } from "./Badges.jsx";
import IncidentFormModal from "./IncidentFormModal.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

const SEVERITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "investigating", "mitigated", "resolved", "closed"];

function formatDate(value) {
  try {
    const d = new Date(value);
    return d.toLocaleString();
  } catch {
    return String(value);
  }
}

function relativeTime(value) {
  try {
    const diffMs = Date.now() - new Date(value).getTime();
    const s = Math.floor(diffMs / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return "";
  }
}

const TYPE_META = {
  created: { color: "bg-indigo-600/20 text-indigo-300", label: "Created", icon: "＋" },
  updated: { color: "bg-slate-600/30 text-slate-300", label: "Updated", icon: "↻" },
  status_changed: { color: "bg-amber-600/20 text-amber-300", label: "Status", icon: "⇄" },
  severity_changed: { color: "bg-rose-600/20 text-rose-300", label: "Severity", icon: "⚠" },
  automation: { color: "bg-violet-600/20 text-violet-300", label: "Automation", icon: "⚙" },
  note: { color: "bg-sky-600/20 text-sky-300", label: "Note", icon: "✎" }
};

function ActorBadge({ actor }) {
  if (!actor) return null;
  const tones = {
    system: "bg-slate-700/60 text-slate-300 ring-slate-600/50",
    n8n: "bg-violet-700/30 text-violet-300 ring-violet-600/40",
    user: "bg-emerald-700/30 text-emerald-300 ring-emerald-600/40"
  };
  const t = tones[actor.type] || tones.system;
  return (
    <span className={`badge ring-1 ring-inset ${t}`}>
      {actor.name || actor.id || actor.type}
    </span>
  );
}

function TimelineEntry({ entry }) {
  const meta = TYPE_META[entry.type] || {
    color: "bg-slate-700/30 text-slate-300",
    label: entry.type,
    icon: "•"
  };
  return (
    <li className="relative pl-10">
      <div className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-inset ring-slate-700 bg-slate-900 z-10">
        <span className={`h-2 w-2 rounded-full ${meta.color.split(" ")[1]?.includes("indigo") ? "bg-indigo-400" : meta.color.split(" ")[1]?.includes("amber") ? "bg-amber-400" : meta.color.split(" ")[1]?.includes("rose") ? "bg-rose-400" : meta.color.split(" ")[1]?.includes("violet") ? "bg-violet-400" : meta.color.split(" ")[1]?.includes("sky") ? "bg-sky-400" : "bg-slate-400"}`} />
      </div>
      <div className="pb-6 last:pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${meta.color} ring-1 ring-inset ring-slate-700/50`}>
            <span className="mr-1">{meta.icon}</span>
            {meta.label}
          </span>
          <ActorBadge actor={entry.actor} />
          <span className="text-xs text-slate-500 tabular-nums" title={formatDate(entry.timestamp)}>
            {relativeTime(entry.timestamp)} · {formatDate(entry.timestamp)}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-slate-200">{entry.summary}</p>
        {entry.changes && entry.changes.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {entry.changes.map((c, i) => (
              <div
                key={i}
                className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs"
              >
                <div className="flex items-start gap-3">
                  <span className="font-mono text-slate-400">{c.field}</span>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-[max-content_1fr] sm:gap-x-3">
                  {c.from !== null && c.from !== undefined && (
                    <>
                      <span className="text-slate-500">from</span>
                      <code className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-300 whitespace-pre-wrap break-words">
                        {String(c.from)}
                      </code>
                    </>
                  )}
                  {c.to !== null && c.to !== undefined && (
                    <>
                      <span className="text-slate-500">to</span>
                      <code className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300 whitespace-pre-wrap break-words">
                        {String(c.to)}
                      </code>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {entry.metadata && (
          <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
            <details>
              <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-300">
                metadata
              </summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-slate-400">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </li>
  );
}

const HISTORY_BATCH = 20;

export default function IncidentDetails({ incidentId, onBack, afterDelete }) {
  const [incident, setIncident] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_BATCH);
  const [historyError, setHistoryError] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [quickStatus, setQuickStatus] = useState(null);
  const [quickSeverity, setQuickSeverity] = useState(null);
  const [toast, setToast] = useState(null);

  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }

  async function loadIncident() {
    setLoading(true);
    setError(null);
    try {
      const data = await getIncident(incidentId);
      setIncident(data);
      setQuickStatus(data.status);
      setQuickSeverity(data.severity);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    setHistoryError(null);
    try {
      const data = await getIncidentHistory(incidentId, { limit: historyLimit });
      setHistory(data);
    } catch (err) {
      setHistoryError(err.message);
    }
  }

  useEffect(() => {
    if (!incidentId) return;
    loadIncident();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  useEffect(() => {
    if (!incidentId) return;
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId, historyLimit]);

  async function handleEdit(payload) {
    const updated = await updateIncident(incidentId, payload);
    setEditing(false);
    setIncident(updated);
    setQuickStatus(updated.status);
    setQuickSeverity(updated.severity);
    showToast("success", "Incident updated");
    await loadHistory();
  }

  async function handleQuickStatusChange(value) {
    if (!incident || value === incident.status) return;
    try {
      const updated = await updateIncident(incidentId, { status: value });
      setIncident(updated);
      setQuickStatus(updated.status);
      showToast("success", `Status → ${value}`);
      await loadHistory();
    } catch (err) {
      setQuickStatus(incident.status);
      showToast("error", err.message || "Failed to update status");
    }
  }

  async function handleQuickSeverityChange(value) {
    if (!incident || value === incident.severity) return;
    try {
      const updated = await updateIncident(incidentId, { severity: value });
      setIncident(updated);
      setQuickSeverity(updated.severity);
      showToast("success", `Severity → ${value}`);
      await loadHistory();
    } catch (err) {
      setQuickSeverity(incident.severity);
      showToast("error", err.message || "Failed to update severity");
    }
  }

  async function handleDelete() {
    try {
      await deleteIncident(incidentId);
      setConfirmDelete(false);
      showToast("success", "Incident deleted");
      afterDelete && afterDelete();
    } catch (err) {
      setConfirmDelete(false);
      showToast("error", err.message || "Failed to delete");
    }
  }

  async function runAnalysis() {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await analyzeIncident(incidentId);
      setAiAnalysis(result && result.analysis ? result.analysis : result);
      showToast("success", "Analysis complete");
    } catch (err) {
      setAiError(err.message || "Analysis failed");
      showToast("error", err.message || "Analysis failed");
    } finally {
      setAiLoading(false);
    }
  }

  const canLoadMoreHistory = useMemo(() => {
    if (!history) return false;
    return history.total > (history.entries?.length ?? 0);
  }, [history]);

  return (
    <div>
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              aria-label="Back to dashboard"
            >
              ←
            </button>
            <div className="min-w-0">
              <button
                onClick={onBack}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ← Dashboard
              </button>
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-100">
                {loading ? "Loading incident…" : error ? "Could not load incident" : incident?.title}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditing(true)}
              disabled={!incident}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={!incident}
              className="rounded-md border border-red-800/50 bg-red-600/10 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-600/20 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-1">
          {loading && <div className="card h-80 animate-pulse" />}
          {!loading && error && (
            <div className="card p-5 text-sm text-red-400">
              Failed to load: {error}
            </div>
          )}
          {!loading && !error && incident && (
            <>
              <div className="card p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={incident.severity} />
                  <StatusBadge status={incident.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">Service</div>
                    <div className="mt-0.5 text-slate-200">{incident.service}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">ID</div>
                    <div className="mt-0.5 font-mono text-xs text-slate-400 truncate" title={String(incident._id)}>
                      {String(incident._id)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">Created</div>
                    <div className="mt-0.5 text-slate-300 text-xs tabular-nums">{formatDate(incident.createdAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">Updated</div>
                    <div className="mt-0.5 text-slate-300 text-xs tabular-nums">{formatDate(incident.updatedAt)}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500">Description</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300 leading-relaxed">
                    {incident.description}
                  </p>
                </div>
              </div>

              <div className="card p-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                    Quick Status Change
                  </label>
                  <select
                    value={quickStatus || ""}
                    onChange={(e) => handleQuickStatusChange(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                    Quick Severity Change
                  </label>
                  <select
                    value={quickSeverity || ""}
                    onChange={(e) => handleQuickSeverityChange(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="lg:col-span-2 space-y-6">
          {!loading && !error && incident && (
            <div className="card">
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                    AI Incident Analysis
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {aiAnalysis
                      ? `Source: ${aiAnalysis.source} · Model: ${aiAnalysis.model} · Priority Score: ${aiAnalysis.priorityScore ?? "-"}`
                      : aiLoading
                      ? "Analyzing…"
                      : "Run automated SRE triage, severity sanity check, and remediation steps"}
                  </p>
                </div>
                <button
                  onClick={runAnalysis}
                  disabled={!incident || aiLoading}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {aiLoading ? "Running…" : aiAnalysis ? "Re-analyze" : "Run Analysis"}
                </button>
              </div>
              <div className="px-5 py-5">
                {aiLoading && (
                  <div className="space-y-3">
                    <div className="h-4 w-1/3 animate-pulse rounded bg-slate-800" />
                    <div className="h-24 animate-pulse rounded bg-slate-800/60" />
                    <div className="h-24 animate-pulse rounded bg-slate-800/60" />
                  </div>
                )}
                {!aiLoading && aiError && (
                  <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {aiError}
                  </div>
                )}
                {!aiLoading && !aiError && !aiAnalysis && (
                  <div className="py-8 text-center text-sm text-slate-500">
                    <p>No analysis yet. Click "Run Analysis" to generate AI-powered triage.</p>
                    <p className="mt-1 text-xs text-slate-600">
                      (Works without API key using rule-based heuristics; configure GEMINI_API_KEY for LLM quality)
                    </p>
                  </div>
                )}
                {!aiLoading && !aiError && aiAnalysis && (
                  <div className="space-y-5">
                    {aiAnalysis.summary && (
                      <div>
                        <div className="text-xs uppercase tracking-wider text-slate-500">Summary</div>
                        <p className="mt-1 text-sm text-slate-200">{aiAnalysis.summary}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-slate-500">Category</div>
                        <div className="mt-1 inline-flex items-center rounded-md bg-indigo-600/15 px-2.5 py-1 text-xs font-medium text-indigo-300 ring-1 ring-inset ring-indigo-600/30">
                          {aiAnalysis.category || "Unknown"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wider text-slate-500">Priority Score</div>
                        <div className="mt-1 font-mono text-lg font-semibold text-amber-300 tabular-nums">
                          {aiAnalysis.priorityScore ?? "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wider text-slate-500">Analyzed</div>
                        <div className="mt-1 text-xs text-slate-400 tabular-nums">
                          {aiAnalysis.analyzedAt ? formatDate(aiAnalysis.analyzedAt) : "-"}
                        </div>
                      </div>
                    </div>

                    {aiAnalysis.severitySanity && (
                      <div className={`rounded-md border p-4 ${
                        aiAnalysis.severitySanity.isSane
                          ? "border-emerald-700/40 bg-emerald-600/5"
                          : "border-amber-700/40 bg-amber-600/10"
                      }`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
                            Severity Sanity Check
                          </div>
                          <span className={`badge ring-1 ring-inset ${
                            aiAnalysis.severitySanity.isSane
                              ? "bg-status-resolved/20 text-status-resolved ring-status-resolved/40"
                              : "bg-severity-high/20 text-severity-high ring-severity-high/40"
                          }`}>
                            {aiAnalysis.severitySanity.isSane ? "PASS" : "REVIEW"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-200">
                          {aiAnalysis.severitySanity.recommendation}
                        </p>
                        {aiAnalysis.severitySanity.reasons && aiAnalysis.severitySanity.reasons.length > 0 && (
                          <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-slate-400">
                            {aiAnalysis.severitySanity.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="text-slate-500">Declared:</span>
                          <SeverityBadge severity={aiAnalysis.severitySanity.declaredSeverity} />
                          <span className="text-slate-500 ml-2">Suggested:</span>
                          <SeverityBadge severity={aiAnalysis.severitySanity.suggestedSeverity} />
                        </div>
                      </div>
                    )}

                    {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-wider text-slate-500">
                          Recommended Response ({aiAnalysis.recommendations.length})
                        </div>
                        <ol className="mt-2 space-y-3">
                          {aiAnalysis.recommendations.map((rec, i) => (
                            <li
                              key={i}
                              className="rounded-md border border-slate-800 bg-slate-900/40 p-3"
                            >
                              <div className="flex items-start gap-3">
                                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 text-xs font-bold text-indigo-200 ring-1 ring-inset ring-indigo-600/40 tabular-nums">
                                  {rec.priority ?? i + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-slate-100">
                                    {rec.title}
                                  </div>
                                  {rec.steps && rec.steps.length > 0 && (
                                    <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-slate-400">
                                      {rec.steps.map((s, j) => (
                                        <li key={j}>{s}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {aiAnalysis.suggestedCommands && aiAnalysis.suggestedCommands.length > 0 && (
                        <div>
                          <div className="text-xs uppercase tracking-wider text-slate-500">
                            Suggested Commands
                          </div>
                          <div className="mt-2 space-y-2">
                            {aiAnalysis.suggestedCommands.map((c, i) => (
                              <div
                                key={i}
                                className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2"
                              >
                                <div className="text-xs font-medium text-slate-300">{c.label}</div>
                                <code className="mt-1 block break-all font-mono text-xs text-emerald-300">
                                  {c.command}
                                </code>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {aiAnalysis.usefulLinks && aiAnalysis.usefulLinks.length > 0 && (
                        <div>
                          <div className="text-xs uppercase tracking-wider text-slate-500">
                            Useful Links
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {aiAnalysis.usefulLinks.map((l, i) => (
                              <a
                                key={i}
                                href={l.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-sky-300 hover:bg-slate-800/60 hover:text-sky-200"
                              >
                                🔗 {l.label}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {aiAnalysis.error && (
                      <div className="rounded-md border border-amber-700/40 bg-amber-600/10 px-3 py-2 text-xs text-amber-300">
                        ⚠️ LLM call failed; using heuristic fallback: {aiAnalysis.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                  Activity Timeline
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {history
                    ? `Showing ${history.entries?.length ?? 0} of ${history.total} events`
                    : "Loading events…"}
                </p>
              </div>
              <button
                onClick={loadHistory}
                className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
              >
                Refresh
              </button>
            </div>
            <div className="px-5 py-5">
              {!history && !historyError && (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-md bg-slate-800/60" />
                  ))}
                </div>
              )}
              {historyError && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  Failed to load timeline: {historyError}
                </div>
              )}
              {history && (
                <>
                  {history.entries && history.entries.length > 0 ? (
                    <>
                      <ol className="relative border-l border-slate-800 pl-2">
                        {history.entries.map((entry) => (
                          <TimelineEntry key={String(entry._id) || `${entry.timestamp}-${entry.type}`} entry={entry} />
                        ))}
                      </ol>
                      {canLoadMoreHistory && (
                        <div className="mt-4 flex justify-center">
                          <button
                            onClick={() => setHistoryLimit((l) => l + HISTORY_BATCH)}
                            className="rounded-md border border-slate-700 bg-slate-800 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
                          >
                            Load older events
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-10 text-center text-sm text-slate-500">
                      No history yet for this incident.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <IncidentFormModal
        open={editing}
        mode="edit"
        initial={incident}
        onSubmit={handleEdit}
        onCancel={() => setEditing(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this incident?"
        message={incident ? `You are about to permanently delete "${incident.title}". This cannot be undone.` : ""}
        confirmLabel="Delete Incident"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
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
