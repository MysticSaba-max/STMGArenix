const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("admin_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
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
  vote: (data: { site_id: number; vote_type: string; fingerprint: string }) =>
    request<any>("/votes", { method: "POST", body: JSON.stringify(data) }),
  voteCategory: (data: { site_id: number; category: string; score: number; fingerprint: string }) =>
    request<any>("/votes/category", { method: "POST", body: JSON.stringify(data) }),
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
