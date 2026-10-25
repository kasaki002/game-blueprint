"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { InspirationNote } from "@/lib/types";

export function InspirationList() {
  const [notes, setNotes] = useState<InspirationNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"create" | "delete" | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingNote, setPendingNote] = useState<InspirationNote | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listNotes().then((data) => setNotes(data as InspirationNote[])).catch((err) => setError(err instanceof Error ? err.message : "加载失败")).finally(() => setLoading(false));
  }, []);

  const createNote = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setSubmitting(true);
    setError("");
    try {
      const note = await api.createNote({ title, tags: [], description: "" }) as InspirationNote;
      setNotes((current) => [note, ...current]);
      setDialog(null);
      setDraftTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally { setSubmitting(false); }
  };

  const deleteNote = async () => {
    if (!pendingNote) return;
    setSubmitting(true);
    setError("");
    try {
      await api.deleteNote(pendingNote.id);
      setNotes((current) => current.filter((note) => note.id !== pendingNote.id));
      setDialog(null);
      setPendingNote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-md border bg-muted/50" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{notes.length} 条灵感</p>
        <Button size="sm" onClick={() => { setDraftTitle(""); setDialog("create"); }}><Plus className="mr-1 h-4 w-4" />新建便签</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notes.length === 0 && (
        <div className="border-y py-16 text-center">
          <p className="text-sm font-medium">还没有灵感记录</p>
          <p className="mt-1 text-sm text-muted-foreground">建立第一条便签，把一闪而过的想法留下来。</p>
          <Button className="mt-5" size="sm" onClick={() => setDialog("create")}><Plus className="mr-1 h-4 w-4" />新建便签</Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {notes.map((note) => (
          <Card key={note.id} className="group relative min-h-36 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <Link href={`/inspiration/${note.id}`} className="block h-full">
              <CardHeader className="pb-3"><CardTitle className="pr-8 text-base">{note.title}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{note.description || "还没有正文内容"}</p>
                {note.tags.length > 0 && <div className="flex flex-wrap gap-1">{note.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarDays className="h-3 w-3" />{new Date(note.updated_at).toLocaleDateString("zh-CN")}</p>
              </CardContent>
            </Link>
            <button type="button" aria-label={`删除${note.title}`} title="删除便签" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100" onClick={() => { setPendingNote(note); setDialog("delete"); }}><Trash2 className="h-4 w-4" /></button>
          </Card>
        ))}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 p-4 backdrop-blur-[2px]" onMouseDown={() => !submitting && setDialog(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="inspiration-dialog-title" className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="inspiration-dialog-title" className="text-base font-semibold">{dialog === "create" ? "新建灵感便签" : "删除灵感便签"}</h2>
            {dialog === "create" ? (
              <><p className="mt-1 text-sm text-muted-foreground">先给这条灵感一个名字，稍后可以继续修改。</p><Input autoFocus className="mt-4" placeholder="例如：昼夜循环战斗机制" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createNote(); if (event.key === "Escape") setDialog(null); }} /></>
            ) : <p className="mt-2 text-sm text-muted-foreground">确认删除“{pendingNote?.title}”？删除后无法恢复。</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" disabled={submitting} onClick={() => setDialog(null)}>取消</Button>
              <Button variant={dialog === "delete" ? "destructive" : "default"} disabled={submitting || (dialog === "create" && !draftTitle.trim())} onClick={dialog === "create" ? createNote : deleteNote}>{submitting ? "处理中..." : dialog === "create" ? "创建" : "删除"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
