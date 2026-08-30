import { apiClient } from "./client.js";

export function listIncidents(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.append(key, value);
    }
  }
  const qs = query.toString();
  return apiClient.request(`/api/incidents${qs ? `?${qs}` : ""}`);
}

export function getIncident(id) {
  return apiClient.request(`/api/incidents/${id}`);
}

export function getIncidentStats() {
  return apiClient.request("/api/incidents/stats");
}

export function getIncidentHistory(id, options = {}) {
  const query = new URLSearchParams();
  if (options.limit !== undefined) query.append("limit", options.limit);
  if (options.offset !== undefined) query.append("offset", options.offset);
  const qs = query.toString();
  return apiClient.request(
    `/api/incidents/${id}/history${qs ? `?${qs}` : ""}`
  );
}

export function createIncident(payload) {
  return apiClient.request("/api/incidents", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateIncident(id, payload) {
  return apiClient.request(`/api/incidents/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteIncident(id) {
  return apiClient.request(`/api/incidents/${id}`, {
    method: "DELETE"
  });
}

export function healthCheck() {
  return apiClient.request("/health");
}
