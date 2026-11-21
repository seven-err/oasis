import { moduleUser } from "../../auth";
import type {
  AttachmentKind,
  CollectionStatus,
  OasisReceivableUser,
  PaymentMethod,
  ReceivableFilters,
} from "./types";

export const COLLECTION_STATUSES: CollectionStatus[] = [
  "Pending",
  "Unpaid",
  "Partial",
  "Paid",
  "Overdue",
  "Cancelled",
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  "Cash",
  "Check",
  "Bank Transfer",
  "E-Wallet",
];

export const ATTACHMENT_KINDS: { value: AttachmentKind; label: string }[] = [
  { value: "invoice_copy", label: "Invoice copy" },
  { value: "official_receipt", label: "Official receipt" },
  { value: "deposit_slip", label: "Deposit slip" },
  { value: "bank_transfer", label: "Bank transfer confirmation" },
  { value: "check_image", label: "Check image" },
  { value: "other", label: "Other supporting document" },
];

export { ATTACHMENT_TYPES as ALLOWED_ATTACHMENT_TYPES } from "@/components/attachmentFileTypes";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

export const RECEIVABLES_STORAGE_KEY = "oasis.receivables.v1";
export const RECEIVABLE_COLLECTIONS_STORAGE_KEY = "oasis.receivable-collections.v1";
export const RECEIVABLE_CUSTOMERS_STORAGE_KEY = "oasis.receivable-customers.v1";
export const RECEIVABLE_FOLLOWUPS_STORAGE_KEY = "oasis.receivable-followups.v1";
export const RECEIVABLE_ATTACHMENTS_STORAGE_KEY = "oasis.receivable-attachments.v1";
export const RECEIVABLE_ACTIVITY_STORAGE_KEY = "oasis.receivable-activity.v1";

export const CURRENT_USER: OasisReceivableUser = moduleUser("receivables", ["editReceivables","manageCustomers","recordCollections","reverseCollections","manageFollowUps","manageAttachments","archiveReceivables","exportReports"]);

export const EMPTY_FILTERS: ReceivableFilters = {
  search: "",
  invoiceNumber: "",
  customerName: "",
  clientId: "",
  contactNumber: "",
  referenceNumber: "",
  paymentReferenceNumber: "",
  customerId: "All",
  invoiceDateFrom: "",
  invoiceDateTo: "",
  dueDateFrom: "",
  dueDateTo: "",
  collectionStatus: "All",
  paymentMethod: "All",
  bankName: "",
  followUpDateFrom: "",
  followUpDateTo: "",
  preparedById: "All",
  includeArchived: false,
};

export const PAGE_SIZE = 10;
