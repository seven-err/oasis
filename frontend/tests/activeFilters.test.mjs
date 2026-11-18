import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

function buttons(element) {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(buttons);
  return [ ...(element.type === "button" ? [element] : []), ...buttons(element.props?.children) ];
}

test("active filter chips show readable values and remove only the selected filter", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { ActiveFilters } = await server.ssrLoadModule("/src/components/ActiveFilters.tsx");
    const defaults = { search: "", checkStatus: "All", categoryId: "All", invoiceDateFrom: "", includeArchived: false };
    let filters = { search: "Invoice", checkStatus: "Pending", categoryId: 7, invoiceDateFrom: "2026-11-18", includeArchived: true };
    let clearCalls = 0;
    const props = () => ({
      filters, defaults, matched: 0, total: 10,
      valueLabels: { categoryId: { 7: "Utilities" } },
      onRemove: (key) => { filters = { ...filters, [key]: defaults[key] }; },
      onClear: () => { filters = { ...defaults }; clearCalls++; },
    });
    const markup = renderToStaticMarkup(createElement(ActiveFilters, props()));
    for (const text of ["Status: Pending", "Category: Utilities", "Invoice date from: Nov 18, 2026", "Include archived: Yes", "Clear all"]) {
      assert.ok(markup.includes(text), text);
    }
    const initial = { ...filters };
    for (const [key, accessibleName] of [
      ["search", "Remove filter Search: Invoice"], ["checkStatus", "Remove filter Status: Pending"],
      ["categoryId", "Remove filter Category: Utilities"], ["invoiceDateFrom", "Remove filter Invoice date from: Nov 18, 2026"],
      ["includeArchived", "Remove filter Include archived: Yes"],
    ]) {
      filters = { ...initial };
      buttons(ActiveFilters(props())).find((button) => button.props["aria-label"] === accessibleName).props.onClick();
      assert.deepEqual(filters, { ...initial, [key]: defaults[key] });
    }
    buttons(ActiveFilters(props())).find((button) => button.props.children === "Clear all").props.onClick();
    assert.equal(clearCalls, 1);
    assert.deepEqual(filters, defaults);
    const cleared = renderToStaticMarkup(createElement(ActiveFilters, { ...props(), matched: 10 }));
    assert.equal(cleared, "");
  } finally {
    await server.close();
  }
});
