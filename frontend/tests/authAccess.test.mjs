import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canAccessPage, initialPage, moduleUser, readSession, setSession } from "../src/auth.ts";

const access = {
  "super-admin": ["dashboard", "hr", "checks", "payables", "receivables", "users", "activity", "settings", "account"],
  hr: ["dashboard", "hr", "checks", "payables", "receivables", "account"],
  finance: ["dashboard", "checks", "payables", "receivables", "account"],
};
const sessionFor = (role) => ({
  csrfToken: "test",
  user: { id: 10, name: "Signed In User", email: "user@example.test", role, roleName: role, mustChangePassword: false, permissions: access[role] },
});
afterEach(() => setSession(null));

test("session requests stop waiting and explain connection failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      throw new DOMException("Timed out", "TimeoutError");
    };
    await assert.rejects(readSession(), /server and database are running/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("anonymous sessions and temporary passwords cannot unlock existing screens", () => {
  for (const page of ["dashboard", "checks", "employees", "users", "password"]) assert.equal(canAccessPage(page), false);
  setSession({ ...sessionFor("super-admin"), user: { ...sessionFor("super-admin").user, mustChangePassword: true } });
  assert.equal(canAccessPage("dashboard"), false);
  assert.equal(canAccessPage("checks"), false);
  assert.equal(canAccessPage("password"), false);
});

test("existing page navigation follows server permissions and rejects unknown pages", () => {
  for (const role of ["hr", "finance", "super-admin"]) {
    setSession(sessionFor(role));
    assert.equal(canAccessPage("employees"), role !== "finance");
    assert.equal(canAccessPage("checks"), true);
    assert.equal(canAccessPage("payables"), true);
    assert.equal(canAccessPage("receivables"), true);
    assert.equal(canAccessPage("users"), role === "super-admin");
    assert.equal(canAccessPage("archives"), role === "super-admin");
    assert.equal(canAccessPage("profile"), true);
    assert.equal(canAccessPage("password"), true);
    assert.equal(canAccessPage("unknown"), false);
  }
  setSession({ ...sessionFor("finance"), user: { ...sessionFor("finance").user, permissions: ["dashboard", "checks", "account"] } });
  assert.equal(canAccessPage("payables"), false);
  assert.equal(initialPage("/hr/alphalist"), "employees");
  assert.equal(initialPage("/receivables"), "receivables");
  assert.equal(initialPage("/change-password"), "password");
  for (const path of ["/users", "/users/create", "/users/3", "/users/3/edit", "/team"]) {
    assert.equal(initialPage(path), "users", path);
  }
  assert.equal(initialPage("/users-unrelated"), "dashboard");
});

test("HR monitoring access and actions follow the selected server permissions", () => {
  for (const selected of ["checks", "payables", "receivables"]) {
    const session = sessionFor("hr");
    session.user.permissions = ["dashboard", "hr", "account", selected];
    setSession(session);
    for (const module of ["checks", "payables", "receivables"]) {
      assert.equal(canAccessPage(module), module === selected);
      assert.equal(moduleUser(module, ["edit"]).permissions.edit, module === selected);
    }
    assert.equal(canAccessPage("employees"), true);
    assert.equal(canAccessPage("users"), false);
    assert.equal(canAccessPage("settings"), false);
  }
});

test("module actions use the signed-in identity and deny unassigned modules", () => {
  setSession({ ...sessionFor("hr"), user: { ...sessionFor("hr").user, permissions: ["dashboard", "hr", "account"] } });
  const user = moduleUser("checks", ["editChecks", "archiveChecks"]);
  assert.equal(user.name, "Signed In User");
  assert.deepEqual(user.permissions, { editChecks: false, archiveChecks: false });
  setSession(sessionFor("finance"));
  for (const [module, actions] of [
    ["checks", ["editChecks", "archiveChecks"]],
    ["payables", ["editPayables", "recordPayments", "reversePayments", "archivePayables", "manageCategories"]],
    ["receivables", ["editReceivables", "recordCollections", "archiveReceivables"]],
  ]) {
    assert.equal(canAccessPage(module), true);
    assert.ok(Object.values(moduleUser(module, actions).permissions).every(Boolean));
  }
});

test("existing dashboard hides restricted module totals and record details", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { setSession: setSsrSession } = await server.ssrLoadModule("/src/auth.ts");
    const { Dashboard } = await server.ssrLoadModule("/src/App.tsx");
    const { HeaderBackProvider } = await server.ssrLoadModule("/src/components/HeaderBack.tsx");
    const render = () => renderToStaticMarkup(createElement(HeaderBackProvider, null, createElement(Dashboard, {
      checks: [{ id: 1, payeeName: "Private Finance Payee", bankName: "Private Bank", checkType: "Issued Check", checkDate: "2026-11-19", checkAmount: 100, checkStatus: "Pending" }],
      payables: [], receivables: [], employees: [{ status: "Active" }], go: () => {},
    })));
    setSsrSession({ ...sessionFor("hr"), user: { ...sessionFor("hr").user, permissions: ["dashboard", "hr", "account"] } });
    const hr = render();
    assert.match(hr, /Active Employees/);
    assert.doesNotMatch(hr, /Total Checks|Outstanding Payables|Outstanding Receivables|Private Finance Payee|Private Bank|Payment recorded/);
    setSsrSession(sessionFor("finance"));
    const finance = render();
    assert.match(finance, /Total Checks|Private Finance Payee/);
    assert.doesNotMatch(finance, /Active Employees|Employee updated/);
  } finally {
    await server.close();
  }
});
