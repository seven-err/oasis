import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("password fields start hidden and provide an accessible visibility button", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { PasswordField } = await server.ssrLoadModule("/src/components/PasswordField.tsx");
    const markup = renderToStaticMarkup(createElement(PasswordField, {
      label: "New password", name: "password", autoComplete: "new-password",
      minLength: 12, maxLength: 1024, required: true,
    }));
    assert.match(markup, /type="password"/);
    assert.match(markup, /name="password"/);
    assert.match(markup, /autoComplete="new-password"/);
    assert.match(markup, /minLength="12"/);
    assert.match(markup, /maxLength="1024"/);
    assert.match(markup, /required=""/);
    assert.match(markup, /<button type="button"/);
    assert.match(markup, /aria-label="Show new password"/);
    assert.match(markup, /aria-pressed="false"/);
    const inputId = markup.match(/<input[^>]* id="([^"]+)"/)[1];
    assert.ok(markup.includes(`for="${inputId}"`));
    assert.ok(markup.includes(`aria-controls="${inputId}"`));
  } finally {
    await server.close();
  }
});
