export const DELETED_RECORD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function deletionDaysLeft(deletedAt: string | null | undefined, now = Date.now()): number | null {
  if (!deletedAt) return null;
  const deletedTime = Date.parse(deletedAt);
  if (!Number.isFinite(deletedTime)) return null;
  return Math.max(0, Math.min(30, Math.ceil((deletedTime + DELETED_RECORD_RETENTION_MS - now) / (24 * 60 * 60 * 1000))));
}

export function isDeletionExpired(deletedAt: string | null | undefined, now = Date.now()): boolean {
  if (!deletedAt) return false;
  const deletedTime = Date.parse(deletedAt);
  return Number.isFinite(deletedTime) && now - deletedTime >= DELETED_RECORD_RETENTION_MS;
}

type SoftDeletable = {
  id: number;
  archivedAt?: string | null;
  deletedAt?: string | null;
  updatedAt: string;
};

type LifecycleResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

export function deletedRecordMethods<T extends SoftDeletable>(options: {
  loadRecords: () => T[];
  writeRecords: (records: T[]) => void;
  canManage: () => boolean;
}) {
  const { loadRecords, writeRecords, canManage } = options;
  return {
    purgeExpiredDeleted(now = Date.now()): number {
      if (!canManage()) return 0;
      const records = loadRecords();
      const retained = records.filter((record) => !isDeletionExpired(record.deletedAt, now));
      const removed = records.length - retained.length;
      if (removed) writeRecords(retained);
      return removed;
    },

    listDeleted(): T[] {
      return loadRecords().filter((record) => !!record.deletedAt);
    },

    restoreDeleted(id: number): LifecycleResult<T> {
      if (!canManage()) {
        return { ok: false, errors: { form: "You are not authorized to restore deleted records." } };
      }
      const records = loadRecords();
      const existing = records.find((record) => record.id === id && record.deletedAt);
      if (!existing) return { ok: false, errors: { form: "Deleted record not found." } };
      const record = { ...existing, deletedAt: null, updatedAt: new Date().toISOString() };
      writeRecords(records.map((item) => (item.id === id ? record : item)));
      return { ok: true, data: record };
    },

    deletePermanently(id: number): LifecycleResult<T> {
      if (!canManage()) {
        return { ok: false, errors: { form: "You are not authorized to permanently delete records." } };
      }
      const records = loadRecords();
      const record = records.find((item) => item.id === id && item.deletedAt);
      if (!record) return { ok: false, errors: { form: "Deleted record not found." } };
      writeRecords(records.filter((item) => item.id !== id));
      return { ok: true, data: record };
    },

    deleteArchived(id: number): LifecycleResult<T> {
      if (!canManage()) {
        return { ok: false, errors: { form: "You are not authorized to delete archived records." } };
      }
      const records = loadRecords();
      const existing = records.find((record) => record.id === id);
      if (!existing?.archivedAt || existing.deletedAt) {
        return { ok: false, errors: { form: "Archived record not found." } };
      }
      const stamp = new Date().toISOString();
      const record = { ...existing, deletedAt: stamp, updatedAt: stamp };
      writeRecords(records.map((item) => (item.id === id ? record : item)));
      return { ok: true, data: record };
    },
  };
}
