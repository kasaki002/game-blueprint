"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { ReactFlowProvider, useReactFlow, type Edge, type Node } from "reactflow";

import { Input } from "@/components/ui/input";
import { BACKEND_URL, api, directRequest } from "@/lib/api-client";
import type { DesignProject } from "@/lib/types";
import { WORKSPACE_SCHEMA_VERSION, WorkspaceManager, type WorkspaceData, type WorkspaceTab } from "@/lib/workspace-manager";
import { contentKey, mergeWorkspaces, normalizeWorkspace, tabContentKey, type MergeStats } from "@/lib/workspace-sync";
import { WorkspaceSaveQueue } from "@/lib/workspace-save-queue";
import { AiAssistant } from "./ai-assistant";
import type { BlueprintNodeData } from "./blueprint-node";
import { NodeCanvas, type CanvasCommand } from "./node-canvas";
import { NodePalette } from "./node-palette";
import { NodePropertyPanel } from "./node-property-panel";
import { ProjectToolbar } from "./project-toolbar";
import { ReferencePanel } from "./reference-panel";
import { ResizeHandle } from "./resize-handle";
import { StatusBar, type SyncState } from "./status-bar";

interface Props { projectId: string; }

interface ConflictState {
  serverWorkspace: WorkspaceData;
  serverRevision: number;
  merged: WorkspaceData;
  stats: MergeStats;
}

const CHANNEL_NAME = "game-blueprint-design";

