import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_ATTACHMENT_TYPES,
  CHECK_STATUSES,
  CHECK_TYPES,
  MAX_ATTACHMENT_BYTES,
} from "./constants";
import {
  canTransitionStatus,
  requiresClearingDate,
  requiresDepositDate,
} from "./statusTransitions";
import type {
  CheckFormValues,
  CheckRecord,
  CheckStatus,
  CheckType,
  ValidationResult,
} from "./types";
import { fileExtension, isValidIsoDate } from "./utils";

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
  if (!checkNumber) errors.checkNumber = "Check number is required.";
  else if (checkNumber.length > 64)
    errors.checkNumber = "Check number must be 64 characters or fewer.";

  if (!values.checkType || !CHECK_TYPES.includes(values.checkType as CheckType)) {
    errors.checkType = "Select a valid check type.";
  }

  if (!values.checkDate || !isValidIsoDate(values.checkDate)) {
    errors.checkDate = "Enter a valid check date.";
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
    errors.checkAmount = "Check amount is required.";
  } else if (amount <= 0) {
    errors.checkAmount = "Check amount must be greater than zero.";
  } else if (amount > 999_999_999.99) {
    errors.checkAmount = "Check amount exceeds the allowed maximum.";
  }

  if (!values.purpose.trim()) errors.purpose = "Purpose is required.";
  if (!values.referenceNumber.trim()) errors.referenceNumber = "Reference number is required.";

  for (const [key, label] of [
    ["dueDate", "Due date"],
    ["depositDate", "Deposit date"],
    ["clearingDate", "Clearing date"],
  ] as const) {
    const v = values[key];
    if (v && !isValidIsoDate(v)) errors[key] = `${label} must be a valid date.`;
  }

  if (!values.checkStatus || !CHECK_STATUSES.includes(values.checkStatus as CheckStatus)) {
    errors.checkStatus = "Select a valid check status.";
  }

  const type = values.checkType as CheckType;
  const status = values.checkStatus as CheckStatus;

  if (type && status) {
    if (type === "Received Check" && status === "Issued") {
      errors.checkStatus = "Issued status applies only to issued checks.";
    }
    if (type === "Issued Check" && (status === "Received" || status === "For Deposit")) {
      errors.checkStatus = `"${status}" applies only to received checks.`;
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
    errors.depositDate = "Deposit date cannot be earlier than the check date.";
  }
  if (values.clearingDate && values.depositDate && values.clearingDate < values.depositDate) {
    errors.clearingDate = "Clearing date cannot be earlier than the deposit date.";
  }
  if (
    values.clearingDate &&
    !values.depositDate &&
    type === "Received Check" &&
    status === "Cleared"
  ) {
    errors.depositDate = "Deposit date is required before clearing a received check.";
  }
  if (type && status && requiresDepositDate(status, type) && !values.depositDate) {
    errors.depositDate = "Deposit date is required for this status.";
  }
  if (status && requiresClearingDate(status) && !values.clearingDate) {
    errors.clearingDate = "Clearing date is required when status is Cleared.";
  }
  if (
    values.clearingDate &&
    status &&
    status !== "Cleared" &&
    !["Bounced", "Cancelled", "Voided"].includes(status)
  ) {
    errors.clearingDate = "Clearing date should only be set when the check is cleared.";
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
        "A check with this number already exists for the same bank and check type.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateAttachmentFile(file: File): string | null {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as (typeof ALLOWED_ATTACHMENT_TYPES)[number])) {
    const ext = fileExtension(file.name);
    if (!(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) {
      return "Allowed file types: JPG, PNG, WEBP, PDF.";
    }
  }
  if (file.size <= 0) return "The selected file is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "Each attachment must be 5 MB or smaller.";
  return null;
}
