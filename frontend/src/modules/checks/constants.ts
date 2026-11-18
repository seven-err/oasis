import type { CheckFilters, CheckStatus, CheckType, OasisUser } from "./types";

export const CHECK_TYPES: CheckType[] = ["Received Check", "Issued Check"];

export const CHECK_STATUSES: CheckStatus[] = [
  "Pending",
  "Received",
  "Issued",
  "For Deposit",
  "Deposited",
  "For Clearing",
  "Cleared",
  "Bounced",
  "Cancelled",
  "Voided",
];

/** Provisional transitions — confirm final rules with OASIS management. */
export const RECEIVED_STATUS_FLOW: CheckStatus[] = [
  "Pending",
  "Received",
  "For Deposit",
  "Deposited",
  "For Clearing",
  "Cleared",
];

export const ISSUED_STATUS_FLOW: CheckStatus[] = [
  "Pending",
  "Issued",
  "For Clearing",
  "Cleared",
];

export const TERMINAL_STATUSES: CheckStatus[] = ["Bounced", "Cancelled", "Voided"];

export const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const ALLOWED_ATTACHMENT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"] as const;

/** 5 MB max per file */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const CHECKS_STORAGE_KEY = "oasis.checks.v1";
export const CHECK_ATTACHMENTS_STORAGE_KEY = "oasis.check-attachments.v1";
export const CHECK_ACTIVITY_STORAGE_KEY = "oasis.check-activity.v1";

export const CURRENT_USER: OasisUser = {
  id: 1,
  name: "Miguel Alvarina",
  email: "m.alvarina@oasis.org",
  role: "Administrator",
  permissions: {
    viewAccountNumber: true,
    manageAttachments: true,
    archiveChecks: true,
    exportReports: true,
    editChecks: true,
  },
};

export const EMPTY_FILTERS: CheckFilters = {
  search: "",
  checkType: "All",
  bankName: "",
  checkStatus: "All",
  checkDateFrom: "",
  checkDateTo: "",
  dueDateFrom: "",
  dueDateTo: "",
  receivedIssuedFrom: "",
  receivedIssuedTo: "",
  depositDateFrom: "",
  depositDateTo: "",
  clearingDateFrom: "",
  clearingDateTo: "",
  includeArchived: false,
};

export const PAGE_SIZE = 10;
