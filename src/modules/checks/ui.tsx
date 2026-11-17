import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";

export function PanelTitle({
  title,
  subtitle,
  action,
  onBack,
  backDisabled = false,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  onBack?: () => void;
  backDisabled?: boolean;
}) {
  return (
    <div className={`min-h-[76px] gap-3 border-b border-[#d0e3ef] px-4 py-4 sm:px-5 ${onBack ? "grid grid-cols-[minmax(0,1fr)_auto] items-start" : "flex flex-col sm:flex-row sm:items-center sm:justify-between"}`}>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-bold tracking-[-.01em]">{title}</h2>
        <p className="mt-1 text-[11px] text-[#888]">{subtitle}</p>
      </div>
      {(action || onBack) && (
        <div className={onBack ? "flex items-start justify-end gap-2" : "flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end"}>
          {action}
          {onBack && (
            <button type="button" onClick={onBack} disabled={backDisabled} className="secondary-btn shrink-0">
              <ArrowLeft size={15} aria-hidden="true" /> Back
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function FieldLabel({
  children,
  required,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <span className="field-label">
      {children}
      {required && <span className="text-red-700"> *</span>}
    </span>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-[11px] text-red-700">{message}</p>;
}

export function FormInput({
  label,
  name,
  required,
  error,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled,
  autoComplete,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        name={name}
        type={type}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" ? "0" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`input mt-2 ${error ? "border-red-400" : ""}`}
      />
      <FieldError message={error} />
    </label>
  );
}

export function FormSelect({
  label,
  name,
  required,
  error,
  value,
  onChange,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="relative block">
      <FieldLabel required={required}>{label}</FieldLabel>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input mt-2 appearance-none pr-9 ${error ? "border-red-400" : ""}`}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 bottom-[13px] text-[#777]"
      />
      <FieldError message={error} />
    </label>
  );
}

export function FormTextarea({
  label,
  name,
  required,
  error,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <FieldLabel required={required}>{label}</FieldLabel>
      <textarea
        name={name}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className={`input mt-2 h-auto min-h-[88px] py-2.5 ${error ? "border-red-400" : ""}`}
      />
      <FieldError message={error} />
    </label>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "Cleared" || value === "Deposited"
      ? "status-good"
      : value === "Bounced" || value === "Cancelled" || value === "Voided"
        ? "status-alert"
        : value === "For Deposit" || value === "For Clearing"
          ? "status-partial"
          : "status-neutral";
  return <span className={`status ${tone}`}>{value}</span>;
}

export function AccountNumberDisplay({
  accountNumber,
  canReveal,
  revealed,
  onToggle,
}: {
  accountNumber: string;
  canReveal: boolean;
  revealed: boolean;
  onToggle: () => void;
}) {
  const masked =
    accountNumber.length <= 4
      ? "â€¢â€¢â€¢â€¢"
      : `${"â€¢".repeat(Math.max(4, accountNumber.length - 4))}${accountNumber.slice(-4)}`;

  return (
    <div className="flex items-center gap-2">
      <code className="font-mono text-sm tracking-wide">
        {revealed && canReveal ? accountNumber : masked}
      </code>
      {canReveal && (
        <button
          type="button"
          className="table-action"
          onClick={onToggle}
          aria-label={revealed ? "Hide account number" : "Reveal account number"}
          title={revealed ? "Hide account number" : "Reveal account number"}
        >
          {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="grid place-items-center px-5 py-20 text-center">
      <span className="grid size-12 place-items-center bg-[#e7f3fb]">
        <Search size={20} />
      </span>
      <h3 className="mt-4 text-sm font-bold">{title}</h3>
      <p className="mt-1 text-xs text-[#888]">Adjust the filters or create a new record.</p>
      <button onClick={onAdd} className="primary-btn mt-5">
        <Plus size={15} /> Add check
      </button>
    </div>
  );
}

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between border-t border-[#d0e3ef] px-5 py-4 text-[11px] text-[#777]">
      <span>
        Showing {start}-{end} of {total}
      </span>
      <div className="flex gap-1">
        <button
          disabled={page <= 1}
          className="table-action disabled:opacity-30"
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="grid size-8 place-items-center bg-[#1f6ea6] text-white">{page}</span>
        <button
          disabled={page >= pages}
          className="table-action disabled:opacity-30"
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-[#d0e3ef]">
      <div className="border-b border-[#d0e3ef] bg-[#e7f3fb] px-5 py-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[.14em] text-[#555]">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function DetailGrid({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid gap-px bg-[#d0e3ef] sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="bg-white p-3 sm:p-4">
          <dt className="field-label">{item.label}</dt>
          <dd className="mt-1.5 break-words text-sm font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
