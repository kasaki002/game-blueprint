"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { RetrievalDocument } from "@/lib/types";

type Response = { query: string; documents: RetrievalDocument[]; count: number };

export function RetrievalDebug() {
  const [query, setQuery] = useState("");
  const [documents, setDocuments] = useState<RetrievalDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const retrieve = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.debugRetrieve(query.trim()) as Response;
      setDocuments(response.documents);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "检索失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <details className="border-y py-3">
      <summary className="cursor-pointer text-sm font-semibold">检索调试</summary>
      <div className="mt-3 space-y-3">
        <div className="flex gap-2">
          <Input aria-label="检索调试关键词" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && retrieve()} />
          <Button variant="outline" onClick={retrieve} disabled={loading || !query.trim()}>
            <Search className="mr-2 h-4 w-4" />{loading ? "检索中" : "检索"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && documents.length === 0 && query && !error && <p className="text-sm text-muted-foreground">没有召回文档。</p>}
        <div className="divide-y border-y">
          {documents.map((document) => (
            <article key={document.document_id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <strong className="text-sm text-foreground">{document.title}</strong>
                <span>{document.provider} · {document.score.toFixed(4)}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{document.snippet}</p>
            </article>
          ))}
        </div>
      </div>
    </details>
  );
}
