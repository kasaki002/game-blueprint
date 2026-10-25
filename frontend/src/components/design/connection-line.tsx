"use client";

import type { ConnectionLineComponentProps } from "reactflow";

export function AnimatedConnectionLine({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
  const path = `M ${fromX},${fromY} C ${fromX + 96},${fromY} ${toX - 96},${toY} ${toX},${toY}`;

  return (
    <g>
      <path d={path} fill="none" stroke="hsl(var(--primary) / 0.1)" strokeWidth={12} strokeLinecap="round" />
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" className="connection-line-active" />
      <circle cx={toX} cy={toY} r={5} fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth={2} />
    </g>
  );
}
