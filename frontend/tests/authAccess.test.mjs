import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canAccessPage, initialPage, moduleUser, setSession } from "../src/auth.ts";

const access = {
  "super-admin": ["dashboard", "hr", "checks", "payables", "receivables", "users", "activity", "settings", "account"],
  hr: ["dashboard", "hr", "account"],
  finance: ["dashboard", "checks", "payables", "receivables", "account"],
};
const sessionFor = (role) => ({
  csrfToken: "test",
  user: { id: 10, name: "Signed In User", email: "user@example.test", role, roleName: role, mustChangePassword: false, permissions: access[role] },
});
afterEach(() => setSession(null));

test("anonymous sessions and temporary passwords cannot unlock existing screens", () => {
  for (const page of ["dashboard", "checks", "employees", "users"]) assert.equal(canAccessPage(page), false);
  setSession({ ...sessionFor("super-admin"), user: { ...sessionFor("super-admin").user, mustChangePassword: true } });
  assert.equal(canAccessPage("dashboard"), false);
  assert.equal(canAccessPage("checks"), false);
});

test("existing page navigation follows server permissions and rejects unknown pages", () => {
  for (const role of ["hr", "finance", "super-admin"]) {
    setSession(sessionFor(role));
    assert.equal(canAccessPage("employees"), role !== "finance");
    assert.equal(canAccessPage("checks"), role !== "hr");
    assert.equal(canAccessPage("payables"), role !== "hr");
    assert.equal(canAccessPage("receivables"), role !== "hr");
    assert.equal(canAccessPage("users"), role === "super-admin");
    assert.equal(canAccessPage("archives"), role === "super-admin");
    assert.equal(canAccessPage("profile"), true);
    assert.equal(canAccessPage("unknown"), false);
  }
  setSession({ ...sessionFor("finance"), user: { ...sessionFor("finance").user, permissions: ["dashboard", "checks", "account"] } });
  assert.equal(canAccessPage("payables"), false);
  assert.equal(initialPage("/hr/alphalist"), "employees");
  assert.equal(initialPage("/receivables"), "receivables");
});

test("module actions use the signed-in identity and deny unassigned modules", () => {
  setSession(sessionFor("hr"));
  const user = moduleUser("checks", ["editChecks", "archiveChecks"]);
  assert.equal(user.name, "Signed In User");
  assert.deepEqual(user.permissions, { editChecks: false, archiveChecks: false });
  setSession(sessionFor("finance"));
  assert.equal(moduleUser("checks", ["editChecks"]).permissions.editChecks, true);
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
    setSsrSession(sessionFor("hr"));
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
