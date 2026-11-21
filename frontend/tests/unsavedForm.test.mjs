import assert from "node:assert/strict";
import test from "node:test";
import { confirmLeavingUnsavedForm, registerUnsavedForm } from "../src/hooks/useUnsavedForm.ts";

test("dirty forms block navigation and unload until discarded or saved", () => {
  const previous = globalThis.window;
  const events = new EventTarget();
  const pushed = [];
  let confirm = false;
  globalThis.window = {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    history: { pushState: (...args) => pushed.push(args) },
    confirm: () => confirm,
  };
  const draft = { dirty: true, url: "http://localhost/users/1/edit", historyState: { page: "users" } };
  const unregister = registerUnsavedForm(draft);
  try {
    assert.equal(confirmLeavingUnsavedForm(), false);
    assert.equal(draft.dirty, true);
    const unload = new Event("beforeunload", { cancelable: true });
    events.dispatchEvent(unload);
    assert.equal(unload.defaultPrevented, true);
    events.dispatchEvent(new Event("popstate"));
    assert.equal(pushed[0][2], draft.url);
    assert.equal(draft.dirty, true);
    confirm = true;
    assert.equal(confirmLeavingUnsavedForm(), true);
    assert.equal(draft.dirty, false);
    const savedUnload = new Event("beforeunload", { cancelable: true });
    events.dispatchEvent(savedUnload);
    assert.equal(savedUnload.defaultPrevented, false);
  } finally {
    unregister();
    globalThis.window = previous;
  }
});

test("saving one form does not clear another unsaved form", () => {
  const previous = globalThis.window;
  const events = new EventTarget();
  globalThis.window = {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    confirm: () => false,
  };
  const first = { dirty: true, url: "/one", historyState: null };
  const second = { dirty: true, url: "/two", historyState: null };
  const removeFirst = registerUnsavedForm(first);
  const removeSecond = registerUnsavedForm(second);
  try {
    first.dirty = false;
    assert.equal(confirmLeavingUnsavedForm(), false);
    assert.equal(second.dirty, true);
  } finally {
    removeFirst();
    removeSecond();
    globalThis.window = previous;
  }
});
