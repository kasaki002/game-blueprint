import type { Edge, Node } from "reactflow";

/** Workspace persistence manager for design module. */

const STORAGE_KEY = "game-blueprint-workspace";

export const WORKSPACE_SCHEMA_VERSION = 2;

export interface WorkspaceTab {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
  lastModified: number;
}

export interface WorkspaceData {
  schemaVersion: number;
  tabs: WorkspaceTab[];
  activeTabId: string;
  timestamp: number;
}

export class WorkspaceManager {
  private static key(projectId: string): string {
    return `${STORAGE_KEY}:${projectId}`;
  }

  static save(projectId: string, data: WorkspaceData): boolean {
    try {
      localStorage.setItem(this.key(projectId), JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  static load(projectId: string): WorkspaceData | null {
    try {
      const raw = localStorage.getItem(this.key(projectId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static clear(projectId: string): void {
    localStorage.removeItem(this.key(projectId));
  }
}
