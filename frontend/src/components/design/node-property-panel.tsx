"use client";

import type { Node } from "reactflow";
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NodeTemplates, type NodeField } from "@/lib/node-templates";
import type { BlueprintNodeData } from "./blueprint-node";
import { NodeTypeIcon } from "./node-icon";
import { PropertySlider } from "./property-slider";

interface Props {
  node: Node<BlueprintNodeData> | null;
  onChange: (field: string, value: unknown) => void;
  onClose: () => void;
}

function getNumberRange(field: NodeField, value: number) {
  const min = field.min ?? 0;
  const max = field.max ?? Math.max(100, Math.ceil(value * 2 / 10) * 10);
  return { min, max, step: field.step ?? 1 };
}

export function NodePropertyPanel({ node, onChange, onClose }: Props) {
  if (!node) return null;

  const template = NodeTemplates[node.data.template];

  const nodeName = String(node.data.formData.name || node.data.label);

  return (
    <section className="flex h-full min-h-0 flex-col bg-card" aria-label="节点编辑">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b px-4">
        <span className="h-5 w-1 rounded-sm" style={{ backgroundColor: node.data.color }} aria-hidden="true" />
        <span className="text-sm font-semibold">编辑节点</span>
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded" style={{ backgroundColor: `${node.data.color}18`, color: node.data.color }}>
          <NodeTypeIcon type={node.data.template} className="h-3 w-3" />
        </span>
        <span className="min-w-0 truncate text-sm">{nodeName}</span>
        <span className="text-xs text-muted-foreground">{template?.label || "节点"}</span>
        <button type="button" className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-accent" onClick={onClose} aria-label="关闭节点编辑" title="关闭节点编辑">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="border-b px-4 py-3 md:border-b-0 md:border-r">
          <p className="text-xs font-medium">{template?.label || "节点属性"}</p>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{template?.description}</p>
        </div>
        <div className="overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        {template?.fields.map((field) => {
          const value = node.data.formData[field.name] ?? field.default ?? "";
          const fieldClassName = cn(
            "min-w-0",
            (field.type === "textarea" || field.type === "array") && "md:col-span-2",
          );

          if (field.type === "number") {
            const numericValue = Number(value) || 0;
            const range = getNumberRange(field, numericValue);
            return (
              <div key={field.name} className={fieldClassName}>
                <PropertySlider
                  label={field.label}
                  value={numericValue}
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  onChange={(next) => onChange(field.name, next)}
                />
              </div>
            );
          }

          if (field.type === "select") {
            return (
              <div key={field.name} className={cn(fieldClassName, "space-y-1.5")}>
                <label className="text-xs font-medium">{field.label}</label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  value={String(value)}
                  onChange={(event) => onChange(field.name, event.target.value)}
                >
                  {field.options?.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.type === "boolean") {
            return (
              <label key={field.name} className={cn(fieldClassName, "flex h-9 items-center justify-between gap-3 text-xs font-medium")}>
                {field.label}
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => onChange(field.name, event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            );
          }

          if (field.type === "textarea" || field.type === "array") {
            return (
              <div key={field.name} className={cn(fieldClassName, "space-y-1.5")}>
                <label className="text-xs font-medium">{field.label}</label>
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border bg-background p-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  value={Array.isArray(value) ? value.join("\n") : String(value)}
                  onChange={(event) => onChange(
                    field.name,
                    field.type === "array" ? event.target.value.split("\n").filter(Boolean) : event.target.value,
                  )}
                />
              </div>
            );
          }

          return (
            <div key={field.name} className={cn(fieldClassName, "space-y-1.5")}>
              <label className="text-xs font-medium">{field.label}</label>
              <Input
                className="h-9 text-xs"
                value={String(value)}
                onChange={(event) => onChange(field.name, event.target.value)}
              />
            </div>
          );
        })}
          </div>
        </div>
      </div>
    </section>
  );
}
