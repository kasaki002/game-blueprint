"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
import { BookOpen, CheckCircle2, Cpu, Loader2, Skull, Swords, Wrench } from "lucide-react";
import { api, BACKEND_URL } from "@/lib/api-client";
 
 const templates = [
   { id: "char-tier", label: "角色强度", icon: Swords, description: "角色强度评分与雷达图" },
   { id: "build-recommend", label: "装备搭配", icon: Wrench, description: "装备组合与属性对比" },
   { id: "boss-guide", label: "BOSS攻略", icon: Skull, description: "招式拆解与推荐配置" },
   { id: "story-deep", label: "剧情解析", icon: BookOpen, description: "故事线与关键节点解读" },
   { id: "mechanic", label: "机制分析", icon: Cpu, description: "机制说明与数值分析" },
 ] as const;
 
export function AnalysisTriggerGroup({ onReportCreated }: { onReportCreated?: () => void }) {
  const searchParams = useSearchParams();
  const gameId = searchParams.get("gameId");
  const [status, setStatus] = useState(gameId ? "请选择一种分析模板" : "请先在游戏查询中选择游戏");
  const [reportId, setReportId] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  const analyze = async (templateId: string) => {
    if (!gameId) return;
    setActiveTemplate(templateId);
    setReportId(null);
    setStatus("正在创建分析任务...");
    try {
      const queued = await api.queueAnalysis(gameId, templateId) as { job_id: string };
      await new Promise<void>((resolve, reject) => {
        const events = new EventSource(`${BACKEND_URL}/tasks/${queued.job_id}/events`, { withCredentials: true });
        const receive = (event: MessageEvent) => {
          const task = JSON.parse(event.data) as { status: string; stage: string; progress: number; report_id?: string; error?: string };
          setStatus(task.status === "failed" ? task.error || "分析失败" : `分析阶段：${task.stage}（${task.progress}%）`);
          if (task.status === "completed" && task.report_id) {
            setReportId(task.report_id);
            events.close();
            onReportCreated?.();
            resolve();
          } else if (task.status === "failed") {
            events.close();
            reject(new Error(task.error || "分析失败"));
          }
        };
        events.addEventListener("snapshot", receive as EventListener);
        events.addEventListener("progress", receive as EventListener);
        events.onerror = async () => {
          events.close();
          try {
            for (let attempt = 0; attempt < 30; attempt += 1) {
              await new Promise((done) => window.setTimeout(done, 2000));
              const task = await fetch(`${BACKEND_URL}/tasks/${queued.job_id}`, { credentials: "include", cache: "no-store" }).then((response) => response.json()) as { status: string; stage: string; progress: number; report_id?: string; error?: string };
              setStatus(`分析阶段：${task.stage}（${task.progress}%）`);
              if (task.status === "completed" && task.report_id) { setReportId(task.report_id); onReportCreated?.(); resolve(); return; }
              if (task.status === "failed") { reject(new Error(task.error || "分析失败")); return; }
            }
            reject(new Error("分析仍在后台运行，请稍后在历史报告中查看"));
          } catch (error) { reject(error); }
        };
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "分析失败");
    } finally {
      setActiveTemplate(null);
    }
  };

  return (
     <div className="space-y-6">
       <Card>
         <CardHeader>
           <CardTitle>预设分析</CardTitle>
         </CardHeader>
         <CardContent>
           <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
             {templates.map(({ id, label, icon: Icon, description }) => (
               <Button key={id} variant="outline" disabled={!gameId || activeTemplate !== null} onClick={() => analyze(id)} className="flex h-auto min-h-24 flex-col items-start gap-1 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm">
                 <div className="flex items-center gap-2 font-medium">
                   {activeTemplate === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                   {label}
                 </div>
                 <span className="text-xs font-normal text-muted-foreground">{description}</span>
               </Button>
             ))}
           </div>
         </CardContent>
       </Card>
       <Card>
         <CardContent className="flex items-center justify-between gap-4 py-4">
           <div className="flex min-w-0 items-start gap-2">
             {reportId && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
             <p className="line-clamp-3 text-sm text-muted-foreground">{status}</p>
           </div>
           {reportId && <Link href={`/analyze/report/${reportId}`}><Button size="sm">查看报告</Button></Link>}
         </CardContent>
       </Card>
       <Card>
         <CardHeader>
           <CardTitle>自由提问</CardTitle>
         </CardHeader>
         <CardContent>
           <p className="text-sm text-muted-foreground">
             前往 <a href="/analyze/chat" className="text-primary underline-offset-4 hover:underline">AI 对话</a> 页面，自由提问关于游戏的问题。
           </p>
         </CardContent>
       </Card>
     </div>
   );
 }
