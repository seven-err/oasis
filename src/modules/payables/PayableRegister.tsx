import {
  AlertCircle,
  Archive,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Eye,
  FileText,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { SummaryStatCards } from "@/components/SummaryStatCards";
import {
  APPROVAL_STATUSES,
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
import { EmptyState, PaginationBar, PanelTitle, StatusBadge } from "./ui";
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
  onApprove: (id: number) => void;
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
  onApprove,
  onOpenReports,
  onChanged,
  notify,
}: Props) {
  const user = payableService.getUser();
  const categories = useMemo(() => payableService.categories(false), [records]);
  const [filters, setFilters] = useState<PayableFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [sort, setSort] = useState<PayableSort>({ key: "dueDate", direction: "asc" });
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<number | null>(null);

  const summary = useMemo(() => summarizePayables(records), [records]);

  const filtered = useMemo(
    () => sortPayables(filterPayables(records, filters), sort),
    [records, filters, sort],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
        <ChevronDown
          size={12}
          className={sort.key === sortKey && sort.direction === "asc" ? "rotate-180" : ""}
        />
      </button>
    </th>
  );

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
    if (!window.confirm("Archive this payable? Historical information will be retained.")) return;
    const result = payableService.archive(record.id);
    if (result.ok) {
      notify("Payable archived.");
      onChanged();
    }
  };

  const canPay = (row: PayableViewModel) =>
    user.permissions.recordPayments &&
    !row.archivedAt &&
    row.approvalStatus === "Approved" &&
    row.remainingBalance > 0;

  const actionMenu = (row: PayableViewModel) =>
    menuId === row.id ? (
      <div className="absolute right-0 top-9 z-20 w-52 border border-[#d0e3ef] bg-white p-1 shadow-xl">
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
          onClick={() => {
            setMenuId(null);
            onView(row.id);
          }}
        >
          <Eye size={14} /> View
        </button>
        {user.permissions.editPayables && !row.archivedAt && (
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
            onClick={() => {
              setMenuId(null);
              onEdit(row.id);
            }}
          >
            <Pencil size={14} /> Edit
          </button>
        )}
        {user.permissions.approvePayables &&
          !row.archivedAt &&
          row.approvalStatus === "Pending" && (
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
              onClick={() => {
                setMenuId(null);
                onApprove(row.id);
              }}
            >
              <CheckCircle2 size={14} /> Approve / Reject
            </button>
          )}
        {canPay(row) && (
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
            onClick={() => {
              setMenuId(null);
              onRecordPayment(row.id);
            }}
          >
            <Plus size={14} /> Record payment
          </button>
        )}
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
          onClick={() => {
            setMenuId(null);
            onRecordPayment(row.id);
          }}
        >
          <History size={14} /> Payment history
        </button>
        {user.permissions.archivePayables && (
          <button
            className="flex w-full items-center gap-2 border-t border-[#e1eef6] px-3 py-2 text-xs text-red-700 hover:bg-red-50"
            onClick={() => {
              setMenuId(null);
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
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#888] hover:bg-[#e7f3fb]"
          onClick={() => setMenuId(null)}
        >
          <X size={14} /> Close
        </button>
      </div>
    ) : null;

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden">
      <SummaryStatCards
        items={[
          {
            label: "Total Payables",
            value: summary.totalPayables,
            icon: Copy,
            onClick: () => {
              setFilters({
                ...EMPTY_FILTERS,
                paymentStatus: "All",
                approvalStatus: "All",
              });
              setShowFilters(false);
              setPage(1);
            },
          },
          {
            label: "Pending",
            value: summary.pendingApproval,
            icon: Clock3,
            onClick: () => {
              setFilters({
                ...EMPTY_FILTERS,
                approvalStatus: "Pending",
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

      <section className="panel max-w-full overflow-hidden">
        <PanelTitle
          title="Payable register"
          subtitle={`${filtered.length} of ${records.filter((r) => filters.includeArchived || !r.archivedAt).length} records`}
          action={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {user.permissions.manageCategories && (
                <button
                  type="button"
                  onClick={() => setShowCategories((x) => !x)}
                  className="secondary-btn w-full sm:w-auto"
                >
                  Categories
                </button>
              )}
              <button onClick={onOpenReports} className="secondary-btn w-full sm:w-auto">
                <FileText size={15} /> Reports
              </button>
            </div>
          }
        />

        {showCategories && user.permissions.manageCategories && (
          <div className="border-b border-[#d0e3ef] bg-[#f4f9fd] p-4">
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
            <ul className="divide-y divide-[#e1eef6] border border-[#d0e3ef] bg-white">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                >
                  <span>
                    {c.name}
                    {!c.isActive && (
                      <span className="ml-2 text-[10px] text-[#999]">Inactive</span>
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

        <div className="flex flex-col gap-3 border-b border-[#d0e3ef] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 w-full flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
              <input
                className="input pl-10 pr-10"
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
            </div>
          </div>

          {showFilters && (
            <div className="grid gap-3 border border-[#d0e3ef] bg-[#f4f9fd] p-4 md:grid-cols-2 xl:grid-cols-4">
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
                <span className="field-label">Approval status</span>
                <select
                  className="input mt-2"
                  value={filters.approvalStatus}
                  onChange={(e) =>
                    setFilter(
                      "approvalStatus",
                      e.target.value as PayableFilters["approvalStatus"],
                    )
                  }
                >
                  <option value="All">All approval statuses</option>
                  {APPROVAL_STATUSES.map((s) => (
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
            </div>
          )}
        </div>

        {pageRows.length ? (
          <>
            <div className="divide-y divide-[#e1eef6] xl:hidden">
              {pageRows.map((row) => (
                <div
                  key={row.id}
                  className={`relative space-y-3 p-4 ${row.archivedAt ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="truncate text-left text-sm font-semibold text-[#1f6ea6]"
                        onClick={() => onView(row.id)}
                      >
                        {row.invoiceNumber}
                      </button>
                      <p className="mt-1 truncate text-xs text-[#555]">{row.payeeName}</p>
                      <p className="mt-1 text-[10px] text-[#888]">
                        {row.categoryName} · Due {formatDate(row.dueDate)}
                      </p>
                    </div>
                    <div className="relative shrink-0">
                      <button
                        className="table-action"
                        aria-label={`Actions for ${row.invoiceNumber}`}
                        onClick={() => setMenuId(menuId === row.id ? null : row.id)}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {actionMenu(row)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={row.paymentStatus} />
                    <StatusBadge value={row.approvalStatus} />
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
                        <ChevronDown
                          size={12}
                          className={
                            sort.key === "categoryName" && sort.direction === "asc"
                              ? "rotate-180"
                              : ""
                          }
                        />
                      </button>
                    </th>
                    <SortHeader label="Due" sortKey="dueDate" />
                    <SortHeader label="Total" sortKey="totalAmount" />
                    <SortHeader label="Paid" sortKey="amountPaid" />
                    <SortHeader label="Balance" sortKey="remainingBalance" />
                    <SortHeader label="Payment" sortKey="paymentStatus" />
                    <SortHeader label="Approval" sortKey="approvalStatus" />
                    <th className="w-12">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className={row.archivedAt ? "opacity-60" : ""}>
                      <td className="overflow-hidden text-ellipsis">
                        <strong className="block truncate text-xs">{row.payeeName}</strong>
                        <span className="mt-1 block truncate text-[10px] text-[#888]">
                          {row.description}
                        </span>
                      </td>
                      <td className="overflow-hidden text-ellipsis font-semibold text-[#1f6ea6]">
                        {row.invoiceNumber}
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
                      <td>
                        <StatusBadge value={row.approvalStatus} />
                      </td>
                      <td>
                        <div className="relative flex justify-end">
                          <button
                            className="table-action"
                            aria-label={`Actions for ${row.invoiceNumber}`}
                            onClick={() => setMenuId(menuId === row.id ? null : row.id)}
                          >
                            <MoreHorizontal size={17} />
                          </button>
                          {actionMenu(row)}
                        </div>
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
      </section>
    </div>
  );
}
