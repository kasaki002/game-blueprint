const test = require("node:test");
const assert = require("node:assert/strict");

const {
  contentKey,
  mergeWorkspaces,
  migrateWorkspace,
  normalizeWorkspace,
  tabContentKey,
} = require("./.build/workspace-sync.js");

function node(id, data = {}, extra = {}) {
  return {
    id,
    type: "blueprint",
    position: { x: 0, y: 0 },
    data: { label: id, template: "mechanic", color: "#000", formData: data },
    ...extra,
  };
}

function workspace(tabs, activeTabId = tabs[0].id) {
  return { schemaVersion: 2, tabs, activeTabId, timestamp: 1 };
}

test("contentKey ignores selection and React Flow runtime fields", () => {
  const plain = [node("n1")];
  const selected = [{ ...plain[0], selected: true, width: 300, height: 120, positionAbsolute: { x: 9, y: 9 }, dragging: true }];
  assert.equal(contentKey(plain, []), contentKey(selected, []));
  assert.notEqual(contentKey(plain, []), contentKey([node("n1", { hp: 12 })], []));
});

test("migrateWorkspace upgrades the legacy nodes/edges shape", () => {
  const migrated = migrateWorkspace({ nodes: [node("n1")], edges: [] }, "p1", "旧项目", 123);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.tabs.length, 1);
  assert.equal(migrated.tabs[0].id, "tab-p1-1");
  assert.equal(migrated.tabs[0].name, "旧项目");
  assert.equal(migrated.activeTabId, "tab-p1-1");
  assert.equal(migrated.timestamp, 123);
});

test("normalizeWorkspace repairs an invalid active tab id", () => {
  const first = { id: "t1", name: "A", nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, lastModified: 1 };
  const second = { id: "t2", name: "B", nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, lastModified: 1 };
  const normalized = normalizeWorkspace({ tabs: [first, second], activeTabId: "missing" }, "p1", "项目");
  assert.equal(normalized.activeTabId, "t1");
  assert.equal(normalized.schemaVersion, 2);
});

test("merge keeps local node versions, server-only nodes and valid edges", () => {
  const server = workspace([{
    id: "t1",
    name: "服务器",
    viewport: { x: 0, y: 0, zoom: 1 },
    lastModified: 1,
    nodes: [node("n1", { source: "server" }), node("n2")],
    edges: [{ id: "e1", source: "n1", target: "n2", type: "energy" }],
  }, {
    id: "t2",
    name: "服务器标签",
    viewport: { x: 0, y: 0, zoom: 1 },
    lastModified: 1,
    nodes: [],
    edges: [],
  }]);
  const local = workspace([{
    id: "t1",
    name: "本地",
    viewport: { x: 5, y: 5, zoom: 2 },
    lastModified: 2,
    nodes: [node("n1", { source: "local" }), node("n3")],
    edges: [
      { id: "e2", source: "n1", target: "n3", type: "energy" },
      { id: "e3", source: "n3", target: "n2", type: "energy" },
      { id: "e4", source: "n3", target: "missing", type: "energy" },
    ],
  }]);

  const { workspace: merged, stats } = mergeWorkspaces(local, server);
  assert.equal(stats.localNodes, 2);
  assert.equal(stats.serverNodes, 2);
  assert.equal(stats.mergedNodes, 3);
  assert.equal(merged.tabs[0].nodes.find((item) => item.id === "n1").data.formData.source, "local");
  assert.deepEqual(merged.tabs[0].edges.map((edge) => edge.id), ["e2", "e3", "e1"]);
  assert.equal(merged.tabs.length, 2);
  assert.equal(merged.tabs[1].id, "t2");
  assert.equal(merged.schemaVersion, 2);
  assert.equal(tabContentKey(merged.tabs[0]), contentKey(merged.tabs[0].nodes, merged.tabs[0].edges));
});

test("merge keeps a server tab when local has no tabs for it", () => {
  const local = workspace([{ id: "t1", name: "A", nodes: [node("n1")], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, lastModified: 1 }]);
  const server = workspace([{ id: "t1", name: "A2", nodes: [node("n2")], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, lastModified: 1 }]);
  const { workspace: merged } = mergeWorkspaces(local, server);
  assert.deepEqual(merged.tabs[0].nodes.map((item) => item.id).sort(), ["n1", "n2"]);
});
