import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  PAYMENT_METHODS,
} from "./constants";
import type {
  CollectionFormValues,
  Customer,
  CustomerFormValues,
  FollowUpFormValues,
  PaymentMethod,
  ReceivableCollection,
  ReceivableFormValues,
  ReceivableRecord,
  ValidationResult,
} from "./types";
import {
  isValidIsoDate,
  methodNeedsBank,
  methodNeedsCheck,
  roundMoney,
  sumValidCollections,
  validCollections,
} from "./utils";

export function validateCustomerPayload(
  values: CustomerFormValues,
  options: { existing: Customer[]; editingId?: number },
): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  const clientId = values.clientId.trim();
  if (!clientId) errors.clientId = "Client ID is required.";
  else if (clientId.length > 64) errors.clientId = "Client ID must be 64 characters or fewer.";

  if (!values.customerName.trim()) errors.customerName = "Customer name is required.";
  else if (values.customerName.trim().length > 255)
    errors.customerName = "Customer name must be 255 characters or fewer.";

  if (!values.contactNumber.trim()) errors.contactNumber = "Contact number is required.";
  if (!values.emailAddress.trim()) errors.emailAddress = "Email address is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.emailAddress.trim()))
    errors.emailAddress = "Enter a valid email address.";

  if (!values.billingAddress.trim()) errors.billingAddress = "Billing address is required.";

  if (clientId) {
    const duplicate = options.existing.find(
      (c) =>
        c.id !== options.editingId &&
        !c.archivedAt &&
        c.clientId.toLowerCase() === clientId.toLowerCase(),
    );
    if (duplicate) {
      errors.clientId = "An active customer with this Client ID already exists.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateReceivablePayload(
  values: ReceivableFormValues,
  options: {
    existing: ReceivableRecord[];
    customers: Customer[];
    editingId?: number;
  },
): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  const customerId = Number(values.customerId);
  if (!values.customerId || Number.isNaN(customerId)) {
    errors.customerId = "Select an existing customer.";
  } else {
    const customer = options.customers.find((c) => c.id === customerId && !c.archivedAt);
    if (!customer) errors.customerId = "Select a valid active customer.";
  }

  const invoice = values.invoiceNumber.trim();
  if (!invoice) errors.invoiceNumber = "Invoice number is required.";
  else if (invoice.length > 64)
    errors.invoiceNumber = "Invoice number must be 64 characters or fewer.";

  if (!values.clientId.trim()) errors.clientId = "Client ID is required.";
  if (!values.customerName.trim()) errors.customerName = "Customer name is required.";
  if (!values.contactNumber.trim()) errors.contactNumber = "Contact number is required.";
  if (!values.emailAddress.trim()) errors.emailAddress = "Email address is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.emailAddress.trim()))
    errors.emailAddress = "Enter a valid email address.";
  if (!values.billingAddress.trim()) errors.billingAddress = "Billing address is required.";

  if (!values.transactionDate || !isValidIsoDate(values.transactionDate)) {
    errors.transactionDate = "Enter a valid transaction date.";
  }
  if (!values.invoiceDate || !isValidIsoDate(values.invoiceDate)) {
    errors.invoiceDate = "Enter a valid invoice date.";
  }
  if (!values.dueDate || !isValidIsoDate(values.dueDate)) {
    errors.dueDate = "Enter a valid due date.";
  }
  if (
    values.invoiceDate &&
    values.dueDate &&
    isValidIsoDate(values.invoiceDate) &&
    isValidIsoDate(values.dueDate) &&
    values.dueDate < values.invoiceDate
  ) {
    errors.dueDate = "Due date cannot be earlier than the invoice date.";
  }

  if (!values.description.trim()) errors.description = "Description is required.";
  if (!values.referenceNumber.trim())
    errors.referenceNumber = "Reference number is required.";

  const amount = Number(values.totalReceivableAmount);
  if (!values.totalReceivableAmount || Number.isNaN(amount)) {
    errors.totalReceivableAmount = "Total receivable amount is required.";
  } else if (amount <= 0) {
    errors.totalReceivableAmount = "Total receivable amount must be greater than zero.";
  } else if (amount > 999_999_999.99) {
    errors.totalReceivableAmount = "Total receivable amount exceeds the allowed maximum.";
  }

  if (values.paymentMethod && !PAYMENT_METHODS.includes(values.paymentMethod as PaymentMethod)) {
    errors.paymentMethod = "Select a valid payment method.";
  }

  if (
    values.collectionFollowUpDate &&
    !isValidIsoDate(values.collectionFollowUpDate)
  ) {
    errors.collectionFollowUpDate = "Enter a valid follow-up date.";
  }

  if (invoice && !Number.isNaN(customerId)) {
    const duplicate = options.existing.find(
      (r) =>
        r.id !== options.editingId &&
        !r.archivedAt &&
        r.invoiceNumber.toLowerCase() === invoice.toLowerCase() &&
        r.customerId === customerId,
    );
    if (duplicate) {
      errors.invoiceNumber =
        "An active receivable with this invoice number already exists for this customer.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateCollectionPayload(
  values: CollectionFormValues,
  options: {
    receivable: ReceivableRecord;
    collections: ReceivableCollection[];
    checkExists?: (checkId: number) => boolean;
  },
): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (options.receivable.archivedAt) {
    errors.form = "Cannot record collections against an archived receivable.";
  }

  if (!values.collectionDate || !isValidIsoDate(values.collectionDate)) {
    errors.collectionDate = "Enter a valid collection date.";
  }

  const amount = Number(values.amountCollected);
  if (!values.amountCollected || Number.isNaN(amount)) {
    errors.amountCollected = "Collection amount is required.";
  } else if (amount <= 0) {
    errors.amountCollected = "Collection amount must be greater than zero.";
  } else {
    const paid = sumValidCollections(
      options.collections.filter((c) => c.receivableId === options.receivable.id),
    );
    const remaining = roundMoney(options.receivable.totalReceivableAmount - paid);
    if (roundMoney(amount) > remaining) {
      errors.amountCollected = `Amount cannot exceed the remaining balance (${remaining.toFixed(2)}).`;
    }
  }

  if (!values.paymentMethod || !PAYMENT_METHODS.includes(values.paymentMethod as PaymentMethod)) {
    errors.paymentMethod = "Select a valid payment method.";
  }

  if (!values.paymentReferenceNumber.trim()) {
    errors.paymentReferenceNumber = "Payment reference number is required.";
  }

  const method = values.paymentMethod as PaymentMethod | "";
  if (methodNeedsBank(method) && !values.bankName.trim()) {
    errors.bankName = "Bank name is required for this payment method.";
  }

  if (methodNeedsCheck(method)) {
    if (!values.checkNumber.trim() && !values.checkId) {
      errors.checkNumber =
        "Enter a check number or link an existing Check Monitoring record.";
    }
    if (values.checkId) {
      const checkId = Number(values.checkId);
      if (Number.isNaN(checkId)) {
        errors.checkId = "Select a valid check record.";
      } else if (options.checkExists && !options.checkExists(checkId)) {
        errors.checkId = "Selected check record was not found.";
      }
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateFollowUpPayload(values: FollowUpFormValues): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (!values.followUpDate || !isValidIsoDate(values.followUpDate)) {
    errors.followUpDate = "Enter a valid follow-up date.";
  }
  if (!values.followUpNotes.trim()) {
    errors.followUpNotes = "Follow-up notes are required.";
  }
  if (values.nextFollowUpDate && !isValidIsoDate(values.nextFollowUpDate)) {
    errors.nextFollowUpDate = "Enter a valid next follow-up date.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateAttachmentFile(file: File): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  if (!(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    errors.file = "Allowed file types: PDF, JPEG, PNG, WebP, GIF.";
  }
  if (file.size <= 0) errors.file = "File is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) {
    errors.file = "File size must be 5 MB or less.";
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function canReverseCollection(
  collection: ReceivableCollection,
  allCollections: ReceivableCollection[],
): { ok: boolean; message?: string } {
  if (collection.isReversal) {
    return { ok: false, message: "Reversal entries cannot be reversed again." };
  }
  if (collection.reversedAt) {
    return { ok: false, message: "This collection has already been reversed." };
  }
  const already = allCollections.some(
    (c) =>
      c.isReversal && c.reversesCollectionId === collection.id && !c.reversedAt,
  );
  if (already) {
    return { ok: false, message: "This collection has already been reversed." };
  }
  return { ok: true };
}

export function remainingBalanceFor(
  receivable: ReceivableRecord,
  collections: ReceivableCollection[],
): number {
  return roundMoney(
    receivable.totalReceivableAmount -
      sumValidCollections(
        validCollections(collections).filter((c) => c.receivableId === receivable.id),
      ),
  );
}
