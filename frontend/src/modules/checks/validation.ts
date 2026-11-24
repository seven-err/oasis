import { attachmentMimeType, ATTACHMENT_FORMATS } from "@/components/attachmentFileTypes";
import {
  CHECK_STATUSES,
  CHECK_TYPES,
  MAX_ATTACHMENT_BYTES,
} from "./constants";
import { canTransitionStatus } from "./statusTransitions";
import type {
  CheckFormValues,
  CheckRecord,
  CheckStatus,
  CheckType,
  ValidationResult,
} from "./types";
import { isValidIsoDate } from "./utils";

/**
 * Server-style validation layer.
 * In production this logic mirrors Laravel Form Request rules.
 */
export function validateCheckPayload(
  values: CheckFormValues,
  options: {
    existing: CheckRecord[];
    editingId?: number;
    previousStatus?: CheckStatus;
  },
): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  const checkNumber = values.checkNumber.trim();
  if (!checkNumber) errors.checkNumber = "Cheque number is required.";
  else if (checkNumber.length > 64)
    errors.checkNumber = "Cheque number must be 64 characters or fewer.";

  if (!values.checkType || !CHECK_TYPES.includes(values.checkType as CheckType)) {
    errors.checkType = "Select a valid cheque type.";
  }

  if (!values.checkDate || !isValidIsoDate(values.checkDate)) {
    errors.checkDate = "Enter a valid cheque date.";
  }

  if (!values.dateReceivedIssued || !isValidIsoDate(values.dateReceivedIssued)) {
    errors.dateReceivedIssued = "Enter a valid date received/issued.";
  }

  if (!values.payeeName.trim()) errors.payeeName = "Payee name is required.";
  if (!values.drawerName.trim()) errors.drawerName = "Drawer name is required.";
  if (!values.bankName.trim()) errors.bankName = "Bank name is required.";
  if (!values.branch.trim()) errors.branch = "Branch is required.";

  const account = values.accountNumber.replace(/\s+/g, "");
  if (!account) errors.accountNumber = "Account number is required.";
  else if (!/^[0-9-]{6,32}$/.test(account)) {
    errors.accountNumber = "Account number must be 6–32 digits (hyphens allowed).";
  }

  const amount = Number(values.checkAmount);
  if (!values.checkAmount || Number.isNaN(amount)) {
    errors.checkAmount = "Cheque amount is required.";
  } else if (amount <= 0) {
    errors.checkAmount = "Cheque amount must be greater than zero.";
  } else if (amount > 999_999_999.99) {
    errors.checkAmount = "Cheque amount exceeds the allowed maximum.";
  }

  if (!values.purpose.trim()) errors.purpose = "Purpose is required.";

  for (const [key, label] of [
    ["dueDate", "Due date"],
    ["depositDate", "Deposit date"],
    ["clearingDate", "Clearing date"],
  ] as const) {
    const v = values[key];
    if (v && !isValidIsoDate(v)) errors[key] = `${label} must be a valid date.`;
  }

  if (!values.checkStatus || !CHECK_STATUSES.includes(values.checkStatus as CheckStatus)) {
    errors.checkStatus = "Select a valid cheque status.";
  }

  const type = values.checkType as CheckType;
  const status = values.checkStatus as CheckStatus;

  if (type && status) {
    if (type === "Received Check" && status === "Issued") {
      errors.checkStatus = "Issued status applies only to issued cheques.";
    }
    if (type === "Issued Check" && (status === "Received" || status === "For Deposit")) {
      errors.checkStatus = `"${status}" applies only to received cheques.`;
    }

    if (options.previousStatus) {
      const transition = canTransitionStatus(type, options.previousStatus, status);
      if (!transition.ok) errors.checkStatus = transition.message;
    } else {
      const allowedForType =
        type === "Received Check"
          ? [
              "Pending",
              "Received",
              "For Deposit",
              "Deposited",
              "For Clearing",
              "Cleared",
              "Bounced",
              "Cancelled",
              "Voided",
            ]
          : [
              "Pending",
              "Issued",
              "For Clearing",
              "Cleared",
              "Bounced",
              "Cancelled",
              "Voided",
            ];
      if (!allowedForType.includes(status)) {
        errors.checkStatus = `"${status}" is not applicable to ${type.toLowerCase()}s.`;
      }
    }
  }

  // Date workflow consistency — do not auto-clear based on dates
  if (values.depositDate && values.checkDate && values.depositDate < values.checkDate) {
    errors.depositDate = "Deposit date cannot be earlier than the cheque date.";
  }
  if (values.clearingDate && values.depositDate && values.clearingDate < values.depositDate) {
    errors.clearingDate = "Clearing date cannot be earlier than the deposit date.";
  }
  // Uniqueness: check number + bank + type (provisional OASIS rule)
  if (checkNumber && type) {
    const duplicate = options.existing.find(
      (r) =>
        r.id !== options.editingId &&
        !r.archivedAt &&
        r.checkNumber.toLowerCase() === checkNumber.toLowerCase() &&
        r.bankName.trim().toLowerCase() === values.bankName.trim().toLowerCase() &&
        r.checkType === type,
    );
    if (duplicate) {
      errors.checkNumber =
        "A cheque with this number already exists for the same bank and cheque type.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateAttachmentFile(file: File): string | null {
  if (!attachmentMimeType(file)) return `Allowed file types: ${ATTACHMENT_FORMATS}.`;
  if (file.size <= 0) return "The selected file is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "Each attachment must be 5 MB or smaller.";
  return null;
}
