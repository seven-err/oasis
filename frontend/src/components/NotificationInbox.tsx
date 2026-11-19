import { useEffect, useId, useRef, useState } from "react";
import { Bell, ChevronRight, CircleDollarSign, FileCheck2, Users, WalletCards } from "lucide-react";
import type { CheckRecord } from "@/modules/checks";
import type { PayableViewModel } from "@/modules/payables";
import { todayIsoDate } from "@/modules/payables/utils";
import type { ReceivableViewModel } from "@/modules/receivables";

const initialNotificationCount = 5;
const notificationIcons = {
  checks: FileCheck2,
  payables: WalletCards,
  receivables: CircleDollarSign,
  employees: Users,
};

export type OfficeNotification = {
  id: string;
  page: "checks" | "payables" | "receivables" | "employees";
  recordId: number;
  title: string;
  detail: string;
  urgency?: "overdue" | "today";
};

type EmployeeFollowUp = {
  id: number;
  name: string;
  number: string;
  archived?: boolean;
  requirementStatus?: "Complete" | "Incomplete";
  requirementFollowUpDate?: string;
};

function getDeadline(
  label: "Payable" | "Receivable",
  dueDate: string,
  today: string,
): Pick<OfficeNotification, "title" | "urgency"> | undefined {
  const days = (Date.parse(dueDate) - Date.parse(today)) / 86_400_000;
  if (days < 0) return { title: `Overdue ${label.toLowerCase()}`, urgency: "overdue" };
  if (days === 0) return { title: `${label} due today`, urgency: "today" };
  if (days <= 7) return { title: `${label} due in ${days} ${days === 1 ? "day" : "days"}` };
}

const urgencyRank = { overdue: 0, today: 1, other: 2 };
const urgencyStyles = {
  overdue: { row: "bg-red-50 hover:bg-red-100", badge: "bg-red-100 text-red-800", label: "Overdue" },
  today: { row: "bg-amber-50 hover:bg-amber-100", badge: "bg-amber-100 text-amber-900", label: "Due today" },
};

export function getOfficeNotifications(
  checks: CheckRecord[],
  payables: PayableViewModel[],
  receivables: ReceivableViewModel[],
  employees: EmployeeFollowUp[],
  today = todayIsoDate(),
): OfficeNotification[] {
  const alerts: (OfficeNotification & { updatedAt: string })[] = [];
  for (const check of checks) {
    if (check.archivedAt || check.checkStatus !== "Bounced") continue;
    alerts.push({
      id: `bounced-check:${check.id}:${check.createdAt}`,
      page: "checks",
      recordId: check.id,
      title: "Bounced check",
      detail: `${check.checkNumber} · ${check.payeeName}`,
      updatedAt: check.updatedAt,
    });
  }
  for (const payable of payables) {
    if (payable.archivedAt) continue;
    const pending = payable.approvalStatus === "Pending";
    const notification = pending
      ? { title: "Payable awaiting approval" }
      : payable.approvalStatus === "Approved" && payable.remainingBalance > 0
        ? getDeadline("Payable", payable.dueDate, today)
        : undefined;
    if (!notification) continue;
    alerts.push({
      id: pending
        ? `payable-approval:${payable.id}:${payable.createdAt}`
        : `overdue-payable:${payable.id}:${payable.createdAt}:${payable.dueDate}`,
      page: "payables",
      recordId: payable.id,
      ...notification,
      detail: pending
        ? `${payable.invoiceNumber} · ${payable.payeeName}`
        : `${payable.invoiceNumber} · ${payable.payeeName} · Due ${payable.dueDate}`,
      updatedAt: payable.updatedAt,
    });
  }
  for (const receivable of receivables) {
    if (receivable.archivedAt || receivable.collectionStatus === "Cancelled" || receivable.remainingBalance <= 0) continue;
    const deadline = getDeadline("Receivable", receivable.dueDate, today);
    if (!deadline) continue;
    alerts.push({
      id: `overdue-receivable:${receivable.id}:${receivable.createdAt}:${receivable.dueDate}`,
      page: "receivables",
      recordId: receivable.id,
      ...deadline,
      detail: `${receivable.invoiceNumber} · ${receivable.customerName} · Due ${receivable.dueDate}`,
      updatedAt: receivable.updatedAt,
    });
  }
  for (const employee of employees) {
    const dueDate = employee.requirementFollowUpDate;
    if (employee.archived || employee.requirementStatus === "Complete" || !dueDate || dueDate > today) continue;
    alerts.push({
      id: `employee-requirements:${employee.number}:${dueDate}`,
      page: "employees",
      recordId: employee.id,
      title: "Employee requirements follow-up",
      urgency: dueDate === today ? "today" : "overdue",
      detail: `${employee.name} · Follow up ${dueDate}`,
      updatedAt: dueDate,
    });
  }
  return alerts.sort((a, b) =>
    urgencyRank[a.urgency ?? "other"] - urgencyRank[b.urgency ?? "other"] ||
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

function loadReadIds(key: string): Set<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(saved)) {
      return new Set(saved.filter((id): id is string => typeof id === "string"));
    }
  } catch {
    // The inbox can still be used when storage is unavailable.
  }
  return new Set();
}

