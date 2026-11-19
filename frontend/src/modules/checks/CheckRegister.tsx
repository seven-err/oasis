import { ArchiveConfirmationDialog } from "@/components/ArchiveConfirmationDialog";
import {
  AlertCircle,
  Archive,
  ArrowUpDown,
  CheckCircle2,
  Clock3,
  Wallet,
  FileCheck2,
  MoreHorizontal,
  Pencil,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { SummaryStatCards } from "@/components/SummaryStatCards";
import { ActiveFilters } from "@/components/ActiveFilters";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { recordRowClick } from "@/components/recordRowClick";
import { CHECK_STATUSES, CHECK_TYPES, EMPTY_FILTERS, PAGE_SIZE } from "./constants";
import { checkService } from "./store";
import type { CheckFilters, CheckRecord, CheckSort, CheckSortKey } from "./types";
import {
  EmptyState,
  PaginationBar,
  StatusBadge,
} from "./ui";
import {
  filterChecks,
  formatDate,
  peso,
  sortChecks,
  summarizeChecks,
  uniqueBanks,
} from "./utils";

type Props = {
  records: CheckRecord[];
  onAdd: () => void;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onOpenReports: () => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

export function CheckRegister({
  records,
  onAdd,
  onView,
  onEdit,
  onOpenReports,
  onChanged,
  notify,
}: Props) {
  const user = checkService.getUser();
  const [deleting, setDeleting] = useState<CheckRecord | null>(null);
  const [archiving, setArchiving] = useState<CheckRecord | null>(null);
  const [filters, setFilters] = useState<CheckFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<CheckSort>({ key: "checkDate", direction: "desc" });
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<number | null>(null);

  const summary = useMemo(() => summarizeChecks(records), [records]);
  const banks = useMemo(() => uniqueBanks(records), [records]);

  const filtered = useMemo(
    () => sortChecks(filterChecks(records, filters), sort),
    [records, filters, sort],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const setFilter = <K extends keyof CheckFilters>(key: K, value: CheckFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const toggleSort = (key: CheckSortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, direction: s.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: CheckSortKey }) => (
    <th>
      <button onClick={() => toggleSort(sortKey)} className="inline-flex items-center gap-1">
        {label}
      </button>
    </th>
  );

  const deleteRecord = (record: CheckRecord) => {
    const result = checkService.deleteRecord(record.id);
    if (!result.ok) {
      setDeleting(null);
      notify(result.errors.form ?? "Unable to delete check.");
      return;
    }
    setDeleting(null);
    notify("Check moved to Deleted Records.");
    onChanged();
  };

  const archiveOrRestore = (record: CheckRecord) => {
    if (!user.permissions.archiveChecks) {
      notify("You are not authorized to archive checks.");
      return;
    }
    if (record.archivedAt) {
      const result = checkService.restore(record.id);
      if (result.ok) {
        notify("Check restored.");
        onChanged();
      }
      return;
    }
    setArchiving(record);
  };

  const confirmArchive = () => {
    if (!archiving) return;
    try {
      const result = checkService.archive(archiving.id);
      if (!result.ok) {
        notify(result.errors.form ?? "Unable to archive.");
        return;
      }
      setArchiving(null);
      notify("Check archived.");
      onChanged();
    } catch {
      notify("Unable to save the archive. Please try again.");
    }
  };

  const actionMenu = (row: CheckRecord) =>
    menuId === row.id ? (
      <div className="absolute right-0 top-9 z-20 w-44 border border-[#d0e3ef] bg-white p-1 shadow-xl">
        {user.permissions.editChecks && !row.archivedAt && (
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
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]"
          onClick={() => {
            setMenuId(null);
            onView(row.id);
          }}
        >
          <Printer size={14} /> Documents
        </button>
        {user.permissions.archiveChecks && (
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
        {user.permissions.archiveChecks && (
          <button
            type="button"
            className="flex w-full items-center gap-2 border-t border-[#e1eef6] px-3 py-2 text-xs text-red-700 hover:bg-red-50"
            onClick={() => {
              setMenuId(null);
              setDeleting(row);
            }}
          >
            <Trash2 size={14} /> Delete
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
    <div className="w-full max-w-full space-y-5 overflow-x-clip">
      {archiving && (
        <ArchiveConfirmationDialog
          recordLabel={`Check ${archiving.checkNumber} - ${archiving.payeeName}`}
          onCancel={() => setArchiving(null)}
          onConfirm={confirmArchive}
        />
      )}
      {deleting && (
        <DeleteConfirmationDialog
          recordLabel={`Check ${deleting.checkNumber}`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteRecord(deleting)}
        />
      )}
      <SummaryStatCards
        items={[
          {
            label: "Total Checks",
            value: summary.total,
            icon: Wallet,
            onClick: () => {
              setFilter("checkStatus", "All");
              setShowFilters(false);
            },
          },
          {
            label: "Pending",
            value: summary.pending,
            icon: Clock3,
            onClick: () => setFilter("checkStatus", "Pending"),
          },
          {
            label: "Cleared",
            value: summary.cleared,
            icon: CheckCircle2,
            onClick: () => setFilter("checkStatus", "Cleared"),
          },
          {
            label: "Returned",
            value: summary.bounced,
            icon: AlertCircle,
            onClick: () => setFilter("checkStatus", "Bounced"),
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
                placeholder="Search checks…"
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
                aria-label="Sort checks by payee alphabetically"
              >
                <ArrowUpDown size={15} />
                {sort.key === "payeeName" && sort.direction === "desc" ? "Z-A" : "A-Z"}
              </button>
              <button type="button" onClick={onOpenReports} className="secondary-btn w-full sm:w-auto">
                <FileCheck2 size={15} /> Reports
              </button>
            </div>
          </div>

          <ActiveFilters
            filters={filters}
            defaults={EMPTY_FILTERS}
            matched={filtered.length}
            total={records.filter((record) => filters.includeArchived || !record.archivedAt).length}
            onRemove={(key) => setFilter(key, EMPTY_FILTERS[key])}
            onClear={() => { setFilters({ ...EMPTY_FILTERS }); setPage(1); }}
          />
          {showFilters && (
            <div className="grid gap-3 border border-[#d0e3ef] bg-[#f4f9fd] p-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="field-label">Check type</span>
                <select
                  className="input mt-2"
                  value={filters.checkType}
                  onChange={(e) => setFilter("checkType", e.target.value as CheckFilters["checkType"])}
                >
                  <option value="All">All types</option>
                  {CHECK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Bank name</span>
                <select
                  className="input mt-2"
                  value={filters.bankName}
                  onChange={(e) => setFilter("bankName", e.target.value)}
                >
                  <option value="">All banks</option>
                  {banks.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Check status</span>
                <select
                  className="input mt-2"
                  value={filters.checkStatus}
                  onChange={(e) =>
                    setFilter("checkStatus", e.target.value as CheckFilters["checkStatus"])
                  }
                >
                  <option value="All">All statuses</option>
                  {CHECK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
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
              {(
                [
                  ["checkDateFrom", "checkDateTo", "Check date"],
                  ["dueDateFrom", "dueDateTo", "Due date"],
                  ["receivedIssuedFrom", "receivedIssuedTo", "Date received/issued"],
                  ["depositDateFrom", "depositDateTo", "Deposit date"],
                  ["clearingDateFrom", "clearingDateTo", "Clearing date"],
                ] as const
              ).map(([fromKey, toKey, label]) => (
                <div key={label} className="md:col-span-2 xl:col-span-2">
                  <span className="field-label">{label} range</span>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      className="input"
                      value={filters[fromKey]}
                      onChange={(e) => setFilter(fromKey, e.target.value)}
                    />
                    <input
                      type="date"
                      className="input"
                      value={filters[toKey]}
                      onChange={(e) => setFilter(toKey, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel max-w-full overflow-hidden">
        {pageRows.length ? (
          <>
            {/* Mobile / tablet cards — no horizontal scroll */}
            <div className="divide-y divide-[#e1eef6] lg:hidden">
              {pageRows.map((row) => (
                <div
                  key={row.id}
                  className={`relative cursor-pointer space-y-3 p-4 transition-colors hover:bg-[#eef6fb] ${row.archivedAt ? "opacity-60" : ""}`}
                  onClick={recordRowClick(() => {
                    setMenuId(null);
                    onView(row.id);
                  })}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="truncate text-left text-sm font-semibold text-[#1f6ea6]"
                        onClick={() => {
                          setMenuId(null);
                          onView(row.id);
                        }}
                        aria-label={`Open check for ${row.payeeName}`}
                      >
                        {row.payeeName}
                      </button>
                      <p className="mt-1 text-[10px] text-[#888]">
                        {row.checkType} · {row.bankName}
                      </p>
                    </div>
                    <div className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
                      <button
                        className="table-action"
                        aria-label={`Actions for ${row.checkNumber}`}
                        onClick={() => setMenuId(menuId === row.id ? null : row.id)}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {actionMenu(row)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge value={row.checkStatus} />
                    <strong className="text-sm">{peso.format(row.checkAmount)}</strong>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-[#777]">
                    <span>Check date · {formatDate(row.checkDate)}</span>
                    <span>Due · {formatDate(row.dueDate)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table — essential columns only, fits viewport */}
            <div className="hidden w-full lg:block">
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    <SortHeader label="Type" sortKey="checkType" />
                    <SortHeader label="Payee" sortKey="payeeName" />
                    <th className="hidden xl:table-cell">
                      <button
                        onClick={() => toggleSort("bankName")}
                        className="inline-flex items-center gap-1"
                      >
                        Bank
                      </button>
                    </th>
                    <SortHeader label="Amount" sortKey="checkAmount" />
                    <th className="hidden xl:table-cell">
                      <button
                        onClick={() => toggleSort("dueDate")}
                        className="inline-flex items-center gap-1"
                      >
                        Due
                      </button>
                    </th>
                    <SortHeader label="Status" sortKey="checkStatus" />
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
                        setMenuId(null);
                        onView(row.id);
                      })}
                    >
                      <td className="overflow-hidden text-ellipsis">
                        {row.checkType.replace(" Check", "")}
                      </td>
                      <td className="overflow-hidden text-ellipsis">
                        <button type="button" className="block max-w-full truncate text-left text-xs font-bold hover:underline" onClick={() => { setMenuId(null); onView(row.id); }} aria-label={`Open check for ${row.payeeName}`}>
                          {row.payeeName}
                        </button>
                        <span className="mt-1 block truncate text-[10px] text-[#888]">
                          {row.drawerName}
                        </span>
                      </td>
                      <td className="hidden overflow-hidden text-ellipsis xl:table-cell">
                        {row.bankName}
                      </td>
                      <td className="overflow-hidden text-ellipsis font-semibold">
                        {peso.format(row.checkAmount)}
                      </td>
                      <td className="hidden overflow-hidden text-ellipsis xl:table-cell">
                        {formatDate(row.dueDate)}
                      </td>
                      <td>
                        <StatusBadge value={row.checkStatus} />
                      </td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <div className="relative flex justify-end">
                          <button
                            className="table-action"
                            aria-label={`Actions for ${row.checkNumber}`}
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
          <EmptyState title="No checks found" onAdd={onAdd} />
        )}

        <PaginationBar
          page={currentPage}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
        />
        </div>
      </section>
    </div>
  );
}
