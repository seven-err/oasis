import { EmptyState as BaseEmptyState } from "@/components/ModuleUi";

export {
  DetailGrid,
  FieldError,
  FieldLabel,
  FormInput,
  FormSelect,
  FormTextarea,
  MoneySummaryStrip,
  PaginationBar,
  PanelTitle,
  SectionCard,
  StatusBadge,
} from "@/components/ModuleUi";

export function EmptyState(props: { title: string; onAdd: () => void }) {
  return <BaseEmptyState {...props} actionLabel="Add payable" />;
}
