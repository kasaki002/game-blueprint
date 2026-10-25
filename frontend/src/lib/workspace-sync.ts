import type { Edge, Node } from "reactflow";

import { WORKSPACE_SCHEMA_VERSION, type WorkspaceData, type WorkspaceTab } from "./workspace-manager";

/** Stable fingerprint of the parts of a canvas that should be persisted. */
function normalizeNode(node: Node) {
  return {
    id: node.id,
    type: node.type ?? "default",
    position: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
    data: node.data ?? {},
    style: node.style ?? null,
    className: node.className ?? null,
    hidden: Boolean(node.hidden),
  };
}

function normalizeEdge(edge: Edge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type ?? null,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    label: edge.label ?? null,
    style: edge.style ?? null,
    markerEnd: edge.markerEnd ?? null,
    data: edge.data ?? null,
    hidden: Boolean(edge.hidden),
  };
}

export function contentKey(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify({ nodes: nodes.map(normalizeNode), edges: edges.map(normalizeEdge) });
}

export function tabContentKey(tab: Pick<WorkspaceTab, "nodes" | "edges">): string {
  return contentKey(tab.nodes, tab.edges);
}

export function countNodes(workspace: WorkspaceData): number {
  return workspace.tabs.reduce((total, tab) => total + tab.nodes.length, 0);
}

function normalizeViewport(value: unknown): WorkspaceTab["viewport"] {
  const viewport = value as Partial<WorkspaceTab["viewport"]> | null | undefined;
  const x = Number(viewport?.x);
  const y = Number(viewport?.y);
  const zoom = Number(viewport?.zoom);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
  };
}

/** Accept both the current tab format and the legacy `{ nodes, edges }` shape. */
export function normalizeWorkspace(
  state: unknown,
  projectId: string,
  fallbackName: string,
  fallbackTimestamp = Date.now(),
): WorkspaceData {
  const raw = (state ?? {}) as Partial<WorkspaceData> & { nodes?: Node[]; edges?: Edge[]; updated_at?: string };
  if (Array.isArray(raw.tabs) && raw.tabs.length > 0) {
    const tabs: WorkspaceTab[] = raw.tabs.map((tab, index) => ({
      id: typeof tab.id === "string" && tab.id ? tab.id : `tab-${projectId}-${index + 1}`,
      name: typeof tab.name === "string" && tab.name ? tab.name : `${fallbackName} ${index + 1}`,
      nodes: Array.isArray(tab.nodes) ? tab.nodes : [],
      edges: Array.isArray(tab.edges) ? tab.edges : [],
      viewport: normalizeViewport(tab.viewport),
      lastModified: Number(tab.lastModified) || fallbackTimestamp,
    }));
    const activeTabId = tabs.some((tab) => tab.id === raw.activeTabId) ? String(raw.activeTabId) : tabs[0].id;
    return { schemaVersion: WORKSPACE_SCHEMA_VERSION, tabs, activeTabId, timestamp: Number(raw.timestamp) || fallbackTimestamp };
  }

  if (Array.isArray(raw.nodes) || Array.isArray(raw.edges)) {
    const tab: WorkspaceTab = {
      id: `tab-${projectId}-1`,
      name: fallbackName,
      nodes: raw.nodes ?? [],
      edges: raw.edges ?? [],
      viewport: { x: 0, y: 0, zoom: 1 },
      lastModified: fallbackTimestamp,
    };
    return { schemaVersion: WORKSPACE_SCHEMA_VERSION, tabs: [tab], activeTabId: tab.id, timestamp: fallbackTimestamp };
  }

  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    tabs: [{ id: `tab-${projectId}-1`, name: fallbackName, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, lastModified: fallbackTimestamp }],
    activeTabId: `tab-${projectId}-1`,
    timestamp: fallbackTimestamp,
  };
}

/** Explicit migration entry point for persisted/local workspaces. */
export function migrateWorkspace(
  state: unknown,
  projectId: string,
  fallbackName: string,
  fallbackTimestamp = Date.now(),
): WorkspaceData {
  return normalizeWorkspace(state, projectId, fallbackName, fallbackTimestamp);
}

export interface MergeStats {
  localNodes: number;
  serverNodes: number;
  mergedNodes: number;
}

function mergeTabs(local: WorkspaceTab, server: WorkspaceTab): WorkspaceTab {
  const serverNodes = new Map(server.nodes.map((node) => [node.id, node]));
  for (const node of local.nodes) serverNodes.set(node.id, node);
  const localNodeIds = new Set(local.nodes.map((node) => node.id));
  const nodes = [
    ...local.nodes.map((node) => serverNodes.get(node.id) as Node),
    ...server.nodes.filter((node) => !localNodeIds.has(node.id)).map((node) => serverNodes.get(node.id) as Node),
  ];
  const nodeIds = new Set(nodes.map((node) => node.id));

  const serverEdges = new Map(server.edges.map((edge) => [edge.id, edge]));
  for (const edge of local.edges) serverEdges.set(edge.id, edge);
  const localEdgeIds = new Set(local.edges.map((edge) => edge.id));
  const edges = [
    ...local.edges.map((edge) => serverEdges.get(edge.id) as Edge),
    ...server.edges.filter((edge) => !localEdgeIds.has(edge.id)).map((edge) => serverEdges.get(edge.id) as Edge),
  ].filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  return {
    ...local,
    name: local.name || server.name,
    nodes,
    edges,
    lastModified: Date.now(),
  };
}

/**
 * Node-level merge: local wins for the same node id, server-only nodes are
 * kept, and edges whose endpoints no longer exist are dropped.
 *
 * Deletions cannot be detected without tombstones, so a node deleted by the
 * other tab may reappear. That is the safe failure mode: never silently drop
 * the user's local work.
 */
export function mergeWorkspaces(local: WorkspaceData, server: WorkspaceData): { workspace: WorkspaceData; stats: MergeStats } {
  const localIds = new Set(local.tabs.map((tab) => tab.id));
  const mergedTabs = local.tabs.map((tab) => {
    const serverTab = server.tabs.find((candidate) => candidate.id === tab.id);
    return serverTab ? mergeTabs(tab, serverTab) : tab;
  });
  for (const tab of server.tabs) {
    if (!localIds.has(tab.id)) mergedTabs.push(tab);
  }

  const activeTabId = mergedTabs.some((tab) => tab.id === local.activeTabId)
    ? local.activeTabId
    : (mergedTabs.some((tab) => tab.id === server.activeTabId) ? server.activeTabId : mergedTabs[0].id);

  const workspace: WorkspaceData = { schemaVersion: WORKSPACE_SCHEMA_VERSION, tabs: mergedTabs, activeTabId, timestamp: Date.now() };
  return {
    workspace,
    stats: {
      localNodes: countNodes(local),
      serverNodes: countNodes(server),
      mergedNodes: countNodes(workspace),
    },
  };
}
