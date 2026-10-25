"use client";

import { useEffect, useState } from "react";
import { Download, Redo, Save, Undo, ZoomIn, ZoomOut } from "lucide-react";
import { useReactFlow } from "reactflow";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { DesignProject } from "@/lib/types";

interface Props {
  projectId: string;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onExport: () => void;
}

export function ProjectToolbar({ projectId, onUndo, onRedo, onSave, onExport }: Props) {
  const { zoomIn, zoomOut } = useReactFlow();
  const [projectName, setProjectName] = useState("游戏设计项目");

  useEffect(() => {
    api.getProject(projectId)
      .then((data) => setProjectName((data as DesignProject).name))
      .catch(() => setProjectName("游戏设计项目"));
  }, [projectId]);

  return (
    <div className="flex min-h-12 items-center justify-between border-b px-4 py-2">
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium">{projectName}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="撤销" title="撤销" onClick={onUndo}><Undo className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="重做" title="重做" onClick={onRedo}><Redo className="h-4 w-4" /></Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" size="icon" aria-label="放大" title="放大" onClick={() => zoomIn({ duration: 180 })}><ZoomIn className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="缩小" title="缩小" onClick={() => zoomOut({ duration: 180 })}><ZoomOut className="h-4 w-4" /></Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" size="icon" aria-label="保存" title="立即保存" onClick={onSave}><Save className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="导出" title="导出当前设计" onClick={onExport}><Download className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
