import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { StatusBadge } from "./StatusBadge";

function useFieldPopover() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const popup = popupRef.current;
    const position = () => {
      if (!popup?.matches(":popover-open") || !triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      popup.style.width = `${Math.min(Math.max(rect.width, 288), window.innerWidth - 24)}px`;
      popup.style.maxHeight = `${window.innerHeight - 24}px`;
      popup.style.overflowY = "auto";
      const width = popup.offsetWidth;
      popup.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
      popup.style.top = `${Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - popup.offsetHeight - 12))}px`;
    };
    popup?.addEventListener("toggle", position);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      popup?.removeEventListener("toggle", position);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, []);
  return { triggerRef, popupRef, id };
}

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function DateInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { triggerRef, popupRef, id } = useFieldPopover();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(String(props.value ?? props.defaultValue ?? ""));
  const value = props.value === undefined ? selected : String(props.value ?? "");
  const choose = (date: string) => {
    const input = inputRef.current;
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, date);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setSelected(date);
    popupRef.current?.hidePopover();
    triggerRef.current?.focus();
  };
  const blocked = (date: string) => !!((props.min && date < String(props.min)) || (props.max && date > String(props.max)));
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  return (
    <span className="relative block">
      <input {...props} ref={inputRef} type="date" className={`${props.className ?? "input"} styled-date pr-10`} onChange={(event) => {
        setSelected(event.target.value);
        props.onChange?.(event);
      }} />
      <button ref={triggerRef} type="button" disabled={props.disabled || props.readOnly} aria-label="Open calendar" aria-haspopup="dialog" popoverTarget={id}
        className="absolute bottom-1 right-1 grid size-8 place-items-center text-[#5c7890] hover:bg-[#e7f3fb] disabled:opacity-40"
        onClick={() => {
          const date = value ? new Date(`${value}T00:00:00`) : new Date();
          setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
        }}><CalendarDays size={17} /></button>
      <div ref={popupRef} id={id} popover="auto" role="dialog" aria-label="Choose date" className="fixed inset-auto m-0 max-w-[320px] rounded-xl border border-[#d0e3ef] bg-white p-4 text-[#16344d] shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button type="button" className="table-action" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17} /></button>
          <span className="text-sm font-semibold" aria-live="polite">{month.toLocaleDateString("en-PH", { month: "long" })}</span>
          <input key={month.getFullYear()} type="number" aria-label="Calendar year" min="100" max="9999" defaultValue={month.getFullYear()} className="w-16 rounded border border-[#d0e3ef] px-1 py-1 text-sm"
            onBlur={(event) => {
              const year = Number(event.target.value);
              if (year >= 100 && year <= 9999) setMonth(new Date(year, month.getMonth(), 1));
              else event.target.value = String(month.getFullYear());
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }} />
          <button type="button" className="table-action" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={17} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day} className="pb-2 text-center text-[11px] font-medium text-[#6a8aa0]">{day}</span>)}
          {Array.from({ length: 42 }, (_, index) => {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
            const iso = localDate(date);
            return <button key={iso} type="button" disabled={blocked(iso)} aria-label={date.toLocaleDateString("en-PH", { dateStyle: "full" })} aria-pressed={iso === value}
              aria-current={iso === localDate(new Date()) ? "date" : undefined}
              className={`aspect-square rounded-lg text-xs disabled:opacity-25 ${iso === value ? "bg-[#1f6ea6] font-semibold text-white" : "hover:bg-[#e7f3fb]"} ${date.getMonth() !== month.getMonth() && iso !== value ? "text-[#8c9eac]" : ""}`}
              onClick={() => choose(iso)}>{date.getDate()}</button>;
          })}
        </div>
        <div className="mt-3 flex justify-between border-t border-[#d0e3ef] pt-3">
          <button type="button" className="px-2 py-1 text-xs text-[#5c7890] hover:bg-[#e7f3fb]" onClick={() => choose("")}>Clear</button>
          <button type="button" disabled={blocked(localDate(new Date()))} className="px-2 py-1 text-xs font-semibold text-[#1f6ea6] hover:bg-[#e7f3fb] disabled:opacity-40" onClick={() => choose(localDate(new Date()))}>Today</button>
        </div>
      </div>
    </span>
  );
}

export function RequirementStatusSelect({ value, allowComplete, onChange }: {
  value: "Complete" | "Incomplete";
  allowComplete: boolean;
  onChange: (value: "Complete" | "Incomplete") => void;
}) {
  const { triggerRef, popupRef, id } = useFieldPopover();
  return (
    <span className="mt-2 block">
      <input type="hidden" name="requirementStatus" value={value} />
      <button ref={triggerRef} type="button" popoverTarget={id} aria-label={`Requirement status: ${value}`} aria-haspopup="dialog"
        className="input flex items-center justify-between text-left">
        <StatusBadge value={value} />
        <ChevronDown size={16} className="text-[#6a8aa0]" />
      </button>
      <div ref={popupRef} id={id} popover="auto" role="dialog" aria-label="Choose requirement status" className="fixed inset-auto m-0 rounded-xl border border-[#d0e3ef] bg-white p-1.5 text-[#16344d] shadow-xl">
        {(["Incomplete", "Complete"] as const).map((status) => (
          <button key={status} type="button" disabled={status === "Complete" && !allowComplete} aria-pressed={status === value}
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40 ${status === value ? "bg-[#e7f3fb] font-semibold" : "hover:bg-[#f3f8fc]"}`}
            onClick={() => { onChange(status); popupRef.current?.hidePopover(); triggerRef.current?.focus(); }}>
            {status}{status === value && <Check size={15} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </span>
  );
}
