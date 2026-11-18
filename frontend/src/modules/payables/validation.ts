import { APPROVAL_STATUSES, PAYMENT_METHODS } from "./constants";
import type {
  PayableCategory,
  PayableFormValues,
  PayablePayment,
  PayableRecord,
  PaymentFormValues,
  PaymentMethod,
  ValidationResult,
} from "./types";
import { isValidIsoDate, roundMoney, sumValidPayments, validPayments } from "./utils";

export function validatePayablePayload(
  values: PayableFormValues,
  options: {
    existing: PayableRecord[];
    categories: PayableCategory[];
    editingId?: number;
  },
): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (!values.payeeName.trim()) errors.payeeName = "Payee name is required.";
  else if (values.payeeName.trim().length > 255)
    errors.payeeName = "Payee name must be 255 characters or fewer.";

  const invoice = values.invoiceNumber.trim();
  if (!invoice) errors.invoiceNumber = "Invoice number is required.";
  else if (invoice.length > 64)
    errors.invoiceNumber = "Invoice number must be 64 characters or fewer.";

  if (!values.description.trim()) errors.description = "Description is required.";

  const categoryId = Number(values.categoryId);
  if (!values.categoryId || Number.isNaN(categoryId)) {
    errors.categoryId = "Select a category.";
  } else {
    const cat = options.categories.find((c) => c.id === categoryId && c.isActive);
    if (!cat) errors.categoryId = "Select a valid active category.";
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

  const amount = Number(values.totalAmount);
  if (!values.totalAmount || Number.isNaN(amount)) {
    errors.totalAmount = "Total amount is required.";
  } else if (amount <= 0) {
    errors.totalAmount = "Total amount must be greater than zero.";
  } else if (amount > 999_999_999.99) {
    errors.totalAmount = "Total amount exceeds the allowed maximum.";
  }

  if (values.paymentMethod && !PAYMENT_METHODS.includes(values.paymentMethod as PaymentMethod)) {
    errors.paymentMethod = "Select a valid payment method.";
  }

  if (invoice) {
    const duplicate = options.existing.find(
      (r) =>
        r.id !== options.editingId &&
        !r.archivedAt &&
        r.invoiceNumber.toLowerCase() === invoice.toLowerCase() &&
        r.payeeName.trim().toLowerCase() === values.payeeName.trim().toLowerCase(),
    );
    if (duplicate) {
      errors.invoiceNumber =
        "An active payable with this invoice number already exists for this payee.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validatePaymentPayload(
  values: PaymentFormValues,
  options: {
    payable: PayableRecord;
    payments: PayablePayment[];
    checkExists?: (checkId: number) => boolean;
  },
): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (options.payable.approvalStatus !== "Approved") {
    errors.form =
      "Payments can only be recorded against approved payables under the normal workflow.";
  }

  if (options.payable.archivedAt) {
    errors.form = "Cannot record payments against an archived payable.";
  }

  if (!values.paymentDate || !isValidIsoDate(values.paymentDate)) {
    errors.paymentDate = "Enter a valid payment date.";
  }

  const amount = Number(values.amountPaid);
  if (!values.amountPaid || Number.isNaN(amount)) {
    errors.amountPaid = "Payment amount is required.";
  } else if (amount <= 0) {
    errors.amountPaid = "Payment amount must be greater than zero.";
  } else {
    const paid = sumValidPayments(
      options.payments.filter((p) => p.payableId === options.payable.id),
    );
    const remaining = roundMoney(options.payable.totalAmount - paid);
    if (roundMoney(amount) > remaining) {
      errors.amountPaid = `Amount cannot exceed the remaining balance (${remaining.toFixed(2)}).`;
    }
  }

  if (!values.paymentMethod || !PAYMENT_METHODS.includes(values.paymentMethod as PaymentMethod)) {
    errors.paymentMethod = "Select a valid payment method.";
  }

  if (!values.referenceNumber.trim()) {
    errors.referenceNumber = "Reference number is required.";
  }

  if (values.paymentMethod === "Check") {
    const checkId = Number(values.checkId);
    if (!values.checkId || Number.isNaN(checkId)) {
      errors.checkId = "Link an existing OASIS check record for Check payments.";
    } else if (options.checkExists && !options.checkExists(checkId)) {
      errors.checkId = "Selected check record was not found.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateRejection(reason: string): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  if (!reason.trim()) {
    errors.rejectionReason = "A rejection reason is required.";
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function canReversePayment(
  payment: PayablePayment,
  allPayments: PayablePayment[],
): { ok: boolean; message?: string } {
  if (payment.isReversal) {
    return { ok: false, message: "Reversal entries cannot be reversed again." };
  }
  if (payment.reversedAt) {
    return { ok: false, message: "This payment has already been reversed." };
  }
  const already = allPayments.some(
    (p) => p.isReversal && p.reversesPaymentId === payment.id && !p.reversedAt,
  );
  if (already) {
    return { ok: false, message: "This payment has already been reversed." };
  }
  return { ok: true };
}

export function assertApprovalStatus(value: string): boolean {
  return (APPROVAL_STATUSES as string[]).includes(value);
}

export function remainingBalanceFor(
  payable: PayableRecord,
  payments: PayablePayment[],
): number {
  return roundMoney(
    payable.totalAmount -
      sumValidPayments(validPayments(payments).filter((p) => p.payableId === payable.id)),
  );
}
