import type { WorkspaceData } from "./workspace-manager";

export type SaveQueueState = "saving" | "saved" | "error";

export interface WorkspaceSaveQueueCallbacks {
  save: (workspace: WorkspaceData, baseRevision: number) => Promise<{ revision: number }>;
  onStateChange?: (state: SaveQueueState) => void;
  onSaved?: (revision: number, workspace: WorkspaceData, hasPending: boolean) => void;
  onConflict?: (payload: string, workspace: WorkspaceData) => void;
  onError?: (error: unknown, workspace: WorkspaceData) => void;
}

/**
 * Serializes canvas saves. At most one PUT is in flight; edits made during a
 * request collapse into the next snapshot, which is sent with the revision
 * returned by the previous response.
 */
export class WorkspaceSaveQueue {
  private pending: WorkspaceData | null = null;
  private inFlight = false;
  private stopped = false;
  private revision: number;

  constructor(revision: number, private readonly callbacks: WorkspaceSaveQueueCallbacks) {
    this.revision = revision;
  }

  get currentRevision(): number {
    return this.revision;
  }

  get isSaving(): boolean {
    return this.inFlight;
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  setRevision(revision: number, options?: { clearPending?: boolean }): void {
    this.revision = revision;
    if (options?.clearPending) this.pending = null;
  }

  clearPending(): void {
    this.pending = null;
  }

  enqueue(workspace: WorkspaceData): void {
    if (this.stopped) return;
    this.pending = workspace;
    void this.drain();
  }

  retry(): void {
    if (this.stopped) return;
    void this.drain();
  }

  dispose(): void {
    this.stopped = true;
    this.pending = null;
  }

  async drain(): Promise<boolean> {
    if (this.stopped || this.inFlight) return false;
    const workspace = this.pending;
    if (!workspace) return false;

    this.pending = null;
    this.inFlight = true;
    this.callbacks.onStateChange?.("saving");
    let failed = false;

    try {
      const result = await this.callbacks.save(workspace, this.revision);
      this.revision = result.revision;
      const hasPending = this.pending !== null;
      this.callbacks.onStateChange?.(hasPending ? "saving" : "saved");
      this.callbacks.onSaved?.(result.revision, workspace, hasPending);
      return true;
    } catch (error) {
      failed = true;
      const typed = error as { status?: number; payload?: string };
      if (typed.status === 409 && typed.payload) {
        this.pending = null;
        this.callbacks.onConflict?.(typed.payload, workspace);
      } else {
        if (!this.pending) this.pending = workspace;
        this.callbacks.onStateChange?.("error");
        this.callbacks.onError?.(error, workspace);
      }
      return false;
    } finally {
      this.inFlight = false;
      if (!failed && !this.stopped && this.pending) void this.drain();
    }
  }
}
