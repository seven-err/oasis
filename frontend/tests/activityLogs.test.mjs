import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

test("view all loads every activity page without navigating away from the table", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  const originalFetch = globalThis.fetch;
  const requests = [];
  let failPage = false;
  globalThis.fetch = async (url) => {
    requests.push(url);
    const page = Number(new URL(url, "http://localhost").searchParams.get("page"));
    if (failPage && page === 2) return Response.json({ message: "Unable to load logs" }, { status: 500 });
    return Response.json({ data: [{ id: page }], last_page: 3 });
  };
  try {
    const { loadActivityLogs } = await server.ssrLoadModule("/src/activityLogs.ts");
    assert.deepEqual(await loadActivityLogs(), [{ id: 1 }]);
    assert.deepEqual(requests.splice(0), ["/activity-logs?page=1"]);
    assert.deepEqual(await loadActivityLogs(true), [{ id: 1 }, { id: 2 }, { id: 3 }]);
    assert.deepEqual(requests.splice(0), ["/activity-logs?page=1", "/activity-logs?page=2", "/activity-logs?page=3"]);
    failPage = true;
    await assert.rejects(loadActivityLogs(true), /Unable to load logs/);
    const source = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(source, /href="\/activity-logs"/);
    assert.match(source, /setLogs\(await loadActivityLogs\(true\)\)/);
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
});
