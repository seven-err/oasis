import type { MouseEvent } from "react";

/** Row navigation must not intercept its action buttons, menus, or text selection. */
export function recordRowClick(open: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("button, a, input, select, textarea, dialog, [role='menu']")) return;
    if (window.getSelection()?.toString()) return;
    open();
  };
}
