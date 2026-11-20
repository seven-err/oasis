import { apiRequest, getSession } from "./auth";
import keys from "./businessKeys.json";

type Module = keyof typeof keys;
type Data = Record<string, unknown>;
type State = { version: number; data: Data | null };
type LocalState = { version: number; data: Data; generation: number; dirty: boolean };
const modules = new Map<Module, LocalState>();
const listeners = new Set<() => void>();
let initialized = false;
let saving = false;
let polling = false;
let error = "";
let conflict = false;
let status = "";
const moduleFor = (key: string) =>
  (Object.keys(keys) as Module[]).find((module) => (keys[module] as string[]).includes(key));
const empty = (key: string): unknown =>
  key === "oasis.employees.v2" ? { employees: [], deletedEmployees: [] } : [];
const draftKey = (module: Module) => `oasis.unsaved.${getSession()?.user.id}.${module}`;
const changed = () => {
  status =
    error ||
    (saving || [...modules.values()].some((state) => state.dirty)
      ? "Saving changes…"
      : "All changes saved");
  listeners.forEach((listener) => listener());
};

export const subscribeBusinessSync = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const businessSyncStatus = () => status;
export const businessSyncError = () => error;
export const hasBusinessConflict = () => conflict;
export const businessStorageReady = () => initialized;

