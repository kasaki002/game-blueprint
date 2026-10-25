"use client";

import { Frame, Hand, Keyboard, LayoutGrid, Map, MousePointer2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type CanvasMode = "pan" | "select";

interface Props {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  onFitView: () => void;
  onArrange: () => void;
  miniMap: boolean;
  onToggleMiniMap: () => void;
  shortcutsOpen: boolean;
  onToggleShortcuts: () => void;
}

export function CanvasToolbar({
  mode,
  onModeChange,
  onFitView,
  onArrange,
  miniMap,
  onToggleMiniMap,
  shortcutsOpen,
  onToggleShortcuts,
}: Props) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-background/95 p-1 shadow-md backdrop-blur">
      <ToolButton label="平移模式（空格拖动）" active={mode === "pan"} onClick={() => onModeChange("pan")}>
        <Hand className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="框选模式（Shift 拖动）" active={mode === "select"} onClick={() => onModeChange("select")}>
        <MousePointer2 className="h-4 w-4" />
      </ToolButton>
      <Divider />
      <ToolButton label="适应画布" onClick={onFitView}>
        <Frame className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="自动整理布局" onClick={onArrange}>
        <LayoutGrid className="h-4 w-4" />
      </ToolButton>
      <ToolButton label={miniMap ? "隐藏缩略图" : "显示缩略图"} active={miniMap} onClick={onToggleMiniMap}>
        <Map className="h-4 w-4" />
      </ToolButton>
      <Divider />
      <ToolButton label="画布快捷键" active={shortcutsOpen} onClick={onToggleShortcuts}>
        <Keyboard className="h-4 w-4" />
      </ToolButton>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />;
}

function ToolButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-foreground text-background hover:bg-foreground hover:text-background",
      )}
    >
      {children}
    </button>
  );
}
