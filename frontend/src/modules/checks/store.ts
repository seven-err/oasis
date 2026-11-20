import { normalizeAttachmentFile } from "@/components/attachmentFileTypes";
import { businessStorageReady, readBusinessJson, writeBusinessJson, uploadBusinessFile } from "@/businessStorage";
import { isDeletionExpired } from "@/components/deletedRecordRetention";
import {
  CHECK_ACTIVITY_STORAGE_KEY,
  CHECK_ATTACHMENTS_STORAGE_KEY,
  CHECKS_STORAGE_KEY,
  CURRENT_USER,
} from "./constants";
import { seedActivity, seedAttachments, seedChecks } from "./seed";
import type {
  CheckActivity,
  CheckAttachment,
  CheckFormValues,
  CheckRecord,
  CheckStatus,
  CheckType,
  OasisUser,
  ValidationResult,
} from "./types";
import { nowIso, uid } from "./utils";
import { validateAttachmentFile, validateCheckPayload } from "./validation";

type StoreSnapshot = {
  checks: CheckRecord[];
  attachments: CheckAttachment[];
  activity: CheckActivity[];
};

function readJson<T>(key: string, fallback: T): T {
  return readBusinessJson(key, fallback);
}

function writeJson(key: string, value: unknown): void {
  writeBusinessJson(key, value);
}

function load(): StoreSnapshot {
  const checks = readJson<CheckRecord[] | null>(CHECKS_STORAGE_KEY, null);
  if (!checks) {
    writeJson(CHECKS_STORAGE_KEY, seedChecks);
    writeJson(CHECK_ATTACHMENTS_STORAGE_KEY, seedAttachments);
    writeJson(CHECK_ACTIVITY_STORAGE_KEY, seedActivity);
    return {
      checks: seedChecks,
      attachments: seedAttachments,
      activity: seedActivity,
    };
  }
  return {
    checks,
    attachments: readJson(CHECK_ATTACHMENTS_STORAGE_KEY, seedAttachments),
    activity: readJson(CHECK_ACTIVITY_STORAGE_KEY, seedActivity),
  };
}

function persist(snapshot: StoreSnapshot): void {
  // Strip large preview data URLs from durable storage
  const attachments = snapshot.attachments.map(({ previewDataUrl, ...rest }) => ({ ...rest, ...(previewDataUrl?.startsWith('/business-files/') ? { previewDataUrl } : {}) }));
  writeJson(CHECKS_STORAGE_KEY, snapshot.checks);
  writeJson(CHECK_ATTACHMENTS_STORAGE_KEY, attachments);
  writeJson(CHECK_ACTIVITY_STORAGE_KEY, snapshot.activity);
}

function logActivity(
  snapshot: StoreSnapshot,
  entry: Omit<CheckActivity, "id" | "performedAt"> & { performedAt?: string },
): void {
  snapshot.activity = [
    {
      id: uid("act"),
      performedAt: entry.performedAt ?? nowIso(),
      ...entry,
    },
    ...snapshot.activity,
  ];
}

function toRecord(
  values: CheckFormValues,
  user: OasisUser,
  existing?: CheckRecord,
): CheckRecord {
  const stamp = nowIso();
  return {
    id: existing?.id ?? Date.now(),
    checkNumber: values.checkNumber.trim(),
    checkType: values.checkType as CheckType,
    checkDate: values.checkDate,
    dateReceivedIssued: values.dateReceivedIssued,
    payeeName: values.payeeName.trim(),
    drawerName: values.drawerName.trim(),
    bankName: values.bankName.trim(),
    branch: values.branch.trim(),
    accountNumber: values.accountNumber.replace(/\s+/g, ""),
    checkAmount: Number(values.checkAmount),
    purpose: values.purpose.trim(),
    referenceNumber: values.referenceNumber.trim(),
    dueDate: values.dueDate || null,
    depositDate: values.depositDate || null,
    clearingDate: values.clearingDate || null,
    checkStatus: values.checkStatus as CheckStatus,
    remarks: values.remarks.trim() || null,
    preparedById: existing?.preparedById ?? user.id,
    preparedByName: existing?.preparedByName ?? user.name,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
    archivedAt: existing?.archivedAt ?? null,
    createdById: existing?.createdById ?? user.id,
    updatedById: user.id,
  };
}

export type CheckServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: ValidationResult["errors"] };

