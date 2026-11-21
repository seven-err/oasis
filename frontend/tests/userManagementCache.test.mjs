import assert from "node:assert/strict";
import test from "node:test";
import { setSession } from "../src/auth.ts";
import {
  cacheUserList,
  clearUserListCache,
  getCachedUserList,
} from "../src/components/userManagementCache.ts";

test("account list cache isolates queries and sessions, survives time away, and clears after changes", (t) => {
  t.mock.method(Date, "now", () => 1000);
  const list = { data: [], total: 0, current_page: 1, per_page: 20, last_page: 1 };
  try {
    setSession({ user: { id: 1 } });
    cacheUserList("/users", list);
    assert.equal(getCachedUserList("/users"), list);
    assert.equal(getCachedUserList("/users?page=2"), null);
    Date.now.mock.mockImplementation(() => 31_000);
    assert.equal(getCachedUserList("/users"), list);
    cacheUserList("/users", list);
    clearUserListCache();
    assert.equal(getCachedUserList("/users"), null);
    cacheUserList("/users", list);
    setSession({ user: { id: 2 } });
    assert.equal(getCachedUserList("/users"), null);
    cacheUserList("/users", list);
    setSession(null);
    assert.equal(getCachedUserList("/users"), null);
  } finally {
    clearUserListCache();
    setSession(null);
  }
});

test("returning to accounts renders cached rows before effects run, but details load fresh", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  const previousWindow = globalThis.window;
  try {
    const { setSession: setSsrSession } = await server.ssrLoadModule("/src/auth.ts");
    const { cacheUserList: cacheList } = await server.ssrLoadModule(
      "/src/components/userManagementCache.ts",
    );
    const { UserManagement } = await server.ssrLoadModule("/src/components/UserManagement.tsx");
    const { HeaderBackProvider } = await server.ssrLoadModule("/src/components/HeaderBack.tsx");
    setSsrSession({ user: { id: 1 } });
    cacheList("/users", {
      data: [
        {
          id: 2,
          name: "Cached Account",
          email: "cached@example.test",
          is_active: true,
          last_login_at: null,
        },
      ],
      total: 1,
      current_page: 1,
      per_page: 20,
      last_page: 1,
    });
    globalThis.window = { location: { pathname: "/team", search: "", origin: "http://localhost" } };
    const render = () =>
      renderToStaticMarkup(
        createElement(
          HeaderBackProvider,
          null,
          createElement(UserManagement, { notify: () => {} }),
        ),
      );
    const html = render();
    assert.match(html, /Cached Account/);
    assert.doesNotMatch(html, /Loading accounts|>Clear<|>Actions<|>Manage</);
    assert.match(html, /aria-label="Open account for Cached Account"/);
    assert.match(html, /aria-label="Previous page"/);
    assert.match(html, /aria-label="Next page"/);
    assert.match(html, /Showing 1-1 of 1/);
    window.location.pathname = "/users/2";
    assert.match(render(), /Loading account…/);
  } finally {
    globalThis.window = previousWindow;
    await server.close();
  }
});
