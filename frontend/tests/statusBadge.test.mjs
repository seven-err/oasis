import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("status badges use consistent tones and retain readable labels", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { StatusBadge } = await server.ssrLoadModule("/src/components/StatusBadge.tsx");
    for (const [value, tone, label] of [
      ["Active", "good", "Active"], ["Inactive", "neutral", "Inactive"],
      ["Pending", "partial", "Pending"], ["Paid", "good", "Paid"],
      ["Overdue", "alert", "Overdue"], ["Bounced", "alert", "Returned"],
    ]) {
      const html = renderToStaticMarkup(createElement(StatusBadge, { value }));
      assert.match(html, new RegExp(`status-${tone}`));
      assert.ok(html.includes(`>${label}</span>`));
    }
    for (const module of ["checks", "payables", "receivables"]) {
      const ui = await server.ssrLoadModule(`/src/modules/${module}/ui.tsx`);
      assert.equal(ui.StatusBadge, StatusBadge);
    }
  } finally {
    await server.close();
  }
});

test("status text has at least 4.5:1 contrast against its background", async () => {
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  const luminance = (hex) => {
    const values = hex.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  };
  for (const tone of ["good", "partial", "alert", "neutral"]) {
    const block = css.match(new RegExp(`\\.status-${tone}\\s*\\{([^}]+)\\}`))?.[1];
    assert.ok(block, tone);
    const foreground = block.match(/color:\s*(#[0-9a-f]{6})/i)?.[1];
    const background = block.match(/background:\s*(#[0-9a-f]{6})/i)?.[1];
    assert.ok(foreground && background, tone);
    const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
    assert.ok((values[1] + 0.05) / (values[0] + 0.05) >= 4.5, tone);
  }
});
