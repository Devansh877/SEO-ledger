const BASE = "/api"; // proxied to the Node backend via next.config.js rewrites

function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("token");
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// Separate from request() because a PDF response isn't JSON — this fetches
// the raw bytes, still with the same auth header, and triggers a normal
// browser file download rather than returning parsed data.
async function downloadFile(path, suggestedName) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || "Download failed");
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = (match && match[1]) || suggestedName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/auth/me"),
  listClients: () => request("/clients"),
  getClient: (id) => request(`/clients/${id}`),
  createClient: (data) => request("/clients", { method: "POST", body: JSON.stringify(data) }),
  updateClient: (id, data) => request(`/clients/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  // Requires the exact client name as confirmation — the server rejects the
  // call without it, since this destroys captured history that cannot be
  // re-fetched from any API.
  deleteClient: (id, confirmName) =>
    request(`/clients/${id}?confirm=${encodeURIComponent(confirmName)}`, { method: "DELETE" }),
  setAccess: (clientId, moduleCode, granted) =>
    request(`/access/${clientId}/${moduleCode}`, {
      method: "PUT",
      body: JSON.stringify({ granted }),
    }),
  ga4: (clientId) => request(`/reports/${clientId}/ga4`),
  keywords: (clientId) => request(`/reports/${clientId}/keywords`),
  gmb: (clientId) => request(`/reports/${clientId}/gmb`),
  conversions: (clientId) => request(`/reports/${clientId}/conversions`),
  listTrackedKeywords: (clientId) => request(`/settings/${clientId}/keywords`),
  addTrackedKeyword: (clientId, keyword, location, device) =>
    request(`/settings/${clientId}/keywords`, { method: "POST", body: JSON.stringify({ keyword, location, device }) }),
  removeTrackedKeyword: (clientId, id) =>
    request(`/settings/${clientId}/keywords/${id}`, { method: "DELETE" }),
  refreshKeywords: (clientId) =>
    request(`/settings/${clientId}/keywords/refresh`, { method: "POST" }),
  addManualRanking: (clientId, keywordId, position, searchVolume, note) =>
    request(`/settings/${clientId}/keywords/${keywordId}/manual`, {
      method: "POST",
      body: JSON.stringify({ position, searchVolume, note }),
    }),
  getStatus: (clientId) => request(`/settings/${clientId}/status`),

  // --- Google connections & property discovery ---
  // startGoogleConnect returns a consent URL rather than redirecting, so the
  // caller can open it in a popup and keep the admin's place in the UI.
  // Pass no clientId for an agency-wide connection usable by every client.
  startGoogleConnect: (clientId) =>
    request(`/oauth/google/start${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`),
  listGoogleConnections: () => request("/oauth/google/connections"),
  removeGoogleConnection: (id) => request(`/oauth/google/connections/${id}`, { method: "DELETE" }),
  googleProperties: (clientId) => request(`/integrations/${clientId}/google/properties`),
  saveGoogleSelection: (clientId, selection) =>
    request(`/integrations/${clientId}/google/selection`, {
      method: "PUT",
      body: JSON.stringify(selection),
    }),
  refreshAll: (clientId) =>
    request(`/settings/${clientId}/refresh-all`, { method: "POST" }),
  downloadReportPdf: (clientId, clientName) =>
    downloadFile(`/reports/${clientId}/export.pdf`, `${clientName || "client"}-report.pdf`),
};
