import { APPROVAL_STATUSES, PAYMENT_METHODS } from "./constants";
import type {
  PayableFormValues,
  PayablePayment,
  PayableRecord,
  PaymentFormValues,
  PaymentMethod,
  ValidationResult,
} from "./types";
import { isValidIsoDate, payableItemsTotal, roundMoney, sumValidPayments, validPayments } from "./utils";

export function validatePayablePayload(
  values: PayableFormValues,
  options: {
    existing: PayableRecord[];
    editingId?: number;
  },
): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (values.paymentStatus !== "Paid" && values.paymentStatus !== "Unpaid") {
    errors.paymentStatus = "Select Paid or Unpaid.";
  }

  if (!values.payeeName.trim()) errors.payeeName = "Payee name is required.";
  else if (values.payeeName.trim().length > 255)
    errors.payeeName = "Payee name must be 255 characters or fewer.";

  const invoice = values.invoiceNumber.trim();
  if (!invoice) errors.invoiceNumber = "Invoice number is required.";
  else if (invoice.length > 64)
    errors.invoiceNumber = "Invoice number must be 64 characters or fewer.";

  if (!values.items.length) errors.items = "Add at least one item.";
  for (const [index, item] of values.items.entries()) {
    if (!item.description.trim() || item.description.trim().length > 255) {
      errors.items = `Item ${index + 1}: enter a description of 255 characters or fewer.`;
      break;
    }
    const quantity = Number(item.quantity);
    const price = Number(item.price);
    if (!item.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      errors.items = `Item ${index + 1}: quantity must be greater than zero.`;
      break;
    }
    if (!item.price.trim() || !Number.isFinite(price) || price < 0 || roundMoney(price) !== price) {
      errors.items = `Item ${index + 1}: enter a non-negative price with at most two decimal places.`;
      break;
    }
  }

  if (!values.invoiceDate || !isValidIsoDate(values.invoiceDate)) {
    errors.invoiceDate = "Enter a valid invoice date.";
  }
  if (values.paymentStatus === "Unpaid") {
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
  }

  const amount = payableItemsTotal(values.items);
  if (!Number.isFinite(amount)) {
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

  if (values.paymentMethod === "Check" && values.checkId) {
    const checkId = Number(values.checkId);
    if (!Number.isInteger(checkId) || checkId <= 0) {
      errors.checkId = "Select a valid cheque record.";
    } else if (options.checkExists && !options.checkExists(checkId)) {
      errors.checkId = "Selected cheque record was not found.";
    }
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
