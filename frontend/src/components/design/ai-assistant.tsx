"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props { projectId: string; }

export function AiAssistant({ projectId }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const sessionRef = useRef(`design-${projectId}-${Date.now()}`);

  const ask = async () => {
    const question = input.trim();
    if (!question || loading) return;
    setLoading(true);
    setAnswer("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `你正在协助一个游戏设计项目。请给出具体、可执行的设计建议。\n项目标识：${projectId}\n问题：${question}`, session_id: sessionRef.current }),
      });
      if (!response.ok) throw new Error(await response.text());
      const text = await response.text();
      const dataLines = text.split("\n").filter((line) => line.startsWith("data: "));
      const content = dataLines.map((line) => { try { return JSON.parse(line.slice(6)).content || ""; } catch { return ""; } }).join("") || text;
      setAnswer(content);
      setInput("");
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "AI 请求失败");
    } finally { setLoading(false); }
  };

  return (
    <section className="shrink-0 border-t bg-background">
      <button type="button" className="flex h-9 w-full items-center gap-2 px-4 text-left text-xs font-medium transition-colors hover:bg-accent" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
        <Sparkles className="h-3.5 w-3.5" /><span>AI 设计助手</span>
        {answer && collapsed && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        {collapsed ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t px-4 py-3">
            {answer && <div className="mb-3 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-xs leading-5">{answer}</div>}
            <div className="flex items-end gap-2">
              <textarea className="min-h-9 max-h-24 flex-1 resize-y rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" placeholder="询问玩法循环、数值、关卡或叙事建议..." value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(); } }} />
              <Button size="icon" className="h-9 w-9" aria-label="发送设计问题" title="发送" disabled={loading || !input.trim()} onClick={ask}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
