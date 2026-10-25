"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Pencil, Plus, Send, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BACKEND_URL, directRequest } from "@/lib/api-client";

interface Session { id: string; title: string; game_id: string | null; updated_at: string; }
interface Message { id: string; role: "user" | "assistant"; content: string; status: string; }

export function ChatPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadSessions = async () => {
    const rows = await directRequest<Session[]>("/analyze/chat/sessions");
    setSessions(rows);
    if (!activeId && rows[0]) setActiveId(rows[0].id);
  };

  useEffect(() => { loadSessions().catch(() => undefined); }, []);
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    directRequest<Message[]>(`/analyze/chat/sessions/${activeId}/messages`).then(setMessages).catch(() => setMessages([]));
  }, [activeId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const createSession = async () => {
    const session = await directRequest<Session>("/analyze/chat/sessions", { method: "POST", body: JSON.stringify({ title: "新对话" }) });
    setSessions((current) => [session, ...current]);
    setActiveId(session.id);
  };

  const renameSession = async (session: Session) => {
    const title = window.prompt("输入新的对话名称", session.title)?.trim();
    if (!title) return;
    const updated = await directRequest<Session>(`/analyze/chat/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
    setSessions((current) => current.map((item) => item.id === session.id ? updated : item));
  };

  const deleteSession = async (session: Session) => {
    if (!window.confirm(`删除对话“${session.title}”？`)) return;
    await directRequest(`/analyze/chat/sessions/${session.id}`, { method: "DELETE" });
    const remaining = sessions.filter((item) => item.id !== session.id);
    setSessions(remaining);
    if (activeId === session.id) setActiveId(remaining[0]?.id || null);
  };

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    let sessionId = activeId;
    if (!sessionId) {
      const created = await directRequest<Session>("/analyze/chat/sessions", { method: "POST", body: JSON.stringify({ title: question.slice(0, 32) }) });
      setSessions((current) => [created, ...current]);
      setActiveId(created.id);
      sessionId = created.id;
    }
    const optimistic: Message = { id: `local-${Date.now()}`, role: "user", content: question, status: "completed" };
    setMessages((current) => [...current, optimistic]);
    setInput("");
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/analyze/chat/sessions/${sessionId}/messages`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question }) });
      if (!response.ok) throw new Error(await response.text());
      const text = await response.text();
      const line = text.split("\n").find((item) => item.startsWith("data: "));
      const message = line ? JSON.parse(line.slice(6)).message as Message : null;
      if (message) setMessages((current) => [...current, message]);
      await loadSessions();
    } catch (error) {
      setMessages((current) => [...current, { id: `error-${Date.now()}`, role: "assistant", content: error instanceof Error ? error.message : "请求失败", status: "failed" }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-[620px] overflow-hidden border bg-background">
      <aside className="w-56 shrink-0 border-r bg-muted/20">
        <div className="flex h-12 items-center justify-between border-b px-3"><span className="text-sm font-medium">对话记录</span><Button size="icon" variant="ghost" className="h-8 w-8" title="新对话" onClick={createSession}><Plus className="h-4 w-4" /></Button></div>
        <div className="max-h-[568px] overflow-y-auto p-2">{sessions.map((session) => <div key={session.id} className={`group mb-1 flex items-center rounded-md ${activeId === session.id ? "bg-accent" : "hover:bg-accent/60"}`}><button className="min-w-0 flex-1 truncate px-2 py-2 text-left text-xs" onClick={() => setActiveId(session.id)}>{session.title}</button><button className="hidden h-7 w-7 place-items-center group-hover:grid" title="重命名" onClick={() => renameSession(session)}><Pencil className="h-3 w-3" /></button><button className="hidden h-7 w-7 place-items-center text-destructive group-hover:grid" title="删除" onClick={() => deleteSession(session)}><Trash2 className="h-3 w-3" /></button></div>)}</div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">{messages.length === 0 && <div className="grid h-full place-items-center text-center text-sm text-muted-foreground"><div><Bot className="mx-auto mb-3 h-8 w-8" />创建或选择一条对话，然后开始分析。</div></div>}{messages.map((message) => <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <Bot className="mt-2 h-4 w-4 shrink-0" />}<div className={`max-w-[82%] whitespace-pre-wrap rounded-md px-4 py-2.5 text-sm leading-6 ${message.role === "user" ? "bg-primary text-primary-foreground" : message.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{message.content}</div>{message.role === "user" && <User className="mt-2 h-4 w-4 shrink-0" />}</div>)}{loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}<div ref={bottomRef} /></div>
        <div className="flex gap-2 border-t p-4"><Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入游戏分析问题" onKeyDown={(event) => { if (event.key === "Enter") send(); }} /><Button size="icon" onClick={send} disabled={loading || !input.trim()}><Send className="h-4 w-4" /></Button></div>
      </section>
    </div>
  );
}
