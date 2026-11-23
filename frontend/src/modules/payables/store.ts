import { checkService } from "@/modules/checks/store";
import { readBusinessJson, writeBusinessJson } from "@/businessStorage";
import { isDeletionExpired } from "@/components/deletedRecordRetention";
import {
  CURRENT_USER,
  PAYABLES_STORAGE_KEY,
  PAYABLE_ACTIVITY_STORAGE_KEY,
  PAYABLE_CATEGORIES_STORAGE_KEY,
  PAYABLE_PAYMENTS_STORAGE_KEY,
} from "./constants";
import { seedActivity, seedCategories, seedPayables, seedPayments } from "./seed";
import type {
  OasisPayableUser,
  PayableActivity,
  PayableCategory,
  PayableFormValues,
  PayablePayment,
  PayableRecord,
  PayableViewModel,
  PaymentFormValues,
  PaymentMethod,
  ValidationResult,
} from "./types";
import { enrichPayables, nowIso, payableItemsTotal, peso, todayIsoDate, toViewModel, uid } from "./utils";
import {
  canReversePayment,
  remainingBalanceFor,
  validatePayablePayload,
  validatePaymentPayload,
} from "./validation";

type StoreSnapshot = {
  payables: PayableRecord[];
  payments: PayablePayment[];
  categories: PayableCategory[];
  activity: PayableActivity[];
};

export type PayableServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: ValidationResult["errors"] };

function readJson<T>(key: string, fallback: T): T {
  return readBusinessJson(key, fallback);
}

function writeJson(key: string, value: unknown): void {
  writeBusinessJson(key, value);
}

function load(): StoreSnapshot {
  const payables = readJson<PayableRecord[] | null>(PAYABLES_STORAGE_KEY, null);
  if (!payables) {
    writeJson(PAYABLES_STORAGE_KEY, seedPayables);
    writeJson(PAYABLE_PAYMENTS_STORAGE_KEY, seedPayments);
    writeJson(PAYABLE_CATEGORIES_STORAGE_KEY, seedCategories);
    writeJson(PAYABLE_ACTIVITY_STORAGE_KEY, seedActivity);
    return {
      payables: seedPayables,
      payments: seedPayments,
      categories: seedCategories,
      activity: seedActivity,
    };
  }
  return {
    payables,
    payments: readJson(PAYABLE_PAYMENTS_STORAGE_KEY, seedPayments),
    categories: readJson(PAYABLE_CATEGORIES_STORAGE_KEY, seedCategories),
    activity: readJson(PAYABLE_ACTIVITY_STORAGE_KEY, seedActivity),
  };
}

function persist(snapshot: StoreSnapshot): void {
  writeJson(PAYABLES_STORAGE_KEY, snapshot.payables);
  writeJson(PAYABLE_PAYMENTS_STORAGE_KEY, snapshot.payments);
  writeJson(PAYABLE_CATEGORIES_STORAGE_KEY, snapshot.categories);
  writeJson(PAYABLE_ACTIVITY_STORAGE_KEY, snapshot.activity);
}

