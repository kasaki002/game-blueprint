"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "reactflow";
import { X } from "lucide-react";
import "reactflow/dist/style.css";

import { NodeTemplates, type NodeTemplate } from "@/lib/node-templates";
import { cn } from "@/lib/utils";
import { BlueprintNode, type BlueprintNodeData } from "./blueprint-node";
import { CanvasEmptyState } from "./canvas-empty-state";
import { CanvasQuickAdd } from "./canvas-quick-add";
import { CanvasToolbar, type CanvasMode } from "./canvas-toolbar";
import { AnimatedConnectionLine } from "./connection-line";
import { EdgeDeleteContext, EnergyEdge } from "./energy-edge";

type HistorySnapshot = { nodes: Node[]; edges: Edge[] };
export type CanvasCommand = { id: number; type: "undo" | "redo" } | null;

const MAX_HISTORY = 50;
const nodeTypes = { blueprint: BlueprintNode };
const edgeTypes = { energy: EnergyEdge };

interface Props {
  projectId: string;
  initialNodes: Node[];
  initialEdges: Edge[];
  viewport: { x: number; y: number; zoom: number };
  editedNode: Node<BlueprintNodeData> | null;
  onContentChange: (nodes: Node[], edges: Edge[]) => void;
  onSelectionChange: (selectedNode: Node<BlueprintNodeData> | null) => void;
  onStatusChange: (message: string) => void;
  command?: CanvasCommand;
}

interface QuickAddState {
  x: number;
  y: number;
  position: { x: number; y: number };
}

