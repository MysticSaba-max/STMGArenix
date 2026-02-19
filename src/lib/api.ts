import { getTurnstileToken } from "./turnstile";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const SESSION_COOKIE = "vote_session";

let cachedFingerprint: string | null = null;

function getSessionToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setSessionToken(token: string) {
  const expires = new Date(Date.now() + 60 * 60 * 1000).toUTCString();
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; expires=${expires}; path=/; SameSite=Strict`;
}

function clearSessionToken() {
  document.cookie = `${SESSION_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
}

function isSessionError(message: string): boolean {
  return message.includes("Session invalide") || message.includes("Session expirée") || message.includes("Session non vérifiée");
}

async function renewSession(): Promise<boolean> {
  if (!cachedFingerprint) return false;
  try {
    const turnstileToken = await getTurnstileToken();
    const res = await fetch(`${API_BASE}/votes/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: turnstileToken, fingerprint: cachedFingerprint }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.sessionToken) {
      setSessionToken(data.sessionToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function request<T>(path: string, options?: RequestInit, _retry = false): Promise<T> {
  const token = localStorage.getItem("admin_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const session = getSessionToken();
  if (session) {
    headers["x-vote-session"] = session;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    const errorMsg = error.error || "Request failed";

    // Auto-renew session on 403 session errors (one retry)
    if (res.status === 403 && isSessionError(errorMsg) && !_retry) {
      clearSessionToken();
      const renewed = await renewSession();
      if (renewed) {
        return request<T>(path, options, true);
      }
    }

    throw new Error(errorMsg);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getSites: () => request<any[]>("/sites"),
  createSite: (data: { name: string; url: string; logo_path: string }) =>
    request<any>("/sites", { method: "POST", body: JSON.stringify(data) }),
  updateSite: (id: number, data: { name: string; url: string; logo_path: string }) =>
    request<any>(`/sites/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSite: (id: number) =>
    request<void>(`/sites/${id}`, { method: "DELETE" }),

  // Check if already verified (cookie exists)
  hasSession: () => !!getSessionToken(),

  // Store fingerprint for session auto-renewal
  setFingerprint: (fp: string) => { cachedFingerprint = fp; },

  // One-time Turnstile verification (tied to fingerprint)
  verifyTurnstile: async (fingerprint: string) => {
    cachedFingerprint = fingerprint;
    const turnstileToken = await getTurnstileToken();
    const result = await request<{ sessionToken: string }>("/votes/verify", {
      method: "POST",
      body: JSON.stringify({ token: turnstileToken, fingerprint }),
    });
    setSessionToken(result.sessionToken);
    return result;
  },

  vote: (data: { site_id: number; vote_type: string; fingerprint: string }) =>
    request<any>("/votes", { method: "POST", body: JSON.stringify(data) }),
  voteCategories: (data: { site_id: number; ratings: Record<string, number>; fingerprint: string }) =>
    request<any>("/votes/categories", { method: "POST", body: JSON.stringify(data) }),
  getMyVotes: (fingerprint: string) =>
    request<any>("/votes/mine", { method: "POST", body: JSON.stringify({ fingerprint }) }),
  getLeaderboard: () => request<any[]>("/leaderboard"),
  getCategoryLeaderboard: () => request<any>("/leaderboard/categories"),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  getStats: () => request<any>("/admin/stats"),
  adjustScores: (id: number, data: { upvoteAdjust: number }) =>
    request<any>(`/admin/scores/${id}`, { method: "PUT", body: JSON.stringify(data) }),
};