export const checkService = {
  getUser(): OasisUser {
    return CURRENT_USER;
  },

  list(): CheckRecord[] {
    return load().checks.filter((record) => !record.deletedAt);
  },

  get(id: number): CheckRecord | undefined {
    return load().checks.find((c) => c.id === id && !c.deletedAt);
  },

  attachmentsFor(checkId: number): CheckAttachment[] {
    return load().attachments.filter((a) => a.checkId === checkId && !a.deletedAt);
  },

  activityFor(checkId: number): CheckActivity[] {
    return load()
      .activity.filter((a) => a.checkId === checkId)
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  },

  allActivity(): CheckActivity[] {
    return load().activity.sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  },

  create(values: CheckFormValues): CheckServiceResult<CheckRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    const validation = validateCheckPayload(values, { existing: snapshot.checks });
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const record = toRecord(values, user);
    snapshot.checks = [record, ...snapshot.checks];
    logActivity(snapshot, {
      checkId: record.id,
      action: "created",
      summary: "Check record created",
      newStatus: record.checkStatus,
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  update(id: number, values: CheckFormValues): CheckServiceResult<CheckRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    const existing = snapshot.checks.find((c) => c.id === id && !c.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Check record not found." } };

    const validation = validateCheckPayload(values, {
      existing: snapshot.checks,
      editingId: id,
      previousStatus: existing.checkStatus,
    });
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const record = toRecord(values, user, existing);
    snapshot.checks = snapshot.checks.map((c) => (c.id === id ? record : c));

    if (existing.checkStatus !== record.checkStatus) {
      logActivity(snapshot, {
        checkId: id,
        action: "status_changed",
        summary: `Status changed from ${existing.checkStatus} to ${record.checkStatus}`,
        previousStatus: existing.checkStatus,
        newStatus: record.checkStatus,
        performedById: user.id,
        performedByName: user.name,
      });
    } else {
      logActivity(snapshot, {
        checkId: id,
        action: "updated",
        summary: "Check record updated",
        performedById: user.id,
        performedByName: user.name,
        metadata: { checkNumber: record.checkNumber },
      });
    }

    persist(snapshot);
    return { ok: true, data: record };
  },

  archive(id: number): CheckServiceResult<CheckRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.archiveChecks) {
      return { ok: false, errors: { form: "You are not authorized to archive checks." } };
    }
    const existing = snapshot.checks.find((c) => c.id === id && !c.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Check record not found." } };

    const record: CheckRecord = {
      ...existing,
      archivedAt: nowIso(),
      updatedAt: nowIso(),
      updatedById: user.id,
    };
    snapshot.checks = snapshot.checks.map((c) => (c.id === id ? record : c));
    logActivity(snapshot, {
      checkId: id,
      action: "archived",
      summary: "Check record archived",
      previousStatus: existing.checkStatus,
      newStatus: existing.checkStatus,
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  deleteRecord(id: number): CheckServiceResult<CheckRecord> {
    const user = CURRENT_USER;
    if (!user.permissions.archiveChecks) {
      return { ok: false, errors: { form: "You are not authorized to delete checks." } };
    }
    const snapshot = load();
    const existing = snapshot.checks.find((record) => record.id === id && !record.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Check record not found." } };
    const stamp = nowIso();
    const record = { ...existing, deletedAt: stamp, updatedAt: stamp, updatedById: user.id };
    snapshot.checks = snapshot.checks.map((item) => item.id === id ? record : item);
    logActivity(snapshot, {
      checkId: id,
      action: "deleted",
      summary: "Check moved to Deleted Records",
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  purgeExpiredDeleted(now = Date.now()): number {
    if (!CURRENT_USER.permissions.archiveChecks) return 0;
    const snapshot = load();
    const retained = snapshot.checks.filter((record) => !isDeletionExpired(record.deletedAt, now));
    const removed = snapshot.checks.length - retained.length;
    if (removed) writeJson(CHECKS_STORAGE_KEY, retained);
    return removed;
  },

  listDeleted(): CheckRecord[] {
    return load().checks.filter((record) => !!record.deletedAt);
  },

  restoreDeleted(id: number): CheckServiceResult<CheckRecord> {
    if (!CURRENT_USER.permissions.archiveChecks) {
      return { ok: false, errors: { form: "You are not authorized to restore deleted records." } };
    }
    const snapshot = load();
    const existing = snapshot.checks.find((record) => record.id === id && record.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Deleted record not found." } };
    const record = { ...existing, deletedAt: null, updatedAt: nowIso() };
    writeJson(CHECKS_STORAGE_KEY, snapshot.checks.map((item) => item.id === id ? record : item));
    return { ok: true, data: record };
  },

  deletePermanently(id: number): CheckServiceResult<CheckRecord> {
    if (!CURRENT_USER.permissions.archiveChecks) {
      return { ok: false, errors: { form: "You are not authorized to permanently delete records." } };
    }
    const snapshot = load();
    const record = snapshot.checks.find((item) => item.id === id && item.deletedAt);
    if (!record) return { ok: false, errors: { form: "Deleted record not found." } };
    writeJson(CHECKS_STORAGE_KEY, snapshot.checks.filter((item) => item.id !== id));
    return { ok: true, data: record };
  },

  deleteArchived(id: number): CheckServiceResult<CheckRecord> {
    if (!CURRENT_USER.permissions.archiveChecks) {
      return { ok: false, errors: { form: "You are not authorized to delete archived records." } };
    }
    const snapshot = load();
    const existing = snapshot.checks.find((record) => record.id === id);
    if (!existing?.archivedAt || existing.deletedAt) {
      return { ok: false, errors: { form: "Archived record not found." } };
    }
    const record = { ...existing, deletedAt: nowIso(), updatedAt: nowIso() };
    writeJson(CHECKS_STORAGE_KEY, snapshot.checks.map((item) => item.id === id ? record : item));
    return { ok: true, data: record };
  },

  restore(id: number): CheckServiceResult<CheckRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.archiveChecks) {
      return { ok: false, errors: { form: "You are not authorized to restore checks." } };
    }
    const existing = snapshot.checks.find((c) => c.id === id && !c.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Check record not found." } };

    const record: CheckRecord = {
      ...existing,
      archivedAt: null,
      updatedAt: nowIso(),
      updatedById: user.id,
    };
    snapshot.checks = snapshot.checks.map((c) => (c.id === id ? record : c));
    logActivity(snapshot, {
      checkId: id,
      action: "restored",
      summary: "Check record restored",
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  async addAttachment(
    checkId: number,
    file: File,
    kind: CheckAttachment["kind"] = "supporting",
  ): Promise<CheckServiceResult<CheckAttachment>> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.manageAttachments) {
      return { ok: false, errors: { attachments: "You are not authorized to manage attachments." } };
    }
    if (!snapshot.checks.some((c) => c.id === checkId)) {
      return { ok: false, errors: { attachments: "Check record not found." } };
    }
    const fileError = validateAttachmentFile(file);
    if (fileError) return { ok: false, errors: { attachments: fileError } };

    file = normalizeAttachmentFile(file);
    const uploaded = businessStorageReady() ? await uploadBusinessFile('checks', file) : null;
    const previewDataUrl = uploaded?.previewDataUrl ?? await readFileAsDataUrl(file);
    const attachment: CheckAttachment = {
      id: uid("att"),
      checkId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      kind,
      storageKey: uploaded?.storageKey ?? `private/checks/${checkId}/${uid("file")}_${file.name}`,
      previewDataUrl,
      uploadedById: user.id,
      uploadedByName: user.name,
      uploadedAt: nowIso(),
      deletedAt: null,
    };

    snapshot.attachments = [attachment, ...snapshot.attachments];
    logActivity(snapshot, {
      checkId,
      action: "attachment_uploaded",
      summary: `Attachment uploaded: ${file.name}`,
      performedById: user.id,
      performedByName: user.name,
      metadata: { fileName: file.name, kind },
    });
    persist(snapshot);
    return { ok: true, data: attachment };
  },

  removeAttachment(attachmentId: string): CheckServiceResult<true> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.manageAttachments) {
      return { ok: false, errors: { attachments: "You are not authorized to manage attachments." } };
    }
    const existing = snapshot.attachments.find((a) => a.id === attachmentId);
    if (!existing) return { ok: false, errors: { attachments: "Attachment not found." } };

    snapshot.attachments = snapshot.attachments.map((a) =>
      a.id === attachmentId ? { ...a, deletedAt: nowIso(), previewDataUrl: undefined } : a,
    );
    logActivity(snapshot, {
      checkId: existing.checkId,
      action: "attachment_deleted",
      summary: `Attachment removed: ${existing.fileName}`,
      performedById: user.id,
      performedByName: user.name,
      metadata: { fileName: existing.fileName },
    });
    persist(snapshot);
    return { ok: true, data: true };
  },

  logAccountReveal(checkId: number): void {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.viewAccountNumber) return;
    logActivity(snapshot, {
      checkId,
      action: "account_revealed",
      summary: "Full account number revealed by authorized user",
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
  },

  resetDemoData(): void {
    writeJson(CHECKS_STORAGE_KEY, seedChecks);
    writeJson(CHECK_ATTACHMENTS_STORAGE_KEY, seedAttachments);
    writeJson(CHECK_ACTIVITY_STORAGE_KEY, seedActivity);
  },
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
