import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("receivables save without a transaction date and preserve existing dates on edit", async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  try {
    const { validateReceivablePayload } = await server.ssrLoadModule("/src/modules/receivables/validation.ts");
    const { recordToFormValues } = await server.ssrLoadModule("/src/modules/receivables/utils.ts");
    const { seedCustomers, seedReceivables } = await server.ssrLoadModule("/src/modules/receivables/seed.ts");
    const record = seedReceivables[0];
    const values = recordToFormValues(record);
    assert.equal(values.transactionDate, record.transactionDate);
    values.transactionDate = "";
    const options = { existing: [], customers: seedCustomers };
    assert.deepEqual(validateReceivablePayload(values, options), { ok: true, errors: {} });
    assert.equal(validateReceivablePayload(values, {
      ...options, existing: [record], editingId: record.id,
    }).ok, true);
    values.transactionDate = "invalid";
    assert.ok(validateReceivablePayload(values, options).errors.transactionDate);
    values.transactionDate = "";
    values.dueDate = "";
    assert.ok(validateReceivablePayload(values, options).errors.dueDate);
  } finally {
    await server.close();
  }
});
