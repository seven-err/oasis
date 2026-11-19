import type { LucideIcon } from "lucide-react";

export type SummaryStat = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  onClick?: () => void;
};

type Props = {
  items: SummaryStat[];
};

/**
 * Shared summary cards: label top-left, icon top-right, large value bottom-left.
 */
export function SummaryStatCards({ items }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      {items.map(({ label, value, icon: Icon, onClick }) => {
        const content = (
          <>
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-semibold leading-snug text-[#16344d]">{label}</span>
              <Icon size={18} strokeWidth={1.75} className="shrink-0 text-[#1f6ea6]" />
            </div>
            <strong
              className={`mt-auto pt-6 font-bold leading-none tracking-[-.03em] text-[#1a1a1a] ${
                String(value).includes("₱") || String(value).length > 8
                  ? "text-[22px] sm:text-[26px]"
                  : "text-[28px] sm:text-[32px]"
              }`}
            >
              {value}
            </strong>
          </>
        );

        const className =
          "summary-stat-card flex min-h-[120px] flex-col rounded-xl bg-[#d4eaf8] p-5 text-left sm:min-h-[132px] sm:p-6";

        if (onClick) {
          return (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className={`${className} hover:bg-[#c3e2f4]`}
            >
              {content}
            </button>
          );
        }

        return (
          <div key={label} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
