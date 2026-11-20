import { moduleUser } from "../../auth";
import type {
  ApprovalStatus,
  OasisPayableUser,
  PayableFilters,
  PaymentMethod,
  PaymentStatus,
} from "./types";

export const PAYMENT_STATUSES: PaymentStatus[] = ["Unpaid", "Partial", "Paid", "Overdue"];

export const APPROVAL_STATUSES: ApprovalStatus[] = ["Pending", "Approved", "Rejected"];

export const PAYMENT_METHODS: PaymentMethod[] = [
  "Cash",
  "Check",
  "Bank Transfer",
  "E-Wallet",
];

export const DEFAULT_CATEGORY_NAMES = [
  "Utilities",
  "Supplies",
  "Services",
  "Office Expenses",
  "Transportation",
  "Maintenance",
  "Equipment",
  "Rent",
  "Other",
] as const;

export const PAYABLES_STORAGE_KEY = "oasis.payables.v1";
export const PAYABLE_PAYMENTS_STORAGE_KEY = "oasis.payable-payments.v1";
export const PAYABLE_CATEGORIES_STORAGE_KEY = "oasis.payable-categories.v1";
export const PAYABLE_ACTIVITY_STORAGE_KEY = "oasis.payable-activity.v1";

export const CURRENT_USER: OasisPayableUser = moduleUser("payables", ["editPayables","recordPayments","reversePayments","archivePayables","manageCategories","exportReports"]);

export const EMPTY_FILTERS: PayableFilters = {
  search: "",
  payeeName: "",
  invoiceNumber: "",
  description: "",
  categoryId: "All",
  invoiceDateFrom: "",
  invoiceDateTo: "",
  dueDateFrom: "",
  dueDateTo: "",
  paymentStatus: "All",
  paymentMethod: "All",
  referenceNumber: "",
  includeArchived: false,
};

export const PAGE_SIZE = 10;
