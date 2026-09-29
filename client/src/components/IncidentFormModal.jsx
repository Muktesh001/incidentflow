import { useEffect, useState } from "react";
import { SeverityBadge, StatusBadge } from "./Badges.jsx";

const SEVERITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "investigating", "mitigated", "resolved", "closed"];

const EMPTY = {
  title: "",
  description: "",
  service: "",
  severity: "medium"
};

function validate(data, mode) {
  const errors = {};
  if (!data.title || data.title.trim().length === 0) {
    errors.title = "Title is required";
  } else if (data.title.trim().length < 3) {
    errors.title = "Title must be at least 3 characters";
  }
  if (!data.description || data.description.trim().length === 0) {
    errors.description = "Description is required";
  }
  if (!data.service || data.service.trim().length === 0) {
    errors.service = "Service is required";
  }
  if (data.severity !== undefined && !SEVERITIES.includes(data.severity)) {
    errors.severity = "Invalid severity";
  }
  if (mode === "edit" && data.status !== undefined && !STATUSES.includes(data.status)) {
    errors.status = "Invalid status";
  }
  return errors;
}

export default function IncidentFormModal({ open, mode = "create", initial = null, submitLabel, onSubmit, onCancel }) {
  const [data, setData] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setData({
        title: initial.title ?? "",
        description: initial.description ?? "",
        service: initial.service ?? "",
        severity: initial.severity ?? "medium",
        status: initial.status ?? "open"
      });
    } else {
      setData({ ...EMPTY });
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(false);
  }, [open, mode, initial]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape" && !submitting) onCancel && onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  function setField(key, value) {
    setData((d) => ({ ...d, [key]: value }));
    if (errors[key]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = validate(data, mode);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = { ...data };
      if (mode === "create") {
        // Don't include status on create — backend defaults to "open"
        delete payload.status;
      }
      await onSubmit(payload);
    } catch (err) {
      setSubmitError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "create" ? "Create New Incident" : "Edit Incident";
  const label = submitLabel || (mode === "create" ? "Create Incident" : "Save Changes");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="card w-full max-w-lg shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
            <p className="mt-1 text-xs text-slate-400">
              {mode === "create"
                ? "Report a new incident to the response system."
                : "Update incident details, status, or severity."}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
              Title *
            </label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Short summary of what happened"
              disabled={submitting}
              className={`w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                errors.title
                  ? "border-red-500/70 focus:ring-red-500/40"
                  : "border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/30"
              }`}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-400">{errors.title}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
              Description *
            </label>
            <textarea
              rows={4}
              value={data.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="What happened, when, impact observed..."
              disabled={submitting}
              className={`w-full resize-y rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                errors.description
                  ? "border-red-500/70 focus:ring-red-500/40"
                  : "border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/30"
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-400">
                {errors.description}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
              Service *
            </label>
            <input
              type="text"
              value={data.service}
              onChange={(e) => setField("service", e.target.value)}
              placeholder="e.g. payments-api, auth-service"
              disabled={submitting}
              className={`w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                errors.service
                  ? "border-red-500/70 focus:ring-red-500/40"
                  : "border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/30"
              }`}
            />
            {errors.service && (
              <p className="mt-1 text-xs text-red-400">{errors.service}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                Severity
              </label>
              <select
                value={data.severity}
                onChange={(e) => setField("severity", e.target.value)}
                disabled={submitting}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
              <div className="mt-1.5">
                <SeverityBadge severity={data.severity} />
              </div>
            </div>

            {mode === "edit" && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status
                </label>
                <select
                  value={data.status}
                  onChange={(e) => setField("status", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
                <div className="mt-1.5">
                  <StatusBadge status={data.status} />
                </div>
              </div>
            )}
          </div>

          {submitError && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {submitError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Saving…" : label}
          </button>
        </div>
      </form>
    </div>
  );
}
