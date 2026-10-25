"use client";

import { Loader2, RefreshCw } from "lucide-react";

export type SyncState = "idle" | "saving" | "saved" | "error";

interface Props {
  message: string;
  syncState?: SyncState;
  savedAt?: number | null;
  syncError?: string;
  onRetry?: () => void;
}

function formatTime(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function StatusBar({ message, syncState = "idle", savedAt = null, syncError = "", onRetry }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 border-t bg-muted/50 px-4 py-1 text-xs text-muted-foreground">
      <span className="min-w-0 truncate">{message}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {syncState === "saving" && <><Loader2 className="h-3 w-3 animate-spin" />正在保存…</>}
        {syncState === "saved" && savedAt !== null && <>已保存 {formatTime(savedAt)}</>}
        {syncState === "error" && (
          <button type="button" className="flex items-center gap-1 text-destructive hover:underline" onClick={onRetry} title={syncError || "同步失败"}>
            <RefreshCw className="h-3 w-3" />同步失败，点击重试
          </button>
        )}
        {syncState === "idle" && <>已就绪</>}
      </span>
    </div>
  );
}
