"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, BookOpenText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { ChartWidget } from "./chart-widget";
import { CitationBadge } from "./citation-badge";
import { ExportDropdown } from "./export-dropdown";

interface ReportData {
  content: string;
  report_type?: string;
  charts_data?: { type?: "radar" | "bar" | "timeline"; title?: string; data?: Record<string, unknown>[] }[];
  citations?: { source?: string; title?: string; url?: string }[];
}

export function ReportViewer({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { api.getReport(reportId).then((data) => setReport(data as ReportData)).catch((err) => setError(err instanceof Error ? err.message : "报告加载失败")); }, [reportId]);

  if (!report && !error) return <div className="space-y-4"><div className="h-12 animate-pulse rounded bg-muted/50" /><div className="h-72 animate-pulse rounded border bg-muted/40" /></div>;
  if (error) return <div className="border-y py-16 text-center"><p className="text-sm font-medium">报告暂时无法加载</p><p className="mt-1 text-sm text-destructive">{error}</p><Link href="/analyze"><Button variant="outline" size="sm" className="mt-5"><ArrowLeft className="mr-1 h-4 w-4" />返回分析页</Button></Link></div>;

  const charts = report?.charts_data || [];
  const citations = report?.citations || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/analyze"><Button variant="ghost" size="icon" aria-label="返回分析页" title="返回分析页"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div><h1 className="text-xl font-semibold">分析报告</h1><p className="text-xs text-muted-foreground">{report?.report_type || "综合分析"}</p></div>
        </div>
        <ExportDropdown reportId={reportId} />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><BookOpenText className="h-4 w-4" />报告正文</CardTitle></CardHeader>
        <CardContent><article className="whitespace-pre-wrap text-sm leading-7">{report?.content}</article></CardContent>
      </Card>

      {charts.length > 0 && <section className="space-y-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4" />数据图表</h2><div className="grid gap-4 lg:grid-cols-2">{charts.map((chart, index) => <Card key={`${chart.title}-${index}`}><CardHeader className="pb-2"><CardTitle className="text-sm">{chart.title || `图表 ${index + 1}`}</CardTitle></CardHeader><CardContent className="overflow-x-auto"><ChartWidget type={chart.type || "bar"} data={chart.data || []} /></CardContent></Card>)}</div></section>}

      <section className="space-y-3 border-t pt-4"><h2 className="text-sm font-semibold">参考来源</h2>{citations.length > 0 ? <div className="flex flex-wrap gap-2">{citations.map((citation, index) => <CitationBadge key={`${citation.source}-${index}`} source={citation.title || citation.source || `来源 ${index + 1}`} url={citation.url} />)}</div> : <p className="text-sm text-muted-foreground">本次报告未返回外部引用来源。</p>}</section>
    </div>
  );
}
