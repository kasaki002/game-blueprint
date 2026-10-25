"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, History, RefreshCw, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, BACKEND_URL } from "@/lib/api-client";
import type { CrawlJob, GameSummary } from "@/lib/types";
import { GameInfoCard } from "./game-info-card";

const HISTORY_KEY = "game-blueprint-search-history";
const SEARCH_STATE_KEY = "game-blueprint-search-state";
const PAGE_SIZE = 10;
type SearchResponse = { results: GameSummary[]; total: number; page: number; page_size: number };
type StoredSearchState = SearchResponse & { query: string };

export function GameSearchBar() {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<GameSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null);
  const [crawlTimedOut, setCrawlTimedOut] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"));
      const stored = JSON.parse(sessionStorage.getItem(SEARCH_STATE_KEY) || "null") as StoredSearchState | null;
      if (stored?.query && Array.isArray(stored.results)) {
        setQuery(stored.query);
        setSearchedQuery(stored.query);
        setResults(stored.results);
        setTotal(stored.total);
        setPage(stored.page);
      }
    } catch {
      setHistory([]);
    }
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    const close = (event: MouseEvent) => { if (!historyRef.current?.contains(event.target as globalThis.Node)) setHistoryOpen(false); };
    document.addEventListener("mousedown", close);
    return () => { mountedRef.current = false; requestIdRef.current += 1; document.removeEventListener("mousedown", close); if (pollTimerRef.current) clearTimeout(pollTimerRef.current); eventSourceRef.current?.close(); };
  }, []);

  const loadResults = async (searchTerm: string, targetPage: number, requestId: number) => {
    const data = await api.searchGames(searchTerm, targetPage, PAGE_SIZE) as SearchResponse;
    if (!mountedRef.current || requestId !== requestIdRef.current) return null;
    setResults(data.results);
    setTotal(data.total);
    setPage(data.page);
    try {
      sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({ ...data, query: searchTerm } satisfies StoredSearchState));
    } catch {
      // Search results remain in React state when browser storage is unavailable.
    }
    return data;
  };

  const pollCrawl = async (jobId: string, searchTerm: string, requestId: number, startedAt = Date.now()) => {
    try {
      const job = await api.getCrawlStatus(jobId) as CrawlJob;
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setCrawlJob(job);
      if (job.status === "completed" || job.status === "partial") {
        await loadResults(searchTerm, 1, requestId);
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
        setCrawlTimedOut(false);
        if (job.warnings.length > 0) setError(`部分数据源不可用：${job.warnings.join("；")}`);
        return;
      }
      if (job.status === "failed") { setLoading(false); setError(job.error || job.warnings.join("；") || "游戏数据抓取失败"); return; }
      if (Date.now() - startedAt >= 60_000) { setLoading(false); setCrawlTimedOut(true); return; }
      pollTimerRef.current = setTimeout(() => pollCrawl(jobId, searchTerm, requestId, startedAt), 1000);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setLoading(false);
      setError(err instanceof Error ? err.message : "无法读取抓取进度");
    }
  };

  const queueCrawl = async (searchTerm: string, requestId: number) => {
    const queued = await api.queueGameCrawl(searchTerm) as { job_id: string };
    if (requestId !== requestIdRef.current) return;
    setCrawlJob({ job_id: queued.job_id, query: searchTerm, status: "queued", stage: "queued", progress: 0, result_count: 0, game_ids: [], warnings: [], error: null, created_at: null, updated_at: null });
    setCrawlTimedOut(false);
    eventSourceRef.current?.close();
    const events = new EventSource(`${BACKEND_URL}/tasks/${queued.job_id}/events`, { withCredentials: true });
    eventSourceRef.current = events;
    const receive = async (event: Event) => {
      if (!(event instanceof MessageEvent)) return;
      const job = JSON.parse(event.data) as CrawlJob;
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setCrawlJob(job);
      if (["completed", "partial"].includes(job.status)) {
        events.close();
        await loadResults(searchTerm, 1, requestId);
        setLoading(false);
        if (job.warnings.length) setError(`部分数据源不可用：${job.warnings.join("；")}`);
      } else if (job.status === "failed") {
        events.close();
        setLoading(false);
        setError(job.error || "游戏数据抓取失败");
      }
    };
    events.addEventListener("snapshot", receive);
    events.addEventListener("progress", receive);
    events.onerror = () => { events.close(); pollCrawl(queued.job_id, searchTerm, requestId); };
  };

  const handleSearch = async (value = query) => {
    const searchTerm = value.trim();
    if (!searchTerm) return;
    const requestId = ++requestIdRef.current;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    eventSourceRef.current?.close();
    setQuery(searchTerm);
    setSearchedQuery(searchTerm);
    setHistoryOpen(false);
    setLoading(true);
    setError("");
    setCrawlJob(null);
    setCrawlTimedOut(false);
    let queuedCrawl = false;
    try {
      const data = await loadResults(searchTerm, 1, requestId);
      if (!data) return;
      const nextHistory = [searchTerm, ...history.filter((item) => item !== searchTerm)].slice(0, 8);
      setHistory(nextHistory);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      if (data.total === 0) {
        await queueCrawl(searchTerm, requestId);
        queuedCrawl = true;
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : "搜索失败");
        setLoading(false);
      }
    } finally { if (!queuedCrawl && requestId === requestIdRef.current) setLoading(false); }
  };

  const changePage = async (targetPage: number) => {
    if (!searchedQuery || targetPage < 1 || targetPage > Math.ceil(total / PAGE_SIZE) || loading) return;
    const requestId = ++requestIdRef.current;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    eventSourceRef.current?.close();
    setLoading(true);
    setError("");
    try { await loadResults(searchedQuery, targetPage, requestId); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (err) { if (requestId === requestIdRef.current) setError(err instanceof Error ? err.message : "分页加载失败"); }
    finally { if (requestId === requestIdRef.current) setLoading(false); }
  };

  const checkTimedOutJob = async () => {
    if (!crawlJob) return;
    const requestId = ++requestIdRef.current;
    setLoading(true); setError(""); setCrawlTimedOut(false);
    await pollCrawl(crawlJob.job_id, crawlJob.query, requestId);
  };

  const resetSearch = () => {
    requestIdRef.current += 1;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setQuery(""); setSearchedQuery(""); setResults([]); setTotal(0); setPage(1); setError(""); setCrawlJob(null); setLoading(false); setCrawlTimedOut(false);
    try { sessionStorage.removeItem(SEARCH_STATE_KEY); } catch { /* ignore storage restrictions */ }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-9 pl-9" aria-label="关键词搜索" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleSearch()} />{query && <button type="button" aria-label="清空搜索" title="清空" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded hover:bg-accent" onClick={resetSearch}><X className="h-3.5 w-3.5" /></button>}</div>
        <Button onClick={() => handleSearch()} disabled={loading || !query.trim()}><Search className="mr-2 h-4 w-4" />{loading && results.length === 0 ? "搜索中" : "搜索"}</Button>
        <div className="relative" ref={historyRef}><Button variant="outline" size="icon" aria-label="搜索历史" title="搜索历史" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}><History className="h-4 w-4" /></Button>{historyOpen && <div className="absolute right-0 top-11 z-30 w-72 rounded-md border bg-popover p-2 shadow-lg"><div className="flex items-center justify-between px-2 py-1"><span className="text-xs font-medium">搜索历史</span>{history.length > 0 && <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }}><Trash2 className="h-3 w-3" />清空</button>}</div>{history.length === 0 ? <p className="px-2 py-5 text-center text-xs text-muted-foreground">暂无搜索记录</p> : history.map((item) => <button key={item} type="button" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent" onClick={() => handleSearch(item)}><Clock3 className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{item}</span></button>)}</div>}</div>
      </div>

      {crawlJob && !["completed", "partial", "failed"].includes(crawlJob.status) && <div className="space-y-2 rounded-md border bg-muted/30 p-3"><div className="flex items-center justify-between gap-3 text-sm"><span>{stageLabel(crawlJob.stage)}</span><span className="text-muted-foreground">{crawlJob.progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${crawlJob.progress}%` }} /></div><p className="text-xs text-muted-foreground">任务 ID：{crawlJob.job_id}</p></div>}
      {crawlTimedOut && crawlJob && <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>抓取仍在后台执行，稍后可重新检查此任务。</span><Button variant="outline" size="sm" onClick={checkTimedOutJob}><RefreshCw className="mr-1 h-3.5 w-3.5" />重新检查</Button></div>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && total === 0 && searchedQuery && !error && (!crawlJob || ["completed", "partial"].includes(crawlJob.status)) && <div className="border-y py-10 text-center"><p className="text-sm font-medium">没有找到匹配游戏</p><p className="mt-1 text-xs text-muted-foreground">可以尝试英文名、别名或更短的关键词。</p></div>}
      {loading && results.length === 0 && <div className="space-y-3">{[0, 1].map((item) => <div key={item} className="h-36 animate-pulse rounded-md border bg-muted/50" />)}</div>}

      {total > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3 text-xs text-muted-foreground"><span>找到 {total} 个结果，显示 {start}-{end}</span><span>第 {page}/{totalPages} 页</span></div>}
      <div className={`grid gap-3 transition-opacity ${loading && results.length > 0 ? "opacity-55" : "opacity-100"}`}>{results.map((game) => <GameInfoCard key={game.id} game={game} />)}</div>
      {totalPages > 1 && <div className="flex items-center justify-center gap-2 pt-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)}><ChevronLeft className="mr-1 h-4 w-4" />上一页</Button><span className="min-w-20 text-center text-xs text-muted-foreground">{page} / {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => changePage(page + 1)}>下一页<ChevronRight className="ml-1 h-4 w-4" /></Button></div>}
    </div>
  );
}

function stageLabel(stage: string) {
  const labels: Record<string, string> = { queued: "等待抓取 Worker", starting: "正在启动抓取任务", steam: "正在查询 Steam", wikipedia: "正在补充 Wikipedia 数据", merging: "正在合并多来源字段", persisting: "正在写入本地数据库", retrying: "来源请求失败，正在重试", completed: "抓取完成", failed: "抓取失败" };
  return labels[stage] || stage;
}
