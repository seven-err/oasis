import assert from "node:assert/strict";
import test from "node:test";
import { updateViewHistory } from "../src/hooks/useViewHistory.ts";

const register = { mode: "register" };
const details = { mode: "details", id: 7 };
const edit = { mode: "edit", id: 7 };
const initial = (view = register) => ({ view, entries: [], scrollY: null, revision: 0 });
const open = (state, view, scrollY = 0) => updateViewHistory(state, { type: "open", view, scrollY });
const back = (state, fallback = register) => updateViewHistory(state, { type: "back", fallback });
const save = (state, view = details) => updateViewHistory(state, { type: "replace", view });

test("editing directly from register returns to register and restores scroll", () => {
  const returned = back(open(initial(), edit, 480));
  assert.deepEqual(returned.view, register);
  assert.equal(returned.scrollY, 480);
});

test("editing from details returns there before returning to register", () => {
  const history = open(open(initial(), details, 300), edit, 650);
  const returned = back(history);
  assert.deepEqual(returned.view, details);
  assert.equal(returned.scrollY, 650);
  assert.deepEqual(back(returned).view, register);
});

test("create form opened from details returns to those details", () => {
  assert.deepEqual(back(open(open(initial(), details), { mode: "create" })).view, details);
});

test("saving a new record never reopens its submitted form", () => {
  const saved = save(open(initial(), { mode: "create" }));
  assert.deepEqual(saved.view, details);
  assert.deepEqual(back(saved).view, register);
});

test("saving an edit avoids duplicate details, including focused details", () => {
  const focusedDetails = { ...details, focus: "payments" };
  const saved = save(open(open(initial(), focusedDetails, 280), edit));
  const returned = back(saved);
  assert.deepEqual(returned.view, register);
  assert.equal(returned.scrollY, 280);
});

test("repeat add signals do not add the same form to history", () => {
  const opened = open(initial(), { mode: "create" });
  assert.equal(open(opened, { mode: "create" }), opened);
});

test("notification details without history return safely to register", () => {
  const returned = back(initial(details));
  assert.deepEqual(returned.view, register);
  assert.equal(returned.scrollY, 0);
});

test("employee history supports a null register and clears on reset", () => {
  const history = open(open(initial(null), details, 200), { mode: "create" });
  assert.deepEqual(back(history, null).view, details);
  assert.equal(back(back(history, null), null).view, null);
  const reset = updateViewHistory(history, { type: "reset", view: null });
  assert.equal(reset.view, null);
  assert.deepEqual(reset.entries, []);
});
