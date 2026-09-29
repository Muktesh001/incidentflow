import { useCallback, useEffect, useState } from "react";
import Dashboard from "./components/Dashboard.jsx";
import IncidentDetails from "./components/IncidentDetails.jsx";
import AuthPage from "./components/AuthPage.jsx";
import { getStoredUser, clearAuth, me as meApi } from "./api/auth.js";

const HASH_PREFIX = "#/incidents/";
const AUTH_HASH_PREFIX = "#/login";

function parseHash(hash) {
  if (!hash) return { view: "dashboard", incidentId: null };
  if (hash.startsWith(AUTH_HASH_PREFIX)) {
    return { view: "auth", incidentId: null };
  }
  if (hash.startsWith(HASH_PREFIX)) {
    const id = hash.slice(HASH_PREFIX.length).split("?")[0].split("#")[0];
    if (id && /^[a-fA-F0-9]{24}$/.test(id)) {
      return { view: "details", incidentId: id };
    }
  }
  return { view: "dashboard", incidentId: null };
}

export default function App() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [user, setUser] = useState(() => getStoredUser());
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    function onChange() {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await meApi();
        if (m && m.authenticated && m.user) {
          if (!cancelled) setUser(m.user);
        } else if (!m || !m.authRequired) {
          // no-op; keep stored user if any, or null
        } else {
          if (!cancelled) setUser(null);
        }
      } catch {
        // If auth-required mode and me fails, clear
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openIncident = useCallback((id) => {
    window.location.hash = `${HASH_PREFIX}${String(id)}`;
  }, []);

  const goDashboard = useCallback(() => {
    window.location.hash = "";
  }, []);

  const goLogin = useCallback(() => {
    window.location.hash = AUTH_HASH_PREFIX;
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    setUser(null);
    goDashboard();
  }, [goDashboard]);

  const handleAuthSuccess = useCallback((u) => {
    setUser(u);
    goDashboard();
  }, [goDashboard]);

  const showAuth = route.view === "auth";

  const appShell = (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {route.view === "details" && route.incidentId ? (
        <IncidentDetails
          incidentId={route.incidentId}
          onBack={goDashboard}
          afterDelete={goDashboard}
          authUser={user}
          onLogout={handleLogout}
          onGoLogin={goLogin}
        />
      ) : (
        <Dashboard
          onOpenIncident={openIncident}
          authUser={user}
          onLogout={handleLogout}
          onGoLogin={goLogin}
        />
      )}
    </div>
  );

  if (showAuth) {
    return (
      <AuthPage
        mode="login"
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  return appShell;
}
