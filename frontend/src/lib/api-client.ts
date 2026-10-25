 /** API client for backend communication. */
 
function withApiPrefix(value: string, fallback: string) {
  const base = (value || fallback).replace(/\/+$/, "");
  if (base === "/api" || base.endsWith("/api")) return base;
  return `${base}/api`;
}

const BASE_URL = withApiPrefix(process.env.NEXT_PUBLIC_API_URL || "", "/api");
export const BACKEND_URL = withApiPrefix(process.env.NEXT_PUBLIC_BACKEND_URL || "", "http://localhost:8000/api");

export async function directRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const payload = await response.text();
    const error = new Error(payload || `API ${response.status}`) as Error & { status?: number; payload?: string };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
 
 async function request<T>(path: string, options?: RequestInit): Promise<T> {
   const res = await fetch(`${BASE_URL}${path}`, {
     credentials: "include",
     headers: { "Content-Type": "application/json", ...options?.headers },
     ...options,
   });
  if (!res.ok) {
     const error = await res.text();
     throw new Error(`API ${res.status}: ${error}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
 }
 
 export const api = {
   // --- Query ---
   searchGames: (q: string, page = 1, pageSize = 20) =>
     request(`/query?q=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}`),
   getGameDetail: (id: string) => request(`/query/${id}`),
   queueGameCrawl: (q: string) => request("/query/crawl", {
     method: "POST",
     body: JSON.stringify({ q }),
   }),
   getCrawlStatus: (jobId: string) => request(`/query/crawl/${jobId}`, { cache: "no-store" }),
   queueAnalysis: (gameId: string, templateId: string) => request("/analyze/jobs", { method: "POST", body: JSON.stringify({ game_id: gameId, template_id: templateId, params: {} }) }),
   me: () => request("/auth/me", { cache: "no-store" }),
   login: (username: string, password: string) => request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
   register: (username: string, password: string) => request("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
   logout: () => request("/auth/logout", { method: "POST" }),
 
   // --- Analyze ---
   getReport: (reportId: string) => request(`/analyze/report/${reportId}`),
   listReports: (limit = 30) => request(`/analyze/reports?limit=${limit}`, { cache: "no-store" }),
   deleteReport: (reportId: string) => request(`/analyze/report/${reportId}`, { method: "DELETE" }),
   debugRetrieve: (query: string, topK = 5) => request("/rag/retrieve", {
     method: "POST",
     body: JSON.stringify({ query, top_k: topK }),
   }),
 
   // --- Inspiration ---
   listNotes: () => request("/inspiration"),
   getNote: (id: string) => request(`/inspiration/${id}`),
   createNote: (data: unknown) =>
     request("/inspiration", { method: "POST", body: JSON.stringify(data) }),
   updateNote: (id: string, data: unknown) =>
     request(`/inspiration/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
   deleteNote: (id: string) => request(`/inspiration/${id}`, { method: "DELETE" }),
   aiDeepen: (id: string, message: string) =>
     request(`/inspiration/${id}/ai`, {
       method: "POST",
       body: JSON.stringify({ note_id: id, message }),
     }),
  convertToProject: (id: string) =>
    request(`/inspiration/${id}/convert`, { method: "POST" }),
 
   // --- Design ---
   listProjects: () => request("/design/projects"),
   getProject: (id: string) => request(`/design/projects/${id}`),
  createProject: (data: unknown) =>
    request("/design/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: unknown) =>
    request(`/design/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request(`/design/projects/${id}`, { method: "DELETE" }),
   getRecommendations: (projectId: string, nodeType: string) =>
     request(`/design/projects/${projectId}/recommend?node_type=${nodeType}`, {
       method: "POST",
     }),
 };
