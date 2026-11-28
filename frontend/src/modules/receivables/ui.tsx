import {
  EmptyState as BaseEmptyState,
  MoneySummaryStrip as BaseMoneySummaryStrip,
} from "@/components/ModuleUi";

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

export function EmptyState(props: { title: string; onAdd: () => void }) {
  return <BaseEmptyState {...props} actionLabel="Add receivable" />;
}

export function MoneySummaryStrip(props: {
  total: string;
  paid: string;
  remaining: string;
}) {
  return <BaseMoneySummaryStrip {...props} totalLabel="Total receivable" />;
}
