"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download, FileJson, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BACKEND_URL } from "@/lib/api-client";

interface Props { reportId: string; }

export function ExportDropdown({ reportId }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const download = async (format: "md" | "json") => {
    setOpen(false);
    setStatus("loading");
    try {
      const response = await fetch(`${BACKEND_URL}/analyze/${reportId}/export`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format }) });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `report-${reportId}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch { setStatus("error"); window.setTimeout(() => setStatus("idle"), 2200); }
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button variant="outline" size="sm" disabled={status === "loading"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {status === "done" ? <Check className="mr-1 h-4 w-4" /> : <Download className="mr-1 h-4 w-4" />}
        {status === "loading" ? "导出中" : status === "done" ? "已导出" : status === "error" ? "导出失败" : "导出"}
        <ChevronDown className="ml-1 h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-48 rounded-md border bg-popover p-1 shadow-lg">
          <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent" onClick={() => download("md")}><FileText className="h-4 w-4" /><span><span className="block">Markdown</span><span className="block text-[11px] text-muted-foreground">适合继续编辑</span></span></button>
          <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent" onClick={() => download("json")}><FileJson className="h-4 w-4" /><span><span className="block">JSON 数据</span><span className="block text-[11px] text-muted-foreground">包含结构化报告</span></span></button>
        </div>
      )}
    </div>
  );
}