export function readBusinessJson<T>(key: string, fallback: T): T {
  if (initialized) {
    const module = moduleFor(key);
    return structuredClone((module && modules.get(module)?.data[key]) ?? empty(key)) as T;
  }
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeBusinessJson(key: string, value: unknown): void {
  if (!initialized) {
    localStorage.setItem(key, JSON.stringify(value));
    return;
  }
  if (error) throw new Error(error);
  const module = moduleFor(key);
  const state = module && modules.get(module);
  if (!module || !state) throw new Error("You do not have access to save these records.");
  if (JSON.stringify(state.data[key]) === JSON.stringify(value)) return;
  state.data[key] = structuredClone(value);
  state.generation++;
  state.dirty = true;
  backup(module, state);
  changed();
  queueMicrotask(() => void flushBusinessChanges());
}

function backup(module: Module, state: LocalState) {
  try {
    localStorage.setItem(
      draftKey(module),
      JSON.stringify({ version: state.version, data: state.data }),
    );
  } catch {
    // The in-memory draft and download remain available if browser storage is full.
  }
}

export async function flushBusinessChanges(): Promise<void> {
  if (saving || error) return;
  saving = true;
  changed();
  try {
    for (const [module, state] of modules) {
      while (state.dirty) {
        const generation = state.generation;
        const payload = { version: state.version, data: structuredClone(state.data) };
        const result = await apiRequest<{ version: number }>(`/business-state/${module}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        state.version = result.version;
        if (generation === state.generation) {
          state.dirty = false;
          localStorage.removeItem(draftKey(module));
        } else backup(module, state);
      }
    }
  } catch (failure) {
    error =
      failure instanceof Error
        ? failure.message
        : "Changes could not be saved. Keep this page open and retry.";
    conflict = /Someone else updated|unsaved copy/.test(error);
  } finally {
    saving = false;
    changed();
    if (!error && [...modules.values()].some((state) => state.dirty)) {
      queueMicrotask(() => void flushBusinessChanges());
    }
  }
}

export async function retryBusinessSave() {
  if (conflict) return;
  error = "";
  await flushBusinessChanges();
}

export async function waitForBusinessSave() {
  await flushBusinessChanges();
  while (saving) await new Promise<void>((resolve) => setTimeout(resolve, 50));
  if (error) throw new Error(error);
}

export function downloadBusinessDraft() {
  const data = Object.fromEntries(
    [...modules].filter(([, state]) => state.dirty).map(([module, state]) => [module, state]),
  );
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "oasis-unsaved-records.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function discardBusinessDraft() {
  for (const module of modules.keys()) localStorage.removeItem(draftKey(module));
  for (const state of modules.values()) state.dirty = false;
  window.location.reload();
}

export async function refreshBusinessStorage(): Promise<void> {
  if (
    polling ||
    saving ||
    error ||
    [...modules.values()].some((state) => state.dirty) ||
    document.querySelector("form")
  )
    return;
  polling = true;
  try {
    const query = new URLSearchParams(
      [...modules].map(([module, state]) => [`versions[${module}]`, String(state.version)]),
    );
    const result = await apiRequest<{ modules: Partial<Record<Module, State>> }>(
      `/business-state?${query}`,
    );
    if (
      saving ||
      [...modules.values()].some((state) => state.dirty) ||
      document.querySelector("form")
    )
      return;
    for (const [module, remote] of Object.entries(result.modules) as [Module, State][]) {
      const state = modules.get(module);
      if (state && remote.data && remote.version > state.version) {
        state.data = remote.data;
        state.version = remote.version;
        window.dispatchEvent(new CustomEvent("oasis:business-updated", { detail: module }));
      }
    }
  } catch {
    // Local edits still use version checks; a later refresh or save reports connection failures.
  } finally {
    polling = false;
  }
}

export async function initializeBusinessStorage(): Promise<void> {
  const signal = AbortSignal.timeout(8_000);
  const result = await apiRequest<{ modules: Partial<Record<Module, State>> }>("/business-state", { signal }).catch((failure) => {
    if (signal.aborted) throw new Error("OASIS took too long to load your records. Check the server connection and try again.");
    throw failure;
  });
  for (const [module, remote] of Object.entries(result.modules) as [Module, State][]) {
    let data = remote.data;
    if (!data) {
      const hasLegacyRecords = keys[module].some((key) => {
        try {
          return localStorage.getItem(key) !== null;
        } catch {
          return false;
        }
      });
      data = {};
      for (const key of keys[module]) data[key] = readBusinessJson(key, empty(key));
      if (module === "checks" || module === "receivables") {
        const attachmentKey = keys[module].find((key) => key.includes("attachments"))!;
        for (const attachment of data[attachmentKey] as {
          fileName: string;
          previewDataUrl?: string;
          storageKey: string;
        }[]) {
          if (attachment.previewDataUrl?.startsWith("data:")) {
            const blob = await fetch(attachment.previewDataUrl).then((response) => response.blob());
            Object.assign(
              attachment,
              await uploadBusinessFile(
                module,
                new File([blob], attachment.fileName, { type: blob.type }),
              ),
            );
          }
        }
      }
      if (module === "payables" && !localStorage.getItem("oasis.payable-categories.v1")) {
        const { seedCategories } = await import("./modules/payables/seed");
        data["oasis.payable-categories.v1"] = seedCategories;
      }
      try {
        if (hasLegacyRecords) {
          const saved = await apiRequest<{ version: number }>(`/business-state/${module}`, {
            method: "PUT",
            body: JSON.stringify({ version: 0, data }),
          });
          remote.version = saved.version;
        }
      } catch (failure) {
        if (!(failure instanceof Error) || !failure.message.includes("Someone else updated"))
          throw failure;
        const latest = await apiRequest<{ modules: Record<Module, State> }>("/business-state");
        data = latest.modules[module].data!;
        remote.version = latest.modules[module].version;
      }
    }
    const state: LocalState = { version: remote.version, data, generation: 0, dirty: false };
    try {
      const pending = JSON.parse(localStorage.getItem(draftKey(module)) ?? "null") as State | null;
      if (pending?.data && JSON.stringify(pending.data) !== JSON.stringify(data)) {
        state.data = pending.data;
        state.version = pending.version;
        state.dirty = true;
        error =
          "This browser has unsaved records. Download your copy before reloading, or retry saving.";
        conflict ||= pending.version !== remote.version;
      } else localStorage.removeItem(draftKey(module));
    } catch {
      /* Preserve an unreadable backup rather than replacing it. */
    }
    modules.set(module, state);
  }
  initialized = true;
  changed();
  window.addEventListener("beforeunload", (event) => {
    if (saving || [...modules.values()].some((state) => state.dirty)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("focus", () => void refreshBusinessStorage());
  window.setInterval(() => {
    if (document.visibilityState === "visible") void refreshBusinessStorage();
  }, 30_000);
}

export async function uploadBusinessFile(
  module: "checks" | "receivables",
  file: File,
): Promise<{ storageKey: string; previewDataUrl: string }> {
  const body = new FormData();
  body.set("file", file);
  return apiRequest(`/business-files/${module}`, { method: "POST", body });
}
