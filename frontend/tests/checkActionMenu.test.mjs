import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../src/modules/checks/CheckRegister.tsx", import.meta.url), "utf8");
const effect = source.match(/useLayoutEffect\(\(\) => \{([\s\S]*?)\n  \}, \[menu, menuRowId\]\);/)[1];

test("check menu stays within the viewport and follows its trigger", () => {
  let rect = { top: 100, bottom: 130, right: 390, height: 30 };
  const listeners = new Map();
  const dialog = {
    style: {}, scrollHeight: 200, open: false,
    showPopover() { this.open = true; },
    hidePopover() { this.open = false; },
  };
  let closed = false;
  const cleanup = runInNewContext(`(() => {${effect}})()`, {
    menuRef: { current: dialog }, menuRowId: 1,
    menu: { trigger: { getBoundingClientRect: () => rect, focus() {} } },
    setMenu: () => { closed = true; },
    document: { documentElement: { clientWidth: 400 } },
    window: {
      innerHeight: 600,
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name) => listeners.delete(name),
    },
  });
  assert.equal(dialog.open, true);
  assert.equal(dialog.style.top, "138px");
  assert.equal(dialog.style.right, "10px");
  rect = { top: 540, bottom: 570, right: 390, height: 30 };
  listeners.get("scroll")();
  assert.equal(dialog.style.top, "auto");
  assert.equal(dialog.style.bottom, "68px");
  assert.equal(dialog.style.maxHeight, "524px");
  dialog.scrollHeight = 800;
  rect = { top: 300, bottom: 330, right: 399, height: 30 };
  listeners.get("resize")();
  assert.equal(dialog.style.maxHeight, "284px", "tall menus scroll within available space");
  assert.equal(dialog.style.right, "8px");
  rect.height = 0;
  listeners.get("resize")();
  assert.equal(closed, true, "close when the responsive layout hides the trigger");
  cleanup();
  assert.equal(dialog.open, false);
  assert.equal(listeners.size, 0);
});
