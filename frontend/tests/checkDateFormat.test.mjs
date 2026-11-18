import assert from "node:assert/strict";
import test from "node:test";
import { formatDate } from "../src/modules/checks/utils.ts";

test("missing monitoring dates display a clean dash", () => {
  for (const value of [null, undefined, ""]) {
    assert.equal(formatDate(value), "\u2014");
  }
});

test("entered deposit and clearing dates keep their readable date format", () => {
  assert.equal(formatDate("2025-03-28"), "Mar 28, 2025");
  assert.equal(formatDate("2026-11-18"), "Nov 18, 2026");
});
