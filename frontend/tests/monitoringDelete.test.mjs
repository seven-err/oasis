import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DELETED_RECORD_RETENTION_MS, deletionDaysLeft, isDeletionExpired } from "../src/components/deletedRecordRetention.ts";

test("days left counts partial days, handles expiry, and does not invent missing dates", () => {
  const deletedAt = "2026-11-18T02:30:00Z";
  const start = Date.parse(deletedAt);
  const day = 24 * 60 * 60 * 1000;
  assert.equal(deletionDaysLeft(deletedAt, start), 30);
  assert.equal(deletionDaysLeft(deletedAt, start + day), 29);
  assert.equal(deletionDaysLeft(deletedAt, start + 29 * day), 1);
  assert.equal(deletionDaysLeft(deletedAt, start + 30 * day - 1), 1);
  assert.equal(deletionDaysLeft(deletedAt, start + 30 * day), 0);
  assert.equal(deletionDaysLeft(deletedAt, start + 31 * day), 0);
  assert.equal(deletionDaysLeft(deletedAt, start - day), 30);
  assert.equal(deletionDaysLeft("invalid", start), null);
  assert.equal(deletionDaysLeft(undefined, start), null);
});

test("retention expires at exactly 30 elapsed days and never guesses missing dates", () => {
  const deletedAt = "2026-11-18T02:30:00Z";
  const boundary = Date.parse(deletedAt) + DELETED_RECORD_RETENTION_MS;
  assert.equal(isDeletionExpired(deletedAt, boundary - 1), false);
  assert.equal(isDeletionExpired(deletedAt, boundary), true);
  assert.equal(isDeletionExpired(deletedAt, boundary + 1), true);
  for (const invalid of [undefined, null, "", "invalid"]) {
    assert.equal(isDeletionExpired(invalid, boundary), false);
  }
  assert.equal(isDeletionExpired(deletedAt, Date.parse(deletedAt) - 1), false);
});

