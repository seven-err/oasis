export type CollectionStatus =
  | "Pending"
  | "Unpaid"
  | "Partial"
  | "Paid"
  | "Overdue"
  | "Cancelled";

export type PaymentMethod = "Cash" | "Check" | "Bank Transfer" | "E-Wallet";

export type AttachmentKind =
  | "invoice_copy"
  | "official_receipt"
  | "deposit_slip"
  | "bank_transfer"
  | "check_image"
  | "other";

export type ReceivableAuditAction =
  | "created"
  | "updated"
  | "collection_recorded"
  | "collection_reversed"
  | "follow_up_recorded"
  | "attachment_uploaded"
  | "attachment_deleted"
  | "customer_created"
  | "customer_updated"
  | "archived"
  | "restored";

export type OasisReceivableUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: {
    editReceivables: boolean;
    manageCustomers: boolean;
    recordCollections: boolean;
    reverseCollections: boolean;
    manageFollowUps: boolean;
    manageAttachments: boolean;
    archiveReceivables: boolean;
    exportReports: boolean;
  };
};

export type Customer = {
  id: number;
  clientId: string;
  customerName: string;
  contactNumber: string;
  emailAddress: string;
  billingAddress: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type ReceivableCollection = {
  id: string;
  receivableId: number;
  collectionDate: string;
  amountCollected: number;
  paymentMethod: PaymentMethod;
  paymentReferenceNumber: string;
  bankName: string | null;
  checkNumber: string | null;
  checkId: number | null;
  remarks: string | null;
  recordedById: number;
  recordedByName: string;
  isReversal: boolean;
  reversesCollectionId: string | null;
  reversedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CollectionFollowUp = {
  id: string;
  receivableId: number;
  followUpDate: string;
  followUpNotes: string;
  followUpResult: string | null;
  nextFollowUpDate: string | null;
  followedUpById: number;
  followedUpByName: string;
  createdAt: string;
  updatedAt: string;
};

export type ReceivableAttachment = {
  id: string;
  receivableId: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  /** Private blob / object key — never a public CDN path */
  storageKey: string;
  /** In-session preview only for authorized users */
  previewDataUrl?: string;
  uploadedById: number;
  uploadedByName: string;
  uploadedAt: string;
  deletedAt?: string | null;
};

export type ReceivableRecord = {
  id: number;
  invoiceNumber: string;
  customerId: number;
  /** Snapshot fields preserved for historical accuracy */
  clientId: string;
  customerName: string;
  contactNumber: string;
  emailAddress: string;
  billingAddress: string;
  transactionDate: string;
  invoiceDate: string;
  dueDate: string;
  description: string;
  referenceNumber: string;
  totalReceivableAmount: number;
  /** Only explicit states are stored. Other statuses are derived from payments and due date. */
  collectionStatus?: "Pending" | "Cancelled";
  cancellationReason?: string;
  /** Expected / preferred method — optional; display may prefer latest collection */
  paymentMethod: PaymentMethod | null;
  collectionFollowUpDate: string | null;
  remarks: string | null;
  preparedById: number;
  preparedByName: string;
  updatedById: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt?: string | null;
};

/** Receivable with derived financial fields for UI */
export type ReceivableViewModel = Omit<ReceivableRecord, "collectionStatus"> & {
  amountPaid: number;
  remainingBalance: number;
  collectionStatus: CollectionStatus;
  daysOverdue: number;
  displayPaymentMethod: PaymentMethod | null;
  displayPaymentReference: string;
  displayBankName: string | null;
  displayCheckNumber: string | null;
};

export type ReceivableFormValues = {
  customerId: string;
  invoiceNumber: string;
  clientId: string;
  customerName: string;
  contactNumber: string;
  emailAddress: string;
  billingAddress: string;
  transactionDate: string;
  invoiceDate: string;
  dueDate: string;
  description: string;
  referenceNumber: string;
  totalReceivableAmount: string;
  paymentMethod: PaymentMethod | "";
  collectionFollowUpDate: string;
  remarks: string;
};

export type CustomerFormValues = {
  clientId: string;
  customerName: string;
  contactNumber: string;
  emailAddress: string;
  billingAddress: string;
};

export type CollectionFormValues = {
  collectionDate: string;
  amountCollected: string;
  paymentMethod: PaymentMethod | "";
  paymentReferenceNumber: string;
  bankName: string;
  checkNumber: string;
  checkId: string;
  remarks: string;
};

export type FollowUpFormValues = {
  followUpDate: string;
  followUpNotes: string;
  followUpResult: string;
  nextFollowUpDate: string;
};

export type ReceivableFilters = {
  search: string;
  invoiceNumber: string;
  customerName: string;
  clientId: string;
  contactNumber: string;
  referenceNumber: string;
  paymentReferenceNumber: string;
  customerId: number | "All";
  invoiceDateFrom: string;
  invoiceDateTo: string;
  transactionDateFrom: string;
  transactionDateTo: string;
  dueDateFrom: string;
  dueDateTo: string;
  collectionStatus: CollectionStatus | "All";
  paymentMethod: PaymentMethod | "All";
  bankName: string;
  followUpDateFrom: string;
  followUpDateTo: string;
  preparedById: number | "All";
  includeArchived: boolean;
};

export type ReceivableSortKey =
  | "invoiceNumber"
  | "customerName"
  | "clientId"
  | "transactionDate"
  | "invoiceDate"
  | "dueDate"
  | "totalReceivableAmount"
  | "amountPaid"
  | "remainingBalance"
  | "displayPaymentMethod"
  | "collectionStatus"
  | "daysOverdue"
  | "collectionFollowUpDate"
  | "preparedByName";

export type ReceivableSort = {
  key: ReceivableSortKey;
  direction: "asc" | "desc";
};

export type ReceivableSummary = {
  totalReceivables: number;
  totalAmountCollected: number;
  totalOutstandingBalance: number;
  unpaid: number;
  partial: number;
  paid: number;
  overdue: number;
  totalOverdueAmount: number;
  upcomingFollowUps: number;
  overdueFollowUps: number;
};

export type ReceivableActivity = {
  id: string;
  receivableId: number | null;
  action: ReceivableAuditAction;
  summary: string;
  performedById: number;
  performedByName: string;
  performedAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ReceivableReportKind =
  | "complete_register"
  | "unpaid"
  | "partial"
  | "paid"
  | "overdue"
  | "outstanding_balance"
  | "collections_by_date"
  | "collections_by_customer"
  | "collections_by_method"
  | "collections_by_bank"
  | "follow_up"
  | "by_prepared_by"
  | "by_date_range";

export type ValidationResult = {
  ok: boolean;
  errors: Partial<
    Record<
      | keyof ReceivableFormValues
      | keyof CustomerFormValues
      | keyof CollectionFormValues
      | keyof FollowUpFormValues
      | "form"
      | "file",
      string
    >
  >;
};

export type ReceivableView =
  | { mode: "register" }
  | { mode: "create" }
  | { mode: "edit"; id: number }
  | {
      mode: "details";
      id: number;
      focus?: "collections" | "followups" | "attachments";
    }
  | { mode: "reports" };
