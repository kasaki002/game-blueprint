"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { NodeTemplates, type NodeTemplate } from "@/lib/node-templates";
import { NodeTypeIcon } from "./node-icon";

interface Props {
  x: number;
  y: number;
  onAdd: (template: NodeTemplate) => void;
  onClose: () => void;
}

export function CanvasQuickAdd({ x, y, onAdd, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const templates = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return Object.values(NodeTemplates).filter((template) => {
      if (!keyword) return true;
      return `${template.label} ${template.category} ${template.description}`.toLowerCase().includes(keyword);
    });
  }, [query]);

  const width = 288;
  const height = 380;
  const left = typeof window === "undefined" ? x : Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const top = typeof window === "undefined" ? y : Math.max(8, Math.min(y, window.innerHeight - height - 8));

  return (
    <div
      className="fixed z-[80] overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
      style={{ left, top, width }}
      data-quick-add="true"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && templates[0]) onAdd(templates[0]);
          }}
          placeholder="搜索节点类型…"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          aria-label="搜索节点类型"
        />
        <button type="button" className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent" onClick={onClose} aria-label="关闭快速添加">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto p-1.5">
        {templates.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">没有匹配的节点类型</p>}
        {templates.map((template) => (
          <button
            key={template.type}
            type="button"
            className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
            onClick={() => onAdd(template)}
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
              style={{ backgroundColor: `${template.color}18`, color: template.color }}
            >
              <NodeTypeIcon type={template.type} className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium">{template.label}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{template.description}</span>
            </span>
          </button>
        ))}
      </div>

      <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">双击画布可随时打开 · Enter 添加首个 · Esc 关闭</p>
    </div>
  );
}
