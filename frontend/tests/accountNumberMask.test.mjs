import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("hidden accounts use asterisks and retain only the final four digits", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { maskAccountNumber } = await server.ssrLoadModule("/src/modules/checks/utils.ts");
    const { AccountNumberDisplay } = await server.ssrLoadModule("/src/modules/checks/ui.tsx");
    assert.equal(maskAccountNumber("1234567890"), "******7890");
    assert.equal(maskAccountNumber("00001234567890"), "**********7890");
    assert.equal(maskAccountNumber("1234 567 890"), "******7890");
    assert.equal(maskAccountNumber("12345"), "*2345");
    for (const short of ["", "1", "1234"]) assert.equal(maskAccountNumber(short), "****");
    const render = (canReveal, revealed) => renderToStaticMarkup(createElement(AccountNumberDisplay, {
      accountNumber: "1234567890", canReveal, revealed, onToggle: () => {},
    }));
    const hidden = render(true, false);
    assert.match(hidden.replace(/<[^>]*>/g, ""), /\*{6}7890/);
    assert.match(hidden, /inline-flex items-center whitespace-nowrap/);
    assert.match(hidden, /top-\[0\.18em\]/);
    assert.doesNotMatch(hidden, /1234567890|â€¢/);
    assert.match(hidden, /Reveal account number/);
    assert.match(render(true, true), /1234567890/);
    assert.match(render(true, true), /Hide account number/);
    assert.doesNotMatch(render(false, true), /1234567890|Reveal account number|Hide account number/);
  } finally {
    await server.close();
  }
});
