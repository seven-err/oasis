import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("checks can be saved in every workflow status without monitoring dates", async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  try {
    const { validateCheckPayload } = await server.ssrLoadModule(
      "/src/modules/checks/validation.ts",
    );
    const { emptyFormValues } = await server.ssrLoadModule("/src/modules/checks/utils.ts");
    const { allowedStatusesForType } = await server.ssrLoadModule(
      "/src/modules/checks/statusTransitions.ts",
    );
    for (const checkType of ["Received Check", "Issued Check"]) {
      for (const checkStatus of allowedStatusesForType(checkType)) {
        const values = emptyFormValues({
          checkNumber: "CHECK-001",
          checkType,
          checkStatus,
          checkDate: "2026-11-21",
          dateReceivedIssued: "2026-11-21",
          payeeName: "OASIS",
          drawerName: "Customer",
          bankName: "Bank",
          branch: "Main",
          accountNumber: "123456789",
          checkAmount: "100",
          purpose: "Payment",
          referenceNumber: "REF-001",
        });
        const result = validateCheckPayload(values, { existing: [] });
        assert.equal(
          result.ok,
          true,
          `${checkType}: ${checkStatus}: ${JSON.stringify(result.errors)}`,
        );
      }
    }
  } finally {
    await server.close();
  }
});
