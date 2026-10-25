"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Puzzle, Save, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { InspirationNote } from "@/lib/types";
import { TagSelector } from "./tag-selector";

interface Props { noteId?: string; }
type SaveState = "idle" | "saving" | "saved" | "error";

function snapshot(title: string, description: string, tags: string[]) {
  return JSON.stringify({ title, description, tags });
}

export function InspirationEditor({ noteId }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [status, setStatus] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const savedSnapshot = useRef("");

  const currentSnapshot = useMemo(() => snapshot(title, description, tags), [description, tags, title]);
  const dirty = loaded && currentSnapshot !== savedSnapshot.current;

  useEffect(() => {
    if (!noteId) { setLoaded(true); return; }
    api.getNote(noteId).then((data) => {
      const note = data as InspirationNote;
      const nextTitle = note.title;
      const nextDescription = note.description || "";
      const nextTags = note.tags;
      setTitle(nextTitle);
      setDescription(nextDescription);
      setTags(nextTags);
      savedSnapshot.current = snapshot(nextTitle, nextDescription, nextTags);
      setLoaded(true);
    }).catch((error) => { setStatus(error instanceof Error ? error.message : "加载失败"); setSaveState("error"); setLoaded(true); });
  }, [noteId]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!title.trim()) { setStatus("标题不能为空"); setSaveState("error"); return false; }
    setSaveState("saving");
    setStatus("");
    try {
      if (noteId) await api.updateNote(noteId, { title: title.trim(), description, tags });
      else await api.createNote({ title: title.trim(), description, tags });
      const nextSnapshot = snapshot(title.trim(), description, tags);
      if (title !== title.trim()) setTitle(title.trim());
      savedSnapshot.current = nextSnapshot;
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
      setSaveState("error");
      return false;
    }
  }, [description, noteId, tags, title]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [save]);

  const deepen = async () => {
    if (!noteId) { setStatus("请先保存灵感，再使用 AI 深化"); return; }
    setAiLoading(true);
    setStatus("AI 正在整理可执行方向...");
    try {
      if (dirty && !(await save())) return;
      const result = await api.aiDeepen(noteId, description || title) as { response: string };
      setDescription((value) => `${value}\n\n## AI 建议\n${result.response}`.trim());
      setStatus("AI 建议已加入正文，尚未保存");
    } catch (error) { setStatus(error instanceof Error ? error.message : "AI 请求失败"); }
    finally { setAiLoading(false); }
  };

  const convertToProject = async () => {
    if (!noteId || converting) return;
    setConverting(true);
    setStatus("正在准备设计项目...");
    try {
      if (dirty && !(await save())) return;
      const project = await api.convertToProject(noteId) as { id?: string; project_id?: string };
      const projectId = project.project_id || project.id;
      if (!projectId) throw new Error("转换成功，但未返回项目 ID");
      router.push(`/design/${projectId}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "转换失败"); }
    finally { setConverting(false); }
  };

  if (!loaded) return <div className="space-y-4"><div className="h-10 animate-pulse rounded bg-muted/50" /><div className="h-80 animate-pulse rounded border bg-muted/40" /></div>;

  const returnToList = () => {
    if (dirty && !window.confirm("当前还有未保存更改，确定返回灵感列表吗？")) return;
    router.push("/inspiration");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <Button variant="ghost" size="sm" onClick={returnToList}><ArrowLeft className="mr-1 h-4 w-4" />返回灵感列表</Button>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`mr-1 text-xs ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {saveState === "saving" ? "保存中..." : saveState === "saved" ? "已保存" : dirty ? "有未保存更改" : "已同步"}
          </span>
          <Button variant="outline" size="sm" disabled={aiLoading || !noteId} onClick={deepen}>{aiLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}AI 深化</Button>
          <Button variant="outline" size="sm" disabled={converting || !noteId} onClick={convertToProject}>{converting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Puzzle className="mr-1 h-4 w-4" />}转为设计项目</Button>
          <Button size="sm" disabled={saveState === "saving" || !dirty} onClick={() => save()}>{saveState === "saved" ? <Check className="mr-1 h-4 w-4" /> : <Save className="mr-1 h-4 w-4" />}保存</Button>
        </div>
      </div>

      <section className="space-y-4">
        <Input className="h-auto border-0 px-0 py-1 text-2xl font-bold shadow-none focus-visible:ring-0" placeholder="灵感标题..." value={title} onChange={(event) => setTitle(event.target.value)} />
        <TagSelector tags={tags} onChange={setTags} />
        {status && <p className={`text-xs ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`}>{status}</p>}
        <div className="border-y">
          <textarea className="min-h-[420px] w-full resize-y bg-transparent py-5 text-sm leading-7 focus:outline-none" placeholder="写下玩法、叙事、关卡或视觉方向..." value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground"><span>Ctrl+S 保存</span><span>{description.length} 字符</span></div>
      </section>
    </div>
  );
}
