"use client";

import { createContext, useContext, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";
import { X } from "lucide-react";

export const EdgeDeleteContext = createContext<((edgeId: string) => void) | null>(null);

export function EnergyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const deleteEdge = useContext(EdgeDeleteContext);
  const accent = (data as { color?: string } | undefined)?.color ?? "hsl(var(--primary))";
  const active = selected || hovered;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.3,
  });

  return (
    <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <defs>
        <linearGradient id={`edge-gradient-${id}`} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={accent} stopOpacity={0.85} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.32} />
        </linearGradient>
        <marker
          id={`edge-arrow-${id}`}
          viewBox="0 0 14 14"
          refX="12"
          refY="7"
          markerWidth="14"
          markerHeight="14"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M 1 1 L 13 7 L 1 13 L 4 7 Z" fill={accent} />
        </marker>
      </defs>

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={`url(#edge-arrow-${id})`}
        style={{
          stroke: active ? accent : `url(#edge-gradient-${id})`,
          strokeWidth: active ? 2.6 : 2,
          filter: active ? `drop-shadow(0 0 4px ${accent}55)` : undefined,
          transition: "stroke 160ms ease, stroke-width 160ms ease, filter 160ms ease",
        }}
      />

      {selected && deleteEdge && (
        <EdgeLabelRenderer>
          <button
            type="button"
            title="删除连接"
            aria-label="删除连接"
            className="nodrag nopan absolute grid h-5 w-5 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-destructive hover:text-destructive"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
            onClick={(event) => {
              event.stopPropagation();
              deleteEdge(id);
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}
