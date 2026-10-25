"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, FileText, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { AnalysisReportSummary } from "@/lib/types";

const typeNames: Record<string, string> = {
  "char-tier": "角色强度",
  "build-recommend": "装备搭配",
  "boss-guide": "BOSS 攻略",
  "story-deep": "剧情解析",
  mechanic: "机制分析",
};

export function AnalysisHistory({ refreshToken = 0 }: { refreshToken?: number }) {
  const [reports, setReports] = useState<AnalysisReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AnalysisReportSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listReports().then((data) => { if (!cancelled) { setReports(data as AnalysisReportSummary[]); setError(""); } }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "历史报告加载失败"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshToken]);

  const deleteReport = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await api.deleteReport(pendingDelete.id);
      setReports((current) => current.filter((report) => report.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) { setError(err instanceof Error ? err.message : "删除报告失败"); }
    finally { setDeleting(false); }
  };

  return (
    <section className="space-y-3 border-t pt-6">
      <div><h2 className="text-sm font-semibold">历史报告</h2><p className="mt-0.5 text-xs text-muted-foreground">报告会持久保存，可随时继续查看或导出。</p></div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((item) => <div key={item} className="h-32 animate-pulse rounded-md border bg-muted/50" />)}</div>}
      {!loading && reports.length === 0 && <div className="border-y py-10 text-center"><FileText className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium">还没有分析报告</p><p className="mt-1 text-xs text-muted-foreground">从游戏查询选择一个游戏，再使用预设模板生成报告。</p></div>}
      {!loading && <div className="grid gap-3 md:grid-cols-2">
        {reports.map((report) => (
          <div key={report.id} className="group relative min-h-32 rounded-md border p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm">
            <Link href={`/analyze/report/${report.id}`} className="block h-full">
              <div className="flex items-start justify-between gap-3 pr-8"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{report.game_name}</h3><Badge variant="secondary" className="mt-2">{typeNames[report.report_type] || report.report_type}</Badge></div></div>
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{report.excerpt || "报告暂无摘要"}</p>
              <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarDays className="h-3 w-3" />{new Date(report.created_at).toLocaleString("zh-CN")}</p>
            </Link>
            <button type="button" aria-label={`删除${report.game_name}分析报告`} title="删除报告" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100" onClick={() => setPendingDelete(report)}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>}

      {pendingDelete && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 p-4 backdrop-blur-[2px]" onMouseDown={() => !deleting && setPendingDelete(null)}><div role="dialog" aria-modal="true" aria-labelledby="delete-report-title" className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}><h2 id="delete-report-title" className="text-base font-semibold">删除分析报告</h2><p className="mt-2 text-sm text-muted-foreground">确认删除“{pendingDelete.game_name}”的{typeNames[pendingDelete.report_type] || pendingDelete.report_type}报告？此操作无法恢复。</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={deleting} onClick={() => setPendingDelete(null)}>取消</Button><Button variant="destructive" disabled={deleting} onClick={deleteReport}>{deleting ? "删除中..." : "删除"}</Button></div></div></div>}
    </section>
  );
}
