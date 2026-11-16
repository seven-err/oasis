import { useCallback, useEffect, useState } from "react";
import { ReceivableDetails } from "./ReceivableDetails";
import { ReceivableForm } from "./ReceivableForm";
import { ReceivableRegister } from "./ReceivableRegister";
import { ReceivableReports } from "./ReceivableReports";
import { receivableService } from "./store";
import type { ReceivableView, ReceivableViewModel } from "./types";

type Props = {
  notify: (message: string) => void;
  createSignal?: number;
  onRecordsChange?: (records: ReceivableViewModel[]) => void;
};

export function ReceivableMonitoring({
  notify,
  createSignal = 0,
  onRecordsChange,
}: Props) {
  const [records, setRecords] = useState<ReceivableViewModel[]>(() =>
    receivableService.listViewModels(),
  );
  const [view, setView] = useState<ReceivableView>({ mode: "register" });

  const refresh = useCallback(() => {
    const next = receivableService.listViewModels();
    setRecords(next);
    onRecordsChange?.(next);
  }, [onRecordsChange]);

  useEffect(() => {
    if (createSignal > 0) setView({ mode: "create" });
  }, [createSignal]);

  const selected =
    view.mode === "details" || view.mode === "edit"
      ? records.find((r) => r.id === view.id)
      : undefined;

  if (view.mode === "create") {
    return (
      <ReceivableForm
        mode="create"
        onCancel={() => setView({ mode: "register" })}
        onSaved={(record) => {
          refresh();
          notify("Receivable record created.");
          setView({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "edit" && selected) {
    return (
      <ReceivableForm
        mode="edit"
        record={selected}
        onCancel={() => setView({ mode: "details", id: selected.id })}
        onSaved={(record) => {
          refresh();
          notify("Receivable record updated.");
          setView({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "details" && selected) {
    return (
      <ReceivableDetails
        record={selected}
        focus={view.focus}
        onBack={() => setView({ mode: "register" })}
        onEdit={() => setView({ mode: "edit", id: selected.id })}
        onChanged={refresh}
        notify={notify}
      />
    );
  }

  if (view.mode === "reports") {
    return (
      <ReceivableReports
        records={records}
        onBack={() => setView({ mode: "register" })}
        notify={notify}
      />
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <ReceivableRegister
        records={records}
        onAdd={() => setView({ mode: "create" })}
        onView={(id) => setView({ mode: "details", id })}
        onEdit={(id) => setView({ mode: "edit", id })}
        onRecordCollection={(id) =>
          setView({ mode: "details", id, focus: "collections" })
        }
        onScheduleFollowUp={(id) =>
          setView({ mode: "details", id, focus: "followups" })
        }
        onViewAttachments={(id) =>
          setView({ mode: "details", id, focus: "attachments" })
        }
        onOpenReports={() => setView({ mode: "reports" })}
        onChanged={refresh}
        notify={notify}
      />
    </div>
  );
}

export function getReceivableRecords(): ReceivableViewModel[] {
  return receivableService.listViewModels();
}
