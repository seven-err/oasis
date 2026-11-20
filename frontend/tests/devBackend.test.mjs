import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import { ensureBackend } from "../scripts/dev-backend.mjs";

test("frontend startup reuses a ready Laravel server without starting another", async (t) => {
  const server = createServer((request, response) => {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end('{"message":"Unauthenticated."}');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const child = await ensureBackend({
    cwd: ".",
    url: `http://127.0.0.1:${server.address().port}/auth/session`,
    spawn: () => assert.fail("A second backend must not start"),
  });
  assert.equal(child, null);
});

test("missing PHP fails with a clear error and cleans up the child", async (t) => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Connection refused");
  };
  t.after(() => {
    globalThis.fetch = previous;
  });
  let killed = false;
  await assert.rejects(
    ensureBackend({
      cwd: ".",
      spawn: () => {
        const child = new EventEmitter();
        child.exitCode = null;
        child.kill = () => {
          killed = true;
        };
        queueMicrotask(() => child.emit("error", new Error("PHP executable missing")));
        return child;
      },
    }),
    /PHP executable missing/,
  );
  assert.equal(killed, true);
});
