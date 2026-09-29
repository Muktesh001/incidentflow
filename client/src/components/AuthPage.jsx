import { useEffect, useState } from "react";
import { login, register, setAuth } from "../api/auth.js";

export default function AuthPage({ onAuthSuccess, mode: initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "user"
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitInfo, setSubmitInfo] = useState(null);

  useEffect(() => {
    setErrors({});
    setSubmitError(null);
    setSubmitInfo(null);
  }, [mode]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
    }
  }

  function validate() {
    const e = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || ""))
      e.email = "Valid email is required";
    if (!form.password || form.password.length < 6)
      e.password = "Password must be at least 6 characters";
    if (mode === "register" && form.name && form.name.trim().length < 2)
      e.name = "Name must be at least 2 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitInfo(null);
    try {
      const payload = { email: form.email.trim(), password: form.password };
      if (mode === "register") {
        if (form.name) payload.name = form.name.trim();
      }
      const result = mode === "login" ? await login(payload) : await register(payload);
      if (result && result.token && result.user) {
        setAuth(result.token, result.user);
        if (mode === "register" && result.user.role === "admin") {
          setSubmitInfo("First account created — granted admin role.");
        }
        setTimeout(() => onAuthSuccess && onAuthSuccess(result.user), mode === "register" ? 400 : 0);
      } else {
        throw new Error("Invalid server response");
      }
    } catch (err) {
      setSubmitError(err.message || "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold">
            IF
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">IncidentFlow</h1>
            <p className="text-xs text-slate-400">
              {mode === "login" ? "Sign in to continue" : "Create your account"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Jane SRE"
                disabled={submitting}
                className={`w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                  errors.name
                    ? "border-red-500/70 focus:ring-red-500/40"
                    : "border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/30"
                }`}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-400">{errors.name}</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="sre@company.com"
              disabled={submitting}
              autoComplete="email"
              className={`w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                errors.email
                  ? "border-red-500/70 focus:ring-red-500/40"
                  : "border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/30"
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-400">{errors.email}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
              Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder="min 6 characters"
              disabled={submitting}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={`w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                errors.password
                  ? "border-red-500/70 focus:ring-red-500/40"
                  : "border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/30"
              }`}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-400">{errors.password}</p>
            )}
          </div>

          {submitError && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {submitError}
            </div>
          )}
          {submitInfo && (
            <div className="rounded-md border border-emerald-700/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-300">
              {submitInfo}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting
              ? "Please wait…"
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4 text-xs">
          <span className="text-slate-500">
            {mode === "login"
              ? "No account yet?"
              : "Already have an account?"}
          </span>
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            disabled={submitting}
            className="font-medium text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-600">
          First user registered automatically gets the <span className="font-semibold">admin</span> role.
        </p>
      </div>
    </div>
  );
}
