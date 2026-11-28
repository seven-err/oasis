import { inRange, sortRecords } from "../../components/moduleUtils.ts";
import type {
  CheckFilters,
  CheckRecord,
  CheckSort,
  CheckSummary,
  CheckFormValues,
} from "./types";

export {
  downloadCsv,
  formatDate,
  formatDateTime,
  isValidIsoDate,
  nowIso,
  peso,
  uid,
} from "../../components/moduleUtils.ts";

export function checkTypeLabel(value: string): string {
  return value.replace("Check", "Cheque");
}

export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\s+/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
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

export function filterChecks(records: CheckRecord[], filters: CheckFilters): CheckRecord[] {
  return records.filter((r) => {
    if (!filters.includeArchived && r.archivedAt) return false;

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
  return sortRecords(records, sort);
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

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function checkStatusLabel(value: string): string {
  return value === "Bounced" ? "Returned" : value;
}
