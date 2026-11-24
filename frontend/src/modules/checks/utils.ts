import type {
  CheckFilters,
  CheckRecord,
  CheckSort,
  CheckSummary,
  CheckFormValues,
} from "./types";

export const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

export function checkTypeLabel(value: string): string {
  return value.replace("Check", "Cheque");
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "\u2014";
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

export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\s+/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function emptyFormValues(preparedDefaults?: Partial<CheckFormValues>): CheckFormValues {
  return {
    checkNumber: "",
    checkType: "",
    checkDate: "",
    dateReceivedIssued: "",
    payeeName: "",
    drawerName: "",
    bankName: "",
    branch: "",
    accountNumber: "",
    checkAmount: "",
    purpose: "",
    referenceNumber: "",
    dueDate: "",
    depositDate: "",
    clearingDate: "",
    checkStatus: "",
    remarks: "",
    ...preparedDefaults,
  };
}

export function recordToFormValues(record: CheckRecord): CheckFormValues {
  return {
    checkNumber: record.checkNumber,
    checkType: record.checkType,
    checkDate: record.checkDate,
    dateReceivedIssued: record.dateReceivedIssued,
    payeeName: record.payeeName,
    drawerName: record.drawerName,
    bankName: record.bankName,
    branch: record.branch,
    accountNumber: record.accountNumber,
    checkAmount: String(record.checkAmount),
    purpose: record.purpose,
    referenceNumber: record.referenceNumber,
    dueDate: record.dueDate ?? "",
    depositDate: record.depositDate ?? "",
    clearingDate: record.clearingDate ?? "",
    checkStatus: record.checkStatus,
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

export function filterChecks(records: CheckRecord[], filters: CheckFilters): CheckRecord[] {
  return records.filter((r) => {
    if (!filters.includeArchived && r.archivedAt) return false;
    if (filters.includeArchived === false && r.archivedAt) return false;

    const q = filters.search.trim().toLowerCase();
    if (
      q &&
      !`${r.checkNumber} ${r.payeeName} ${r.drawerName} ${r.referenceNumber} ${r.bankName} ${r.purpose} ${r.preparedByName}`
        .toLowerCase()
        .includes(q)
    ) {
      return false;
    }

    if (filters.checkType !== "All" && r.checkType !== filters.checkType) return false;
    if (filters.bankName && r.bankName !== filters.bankName) return false;
    if (filters.checkStatus !== "All" && r.checkStatus !== filters.checkStatus) return false;

    if (!inRange(r.checkDate, filters.checkDateFrom, filters.checkDateTo)) return false;
    if (!inRange(r.dueDate, filters.dueDateFrom, filters.dueDateTo)) return false;
    if (!inRange(r.dateReceivedIssued, filters.receivedIssuedFrom, filters.receivedIssuedTo))
      return false;
    if (!inRange(r.depositDate, filters.depositDateFrom, filters.depositDateTo)) return false;
    if (!inRange(r.clearingDate, filters.clearingDateFrom, filters.clearingDateTo)) return false;

    return true;
  });
}

export function sortChecks(records: CheckRecord[], sort: CheckSort): CheckRecord[] {
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

export function summarizeChecks(records: CheckRecord[]): CheckSummary {
  const active = records.filter((r) => !r.archivedAt);
  return {
    total: active.length,
    received: active.filter((r) => r.checkType === "Received Check").length,
    issued: active.filter((r) => r.checkType === "Issued Check").length,
    pending: active.filter((r) => r.checkStatus === "Pending").length,
    forDeposit: active.filter((r) => r.checkStatus === "For Deposit").length,
    deposited: active.filter((r) => r.checkStatus === "Deposited").length,
    forClearing: active.filter((r) => r.checkStatus === "For Clearing").length,
    cleared: active.filter((r) => r.checkStatus === "Cleared").length,
    bounced: active.filter((r) => r.checkStatus === "Bounced").length,
    cancelledOrVoided: active.filter(
      (r) => r.checkStatus === "Cancelled" || r.checkStatus === "Voided",
    ).length,
  };
}

export function uniqueBanks(records: CheckRecord[]): string[] {
  return [...new Set(records.map((r) => r.bankName))].sort((a, b) => a.localeCompare(b));
}

export function downloadCsv(filename: string, rows: Record<string, string | number>[]): void {
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

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function checkStatusLabel(value: string): string {
  return value === "Bounced" ? "Returned" : value;
}
