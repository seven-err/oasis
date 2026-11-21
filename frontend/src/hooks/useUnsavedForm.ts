import { useEffect, useRef } from "react";

type Draft = { dirty: boolean; url: string; historyState: unknown };
const drafts = new Set<Draft>();
const message = "You have unsaved changes. Leave without saving?";

export function confirmLeavingUnsavedForm(): boolean {
  if (![...drafts].some((draft) => draft.dirty)) return true;
  if (!window.confirm(message)) return false;
  for (const draft of drafts) draft.dirty = false;
  return true;
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (![...drafts].some((draft) => draft.dirty)) return;
  event.preventDefault();
  event.returnValue = "";
}

function onPopState(event: PopStateEvent) {
  const draft = [...drafts].find((item) => item.dirty);
  if (!draft || confirmLeavingUnsavedForm()) return;
  event.stopImmediatePropagation();
  window.history.pushState(draft.historyState, "", draft.url);
}

export function registerUnsavedForm(current: Draft) {
  drafts.add(current);
  if (drafts.size === 1) {
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", onPopState, true);
  }
  return () => {
    current.dirty = false;
    drafts.delete(current);
    if (!drafts.size) {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", onPopState, true);
    }
  };
}

export function useUnsavedForm(active = true) {
  const draft = useRef<Draft>({ dirty: false, url: "", historyState: null });
  useEffect(() => {
    if (active) return registerUnsavedForm(draft.current);
  }, [active]);

  return {
    markDirty: () => {
      if (!draft.current.dirty) {
        draft.current.url = window.location.href;
        draft.current.historyState = window.history.state;
      }
      draft.current.dirty = true;
    },
    markSaved: () => { draft.current.dirty = false; },
    confirmDiscard: () => {
      if (draft.current.dirty && !window.confirm(message)) return false;
      draft.current.dirty = false;
      return true;
    },
  };
}
