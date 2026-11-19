import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";

export function ArchiveConfirmationDialog(props: {
  recordLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <DeleteConfirmationDialog {...props} action="archive" />;
}
