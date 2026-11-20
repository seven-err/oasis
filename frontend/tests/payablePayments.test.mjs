import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("Finance records payments without approval while retaining payment safeguards", async () => {
  const values = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { setSession } = await server.ssrLoadModule("/src/auth.ts");
    setSession({ csrfToken: "test", user: {
      id: 10, name: "Finance User", email: "finance@example.test", role: "finance",
      roleName: "Finance", mustChangePassword: false,
      permissions: ["dashboard", "checks", "payables", "receivables", "account"],
    } });
    const { payableService: service } = await server.ssrLoadModule("/src/modules/payables/store.ts");
    const { summarizePayables } = await server.ssrLoadModule("/src/modules/payables/utils.ts");
    const { PayableDetails } = await server.ssrLoadModule("/src/modules/payables/PayableDetails.tsx");
    const { HeaderBackProvider } = await server.ssrLoadModule("/src/components/HeaderBack.tsx");
    const payload = {
      paymentDate: "2026-11-20", amountPaid: "100", paymentMethod: "Cash",
      referenceNumber: "PAY-TEST", checkId: "", remarks: "Partial payment",
    };
    for (const status of ["Pending", "Rejected"]) {
      const record = service.listViewModels().find((row) => row.approvalStatus === status && !row.archivedAt);
      assert.ok(record);
      const markup = renderToStaticMarkup(createElement(HeaderBackProvider, null,
        createElement(PayableDetails, { record, focus: "payments", onBack() {}, onEdit() {}, onChanged() {}, notify() {} }),
      ));
      assert.match(markup, /name="amountPaid"/);
      assert.doesNotMatch(markup, /Approve \/ Reject|Approval decision|Rejection reason/);
      assert.equal(summarizePayables([record]).totalRemainingBalance, record.remainingBalance);
      assert.equal(service.recordPayment(record.id, { ...payload, amountPaid: String(record.remainingBalance + 1) }).ok, false);
      const result = service.recordPayment(record.id, payload);
      assert.equal(result.ok, true);
      assert.equal(result.data.recordedById, 10);
      assert.equal(service.getViewModel(record.id).remainingBalance, record.remainingBalance - 100);
      assert.equal(service.get(record.id).approvalStatus, status, "historical metadata is preserved");
      assert.equal(service.archive(record.id).ok, true);
      assert.equal(service.recordPayment(record.id, payload).ok, false);
    }
    const record = service.listViewModels().find((row) => !row.archivedAt && row.remainingBalance > 0);
    for (const amountPaid of ["0", "-1", "invalid"]) {
      assert.equal(service.recordPayment(record.id, { ...payload, amountPaid }).ok, false);
    }
    service.getUser().permissions.recordPayments = false;
    assert.equal(service.recordPayment(record.id, payload).ok, false);
  } finally {
    await server.close();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
