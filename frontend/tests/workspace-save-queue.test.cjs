const test = require("node:test");
const assert = require("node:assert/strict");

const { WorkspaceSaveQueue } = require("./.build/workspace-save-queue.js");

function workspace(tag) {
  return { schemaVersion: 2, tabs: [], activeTabId: "", timestamp: 1, tag };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("queue keeps one request in flight and sends the newest snapshot", async () => {
  const calls = [];
  let resolveFirst;
  const states = [];
  const saved = [];
  const queue = new WorkspaceSaveQueue(0, {
    save: (ws, revision) => {
      calls.push({ ws, revision });
      if (calls.length === 1) {
        return new Promise((resolve) => { resolveFirst = resolve; });
      }
      return Promise.resolve({ revision: revision + 1 });
    },
    onStateChange: (state) => states.push(state),
    onSaved: (revision, ws, hasPending) => saved.push({ revision, tag: ws.tag, hasPending }),
  });

  queue.enqueue(workspace("a"));
  queue.enqueue(workspace("b"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ws.tag, "a");
  assert.equal(calls[0].revision, 0);

  resolveFirst({ revision: 1 });
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].ws.tag, "b");
  assert.equal(calls[1].revision, 1);
  await flush();
  assert.deepEqual(saved.map((item) => item.tag), ["a", "b"]);
  assert.equal(saved[0].hasPending, true);
  assert.equal(saved[1].hasPending, false);
  assert.equal(queue.currentRevision, 2);
  assert.deepEqual(states, ["saving", "saving", "saving", "saved"]);
});

test("queue reports 409 conflicts without retrying", async () => {
  const conflicts = [];
  const queue = new WorkspaceSaveQueue(3, {
    save: () => Promise.reject({ status: 409, payload: '{"detail":{"revision":4}}' }),
    onConflict: (payload, ws) => conflicts.push({ payload, tag: ws.tag }),
  });
  queue.enqueue(workspace("conflict"));
  await flush();
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].tag, "conflict");
  assert.equal(queue.hasPending, false);
});

test("network failures keep the snapshot for retry", async () => {
  let attempts = 0;
  const errors = [];
  const queue = new WorkspaceSaveQueue(0, {
    save: () => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error("offline"));
      return Promise.resolve({ revision: 1 });
    },
    onError: (error) => errors.push(error.message),
  });
  queue.enqueue(workspace("retry"));
  await flush();
  assert.equal(errors[0], "offline");
  assert.equal(queue.hasPending, true);
  assert.equal(queue.isSaving, false);

  queue.retry();
  await flush();
  assert.equal(attempts, 2);
  assert.equal(queue.hasPending, false);
  assert.equal(queue.currentRevision, 1);
});

test("dispose stops future drains", async () => {
  let calls = 0;
  const queue = new WorkspaceSaveQueue(0, {
    save: () => { calls += 1; return Promise.resolve({ revision: 1 }); },
  });
  queue.dispose();
  queue.enqueue(workspace("ignored"));
  await flush();
  assert.equal(calls, 0);
  assert.equal(queue.hasPending, false);
});
