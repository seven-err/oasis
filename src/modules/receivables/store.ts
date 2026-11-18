import { checkService } from "@/modules/checks/store";
import {
  CURRENT_USER,
  RECEIVABLES_STORAGE_KEY,
  RECEIVABLE_ACTIVITY_STORAGE_KEY,
  RECEIVABLE_ATTACHMENTS_STORAGE_KEY,
  RECEIVABLE_COLLECTIONS_STORAGE_KEY,
  RECEIVABLE_CUSTOMERS_STORAGE_KEY,
  RECEIVABLE_FOLLOWUPS_STORAGE_KEY,
} from "./constants";
import {
  seedActivity,
  seedAttachments,
  seedCollections,
  seedCustomers,
  seedFollowUps,
  seedReceivables,
} from "./seed";
import type {
  AttachmentKind,
  CollectionFollowUp,
  CollectionFormValues,
  Customer,
  CustomerFormValues,
  FollowUpFormValues,
  OasisReceivableUser,
  PaymentMethod,
  ReceivableActivity,
  ReceivableAttachment,
  ReceivableCollection,
  ReceivableFormValues,
  ReceivableRecord,
  ReceivableViewModel,
  ValidationResult,
} from "./types";
import { canCancelReceivable, enrichReceivables, nowIso, peso, toViewModel, uid } from "./utils";
import {
  canReverseCollection,
  remainingBalanceFor,
  validateAttachmentFile,
  validateCollectionPayload,
  validateCustomerPayload,
  validateFollowUpPayload,
  validateReceivablePayload,
} from "./validation";

type StoreSnapshot = {
  receivables: ReceivableRecord[];
  collections: ReceivableCollection[];
  customers: Customer[];
  followUps: CollectionFollowUp[];
  attachments: ReceivableAttachment[];
  activity: ReceivableActivity[];
};

export type ReceivableServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: ValidationResult["errors"] };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function load(): StoreSnapshot {
  const receivables = readJson<ReceivableRecord[] | null>(RECEIVABLES_STORAGE_KEY, null);
  if (!receivables) {
    writeJson(RECEIVABLES_STORAGE_KEY, seedReceivables);
    writeJson(RECEIVABLE_COLLECTIONS_STORAGE_KEY, seedCollections);
    writeJson(RECEIVABLE_CUSTOMERS_STORAGE_KEY, seedCustomers);
    writeJson(RECEIVABLE_FOLLOWUPS_STORAGE_KEY, seedFollowUps);
    writeJson(RECEIVABLE_ATTACHMENTS_STORAGE_KEY, seedAttachments);
    writeJson(RECEIVABLE_ACTIVITY_STORAGE_KEY, seedActivity);
    return {
      receivables: seedReceivables,
      collections: seedCollections,
      customers: seedCustomers,
      followUps: seedFollowUps,
      attachments: seedAttachments,
      activity: seedActivity,
    };
  }
  return {
    receivables,
    collections: readJson(RECEIVABLE_COLLECTIONS_STORAGE_KEY, seedCollections),
    customers: readJson(RECEIVABLE_CUSTOMERS_STORAGE_KEY, seedCustomers),
    followUps: readJson(RECEIVABLE_FOLLOWUPS_STORAGE_KEY, seedFollowUps),
    attachments: readJson(RECEIVABLE_ATTACHMENTS_STORAGE_KEY, seedAttachments),
    activity: readJson(RECEIVABLE_ACTIVITY_STORAGE_KEY, seedActivity),
  };
}

function persist(snapshot: StoreSnapshot): void {
  writeJson(RECEIVABLES_STORAGE_KEY, snapshot.receivables);
  writeJson(RECEIVABLE_COLLECTIONS_STORAGE_KEY, snapshot.collections);
  writeJson(RECEIVABLE_CUSTOMERS_STORAGE_KEY, snapshot.customers);
  writeJson(RECEIVABLE_FOLLOWUPS_STORAGE_KEY, snapshot.followUps);
  writeJson(RECEIVABLE_ATTACHMENTS_STORAGE_KEY, snapshot.attachments);
  writeJson(RECEIVABLE_ACTIVITY_STORAGE_KEY, snapshot.activity);
}

