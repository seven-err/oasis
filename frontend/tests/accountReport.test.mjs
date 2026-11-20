import assert from "node:assert/strict";
import test from "node:test";
import { accountReportRows, safeAccountCsvRows } from "../src/components/accountReport.ts";

test("account report includes only requested fields and formats last login", () => {
  const rows = accountReportRows([
    { name: "Example", email: "user@example.com", role: "HR", status: "Active", last_login_at: null, password: "secret" },
    { name: "Second", email: "second@example.com", role: "Finance", status: "Inactive", last_login_at: "2026-01-02T03:04:05Z" },
  ]);
  assert.deepEqual(Object.keys(rows[0]), ["Name", "Email", "Role", "Status", "Last login (Philippine time)"]);
  assert.equal(rows[0]["Last login (Philippine time)"], "Never");
  assert.match(rows[1]["Last login (Philippine time)"], /2026/);
  assert.doesNotMatch(JSON.stringify(rows), /secret/);
});

test("CSV export neutralizes spreadsheet formulas without changing the preview", () => {
  const rows = accountReportRows([{ name: "  =1+1", email: "+user@example.com", role: "HR", status: "Active", last_login_at: null }]);
  const safe = safeAccountCsvRows(rows);
  assert.equal(rows[0].Name, "  =1+1");
  assert.equal(safe[0].Name, "'  =1+1");
  assert.equal(safe[0].Email, "'+user@example.com");
  assert.equal(safe[0].Role, "HR");
});
