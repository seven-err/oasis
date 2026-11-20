import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createServer } from "vite";

async function browser(t, { remote = null, legacy, version = 0, extra = {}, draft } = {}) {
  const previous = Object.fromEntries(
    ["window", "document", "localStorage", "fetch"].map((key) => [key, globalThis[key]]),
  );
  const values = new Map(legacy ? [["oasis.employees.v2", JSON.stringify(legacy)]] : []);
  if (draft) values.set("oasis.unsaved.55.hr", JSON.stringify(draft));
  const events = new EventTarget();
  globalThis.window = {
    addEventListener: events.addEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    setInterval: () => 0,
  };
  globalThis.document = { querySelector: () => null, visibilityState: "visible" };
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const backend = { data: remote, version, writes: [], fail: false };
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      backend.writes.push(body);
      const destination = url.endsWith("/hr") ? backend : extra.payables;
      if (backend.fail) throw new Error("Network unavailable");
      if (body.version !== destination.version)
        return Response.json(
          { message: "Someone else updated this module. Download your unsaved copy." },
          { status: 409 },
        );
      destination.data = structuredClone(body.data);
      return Response.json({ version: ++destination.version });
    }
    return Response.json({
      modules: { hr: { version: backend.version, data: backend.data }, ...extra },
    });
  };
  const vite = await createServer({
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  t.after(async () => {
    await vite.close();
    Object.assign(globalThis, previous);
  });
  const auth = await vite.ssrLoadModule("/src/auth.ts");
  auth.setSession({ csrfToken: "test", user: { id: 55, permissions: ["hr"] } });
  const storage = await vite.ssrLoadModule("/src/businessStorage.ts");
  await storage.initializeBusinessStorage();
  const settled = async () => {
    for (let count = 0; count < 100; count++) {
      await setImmediate();
      if (storage.businessSyncStatus() !== "Saving changes…") return;
    }
    assert.fail("Save did not settle");
  };
  return { storage, values, backend, settled };
}

test("existing browser records import once, then edits save together", async (t) => {
  const directory = { employees: [{ id: 1, name: "Existing Employee" }], deletedEmployees: [] };
  const { storage, backend, values, settled } = await browser(t, { legacy: directory });
  assert.deepEqual(backend.data["oasis.employees.v2"], directory);
  assert.equal(backend.writes.length, 1);
  storage.writeBusinessJson("oasis.employees.v2", {
    employees: [{ id: 1, name: "Edited" }],
    deletedEmployees: [],
  });
  storage.writeBusinessJson("oasis.employees.v2", {
    employees: [],
    deletedEmployees: [{ id: 1, name: "Edited" }],
  });
  await settled();
  assert.equal(backend.writes.length, 2);
  assert.deepEqual(backend.data["oasis.employees.v2"].employees, []);
  assert.equal(backend.data["oasis.employees.v2"].deletedEmployees[0].name, "Edited");
  assert.equal(values.has("oasis.unsaved.55.hr"), false);
  assert.equal(JSON.parse(values.get("oasis.employees.v2")).employees[0].name, "Existing Employee");
});

test("shared records override old browser data without leaking inaccessible modules", async (t) => {
  const remote = {
    "oasis.employees.v2": { employees: [{ id: 2, name: "Shared" }], deletedEmployees: [] },
  };
  const { storage, backend } = await browser(t, {
    remote,
    version: 3,
    legacy: { employees: [{ id: 1 }], deletedEmployees: [] },
  });
  assert.equal(storage.readBusinessJson("oasis.employees.v2", null).employees[0].name, "Shared");
  assert.equal(backend.writes.length, 0);
  assert.deepEqual(storage.readBusinessJson("oasis.checks.v1", null), []);
  assert.throws(() => storage.writeBusinessJson("oasis.checks.v1", []), /do not have access/);
});

test("a fresh browser does not initialize empty shared records before legacy data can import", async (t) => {
  const { storage, backend } = await browser(t);
  assert.equal(backend.writes.length, 0);
  assert.deepEqual(storage.readBusinessJson("oasis.employees.v2", null), {
    employees: [],
    deletedEmployees: [],
  });
});

test("conflicts preserve the draft and never overwrite another browser", async (t) => {
  const { storage, backend, values, settled } = await browser(t, {
    remote: { "oasis.employees.v2": { employees: [], deletedEmployees: [] } },
    version: 1,
  });
  backend.version = 2;
  backend.data["oasis.employees.v2"].employees = [{ id: 7, name: "Other browser" }];
  storage.writeBusinessJson("oasis.employees.v2", {
    employees: [{ id: 8, name: "My draft" }],
    deletedEmployees: [],
  });
  await settled();
  assert.equal(storage.hasBusinessConflict(), true);
  assert.equal(backend.data["oasis.employees.v2"].employees[0].name, "Other browser");
  assert.equal(storage.readBusinessJson("oasis.employees.v2", null).employees[0].name, "My draft");
  assert.equal(
    JSON.parse(values.get("oasis.unsaved.55.hr")).data["oasis.employees.v2"].employees[0].name,
    "My draft",
  );
  assert.throws(() => storage.writeBusinessJson("oasis.employees.v2", {}), /Someone else updated/);
});

test("failed saves remain recoverable and can be retried", async (t) => {
  const { storage, backend, settled } = await browser(t, {
    remote: { "oasis.employees.v2": { employees: [], deletedEmployees: [] } },
    version: 1,
  });
  backend.fail = true;
  storage.writeBusinessJson("oasis.employees.v2", {
    employees: [{ id: 3, name: "Retry me" }],
    deletedEmployees: [],
  });
  await settled();
  assert.match(storage.businessSyncError(), /Network unavailable/);
  backend.fail = false;
  await storage.retryBusinessSave();
  assert.equal(storage.businessSyncError(), "");
  assert.equal(backend.data["oasis.employees.v2"].employees[0].name, "Retry me");
});

test("remote refresh never replaces an open edit form", async (t) => {
  const { storage, backend } = await browser(t, {
    remote: { "oasis.employees.v2": { employees: [], deletedEmployees: [] } },
    version: 1,
  });
  backend.version = 2;
  backend.data = { "oasis.employees.v2": { employees: [{ id: 5 }], deletedEmployees: [] } };
  document.querySelector = () => ({});
  await storage.refreshBusinessStorage();
  assert.deepEqual(storage.readBusinessJson("oasis.employees.v2", null).employees, []);
  document.querySelector = () => null;
  await storage.refreshBusinessStorage();
  assert.equal(storage.readBusinessJson("oasis.employees.v2", null).employees[0].id, 5);
});

test("edits in another module during an in-flight save are also flushed", async (t) => {
  const extra = {
    payables: {
      version: 1,
      data: {
        "oasis.payables.v1": [],
        "oasis.payable-payments.v1": [],
        "oasis.payable-categories.v1": [],
        "oasis.payable-activity.v1": [],
      },
    },
  };
  const { storage, backend, settled } = await browser(t, {
    remote: { "oasis.employees.v2": { employees: [], deletedEmployees: [] } },
    version: 1,
    extra,
  });
  const fetchBackend = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/payables"))
      storage.writeBusinessJson("oasis.employees.v2", {
        employees: [{ id: 9, name: "Later edit" }],
        deletedEmployees: [],
      });
    return fetchBackend(url, options);
  };
  storage.writeBusinessJson("oasis.payables.v1", [{ id: 10, totalAmount: 250 }]);
  await settled();
  assert.equal(backend.data["oasis.employees.v2"].employees[0].name, "Later edit");
  assert.equal(extra.payables.data["oasis.payables.v1"][0].totalAmount, 250);
  assert.equal(storage.businessSyncStatus(), "All changes saved");
});

test("reopening after a failed save preserves the draft and flags newer server records", async (t) => {
  const data = {
    "oasis.employees.v2": { employees: [{ id: 1, name: "Unsaved" }], deletedEmployees: [] },
  };
  const { storage, backend } = await browser(t, {
    remote: { "oasis.employees.v2": { employees: [], deletedEmployees: [] } },
    version: 2,
    draft: { version: 1, data },
  });
  assert.equal(storage.readBusinessJson("oasis.employees.v2", null).employees[0].name, "Unsaved");
  assert.equal(storage.hasBusinessConflict(), true);
  assert.equal(backend.writes.length, 0);
});
