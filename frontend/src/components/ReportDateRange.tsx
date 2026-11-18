import { useState } from "react";

type Props = {
  compact?: boolean;
  dateLabel: string;
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
};

export function ReportDateRange({ compact = false, dateLabel, dateFrom, dateTo, onChange }: Props) {
  const [mode, setMode] = useState<"all" | "custom">("all");
  const invalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  return (
    <div className={`border-b border-[#d0e3ef] ${compact ? "py-4" : "p-4"}`}>
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2 md:grid-cols-3"}`}>
        <label className="block">
          <span className="field-label">Date range</span>
          <select
            className="input select-input mt-2"
            value={mode}
            onChange={(event) => {
              const next = event.target.value as "all" | "custom";
              setMode(next);
              onChange(next === "all" ? "" : dateFrom, next === "all" ? "" : dateTo);
            }}
          >
            <option value="all">All dates</option>
            <option value="custom">Custom date range</option>
          </select>
        </label>
        {mode === "custom" && (
          <>
            <label className="block">
              <span className="field-label">{dateLabel} from</span>
              <input
                type="date"
                className="input mt-2"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => onChange(event.target.value, dateTo)}
              />
            </label>
            <label className="block">
              <span className="field-label">{dateLabel} to</span>
              <input
                type="date"
                className="input mt-2"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => onChange(dateFrom, event.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <p className={`mt-3 text-[11px] ${invalid ? "text-red-700" : "text-[#888]"}`} role={invalid ? "alert" : undefined}>
        {invalid
          ? "The start date must be on or before the end date."
          : mode === "all"
            ? "This report includes all dates."
            : "This report includes both selected dates. For January–March, choose January 1 through March 31 of the same year. Leave a date empty for no limit."}
      </p>
    </div>
  );
}

export function reportDateRangeLabel(from: string, to: string) {
  const format = (value: string) => new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
  if (!from && !to) return "All dates";
  if (!from) return `Through ${format(to)}`;
  if (!to) return `From ${format(from)}`;
  return `${format(from)} – ${format(to)}`;
}

export function useReportDateRanges<K extends string>() {
  const [ranges, setRanges] = useState<Partial<Record<K, { from: string; to: string }>>>({});
  const rangeFor = (kind: K) => ranges[kind] ?? { from: "", to: "" };
  const setRange = (kind: K, from: string, to: string) =>
    setRanges((current) => ({ ...current, [kind]: { from, to } }));
  return { rangeFor, setRange };
}

export function inReportDateRange(date: string, from: string, to: string) {
  return (!from || date >= from) && (!to || date <= to);
}
