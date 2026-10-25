"use client";

import { useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { getTemplatesByCategory, type NodeTemplate } from "@/lib/node-templates";
import { cn } from "@/lib/utils";
import { NodeTypeIcon } from "./node-icon";

const groupedTemplates = getTemplatesByCategory();

export function NodePalette({ width = 240 }: { width?: number }) {
  const [query, setQuery] = useState("");

  const onDragStart = useCallback((event: React.DragEvent, template: NodeTemplate) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(template));
    event.dataTransfer.effectAllowed = "copy";
  }, []);

  const groups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return Object.entries(groupedTemplates)
      .map(([category, templates]) => [
        category,
        templates.filter((template) => !keyword || `${template.label} ${template.description} ${template.category}`.toLowerCase().includes(keyword)),
      ] as const)
      .filter(([, templates]) => templates.length > 0);
  }, [query]);

  return (
    <aside className="flex shrink-0 flex-col overflow-hidden border-r border-border bg-card" style={{ width }}>
      <div className="shrink-0 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">节点库</p>
          <span className="text-[10px] text-muted-foreground">拖入画布</span>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索节点…"
            aria-label="搜索节点类型"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2.5">
        {groups.length === 0 && <p className="px-2 py-8 text-center text-xs text-muted-foreground">没有匹配的节点类型</p>}
        {groups.map(([category, templates]) => (
          <section key={category} className="space-y-1.5">
            <p className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{category}</p>
            {templates.map((template) => (
              <div
                key={template.type}
                draggable
                onDragStart={(event) => onDragStart(event, template)}
                title={template.description}
                className={cn(
                  "group flex cursor-grab items-start gap-2.5 rounded-lg border border-transparent bg-background px-2 py-2 transition-colors hover:border-border hover:bg-accent/60 active:cursor-grabbing",
                )}
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
                  style={{ backgroundColor: `${template.color}18`, color: template.color }}
                  aria-hidden="true"
                >
                  <NodeTypeIcon type={template.type} className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{template.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground line-clamp-2">{template.description}</span>
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
