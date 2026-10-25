"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Gamepad2, Loader2, Puzzle, Search, X } from "lucide-react";

interface SearchItem { id: string; title: string; summary?: string | null; type: "game" | "inspiration" | "project"; }
interface SearchResults { games: SearchItem[]; inspirations: SearchItem[]; projects: SearchItem[]; }

const emptyResults: SearchResults = { games: [], inspirations: [], projects: [] };

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(emptyResults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); }
      else if (event.key === "/" && !typing) { event.preventDefault(); setOpen(true); }
      else if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 20); }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults(emptyResults); setLoading(false); setError(""); return; }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json() as SearchResults;
        if (requestId === requestIdRef.current) { setResults(data); setError(""); }
      } catch (err) { if (requestId === requestIdRef.current) setError(err instanceof Error ? err.message : "搜索失败"); }
      finally { if (requestId === requestIdRef.current) setLoading(false); }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [query]);

  const navigate = (item: SearchItem) => {
    const href = item.type === "game" ? `/query/${item.id}` : item.type === "inspiration" ? `/inspiration/${item.id}` : `/design/${item.id}`;
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const total = results.games.length + results.inspirations.length + results.projects.length;

  return (
    <>
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:w-52 sm:justify-start sm:px-3" onClick={() => setOpen(true)} aria-label="全局搜索" title="全局搜索 Ctrl+K">
        <Search className="h-4 w-4 shrink-0" /><span className="ml-2 hidden text-xs sm:inline">搜索</span><kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex justify-center bg-foreground/25 p-3 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="全局搜索" className="h-fit w-full max-w-xl overflow-hidden rounded-lg border bg-background shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center border-b px-3"><Search className="h-4 w-4 text-muted-foreground" /><input ref={inputRef} className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" aria-label="全局关键词搜索" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" className="grid h-8 w-8 place-items-center rounded hover:bg-accent" aria-label="关闭搜索" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button></div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {loading && <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在搜索</div>}
              {error && !loading && <p className="px-3 py-8 text-center text-sm text-destructive">{error}</p>}
              {!loading && !error && query.trim() && total === 0 && <div className="py-10 text-center"><p className="text-sm font-medium">没有匹配内容</p><p className="mt-1 text-xs text-muted-foreground">尝试使用更短的关键词。</p></div>}
              {!loading && !error && <>
                <ResultGroup label="游戏" icon={Gamepad2} items={results.games} onSelect={navigate} />
                <ResultGroup label="灵感" icon={FileText} items={results.inspirations} onSelect={navigate} />
                <ResultGroup label="设计项目" icon={Puzzle} items={results.projects} onSelect={navigate} />
              </>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultGroup({ label, icon: Icon, items, onSelect }: { label: string; icon: typeof Search; items: SearchItem[]; onSelect: (item: SearchItem) => void }) {
  if (items.length === 0) return null;
  return <section className="mb-2 last:mb-0"><h2 className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">{label}</h2>{items.map((item) => <button key={`${item.type}-${item.id}`} type="button" className="flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left hover:bg-accent" onClick={() => onSelect(item)}><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded bg-muted"><Icon className="h-3.5 w-3.5" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span>{item.summary && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.summary}</span>}</span></button>)}</section>;
}