test("monitoring deletion is authorized, recoverable, audited, and retains related data", async () => {
  const values = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { ArchivedRecords, EmployeeRegister, loadEmployeeRecords } = await server.ssrLoadModule("/src/App.tsx");
    const { HeaderBackProvider } = await server.ssrLoadModule("/src/components/HeaderBack.tsx");
    const { CheckMonitoring } = await server.ssrLoadModule("/src/modules/checks/index.ts");
    const checkMarkup = renderToStaticMarkup(
      createElement(HeaderBackProvider, null, createElement(CheckMonitoring, { notify: () => {} })),
    );
    assert.match(checkMarkup, /Total Checks/);
    assert.match(checkMarkup, /CHK-240118/);
    const twelveEmployees = Array.from({ length: 12 }, (_, index) => ({
      ...loadEmployeeRecords().employees[0],
      id: index + 1,
      number: `EMP-${String(index + 1).padStart(5, "0")}`,
      name: `Employee ${String(index + 1).padStart(2, "0")}`,
    }));
    const alphalistMarkup = renderToStaticMarkup(createElement(EmployeeRegister, {
      data: twelveEmployees,
      onAdd: () => {},
      onView: () => {},
      onEdit: () => {},
      onDelete: () => {},
    }));
    assert.match(alphalistMarkup, /Showing 1–10 of 12/);
    assert.match(alphalistMarkup, /EMP-00010/);
    assert.doesNotMatch(alphalistMarkup, /EMP-00011/);
    const initialDirectory = loadEmployeeRecords();
    assert.ok(initialDirectory.employees.length > 0);
    assert.deepEqual(initialDirectory.deletedEmployees, []);
    const deletedEmployee = { ...initialDirectory.employees[0], deletedAt: "2026-11-18T00:00:00Z" };
    const savedDirectory = {
      employees: initialDirectory.employees.filter((record) => record.id !== deletedEmployee.id),
      deletedEmployees: [deletedEmployee],
    };
    values.set("oasis.employees.v2", JSON.stringify(savedDirectory));
    assert.deepEqual(loadEmployeeRecords(), savedDirectory, "deleted employees remain recoverable after reload");
    values.set("oasis.employees.v2", JSON.stringify({ ...savedDirectory, deletedEmployees: [initialDirectory.employees[0]] }));
    const migrationTime = Date.now();
    const migrated = loadEmployeeRecords().deletedEmployees[0];
    assert.ok(Date.parse(migrated.deletedAt) >= migrationTime);
    assert.equal(isDeletionExpired(migrated.deletedAt), false, "legacy employees receive a full retention period");
    values.set("oasis.employees.v2", JSON.stringify({ employees: [], deletedEmployees: [] }));
    assert.deepEqual(loadEmployeeRecords(), { employees: [], deletedEmployees: [] }, "empty saved lists must not reseed employees");
    values.clear();
    const deletedPageProps = {
      checks: [{ id: 999, checkNumber: "DELETED-CHECK-999", payeeName: "Deleted payee", deletedAt: new Date().toISOString(), archivedAt: null }],
      payables: [], receivables: [],
      employees: [{ id: 998, number: "DELETED-EMP-998", name: "Deleted employee", archived: false }],
      deleted: true,
    };
    const deletedPage = renderToStaticMarkup(createElement(ArchivedRecords, deletedPageProps));
    assert.match(deletedPage, /DELETED-CHECK-999/);
    assert.match(deletedPage, /DELETED-EMP-998/);
    assert.match(deletedPage, /Restore<\/button>/);
    assert.doesNotMatch(deletedPage, /No deleted records/);
    assert.match(deletedPage, /permanently deleted after 30 days/);
    assert.match(deletedPage, /<th>Days left<\/th>/);
    assert.match(deletedPage, /30 days left/);
    assert.match(deletedPage, /Date unavailable/);
    const archivePage = renderToStaticMarkup(createElement(ArchivedRecords, { ...deletedPageProps, deleted: false }));
    assert.match(archivePage, /No archived records/);
    assert.doesNotMatch(archivePage, /<th>Days left<\/th>/);
    const { DeleteConfirmationDialog } = await server.ssrLoadModule("/src/components/DeleteConfirmationDialog.tsx");
    let confirmations = 0;
    const markup = renderToStaticMarkup(createElement(DeleteConfirmationDialog, {
      recordLabel: "Payable INV-123",
      onCancel: () => {},
      onConfirm: () => { confirmations++; },
    }));
    assert.match(markup, /Payable INV-123/);
    assert.match(markup, /Confirm Delete/);
    assert.match(markup, />Cancel<\/button>/);
    assert.match(markup, /aria-labelledby=/);
    assert.equal(confirmations, 0, "opening the confirmation must not delete a record");
    for (const [module, name, permission] of [
      ["checks", "checkService", "archiveChecks"],
      ["payables", "payableService", "archivePayables"],
      ["receivables", "receivableService", "archiveReceivables"],
    ]) {
      values.clear();
      const { [name]: service } = await server.ssrLoadModule(`/src/modules/${module}/store.ts`);
      const before = service.list();
      const target = before[0];
      assert.ok(target, `${module}: seeded record exists`);
      const user = service.getUser();
      const allowed = user.permissions[permission];
      user.permissions[permission] = false;
      const unchanged = [...values.entries()];
      assert.equal(service.deleteRecord(target.id).ok, false);
      assert.deepEqual([...values.entries()], unchanged);
      user.permissions[permission] = allowed;
      const relatedBefore = new Map([...values.entries()].filter(([key]) => /payment|collection|attachment|followup/i.test(key)));
      assert.equal(service.deleteRecord(target.id).ok, true);
      assert.equal(service.list().length, before.length - 1);
      assert.equal(service.list().some((record) => record.id === target.id), false);
      const deleted = service.listDeleted().find((record) => record.id === target.id);
      assert.ok(deleted?.deletedAt);
      assert.equal(deleted.updatedById, user.id);
      assert.equal(service.deleteRecord(target.id).ok, false);
      assert.equal(service.deleteRecord(-1).ok, false);
      for (const [key, value] of relatedBefore) assert.equal(values.get(key), value);
      assert.ok([...values.entries()].some(([key, value]) => /activity/i.test(key)
        && JSON.parse(value).some((entry) => entry.action === "deleted")));
      assert.equal(service.restoreDeleted(target.id).ok, true);
      assert.equal(service.list().length, before.length);
      assert.equal(service.list().find((record) => record.id === target.id)?.archivedAt, target.archivedAt);
      assert.equal(service.archive(target.id).ok, true);
      assert.equal(service.deleteRecord(target.id).ok, true);
      assert.ok(service.listDeleted().find((record) => record.id === target.id)?.archivedAt);
      const deletionTime = Date.parse(service.listDeleted().find((record) => record.id === target.id).deletedAt);
      const cutoff = deletionTime + DELETED_RECORD_RETENTION_MS;
      const remaining = service.list();
      assert.equal(service.purgeExpiredDeleted(cutoff - 1), 0);
      user.permissions[permission] = false;
      assert.equal(service.purgeExpiredDeleted(cutoff), 0, "cleanup respects deletion permission");
      user.permissions[permission] = allowed;
      assert.equal(service.purgeExpiredDeleted(cutoff), 1);
      assert.equal(service.listDeleted().some((record) => record.id === target.id), false);
      assert.deepEqual(service.list(), remaining, "active and archived records are unchanged");
      assert.equal(service.restoreDeleted(target.id).ok, false, "expired records cannot be restored");
      assert.equal(service.purgeExpiredDeleted(cutoff), 0, "cleanup is idempotent");
    }
  } finally {
    await server.close();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
