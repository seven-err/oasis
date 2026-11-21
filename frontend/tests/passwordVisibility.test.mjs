import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("password fields start masked and preserve form and accessibility attributes", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { PasswordInput } = await server.ssrLoadModule("/src/components/PasswordInput.tsx");
    const html = renderToStaticMarkup(createElement(PasswordInput, {
      id: "new-password", name: "password", required: true,
      autoComplete: "new-password", minLength: 12, maxLength: 1024,
    }));
    for (const attribute of ['type="password"', 'name="password"', 'autoComplete="new-password"',
      'required=""', 'minLength="12"', 'maxLength="1024"', 'type="button"',
      'aria-label="Show password"', 'aria-pressed="false"', 'aria-controls="new-password"']) {
      assert.ok(html.includes(attribute), attribute);
    }
    assert.match(html, /<svg[^>]*aria-hidden="true"/);
  } finally {
    await server.close();
  }
});

test("Blade eye toggles reveal and mask the password without changing its value", async () => {
  let click;
  const input = { id: "password", type: "password", value: "unchanged-password" };
  const attributes = {};
  const slash = { setAttribute: (name, value) => { attributes[name] = value; } };
  const toggle = {
    dataset: { passwordToggle: "password" },
    querySelector: (selector) => selector === "[data-password-slash]" ? slash : {},
    setAttribute: (name, value) => { attributes[name] = value; },
  };
  const document = {
    addEventListener: (name, handler) => { if (name === "click") click = handler; },
    getElementById: (id) => { assert.equal(id, "password"); return input; },
    querySelector: () => ({ textContent: "Password" }),
  };
  runInNewContext(await readFile(new URL("../../backend/resources/js/app.js", import.meta.url), "utf8"), { document });
  const event = { target: { closest: (selector) => selector === "[data-password-toggle]" ? toggle : null } };
  click(event);
  assert.equal(input.type, "text");
  assert.equal(attributes.visibility, "visible");
  assert.equal(attributes["aria-label"], "Hide password");
  assert.equal(attributes["aria-pressed"], "true");
  click(event);
  assert.equal(input.type, "password");
  assert.equal(attributes.visibility, "hidden");
  assert.equal(attributes["aria-label"], "Show password");
  assert.equal(attributes["aria-pressed"], "false");
  assert.equal(input.value, "unchanged-password");
});