export function NotificationInbox({
  userId,
  items,
  open,
  onOpenChange,
  onSelect,
}: {
  userId: number;
  items: OfficeNotification[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: OfficeNotification) => void;
}) {
  const panelId = useId();
  const titleId = useId();
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const firstAdditionalItem = useRef<HTMLButtonElement>(null);
  const [showAll, setShowAll] = useState(false);
  const storageKey = `oasis:notifications:read:${userId}`;
  const [readIds, setReadIds] = useState(() => loadReadIds(storageKey));
  const visibleItems = showAll ? items : items.slice(0, initialNotificationCount);
  const unread = items.filter(({ id }) => !readIds.has(id)).length;
  const urgent = items.filter(({ urgency }) => urgency).length;

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !bell.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      onOpenChange(false);
      bell.current?.focus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (showAll) firstAdditionalItem.current?.focus();
  }, [showAll]);

  const markRead = (ids: string[]) => {
    const next = new Set([...readIds, ...ids]);
    setReadIds(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Read status remains available for the current session.
    }
  };

  return (
    <>
      <button
        ref={bell}
        type="button"
        className="relative grid size-10 place-items-center border-0 bg-transparent shadow-none transition-[color,scale] duration-300 ease-out hover:text-[#1f6ea6] aria-expanded:text-[#1f6ea6] motion-reduce:transition-none"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}${urgent ? `, ${urgent} due today or overdue` : ""}`}
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        onClick={() => {
          if (!open) setShowAll(false);
          onOpenChange(!open);
        }}
      >
        <Bell size={18} fill="currentColor" className={`notification-bell ${open ? "is-open" : ""}`} aria-hidden="true" />
        {(unread > 0 || urgent > 0) && (
          <span
            aria-hidden="true"
            className={`absolute top-0 right-0 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white ${urgent ? "bg-red-700" : "bg-[#1f6ea6]"}`}
          >
            {unread > 99 ? "99+" : unread || "!"}
          </span>
        )}
      </button>
        <section
          ref={panel}
          id={panelId}
          data-open={open}
          aria-hidden={!open}
          inert={!open}
          aria-labelledby={titleId}
          className="notification-panel absolute top-full right-4 z-10 mt-2 w-[min(26rem,calc(100%-2rem))] overflow-hidden rounded-2xl border border-[#d0e3ef] bg-white shadow-xl sm:right-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d0e3ef] bg-[#f4f9fd] p-4">
            <div>
                <h2 id={titleId} className="text-sm font-bold">
                  Notifications
                </h2>
                <p className="mt-1 text-xs text-[#526a7c]" role="status">
                  {unread} unread
                  {urgent > 0 && <span className="font-semibold text-red-700"> · {urgent} due today or overdue</span>}
                </p>
            </div>
            <button
              type="button"
              aria-disabled={unread === 0}
              className="px-2 py-1.5 text-[11px] font-semibold text-[#1f6ea6] hover:bg-[#e7f3fb] aria-disabled:text-[#526a7c]"
              onClick={() => {
                if (unread) markRead(items.map(({ id }) => id));
              }}
            >
              Mark all as read
            </button>
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-[#e7f3fb] text-[#1f6ea6]" aria-hidden="true"><Bell size={22} /></span>
              <p className="text-sm font-semibold text-[#16344d]">You're all caught up</p>
              <p className="text-xs text-[#526a7c]">No notifications right now.</p>
            </div>
          ) : (
            <div className="max-h-[min(24rem,calc(100dvh-10rem))] overflow-y-auto">
              <ul className="space-y-2 p-3">
                {visibleItems.map((item, index) => {
                  const Icon = notificationIcons[item.page];
                  const isUnread = !readIds.has(item.id);
                  const urgency = item.urgency && urgencyStyles[item.urgency];
                  return (
                    <li key={item.id}>
                      <button
                        ref={index === initialNotificationCount ? firstAdditionalItem : undefined}
                        type="button"
                        className={`group flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors motion-reduce:transition-none ${urgency ? urgency.row : `hover:bg-[#e7f3fb] ${isUnread ? "bg-[#f3f8fc]" : ""}`}`}
                        onClick={() => {
                          if (isUnread) markRead([item.id]);
                          onSelect(item);
                          bell.current?.focus();
                        }}
                      >
                        <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-white text-[#1f6ea6]" aria-hidden="true">
                          <Icon size={16} />
                          {isUnread && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[#1f6ea6] ring-2 ring-white" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          {isUnread && <span className="sr-only">Unread: </span>}
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#5c7890]">{item.page}</span>
                          <span
                            className={`block text-sm ${isUnread ? "font-bold" : "font-medium"}`}
                          >
                            {item.title}
                          </span>
                          <span className="mt-1 block wrap-break-word text-xs leading-5 text-[#526a7c]">
                            {item.detail}
                          </span>
                          {urgency && (
                            <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${urgency.badge}`}>
                              {urgency.label}
                            </span>
                          )}
                        </span>
                        <ChevronRight
                          size={15}
                          aria-hidden="true"
                          className="mt-3 shrink-0 text-[#6a8aa0] group-hover:text-[#1f6ea6]"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!showAll && items.length > initialNotificationCount && (
                <button
                  type="button"
                  className="w-full rounded-none bg-transparent px-4 py-3 text-center text-xs font-semibold text-[#1f6ea6] hover:underline"
                  onClick={() => setShowAll(true)}
                >
                  See more
                </button>
              )}
            </div>
          )}
        </section>
    </>
  );
}
