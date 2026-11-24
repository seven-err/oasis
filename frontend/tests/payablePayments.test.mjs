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
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { setSession } = await server.ssrLoadModule("/src/auth.ts");
    setSession({ csrfToken: "test", user: {
      id: 10, name: "Finance User", email: "finance@example.test", role: "finance",
      roleName: "Finance", mustChangePassword: false,
      permissions: ["dashboard", "checks", "payables", "receivables", "account"],
    } });
    const fixtures = await server.ssrLoadModule("/src/modules/payables/seed.ts");
    for (const [key, name] of Object.entries({
      "oasis.payables.v1": "seedPayables",
      "oasis.payable-payments.v1": "seedPayments",
      "oasis.payable-activity.v1": "seedActivity",
    })) values.set(key, JSON.stringify(fixtures[name]));
    const { payableService: service } = await server.ssrLoadModule("/src/modules/payables/store.ts");
    const { summarizePayables } = await server.ssrLoadModule("/src/modules/payables/utils.ts");
    const { PayableDetails } = await server.ssrLoadModule("/src/modules/payables/PayableDetails.tsx");
    const { HeaderBackProvider } = await server.ssrLoadModule("/src/components/HeaderBack.tsx");
    const { PayableForm } = await server.ssrLoadModule("/src/modules/payables/PayableForm.tsx");
    const { emptyFormValues, recordToFormValues, paymentTermsLabel } = await server.ssrLoadModule("/src/modules/payables/utils.ts");
    for (const [invoice, due, expected] of [
      ["2026-11-20", "2026-11-30", "10 days"],
      ["2026-11-20", "2026-11-20", "0 days"],
      ["2026-11-20", "2026-11-21", "1 day"],
      ["2026-12-20", "2027-01-19", "30 days"],
      ["2024-02-28", "2024-03-01", "2 days"],
      ["2026-03-07", "2026-03-09", "2 days"],
      ["", "2026-11-30", ""],
      ["2026-11-20", "", ""],
      ["2026-02-30", "2026-03-10", ""],
      ["2026-11-20", "2026-11-19", ""],
    ]) assert.equal(paymentTermsLabel(invoice, due), expected);
    const form = renderToStaticMarkup(createElement(HeaderBackProvider, null,
      createElement(PayableForm, { mode: "create", onCancel() {}, onSaved() {} }),
    ));
    assert.doesNotMatch(form, /Category|name="categoryId"/);
    assert.match(form, /<option value="Check">Cheque<\/option>/);
    assert.doesNotMatch(form, />Check<\/option>/);
    const created = service.create(emptyFormValues({
      payeeName: "Test supplier", invoiceNumber: "NO-CATEGORY", items: [{ description: "Office expense", quantity: "2", price: "50" }],
      invoiceDate: "2026-11-20", dueDate: "2026-11-30",
    }));
    assert.equal(created.ok, true, "payables save without a category");
    assert.match(form, /Item Description/);
    assert.match(form, /Quantity/);
    assert.match(form, /Price/);
    assert.match(form, /Amount/);
    assert.doesNotMatch(form, /name="description"|name="totalAmount"/);
    const { validatePayablePayload } = await server.ssrLoadModule("/src/modules/payables/validation.ts");
    const itemValues = recordToFormValues(created.data);
    const validateItems = (items) => validatePayablePayload({ ...itemValues, items }, { existing: [] });
    assert.equal(validateItems([]).ok, false);
    for (const item of [
      { description: "", quantity: "1", price: "10" },
      { description: "Item", quantity: "0", price: "10" },
      { description: "Item", quantity: "Infinity", price: "10" },
      { description: "Item", quantity: "1", price: "-1" },
      { description: "Item", quantity: "1", price: "" },
      { description: "Item", quantity: "1", price: "1.001" },
      { description: "Item", quantity: "1", price: "Infinity" },
    ]) assert.equal(validateItems([item]).ok, false, JSON.stringify(item));
    const changed = service.update(created.data.id, {
      ...itemValues,
      items: [
        { description: "Paper", quantity: "3", price: "0.10" },
        { description: "Ink", quantity: "2", price: "12.35" },
      ],
    });
    assert.equal(changed.ok, true);
    assert.equal(changed.data.totalAmount, 25);
    const editForm = renderToStaticMarkup(createElement(HeaderBackProvider, null,
      createElement(PayableForm, { mode: "edit", record: changed.data, onCancel() {}, onSaved() {} }),
    ));
    assert.equal((editForm.match(/>Save changes<\/button>/g) ?? []).length, 1);
    assert.ok(editForm.indexOf("Save changes") > editForm.indexOf("<form"), "save stays inside the form, below the heading");
    for (const name of ["payeeName", "invoiceNumber", "invoiceDate", "dueDate", "paymentStatus", "paymentMethod", "referenceNumber", "items"]) {
      const fields = editForm.match(new RegExp(`<(?:input|select)\\b[^>]*name="${name}"[^>]*>`, "g"));
      assert.ok(fields?.length, `${name} is available for editing`);
      for (const field of fields) assert.doesNotMatch(field, /readOnly=|disabled=/);
    }
    const termsInput = editForm.match(/<input\b[^>]*name="paymentTerms"[^>]*>/)?.[0];
    assert.ok(termsInput);
    assert.match(termsInput, /readOnly=""/);
    assert.match(termsInput, /value="10 days"/);
    for (const field of ["description", "quantity", "price"]) {
      assert.match(editForm, new RegExp(`aria-label="Clear item 1 ${field}"`));
    }
    assert.match(editForm, /aria-label="Remove item 1"/);
    assert.match(editForm, /lucide-trash/);
    assert.doesNotMatch(editForm, />Remove item</);

    assert.equal(service.get(created.data.id).items.length, 2);
    const editedValues = {
      ...recordToFormValues(changed.data),
      payeeName: "Updated supplier", invoiceNumber: "UPDATED-INVOICE",
      invoiceDate: "2026-11-21", dueDate: "2026-12-01",
      paymentMethod: "Cash", referenceNumber: "UPDATED-REF",
    };
    assert.equal(service.update(created.data.id, editedValues).ok, true);
    assert.deepEqual(recordToFormValues(service.get(created.data.id)), editedValues, "edited information persists");
    const itemDetails = renderToStaticMarkup(createElement(HeaderBackProvider, null,
      createElement(PayableDetails, { record: service.getViewModel(created.data.id), onBack() {}, onEdit() {}, onChanged() {}, notify() {} }),
    ));
    assert.match(itemDetails, /Item Description/);
    assert.match(itemDetails, /Paper/);
    assert.match(itemDetails, /Ink/);
    assert.match(itemDetails, /Payment terms/);
    assert.match(itemDetails, /10 days/);
    assert.equal(created.data.categoryId, 0);
    assert.equal(created.data.totalAmount, 100);
    assert.deepEqual(created.data.items, [{ description: "Office expense", quantity: 2, price: 50 }]);
    const historical = service.list().find((row) => row.categoryId && !row.archivedAt);
    const updated = service.update(historical.id, recordToFormValues(historical, service.paymentsFor(historical.id)));
    assert.equal(updated.ok, true);
    assert.equal(updated.data.categoryId, historical.categoryId);
    assert.equal(updated.data.categoryName, historical.categoryName);
    const payload = {
      paymentDate: "2026-11-20", amountPaid: "100", paymentMethod: "Cash",
      referenceNumber: "", checkId: "", remarks: "Partial payment",
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
    assert.match(form, /name="paymentStatus"/);
    assert.match(form, /value="Paid"/);
    assert.match(form, /value="Unpaid"/);
    const paidValues = emptyFormValues({
      payeeName: "Paid supplier", invoiceNumber: "ALREADY-PAID",
      items: [{ description: "Paid expense", quantity: "1", price: "250" }],
      invoiceDate: "2026-11-20", dueDate: "2026-11-30", paymentStatus: "Paid",
      paymentMethod: "Cash", referenceNumber: "",
    });
    const countBefore = service.list().length;
    for (const invalid of [
      { paymentStatus: "invalid" }, { paymentMethod: "" },
    ]) {
      assert.equal(service.create({ ...paidValues, ...invalid }).ok, false);
      assert.equal(service.list().length, countBefore, "invalid payments do not save a payable");
    }
    assert.equal(service.create({ ...paidValues, paymentStatus: "Unpaid", dueDate: "" }).ok, false);
    const paid = service.create({ ...paidValues, dueDate: "", paymentMethod: "Check" });
    assert.equal(paid.ok, true);
    assert.equal(service.paymentsFor(paid.data.id)[0].checkId, null);
    assert.equal(service.getViewModel(paid.data.id).paymentStatus, "Paid");
    assert.equal(service.getViewModel(paid.data.id).remainingBalance, 0);
    assert.equal(service.paymentsFor(paid.data.id).length, 1);
    assert.equal(service.paymentsFor(paid.data.id)[0].referenceNumber, "");
    const paidEdit = recordToFormValues(paid.data, service.paymentsFor(paid.data.id));
    assert.equal(paidEdit.paymentStatus, "Paid");
    const paidForm = renderToStaticMarkup(createElement(HeaderBackProvider, null,
      createElement(PayableForm, { mode: "edit", record: paid.data, onCancel() {}, onSaved() {} }),
    ));
    assert.doesNotMatch(paidForm, /name="paymentDate"|name="dueDate"|name="checkId"|Linked check/);
    assert.match(paidForm, /Reference number \(optional\)/);
    assert.match(form, /name="dueDate"/);
    assert.equal(paid.data.dueDate, "");
    const { todayIsoDate } = await server.ssrLoadModule("/src/modules/payables/utils.ts");
    assert.equal(service.paymentsFor(paid.data.id)[0].paymentDate, todayIsoDate());
    assert.equal(service.update(paid.data.id, paidEdit).ok, true);
    assert.equal(service.paymentsFor(paid.data.id).length, 1, "saving again does not duplicate the payment");
    assert.equal(service.update(paid.data.id, { ...paidEdit, paymentStatus: "Unpaid" }).ok, false);
    assert.equal(service.update(paid.data.id, {
      ...paidEdit, items: [{ description: "Extra expense", quantity: "1", price: "300" }],
      paymentMethod: "Cash", referenceNumber: "TOP-UP",
    }).ok, true);
    assert.equal(service.getViewModel(paid.data.id).amountPaid, 300);
    assert.equal(service.paymentsFor(paid.data.id).length, 2);
    service.getUser().permissions.recordPayments = false;
    const denied = service.create({ ...paidValues, invoiceNumber: "DENIED-PAID" });
    assert.equal(denied.ok, false);
    assert.equal(service.list().length, countBefore + 1);

    assert.equal(service.recordPayment(record.id, payload).ok, false);
    const savedPayables = service.list();
    const nullableRecord = { ...service.get(created.data.id), referenceNumber: null };
    values.set("oasis.payables.v1", JSON.stringify(savedPayables.map((row) => row.id === nullableRecord.id ? nullableRecord : row)));
    const nullableEdit = recordToFormValues(service.get(nullableRecord.id));
    assert.equal(nullableEdit.referenceNumber, "", "a saved null reference opens as an empty editable field");
    const savedEdit = service.update(nullableRecord.id, { ...nullableEdit, payeeName: "Corrected supplier" });
    assert.equal(savedEdit.ok, true, "editing a payable with a null optional reference does not throw");
    assert.equal(savedEdit.data.referenceNumber, "");
    assert.equal(savedEdit.data.payeeName, "Corrected supplier");
  } finally {
    await server.close();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