function logActivity(
  snapshot: StoreSnapshot,
  entry: Omit<PayableActivity, "id" | "performedAt"> & { performedAt?: string },
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

function appendPayment(
  snapshot: StoreSnapshot,
  payableId: number,
  values: PaymentFormValues,
): PayableServiceResult<PayablePayment> {
  const user = CURRENT_USER;
  if (!user.permissions.recordPayments) {
    return { ok: false, errors: { form: "You are not authorized to record payments." } };
  }

  const payable = snapshot.payables.find((p) => p.id === payableId);
  if (!payable) return { ok: false, errors: { form: "Payable record not found." } };

  const checks = checkService.list();
  const validation = validatePaymentPayload(values, {
    payable,
    payments: snapshot.payments,
    checkExists: (checkId) => checks.some((c) => c.id === checkId && !c.archivedAt),
  });
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const method = values.paymentMethod as PaymentMethod;
  let checkId: number | null = null;
  let checkNumber: string | null = null;
  if (method === "Check") {
    const linked = checks.find((c) => c.id === Number(values.checkId));
    checkId = linked?.id ?? null;
    checkNumber = linked?.checkNumber ?? null;
  }

  const stamp = nowIso();
  const payment: PayablePayment = {
    id: uid("pay"),
    payableId,
    paymentDate: values.paymentDate,
    amountPaid: Number(values.amountPaid),
    paymentMethod: method,
    referenceNumber: values.referenceNumber.trim(),
    checkId,
    checkNumber,
    remarks: values.remarks.trim() || null,
    recordedById: user.id,
    recordedByName: user.name,
    isReversal: false,
    reversesPaymentId: null,
    reversedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  };

  // Transactional-style update: all or nothing via single persist
  snapshot.payments = [payment, ...snapshot.payments];
  snapshot.payables = snapshot.payables.map((p) =>
    p.id === payableId
      ? {
          ...p,
          paymentMethod: method,
          referenceNumber: p.referenceNumber || payment.referenceNumber,
          updatedAt: stamp,
          updatedById: user.id,
        }
      : p,
  );
  logActivity(snapshot, {
    payableId,
    action: "payment_recorded",
    summary: `Payment recorded: ${peso.format(payment.amountPaid)}`,
    performedById: user.id,
    performedByName: user.name,
    metadata: {
      amount: payment.amountPaid,
      method,
      paymentId: payment.id,
      reference: payment.referenceNumber,
    },
  });
  return { ok: true, data: payment };
}

function applyPaymentStatus(
  snapshot: StoreSnapshot,
  record: PayableRecord,
  values: PayableFormValues,
): ValidationResult {
  const remaining = remainingBalanceFor(record, snapshot.payments);
  if (values.paymentStatus === "Unpaid") {
    return remaining > 0
      ? { ok: true, errors: {} }
      : { ok: false, errors: { paymentStatus: "This payable is fully paid. Reverse the recorded payment before marking it unpaid." } };
  }
  if (remaining <= 0) return { ok: true, errors: {} };
  const result = appendPayment(snapshot, record.id, {
    paymentDate: todayIsoDate(),
    amountPaid: String(remaining),
    paymentMethod: values.paymentMethod,
    referenceNumber: values.referenceNumber,
    checkId: "",
    remarks: "Marked paid from payable form.",
  });
  return result.ok ? { ok: true, errors: {} } : { ok: false, errors: result.errors };
}

function toRecord(
  values: PayableFormValues,
  user: OasisPayableUser,
  existing?: PayableRecord,
): PayableRecord {
  const stamp = nowIso();
  return {
    id: existing?.id ?? Date.now(),
    payeeName: values.payeeName.trim(),
    invoiceNumber: values.invoiceNumber.trim(),
    description: values.items.map((item) => item.description.trim()).join("; "),
    items: values.items.map((item) => ({
      description: item.description.trim(), quantity: Number(item.quantity), price: Number(item.price),
    })),
    categoryId: existing?.categoryId ?? 0,
    categoryName: existing?.categoryName ?? "",
    invoiceDate: values.invoiceDate,
    dueDate: values.paymentStatus === "Paid" ? existing?.dueDate ?? "" : values.dueDate,
    totalAmount: payableItemsTotal(values.items),
    paymentMethod: (values.paymentMethod || null) as PaymentMethod | null,
    referenceNumber: values.referenceNumber.trim(),
    approvalStatus: existing?.approvalStatus ?? "Approved",
    approvedById: existing?.approvedById ?? null,
    approvedByName: existing?.approvedByName ?? null,
    approvedAt: existing?.approvedAt ?? null,
    rejectionReason: existing?.rejectionReason ?? null,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
    archivedAt: existing?.archivedAt ?? null,
    createdById: existing?.createdById ?? user.id,
    createdByName: existing?.createdByName ?? user.name,
    updatedById: user.id,
  };
}

export const payableService = {
  getUser(): OasisPayableUser {
    return CURRENT_USER;
  },

  list(): PayableRecord[] {
    return load().payables.filter((record) => !record.deletedAt);
  },

  listViewModels(): PayableViewModel[] {
    const snapshot = load();
    return enrichPayables(snapshot.payables.filter((record) => !record.deletedAt), snapshot.payments);
  },

  get(id: number): PayableRecord | undefined {
    return load().payables.find((p) => p.id === id && !p.deletedAt);
  },

  getViewModel(id: number): PayableViewModel | undefined {
    const snapshot = load();
    const record = snapshot.payables.find((p) => p.id === id && !p.deletedAt);
    if (!record) return undefined;
    return toViewModel(record, snapshot.payments);
  },

  paymentsFor(payableId: number): PayablePayment[] {
    return load()
      .payments.filter((p) => p.payableId === payableId)
      .sort((a, b) => {
        const byDate = b.paymentDate.localeCompare(a.paymentDate);
        if (byDate !== 0) return byDate;
        return b.createdAt.localeCompare(a.createdAt);
      });
  },

  allPayments(): PayablePayment[] {
    return load().payments;
  },

  categories(activeOnly = true): PayableCategory[] {
    const cats = load().categories;
    return activeOnly ? cats.filter((c) => c.isActive) : cats;
  },

  activityFor(payableId: number): PayableActivity[] {
    return load()
      .activity.filter((a) => a.payableId === payableId)
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  },

  allActivity(): PayableActivity[] {
    return load().activity.sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  },

  create(values: PayableFormValues): PayableServiceResult<PayableRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.editPayables) {
      return { ok: false, errors: { form: "You are not authorized to create payables." } };
    }
    const validation = validatePayablePayload(values, {
      existing: snapshot.payables,
    });
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const record = toRecord(values, user);
    snapshot.payables = [record, ...snapshot.payables];
    const paymentStatus = applyPaymentStatus(snapshot, record, values);
    if (!paymentStatus.ok) return { ok: false, errors: paymentStatus.errors };
    logActivity(snapshot, {
      payableId: record.id,
      action: "created",
      summary: "Payable record created",
      newApprovalStatus: "Pending",
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  update(id: number, values: PayableFormValues): PayableServiceResult<PayableRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.editPayables) {
      return { ok: false, errors: { form: "You are not authorized to edit payables." } };
    }
    const existing = snapshot.payables.find((p) => p.id === id && !p.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Payable record not found." } };
    if (existing.archivedAt) {
      return { ok: false, errors: { form: "Archived payables cannot be edited." } };
    }

    const validation = validatePayablePayload(values, {
      existing: snapshot.payables,
      editingId: id,
    });
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const amountPaid =
      existing.totalAmount - remainingBalanceFor(existing, snapshot.payments);
    const newTotal = payableItemsTotal(values.items);
    if (newTotal < amountPaid - 0.001) {
      return {
        ok: false,
        errors: {
          totalAmount: `Total amount cannot be less than amount already paid (${peso.format(amountPaid)}).`,
        },
      };
    }

    const record = toRecord(values, user, existing);
    snapshot.payables = snapshot.payables.map((p) => (p.id === id ? record : p));
    const paymentStatus = applyPaymentStatus(snapshot, record, values);
    if (!paymentStatus.ok) return { ok: false, errors: paymentStatus.errors };
    logActivity(snapshot, {
      payableId: id,
      action: "updated",
      summary: "Payable record updated",
      performedById: user.id,
      performedByName: user.name,
      metadata: { invoiceNumber: record.invoiceNumber },
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  /**
   * Record a payment inside a logical transaction:
   * validate → append payment → update payable timestamps → audit → persist once.
   */
  recordPayment(
    payableId: number,
    values: PaymentFormValues,
  ): PayableServiceResult<PayablePayment> {
    const snapshot = load();
    const result = appendPayment(snapshot, payableId, values);
    if (result.ok) persist(snapshot);
    return result;
  },

  reversePayment(
    paymentId: string,
    remarks?: string,
  ): PayableServiceResult<PayablePayment> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.reversePayments) {
      return { ok: false, errors: { form: "You are not authorized to reverse payments." } };
    }

    const original = snapshot.payments.find((p) => p.id === paymentId);
    if (!original) return { ok: false, errors: { form: "Payment record not found." } };

    const check = canReversePayment(original, snapshot.payments);
    if (!check.ok) return { ok: false, errors: { form: check.message } };

    const payable = snapshot.payables.find((p) => p.id === original.payableId);
    if (!payable) return { ok: false, errors: { form: "Payable record not found." } };
    if (payable.archivedAt) {
      return { ok: false, errors: { form: "Cannot reverse payments on an archived payable." } };
    }

    const stamp = nowIso();
    const reversal: PayablePayment = {
      id: uid("pay"),
      payableId: original.payableId,
      paymentDate: original.paymentDate,
      amountPaid: original.amountPaid,
      paymentMethod: original.paymentMethod,
      referenceNumber: `REV-${original.referenceNumber}`,
      checkId: original.checkId,
      checkNumber: original.checkNumber,
      remarks: remarks?.trim() || `Reversal of payment ${original.id}`,
      recordedById: user.id,
      recordedByName: user.name,
      isReversal: true,
      reversesPaymentId: original.id,
      reversedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    };

    snapshot.payments = snapshot.payments.map((p) =>
      p.id === paymentId ? { ...p, reversedAt: stamp, updatedAt: stamp } : p,
    );
    snapshot.payments = [reversal, ...snapshot.payments];
    snapshot.payables = snapshot.payables.map((p) =>
      p.id === original.payableId
        ? { ...p, updatedAt: stamp, updatedById: user.id }
        : p,
    );
    logActivity(snapshot, {
      payableId: original.payableId,
      action: "payment_reversed",
      summary: `Payment reversed: ${peso.format(original.amountPaid)}`,
      performedById: user.id,
      performedByName: user.name,
      metadata: {
        originalPaymentId: original.id,
        reversalPaymentId: reversal.id,
        amount: original.amountPaid,
      },
    });
    persist(snapshot);
    return { ok: true, data: reversal };
  },

  archive(id: number): PayableServiceResult<PayableRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.archivePayables) {
      return { ok: false, errors: { form: "You are not authorized to archive payables." } };
    }
    const existing = snapshot.payables.find((p) => p.id === id && !p.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Payable record not found." } };

    const record: PayableRecord = {
      ...existing,
      archivedAt: nowIso(),
      updatedAt: nowIso(),
      updatedById: user.id,
    };
    snapshot.payables = snapshot.payables.map((p) => (p.id === id ? record : p));
    logActivity(snapshot, {
      payableId: id,
      action: "archived",
      summary: "Payable record archived",
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  deleteRecord(id: number): PayableServiceResult<PayableRecord> {
    const user = CURRENT_USER;
    if (!user.permissions.archivePayables) {
      return { ok: false, errors: { form: "You are not authorized to delete payables." } };
    }
    const snapshot = load();
    const existing = snapshot.payables.find((record) => record.id === id && !record.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Payable record not found." } };
    const stamp = nowIso();
    const record = { ...existing, deletedAt: stamp, updatedAt: stamp, updatedById: user.id };
    snapshot.payables = snapshot.payables.map((item) => item.id === id ? record : item);
    logActivity(snapshot, {
      payableId: id,
      action: "deleted",
      summary: "Payable moved to Deleted Records",
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  purgeExpiredDeleted(now = Date.now()): number {
    if (!CURRENT_USER.permissions.archivePayables) return 0;
    const snapshot = load();
    const retained = snapshot.payables.filter((record) => !isDeletionExpired(record.deletedAt, now));
    const removed = snapshot.payables.length - retained.length;
    if (removed) writeJson(PAYABLES_STORAGE_KEY, retained);
    return removed;
  },

  listDeleted(): PayableRecord[] {
    return load().payables.filter((record) => !!record.deletedAt);
  },

  restoreDeleted(id: number): PayableServiceResult<PayableRecord> {
    if (!CURRENT_USER.permissions.archivePayables) {
      return { ok: false, errors: { form: "You are not authorized to restore deleted records." } };
    }
    const snapshot = load();
    const existing = snapshot.payables.find((record) => record.id === id && record.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Deleted record not found." } };
    const record = { ...existing, deletedAt: null, updatedAt: nowIso() };
    writeJson(PAYABLES_STORAGE_KEY, snapshot.payables.map((item) => item.id === id ? record : item));
    return { ok: true, data: record };
  },

  deletePermanently(id: number): PayableServiceResult<PayableRecord> {
    if (!CURRENT_USER.permissions.archivePayables) {
      return { ok: false, errors: { form: "You are not authorized to permanently delete records." } };
    }
    const snapshot = load();
    const record = snapshot.payables.find((item) => item.id === id && item.deletedAt);
    if (!record) return { ok: false, errors: { form: "Deleted record not found." } };
    writeJson(PAYABLES_STORAGE_KEY, snapshot.payables.filter((item) => item.id !== id));
    return { ok: true, data: record };
  },

  deleteArchived(id: number): PayableServiceResult<PayableRecord> {
    if (!CURRENT_USER.permissions.archivePayables) {
      return { ok: false, errors: { form: "You are not authorized to delete archived records." } };
    }
    const snapshot = load();
    const existing = snapshot.payables.find((record) => record.id === id);
    if (!existing?.archivedAt || existing.deletedAt) {
      return { ok: false, errors: { form: "Archived record not found." } };
    }
    const record = { ...existing, deletedAt: nowIso(), updatedAt: nowIso() };
    writeJson(PAYABLES_STORAGE_KEY, snapshot.payables.map((item) => item.id === id ? record : item));
    return { ok: true, data: record };
  },

  restore(id: number): PayableServiceResult<PayableRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.archivePayables) {
      return { ok: false, errors: { form: "You are not authorized to restore payables." } };
    }
    const existing = snapshot.payables.find((p) => p.id === id && !p.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Payable record not found." } };

    const record: PayableRecord = {
      ...existing,
      archivedAt: null,
      updatedAt: nowIso(),
      updatedById: user.id,
    };
    snapshot.payables = snapshot.payables.map((p) => (p.id === id ? record : p));
    logActivity(snapshot, {
      payableId: id,
      action: "restored",
      summary: "Payable record restored",
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  addCategory(name: string): PayableServiceResult<PayableCategory> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.manageCategories) {
      return { ok: false, errors: { form: "You are not authorized to manage categories." } };
    }
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, errors: { form: "Category name is required." } };
    if (
      snapshot.categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      return { ok: false, errors: { form: "A category with this name already exists." } };
    }
    const stamp = nowIso();
    const category: PayableCategory = {
      id: Date.now(),
      name: trimmed,
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    };
    snapshot.categories = [...snapshot.categories, category];
    logActivity(snapshot, {
      payableId: null,
      action: "category_managed",
      summary: `Category added: ${trimmed}`,
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: category };
  },

  deactivateCategory(id: number): PayableServiceResult<PayableCategory> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.manageCategories) {
      return { ok: false, errors: { form: "You are not authorized to manage categories." } };
    }
    const existing = snapshot.categories.find((c) => c.id === id);
    if (!existing) return { ok: false, errors: { form: "Category not found." } };
    const inUse = snapshot.payables.some(
      (p) => p.categoryId === id && !p.archivedAt,
    );
    if (inUse) {
      return {
        ok: false,
        errors: { form: "Category is in use by active payables and cannot be deactivated." },
      };
    }
    const category: PayableCategory = {
      ...existing,
      isActive: false,
      updatedAt: nowIso(),
    };
    snapshot.categories = snapshot.categories.map((c) => (c.id === id ? category : c));
    logActivity(snapshot, {
      payableId: null,
      action: "category_managed",
      summary: `Category deactivated: ${existing.name}`,
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: category };
  },

  linkableChecks() {
    return checkService
      .list()
      .filter((c) => !c.archivedAt && c.checkType === "Issued Check")
      .map((c) => ({
        id: c.id,
        checkNumber: c.checkNumber,
        payeeName: c.payeeName,
        checkAmount: c.checkAmount,
        checkStatus: c.checkStatus,
      }));
  },

  remainingBalance(payableId: number): number {
    const snapshot = load();
    const payable = snapshot.payables.find((p) => p.id === payableId);
    if (!payable) return 0;
    return remainingBalanceFor(payable, snapshot.payments);
  },

  resetDemoData(): void {
    writeJson(PAYABLES_STORAGE_KEY, seedPayables);
    writeJson(PAYABLE_PAYMENTS_STORAGE_KEY, seedPayments);
    writeJson(PAYABLE_CATEGORIES_STORAGE_KEY, seedCategories);
    writeJson(PAYABLE_ACTIVITY_STORAGE_KEY, seedActivity);
  },
};
