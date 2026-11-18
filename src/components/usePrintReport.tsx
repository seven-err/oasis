import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";

type PrintReport = { title: string; rows: Record<string, unknown>[]; printedAt: string };
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

export function usePrintReport() {
  const [report, setReport] = useState<PrintReport | null>(null);

  useEffect(() => {
    const clear = () => setReport(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

  const printReport = (title: string, rows: Record<string, unknown>[]) => {
    flushSync(() => setReport({
      title,
      rows,
      printedAt: new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
      }).format(new Date()),
    }));
    window.print();
  };

  const columns = report?.rows.length ? Object.keys(report.rows[0]) : [];
  const printSheet = report && createPortal(
    <section className="report-print-sheet" aria-label={report.title}>
      <div className="report-print-heading">
        <p>OASIS Office Management System</p>
        <h1>{report.title}</h1>
        <p>{report.rows.length} records · Printed {report.printedAt} (Philippine time)</p>
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
