import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import reportLogo from "@/assets/report-logo-transparent.png";

type PrintReport = { title: string; subtitle?: string; rows: Record<string, unknown>[]; recordCount: number; printedAt: string };
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

function cellText(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (/^(Amount|Total|Paid|Collected|Remaining|Cash Advance Amount \(PHP\))$/.test(key) && Number.isFinite(Number(value))) {
    return currency.format(Number(value));
  }
  if (/date/i.test(key) && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return date.format(new Date(`${value}T00:00:00`));
  }
  return String(value);
}

export function usePrintReport({ emphasizeSubtitle = false }: { emphasizeSubtitle?: boolean } = {}) {
  const logoRef = useRef<HTMLImageElement>(null);
  const originalTitle = useRef<string | null>(null);
  const [report, setReport] = useState<PrintReport | null>(null);

  useEffect(() => {
    const restoreTitle = () => {
      if (originalTitle.current !== null) {
        document.title = originalTitle.current;
        originalTitle.current = null;
      }
    };
    const clear = () => {
      restoreTitle();
      setReport(null);
    };
    window.addEventListener("afterprint", clear);
    return () => {
      window.removeEventListener("afterprint", clear);
      restoreTitle();
    };
  }, []);

  const printReport = (title: string, rows: Record<string, unknown>[], recordCount = rows.length, subtitle?: string) => {
    if (!rows.length) return;
    flushSync(() => setReport({
      title,
      subtitle,
      rows,
      recordCount,
      printedAt: new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
      }).format(new Date()),
    }));
    originalTitle.current ??= document.title;
    // Prevent the browser's print header from repeating the app name.
    document.title = "\u200b";
    // Keep this in the original click handler. Awaiting image decoding here can
    // lose the browser's user activation and leave the print preview unopened.
    window.print();
  };

  const columns = report?.rows.length ? Object.keys(report.rows[0]) : [];
  const printSheet = report && createPortal(
    <section
      className={`report-print-sheet ${report.subtitle ? "report-print-detail" : ""}`}
      aria-label={report.title}
    >
      <div className={`report-print-heading${emphasizeSubtitle && report.subtitle ? " report-print-record-heading" : ""}`}>
        <div className="report-print-brand-row">
          <img ref={logoRef} src={reportLogo} alt="OASIS Medical Center" className="report-print-logo" />
          <p className="report-print-date">Printed {report.printedAt}<br />(Philippine time)</p>
        </div>
        <h1>{report.title}</h1>
        {report.subtitle ? <p className="report-print-subtitle">{report.subtitle}</p> : <p>{report.recordCount} {report.recordCount === 1 ? "record" : "records"}</p>}
      </div>
      {report.rows.length ? (
        <table>
          <thead>
            <tr>{columns.map((key) => <th key={key}>{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</th>)}</tr>
          </thead>
          <tbody>
            {report.rows.map((row, index) => (
              <tr key={index}>
                {columns.map((key) => <td key={key}>{cellText(key, row[key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No records available for this report.</p>}
    </section>,
    document.body,
  );

  return { printReport, printSheet };
}
