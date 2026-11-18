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
