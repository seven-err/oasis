import {
  inRange,
  isValidIsoDate,
  roundMoney,
  sortRecords,
  todayIsoDate,
} from "@/components/moduleUtils";
import type {
  PayableFilters,
  PayablePayment,
  PayableRecord,
  PayableSort,
  PayableSummary,
  PayableViewModel,
  PaymentStatus,
  PayableFormValues,
} from "./types";

export {
  downloadCsv,
  formatDate,
  formatDateTime,
  isValidIsoDate,
  nowIso,
  paymentMethodLabel,
  peso,
  roundMoney,
  todayIsoDate,
  uid,
} from "@/components/moduleUtils";

export function paymentTermsLabel(invoiceDate: string, dueDate: string): string {
  if (!isValidIsoDate(invoiceDate) || !isValidIsoDate(dueDate) || dueDate < invoiceDate) return "";
  const days = (Date.parse(dueDate) - Date.parse(invoiceDate)) / 86_400_000;
  return `${days} ${days === 1 ? "day" : "days"}`;
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
  return sortRecords(records, sort);
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
