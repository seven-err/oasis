import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fieldError, focusFirstError, updateVisibleErrors } from "../src/components/formValidation.ts";

test("focuses the first visible invalid field in form order", () => {
  const previous = globalThis.window;
  globalThis.window = { requestAnimationFrame: (callback) => callback() };
  const focused = [];
  const field = (name, visible = true) => ({ name, type: "text", disabled: false, getClientRects: () => visible ? [1] : [], focus: () => focused.push(name) });
  try {
    focusFirstError({ querySelectorAll: () => [field("hidden", false), field("email"), field("name")] }, { name: "Required", email: "Invalid", hidden: "Required" });
    assert.deepEqual(focused, ["email"]);
  } finally {
    globalThis.window = previous;
  }
});

test("visible validation errors update and disappear only when corrected", () => {
  assert.deepEqual(updateVisibleErrors({ email: "Required", date: "Required" }, { email: "Enter a valid email" }), { email: "Enter a valid email", date: undefined });
});

test("required and email fields explain how to correct invalid values", () => {
  const previous = globalThis.HTMLSelectElement;
  globalThis.HTMLSelectElement = class {};
  const field = { willValidate: true, required: true, value: "", type: "email", labels: [{ querySelector: () => ({ textContent: "Email address *" }) }], validity: { valueMissing: true }, validationMessage: "" };
  try {
    assert.equal(fieldError(field), "Enter email address.");
    field.value = "wrong";
    field.validity = { valueMissing: false, typeMismatch: true };
    assert.match(fieldError(field), /name@example.com/);
    field.value = "name@example.com";
    field.validity = { valid: true };
    assert.equal(fieldError(field), "");
  } finally {
    globalThis.HTMLSelectElement = previous;
  }
});

test("monitoring fields associate inline errors with invalid inputs", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    for (const module of ["checks", "payables", "receivables"]) {
      const { FormInput } = await server.ssrLoadModule(`/src/modules/${module}/ui.tsx`);
      const html = renderToStaticMarkup(createElement(FormInput, { label: "Invoice", name: "invoice", required: true, value: "", onChange: () => {}, error: "Enter an invoice." }));
      assert.match(html, /aria-invalid="true"/);
      const id = html.match(/aria-describedby="([^"]+)"/)?.[1];
      assert.ok(id);
      assert.ok(html.includes(`id="${id}"`));
      assert.match(html, /Enter an invoice\./);
    }
  } finally {
    await server.close();
  }
});
