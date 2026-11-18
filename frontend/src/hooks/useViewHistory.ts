import { useCallback, useLayoutEffect, useState } from "react";

type Destination = { mode: string; id?: number } | null;
type Entry<T> = { view: T; scrollY: number };
export type ViewHistory<T> = {
  view: T;
  entries: Entry<T>[];
  scrollY: number | null;
  revision: number;
};

type Action<T> =
  | { type: "open"; view: T; scrollY: number }
  | { type: "replace" | "reset"; view: T }
  | { type: "back"; fallback: T };

const sameDestination = (a: Destination, b: Destination) =>
  a?.mode === b?.mode && a?.id === b?.id;

export function updateViewHistory<T extends Destination>(state: ViewHistory<T>, action: Action<T>): ViewHistory<T> {
  if (action.type === "open") {
    if (sameDestination(state.view, action.view)) return state;
    return {
      view: action.view,
      entries: [...state.entries, { view: state.view, scrollY: action.scrollY }],
      scrollY: 0,
      revision: state.revision + 1,
    };
  }
  if (action.type === "back") {
    const previous = state.entries[state.entries.length - 1];
    return {
      view: previous ? previous.view : action.fallback,
      entries: state.entries.slice(0, -1),
      scrollY: previous?.scrollY ?? 0,
      revision: state.revision + 1,
    };
  }
  // Saving replaces the form, so Back never reopens a submitted form or
  // an identical details screen already at the top of the history.
  const entries = action.type === "reset" ? [] : [...state.entries];
  while (entries.length && sameDestination(entries[entries.length - 1].view, action.view)) entries.pop();
  return { view: action.view, entries, scrollY: 0, revision: state.revision + 1 };
}

export function useViewHistory<T extends Destination>(initialView: () => T, fallback: T) {
  const [state, setState] = useState<ViewHistory<T>>(() => ({
    view: initialView(), entries: [], scrollY: null, revision: 0,
  }));
  const open = useCallback((view: T) => {
    const scrollY = window.scrollY;
    setState((current) => updateViewHistory(current, { type: "open", view, scrollY }));
  }, []);
  const back = () => setState((current) => updateViewHistory(current, { type: "back", fallback }));
  const replace = (view: T) => setState((current) => updateViewHistory(current, { type: "replace", view }));
  const reset = (view: T) => setState((current) => updateViewHistory(current, { type: "reset", view }));

  useLayoutEffect(() => {
    if (state.scrollY !== null) window.scrollTo({ top: state.scrollY, behavior: "instant" });
  }, [state.revision]);

  return { view: state.view, open, back, replace, reset };
}
