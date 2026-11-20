import { DateInput } from "@/components/FormPopovers";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { useId, type ReactNode } from "react";
import { useHeaderBack } from "@/components/HeaderBack";
export { StatusBadge } from "@/components/StatusBadge";

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
  useHeaderBack(onBack, backDisabled);
  return (
    <div className="flex min-h-[76px] flex-col gap-3 border-b border-[#d0e3ef] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-bold tracking-[-.01em]">{title}</h2>
        <p className="mt-1 text-[11px] text-[#888]">{subtitle}</p>
      </div>
      {action && (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          {action}
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

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-1.5 text-[11px] text-red-700">{message}</p>;
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
  max,
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
  max?: number | string;
}) {
  const errorId = useId();
  const Input = type === "date" ? DateInput : "input";
  return (
    <label className="block">
      <FieldLabel required={required}>{label}</FieldLabel>
      <Input
        name={name}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        max={max}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" ? "0" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`input mt-2 ${error ? "border-red-400" : ""}`}
      />
      <FieldError id={errorId} message={error} />
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
  disabled,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const errorId = useId();
  return (
    <label className="relative block">
      <FieldLabel required={required}>{label}</FieldLabel>
      <select
        name={name}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`input mt-2 ${error ? "border-red-400" : ""}`}
      >
        {children}
      </select>
      <FieldError id={errorId} message={error} />
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
  const errorId = useId();
  return (
    <label className="block">
      <FieldLabel required={required}>{label}</FieldLabel>
      <textarea
        name={name}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className={`input mt-2 h-auto min-h-[88px] py-2.5 ${error ? "border-red-400" : ""}`}
      />
      <FieldError id={errorId} message={error} />
    </label>
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
        <Plus size={15} /> Add receivable
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
        <span className="grid size-8 place-items-center rounded-lg bg-[#1f6ea6] text-white">{page}</span>
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
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#d0e3ef]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d0e3ef] bg-[#e7f3fb] px-5 py-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[.14em] text-[#555]">
          {title}
        </h3>
        {action}
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
    <dl className="grid gap-px overflow-hidden rounded-lg bg-[#d0e3ef] sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="bg-white p-3 sm:p-4">
          <dt className="field-label">{item.label}</dt>
          <dd className="mt-1.5 break-words text-sm font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MoneySummaryStrip({
  total,
  paid,
  remaining,
}: {
  total: string;
  paid: string;
  remaining: string;
}) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg bg-[#d0e3ef] sm:grid-cols-3">
      <div className="bg-[#e7f3fb] p-4">
        <span className="field-label">Total receivable</span>
        <strong className="mt-1 block text-sm">{total}</strong>
      </div>
      <div className="bg-[#e7f3fb] p-4">
        <span className="field-label">Amount paid</span>
        <strong className="mt-1 block text-sm">{paid}</strong>
      </div>
      <div className="bg-[#e7f3fb] p-4">
        <span className="field-label">Remaining balance</span>
        <strong className="mt-1 block text-sm">{remaining}</strong>
      </div>
    </div>
  );
}
