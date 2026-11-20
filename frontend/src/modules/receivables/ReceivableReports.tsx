import { ReportDateRange, reportDateRangeLabel, useReportDateRanges, inReportDateRange } from "@/components/ReportDateRange";
import { Download, FileText, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { usePrintReport } from "@/components/usePrintReport";
import { receivableService } from "./store";
import type {
  ReceivableCollection,
  ReceivableReportKind,
  ReceivableViewModel,
} from "./types";
import { PanelTitle, StatusBadge } from "./ui";
import { downloadCsv, formatDate, peso, validCollections } from "./utils";

type Props = {
  records: ReceivableViewModel[];
  onBack: () => void;
  notify: (message: string) => void;
};

const REPORTS: { kind: ReceivableReportKind; title: string; detail: string }[] = [
  {
    kind: "complete_register",
    title: "Complete Receivable Register",
    detail: "Full authorized receivable listing with derived balances",
  },
  {
    kind: "unpaid",
    title: "Unpaid Receivables Report",
    detail: "Receivables with no valid collections",
  },
  {
    kind: "partial",
    title: "Partially Collected Receivables Report",
    detail: "Receivables with partial collection progress",
  },
  {
    kind: "paid",
    title: "Paid Receivables Report",
    detail: "Receivables fully collected",
  },
  {
    kind: "overdue",
    title: "Overdue Receivables Report",
    detail: "Receivables past due with remaining balance",
  },
  {
    kind: "outstanding_balance",
    title: "Outstanding Balance Report",
    detail: "All receivables with remaining balance greater than zero",
  },
  {
    kind: "collections_by_date",
    title: "Collections by Date",
    detail: "Valid collection transactions ordered by date",
  },
  {
    kind: "collections_by_customer",
    title: "Collections by Customer",
    detail: "Valid collection totals grouped by customer",
  },
  {
    kind: "collections_by_method",
    title: "Collections by Payment Method",
    detail: "Valid collection totals grouped by method",
  },
  {
    kind: "collections_by_bank",
    title: "Collections by Bank",
    detail: "Valid collection totals grouped by bank",
  },
  {
    kind: "follow_up",
    title: "Collection Follow-up Report",
    detail: "Scheduled and historical follow-up activity",
  },
  {
    kind: "by_prepared_by",
    title: "Receivables by Prepared By",
    detail: "Grouped summary by preparer",
  },
  {
    kind: "by_date_range",
    title: "Receivables by Date Range",
    detail: "Filter by invoice date range before export",
  },
];

function hasDateColumn(kind: ReceivableReportKind) {
  return !['collections_by_customer', 'collections_by_method', 'collections_by_bank', 'by_prepared_by'].includes(kind);
}

function activeRecords(records: ReceivableViewModel[]) {
  return records.filter((r) => !r.archivedAt);
}

function selectReceivableRows(
  kind: ReceivableReportKind,
  records: ReceivableViewModel[],
  dateFrom: string,
  dateTo: string,
): ReceivableViewModel[] {
  const active = activeRecords(records).filter((r) => inReportDateRange(r.invoiceDate, dateFrom, dateTo));

  switch (kind) {
    case "complete_register":
      return active;
    case "unpaid":
      return active.filter((r) => r.collectionStatus === "Unpaid");
    case "partial":
      return active.filter((r) => r.collectionStatus === "Partial");
    case "paid":
      return active.filter((r) => r.collectionStatus === "Paid");
    case "overdue":
      return active.filter((r) => r.collectionStatus === "Overdue");
    case "outstanding_balance":
      return active.filter((r) => r.remainingBalance > 0);
    case "by_date_range":
      return active.filter((r) => {
        if (dateFrom && r.invoiceDate < dateFrom) return false;
        if (dateTo && r.invoiceDate > dateTo) return false;
        return true;
      });
    case "by_prepared_by":
      return active;
    default:
      return active;
  }
}

function receivableExportRows(rows: ReceivableViewModel[]) {
  return rows.map((r) => ({
    InvoiceNumber: r.invoiceNumber,
    CustomerName: r.customerName,
    ClientID: r.clientId,
    ContactNumber: r.contactNumber,
    Email: r.emailAddress,
    TransactionDate: r.transactionDate,
    InvoiceDate: r.invoiceDate,
    DueDate: r.dueDate,
    TotalReceivable: r.totalReceivableAmount.toFixed(2),
    AmountPaid: r.amountPaid.toFixed(2),
    RemainingBalance: r.remainingBalance.toFixed(2),
    PaymentMethod: r.displayPaymentMethod ?? "",
    CollectionStatus: r.collectionStatus,
    DaysOverdue: r.daysOverdue,
    FollowUpDate: r.collectionFollowUpDate ?? "",
    PreparedBy: r.preparedByName,
    ReferenceNumber: r.referenceNumber,
  }));
}

function collectionExportRows(
  collections: ReceivableCollection[],
  records: ReceivableViewModel[],
) {
  const byId = new Map(records.map((r) => [r.id, r]));
  return validCollections(collections).map((c) => {
    const receivable = byId.get(c.receivableId);
    return {
      CollectionId: c.id,
      InvoiceNumber: receivable?.invoiceNumber ?? "",
      CustomerName: receivable?.customerName ?? "",
      CollectionDate: c.collectionDate,
      AmountCollected: c.amountCollected.toFixed(2),
      PaymentMethod: c.paymentMethod,
      PaymentReference: c.paymentReferenceNumber,
      BankName: c.bankName ?? "",
      CheckNumber: c.checkNumber ?? "",
      RecordedBy: c.recordedByName,
    };
  });
}

function groupCollectionsBy(
  collections: ReceivableCollection[],
  records: ReceivableViewModel[],
  key: "customer" | "method" | "bank",
) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const valid = validCollections(collections);
  const map = new Map<string, { count: number; total: number }>();

  for (const c of valid) {
    let groupKey = "";
    if (key === "customer") groupKey = byId.get(c.receivableId)?.customerName ?? "Unknown";
    else if (key === "method") groupKey = c.paymentMethod;
    else groupKey = c.bankName?.trim() || "Not specified";

    const cur = map.get(groupKey) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += c.amountCollected;
    map.set(groupKey, cur);
  }

  const label =
    key === "customer" ? "Customer" : key === "method" ? "PaymentMethod" : "BankName";

  return [...map.entries()].map(([name, stats]) => ({
    [label]: name,
    Collections: stats.count,
    TotalCollected: stats.total.toFixed(2),
  }));
}

