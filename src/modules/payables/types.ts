export type PaymentStatus = "Unpaid" | "Partial" | "Paid" | "Overdue";

export type ApprovalStatus = "Pending" | "Approved" | "Rejected";

export type PaymentMethod = "Cash" | "Check" | "Bank Transfer" | "E-Wallet";

export type PayableAuditAction =
  | "created"
  | "updated"
  | "approved"
  | "rejected"
  | "payment_recorded"
  | "payment_reversed"
  | "archived"
  | "restored"
  | "category_managed";

export type OasisPayableUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: {
    editPayables: boolean;
    approvePayables: boolean;
    recordPayments: boolean;
    reversePayments: boolean;
    archivePayables: boolean;
    manageCategories: boolean;
    exportReports: boolean;
  };
};

export type PayableCategory = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PayablePayment = {
  id: string;
  payableId: number;
  paymentDate: string;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  checkId: number | null;
  checkNumber: string | null;
  remarks: string | null;
  recordedById: number;
  recordedByName: string;
  isReversal: boolean;
  reversesPaymentId: string | null;
  reversedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayableRecord = {
  id: number;
  payeeName: string;
  invoiceNumber: string;
  description: string;
  categoryId: number;
  categoryName: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  /** Expected / preferred method — optional; display may prefer latest payment */
  paymentMethod: PaymentMethod | null;
  referenceNumber: string;
  approvalStatus: ApprovalStatus;
  approvedById: number | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  createdById: number;
  createdByName: string;
  updatedById: number;
};

/** Payable with derived financial fields for UI */
export type PayableViewModel = PayableRecord & {
  amountPaid: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  displayPaymentMethod: PaymentMethod | null;
  displayReferenceNumber: string;
};

export type PayableFormValues = {
  payeeName: string;
  invoiceNumber: string;
  description: string;
  categoryId: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  paymentMethod: PaymentMethod | "";
  referenceNumber: string;
};

export type PaymentFormValues = {
  paymentDate: string;
  amountPaid: string;
  paymentMethod: PaymentMethod | "";
  referenceNumber: string;
  checkId: string;
  remarks: string;
};

export type PayableFilters = {
  search: string;
  payeeName: string;
  invoiceNumber: string;
  description: string;
  categoryId: number | "All";
  invoiceDateFrom: string;
  invoiceDateTo: string;
  dueDateFrom: string;
  dueDateTo: string;
  paymentStatus: PaymentStatus | "All";
  approvalStatus: ApprovalStatus | "All";
  paymentMethod: PaymentMethod | "All";
  referenceNumber: string;
  includeArchived: boolean;
};

export type PayableSortKey =
  | "payeeName"
  | "invoiceNumber"
  | "description"
  | "categoryName"
  | "invoiceDate"
  | "dueDate"
  | "totalAmount"
  | "amountPaid"
  | "remainingBalance"
  | "paymentStatus"
  | "approvalStatus"
  | "displayPaymentMethod"
  | "displayReferenceNumber";

export type PayableSort = {
  key: PayableSortKey;
  direction: "asc" | "desc";
};

export type PayableSummary = {
  totalPayables: number;
  totalAmountDue: number;
  totalAmountPaid: number;
  totalRemainingBalance: number;
  unpaid: number;
  partial: number;
  paid: number;
  overdue: number;
  pendingApproval: number;
  rejected: number;
};

export type PayableActivity = {
  id: string;
  payableId: number | null;
  action: PayableAuditAction;
  summary: string;
  previousApprovalStatus?: ApprovalStatus | null;
  newApprovalStatus?: ApprovalStatus | null;
  performedById: number;
  performedByName: string;
  performedAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type PayableReportKind =
  | "complete_register"
  | "unpaid"
  | "partial"
  | "paid"
  | "overdue"
  | "pending_approval"
  | "rejected"
  | "by_category"
  | "by_payee"
  | "payment_history"
  | "by_method"
  | "by_date_range";

export type ValidationResult = {
  ok: boolean;
  errors: Partial<
    Record<
      keyof PayableFormValues | keyof PaymentFormValues | "form" | "rejectionReason",
      string
    >
  >;
};

export type PayableView =
  | { mode: "register" }
  | { mode: "create" }
  | { mode: "edit"; id: number }
  | { mode: "details"; id: number; focus?: "payments" | "approve" | "payment-history" }
  | { mode: "reports" };
