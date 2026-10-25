"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
 
interface Props {
  projectId: string;
  width?: number;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}
 
export function ReferencePanel({ projectId, width = 224, collapsed = false, onCollapsedChange }: Props) {
  const [references, setReferences] = useState<{ title: string; source: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRecommendations(projectId, "reference")
      .then((data) => setReferences((data as { recommendations: { title: string; source: string }[] }).recommendations))
      .catch(() => setReferences([]))
      .finally(() => setLoading(false));
  }, [projectId]);
   if (collapsed) {
     return (
       <div className="flex w-10 shrink-0 flex-col items-center border-l bg-card py-3">
         <button type="button" className="grid h-7 w-7 place-items-center rounded hover:bg-accent" onClick={() => onCollapsedChange?.(false)} title="展开参考依据" aria-label="展开参考依据">
           <ChevronLeft className="h-4 w-4" />
         </button>
         <span className="mt-4 text-xs text-muted-foreground [writing-mode:vertical-rl]">参考依据</span>
       </div>
     );
   }

   return (
     <Card className="shrink-0 rounded-none border-y-0 border-r-0" style={{ width }}>
       <CardHeader className="flex-row items-center justify-between space-y-0">
         <CardTitle className="text-sm">参考依据</CardTitle>
         <button type="button" className="grid h-7 w-7 place-items-center rounded hover:bg-accent" onClick={() => onCollapsedChange?.(true)} title="收起参考依据" aria-label="收起参考依据">
           <ChevronRight className="h-4 w-4" />
         </button>
       </CardHeader>
       <CardContent className="space-y-2">
         <p className="text-xs text-muted-foreground">
           从分析模块拖拽报告到画布创建参考节点
         </p>
         {loading && <div className="space-y-2">{[0, 1].map((item) => <div key={item} className="h-14 animate-pulse rounded border bg-muted/50" />)}</div>}
         {!loading && references.length === 0 && <p className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">暂无推荐参考</p>}
         {references.map((reference) => (
           <div
             key={reference.title}
             draggable
             onDragStart={(event) => {
               event.dataTransfer.setData("application/game-blueprint-reference", JSON.stringify(reference));
               event.dataTransfer.effectAllowed = "copy";
             }}
             className="cursor-grab rounded border bg-muted/40 p-2 text-xs transition-colors hover:bg-accent active:cursor-grabbing"
           >
             <p className="font-medium">{reference.title}</p>
             <p className="mt-1 text-muted-foreground">{reference.source}</p>
           </div>
         ))}
       </CardContent>
     </Card>
   );
 }
