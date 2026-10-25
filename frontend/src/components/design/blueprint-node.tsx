"use client";

import type { CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

import { NodeTemplates } from "@/lib/node-templates";
import { cn } from "@/lib/utils";
import { NodeTypeIcon } from "./node-icon";

export interface BlueprintNodeData {
  label: string;
  template: string;
  color: string;
  formData: Record<string, unknown>;
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.filter(Boolean).join("、");
  if (value === null || value === undefined) return "";
  return String(value);
}

export function BlueprintNode({ data, selected }: NodeProps<BlueprintNodeData>) {
  const template = NodeTemplates[data.template];
  const accent = data.color || "#64748b";
  const title = String(data.formData?.name || data.label || template?.label || "未命名节点");
  const meta = (template?.fields ?? [])
    .filter((field) => field.name !== "name")
    .map((field) => ({ label: field.label, value: formatValue(data.formData?.[field.name]) }))
    .filter((item) => item.value)
    .slice(0, 2);

  return (
    <div
      className={cn(
        "blueprint-node group relative w-[236px] select-none rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        selected && "blueprint-node-selected",
      )}
      style={{ "--node-accent": accent, borderColor: selected ? accent : undefined } as CSSProperties}
      data-template={data.template}
    >
      <span
        className="pointer-events-none absolute inset-y-3 left-0 w-[3px] rounded-r-full"
        style={{ backgroundColor: accent }}
        aria-hidden="true"
      />

      <Handle type="target" position={Position.Left} className="blueprint-port blueprint-port-target !left-0 !top-1/2 !-translate-x-1/2 !-translate-y-1/2" />
      <Handle type="source" position={Position.Right} className="blueprint-port blueprint-port-source !right-0 !top-1/2 !translate-x-1/2 !-translate-y-1/2" />

      <div className="flex items-start gap-3 px-3.5 pb-2.5 pt-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
          style={{ backgroundColor: `${accent}18`, color: accent }}
          aria-hidden="true"
        >
          <NodeTypeIcon type={data.template} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="truncate">{template?.label ?? "节点"}</span>
            <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
            <span className="truncate">{template?.category ?? "自定义"}</span>
          </div>
          <p className="mt-1 truncate text-[13px] font-semibold leading-5">{title}</p>
        </div>
      </div>

      {meta.length > 0 && (
        <div className="grid grid-cols-2 gap-1 border-t border-border px-3 py-2">
          {meta.map((item) => (
            <div key={item.label} className="min-w-0 rounded-md bg-muted/60 px-2 py-1">
              <p className="truncate text-[9px] text-muted-foreground">{item.label}</p>
              <p className="truncate text-[11px] font-medium text-foreground/90">{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