function randomId(prefix: string) {
  const uuid = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function createTab(index: number, id = randomId("tab"), name = `项目 ${index}`): WorkspaceTab {
  return { id, name, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, lastModified: Date.now() };
}

function activeTabOf(workspace: WorkspaceData): WorkspaceTab {
  return workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? workspace.tabs[0];
}

function WorkbenchInner({ projectId }: Props) {
  const router = useRouter();
  const { getViewport } = useReactFlow();
  const firstTabRef = useRef(createTab(1, `tab-${projectId}-1`));
  const [tabs, setTabs] = useState<WorkspaceTab[]>([firstTabRef.current]);
  const [activeTabId, setActiveTabId] = useState(firstTabRef.current.id);
  const [statusMessage, setStatusMessage] = useState("工作区已就绪");
  const [selectedNode, setSelectedNode] = useState<Node<BlueprintNodeData> | null>(null);
  const [editedNode, setEditedNode] = useState<Node<BlueprintNodeData> | null>(null);
  const [paletteWidth, setPaletteWidth] = useState(240);
  const [editorHeight, setEditorHeight] = useState(260);
  const [referenceWidth, setReferenceWidth] = useState(224);
  const [referenceCollapsed, setReferenceCollapsed] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [nameDialog, setNameDialog] = useState<{ mode: "create" | "rename"; tabId?: string } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [canvasCommand, setCanvasCommand] = useState<CanvasCommand>(null);
  const [canvasResetToken, setCanvasResetToken] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState("");
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [remoteUpdate, setRemoteUpdate] = useState<{ revision: number } | null>(null);

  const tabsRef = useRef<WorkspaceTab[]>([firstTabRef.current]);
  const activeTabIdRef = useRef(firstTabRef.current.id);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const latestWorkspaceRef = useRef<WorkspaceData | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContentKeyRef = useRef<string>(tabContentKey(firstTabRef.current));
  const channelRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef("");
  const conflictRef = useRef<ConflictState | null>(null);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const openConflictRef = useRef<(payload: string, localWorkspace: WorkspaceData) => void>(() => undefined);
  const queueRef = useRef<WorkspaceSaveQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new WorkspaceSaveQueue(0, {
      save: (workspace, baseRevision) => directRequest<{ revision: number }>(`/design/projects/${projectIdRef.current}/canvas`, {
        method: "PUT",
        body: JSON.stringify({ workspace, base_revision: baseRevision }),
      }),
      onStateChange: (state) => {
        setSyncState(state);
        if (state === "saving") setSyncError("");
      },
      onSaved: (revision, _workspace, hasPending) => {
        revisionRef.current = revision;
        setSavedAt(Date.now());
        setRemoteUpdate((current) => (current && current.revision <= revision ? null : current));
        if (!hasPending) dirtyRef.current = false;
        channelRef.current?.postMessage({
          type: "workspace-saved",
          projectId: projectIdRef.current,
          revision,
          sourceId: clientIdRef.current,
        });
      },
      onConflict: (payload, workspace) => {
        dirtyRef.current = false;
        openConflictRef.current(payload, latestWorkspaceRef.current ?? workspace);
      },
      onError: (error) => {
        dirtyRef.current = true;
        setSyncError(error instanceof Error ? error.message : "同步失败");
      },
    });
  }

  const applyTabs = useCallback((nextTabs: WorkspaceTab[], nextActiveId: string) => {
    tabsRef.current = nextTabs;
    activeTabIdRef.current = nextActiveId;
    setTabs(nextTabs);
    setActiveTabId(nextActiveId);
  }, []);

  const bumpCanvasReset = useCallback(() => setCanvasResetToken((value) => value + 1), []);

  const openConflict = useCallback((payload: string, localWorkspace: WorkspaceData) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      const outer = JSON.parse(payload) as {
        detail?: { workspace?: unknown; revision?: number };
        workspace?: unknown;
        revision?: number;
      };
      const detail = outer.detail ?? outer;
      if (detail?.workspace === undefined) throw new Error("conflict response is missing the server workspace");
      const serverWorkspace = normalizeWorkspace(detail.workspace, projectId, localWorkspace.tabs[0]?.name ?? "设计项目");
      const serverRevision = Number(detail.revision) || 0;
      const { workspace: merged, stats } = mergeWorkspaces(localWorkspace, serverWorkspace);
      const next: ConflictState = { serverWorkspace, serverRevision, merged, stats };
      conflictRef.current = next;
      setConflict(next);
      setSyncState("idle");
      setStatusMessage("检测到画布版本冲突，请选择保留方式");
    } catch {
      dirtyRef.current = true;
      setSyncState("error");
      setSyncError("版本冲突响应无法解析");
    }
  }, [projectId]);
  openConflictRef.current = openConflict;

  const enqueueSave = useCallback((workspace: WorkspaceData) => {
    latestWorkspaceRef.current = workspace;
    dirtyRef.current = true;
    queueRef.current?.enqueue(workspace);
  }, []);

  const saveWorkspace = useCallback((currentTabs: WorkspaceTab[], activeId: string, delay = 700) => {
    const workspace: WorkspaceData = { schemaVersion: WORKSPACE_SCHEMA_VERSION, tabs: currentTabs, activeTabId: activeId, timestamp: Date.now() };
    latestWorkspaceRef.current = workspace;
    WorkspaceManager.save(projectId, workspace);
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      enqueueSave(workspace);
    }, delay);
  }, [enqueueSave, projectId]);

  const updateTabs = useCallback((
    updater: (current: WorkspaceTab[]) => WorkspaceTab[],
    nextActiveId = activeTabIdRef.current,
    options?: { save?: boolean; delay?: number },
  ) => {
    const next = updater(tabsRef.current);
    applyTabs(next, nextActiveId);
    if (options?.save !== false) saveWorkspace(next, nextActiveId, options?.delay ?? 700);
  }, [applyTabs, saveWorkspace]);

  const currentWorkspace = useCallback((): WorkspaceData => ({
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    tabs: tabsRef.current,
    activeTabId: activeTabIdRef.current,
    timestamp: Date.now(),
  }), []);

  const loadRemoteWorkspace = useCallback(async (expectedRevision?: number) => {
    try {
      const project = await api.getProject(projectId) as DesignProject;
      if (expectedRevision !== undefined && project.revision < expectedRevision) return;
      const workspace = normalizeWorkspace(project.canvas_state, project.id, project.name, new Date(project.updated_at).getTime());
      const nextActiveId = workspace.tabs.some((tab) => tab.id === workspace.activeTabId) ? workspace.activeTabId : workspace.tabs[0].id;
      revisionRef.current = project.revision || 0;
      queueRef.current?.setRevision(project.revision || 0, { clearPending: true });
      applyTabs(workspace.tabs, nextActiveId);
      bumpCanvasReset();
      setSelectedNode(null);
      setEditedNode(null);
      lastContentKeyRef.current = tabContentKey(activeTabOf({ ...workspace, activeTabId: nextActiveId }));
      WorkspaceManager.save(projectId, workspace);
      latestWorkspaceRef.current = workspace;
      dirtyRef.current = false;
      setRemoteUpdate(null);
      setStatusMessage("已载入另一个标签页的更新");
    } catch {
      setStatusMessage("载入最新版本失败，请重试");
    }
  }, [applyTabs, bumpCanvasReset, projectId]);

  const handleLoadRemote = useCallback(() => {
    if (!remoteUpdate) return;
    if (queueRef.current?.isSaving) {
      setStatusMessage("正在保存当前更改，请稍后再载入最新版本");
      return;
    }
    if (dirtyRef.current && !window.confirm("载入最新版本会覆盖本地未保存的更改，确定继续吗？")) return;
    void loadRemoteWorkspace(remoteUpdate.revision);
  }, [loadRemoteWorkspace, remoteUpdate]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const local = WorkspaceManager.load(projectId);
      let server: WorkspaceData | null = null;
      try {
        const project = await api.getProject(projectId) as DesignProject;
        revisionRef.current = project.revision || 0;
        queueRef.current?.setRevision(project.revision || 0, { clearPending: true });
        server = normalizeWorkspace(project.canvas_state, project.id, project.name, new Date(project.updated_at).getTime());
      } catch {
        server = null;
      }
      if (cancelled) return;
      const restored = local && (!server || local.timestamp >= server.timestamp)
        ? normalizeWorkspace(local, projectId, server?.tabs[0]?.name ?? "设计项目")
        : server;
      if (restored) {
        const nextActiveId = restored.tabs.some((tab) => tab.id === restored.activeTabId) ? restored.activeTabId : restored.tabs[0].id;
        applyTabs(restored.tabs, nextActiveId);
        lastContentKeyRef.current = tabContentKey(activeTabOf({ ...restored, activeTabId: nextActiveId }));
        WorkspaceManager.save(projectId, restored);
        latestWorkspaceRef.current = restored;
        dirtyRef.current = false;
      }
      setWorkspaceReady(true);
    };
    restore();
    return () => { cancelled = true; };
  }, [applyTabs, projectId]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    clientIdRef.current = randomId("client");
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; projectId?: string; revision?: number; sourceId?: string };
      if (message?.type !== "workspace-saved" || message.projectId !== projectId) return;
      if (!message.sourceId || message.sourceId === clientIdRef.current) return;
      const revision = Number(message.revision) || 0;
      if (revision <= revisionRef.current) return;
      if (conflictRef.current || dirtyRef.current) {
        setRemoteUpdate({ revision });
        return;
      }
      void loadRemoteWorkspace(revision);
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [loadRemoteWorkspace, projectId]);

  const flushWorkspace = useCallback(() => {
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const workspace = latestWorkspaceRef.current;
    if (!workspace) return;
    if (!queueRef.current?.isSaving) {
      queueRef.current?.enqueue(workspace);
      return;
    }
    void fetch(`${BACKEND_URL}/design/projects/${projectId}/canvas`, {
      method: "PUT",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, base_revision: revisionRef.current }),
    }).catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushWorkspace();
    };
    const onOnline = () => {
      if (queueRef.current?.hasPending) {
        queueRef.current.retry();
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flushWorkspace]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    queueRef.current?.dispose();
    if (!dirtyRef.current || !latestWorkspaceRef.current) return;
    // SPA navigation does not fire beforeunload; keepalive gives the last edit
    // a chance to reach the server while the component unmounts.
    void fetch(`${BACKEND_URL}/design/projects/${projectId}/canvas`, {
      method: "PUT",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: latestWorkspaceRef.current, base_revision: revisionRef.current }),
    }).catch(() => undefined);
  }, [projectId]);

  const handleContentChange = useCallback((nodes: Node[], edges: Edge[]) => {
    const key = contentKey(nodes, edges);
    if (key === lastContentKeyRef.current) return;
    lastContentKeyRef.current = key;
    updateTabs(
      (current) => current.map((tab) => tab.id === activeTabIdRef.current ? { ...tab, nodes, edges, lastModified: Date.now() } : tab),
      activeTabIdRef.current,
    );
  }, [updateTabs]);

  const handleSelectionChange = useCallback((nextSelectedNode: Node<BlueprintNodeData> | null) => {
    setSelectedNode(nextSelectedNode);
    setEditedNode((current) => (current && current.id !== nextSelectedNode?.id ? null : current));
  }, []);

  const handleTabChange = useCallback((tabId: string) => {
    if (tabId === activeTabIdRef.current) return;
    const currentTabs = tabsRef.current.map((tab) => tab.id === activeTabIdRef.current ? { ...tab, viewport: getViewport() } : tab);
    const target = currentTabs.find((tab) => tab.id === tabId);
    if (!target) return;
    applyTabs(currentTabs, tabId);
    lastContentKeyRef.current = tabContentKey(target);
    setSelectedNode(null);
    setEditedNode(null);
    saveWorkspace(currentTabs, tabId);
  }, [applyTabs, getViewport, saveWorkspace]);

  const openCreateDialog = () => {
    setDraftName(`项目 ${tabsRef.current.length + 1}`);
    setNameDialog({ mode: "create" });
  };

  const openRenameDialog = (tab: WorkspaceTab) => {
    setDraftName(tab.name);
    setNameDialog({ mode: "rename", tabId: tab.id });
  };

  const submitNameDialog = () => {
    const name = draftName.trim();
    if (!name || !nameDialog) return;
    if (nameDialog.mode === "create") {
      const nextTab = createTab(tabsRef.current.length + 1, undefined, name);
      const nextTabs = [...tabsRef.current, nextTab];
      applyTabs(nextTabs, nextTab.id);
      lastContentKeyRef.current = tabContentKey(nextTab);
      setSelectedNode(null);
      setEditedNode(null);
      saveWorkspace(nextTabs, nextTab.id);
      setStatusMessage(`已创建 ${name}`);
    } else if (nameDialog.tabId) {
      updateTabs((current) => current.map((tab) => tab.id === nameDialog.tabId ? { ...tab, name, lastModified: Date.now() } : tab));
      setStatusMessage(`已重命名为 ${name}`);
    }
    setNameDialog(null);
  };

  const handleCloseTab = useCallback(async (tabId: string) => {
    const currentTabs = tabsRef.current;
    if (currentTabs.length === 1) {
      const merged = currentTabs.map((tab) => tab.id === tabId ? { ...tab, viewport: getViewport(), lastModified: Date.now() } : tab);
      const workspace: WorkspaceData = { schemaVersion: WORKSPACE_SCHEMA_VERSION, tabs: merged, activeTabId: activeTabIdRef.current, timestamp: Date.now() };
      WorkspaceManager.save(projectId, workspace);
      latestWorkspaceRef.current = workspace;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      dirtyRef.current = true;
      // The unmount cleanup sends one keepalive request; do not also start a
      // normal save here or both requests race for the same base revision.
      router.push("/design");
      return;
    }
    const remaining = currentTabs.filter((tab) => tab.id !== tabId);
    const previousActive = activeTabIdRef.current;
    const nextActive = previousActive === tabId ? remaining[0].id : previousActive;
    updateTabs(() => remaining, nextActive);
    if (nextActive !== previousActive) {
      const nextTab = remaining.find((tab) => tab.id === nextActive);
      if (nextTab) lastContentKeyRef.current = tabContentKey(nextTab);
    }
    setSelectedNode(null);
    setEditedNode(null);
  }, [getViewport, projectId, router, updateTabs]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  const runCanvasCommand = (type: "undo" | "redo") => setCanvasCommand({ id: Date.now(), type });

  const saveNow = () => {
    const currentTabs = tabsRef.current.map((tab) => tab.id === activeTabIdRef.current ? { ...tab, viewport: getViewport(), lastModified: Date.now() } : tab);
    const workspace: WorkspaceData = { schemaVersion: WORKSPACE_SCHEMA_VERSION, tabs: currentTabs, activeTabId: activeTabIdRef.current, timestamp: Date.now() };
    applyTabs(currentTabs, activeTabIdRef.current);
    lastContentKeyRef.current = contentKey(activeTabOf(workspace).nodes, activeTabOf(workspace).edges);
    latestWorkspaceRef.current = workspace;
    WorkspaceManager.save(projectId, workspace);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyRef.current = true;
    queueRef.current?.enqueue(workspace);
    setStatusMessage("正在同步当前工作区…");
  };

  const retrySave = useCallback(() => {
    const queue = queueRef.current;
    if (!queue) return;
    if (queue.hasPending) queue.retry();
    else if (latestWorkspaceRef.current) queue.enqueue(latestWorkspaceRef.current);
  }, []);

  const exportCurrentTab = () => {
    const data = { name: activeTab.name, projectId, nodes: activeTab.nodes, edges: activeTab.edges, viewport: getViewport(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeTab.name.replace(/[\\/:*?"<>|]/g, "-") || "game-blueprint"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("当前设计已导出");
  };

  const applyMergedWorkspace = useCallback(() => {
    const current = conflictRef.current;
    if (!current) return;
    const nextActiveId = current.merged.tabs.some((tab) => tab.id === current.merged.activeTabId) ? current.merged.activeTabId : current.merged.tabs[0].id;
    revisionRef.current = current.serverRevision;
    queueRef.current?.setRevision(current.serverRevision);
    applyTabs(current.merged.tabs, nextActiveId);
    bumpCanvasReset();
    setSelectedNode(null);
    setEditedNode(null);
    lastContentKeyRef.current = tabContentKey(activeTabOf({ ...current.merged, activeTabId: nextActiveId }));
    WorkspaceManager.save(projectId, current.merged);
    latestWorkspaceRef.current = current.merged;
    conflictRef.current = null;
    setConflict(null);
    setRemoteUpdate(null);
    dirtyRef.current = true;
    queueRef.current?.enqueue(current.merged);
    setStatusMessage("已合并本地与服务器版本");
  }, [applyTabs, bumpCanvasReset, projectId]);

  const applyServerWorkspace = useCallback(() => {
    const current = conflictRef.current;
    if (!current) return;
    const workspace = current.serverWorkspace;
    const nextActiveId = workspace.tabs.some((tab) => tab.id === workspace.activeTabId) ? workspace.activeTabId : workspace.tabs[0].id;
    revisionRef.current = current.serverRevision;
    queueRef.current?.setRevision(current.serverRevision, { clearPending: true });
    applyTabs(workspace.tabs, nextActiveId);
    bumpCanvasReset();
    setSelectedNode(null);
    setEditedNode(null);
    lastContentKeyRef.current = tabContentKey(activeTabOf({ ...workspace, activeTabId: nextActiveId }));
    WorkspaceManager.save(projectId, workspace);
    latestWorkspaceRef.current = workspace;
    dirtyRef.current = false;
    conflictRef.current = null;
    setConflict(null);
    setRemoteUpdate(null);
    setSyncState("idle");
    setStatusMessage("已载入服务器版本");
  }, [applyTabs, bumpCanvasReset, projectId]);

  const saveAsNewProject = useCallback(async () => {
    const workspace = currentWorkspace();
    const name = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current)?.name ?? "设计项目";
    try {
      const project = await api.createProject({ name: `${name}（本地副本）` }) as DesignProject;
      await directRequest(`/design/projects/${project.id}/canvas`, {
        method: "PUT",
        body: JSON.stringify({ workspace, base_revision: 0 }),
      });
      conflictRef.current = null;
      dirtyRef.current = false;
      queueRef.current?.clearPending();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      setConflict(null);
      router.push(`/design/${project.id}`);
    } catch {
      setStatusMessage("另存为新项目失败，请重试");
    }
  }, [currentWorkspace, router]);

  const downloadLocalJson = useCallback(() => {
    const workspace = currentWorkspace();
    const blob = new Blob([JSON.stringify({ ...workspace, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "game-blueprint-local-recovery.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [currentWorkspace]);

  if (!workspaceReady) {
    return <div className="grid h-full min-h-[620px] place-items-center border bg-background text-sm text-muted-foreground">正在恢复工作区...</div>;
  }

  return (
    <div className="flex h-full min-h-[620px] flex-col overflow-hidden border bg-background">
      <div className="flex min-h-9 items-center overflow-x-auto border-b bg-muted/30 px-2">
        {tabs.map((tab) => (
          <div key={tab.id} className={`group/tab flex h-9 shrink-0 items-center gap-1 border-r px-3 text-xs transition-colors ${tab.id === activeTabId ? "bg-background font-medium" : "text-muted-foreground hover:bg-accent"}`} onClick={() => handleTabChange(tab.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") handleTabChange(tab.id); }}>
            <span>{tab.name}</span>
            <button type="button" aria-label={`重命名${tab.name}`} title="重命名" className="grid h-5 w-5 place-items-center rounded opacity-0 transition-opacity hover:bg-muted-foreground/15 group-hover/tab:opacity-100 focus:opacity-100" onClick={(event) => { event.stopPropagation(); openRenameDialog(tab); }}><Pencil className="h-3 w-3" /></button>
            <button type="button" aria-label={`关闭${tab.name}`} title="关闭" className="grid h-5 w-5 place-items-center rounded hover:bg-muted-foreground/15" onClick={(event) => { event.stopPropagation(); handleCloseTab(tab.id); }}>×</button>
          </div>
        ))}
        <button type="button" className="grid h-9 w-9 shrink-0 place-items-center text-muted-foreground hover:text-foreground" onClick={openCreateDialog} aria-label="新建设计项目" title="新建设计项目">+</button>
      </div>

      {remoteUpdate && (
        <div className="flex items-center justify-between gap-3 border-b bg-muted/60 px-4 py-1.5 text-xs">
          <span className="min-w-0 truncate">另一个标签页已保存更新（版本 {remoteUpdate.revision}）。</span>
          <span className="flex shrink-0 items-center gap-3">
            <button type="button" className="font-medium text-primary hover:underline" onClick={handleLoadRemote}>载入最新</button>
            <button type="button" className="text-muted-foreground hover:underline" onClick={() => setRemoteUpdate(null)}>稍后处理</button>
          </span>
        </div>
      )}

      <ProjectToolbar projectId={projectId} onUndo={() => runCanvasCommand("undo")} onRedo={() => runCanvasCommand("redo")} onSave={saveNow} onExport={exportCurrentTab} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <NodePalette width={paletteWidth} />
          <ResizeHandle onResize={(delta) => setPaletteWidth((width) => Math.min(380, Math.max(190, width + delta)))} />
          <div className="relative min-w-[320px] flex-1">
            <NodeCanvas
              key={`${activeTabId}:${canvasResetToken}`}
              projectId={projectId}
              initialNodes={activeTab.nodes}
              initialEdges={activeTab.edges}
              viewport={activeTab.viewport}
              editedNode={editedNode}
              command={canvasCommand}
              onContentChange={handleContentChange}
              onSelectionChange={handleSelectionChange}
              onStatusChange={setStatusMessage}
            />
            {selectedNode && (
              <div className="absolute inset-x-0 bottom-0 z-20 border-t border-border bg-background shadow-[0_-10px_30px_hsl(var(--foreground)/0.10)]">
                <ResizeHandle orientation="horizontal" direction="reverse" onResize={(delta) => setEditorHeight((height) => Math.min(420, Math.max(190, height + delta)))} />
                <div className="overflow-hidden" style={{ height: editorHeight }}>
                  <NodePropertyPanel node={selectedNode} onClose={() => { setSelectedNode(null); setEditedNode(null); }} onChange={(field, value) => {
                    const nextNode = { ...selectedNode, data: { ...selectedNode.data, formData: { ...selectedNode.data.formData, [field]: value } } };
                    setSelectedNode(nextNode);
                    setEditedNode(nextNode);
                  }} />
                </div>
              </div>
            )}
          </div>
          {!referenceCollapsed && <ResizeHandle direction="reverse" onResize={(delta) => setReferenceWidth((width) => Math.min(400, Math.max(180, width + delta)))} />}
          <ReferencePanel projectId={projectId} width={referenceWidth} collapsed={referenceCollapsed} onCollapsedChange={setReferenceCollapsed} />
        </div>
      </div>
      <AiAssistant projectId={projectId} />
      <StatusBar
        message={statusMessage}
        syncState={syncState}
        savedAt={savedAt}
        syncError={syncError}
        onRetry={retrySave}
      />

      {nameDialog && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-foreground/20 p-4 backdrop-blur-[2px]" onMouseDown={() => setNameDialog(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="project-name-title" className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="project-name-title" className="text-base font-semibold">{nameDialog.mode === "create" ? "新建设计项目" : "重命名项目"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">输入一个便于识别的项目名称。</p>
            <Input autoFocus className="mt-4" value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitNameDialog(); if (event.key === "Escape") setNameDialog(null); }} />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-md border px-3 py-2 text-sm hover:bg-accent" onClick={() => setNameDialog(null)}>取消</button>
              <button type="button" disabled={!draftName.trim()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={submitNameDialog}>{nameDialog.mode === "create" ? "创建" : "保存"}</button>
            </div>
          </div>
        </div>
      )}

      {conflict && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-foreground/25 p-4 backdrop-blur-[2px]">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg border bg-background p-5 shadow-xl">
            <h2 className="text-base font-semibold">画布版本冲突</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">服务器上存在更新版本。可以按节点合并，或选择保留其中一方；系统不会静默覆盖。</p>
            <p className="mt-2 text-xs text-muted-foreground">本地 {conflict.stats.localNodes} 个节点 / 服务器 {conflict.stats.serverNodes} 个 / 合并后 {conflict.stats.mergedNodes} 个</p>
            <div className="mt-5 grid gap-2">
              <button className="rounded-md border px-3 py-2 text-left text-sm hover:bg-accent" onClick={applyMergedWorkspace}>合并本地与服务器（推荐）</button>
              <button className="rounded-md border px-3 py-2 text-left text-sm hover:bg-accent" onClick={applyServerWorkspace}>使用服务器版本</button>
              <button className="rounded-md border px-3 py-2 text-left text-sm hover:bg-accent" onClick={saveAsNewProject}>将本地内容另存为新项目</button>
              <button className="rounded-md border px-3 py-2 text-left text-sm hover:bg-accent" onClick={downloadLocalJson}>下载本地 JSON</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DesignWorkbench({ projectId }: Props) {
  return <ReactFlowProvider><WorkbenchInner projectId={projectId} /></ReactFlowProvider>;
}
