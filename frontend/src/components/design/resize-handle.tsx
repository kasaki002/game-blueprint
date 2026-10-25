"use client";

import { useCallback } from "react";

import { cn } from "@/lib/utils";

interface Props {
  onResize: (delta: number) => void;
  direction?: "normal" | "reverse";
  orientation?: "vertical" | "horizontal";
  className?: string;
}

export function ResizeHandle({ onResize, direction = "normal", orientation = "vertical", className }: Props) {
  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    let lastPosition = orientation === "vertical" ? event.clientX : event.clientY;
    const multiplier = direction === "reverse" ? -1 : 1;
    const handleMove = (moveEvent: PointerEvent) => {
      const nextPosition = orientation === "vertical" ? moveEvent.clientX : moveEvent.clientY;
      onResize((nextPosition - lastPosition) * multiplier);
      lastPosition = nextPosition;
    };
    const handleUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    document.body.style.cursor = orientation === "vertical" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [direction, onResize, orientation]);

  if (orientation === "horizontal") {
    return (
      <div role="separator" aria-orientation="horizontal" className={cn("group relative z-20 h-1 shrink-0 cursor-row-resize bg-border/70", className)} onPointerDown={startResize}>
        <span className="absolute -bottom-1 -top-1 inset-x-0 transition-colors group-hover:bg-primary/10" />
        <span className="absolute left-1/2 top-1/2 h-0.5 w-9 -translate-x-1/2 -translate-y-1/2 rounded bg-muted-foreground/30 transition-colors group-hover:bg-primary/60" />
      </div>
    );
  }

  return (
    <div role="separator" aria-orientation="vertical" className={cn("group relative z-20 w-1 shrink-0 cursor-col-resize bg-border/70", className)} onPointerDown={startResize}>
      <span className="absolute inset-y-0 -left-1 -right-1 transition-colors group-hover:bg-primary/10" />
      <span className="absolute left-1/2 top-1/2 h-9 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-muted-foreground/30 transition-colors group-hover:bg-primary/60" />
    </div>
  );
}
