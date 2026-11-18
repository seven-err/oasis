import {
  AlertCircle,
  Archive,
  ArrowUpDown,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CircleX,
  Wallet,
  FileText,
  History,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { SummaryStatCards } from "@/components/SummaryStatCards";
import { ActiveFilters } from "@/components/ActiveFilters";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { recordRowClick } from "@/components/recordRowClick";
import {
  COLLECTION_STATUSES,
  EMPTY_FILTERS,
  PAGE_SIZE,
  PAYMENT_METHODS,
} from "./constants";
import { ReceivableCancellationDialog } from "./ReceivableCancellationDialog";
import { receivableService } from "./store";
import type {
  ReceivableFilters,
  ReceivableSort,
  ReceivableSortKey,
  ReceivableViewModel,
} from "./types";
import { EmptyState, PaginationBar, StatusBadge } from "./ui";
import {
  canCancelReceivable,
  filterReceivables,
  formatDate,
  peso,
  sortReceivables,
  summarizeReceivables,
} from "./utils";

type Props = {
  records: ReceivableViewModel[];
  onAdd: () => void;
  onView: (id: number) => void;
  onPrint: (id: number) => void;
  onEdit: (id: number) => void;
  onRecordCollection: (id: number) => void;
  onCollectionHistory: (id: number) => void;
  onScheduleFollowUp: (id: number) => void;
  onViewAttachments: (id: number) => void;
  onOpenReports: () => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

export function ReceivableRegister({
  records,
  onAdd,
  onView,
  onPrint,
  onEdit,
  onRecordCollection,
  onCollectionHistory,
  onScheduleFollowUp,
  onViewAttachments,
  onOpenReports,
  onChanged,
  notify,
}: Props) {
  const user = receivableService.getUser();
  const [deleting, setDeleting] = useState<ReceivableViewModel | null>(null);
  const customers = useMemo(() => receivableService.customers(false), [records]);
  const collections = useMemo(() => receivableService.allCollections(), [records]);
  const [filters, setFilters] = useState<ReceivableFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<ReceivableSort>({ key: "dueDate", direction: "asc" });
  const [page, setPage] = useState(1);
  const [menu, setMenu] = useState<{ id: number; trigger: HTMLButtonElement } | null>(null);
  const menuRef = useRef<HTMLDialogElement>(null);
  const [cancelling, setCancelling] = useState<ReceivableViewModel | null>(null);

  const summary = useMemo(() => summarizeReceivables(records), [records]);

  const filtered = useMemo(
    () => sortReceivables(filterReceivables(records, filters, collections), sort),
    [records, filters, sort, collections],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const menuRow = pageRows.find((row) => row.id === menu?.id);
  const menuRowId = menuRow?.id;

  useLayoutEffect(() => {
    const dialog = menuRef.current;
    if (!menu || menuRowId === undefined || !dialog) return;

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const positionMenu = () => {
      const trigger = menu.trigger.getBoundingClientRect();
      if (trigger.height === 0) {
        setMenu(null);
        return;
      }

      const gap = 8;
      const spaceBelow = window.innerHeight - trigger.bottom - gap * 2;
      const spaceAbove = trigger.top - gap * 2;
      const openAbove = spaceAbove > spaceBelow && spaceBelow < dialog.scrollHeight;

      dialog.style.right = `${Math.max(gap, root.clientWidth - trigger.right)}px`;
      dialog.style.top = openAbove ? "auto" : `${trigger.bottom + gap}px`;
      dialog.style.bottom = openAbove ? `${window.innerHeight - trigger.top + gap}px` : "auto";
      dialog.style.maxHeight = `${Math.max(0, openAbove ? spaceAbove : spaceBelow)}px`;
    };

    menu.trigger.focus({ preventScroll: true });
    positionMenu();
    dialog.showModal();
    positionMenu();
    window.addEventListener("resize", positionMenu);
    return () => {
      window.removeEventListener("resize", positionMenu);
      root.style.overflow = previousOverflow;
      dialog.close();
    };
  }, [menu, menuRowId]);

  const setFilter = <K extends keyof ReceivableFilters>(key: K, value: ReceivableFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const toggleSort = (key: ReceivableSortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, direction: s.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: ReceivableSortKey }) => (
    <th>
      <button onClick={() => toggleSort(sortKey)} className="inline-flex items-center gap-1">
        {label}
      </button>
    </th>
  );

  const deleteRecord = (record: ReceivableViewModel) => {
    const result = receivableService.deleteRecord(record.id);
    if (!result.ok) {
      setDeleting(null);
      notify(result.errors.form ?? "Unable to delete receivable.");
      return;
    }
    setDeleting(null);
    notify("Receivable moved to Deleted Records.");
    onChanged();
  };

  const archiveOrRestore = (record: ReceivableViewModel) => {
    if (!user.permissions.archiveReceivables) {
      notify("You are not authorized to archive receivables.");
      return;
    }
    if (record.archivedAt) {
      const result = receivableService.restore(record.id);
      if (result.ok) {
        notify("Receivable restored.");
        onChanged();
      }
      return;
    }
    if (!window.confirm("Archive this receivable? Historical information will be retained."))
      return;
    const result = receivableService.archive(record.id);
    if (result.ok) {
      notify("Receivable archived.");
      onChanged();
    }
  };

  const canCollect = (row: ReceivableViewModel) =>
    user.permissions.recordCollections &&
    !row.archivedAt &&
    row.collectionStatus !== "Cancelled" &&
    row.remainingBalance > 0;

  const actionMenu = (row: ReceivableViewModel) => (
    <dialog
      ref={menuRef}
      aria-label={`Actions for ${row.invoiceNumber}`}
      className="fixed inset-auto m-0 w-56 max-w-[calc(100%-1rem)] overflow-y-auto overscroll-contain border border-[#d0e3ef] bg-white shadow-xl backdrop:bg-transparent backdrop:touch-none"
      onCancel={(event) => {
        event.preventDefault();
        setMenu(null);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            setMenu(null);
          }
        }
      }}
    >
      <div className="p-1">
        {user.permissions.editReceivables && canCancelReceivable(row) && (
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-700 hover:bg-red-50"
            onClick={() => {
              setMenu(null);
              setCancelling(row);
            }}
          >
            <CircleX size={14} /> Cancel
          </button>
        )}
        {user.permissions.editReceivables && !row.archivedAt && row.collectionStatus !== "Cancelled" && (
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
            onClick={() => {
              setMenu(null);
              onEdit(row.id);
            }}
          >
            <Pencil size={14} /> Edit
          </button>
        )}
        {canCollect(row) && (
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
            onClick={() => {
              setMenu(null);
              onRecordCollection(row.id);
            }}
          >
            <Plus size={14} /> Record collection
          </button>
        )}
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
          onClick={() => {
            setMenu(null);
            onCollectionHistory(row.id);
          }}
        >
          <History size={14} /> Collection history
        </button>
        {user.permissions.manageFollowUps && !row.archivedAt && (
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
            onClick={() => {
              setMenu(null);
              onScheduleFollowUp(row.id);
            }}
          >
            <CalendarClock size={14} /> Schedule follow-up
          </button>
        )}
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
          onClick={() => {
            setMenu(null);
            onViewAttachments(row.id);
          }}
        >
          <Paperclip size={14} /> View attachments
        </button>
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
          onClick={() => {
            setMenu(null);
            onPrint(row.id);
          }}
        >
          <FileText size={14} /> Print
        </button>
        {user.permissions.archiveReceivables && (
          <button
            className="flex w-full items-center gap-2 border-t border-[#e1eef6] px-3 py-2 text-xs text-red-700 hover:bg-red-50"
            onClick={() => {
              setMenu(null);
              archiveOrRestore(row);
            }}
          >
            {row.archivedAt ? (
              <>
                <RotateCcw size={14} /> Restore
              </>
            ) : (
              <>
                <Archive size={14} /> Archive
              </>
            )}
          </button>
        )}
        {user.permissions.archiveReceivables && (
          <button
            type="button"
            className="flex w-full items-center gap-2 border-t border-[#e1eef6] px-3 py-2 text-xs text-red-700 hover:bg-red-50"
            onClick={() => {
              setMenu(null);
              setDeleting(row);
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        )}
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#888] hover:bg-[#e7f3fb]"
          onClick={() => setMenu(null)}
        >
          <X size={14} /> Close
        </button>
      </div>
    </dialog>
  );

  const rowActions = (row: ReceivableViewModel) => (
    <div className="relative flex shrink-0 items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="table-action"
        aria-label={`Actions for ${row.invoiceNumber}`}
        aria-expanded={menu?.id === row.id}
        aria-haspopup="dialog"
        onClick={(event) => setMenu({ id: row.id, trigger: event.currentTarget })}
      >
        <MoreHorizontal size={17} />
      </button>
    </div>
  );

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-clip">
      {deleting && (
        <DeleteConfirmationDialog
          recordLabel={`Receivable ${deleting.invoiceNumber}`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteRecord(deleting)}
        />
      )}
      <SummaryStatCards
        items={[
          {
            label: "Total Receivables",
            value: summary.totalReceivables,
            icon: Wallet,
            onClick: () => {
              setFilters(EMPTY_FILTERS);
              setPage(1);
            },
          },
          {
            label: "Outstanding",
            value: peso.format(summary.totalOutstandingBalance),
            icon: CircleDollarSign,
            onClick: () => {
              setFilters({ ...EMPTY_FILTERS, collectionStatus: "All" });
              setPage(1);
            },
          },
          {
            label: "Paid",
            value: summary.paid,
            icon: CheckCircle2,
            onClick: () => {
              setFilters({ ...EMPTY_FILTERS, collectionStatus: "Paid" });
              setPage(1);
            },
          },
          {
            label: "Overdue",
            value: summary.overdue,
            icon: AlertCircle,
            onClick: () => {
              setFilters({ ...EMPTY_FILTERS, collectionStatus: "Overdue" });
              setPage(1);
            },
          },
        ]}
      />

      <section className="max-w-full space-y-4">


        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 w-full flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
              <input
                className="input pl-10 pr-10"
                placeholder="Search invoice, customer, client ID, contact, reference…"
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
              />
              {filters.search.length > 0 && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-[#777] hover:bg-[#e7f3fb] hover:text-[#222] focus-visible:outline-2 focus-visible:outline-[#1f6ea6]"
                  onClick={(e) => {
                    setFilter("search", "");
                    e.currentTarget.parentElement?.querySelector("input")?.focus();
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="secondary-btn w-full sm:w-auto"
                onClick={() => setShowFilters((x) => !x)}
                type="button"
              >
                <SlidersHorizontal size={15} />
                {showFilters ? "Hide filters" : "More filters"}
              </button>
              <button
                className="secondary-btn w-full sm:w-auto"
                type="button"
                onClick={() => {
                  toggleSort("customerName");
                  setPage(1);
                }}
                aria-label="Sort receivables by customer alphabetically"
              >
                <ArrowUpDown size={15} />
                {sort.key === "customerName" && sort.direction === "desc" ? "Z-A" : "A-Z"}
              </button>
              <button type="button" onClick={onOpenReports} className="secondary-btn w-full sm:w-auto">
                <FileText size={15} /> Reports
              </button>
            </div>
          </div>

          <ActiveFilters
            filters={filters}
            defaults={EMPTY_FILTERS}
            valueLabels={{ customerId: Object.fromEntries(customers.map((customer) => [String(customer.id), customer.customerName])), preparedById: { "1": "Miguel Alvarina", ...Object.fromEntries(records.map((record) => [String(record.preparedById), record.preparedByName])) } }}
            matched={filtered.length}
            total={records.filter((record) => filters.includeArchived || !record.archivedAt).length}
            onRemove={(key) => setFilter(key, EMPTY_FILTERS[key])}
            onClear={() => { setFilters({ ...EMPTY_FILTERS }); setPage(1); }}
          />
          {showFilters && (
            <div className="grid gap-3 border border-[#d0e3ef] bg-[#f4f9fd] p-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="field-label">Customer</span>
                <select
                  className="input mt-2"
                  value={filters.customerId === "All" ? "All" : String(filters.customerId)}
                  onChange={(e) =>
                    setFilter(
                      "customerId",
                      e.target.value === "All" ? "All" : Number(e.target.value),
                    )
                  }
                >
                  <option value="All">All customers</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customerName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Invoice number</span>
                <input
                  className="input mt-2"
                  value={filters.invoiceNumber}
                  onChange={(e) => setFilter("invoiceNumber", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">Customer name</span>
                <input
                  className="input mt-2"
                  value={filters.customerName}
                  onChange={(e) => setFilter("customerName", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">Client ID</span>
                <input
                  className="input mt-2"
                  value={filters.clientId}
                  onChange={(e) => setFilter("clientId", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">Contact number</span>
                <input
                  className="input mt-2"
                  value={filters.contactNumber}
                  onChange={(e) => setFilter("contactNumber", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">Reference number</span>
                <input
                  className="input mt-2"
                  value={filters.referenceNumber}
                  onChange={(e) => setFilter("referenceNumber", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">Payment reference</span>
                <input
                  className="input mt-2"
                  value={filters.paymentReferenceNumber}
                  onChange={(e) => setFilter("paymentReferenceNumber", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">Collection status</span>
                <select
                  className="input mt-2"
                  value={filters.collectionStatus}
                  onChange={(e) =>
                    setFilter(
                      "collectionStatus",
                      e.target.value as ReceivableFilters["collectionStatus"],
                    )
                  }
                >
                  <option value="All">All statuses</option>
                  {COLLECTION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Payment method</span>
                <select
                  className="input mt-2"
                  value={filters.paymentMethod}
                  onChange={(e) =>
                    setFilter(
                      "paymentMethod",
                      e.target.value as ReceivableFilters["paymentMethod"],
                    )
                  }
                >
                  <option value="All">All methods</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Bank name</span>
                <input
                  className="input mt-2"
                  value={filters.bankName}
                  onChange={(e) => setFilter("bankName", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">Prepared by</span>
                <select
                  className="input mt-2"
                  value={
                    filters.preparedById === "All" ? "All" : String(filters.preparedById)
                  }
                  onChange={(e) =>
                    setFilter(
                      "preparedById",
                      e.target.value === "All" ? "All" : Number(e.target.value),
                    )
                  }
                >
                  <option value="All">All preparers</option>
                  <option value="1">Miguel Alvarina</option>
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-xs">
                <input
                  type="checkbox"
                  checked={filters.includeArchived}
                  onChange={(e) => setFilter("includeArchived", e.target.checked)}
                />
                Include archived
              </label>
              <div className="md:col-span-2">
                <span className="field-label">Invoice date range</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="input"
                    value={filters.invoiceDateFrom}
                    onChange={(e) => setFilter("invoiceDateFrom", e.target.value)}
                  />
                  <input
                    type="date"
                    className="input"
                    value={filters.invoiceDateTo}
                    onChange={(e) => setFilter("invoiceDateTo", e.target.value)}
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <span className="field-label">Transaction date range</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="input"
                    value={filters.transactionDateFrom}
                    onChange={(e) => setFilter("transactionDateFrom", e.target.value)}
                  />
                  <input
                    type="date"
                    className="input"
                    value={filters.transactionDateTo}
                    onChange={(e) => setFilter("transactionDateTo", e.target.value)}
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <span className="field-label">Due date range</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="input"
                    value={filters.dueDateFrom}
                    onChange={(e) => setFilter("dueDateFrom", e.target.value)}
                  />
                  <input
                    type="date"
                    className="input"
                    value={filters.dueDateTo}
                    onChange={(e) => setFilter("dueDateTo", e.target.value)}
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <span className="field-label">Follow-up date range</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="input"
                    value={filters.followUpDateFrom}
                    onChange={(e) => setFilter("followUpDateFrom", e.target.value)}
                  />
                  <input
                    type="date"
                    className="input"
                    value={filters.followUpDateTo}
                    onChange={(e) => setFilter("followUpDateTo", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="panel max-w-full overflow-hidden">
        {pageRows.length ? (
          <>
            <div className="divide-y divide-[#e1eef6] xl:hidden">
              {pageRows.map((row) => (
                <div
                  key={row.id}
                  className={`relative cursor-pointer space-y-3 p-4 transition-colors hover:bg-[#eef6fb] ${row.archivedAt ? "opacity-60" : ""}`}
                  onClick={recordRowClick(() => {
                    setMenu(null);
                    onView(row.id);
                  })}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="truncate text-left text-sm font-semibold text-[#1f6ea6]"
                        onClick={() => {
                          setMenu(null);
                          onView(row.id);
                        }}
                        aria-label={`Open receivable ${row.invoiceNumber}`}
                      >
                        {row.invoiceNumber}
                      </button>
                      <p className="mt-1 truncate text-xs text-[#555]">{row.customerName}</p>
                      <p className="mt-1 text-[10px] text-[#888]">
                        {row.clientId} · Due {formatDate(row.dueDate)}
                      </p>
                    </div>
                    {rowActions(row)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={row.collectionStatus} />
                    {row.daysOverdue > 0 && (
                      <span className="text-[10px] text-red-700">
                        {row.daysOverdue} days overdue
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#777]">
                      Paid {peso.format(row.amountPaid)} /{" "}
                      {peso.format(row.totalReceivableAmount)}
                    </span>
                    <strong>{peso.format(row.remainingBalance)}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden w-full xl:block">
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    <SortHeader label="Invoice" sortKey="invoiceNumber" />
                    <SortHeader label="Customer" sortKey="customerName" />
                    <SortHeader label="Due" sortKey="dueDate" />
                    <SortHeader label="Total" sortKey="totalReceivableAmount" />
                    <SortHeader label="Paid" sortKey="amountPaid" />
                    <SortHeader label="Balance" sortKey="remainingBalance" />
                    <SortHeader label="Status" sortKey="collectionStatus" />
                    <SortHeader label="Overdue" sortKey="daysOverdue" />
                    <th className="w-12">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody key={`${sort.key}-${sort.direction}`} className="sorted-records">
                  {pageRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer ${row.archivedAt ? "opacity-60" : ""}`}
                      onClick={recordRowClick(() => {
                        setMenu(null);
                        onView(row.id);
                      })}
                    >
                      <td className="overflow-hidden text-ellipsis font-semibold text-[#1f6ea6]">
                        <button type="button" className="block max-w-full truncate text-left hover:underline" onClick={() => { setMenu(null); onView(row.id); }} aria-label={`Open receivable ${row.invoiceNumber}`}>
                          {row.invoiceNumber}
                        </button>
                        <span className="mt-1 block truncate text-[10px] text-[#888]">
                          {row.referenceNumber}
                        </span>
                      </td>
                      <td className="overflow-hidden text-ellipsis">
                        <strong className="block truncate text-xs">{row.customerName}</strong>
                        <span className="mt-1 block truncate text-[10px] text-[#888]">
                          {row.clientId}
                        </span>
                      </td>
                      <td className="overflow-hidden text-ellipsis">
                        {formatDate(row.dueDate)}
                      </td>
                      <td className="overflow-hidden text-ellipsis">
                        {peso.format(row.totalReceivableAmount)}
                      </td>
                      <td className="overflow-hidden text-ellipsis">
                        {peso.format(row.amountPaid)}
                      </td>
                      <td className="overflow-hidden text-ellipsis font-semibold">
                        {peso.format(row.remainingBalance)}
                      </td>
                      <td>
                        <StatusBadge value={row.collectionStatus} />
                      </td>
                      <td className="overflow-hidden text-ellipsis">
                        {row.daysOverdue > 0 ? (
                          <span className="text-red-700">{row.daysOverdue}</span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td onClick={(event) => event.stopPropagation()}>{rowActions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState title="No receivables found" onAdd={onAdd} />
        )}

        <PaginationBar
          page={currentPage}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
        />
        </div>
      </section>
      {menuRow && actionMenu(menuRow)}
      {cancelling && (
        <ReceivableCancellationDialog
          record={cancelling}
          onBack={() => setCancelling(null)}
          onConfirm={(reason) => {
            const result = receivableService.cancel(cancelling.id, reason);
            if (!result.ok) return result.errors.form ?? "Unable to cancel the receivable.";

            setCancelling(null);
            onChanged();
            notify(`Receivable ${cancelling.invoiceNumber} was cancelled.`);
          }}
        />
      )}
    </div>
  );
}
