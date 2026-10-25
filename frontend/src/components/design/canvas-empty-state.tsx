"use client";

import Lottie from "lottie-react";

import { canvasGuideAnimation } from "@/lib/animations";
import { useReducedMotion } from "@/lib/use-reduced-motion";

export function CanvasEmptyState() {
  const reducedMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex max-w-xs flex-col items-center text-center">
        {reducedMotion ? (
          <div className="mb-4 grid h-24 w-24 place-items-center rounded-full border-2 border-dashed border-primary/30 text-2xl text-primary" aria-hidden="true">
            +
          </div>
        ) : (
          <Lottie
            animationData={canvasGuideAnimation}
            className="h-36 w-44"
            loop
            aria-hidden="true"
          />
        )}
        <p className="text-sm font-medium text-foreground">双击画布快速添加节点</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          也可以从左侧节点库拖入模板，再拖动节点两侧的端口建立连接。
        </p>
      </div>
    </div>
  );
}
