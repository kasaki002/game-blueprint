"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { DesignProject } from "@/lib/types";
import { WorkspaceManager } from "@/lib/workspace-manager";

type DialogState = { mode: "create" | "rename" | "delete"; project?: DesignProject } | null;

export default function DesignPage() {
  const [projects, setProjects] = useState<DesignProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [draftName, setDraftName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listProjects().then((data) => setProjects(data as DesignProject[])).catch((error) => setStatus(error instanceof Error ? error.message : "加载失败")).finally(() => setLoading(false));
  }, []);

  const openCreateDialog = () => { setDraftName(`新设计项目 ${projects.length + 1}`); setDialog({ mode: "create" }); };

  const submitDialog = async () => {
    if (!dialog || submitting) return;
    setSubmitting(true);
    setStatus("");
    try {
      if (dialog.mode === "create") {
        const project = await api.createProject({ name: draftName.trim(), description: "" }) as DesignProject;
        setProjects((current) => [project, ...current]);
      } else if (dialog.mode === "rename" && dialog.project) {
        const project = await api.updateProject(dialog.project.id, { name: draftName.trim() }) as DesignProject;
        setProjects((current) => current.map((item) => item.id === project.id ? project : item));
      } else if (dialog.mode === "delete" && dialog.project) {
        await api.deleteProject(dialog.project.id);
        WorkspaceManager.clear(dialog.project.id);
        setProjects((current) => current.filter((item) => item.id !== dialog.project?.id));
      }
      setDialog(null);
    } catch (error) { setStatus(error instanceof Error ? error.message : "操作失败"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div><h1 className="text-2xl font-bold tracking-tight">游戏设计</h1></div>
        <Button onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" />新建项目</Button>
      </div>
      {status && <p className="text-sm text-destructive">{status}</p>}
      {loading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse rounded-md border bg-muted/50" />)}</div>}
      {!loading && projects.length === 0 && <div className="border-y py-16 text-center"><p className="text-sm font-medium">还没有设计项目</p><p className="mt-1 text-sm text-muted-foreground">建立一个项目，从第一组节点开始组织你的想法。</p><Button size="sm" className="mt-5" onClick={openCreateDialog}><Plus className="mr-1 h-4 w-4" />新建项目</Button></div>}
      {!loading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id} className="group relative min-h-40 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <Link href={`/design/${project.id}`} className="block h-full">
              <CardHeader className="pb-3"><CardTitle className="pr-16 text-base">{project.name}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{project.description || "尚未添加项目说明"}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{new Date(project.updated_at).toLocaleDateString("zh-CN")}</span>
                  {project.source_note_id && <span className="flex items-center gap-1"><Lightbulb className="h-3 w-3" />来自灵感</span>}
                </div>
              </CardContent>
            </Link>
            <div className="absolute right-3 top-3 flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" title="重命名项目" aria-label={`重命名${project.name}`} className="grid h-8 w-8 place-items-center rounded-md hover:bg-accent" onClick={() => { setDraftName(project.name); setDialog({ mode: "rename", project }); }}><Pencil className="h-4 w-4" /></button>
              <button type="button" title="删除项目" aria-label={`删除${project.name}`} className="grid h-8 w-8 place-items-center rounded-md hover:bg-destructive/10 hover:text-destructive" onClick={() => setDialog({ mode: "delete", project })}><Trash2 className="h-4 w-4" /></button>
            </div>
          </Card>
        ))}
      </div>}

      {dialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 p-4 backdrop-blur-[2px]" onMouseDown={() => !submitting && setDialog(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="design-project-dialog" className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="design-project-dialog" className="text-base font-semibold">{dialog.mode === "create" ? "新建项目" : dialog.mode === "rename" ? "重命名项目" : "删除项目"}</h2>
            {dialog.mode === "delete" ? <p className="mt-2 text-sm text-muted-foreground">确认删除“{dialog.project?.name}”？项目画布和节点数据将一并删除，此操作无法恢复。</p> : <><p className="mt-1 text-sm text-muted-foreground">输入一个便于识别的项目名称。</p><Input autoFocus className="mt-4" value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitDialog(); if (event.key === "Escape") setDialog(null); }} /></>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" disabled={submitting} onClick={() => setDialog(null)}>取消</Button>
              <Button variant={dialog.mode === "delete" ? "destructive" : "default"} disabled={submitting || (dialog.mode !== "delete" && !draftName.trim())} onClick={submitDialog}>{submitting ? "处理中..." : dialog.mode === "create" ? "创建" : dialog.mode === "rename" ? "保存" : "删除"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
