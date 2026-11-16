import type {
  CollectionStatus,
  PaymentMethod,
  ReceivableCollection,
  ReceivableFilters,
  ReceivableFormValues,
  ReceivableRecord,
  ReceivableSort,
  ReceivableSummary,
  ReceivableViewModel,
} from "./types";

export const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function todayIsoDate(asOf?: Date): string {
  const d = asOf ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Valid collections: not a reversal entry and not reversed */
export function validCollections(
  collections: ReceivableCollection[],
): ReceivableCollection[] {
  return collections.filter((c) => !c.isReversal && !c.reversedAt);
}

export function sumValidCollections(collections: ReceivableCollection[]): number {
  return validCollections(collections).reduce((sum, c) => sum + c.amountCollected, 0);
}

export function deriveCollectionStatus(
  totalAmount: number,
  amountPaid: number,
  dueDate: string,
  asOf: string = todayIsoDate(),
): CollectionStatus {
  const remaining = roundMoney(totalAmount - amountPaid);
  if (remaining <= 0) return "Paid";
  if (dueDate < asOf) return "Overdue";
  if (amountPaid > 0) return "Partial";
  return "Unpaid";
}

export function deriveDaysOverdue(
  dueDate: string,
  remainingBalance: number,
  asOf: string = todayIsoDate(),
): number {
  if (remainingBalance <= 0) return 0;
  if (dueDate >= asOf) return 0;
  const due = new Date(`${dueDate}T00:00:00`);
  const current = new Date(`${asOf}T00:00:00`);
  const diff = Math.floor((current.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export function latestValidCollection(
  collections: ReceivableCollection[],
): ReceivableCollection | undefined {
  return [...validCollections(collections)].sort((a, b) => {
    const byDate = b.collectionDate.localeCompare(a.collectionDate);
    if (byDate !== 0) return byDate;
    return b.createdAt.localeCompare(a.createdAt);
  })[0];
}

export function toViewModel(
  record: ReceivableRecord,
  collections: ReceivableCollection[],
  asOf: string = todayIsoDate(),
): ReceivableViewModel {
  const related = collections.filter((c) => c.receivableId === record.id);
  const amountPaid = roundMoney(sumValidCollections(related));
  const remainingBalance = roundMoney(record.totalReceivableAmount - amountPaid);
  const collectionStatus = deriveCollectionStatus(
    record.totalReceivableAmount,
    amountPaid,
    record.dueDate,
    asOf,
  );
  const daysOverdue = deriveDaysOverdue(record.dueDate, remainingBalance, asOf);
  const latest = latestValidCollection(related);
  return {
    ...record,
    amountPaid,
    remainingBalance,
    collectionStatus,
    daysOverdue,
    displayPaymentMethod: latest?.paymentMethod ?? record.paymentMethod,
    displayPaymentReference:
      latest?.paymentReferenceNumber || record.referenceNumber,
    displayBankName: latest?.bankName ?? null,
    displayCheckNumber: latest?.checkNumber ?? null,
  };
}

export function enrichReceivables(
  records: ReceivableRecord[],
  collections: ReceivableCollection[],
  asOf: string = todayIsoDate(),
): ReceivableViewModel[] {
  return records.map((r) => toViewModel(r, collections, asOf));
}

export function emptyFormValues(
  defaults?: Partial<ReceivableFormValues>,
): ReceivableFormValues {
  return {
    customerId: "",
    invoiceNumber: "",
    clientId: "",
    customerName: "",
    contactNumber: "",
    emailAddress: "",
    billingAddress: "",
    transactionDate: "",
    invoiceDate: "",
    dueDate: "",
    description: "",
    referenceNumber: "",
    totalReceivableAmount: "",
    paymentMethod: "",
    collectionFollowUpDate: "",
    remarks: "",
    ...defaults,
  };
}

export function recordToFormValues(record: ReceivableRecord): ReceivableFormValues {
  return {
    customerId: String(record.customerId),
    invoiceNumber: record.invoiceNumber,
    clientId: record.clientId,
    customerName: record.customerName,
    contactNumber: record.contactNumber,
    emailAddress: record.emailAddress,
    billingAddress: record.billingAddress,
    transactionDate: record.transactionDate,
    invoiceDate: record.invoiceDate,
    dueDate: record.dueDate,
    description: record.description,
    referenceNumber: record.referenceNumber,
    totalReceivableAmount: String(record.totalReceivableAmount),
    paymentMethod: record.paymentMethod ?? "",
    collectionFollowUpDate: record.collectionFollowUpDate ?? "",
    remarks: record.remarks ?? "",
  };
}

function inRange(value: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

export function filterReceivables(
  records: ReceivableViewModel[],
  filters: ReceivableFilters,
  collections: ReceivableCollection[] = [],
): ReceivableViewModel[] {
  return records.filter((r) => {
    if (!filters.includeArchived && r.archivedAt) return false;

    const relatedRefs = collections
      .filter((c) => c.receivableId === r.id && !c.isReversal)
      .map((c) => c.paymentReferenceNumber)
      .join(" ");

    const q = filters.search.trim().toLowerCase();
    if (
      q &&
      !`${r.invoiceNumber} ${r.customerName} ${r.clientId} ${r.contactNumber} ${r.referenceNumber} ${r.displayPaymentReference} ${relatedRefs}`
        .toLowerCase()
        .includes(q)
    ) {
      return false;
    }

    if (
      filters.invoiceNumber.trim() &&
      !r.invoiceNumber.toLowerCase().includes(filters.invoiceNumber.trim().toLowerCase())
    ) {
      return false;
    }
    if (
      filters.customerName.trim() &&
      !r.customerName.toLowerCase().includes(filters.customerName.trim().toLowerCase())
    ) {
      return false;
    }
    if (
      filters.clientId.trim() &&
      !r.clientId.toLowerCase().includes(filters.clientId.trim().toLowerCase())
    ) {
      return false;
    }
    if (
      filters.contactNumber.trim() &&
      !r.contactNumber.toLowerCase().includes(filters.contactNumber.trim().toLowerCase())
    ) {
      return false;
    }
    if (
      filters.referenceNumber.trim() &&
      !r.referenceNumber
        .toLowerCase()
        .includes(filters.referenceNumber.trim().toLowerCase())
    ) {
      return false;
    }
    if (filters.paymentReferenceNumber.trim()) {
      const needle = filters.paymentReferenceNumber.trim().toLowerCase();
      const match =
        r.displayPaymentReference.toLowerCase().includes(needle) ||
        relatedRefs.toLowerCase().includes(needle);
      if (!match) return false;
    }

    if (filters.customerId !== "All" && r.customerId !== filters.customerId) return false;
    if (
      filters.collectionStatus !== "All" &&
      r.collectionStatus !== filters.collectionStatus
    ) {
      return false;
    }
    if (
      filters.paymentMethod !== "All" &&
      r.displayPaymentMethod !== filters.paymentMethod
    ) {
      return false;
    }
    if (
      filters.bankName.trim() &&
      !(r.displayBankName ?? "")
        .toLowerCase()
        .includes(filters.bankName.trim().toLowerCase())
    ) {
      return false;
    }
    if (filters.preparedById !== "All" && r.preparedById !== filters.preparedById) {
      return false;
    }

    if (!inRange(r.invoiceDate, filters.invoiceDateFrom, filters.invoiceDateTo))
      return false;
    if (
      !inRange(r.transactionDate, filters.transactionDateFrom, filters.transactionDateTo)
    ) {
      return false;
    }
    if (!inRange(r.dueDate, filters.dueDateFrom, filters.dueDateTo)) return false;
    if (
      !inRange(
        r.collectionFollowUpDate,
        filters.followUpDateFrom,
        filters.followUpDateTo,
      )
    ) {
      return false;
    }

    return true;
  });
}

export function sortReceivables(
  records: ReceivableViewModel[],
  sort: ReceivableSort,
): ReceivableViewModel[] {
  const copy = [...records];
  copy.sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    const aVal = av ?? "";
    const bVal = bv ?? "";
    let cmp = 0;
    if (typeof aVal === "number" && typeof bVal === "number") cmp = aVal - bVal;
    else cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
    return sort.direction === "asc" ? cmp : -cmp;
  });
  return copy;
}

export function summarizeReceivables(
  records: ReceivableViewModel[],
  asOf: string = todayIsoDate(),
): ReceivableSummary {
  const active = records.filter((r) => !r.archivedAt);
  const overdueRows = active.filter((r) => r.collectionStatus === "Overdue");

  return {
    totalReceivables: active.length,
    totalAmountCollected: roundMoney(active.reduce((s, r) => s + r.amountPaid, 0)),
    totalOutstandingBalance: roundMoney(
      active.reduce((s, r) => s + r.remainingBalance, 0),
    ),
    unpaid: active.filter((r) => r.collectionStatus === "Unpaid").length,
    partial: active.filter((r) => r.collectionStatus === "Partial").length,
    paid: active.filter((r) => r.collectionStatus === "Paid").length,
    overdue: overdueRows.length,
    totalOverdueAmount: roundMoney(
      overdueRows.reduce((s, r) => s + r.remainingBalance, 0),
    ),
    upcomingFollowUps: active.filter(
      (r) =>
        r.collectionFollowUpDate &&
        r.collectionFollowUpDate >= asOf &&
        r.remainingBalance > 0,
    ).length,
    overdueFollowUps: active.filter(
      (r) =>
        r.collectionFollowUpDate &&
        r.collectionFollowUpDate < asOf &&
        r.remainingBalance > 0,
    ).length,
  };
}

export function downloadCsv(
  filename: string,
  rows: Record<string, string | number>[],
): void {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(","),
    ...rows.map((row) =>
      keys.map((key) => `"${String(row[key] ?? "").split('"').join('""')}"`).join(","),
    ),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function paymentMethodLabel(method: PaymentMethod | null | undefined): string {
  return method ?? "—";
}

export function methodNeedsBank(method: PaymentMethod | ""): boolean {
  return method === "Check" || method === "Bank Transfer";
}

export function methodNeedsCheck(method: PaymentMethod | ""): boolean {
  return method === "Check";
}