function uniqueId(prefix: string) {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${suffix}`;
}

function createNode(template: NodeTemplate, position: { x: number; y: number }): Node<BlueprintNodeData> {
  return {
    id: uniqueId("node"),
    type: "blueprint",
    position,
    data: {
      label: template.label,
      template: template.type,
      color: template.color,
      formData: Object.fromEntries(template.fields.map((field) => [field.name, field.default])),
    },
  };
}

function nodeTitle(node?: Node) {
  const data = node?.data as BlueprintNodeData | undefined;
  return String(data?.formData?.name || data?.label || "节点");
}

function arrangeLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>(nodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const depth = new Map<string, number>(nodes.map((node) => [node.id, -1]));
  const visit = (id: string, value: number, stack: Set<string>) => {
    if (stack.has(id) || (depth.get(id) ?? -1) >= value) return;
    depth.set(id, value);
    stack.add(id);
    for (const next of outgoing.get(id) ?? []) visit(next, value + 1, stack);
    stack.delete(id);
  };

  const roots = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0);
  for (const node of roots.length > 0 ? roots : nodes) visit(node.id, 0, new Set());
  for (const node of nodes) if ((depth.get(node.id) ?? -1) < 0) visit(node.id, 0, new Set());

  const groups = new Map<number, Node[]>();
  for (const node of nodes) {
    const layer = depth.get(node.id) ?? 0;
    groups.set(layer, [...(groups.get(layer) ?? []), node]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  if (groups.size === 1) {
    const [group] = [...groups.values()];
    const sorted = [...group].sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);
    sorted.forEach((node, index) => {
      positions.set(node.id, { x: 80 + (index % 3) * 300, y: 80 + Math.floor(index / 3) * 170 });
    });
    return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
  }

  for (const [layer, group] of groups) {
    const sorted = [...group].sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);
    sorted.forEach((node, index) => {
      positions.set(node.id, {
        x: 80 + layer * 310,
        y: 80 + (index - (sorted.length - 1) / 2) * 150 + 260,
      });
    });
  }

  return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
}

export function NodeCanvas({
  projectId: _projectId,
  initialNodes,
  initialEdges,
  viewport,
  editedNode,
  onContentChange,
  onSelectionChange,
  onStatusChange,
  command,
}: Props) {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node?: Node; edge?: Edge } | null>(null);
  const [clipboard, setClipboard] = useState<Node | null>(null);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [mode, setMode] = useState<CanvasMode>("pan");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [quickAdd, setQuickAdd] = useState<QuickAddState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [, setHistoryVersion] = useState(0);
  const historyRef = useRef<HistorySnapshot[]>([{ nodes: initialNodes, edges: initialEdges }]);
  const historyIndexRef = useRef(0);
  const draggingRef = useRef(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const editHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionStartRef = useRef<{ nodeId: string; handleType: "source" | "target" } | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const selectedNode = useMemo(
    () => (nodes.find((node) => node.id === selectedNodeId) as Node<BlueprintNodeData> | undefined) ?? null,
    [nodes, selectedNodeId],
  );

  useEffect(() => {
    if (draggingRef.current) return;
    onContentChange(nodes, edges);
  }, [edges, nodes, onContentChange]);

  useEffect(() => {
    onSelectionChange(selectedNode);
  }, [onSelectionChange, selectedNode]);

  const saveToHistory = useCallback((nextNodes: Node[], nextEdges: Edge[]) => {
    if (editHistoryTimerRef.current) {
      clearTimeout(editHistoryTimerRef.current);
      editHistoryTimerRef.current = null;
    }
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push({
      nodes: structuredClone(nextNodes),
      edges: structuredClone(nextEdges),
    });
    const trimmed = nextHistory.slice(-MAX_HISTORY);
    historyRef.current = trimmed;
    historyIndexRef.current = trimmed.length - 1;
    setHistoryVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!editedNode) return;
    const nextNodes = nodesRef.current.map((node) => node.id === editedNode.id ? editedNode : node);
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    if (editHistoryTimerRef.current) clearTimeout(editHistoryTimerRef.current);
    editHistoryTimerRef.current = setTimeout(() => {
      editHistoryTimerRef.current = null;
      saveToHistory(nodesRef.current, edgesRef.current);
    }, 450);
  }, [editedNode, saveToHistory, setNodes]);

  useEffect(() => () => {
    if (editHistoryTimerRef.current) clearTimeout(editHistoryTimerRef.current);
  }, []);

  const connectNodes = useCallback((sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (edges.some((edge) => edge.source === sourceId && edge.target === targetId)) {
      onStatusChange("这条连接已经存在");
      return;
    }
    const sourceNode = nodes.find((node) => node.id === sourceId);
    const targetNode = nodes.find((node) => node.id === targetId);
    const nextEdges = addEdge({
      id: uniqueId("edge"),
      source: sourceId,
      target: targetId,
      type: "energy",
      data: { color: (sourceNode?.data as BlueprintNodeData | undefined)?.color },
    }, edges);
    setEdges(nextEdges);
    saveToHistory(nodes, nextEdges);
    onStatusChange(`已连接「${nodeTitle(sourceNode)}」→「${nodeTitle(targetNode)}」`);
  }, [edges, nodes, onStatusChange, saveToHistory, setEdges]);

  const onConnect = useCallback((connection: Connection) => {
    connectedRef.current = true;
    if (connection.source && connection.target) connectNodes(connection.source, connection.target);
  }, [connectNodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const nextNodes = applyNodeChanges(changes, nodes);
    setNodes(nextNodes);
    if (changes.some((change) => change.type === "remove")) saveToHistory(nextNodes, edges);
  }, [edges, nodes, saveToHistory, setNodes]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const nextEdges = applyEdgeChanges(changes, edges);
    setEdges(nextEdges);
    if (changes.some((change) => change.type === "remove")) saveToHistory(nodes, nextEdges);
  }, [edges, nodes, saveToHistory, setEdges]);

  const deleteEdge = useCallback((edgeId: string) => {
    const nextEdges = edges.filter((edge) => edge.id !== edgeId);
    setEdges(nextEdges);
    setContextMenu(null);
    saveToHistory(nodes, nextEdges);
    onStatusChange("连接已删除");
  }, [edges, nodes, onStatusChange, saveToHistory, setEdges]);

  const deleteSelected = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
    if (selectedNodeId) selectedNodeIds.add(selectedNodeId);
    const selectedEdgeIds = new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id));
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return;

    const nextNodes = nodes.filter((node) => !selectedNodeIds.has(node.id));
    const nextEdges = edges.filter((edge) => (
      !selectedEdgeIds.has(edge.id)
      && !selectedNodeIds.has(edge.source)
      && !selectedNodeIds.has(edge.target)
    ));
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId(null);
    saveToHistory(nextNodes, nextEdges);
    const parts = [];
    if (selectedNodeIds.size) parts.push(`${selectedNodeIds.size} 个节点`);
    if (selectedEdgeIds.size) parts.push(`${selectedEdgeIds.size} 条连接`);
    onStatusChange(`已删除${parts.join("、")}`);
  }, [edges, nodes, onStatusChange, saveToHistory, selectedNodeId, setEdges, setNodes]);

  const undo = useCallback(() => {
    if (editHistoryTimerRef.current) {
      clearTimeout(editHistoryTimerRef.current);
      editHistoryTimerRef.current = null;
    }
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (!snapshot) return;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setHistoryVersion((version) => version + 1);
    onStatusChange("已撤销");
  }, [onStatusChange, setEdges, setNodes]);

  const redo = useCallback(() => {
    if (editHistoryTimerRef.current) {
      clearTimeout(editHistoryTimerRef.current);
      editHistoryTimerRef.current = null;
    }
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (!snapshot) return;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setHistoryVersion((version) => version + 1);
    onStatusChange("已重做");
  }, [onStatusChange, setEdges, setNodes]);

  useEffect(() => {
    if (!command) return;
    if (command.type === "undo") undo();
    else redo();
  }, [command, redo, undo]);

  const copyNode = useCallback(() => {
    if (!selectedNode) return;
    setClipboard(structuredClone(selectedNode));
    onStatusChange("节点已复制");
  }, [onStatusChange, selectedNode]);

  const cutNode = useCallback(() => {
    if (!selectedNode) return;
    setClipboard(structuredClone(selectedNode));
    deleteSelected();
  }, [deleteSelected, selectedNode]);

  const pasteNode = useCallback(() => {
    if (!clipboard) return;
    const nextNode: Node = {
      ...structuredClone(clipboard),
      id: uniqueId("node"),
      position: { x: clipboard.position.x + 45, y: clipboard.position.y + 45 },
      selected: false,
    };
    const nextNodes = [...nodes.map((node) => node.selected ? { ...node, selected: false } : node), { ...nextNode, selected: true }];
    setNodes(nextNodes);
    setSelectedNodeId(nextNode.id);
    saveToHistory(nextNodes, edges);
    onStatusChange("节点副本已创建");
  }, [clipboard, edges, nodes, onStatusChange, saveToHistory, setNodes]);

  const selectAll = useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: true })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: true })));
    onStatusChange("已全选节点与连接");
  }, [onStatusChange, setEdges, setNodes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
      if (modifier && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) { event.preventDefault(); redo(); }
      if (modifier && event.key.toLowerCase() === "c") { event.preventDefault(); copyNode(); }
      if (modifier && event.key.toLowerCase() === "x") { event.preventDefault(); cutNode(); }
      if (modifier && event.key.toLowerCase() === "v") { event.preventDefault(); pasteNode(); }
      if (modifier && event.key.toLowerCase() === "a") { event.preventDefault(); selectAll(); }
      if (event.key === "Delete" || event.key === "Backspace") {
        const hasNodeSelection = Boolean(selectedNodeId) || nodes.some((node) => node.selected);
        const hasEdgeSelection = edges.some((edge) => edge.selected);
        if (!hasNodeSelection && !hasEdgeSelection) return;
        event.preventDefault();
        deleteSelected();
      }
      if (event.key === "Escape") {
        setQuickAdd(null);
        setShowShortcuts(false);
        setContextMenu(null);
        setSelectedNodeId(null);
        setNodes((current) => current.map((node) => node.selected ? { ...node, selected: false } : node));
        setEdges((current) => current.map((edge) => edge.selected ? { ...edge, selected: false } : edge));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copyNode, cutNode, deleteSelected, edges, nodes, pasteNode, redo, selectAll, selectedNodeId, setEdges, setNodes, undo]);

  const addNode = useCallback((template: NodeTemplate, position: { x: number; y: number }, formData?: Record<string, unknown>) => {
    const nextNode = createNode(template, position);
    if (formData) {
      nextNode.data = { ...nextNode.data, formData: { ...nextNode.data.formData, ...formData } };
    }
    const nextNodes = [...nodes.map((node) => node.selected ? { ...node, selected: false } : node), { ...nextNode, selected: true }];
    setNodes(nextNodes);
    setSelectedNodeId(nextNode.id);
    saveToHistory(nextNodes, edges);
    onStatusChange(`已添加「${template.label}」节点`);
  }, [edges, nodes, onStatusChange, saveToHistory, setNodes]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const rawTemplate = event.dataTransfer.getData("application/reactflow");
    const rawReference = event.dataTransfer.getData("application/game-blueprint-reference");
    if (!rawTemplate && !rawReference) return;

    try {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      if (rawTemplate) {
        addNode(JSON.parse(rawTemplate) as NodeTemplate, position);
        return;
      }
      const reference = JSON.parse(rawReference) as { title?: string; source?: string; url?: string; summary?: string };
      addNode(NodeTemplates.reference, position, {
        name: reference.title || "参考素材",
        source: reference.source || "",
        summary: reference.summary || reference.title || "",
        url: reference.url || "",
      });
    } catch {
      onStatusChange("拖拽内容无法读取");
    }
  }, [addNode, onStatusChange, screenToFlowPosition]);

  const arrangeNodes = useCallback(() => {
    if (nodes.length === 0) return;
    const nextNodes = arrangeLayout(nodes, edges);
    setNodes(nextNodes);
    saveToHistory(nextNodes, edges);
    onStatusChange("已自动整理画布布局");
    window.setTimeout(() => fitView({ padding: 0.25, duration: 320 }), 60);
  }, [edges, fitView, nodes, onStatusChange, saveToHistory, setNodes]);

  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
    setSelectedNodeId(null);
  }, []);

  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest(".react-flow__node, .react-flow__edge, .react-flow__minimap, .react-flow__controls, .react-flow__panel, [data-quick-add], [data-context-menu], button, input")) return;
    setQuickAdd({
      x: event.clientX,
      y: event.clientY,
      position: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    });
  }, [screenToFlowPosition]);

  return (
    <div
      className={cn("relative h-full w-full", mode === "select" && "canvas-select-mode", connecting && "canvas-connecting")}
      onDoubleClick={handleDoubleClick}
    >
      {nodes.length === 0 && !quickAdd && <CanvasEmptyState />}
      <EdgeDeleteContext.Provider value={deleteEdge}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={(_event, params) => {
            if (!params.nodeId) return;
            connectedRef.current = false;
            connectionStartRef.current = {
              nodeId: params.nodeId,
              handleType: params.handleType === "target" ? "target" : "source",
            };
            setConnecting(true);
          }}
          onConnectEnd={(event) => {
            setConnecting(false);
            const start = connectionStartRef.current;
            connectionStartRef.current = null;
            if (connectedRef.current || !start) return;
            const point = "changedTouches" in event ? event.changedTouches[0] : event;
            if (!point) return;
            const nodeElement = document.elementFromPoint(point.clientX, point.clientY)?.closest(".react-flow__node") as HTMLElement | null;
            const targetId = nodeElement?.getAttribute("data-id");
            if (!targetId || targetId === start.nodeId) return;
            if (start.handleType === "target") connectNodes(targetId, start.nodeId);
            else connectNodes(start.nodeId, targetId);
          }}
          onNodeClick={(_event, node) => {
            setSelectedNodeId(node.id);
            setContextMenu(null);
          }}
          onNodeDragStart={() => { draggingRef.current = true; }}
          onNodeDragStop={(_event, node) => {
            draggingRef.current = false;
            const nextNodes = nodesRef.current.map((item) => item.id === node.id ? { ...item, position: node.position } : item);
            nodesRef.current = nextNodes;
            setNodes(nextNodes);
            saveToHistory(nextNodes, edgesRef.current);
          }}
          onEdgeClick={() => {
            setContextMenu(null);
            onStatusChange("已选中连接，按 Delete 删除");
          }}
          onPaneClick={handlePaneClick}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            setSelectedNodeId(node.id);
            setContextMenu({ x: event.clientX, y: event.clientY, node });
          }}
          onEdgeContextMenu={(event, edge) => {
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY, edge });
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY });
          }}
          onSelectionChange={(selection) => {
            if (selection.nodes.length === 1) setSelectedNodeId(selection.nodes[0].id);
            else setSelectedNodeId(null);
          }}
          onDrop={onDrop}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          connectionLineComponent={AnimatedConnectionLine}
          defaultEdgeOptions={{ type: "energy" }}
          panOnDrag={mode === "pan"}
          selectionOnDrag={mode === "select"}
          selectionMode={SelectionMode.Partial}
          panActivationKeyCode="Space"
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          snapToGrid
          snapGrid={[15, 15]}
          defaultViewport={viewport}
          fitView={viewport.x === 0 && viewport.y === 0 && viewport.zoom === 1}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsl(var(--muted-foreground) / 0.22)" />
          <Controls showInteractive={false} />
          {showMiniMap && (
            <MiniMap
              nodeColor={(node) => String(node.data?.color || "#94a3b8")}
              zoomable
              pannable
              style={{ right: 12, bottom: 12 }}
            />
          )}
          <Panel position="top-center" className="!mt-3">
            <CanvasToolbar
              mode={mode}
              onModeChange={setMode}
              onFitView={() => fitView({ padding: 0.2, duration: 260 })}
              onArrange={arrangeNodes}
              miniMap={showMiniMap}
              onToggleMiniMap={() => setShowMiniMap((visible) => !visible)}
              shortcutsOpen={showShortcuts}
              onToggleShortcuts={() => setShowShortcuts((visible) => !visible)}
            />
          </Panel>
          <Panel position="top-right">
            <div className="hidden rounded-full border border-border bg-background/90 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur md:block">
              <span>节点 {nodes.length}</span>
              <span className="mx-1.5 text-border">·</span>
              <span>连接 {edges.length}</span>
              <span className="mx-1.5 text-border">·</span>
              <span>历史 {historyIndexRef.current}/{historyRef.current.length - 1}</span>
            </div>
          </Panel>
        </ReactFlow>
      </EdgeDeleteContext.Provider>

      {showShortcuts && (
        <div className="absolute right-4 top-14 z-30 w-72 rounded-lg border border-border bg-popover p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">画布快捷键</p>
            <button type="button" className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent" onClick={() => setShowShortcuts(false)} aria-label="关闭快捷键面板">
              <X className="h-3 w-3" />
            </button>
          </div>
          <dl className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
            {[
              ["空格 + 拖动", "平移画布"],
              ["Shift + 拖动", "框选节点"],
              ["滚轮", "缩放画布"],
              ["双击画布", "快速添加节点"],
              ["Delete", "删除选中节点/连接"],
              ["Ctrl/Cmd + A", "全选"],
              ["Ctrl/Cmd + Z", "撤销"],
              ["Ctrl/Cmd + Shift + Z", "重做"],
            ].map(([key, action]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <dt className="text-foreground/80">{key}</dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {quickAdd && (
        <CanvasQuickAdd
          x={quickAdd.x}
          y={quickAdd.y}
          onClose={() => setQuickAdd(null)}
          onAdd={(template) => {
            addNode(template, quickAdd.position);
            setQuickAdd(null);
          }}
        />
      )}

      {contextMenu && (
        <div
          className="fixed z-50 min-w-44 rounded-md border border-border bg-popover p-1 text-sm shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-context-menu="true"
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.edge ? (
            <MenuItem label="删除连接" shortcut="Delete" onClick={() => { deleteEdge(contextMenu.edge!.id); }} />
          ) : contextMenu.node ? (
            <>
              <MenuItem label="复制节点" shortcut="Ctrl+C" onClick={() => { copyNode(); setContextMenu(null); }} />
              <MenuItem label="剪切节点" shortcut="Ctrl+X" onClick={() => { cutNode(); setContextMenu(null); }} />
              <MenuItem label="删除节点" shortcut="Delete" onClick={() => { deleteSelected(); setContextMenu(null); }} />
            </>
          ) : (
            <>
              <MenuItem label="快速添加节点" shortcut="双击" onClick={() => {
                setQuickAdd({
                  x: contextMenu.x,
                  y: contextMenu.y,
                  position: screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y }),
                });
                setContextMenu(null);
              }} />
              <div className="my-1 border-t border-border" />
              <MenuItem label="粘贴" shortcut="Ctrl+V" disabled={!clipboard} onClick={() => { pasteNode(); setContextMenu(null); }} />
              <MenuItem label="撤销" shortcut="Ctrl+Z" disabled={historyIndexRef.current <= 0} onClick={() => { undo(); setContextMenu(null); }} />
              <MenuItem label="重做" shortcut="Ctrl+Shift+Z" disabled={historyIndexRef.current >= historyRef.current.length - 1} onClick={() => { redo(); setContextMenu(null); }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, shortcut, disabled = false, onClick }: { label: string; shortcut: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{shortcut}</span>
    </button>
  );
}
