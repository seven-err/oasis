import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("customers and receivables save without client IDs, and references are optional", async () => {
  const storage = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  try {
    const { setSession } = await server.ssrLoadModule("/src/auth.ts");
    setSession({ csrfToken: "test", user: {
      id: 10, name: "Finance User", email: "finance@example.test", role: "finance",
      roleName: "Finance", mustChangePassword: false,
      permissions: ["checks", "receivables"],
    } });
    const { receivableService } = await server.ssrLoadModule("/src/modules/receivables/store.ts");
    const { recordToFormValues } = await server.ssrLoadModule("/src/modules/receivables/utils.ts");
    const { validateCustomerPayload } = await server.ssrLoadModule("/src/modules/receivables/validation.ts");
    const customerValues = {
      clientId: "", customerName: "New customer", contactNumber: "09123456789",
      emailAddress: "customer@example.test", billingAddress: "Manila",
    };
    const customer = receivableService.createCustomer(customerValues);
    assert.equal(customer.ok, true, JSON.stringify(customer));
    assert.equal(customer.data.clientId, "");
    assert.ok(receivableService.customers(true).some((row) => row.id === customer.data.id));
    assert.equal(validateCustomerPayload(customerValues, { existing: [customer.data] }).ok, true);
    assert.ok(validateCustomerPayload({ ...customerValues, customerName: "" }, { existing: [] }).errors.customerName);
    const values = {
      ...recordToFormValues(receivableService.list()[0]), ...customerValues,
      customerId: String(customer.data.id), invoiceNumber: "OPTIONAL-REF", referenceNumber: "",
    };
    const receivable = receivableService.create(values);
    assert.equal(receivable.ok, true, JSON.stringify(receivable));
    assert.equal(receivable.data.referenceNumber, "");
    assert.equal(receivableService.update(receivable.data.id, values).ok, true);

    const { checkService } = await server.ssrLoadModule("/src/modules/checks/store.ts");
    const { recordToFormValues: checkToForm } = await server.ssrLoadModule("/src/modules/checks/utils.ts");
    const checkValues = { ...checkToForm(checkService.list()[0]), checkNumber: "OPTIONAL-REF", referenceNumber: "" };
    const check = checkService.create(checkValues);
    assert.equal(check.ok, true, JSON.stringify(check));
    assert.equal(check.data.referenceNumber, "");
    assert.equal(checkService.update(check.data.id, checkValues).ok, true);
  } finally {
    await server.close();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