function logActivity(
  snapshot: StoreSnapshot,
  entry: Omit<ReceivableActivity, "id" | "performedAt"> & { performedAt?: string },
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
  values: ReceivableFormValues,
  user: OasisReceivableUser,
  existing?: ReceivableRecord,
): ReceivableRecord {
  const stamp = nowIso();
  return {
    id: existing?.id ?? Date.now(),
    invoiceNumber: values.invoiceNumber.trim(),
    customerId: Number(values.customerId),
    clientId: values.clientId.trim(),
    customerName: values.customerName.trim(),
    contactNumber: values.contactNumber.trim(),
    emailAddress: values.emailAddress.trim(),
    billingAddress: values.billingAddress.trim(),
    transactionDate: values.transactionDate,
    invoiceDate: values.invoiceDate,
    dueDate: values.dueDate,
    description: values.description.trim(),
    referenceNumber: values.referenceNumber.trim(),
    totalReceivableAmount: Number(values.totalReceivableAmount),
    collectionStatus: existing?.collectionStatus,
    paymentMethod: (values.paymentMethod || null) as PaymentMethod | null,
    collectionFollowUpDate: values.collectionFollowUpDate || null,
    remarks: values.remarks.trim() || null,
    preparedById: existing?.preparedById ?? user.id,
    preparedByName: existing?.preparedByName ?? user.name,
    updatedById: user.id,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
    archivedAt: existing?.archivedAt ?? null,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

export const receivableService = {
  getUser(): OasisReceivableUser {
    return CURRENT_USER;
  },

  list(): ReceivableRecord[] {
    return load().receivables.filter((record) => !record.deletedAt);
  },

  listViewModels(): ReceivableViewModel[] {
    const snapshot = load();
    return enrichReceivables(snapshot.receivables.filter((record) => !record.deletedAt), snapshot.collections);
  },

  get(id: number): ReceivableRecord | undefined {
    return load().receivables.find((r) => r.id === id && !r.deletedAt);
  },

  getViewModel(id: number): ReceivableViewModel | undefined {
    const snapshot = load();
    const record = snapshot.receivables.find((r) => r.id === id && !r.deletedAt);
    if (!record) return undefined;
    return toViewModel(record, snapshot.collections);
  },

  customers(activeOnly = true): Customer[] {
    const list = load().customers;
    return activeOnly ? list.filter((c) => !c.archivedAt) : list;
  },

  getCustomer(id: number): Customer | undefined {
    return load().customers.find((c) => c.id === id);
  },

  collectionsFor(receivableId: number): ReceivableCollection[] {
    return load()
      .collections.filter((c) => c.receivableId === receivableId)
      .sort((a, b) => {
        const byDate = b.collectionDate.localeCompare(a.collectionDate);
        if (byDate !== 0) return byDate;
        return b.createdAt.localeCompare(a.createdAt);
      });
  },

  allCollections(): ReceivableCollection[] {
    return load().collections;
  },

  followUpsFor(receivableId: number): CollectionFollowUp[] {
    return load()
      .followUps.filter((f) => f.receivableId === receivableId)
      .sort((a, b) => {
        const byDate = b.followUpDate.localeCompare(a.followUpDate);
        if (byDate !== 0) return byDate;
        return b.createdAt.localeCompare(a.createdAt);
      });
  },

  allFollowUps(): CollectionFollowUp[] {
    return load().followUps;
  },

  attachmentsFor(receivableId: number): ReceivableAttachment[] {
    return load()
      .attachments.filter((a) => a.receivableId === receivableId && !a.deletedAt)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  },

  activityFor(receivableId: number): ReceivableActivity[] {
    return load()
      .activity.filter((a) => a.receivableId === receivableId)
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  },

  allActivity(): ReceivableActivity[] {
    return load().activity.sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  },

  createCustomer(values: CustomerFormValues): ReceivableServiceResult<Customer> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.manageCustomers) {
      return { ok: false, errors: { form: "You are not authorized to manage customers." } };
    }
    const validation = validateCustomerPayload(values, { existing: snapshot.customers });
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const stamp = nowIso();
    const customer: Customer = {
      id: Date.now(),
      clientId: values.clientId.trim(),
      customerName: values.customerName.trim(),
      contactNumber: values.contactNumber.trim(),
      emailAddress: values.emailAddress.trim(),
      billingAddress: values.billingAddress.trim(),
      createdAt: stamp,
      updatedAt: stamp,
      archivedAt: null,
    };
    snapshot.customers = [customer, ...snapshot.customers];
    logActivity(snapshot, {
      receivableId: null,
      action: "customer_created",
      summary: `Customer registered: ${customer.customerName}`,
      performedById: user.id,
      performedByName: user.name,
      metadata: { clientId: customer.clientId },
    });
    persist(snapshot);
    return { ok: true, data: customer };
  },

  updateCustomer(
    id: number,
    values: CustomerFormValues,
  ): ReceivableServiceResult<Customer> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.manageCustomers) {
      return { ok: false, errors: { form: "You are not authorized to manage customers." } };
    }
    const existing = snapshot.customers.find((c) => c.id === id);
    if (!existing) return { ok: false, errors: { form: "Customer not found." } };
    if (existing.archivedAt) {
      return { ok: false, errors: { form: "Archived customers cannot be edited." } };
    }

    const validation = validateCustomerPayload(values, {
      existing: snapshot.customers,
      editingId: id,
    });
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const customer: Customer = {
      ...existing,
      clientId: values.clientId.trim(),
      customerName: values.customerName.trim(),
      contactNumber: values.contactNumber.trim(),
      emailAddress: values.emailAddress.trim(),
      billingAddress: values.billingAddress.trim(),
      updatedAt: nowIso(),
    };
    snapshot.customers = snapshot.customers.map((c) => (c.id === id ? customer : c));
    logActivity(snapshot, {
      receivableId: null,
      action: "customer_updated",
      summary: `Customer updated: ${customer.customerName}`,
      performedById: user.id,
      performedByName: user.name,
      metadata: { clientId: customer.clientId },
    });
    persist(snapshot);
    return { ok: true, data: customer };
  },

  create(values: ReceivableFormValues): ReceivableServiceResult<ReceivableRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.editReceivables) {
      return { ok: false, errors: { form: "You are not authorized to create receivables." } };
    }
    const validation = validateReceivablePayload(values, {
      existing: snapshot.receivables,
      customers: snapshot.customers,
    });
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const record = toRecord(values, user);
    snapshot.receivables = [record, ...snapshot.receivables];
    logActivity(snapshot, {
      receivableId: record.id,
      action: "created",
      summary: "Receivable record created",
      performedById: user.id,
      performedByName: user.name,
      metadata: { invoiceNumber: record.invoiceNumber },
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  update(
    id: number,
    values: ReceivableFormValues,
  ): ReceivableServiceResult<ReceivableRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.editReceivables) {
      return { ok: false, errors: { form: "You are not authorized to edit receivables." } };
    }
    const existing = snapshot.receivables.find((r) => r.id === id && !r.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Receivable record not found." } };
    if (existing.archivedAt) {
      return { ok: false, errors: { form: "Archived receivables cannot be edited." } };
    }
    if (existing.collectionStatus === "Cancelled") {
      return { ok: false, errors: { form: "Cancelled receivables cannot be edited." } };
    }

    const validation = validateReceivablePayload(values, {
      existing: snapshot.receivables,
      customers: snapshot.customers,
      editingId: id,
    });
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const amountPaid =
      existing.totalReceivableAmount -
      remainingBalanceFor(existing, snapshot.collections);
    const newTotal = Number(values.totalReceivableAmount);
    if (newTotal < amountPaid - 0.001) {
      return {
        ok: false,
        errors: {
          totalReceivableAmount: `Total amount cannot be less than amount already collected (${peso.format(amountPaid)}).`,
        },
      };
    }

    const record = toRecord(values, user, existing);
    snapshot.receivables = snapshot.receivables.map((r) => (r.id === id ? record : r));
    logActivity(snapshot, {
      receivableId: id,
      action: "updated",
      summary: "Receivable record updated",
      performedById: user.id,
      performedByName: user.name,
      metadata: { invoiceNumber: record.invoiceNumber },
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  cancel(id: number, reason: string): ReceivableServiceResult<ReceivableRecord> {
    const cancellationReason = reason.trim();
    if (!cancellationReason) {
      return { ok: false, errors: { form: "Enter a reason for cancellation." } };
    }

    const snapshot = load();
    const existing = snapshot.receivables.find((record) => record.id === id);
    if (!existing) return { ok: false, errors: { form: "Receivable record not found." } };
    if (
      !CURRENT_USER.permissions.editReceivables ||
      !canCancelReceivable(toViewModel(existing, snapshot.collections))
    ) {
      return { ok: false, errors: { form: "This receivable cannot be cancelled." } };
    }

    const record: ReceivableRecord = {
      ...existing,
      collectionStatus: "Cancelled",
      cancellationReason,
      updatedAt: nowIso(),
      updatedById: CURRENT_USER.id,
    };
    try {
      writeJson(
        RECEIVABLES_STORAGE_KEY,
        snapshot.receivables.map((row) => (row.id === id ? record : row)),
      );
    } catch {
      return { ok: false, errors: { form: "Unable to save the cancellation." } };
    }
    return { ok: true, data: record };
  },

  /**
   * Record a collection inside a logical transaction:
   * validate → append collection → update receivable timestamps → audit → persist once.
   */
  recordCollection(
    receivableId: number,
    values: CollectionFormValues,
  ): ReceivableServiceResult<ReceivableCollection> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.recordCollections) {
      return {
        ok: false,
        errors: { form: "You are not authorized to record collections." },
      };
    }

    const receivable = snapshot.receivables.find((r) => r.id === receivableId);
    if (!receivable) return { ok: false, errors: { form: "Receivable record not found." } };

    const checks = checkService.list();
    const validation = validateCollectionPayload(values, {
      receivable,
      collections: snapshot.collections,
      checkExists: (checkId) => checks.some((c) => c.id === checkId && !c.archivedAt),
    });
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const method = values.paymentMethod as PaymentMethod;
    let checkId: number | null = null;
    let checkNumber: string | null = null;
    let bankName: string | null = values.bankName.trim() || null;

    if (method === "Check") {
      if (values.checkId) {
        const linked = checks.find((c) => c.id === Number(values.checkId));
        checkId = linked?.id ?? null;
        checkNumber = linked?.checkNumber ?? (values.checkNumber.trim() || null);
        bankName = linked?.bankName ?? bankName;
      } else {
        checkNumber = values.checkNumber.trim() || null;
      }
    } else if (method === "Cash" || method === "E-Wallet") {
      bankName = null;
      checkNumber = null;
      checkId = null;
    }

    const stamp = nowIso();
    const collection: ReceivableCollection = {
      id: uid("col"),
      receivableId,
      collectionDate: values.collectionDate,
      amountCollected: Number(values.amountCollected),
      paymentMethod: method,
      paymentReferenceNumber: values.paymentReferenceNumber.trim(),
      bankName,
      checkNumber,
      checkId,
      remarks: values.remarks.trim() || null,
      recordedById: user.id,
      recordedByName: user.name,
      isReversal: false,
      reversesCollectionId: null,
      reversedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    };

    snapshot.collections = [collection, ...snapshot.collections];
    snapshot.receivables = snapshot.receivables.map((r) =>
      r.id === receivableId
        ? {
            ...r,
            paymentMethod: method,
            referenceNumber: r.referenceNumber || collection.paymentReferenceNumber,
            updatedAt: stamp,
            updatedById: user.id,
          }
        : r,
    );
    logActivity(snapshot, {
      receivableId,
      action: "collection_recorded",
      summary: `Collection recorded: ${peso.format(collection.amountCollected)}`,
      performedById: user.id,
      performedByName: user.name,
      metadata: {
        amount: collection.amountCollected,
        method,
        collectionId: collection.id,
        reference: collection.paymentReferenceNumber,
      },
    });
    persist(snapshot);
    return { ok: true, data: collection };
  },

  reverseCollection(
    collectionId: string,
    remarks?: string,
  ): ReceivableServiceResult<ReceivableCollection> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.reverseCollections) {
      return {
        ok: false,
        errors: { form: "You are not authorized to reverse collections." },
      };
    }

    const original = snapshot.collections.find((c) => c.id === collectionId);
    if (!original) return { ok: false, errors: { form: "Collection record not found." } };

    const check = canReverseCollection(original, snapshot.collections);
    if (!check.ok) return { ok: false, errors: { form: check.message } };

    const receivable = snapshot.receivables.find((r) => r.id === original.receivableId);
    if (!receivable) return { ok: false, errors: { form: "Receivable record not found." } };
    if (receivable.archivedAt) {
      return {
        ok: false,
        errors: { form: "Cannot reverse collections on an archived receivable." },
      };
    }
    if (receivable.collectionStatus === "Cancelled") {
      return {
        ok: false,
        errors: { form: "Cannot reverse collections on a cancelled receivable." },
      };
    }

    const stamp = nowIso();
    const reversal: ReceivableCollection = {
      id: uid("col"),
      receivableId: original.receivableId,
      collectionDate: original.collectionDate,
      amountCollected: original.amountCollected,
      paymentMethod: original.paymentMethod,
      paymentReferenceNumber: `REV-${original.paymentReferenceNumber}`,
      bankName: original.bankName,
      checkNumber: original.checkNumber,
      checkId: original.checkId,
      remarks: remarks?.trim() || `Reversal of collection ${original.id}`,
      recordedById: user.id,
      recordedByName: user.name,
      isReversal: true,
      reversesCollectionId: original.id,
      reversedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    };

    snapshot.collections = snapshot.collections.map((c) =>
      c.id === collectionId ? { ...c, reversedAt: stamp, updatedAt: stamp } : c,
    );
    snapshot.collections = [reversal, ...snapshot.collections];
    snapshot.receivables = snapshot.receivables.map((r) =>
      r.id === original.receivableId
        ? { ...r, updatedAt: stamp, updatedById: user.id }
        : r,
    );
    logActivity(snapshot, {
      receivableId: original.receivableId,
      action: "collection_reversed",
      summary: `Collection reversed: ${peso.format(original.amountCollected)}`,
      performedById: user.id,
      performedByName: user.name,
      metadata: {
        originalCollectionId: original.id,
        reversalCollectionId: reversal.id,
        amount: original.amountCollected,
      },
    });
    persist(snapshot);
    return { ok: true, data: reversal };
  },

  recordFollowUp(
    receivableId: number,
    values: FollowUpFormValues,
  ): ReceivableServiceResult<CollectionFollowUp> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.manageFollowUps) {
      return {
        ok: false,
        errors: { form: "You are not authorized to manage follow-ups." },
      };
    }

    const receivable = snapshot.receivables.find((r) => r.id === receivableId);
    if (!receivable) return { ok: false, errors: { form: "Receivable record not found." } };
    if (receivable.archivedAt) {
      return {
        ok: false,
        errors: { form: "Cannot record follow-ups on an archived receivable." },
      };
    }

    const validation = validateFollowUpPayload(values);
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const stamp = nowIso();
    const followUp: CollectionFollowUp = {
      id: uid("fu"),
      receivableId,
      followUpDate: values.followUpDate,
      followUpNotes: values.followUpNotes.trim(),
      followUpResult: values.followUpResult.trim() || null,
      nextFollowUpDate: values.nextFollowUpDate || null,
      followedUpById: user.id,
      followedUpByName: user.name,
      createdAt: stamp,
      updatedAt: stamp,
    };

    snapshot.followUps = [followUp, ...snapshot.followUps];
    snapshot.receivables = snapshot.receivables.map((r) =>
      r.id === receivableId
        ? {
            ...r,
            collectionFollowUpDate:
              followUp.nextFollowUpDate ?? r.collectionFollowUpDate,
            updatedAt: stamp,
            updatedById: user.id,
          }
        : r,
    );
    logActivity(snapshot, {
      receivableId,
      action: "follow_up_recorded",
      summary: "Collection follow-up recorded",
      performedById: user.id,
      performedByName: user.name,
      metadata: {
        followUpDate: followUp.followUpDate,
        nextFollowUpDate: followUp.nextFollowUpDate,
      },
    });
    persist(snapshot);
    return { ok: true, data: followUp };
  },

  async uploadAttachment(
    receivableId: number,
    file: File,
    kind: AttachmentKind,
  ): Promise<ReceivableServiceResult<ReceivableAttachment>> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.manageAttachments) {
      return {
        ok: false,
        errors: { form: "You are not authorized to manage attachments." },
      };
    }

    const receivable = snapshot.receivables.find((r) => r.id === receivableId);
    if (!receivable) return { ok: false, errors: { form: "Receivable record not found." } };
    if (receivable.archivedAt) {
      return {
        ok: false,
        errors: { form: "Cannot upload attachments to an archived receivable." },
      };
    }

    const validation = validateAttachmentFile(file);
    if (!validation.ok) return { ok: false, errors: validation.errors };

    let previewDataUrl: string | undefined;
    try {
      previewDataUrl = await readFileAsDataUrl(file);
    } catch {
      return { ok: false, errors: { file: "Unable to read the selected file." } };
    }

    const stamp = nowIso();
    const attachment: ReceivableAttachment = {
      id: uid("att"),
      receivableId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      kind,
      storageKey: `private/receivables/${receivableId}/${uid("file")}-${file.name}`,
      previewDataUrl,
      uploadedById: user.id,
      uploadedByName: user.name,
      uploadedAt: stamp,
      deletedAt: null,
    };

    snapshot.attachments = [attachment, ...snapshot.attachments];
    snapshot.receivables = snapshot.receivables.map((r) =>
      r.id === receivableId
        ? { ...r, updatedAt: stamp, updatedById: user.id }
        : r,
    );
    logActivity(snapshot, {
      receivableId,
      action: "attachment_uploaded",
      summary: `Attachment uploaded: ${file.name}`,
      performedById: user.id,
      performedByName: user.name,
      metadata: { kind, fileName: file.name, sizeBytes: file.size },
    });
    persist(snapshot);
    return { ok: true, data: attachment };
  },

  deleteAttachment(attachmentId: string): ReceivableServiceResult<ReceivableAttachment> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.manageAttachments) {
      return {
        ok: false,
        errors: { form: "You are not authorized to manage attachments." },
      };
    }

    const existing = snapshot.attachments.find((a) => a.id === attachmentId);
    if (!existing || existing.deletedAt) {
      return { ok: false, errors: { form: "Attachment not found." } };
    }

    const stamp = nowIso();
    const attachment: ReceivableAttachment = {
      ...existing,
      deletedAt: stamp,
      previewDataUrl: undefined,
    };
    snapshot.attachments = snapshot.attachments.map((a) =>
      a.id === attachmentId ? attachment : a,
    );
    logActivity(snapshot, {
      receivableId: existing.receivableId,
      action: "attachment_deleted",
      summary: `Attachment deleted: ${existing.fileName}`,
      performedById: user.id,
      performedByName: user.name,
      metadata: { fileName: existing.fileName },
    });
    persist(snapshot);
    return { ok: true, data: attachment };
  },

  archive(id: number): ReceivableServiceResult<ReceivableRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.archiveReceivables) {
      return {
        ok: false,
        errors: { form: "You are not authorized to archive receivables." },
      };
    }
    const existing = snapshot.receivables.find((r) => r.id === id && !r.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Receivable record not found." } };

    const record: ReceivableRecord = {
      ...existing,
      archivedAt: nowIso(),
      updatedAt: nowIso(),
      updatedById: user.id,
    };
    snapshot.receivables = snapshot.receivables.map((r) => (r.id === id ? record : r));
    logActivity(snapshot, {
      receivableId: id,
      action: "archived",
      summary: "Receivable record archived",
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  listDeleted(): ReceivableRecord[] {
    return load().receivables.filter((record) => !!record.deletedAt);
  },

  restoreDeleted(id: number): ReceivableServiceResult<ReceivableRecord> {
    if (!CURRENT_USER.permissions.archiveReceivables) {
      return { ok: false, errors: { form: "You are not authorized to restore deleted records." } };
    }
    const snapshot = load();
    const existing = snapshot.receivables.find((record) => record.id === id && record.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Deleted record not found." } };
    const record = { ...existing, deletedAt: null, updatedAt: nowIso() };
    writeJson(RECEIVABLES_STORAGE_KEY, snapshot.receivables.map((item) => item.id === id ? record : item));
    return { ok: true, data: record };
  },

  deletePermanently(id: number): ReceivableServiceResult<ReceivableRecord> {
    if (!CURRENT_USER.permissions.archiveReceivables) {
      return { ok: false, errors: { form: "You are not authorized to permanently delete records." } };
    }
    const snapshot = load();
    const record = snapshot.receivables.find((item) => item.id === id && item.deletedAt);
    if (!record) return { ok: false, errors: { form: "Deleted record not found." } };
    writeJson(RECEIVABLES_STORAGE_KEY, snapshot.receivables.filter((item) => item.id !== id));
    return { ok: true, data: record };
  },

  deleteArchived(id: number): ReceivableServiceResult<ReceivableRecord> {
    if (!CURRENT_USER.permissions.archiveReceivables) {
      return { ok: false, errors: { form: "You are not authorized to delete archived records." } };
    }
    const snapshot = load();
    const existing = snapshot.receivables.find((record) => record.id === id);
    if (!existing?.archivedAt || existing.deletedAt) {
      return { ok: false, errors: { form: "Archived record not found." } };
    }
    const record = { ...existing, deletedAt: nowIso(), updatedAt: nowIso() };
    writeJson(RECEIVABLES_STORAGE_KEY, snapshot.receivables.map((item) => item.id === id ? record : item));
    return { ok: true, data: record };
  },

  restore(id: number): ReceivableServiceResult<ReceivableRecord> {
    const snapshot = load();
    const user = CURRENT_USER;
    if (!user.permissions.archiveReceivables) {
      return {
        ok: false,
        errors: { form: "You are not authorized to restore receivables." },
      };
    }
    const existing = snapshot.receivables.find((r) => r.id === id && !r.deletedAt);
    if (!existing) return { ok: false, errors: { form: "Receivable record not found." } };

    const record: ReceivableRecord = {
      ...existing,
      archivedAt: null,
      updatedAt: nowIso(),
      updatedById: user.id,
    };
    snapshot.receivables = snapshot.receivables.map((r) => (r.id === id ? record : r));
    logActivity(snapshot, {
      receivableId: id,
      action: "restored",
      summary: "Receivable record restored",
      performedById: user.id,
      performedByName: user.name,
    });
    persist(snapshot);
    return { ok: true, data: record };
  },

  linkableChecks() {
    return checkService
      .list()
      .filter((c) => !c.archivedAt && c.checkType === "Received Check")
      .map((c) => ({
        id: c.id,
        checkNumber: c.checkNumber,
        payeeName: c.payeeName,
        drawerName: c.drawerName,
        bankName: c.bankName,
        checkAmount: c.checkAmount,
        checkStatus: c.checkStatus,
      }));
  },

  remainingBalance(receivableId: number): number {
    const snapshot = load();
    const receivable = snapshot.receivables.find((r) => r.id === receivableId);
    if (!receivable) return 0;
    return remainingBalanceFor(receivable, snapshot.collections);
  },

  resetDemoData(): void {
    writeJson(RECEIVABLES_STORAGE_KEY, seedReceivables);
    writeJson(RECEIVABLE_COLLECTIONS_STORAGE_KEY, seedCollections);
    writeJson(RECEIVABLE_CUSTOMERS_STORAGE_KEY, seedCustomers);
    writeJson(RECEIVABLE_FOLLOWUPS_STORAGE_KEY, seedFollowUps);
    writeJson(RECEIVABLE_ATTACHMENTS_STORAGE_KEY, seedAttachments);
    writeJson(RECEIVABLE_ACTIVITY_STORAGE_KEY, seedActivity);
  },
};
