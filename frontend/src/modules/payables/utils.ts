import type {
  PayableFilters,
  PayablePayment,
  PayableRecord,
  PayableSort,
  PayableSummary,
  PayableViewModel,
  PaymentMethod,
  PaymentStatus,
  PayableFormValues,
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

export function paymentTermsLabel(invoiceDate: string, dueDate: string): string {
  if (!isValidIsoDate(invoiceDate) || !isValidIsoDate(dueDate) || dueDate < invoiceDate) return "";
  const days = (Date.parse(dueDate) - Date.parse(invoiceDate)) / 86_400_000;
  return `${days} ${days === 1 ? "day" : "days"}`;
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

/** Valid payments: not a reversal entry and not reversed */
export function validPayments(payments: PayablePayment[]): PayablePayment[] {
  return payments.filter((p) => !p.isReversal && !p.reversedAt);
}

export function sumValidPayments(payments: PayablePayment[]): number {
  return validPayments(payments).reduce((sum, p) => sum + p.amountPaid, 0);
}

export function derivePaymentStatus(
  totalAmount: number,
  amountPaid: number,
  dueDate: string,
  asOf: string = todayIsoDate(),
): PaymentStatus {
  const remaining = roundMoney(totalAmount - amountPaid);
  if (remaining <= 0) return "Paid";
  if (dueDate && dueDate < asOf) return "Overdue";
  if (amountPaid > 0) return "Partial";
  return "Unpaid";
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function latestValidPayment(payments: PayablePayment[]): PayablePayment | undefined {
  return [...validPayments(payments)].sort((a, b) => {
    const byDate = b.paymentDate.localeCompare(a.paymentDate);
    if (byDate !== 0) return byDate;
    return b.createdAt.localeCompare(a.createdAt);
  })[0];
}

export function toViewModel(
  record: PayableRecord,
  payments: PayablePayment[],
  asOf: string = todayIsoDate(),
): PayableViewModel {
  const related = payments.filter((p) => p.payableId === record.id);
  const amountPaid = roundMoney(sumValidPayments(related));
  const remainingBalance = roundMoney(record.totalAmount - amountPaid);
  const paymentStatus = derivePaymentStatus(
    record.totalAmount,
    amountPaid,
    record.dueDate,
    asOf,
  );
  const latest = latestValidPayment(related);
  return {
    ...record,
    amountPaid,
    remainingBalance,
    paymentStatus,
    displayPaymentMethod: latest?.paymentMethod ?? record.paymentMethod,
    displayReferenceNumber: latest?.referenceNumber || record.referenceNumber,
  };
}

export function enrichPayables(
  records: PayableRecord[],
  payments: PayablePayment[],
  asOf: string = todayIsoDate(),
): PayableViewModel[] {
  return records.map((r) => toViewModel(r, payments, asOf));
}

export function payableItemAmount(item: { quantity: number | string; price: number | string }): number {
  return roundMoney(Number(item.quantity) * Number(item.price));
}

export function payableItemsTotal(items: { quantity: number | string; price: number | string }[]): number {
  return roundMoney(items.reduce((sum, item) => sum + payableItemAmount(item), 0));
}

export function payableItems(record: PayableRecord) {
  return record.items ?? [{ description: record.description, quantity: 1, price: record.totalAmount }];
}

export function emptyFormValues(
  defaults?: Partial<PayableFormValues>,
): PayableFormValues {
  return {
    paymentStatus: "Unpaid",
    payeeName: "",
    invoiceNumber: "",
    items: [{ description: "", quantity: "1", price: "" }],
    invoiceDate: "",
    dueDate: "",
    paymentMethod: "",
    referenceNumber: "",
    ...defaults,
  };
}

export function recordToFormValues(record: PayableRecord, payments: PayablePayment[] = []): PayableFormValues {
  return {
    paymentStatus: roundMoney(record.totalAmount - sumValidPayments(payments)) <= 0 ? "Paid" : "Unpaid",
    payeeName: record.payeeName,
    invoiceNumber: record.invoiceNumber,
    items: payableItems(record).map((item) => ({
      description: item.description, quantity: String(item.quantity), price: String(item.price),
    })),
    invoiceDate: record.invoiceDate,
    dueDate: record.dueDate,
    paymentMethod: record.paymentMethod ?? "",
    referenceNumber: record.referenceNumber ?? "",
  };
}

function inRange(value: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

export function filterPayables(
  records: PayableViewModel[],
  filters: PayableFilters,
): PayableViewModel[] {
  return records.filter((r) => {
    if (!filters.includeArchived && r.archivedAt) return false;

    const q = filters.search.trim().toLowerCase();
    if (
      q &&
      !`${r.payeeName} ${r.invoiceNumber} ${r.description} ${r.categoryName} ${r.referenceNumber} ${r.displayReferenceNumber}`
        .toLowerCase()
        .includes(q)
    ) {
      return false;
    }

    if (
      filters.payeeName.trim() &&
      !r.payeeName.toLowerCase().includes(filters.payeeName.trim().toLowerCase())
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
      filters.description.trim() &&
      !r.description.toLowerCase().includes(filters.description.trim().toLowerCase())
    ) {
      return false;
    }
    if (
      filters.referenceNumber.trim() &&
      !`${r.referenceNumber} ${r.displayReferenceNumber}`
        .toLowerCase()
        .includes(filters.referenceNumber.trim().toLowerCase())
    ) {
      return false;
    }

    if (filters.categoryId !== "All" && r.categoryId !== filters.categoryId) return false;
    if (filters.paymentStatus !== "All" && r.paymentStatus !== filters.paymentStatus)
      return false;
    if (
      filters.paymentMethod !== "All" &&
      r.displayPaymentMethod !== filters.paymentMethod
    ) {
      return false;
    }

    if (!inRange(r.invoiceDate, filters.invoiceDateFrom, filters.invoiceDateTo)) return false;
    if (!inRange(r.dueDate, filters.dueDateFrom, filters.dueDateTo)) return false;

    return true;
  });
}

export function sortPayables(
  records: PayableViewModel[],
  sort: PayableSort,
): PayableViewModel[] {
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

export function summarizePayables(records: PayableViewModel[]): PayableSummary {
  const active = records.filter((r) => !r.archivedAt);

  return {
    totalPayables: active.length,
    totalAmountDue: roundMoney(active.reduce((s, r) => s + r.totalAmount, 0)),
    totalAmountPaid: roundMoney(active.reduce((s, r) => s + r.amountPaid, 0)),
    totalRemainingBalance: roundMoney(
      active.reduce((s, r) => s + r.remainingBalance, 0),
    ),
    unpaid: active.filter((r) => r.paymentStatus === "Unpaid").length,
    partial: active.filter((r) => r.paymentStatus === "Partial").length,
    paid: active.filter((r) => r.paymentStatus === "Paid").length,
    overdue: active.filter((r) => r.paymentStatus === "Overdue").length,
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
  return method === "Check" ? "Cheque" : method ?? "—";
}
