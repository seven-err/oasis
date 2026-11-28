import { EmptyState as BaseEmptyState } from "@/components/ModuleUi";
import { Eye, EyeOff } from "lucide-react";
import { maskAccountNumber } from "./utils";

export {
  DetailGrid,
  FieldError,
  FieldLabel,
  FormInput,
  FormSelect,
  FormTextarea,
  PaginationBar,
  PanelTitle,
  SectionCard,
  StatusBadge,
} from "@/components/ModuleUi";

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
  const masked = maskAccountNumber(accountNumber);

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center whitespace-nowrap">
        {revealed && canReveal ? accountNumber : (
          <>
            <span className="relative top-[0.18em] [font-variant-ligatures:none]">{masked.replace(/[^*]/g, "")}</span>
            <span>{masked.replace(/\*/g, "")}</span>
          </>
        )}
      </span>
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

export function EmptyState(props: { title: string; onAdd: () => void }) {
  return <BaseEmptyState {...props} actionLabel="Add cheque" />;
}
