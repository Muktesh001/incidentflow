import { useCallback, useEffect, useState } from "react";
import Dashboard from "./components/Dashboard.jsx";
import IncidentDetails from "./components/IncidentDetails.jsx";

const HASH_PREFIX = "#/incidents/";

function parseHash(hash) {
  if (!hash) return { view: "dashboard", incidentId: null };
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

  useEffect(() => {
    function onChange() {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const openIncident = useCallback((id) => {
    window.location.hash = `${HASH_PREFIX}${String(id)}`;
  }, []);

  const goDashboard = useCallback(() => {
    window.location.hash = "";
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {route.view === "details" && route.incidentId ? (
        <IncidentDetails
          incidentId={route.incidentId}
          onBack={goDashboard}
          afterDelete={goDashboard}
        />
      ) : (
        <Dashboard onOpenIncident={openIncident} />
      )}
    </div>
  );
}
