import {
  ISSUED_STATUS_FLOW,
  RECEIVED_STATUS_FLOW,
  TERMINAL_STATUSES,
} from "./constants";
import type { CheckStatus, CheckType } from "./types";

function flowFor(type: CheckType): CheckStatus[] {
  return type === "Received Check" ? RECEIVED_STATUS_FLOW : ISSUED_STATUS_FLOW;
}

/** Statuses selectable for a check type (including terminals). */
export function allowedStatusesForType(type: CheckType): CheckStatus[] {
  return [...flowFor(type), ...TERMINAL_STATUSES];
}

/**
 * Validate a proposed status transition.
 * Provisional rules pending OASIS management confirmation.
 */
export function canTransitionStatus(
  type: CheckType,
  from: CheckStatus,
  to: CheckStatus,
): { ok: boolean; message?: string } {
  if (from === to) return { ok: true };

  const allowed = allowedStatusesForType(type);
  if (!allowed.includes(to)) {
    return {
      ok: false,
      message: `"${to}" is not applicable to ${type.toLowerCase()}s.`,
    };
  }

  // Terminal statuses may move into history but not reverse without restore/archive flows
  if (TERMINAL_STATUSES.includes(from) && !TERMINAL_STATUSES.includes(to)) {
    return {
      ok: false,
      message: `Cannot move a ${from.toLowerCase()} cheque back to an active workflow status.`,
    };
  }

  // Moving into terminal is always allowed from any non-cleared active path,
  // and also from Cleared (e.g. late bounce discovery) — keep historical record.
  if (TERMINAL_STATUSES.includes(to)) return { ok: true };

  const flow = flowFor(type);
  const fromIdx = flow.indexOf(from);
  const toIdx = flow.indexOf(to);

  if (fromIdx === -1 || toIdx === -1) {
    return { ok: false, message: "Invalid status for this cheque type." };
  }

  // Allow forward movement and one-step rollback for corrections
  if (toIdx > fromIdx + 1) {
    return {
      ok: false,
      message: `Cannot skip workflow steps from ${from} to ${to}.`,
    };
  }

  if (toIdx < fromIdx - 1) {
    return {
      ok: false,
      message: `Cannot jump backward from ${from} to ${to}.`,
    };
  }

  return { ok: true };
}

export function defaultStatusForType(type: CheckType): CheckStatus {
  return type === "Received Check" ? "Received" : "Issued";
}
