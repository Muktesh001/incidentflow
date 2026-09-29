export function SeverityBadge({ severity }) {
  if (!severity) return null;
  return (
    <span className={`badge badge-severity-${severity.toLowerCase()}`}>
      {severity}
    </span>
  );
}

export function StatusBadge({ status }) {
  if (!status) return null;
  return (
    <span className={`badge badge-status-${status.toLowerCase()}`}>
      {status}
    </span>
  );
}
