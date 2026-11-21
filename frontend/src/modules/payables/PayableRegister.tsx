import { DateInput } from "@/components/FormPopovers";
import { ArchiveConfirmationDialog } from "@/components/ArchiveConfirmationDialog";
import {
  AlertCircle,
  Archive,
  ArrowUpDown,
  CheckCircle2,
  Clock3,
  Wallet,
  FileText,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  LayoutGrid,
  Trash2,
  X,
} from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { SummaryStatCards } from "@/components/SummaryStatCards";
import { ActiveFilters } from "@/components/ActiveFilters";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { recordRowClick } from "@/components/recordRowClick";
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "./constants";
import { payableService } from "./store";
import type {
  PayableFilters,
  PayableSort,
  PayableSortKey,
  PayableViewModel,
} from "./types";
import { EmptyState, PaginationBar, StatusBadge } from "./ui";
import {
  filterPayables,
  formatDate,
  peso,
  sortPayables,
  summarizePayables,
} from "./utils";

type Props = {
  records: PayableViewModel[];
  onAdd: () => void;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onRecordPayment: (id: number) => void;
  onPaymentHistory: (id: number) => void;
  onOpenReports: () => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

export function PayableRegister({
  records,
  onAdd,
  onView,
  onEdit,
  onRecordPayment,
  onPaymentHistory,
  onOpenReports,
  onChanged,
  notify,
}: Props) {
  const user = payableService.getUser();
  const [deleting, setDeleting] = useState<PayableViewModel | null>(null);
  const [archiving, setArchiving] = useState<PayableViewModel | null>(null);
  const categories = useMemo(() => payableService.categories(false), [records]);
  const [filters, setFilters] = useState<PayableFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [sort, setSort] = useState<PayableSort>({ key: "dueDate", direction: "asc" });
  const [page, setPage] = useState(1);
  const [menu, setMenu] = useState<{ id: number; trigger: HTMLButtonElement } | null>(null);
  const menuRef = useRef<HTMLDialogElement>(null);

  const summary = useMemo(() => summarizePayables(records), [records]);

  const filtered = useMemo(
    () => sortPayables(filterPayables(records, filters), sort),
    [records, filters, sort],
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
    dialog.showPopover();
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      dialog.hidePopover();
    };
  }, [menu, menuRowId]);


  const setFilter = <K extends keyof PayableFilters>(key: K, value: PayableFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const toggleSort = (key: PayableSortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, direction: s.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: PayableSortKey }) => (
    <th>
      <button onClick={() => toggleSort(sortKey)} className="inline-flex items-center gap-1">
        {label}
      </button>
    </th>
  );

  const deleteRecord = (record: PayableViewModel) => {
    const result = payableService.deleteRecord(record.id);
    if (!result.ok) {
      setDeleting(null);
      notify(result.errors.form ?? "Unable to delete payable.");
      return;
    }
    setDeleting(null);
    notify("Payable moved to Deleted Records.");
    onChanged();
  };

  const archiveOrRestore = (record: PayableViewModel) => {
    if (!user.permissions.archivePayables) {
      notify("You are not authorized to archive payables.");
      return;
    }
    if (record.archivedAt) {
      const result = payableService.restore(record.id);
      if (result.ok) {
        notify("Payable restored.");
        onChanged();
      }
      return;
    }
    setArchiving(record);
  };

  const confirmArchive = () => {
    if (!archiving) return;
    try {
      const result = payableService.archive(archiving.id);
      if (!result.ok) {
        notify(result.errors.form ?? "Unable to archive.");
        return;
      }
      setArchiving(null);
      notify("Payable archived.");
      onChanged();
    } catch {
      notify("Unable to save the archive. Please try again.");
    }
  };

  const canPay = (row: PayableViewModel) =>
    user.permissions.recordPayments &&
    !row.archivedAt &&
    row.remainingBalance > 0;

  const actionMenu = (row: PayableViewModel) => (
    <dialog
      ref={menuRef}
      popover="manual"
      aria-label={`Actions for ${row.invoiceNumber}`}
      className="fixed inset-auto m-0 w-56 max-w-[calc(100%-1rem)] overflow-y-auto overscroll-contain border border-[#d0e3ef] bg-white shadow-xl backdrop:bg-transparent backdrop:touch-none"
      onCancel={(event) => {
        event.preventDefault();
      }}
    >
      <div className="p-1">
        {user.permissions.editPayables && !row.archivedAt && (
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
        {user.permissions.recordPayments && (
          <button
            disabled={!canPay(row)}
            title={canPay(row) ? undefined : "Requires an active payable with an outstanding balance."}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb] disabled:cursor-not-allowed disabled:text-[#888]"
            onClick={() => {
              setMenu(null);
              onRecordPayment(row.id);
            }}
          >
            <Plus size={14} className="shrink-0" />
            <span className="text-left">
              Record payment
              {!canPay(row) && (
                <span className="mt-1 block text-[10px]">
                  Requires an active outstanding balance.
                </span>
              )}
            </span>
          </button>
        )}
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
          onClick={() => {
            setMenu(null);
            onPaymentHistory(row.id);
          }}
        >
          <History size={14} /> Payment history
        </button>
        {user.permissions.archivePayables && (
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-700 hover:bg-red-50"
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
        {user.permissions.archivePayables && (
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-700 hover:bg-red-50"
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

  const rowActions = (row: PayableViewModel) => (
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
      {archiving && (
        <ArchiveConfirmationDialog
          recordLabel={`Payable ${archiving.invoiceNumber} - ${archiving.payeeName}`}
          onCancel={() => setArchiving(null)}
          onConfirm={confirmArchive}
        />
      )}
      {deleting && (
        <DeleteConfirmationDialog
          recordLabel={`Payable ${deleting.invoiceNumber}`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteRecord(deleting)}
        />
      )}
      <SummaryStatCards
        items={[
          {
            label: "Total Payables",
            value: summary.totalPayables,
            icon: Wallet,
            onClick: () => {
              setFilters({
                ...EMPTY_FILTERS,
                paymentStatus: "All",
              });
              setShowFilters(false);
              setPage(1);
            },
          },
          {
            label: "Unpaid",
            value: summary.unpaid,
            icon: Clock3,
            onClick: () => {
              setFilters({
                ...EMPTY_FILTERS,
                paymentStatus: "Unpaid",
              });
              setPage(1);
            },
          },
          {
            label: "Paid",
            value: summary.paid,
            icon: CheckCircle2,
            onClick: () => {
              setFilters({
                ...EMPTY_FILTERS,
                paymentStatus: "Paid",
              });
              setPage(1);
            },
          },
          {
            label: "Overdue",
            value: summary.overdue,
            icon: AlertCircle,
            onClick: () => {
              setFilters({
                ...EMPTY_FILTERS,
                paymentStatus: "Overdue",
              });
              setPage(1);
            },
          },
        ]}
      />

      <section className="max-w-full space-y-4">


        {showCategories && user.permissions.manageCategories && (
          <div className="rounded-lg border border-[#d0e3ef] bg-[#f4f9fd] p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">
              Manage categories
            </p>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="input flex-1"
                placeholder="New category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  const result = payableService.addCategory(newCategory);
                  if (!result.ok) {
                    notify(result.errors.form ?? "Unable to add category.");
                    return;
                  }
                  setNewCategory("");
                  notify("Category added.");
                  onChanged();
                }}
              >
                <Plus size={15} /> Add
              </button>
            </div>
            <ul className="overflow-hidden rounded-lg divide-y divide-[#e1eef6] border border-[#d0e3ef] bg-white">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                >
                  <span>
                    {c.name}
                    {!c.isActive && (
                      <span className="ml-2"><StatusBadge value="Inactive" /></span>
                    )}
                  </span>
                  {c.isActive && (
                    <button
                      type="button"
                      className="text-[11px] text-red-700 hover:underline"
                      onClick={() => {
                        const result = payableService.deactivateCategory(c.id);
                        if (!result.ok) {
                          notify(result.errors.form ?? "Unable to deactivate.");
                          return;
                        }
                        notify("Category deactivated.");
                        onChanged();
                      }}
                    >
                      Deactivate
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 w-full flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
              <input
                className="input pl-10 pr-10"
                aria-label="Search payables"
                placeholder="Search payee, invoice, description, reference…"
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
                aria-expanded={showFilters}
                aria-controls="payable-filter-panel"
              >
                <SlidersHorizontal size={15} />
                {showFilters ? "Hide filters" : "More filters"}
              </button>
              <button
                className="secondary-btn w-full sm:w-auto"
                type="button"
                onClick={() => {
                  toggleSort("payeeName");
                  setPage(1);
                }}
                aria-label="Sort payables by payee alphabetically"
              >
                <ArrowUpDown size={15} />
                {sort.key === "payeeName" && sort.direction === "desc" ? "Z-A" : "A-Z"}
              </button>
              <button type="button" onClick={onOpenReports} className="secondary-btn w-full sm:w-auto">
                <FileText size={15} /> Reports
              </button>
              {user.permissions.manageCategories && (
                <button type="button" onClick={() => setShowCategories((visible) => !visible)} className="secondary-btn w-full sm:w-auto">
                  <LayoutGrid size={15} aria-hidden="true" /> Categories
                </button>
              )}
            </div>
          </div>

          <ActiveFilters
            filters={filters}
            defaults={EMPTY_FILTERS}
            valueLabels={{ categoryId: Object.fromEntries(categories.map((category) => [String(category.id), category.name])) }}
            matched={filtered.length}
            total={records.filter((record) => filters.includeArchived || !record.archivedAt).length}
            onRemove={(key) => setFilter(key, EMPTY_FILTERS[key])}
            onClear={() => { setFilters({ ...EMPTY_FILTERS }); setPage(1); }}
          />
          {showFilters && (
            <div id="payable-filter-panel" className="grid gap-3 rounded-lg border border-[#d0e3ef] bg-[#f4f9fd] p-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="field-label">Payee name</span>
                <input
                  className="input mt-2"
                  value={filters.payeeName}
                  onChange={(e) => setFilter("payeeName", e.target.value)}
                />
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
                <span className="field-label">Description</span>
                <input
                  className="input mt-2"
                  value={filters.description}
                  onChange={(e) => setFilter("description", e.target.value)}
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
                <span className="field-label">Category</span>
                <select
                  className="input mt-2"
                  value={filters.categoryId === "All" ? "All" : String(filters.categoryId)}
                  onChange={(e) =>
                    setFilter(
                      "categoryId",
                      e.target.value === "All" ? "All" : Number(e.target.value),
                    )
                  }
                >
                  <option value="All">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {!c.isActive ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Payment status</span>
                <select
                  className="input mt-2"
                  value={filters.paymentStatus}
                  onChange={(e) =>
                    setFilter(
                      "paymentStatus",
                      e.target.value as PayableFilters["paymentStatus"],
                    )
                  }
                >
                  <option value="All">All payment statuses</option>
                  {PAYMENT_STATUSES.map((s) => (
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
                      e.target.value as PayableFilters["paymentMethod"],
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
                  <DateInput
                    type="date"
                    className="input"
                    value={filters.invoiceDateFrom}
                    onChange={(e) => setFilter("invoiceDateFrom", e.target.value)}
                  />
                  <DateInput
                    type="date"
                    className="input"
                    value={filters.invoiceDateTo}
                    onChange={(e) => setFilter("invoiceDateTo", e.target.value)}
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <span className="field-label">Due date range</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <DateInput
                    type="date"
                    className="input"
                    value={filters.dueDateFrom}
                    onChange={(e) => setFilter("dueDateFrom", e.target.value)}
                  />
                  <DateInput
                    type="date"
                    className="input"
                    value={filters.dueDateTo}
                    onChange={(e) => setFilter("dueDateTo", e.target.value)}
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
                        aria-label={`Open payable ${row.invoiceNumber}`}
                      >
                        {row.invoiceNumber}
                      </button>
                      <p className="mt-1 truncate text-xs text-[#555]">{row.payeeName}</p>
                      <p className="mt-1 text-[10px] text-[#888]">
                        {row.categoryName} · Due {formatDate(row.dueDate)}
                      </p>
                    </div>
                    {rowActions(row)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={row.paymentStatus} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#777]">
                      Paid {peso.format(row.amountPaid)} / {peso.format(row.totalAmount)}
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
                    <SortHeader label="Payee" sortKey="payeeName" />
                    <SortHeader label="Invoice" sortKey="invoiceNumber" />
                    <th className="hidden 2xl:table-cell">
                      <button
                        onClick={() => toggleSort("categoryName")}
                        className="inline-flex items-center gap-1"
                      >
                        Category
                      </button>
                    </th>
                    <SortHeader label="Due" sortKey="dueDate" />
                    <SortHeader label="Total" sortKey="totalAmount" />
                    <SortHeader label="Paid" sortKey="amountPaid" />
                    <SortHeader label="Balance" sortKey="remainingBalance" />
                    <SortHeader label="Payment" sortKey="paymentStatus" />
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
                      <td className="overflow-hidden text-ellipsis">
                        <strong className="block truncate text-xs">{row.payeeName}</strong>
                        <span className="mt-1 block truncate text-[10px] text-[#888]">
                          {row.description}
                        </span>
                      </td>
                      <td className="overflow-hidden text-ellipsis font-semibold text-[#1f6ea6]">
                        <button type="button" className="block max-w-full truncate text-left hover:underline" onClick={() => { setMenu(null); onView(row.id); }} aria-label={`Open payable ${row.invoiceNumber}`}>
                          {row.invoiceNumber}
                        </button>
                      </td>
                      <td className="hidden overflow-hidden text-ellipsis 2xl:table-cell">
                        {row.categoryName}
                      </td>
                      <td className="overflow-hidden text-ellipsis">
                        {formatDate(row.dueDate)}
                      </td>
                      <td className="overflow-hidden text-ellipsis">
                        {peso.format(row.totalAmount)}
                      </td>
                      <td className="overflow-hidden text-ellipsis">
                        {peso.format(row.amountPaid)}
                      </td>
                      <td className="overflow-hidden text-ellipsis font-semibold">
                        {peso.format(row.remainingBalance)}
                      </td>
                      <td>
                        <StatusBadge value={row.paymentStatus} />
                      </td>
                      <td onClick={(event) => event.stopPropagation()}>
                        {rowActions(row)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState title="No payables found" onAdd={onAdd} />
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
    </div>
  );
}
