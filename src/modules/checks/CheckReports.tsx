import { Download, FileCheck2, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { checkService } from "./store";
import type { CheckRecord, CheckReportKind } from "./types";
import { PanelTitle, StatusBadge } from "./ui";
import { downloadCsv, formatDate, maskAccountNumber, peso } from "./utils";

type Props = {
  records: CheckRecord[];
  onBack: () => void;
  notify: (message: string) => void;
};

const REPORTS: {
  kind: CheckReportKind;
  title: string;
  detail: string;
}[] = [
  {
    kind: "complete_register",
    title: "Complete Check Register",
    detail: "Full authorized check listing with masked account numbers",
  },
  {
    kind: "received",
    title: "Received Checks Report",
    detail: "Checks received by OASIS Company",
  },
  {
    kind: "issued",
    title: "Issued Checks Report",
    detail: "Checks issued by OASIS Company",
  },
  {
    kind: "pending",
    title: "Pending Checks Report",
    detail: "Checks awaiting next workflow action",
  },
  {
    kind: "deposited",
    title: "Deposited Checks Report",
    detail: "Checks marked deposited",
  },
  {
    kind: "cleared",
    title: "Cleared Checks Report",
    detail: "Checks confirmed cleared",
  },
  {
    kind: "bounced",
    title: "Bounced Checks Report",
    detail: "Returned / bounced checks retained for history",
  },
  {
    kind: "by_bank",
    title: "Checks by Bank",
    detail: "Grouped summary by bank name",
  },
  {
    kind: "by_date_range",
    title: "Checks by Date Range",
    detail: "Filter by check date range before export",
  },
  {
    kind: "by_payee",
    title: "Checks by Payee",
    detail: "Grouped summary by payee",
  },
  {
    kind: "by_drawer",
    title: "Checks by Drawer",
    detail: "Grouped summary by drawer",
  },
  {
    kind: "by_prepared_by",
    title: "Checks by Prepared By",
    detail: "Grouped summary by preparing user",
  },
];

function selectRows(
  kind: CheckReportKind,
  records: CheckRecord[],
  dateFrom: string,
  dateTo: string,
): CheckRecord[] {
  const active = records.filter((r) => !r.archivedAt);
  switch (kind) {
    case "complete_register":
      return active;
    case "received":
      return active.filter((r) => r.checkType === "Received Check");
    case "issued":
      return active.filter((r) => r.checkType === "Issued Check");
    case "pending":
      return active.filter((r) => r.checkStatus === "Pending");
    case "deposited":
      return active.filter((r) => r.checkStatus === "Deposited");
    case "cleared":
      return active.filter((r) => r.checkStatus === "Cleared");
    case "bounced":
      return active.filter((r) => r.checkStatus === "Bounced");
    case "by_date_range":
      return active.filter((r) => {
        if (dateFrom && r.checkDate < dateFrom) return false;
        if (dateTo && r.checkDate > dateTo) return false;
        return true;
      });
    default:
      return active;
  }
}

function exportRows(
  kind: CheckReportKind,
  records: CheckRecord[],
  canViewAccount: boolean,
): Record<string, string | number>[] {
  if (kind === "by_bank" || kind === "by_payee" || kind === "by_drawer" || kind === "by_prepared_by") {
    const key =
      kind === "by_bank"
        ? "bankName"
        : kind === "by_payee"
          ? "payeeName"
          : kind === "by_drawer"
            ? "drawerName"
            : "preparedByName";
    const map = new Map<string, { count: number; amount: number }>();
    for (const r of records.filter((x) => !x.archivedAt)) {
      const group = r[key];
      const cur = map.get(group) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.checkAmount;
      map.set(group, cur);
    }
    return [...map.entries()].map(([name, stats]) => ({
      Group: name,
      Checks: stats.count,
      TotalAmount: stats.amount.toFixed(2),
    }));
  }

  return records.map((r) => ({
    CheckNumber: r.checkNumber,
    CheckType: r.checkType,
    CheckDate: r.checkDate,
    DateReceivedIssued: r.dateReceivedIssued,
    PayeeName: r.payeeName,
    DrawerName: r.drawerName,
    BankName: r.bankName,
    Branch: r.branch,
    AccountNumber: canViewAccount ? r.accountNumber : maskAccountNumber(r.accountNumber),
    CheckAmount: r.checkAmount.toFixed(2),
    Purpose: r.purpose,
    ReferenceNumber: r.referenceNumber,
    DueDate: r.dueDate ?? "",
    DepositDate: r.depositDate ?? "",
    ClearingDate: r.clearingDate ?? "",
    CheckStatus: r.checkStatus,
    PreparedBy: r.preparedByName,
  }));
}

export function CheckReports({ records, onBack, notify }: Props) {
  const user = checkService.getUser();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [active, setActive] = useState<CheckReportKind>("complete_register");

  const preview = useMemo(
    () => selectRows(active, records, dateFrom, dateTo),
    [active, records, dateFrom, dateTo],
  );

  const runExport = (kind: CheckReportKind) => {
    if (!user.permissions.exportReports) {
      notify("You are not authorized to export reports.");
      return;
    }
    const rows = selectRows(kind, records, dateFrom, dateTo);
    const exported = exportRows(kind, rows, user.permissions.viewAccountNumber);
    if (!exported.length) {
      notify("No records match this report.");
      return;
    }
    downloadCsv(`oasis-check-${kind}.csv`, exported);
    notify("Authorized export generated. Account numbers masked unless permitted.");
  };

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden">
      <section className="panel overflow-hidden">
        <PanelTitle
          title="Check reports"
          subtitle="Filters, printing, and authorized exports · attachments excluded from CSV"
          action={
            <button onClick={onBack} className="secondary-btn w-full sm:w-auto">
              Back to register
            </button>
          }
        />
        <div className="grid gap-3 border-b border-[#d0e3ef] p-4 sm:grid-cols-2 md:grid-cols-3">
          <label className="block">
            <span className="field-label">Check date from</span>
            <input
              type="date"
              className="input mt-2"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="field-label">Check date to</span>
            <input
              type="date"
              className="input mt-2"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <p className="text-[11px] text-[#888]">
              Date range applies to the date-range report and can narrow preview exports.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => {
          const count = selectRows(report.kind, records, dateFrom, dateTo).length;
          return (
            <section
              key={report.kind}
              className={`panel p-5 ${active === report.kind ? "ring-2 ring-[#1f6ea6]" : ""}`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setActive(report.kind)}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center bg-[#e7f3fb] text-[#1f6ea6]">
                    <FileCheck2 size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold">{report.title}</h3>
                    <p className="mt-1 text-[11px] leading-5 text-[#777]">{report.detail}</p>
                  </div>
                </div>
              </button>
              <div className="my-4 grid grid-cols-2 gap-3 border-y border-[#d7e8f3] py-3">
                <div>
                  <span className="field-label">Records</span>
                  <strong className="mt-1 block text-lg">{count}</strong>
                </div>
                <div>
                  <span className="field-label">Sensitive data</span>
                  <strong className="mt-1 block text-xs">
                    {user.permissions.viewAccountNumber ? "Unmasked (authorized)" : "Masked"}
                  </strong>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="secondary-btn flex-1"
                  onClick={() => {
                    setActive(report.kind);
                    window.print();
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
          subtitle={`${REPORTS.find((r) => r.kind === active)?.title ?? ""} · ${preview.length} rows`}
        />
        <div className="w-full">
          <table className="w-full table-fixed">
            <thead>
              <tr>
                <th>Check no.</th>
                <th className="hidden sm:table-cell">Type</th>
                <th>Payee</th>
                <th className="hidden md:table-cell">Bank</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 25).map((r) => (
                <tr key={r.id}>
                  <td className="overflow-hidden text-ellipsis font-semibold">{r.checkNumber}</td>
                  <td className="hidden overflow-hidden text-ellipsis sm:table-cell">
                    {r.checkType.replace(" Check", "")}
                  </td>
                  <td className="overflow-hidden text-ellipsis">{r.payeeName}</td>
                  <td className="hidden overflow-hidden text-ellipsis md:table-cell">
                    {r.bankName}
                  </td>
                  <td className="overflow-hidden text-ellipsis">{peso.format(r.checkAmount)}</td>
                  <td className="overflow-hidden text-ellipsis">
                    <StatusBadge value={r.checkStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.length > 25 && (
          <p className="px-5 py-3 text-[11px] text-[#888]">
            Showing first 25 rows in preview. Export includes the full authorized set.
          </p>
        )}
      </section>
    </div>
  );
}
