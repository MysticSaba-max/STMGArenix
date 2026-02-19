import { getTurnstileToken } from "./turnstile";
import { collectBotSignals, computeBotScore } from "./botDetection";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const SESSION_COOKIE = "vote_session";

let cachedFingerprint: string | null = null;
let cachedBotScore = 0;

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
  return (
    message.includes("Session invalide") ||
    message.includes("Session expirée") ||
    message.includes("Session non vérifiée")
  );
}

async function renewSession(): Promise<boolean> {
  if (!cachedFingerprint) return false;
  try {
    const [turnstileToken, botSignals] = await Promise.all([
      getTurnstileToken(),
      collectBotSignals(),
    ]);
    cachedBotScore = computeBotScore(botSignals);

    const res = await fetch(`${API_BASE}/votes/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: turnstileToken, fingerprint: cachedFingerprint, botSignals }),
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
    "x-bot-score": String(cachedBotScore),
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

    const err = new Error(errorMsg) as Error & { code?: string };
    if (error.code) err.code = error.code;
    throw err;
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

  hasSession: () => !!getSessionToken(),
  setFingerprint: (fp: string) => {
    cachedFingerprint = fp;
  },

  // Vérification Turnstile + envoi des signaux bot au serveur
  verifyTurnstile: async (fingerprint: string) => {
    cachedFingerprint = fingerprint;

    const [turnstileToken, botSignals] = await Promise.all([
      getTurnstileToken(),
      collectBotSignals(),
    ]);
    cachedBotScore = computeBotScore(botSignals);

    const result = await request<{ sessionToken: string }>("/votes/verify", {
      method: "POST",
      body: JSON.stringify({ token: turnstileToken, fingerprint, botSignals }),
    });
    setSessionToken(result.sessionToken);
    return result;
  },

  vote: (data: { site_id: number; vote_type: string; fingerprint: string }) =>
    request<any>("/votes", { method: "POST", body: JSON.stringify(data) }),
  voteCategories: (data: {
    site_id: number;
    ratings: Record<string, number>;
    fingerprint: string;
  }) => request<any>("/votes/categories", { method: "POST", body: JSON.stringify(data) }),
  getMyVotes: (fingerprint: string) =>
    request<any>("/votes/mine", { method: "POST", body: JSON.stringify({ fingerprint }) }),
  getLeaderboard: () => request<any[]>("/leaderboard"),
  getCategoryLeaderboard: () => request<any>("/leaderboard/categories"),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  getStats: () => request<any>("/admin/stats"),
  adjustScores: (id: number, data: { upvoteAdjust: number }) =>
    request<any>(`/admin/scores/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // Upload de logo (multipart/form-data — ne passe pas par request())
  uploadLogo: async (file: File): Promise<{ path: string }> => {
    const token = localStorage.getItem("admin_token");
    const formData = new FormData();
    formData.append("logo", file);
    const res = await fetch(`${API_BASE}/upload/logo`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload échoué" }));
      throw new Error(err.error || "Upload échoué");
    }
    return res.json();
  },

  // Propositions de sites
  submitProposal: (data: { name: string; url: string; logo_path: string }) =>
    request<{ success: boolean }>("/proposals", { method: "POST", body: JSON.stringify(data) }),

  uploadProposalLogo: async (file: File): Promise<{ path: string }> => {
    const formData = new FormData();
    formData.append("logo", file);
    const res = await fetch(`${API_BASE}/proposals/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload échoué" }));
      throw new Error(err.error || "Upload échoué");
    }
    return res.json();
  },

  getProposals: (status?: string) =>
    request<any[]>(`/admin/proposals${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  acceptProposal: (id: number) =>
    request<{ success: boolean }>(`/admin/proposals/${id}/accept`, { method: "PUT" }),
  rejectProposal: (id: number) =>
    request<{ success: boolean }>(`/admin/proposals/${id}/reject`, { method: "PUT" }),

  // Gestion des comptes admin
  getAdmins: () => request<any[]>("/admin/admins"),
  createAdmin: (username: string, password: string) =>
    request<any>("/admin/admins", { method: "POST", body: JSON.stringify({ username, password }) }),
  deleteAdmin: (id: number) =>
    request<any>(`/admin/admins/${id}`, { method: "DELETE" }),
  changeAdminPassword: (id: number, newPassword: string) =>
    request<any>(`/admin/admins/${id}/password`, {
      method: "PUT",
      body: JSON.stringify({ newPassword }),
    }),
};
