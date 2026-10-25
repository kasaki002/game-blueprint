"use client";

import { Suspense, useState } from "react";

import { AnalysisHistory } from "@/components/analyze/analysis-history";
import { AnalysisTriggerGroup } from "@/components/analyze/analysis-trigger-group";
import { RetrievalDebug } from "@/components/analyze/retrieval-debug";

export default function AnalyzePage() {
  const [historyRefresh, setHistoryRefresh] = useState(0);

  return (
    <div className="space-y-6">
      <div className="border-b pb-5"><h1 className="text-2xl font-bold tracking-tight">游戏分析</h1></div>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-md border bg-muted/50" />}>
        <AnalysisTriggerGroup onReportCreated={() => setHistoryRefresh((value) => value + 1)} />
      </Suspense>
      <AnalysisHistory refreshToken={historyRefresh} />
      <RetrievalDebug />
    </div>
  );
}
