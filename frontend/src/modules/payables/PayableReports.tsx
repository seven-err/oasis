import { ReportDateRange, reportDateRangeLabel, useReportDateRanges, inReportDateRange } from "@/components/ReportDateRange";
import { Download, FileText, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { usePrintReport } from "@/components/usePrintReport";
import { payableService } from "./store";
import type { PayablePayment, PayableReportKind, PayableViewModel } from "./types";
import { PanelTitle } from "./ui";
import { downloadCsv, paymentMethodLabel } from "./utils";

type Props = {
  records: PayableViewModel[];
  onBack: () => void;
  notify: (message: string) => void;
};

const REPORTS: { kind: PayableReportKind; title: string; detail: string }[] = [
  {
    kind: "complete_register",
    title: "Complete Payable Record",
    detail: "Full authorized payable listing with derived balances",
  },
  {
    kind: "unpaid",
    title: "Unpaid Payables Report",
    detail: "Payables with no valid payments",
  },
  {
    kind: "partial",
    title: "Partially Paid Payables Report",
    detail: "Payables with partial payment progress",
  },
  {
    kind: "paid",
    title: "Paid Payables Report",
    detail: "Payables fully settled",
  },
  {
    kind: "overdue",
    title: "Overdue Payables Report",
    detail: "Payables past due with remaining balance",
  },
  {
    kind: "by_payee",
    title: "Payables by Payee",
    detail: "Grouped summary by supplier / payee",
  },
  {
    kind: "payment_history",
    title: "Payment History Report",
    detail: "All payment transactions including reversals",
  },
  {
    kind: "by_method",
    title: "Payments by Method",
    detail: "Valid payment totals grouped by method",
  },
  {
    kind: "by_date_range",
    title: "Payables by Date Range",
    detail: "Filter by invoice date range before export",
  },
];

function hasDateColumn(kind: PayableReportKind) {
  return !['by_payee', 'by_method'].includes(kind);
}

function activeRecords(records: PayableViewModel[]) {
  return records.filter((r) => !r.archivedAt);
}

function selectPayableRows(
  kind: PayableReportKind,
  records: PayableViewModel[],
  dateFrom: string,
  dateTo: string,
): PayableViewModel[] {
  const active = activeRecords(records).filter((r) => inReportDateRange(r.invoiceDate, dateFrom, dateTo));

  switch (kind) {
    case "complete_register":
      return active;
    case "unpaid":
      return active.filter((r) => r.paymentStatus === "Unpaid");
    case "partial":
      return active.filter((r) => r.paymentStatus === "Partial");
    case "paid":
      return active.filter((r) => r.paymentStatus === "Paid");
    case "overdue":
      return active.filter((r) => r.paymentStatus === "Overdue");
    case "by_date_range":
      return active.filter((r) => {
        if (dateFrom && r.invoiceDate < dateFrom) return false;
        if (dateTo && r.invoiceDate > dateTo) return false;
        return true;
      });
    case "by_payee":
      return active;
    default:
      return active;
  }
}

function payableExportRows(rows: PayableViewModel[]) {
  return rows.map((r) => ({
    Payee: r.payeeName,
    InvoiceNumber: r.invoiceNumber,
    Description: r.description,
    Category: r.categoryName,
    InvoiceDate: r.invoiceDate,
    DueDate: r.dueDate,
    TotalAmount: r.totalAmount.toFixed(2),
    AmountPaid: r.amountPaid.toFixed(2),
    RemainingBalance: r.remainingBalance.toFixed(2),
    PaymentStatus: r.paymentStatus,
    PaymentMethod: r.displayPaymentMethod ? paymentMethodLabel(r.displayPaymentMethod) : "",
    ReferenceNumber: r.displayReferenceNumber,
  }));
}

function groupedExport(rows: PayableViewModel[]) {
  const map = new Map<string, { count: number; total: number; paid: number; remaining: number }>();
  for (const r of rows) {
    const k = r.payeeName;
    const cur = map.get(k) ?? { count: 0, total: 0, paid: 0, remaining: 0 };
    cur.count += 1;
    cur.total += r.totalAmount;
    cur.paid += r.amountPaid;
    cur.remaining += r.remainingBalance;
    map.set(k, cur);
  }
  return [...map.entries()].map(([name, stats]) => ({
    Payee: name,
    Payables: stats.count,
    TotalAmount: stats.total.toFixed(2),
    AmountPaid: stats.paid.toFixed(2),
    RemainingBalance: stats.remaining.toFixed(2),
  }));
}

function paymentExportRows(payments: PayablePayment[], records: PayableViewModel[]) {
  const byId = new Map(records.map((r) => [r.id, r]));
  return payments.map((p) => {
    const payable = byId.get(p.payableId);
    return {
      PaymentId: p.id,
      PayableInvoice: payable?.invoiceNumber ?? "",
      Payee: payable?.payeeName ?? "",
      PaymentDate: p.paymentDate,
      AmountPaid: p.amountPaid.toFixed(2),
      PaymentMethod: paymentMethodLabel(p.paymentMethod),
      ReferenceNumber: p.referenceNumber,
      ChequeNumber: p.checkNumber ?? "",
      RecordedBy: p.recordedByName,
      IsReversal: p.isReversal ? "Yes" : "No",
      Reversed: p.reversedAt ? "Yes" : "No",
    };
  });
}

function methodExportRows(payments: PayablePayment[]) {
  const valid = payments.filter((p) => !p.isReversal && !p.reversedAt);
  const map = new Map<string, { count: number; total: number }>();
  for (const p of valid) {
    const method = paymentMethodLabel(p.paymentMethod);
    const cur = map.get(method) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += p.amountPaid;
    map.set(method, cur);
  }
  return [...map.entries()].map(([method, stats]) => ({
    PaymentMethod: method,
    Payments: stats.count,
    TotalAmount: stats.total.toFixed(2),
  }));
}

export function PayableReports({ records, onBack, notify }: Props) {
  const { printReport, printSheet } = usePrintReport();
  const user = payableService.getUser();
  const allPayments = useMemo(() => payableService.allPayments(), [records]);
  const { rangeFor: storedRangeFor, setRange } = useReportDateRanges<PayableReportKind>();
  const rangeFor = (kind: PayableReportKind) => hasDateColumn(kind) ? storedRangeFor(kind) : { from: "", to: "" };
  const [active, setActive] = useState<PayableReportKind>("complete_register");
  const { from: dateFrom, to: dateTo } = rangeFor(active);

  const reportRows = (kind: PayableReportKind): Record<string, string | number>[] => {
    const { from: dateFrom, to: dateTo } = rangeFor(kind);
    const rows = selectPayableRows(kind, records, dateFrom, dateTo);
    const payments = allPayments.filter((p) => inReportDateRange(p.paymentDate, dateFrom, dateTo));
    switch (kind) {
      case "payment_history": return paymentExportRows(payments, records);
      case "by_method": return methodExportRows(payments);
      case "by_payee": return groupedExport(rows);
      default: return payableExportRows(rows);
    }
  };

  const previewRows = (kind: PayableReportKind): Record<string, string | number>[] =>
    reportRows(kind).map((row): Record<string, string | number> => {
    if (kind === "payment_history") {
      return {
        Date: row.PaymentDate,
        Invoice: row.PayableInvoice,
        Payee: row.Payee,
        Amount: row.AmountPaid,
        Method: row.PaymentMethod,
        Status: row.IsReversal === "Yes" ? "Reversal" : row.Reversed === "Yes" ? "Reversed" : "Valid",
      };
    }
    if (kind === "by_payee") {
      return {
        Payee: row.Payee,
        Payables: row.Payables,
        Total: row.TotalAmount,
        Paid: row.AmountPaid,
        Remaining: row.RemainingBalance,
      };
    }
    if (kind === "by_method") {
      return { Method: row.PaymentMethod, Payments: row.Payments, Total: row.TotalAmount };
    }
    return {
      Invoice: row.InvoiceNumber,
      Payee: row.Payee,
      DueDate: row.DueDate,
      Total: row.TotalAmount,
      Paid: row.AmountPaid,
      Remaining: row.RemainingBalance,
      PaymentStatus: row.PaymentStatus,
    };
  });
  const preview = previewRows(active);
  const columns = preview.length ? Object.keys(preview[0]) : [];
  const reportTitle = REPORTS.find((r) => r.kind === active)?.title ?? "";
  const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
  const displayValue = (key: string, value: string | number) =>
    ["Amount", "Total", "Paid", "Remaining"].includes(key) ? currency.format(Number(value)) : value;

  const validDateRange = (kind: PayableReportKind) => {
    const { from: dateFrom, to: dateTo } = rangeFor(kind);
    if (dateFrom && dateTo && dateFrom > dateTo) {
      notify("The start date must be on or before the end date.");
      return false;
    }
    return true;
  };

  const runExport = (kind: PayableReportKind) => {
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
    downloadCsv(`oasis-payable-${kind}.csv`, exported);
    notify("Authorized export generated.");
  };

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden">
      <section className="panel overflow-hidden">
        <PanelTitle
          onBack={onBack}
          title="Payable reports"
          subtitle="Filters, printing, and authorized exports"
        />
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => {
          const count = reportRows(report.kind).length;
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
                  dateLabel={report.kind === "payment_history" || report.kind === "by_method" ? "Payment date" : "Invoice date"}
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
                    flushSync(() => setActive(report.kind));
                    printReport(hasDateColumn(report.kind) && (rangeFor(report.kind).from || rangeFor(report.kind).to) ? `${report.title} · ${reportDateRangeLabel(rangeFor(report.kind).from, rangeFor(report.kind).to)}` : report.title, previewRows(report.kind));
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

      <section className="panel">
        <PanelTitle
          title={reportTitle}
          subtitle={`Report preview · ${preview.length} rows${hasDateColumn(active) ? ` · ${reportDateRangeLabel(dateFrom, dateTo)}` : ""}`}
        />
        <div className="w-full overflow-x-auto">
          {preview.length ? (
            <table className="w-full">
              <thead>
                <tr>{columns.map((key) => (
                  <th key={key}>{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</th>
                ))}</tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index}>
                    {columns.map((key) => (
                      <td key={key}>{displayValue(key, row[key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="px-5 py-8 text-xs text-[#888]">No records match this report.</p>}
        </div>
      </section>
      {printSheet}
    </div>
  );
}
