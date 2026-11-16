export type CheckType = "Received Check" | "Issued Check";

export type CheckStatus =
  | "Pending"
  | "Received"
  | "Issued"
  | "For Deposit"
  | "Deposited"
  | "For Clearing"
  | "Cleared"
  | "Bounced"
  | "Cancelled"
  | "Voided";

export type AttachmentKind = "scanned_check" | "pdf_copy" | "supporting" | "other";

export type AuditAction =
  | "created"
  | "updated"
  | "status_changed"
  | "attachment_uploaded"
  | "attachment_replaced"
  | "attachment_deleted"
  | "archived"
  | "restored"
  | "account_revealed";

export type OasisUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: {
    viewAccountNumber: boolean;
    manageAttachments: boolean;
    archiveChecks: boolean;
    exportReports: boolean;
    editChecks: boolean;
  };
};

export type CheckAttachment = {
  id: string;
  checkId: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  /** Private blob URL / object key — never a public CDN path */
  storageKey: string;
  /** Data URL kept in-session for authorized preview only */
  previewDataUrl?: string;
  uploadedById: number;
  uploadedByName: string;
  uploadedAt: string;
  deletedAt?: string | null;
};

export type CheckActivity = {
  id: string;
  checkId: number;
  action: AuditAction;
  summary: string;
  previousStatus?: CheckStatus | null;
  newStatus?: CheckStatus | null;
  performedById: number;
  performedByName: string;
  performedAt: string;
  /** Never store full account numbers here */
  metadata?: Record<string, string | number | boolean | null>;
};

export type CheckRecord = {
  id: number;
  checkNumber: string;
  checkType: CheckType;
  checkDate: string;
  dateReceivedIssued: string;
  payeeName: string;
  drawerName: string;
  bankName: string;
  branch: string;
  /** Sensitive — masked in UI/reports unless authorized */
  accountNumber: string;
  checkAmount: number;
  purpose: string;
  referenceNumber: string;
  dueDate: string | null;
  depositDate: string | null;
  clearingDate: string | null;
  checkStatus: CheckStatus;
  remarks: string | null;
  preparedById: number;
  preparedByName: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  createdById: number;
  updatedById: number;
};

export type CheckFormValues = {
  checkNumber: string;
  checkType: CheckType | "";
  checkDate: string;
  dateReceivedIssued: string;
  payeeName: string;
  drawerName: string;
  bankName: string;
  branch: string;
  accountNumber: string;
  checkAmount: string;
  purpose: string;
  referenceNumber: string;
  dueDate: string;
  depositDate: string;
  clearingDate: string;
  checkStatus: CheckStatus | "";
  remarks: string;
};

export type CheckFilters = {
  search: string;
  checkType: CheckType | "All";
  bankName: string;
  checkStatus: CheckStatus | "All";
  checkDateFrom: string;
  checkDateTo: string;
  dueDateFrom: string;
  dueDateTo: string;
  receivedIssuedFrom: string;
  receivedIssuedTo: string;
  depositDateFrom: string;
  depositDateTo: string;
  clearingDateFrom: string;
  clearingDateTo: string;
  includeArchived: boolean;
};

export type CheckSortKey =
  | "checkNumber"
  | "checkType"
  | "checkDate"
  | "dateReceivedIssued"
  | "payeeName"
  | "drawerName"
  | "bankName"
  | "checkAmount"
  | "dueDate"
  | "depositDate"
  | "clearingDate"
  | "checkStatus"
  | "preparedByName";

export type CheckSort = {
  key: CheckSortKey;
  direction: "asc" | "desc";
};

export type CheckSummary = {
  total: number;
  received: number;
  issued: number;
  pending: number;
  forDeposit: number;
  deposited: number;
  forClearing: number;
  cleared: number;
  bounced: number;
  cancelledOrVoided: number;
};

export type CheckReportKind =
  | "complete_register"
  | "received"
  | "issued"
  | "pending"
  | "deposited"
  | "cleared"
  | "bounced"
  | "by_bank"
  | "by_date_range"
  | "by_payee"
  | "by_drawer"
  | "by_prepared_by";

export type ValidationResult = {
  ok: boolean;
  errors: Partial<Record<keyof CheckFormValues | "attachments" | "form", string>>;
};

export type CheckView =
  | { mode: "register" }
  | { mode: "create" }
  | { mode: "edit"; id: number }
  | { mode: "details"; id: number }
  | { mode: "reports" };
