import { X } from "lucide-react";

const labels: Record<string, string> = {
  checkType: "Cheque type", checkDateFrom: "Cheque date from", checkDateTo: "Cheque date to",
  checkStatus: "Status", collectionStatus: "Status", customerId: "Customer",
  categoryId: "Category", preparedById: "Prepared by", clientId: "Client ID",
  receivedIssuedFrom: "Received/issued from", receivedIssuedTo: "Received/issued to",
};

export function ActiveFilters<T extends object>({ filters, defaults, valueLabels = {}, onRemove, onClear }: {
  filters: T;
  defaults: T;
  valueLabels?: Partial<Record<keyof T, Record<string, string>>>;
  matched: number;
  total: number;
  onRemove: (key: keyof T) => void;
  onClear: () => void;
}) {
  const active = (Object.keys(defaults) as (keyof T & string)[]).filter((key) => filters[key] !== defaults[key]);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Active filters">
      {active.map((key) => {
        const words = key.replace(/([a-z])([A-Z])/g, "$1 $2");
        const label = labels[key] ?? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
        const raw = String(filters[key]);
        const value = valueLabels[key]?.[raw] ?? (typeof filters[key] === "boolean" ? "Yes"
          : /(?:From|To)$/.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(raw)
            ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(`${raw}T00:00:00`)) : raw);
        const text = `${label}: ${value}`;
        return (
          <button key={key} type="button" onClick={() => onRemove(key)} aria-label={`Remove filter ${text}`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#b9d9ef] bg-[#e7f3fb] px-3 py-1.5 text-left text-[#16344d] hover:bg-[#d7eef9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6ea6]">
            <span className="wrap-break-word min-w-0">{text}</span><X size={13} className="shrink-0" aria-hidden="true" />
          </button>
        );
      })}
      {active.length > 0 && <button type="button" onClick={onClear}
        className="px-2 py-1.5 font-semibold text-[#1f6ea6] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[#1f6ea6]">Clear all</button>}
    </div>
  );
}
