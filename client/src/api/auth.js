import { apiClient } from "./client.js";

const TOKEN_KEY = "incidentflow.token";
const USER_KEY = "incidentflow.user";

export function setAuth(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, String(token));
  else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function login(payload) {
  return apiClient.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function register(payload) {
  return apiClient.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function me() {
  return apiClient.request("/api/auth/me");
}