function preparedByExport(rows: ReceivableViewModel[]) {
  const map = new Map<
    string,
    { count: number; total: number; paid: number; remaining: number }
  >();
  for (const r of rows) {
    const cur = map.get(r.preparedByName) ?? {
      count: 0,
      total: 0,
      paid: 0,
      remaining: 0,
    };
    cur.count += 1;
    cur.total += r.totalReceivableAmount;
    cur.paid += r.amountPaid;
    cur.remaining += r.remainingBalance;
    map.set(r.preparedByName, cur);
  }
  return [...map.entries()].map(([name, stats]) => ({
    PreparedBy: name,
    Receivables: stats.count,
    TotalReceivable: stats.total.toFixed(2),
    AmountPaid: stats.paid.toFixed(2),
    RemainingBalance: stats.remaining.toFixed(2),
  }));
}

export function ReceivableReports({ records, onBack, notify }: Props) {
  const { printReport, printSheet } = usePrintReport();
  const user = receivableService.getUser();
  const allCollections = useMemo(() => receivableService.allCollections(), [records]);
  const allFollowUps = useMemo(() => receivableService.allFollowUps(), [records]);
  const { rangeFor: storedRangeFor, setRange } = useReportDateRanges<ReceivableReportKind>();
  const rangeFor = (kind: ReceivableReportKind) => hasDateColumn(kind) ? storedRangeFor(kind) : { from: "", to: "" };
  const [active, setActive] = useState<ReceivableReportKind>("complete_register");
  const { from: dateFrom, to: dateTo } = rangeFor(active);

  const previewReceivables = useMemo(
    () => selectReceivableRows(active, records, dateFrom, dateTo),
    [active, records, dateFrom, dateTo],
  );

  const reportCount = (kind: ReceivableReportKind) => {
    const { from: dateFrom, to: dateTo } = rangeFor(kind);
    const collections = allCollections.filter((c) => inReportDateRange(c.collectionDate, dateFrom, dateTo));
    const followUps = allFollowUps.filter((f) => inReportDateRange(f.followUpDate, dateFrom, dateTo));
    if (kind === "collections_by_date") return validCollections(collections).length;
    if (kind === "collections_by_customer")
      return groupCollectionsBy(collections, records, "customer").length;
    if (kind === "collections_by_method")
      return groupCollectionsBy(collections, records, "method").length;
    if (kind === "collections_by_bank")
      return groupCollectionsBy(collections, records, "bank").length;
    if (kind === "follow_up") return followUps.length;
    if (kind === "by_prepared_by")
      return preparedByExport(selectReceivableRows(kind, records, dateFrom, dateTo))
        .length;
    return selectReceivableRows(kind, records, dateFrom, dateTo).length;
  };

  const reportRows = (kind: ReceivableReportKind): Record<string, string | number>[] => {
    const { from: dateFrom, to: dateTo } = rangeFor(kind);
    const collections = allCollections.filter((c) => inReportDateRange(c.collectionDate, dateFrom, dateTo));
    const followUps = allFollowUps.filter((f) => inReportDateRange(f.followUpDate, dateFrom, dateTo));
    let exported: Record<string, string | number>[] = [];
    if (kind === "collections_by_date") {
      exported = collectionExportRows(collections, records);
    } else if (kind === "collections_by_customer") {
      exported = groupCollectionsBy(collections, records, "customer");
    } else if (kind === "collections_by_method") {
      exported = groupCollectionsBy(collections, records, "method");
    } else if (kind === "collections_by_bank") {
      exported = groupCollectionsBy(collections, records, "bank");
    } else if (kind === "follow_up") {
      const byId = new Map(records.map((r) => [r.id, r]));
      exported = followUps.map((f) => {
        const receivable = byId.get(f.receivableId);
        return {
          InvoiceNumber: receivable?.invoiceNumber ?? "",
          CustomerName: receivable?.customerName ?? "",
          FollowUpDate: f.followUpDate,
          Notes: f.followUpNotes,
          Result: f.followUpResult ?? "",
          NextFollowUpDate: f.nextFollowUpDate ?? "",
          FollowedUpBy: f.followedUpByName,
        };
      });
    } else if (kind === "by_prepared_by") {
      exported = preparedByExport(selectReceivableRows(kind, records, dateFrom, dateTo));
    } else {
      exported = receivableExportRows(
        selectReceivableRows(kind, records, dateFrom, dateTo),
      );
    }

    return exported;
  };

  const validDateRange = (kind: ReceivableReportKind) => {
    const { from: dateFrom, to: dateTo } = rangeFor(kind);
    if (dateFrom && dateTo && dateFrom > dateTo) {
      notify("The start date must be on or before the end date.");
      return false;
    }
    return true;
  };

  const runExport = (kind: ReceivableReportKind) => {
    if (!validDateRange(kind)) return;
    if (!user.permissions.exportReports) {
      notify("You are not authorized to export reports.");
      return;
    }

    const exported = reportRows(kind);

    if (!exported.length) {
      notify("No records match this report.");
      return;
    }
    downloadCsv(`oasis-receivable-${kind}.csv`, exported);
    notify("Authorized export generated.");
  };

  const previewCollections = allCollections.filter((c) => inReportDateRange(c.collectionDate, dateFrom, dateTo));
  const previewFollowUps = allFollowUps.filter((f) => inReportDateRange(f.followUpDate, dateFrom, dateTo));

  const isCollectionKind =
    active === "collections_by_date" ||
    active === "collections_by_customer" ||
    active === "collections_by_method" ||
    active === "collections_by_bank";

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden">
      <section className="panel overflow-hidden">
        <PanelTitle
          onBack={onBack}
          title="Receivable reports"
          subtitle="Filters, printing, and authorized exports"
        />

      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => {
          const count = reportCount(report.kind);
          return (
            <section
              key={report.kind}
              className={`panel p-5 ${active === report.kind ? "section-highlight" : ""}`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setActive(report.kind)}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center bg-[#e7f3fb] text-[#1f6ea6]">
                    <FileText size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold">{report.title}</h3>
                    <p className="mt-1 text-[11px] leading-5 text-[#777]">{report.detail}</p>
                  </div>
                </div>
              </button>
              {hasDateColumn(report.kind) && (
                <ReportDateRange
                  compact
                  dateLabel={report.kind.startsWith("collections_") ? "Collection date" : report.kind === "follow_up" ? "Follow-up date" : "Invoice date"}
                  dateFrom={rangeFor(report.kind).from}
                  dateTo={rangeFor(report.kind).to}
                  onChange={(from, to) => {
                    setRange(report.kind, from, to);
                    setActive(report.kind);
                  }}
                />
              )}
              <div className="my-4 grid grid-cols-2 gap-3 border-y border-[#d7e8f3] py-3">
                <div>
                  <span className="field-label">Records</span>
                  <strong className="mt-1 block text-lg">{count}</strong>
                </div>
                <div>
                  <span className="field-label">Format</span>
                  <strong className="mt-1 block text-xs">CSV / Print</strong>
                </div>
              </div>
              <div className="flex gap-2 px-2">
                <button
                  className="secondary-btn flex-1"
                  onClick={() => {
                    if (!validDateRange(report.kind)) return;
                    setActive(report.kind);
                    const rows = reportRows(report.kind).map((row) => {
                      if (!("TotalReceivable" in row) || report.kind === "by_prepared_by") return row;
                      return {
                        Invoice: row.InvoiceNumber,
                        Customer: row.CustomerName,
                        DueDate: row.DueDate,
                        Total: row.TotalReceivable,
                        Collected: row.AmountPaid,
                        Remaining: row.RemainingBalance,
                        Status: row.CollectionStatus,
                      };
                    });
                    void printReport(hasDateColumn(report.kind) && (rangeFor(report.kind).from || rangeFor(report.kind).to) ? `${report.title} · ${reportDateRangeLabel(rangeFor(report.kind).from, rangeFor(report.kind).to)}` : report.title, rows);
                  }}
                >
                  <Printer size={14} /> Print
                </button>
                <button className="primary-btn flex-1" onClick={() => runExport(report.kind)}>
                  <Download size={14} /> Export
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel print:border-0">
        <PanelTitle
          title="Report preview"
          subtitle={`${REPORTS.find((r) => r.kind === active)?.title ?? ""} · ${reportCount(active)} rows${hasDateColumn(active) ? ` · ${reportDateRangeLabel(dateFrom, dateTo)}` : ""}`}
        />
        <div className="w-full">
          {active === "collections_by_date" ? (
            <table className="w-full table-fixed">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th className="hidden sm:table-cell">Method</th>
                </tr>
              </thead>
              <tbody>
                {validCollections(previewCollections)
                  .slice(0, 25)
                  .map((c) => {
                    const receivable = records.find((r) => r.id === c.receivableId);
                    return (
                      <tr key={c.id}>
                        <td>{formatDate(c.collectionDate)}</td>
                        <td className="overflow-hidden text-ellipsis">
                          {receivable?.invoiceNumber ?? "—"}
                        </td>
                        <td className="overflow-hidden text-ellipsis">
                          {receivable?.customerName ?? "—"}
                        </td>
                        <td>{peso.format(c.amountCollected)}</td>
                        <td className="hidden sm:table-cell">{c.paymentMethod}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          ) : active === "follow_up" ? (
            <table className="w-full table-fixed">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th className="hidden sm:table-cell">Next</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {previewFollowUps.slice(0, 25).map((f) => {
                  const receivable = records.find((r) => r.id === f.receivableId);
                  return (
                    <tr key={f.id}>
                      <td>{formatDate(f.followUpDate)}</td>
                      <td className="overflow-hidden text-ellipsis">
                        {receivable?.invoiceNumber ?? "—"}
                      </td>
                      <td className="overflow-hidden text-ellipsis">
                        {receivable?.customerName ?? "—"}
                      </td>
                      <td className="hidden sm:table-cell">
                        {formatDate(f.nextFollowUpDate)}
                      </td>
                      <td className="overflow-hidden text-ellipsis">{f.followedUpByName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : isCollectionKind ? (
            <table className="w-full table-fixed">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Collections</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(active === "collections_by_customer"
                  ? groupCollectionsBy(previewCollections, records, "customer")
                  : active === "collections_by_method"
                    ? groupCollectionsBy(previewCollections, records, "method")
                    : groupCollectionsBy(previewCollections, records, "bank")
                )
                  .slice(0, 25)
                  .map((row) => {
                    const values = Object.values(row);
                    return (
                      <tr key={String(values[0])}>
                        <td className="overflow-hidden text-ellipsis">{values[0]}</td>
                        <td>{values[1]}</td>
                        <td>{peso.format(Number(values[2]))}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          ) : (
            <table className="w-full table-fixed">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th className="hidden sm:table-cell">Due</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewReceivables.slice(0, 25).map((r) => (
                  <tr key={r.id}>
                    <td className="overflow-hidden text-ellipsis font-semibold">
                      {r.invoiceNumber}
                    </td>
                    <td className="overflow-hidden text-ellipsis">{r.customerName}</td>
                    <td className="hidden overflow-hidden text-ellipsis sm:table-cell">
                      {formatDate(r.dueDate)}
                    </td>
                    <td className="overflow-hidden text-ellipsis">
                      {peso.format(r.remainingBalance)}
                    </td>
                    <td className="overflow-hidden text-ellipsis">
                      <StatusBadge value={r.collectionStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      {printSheet}
    </div>
  );
}
