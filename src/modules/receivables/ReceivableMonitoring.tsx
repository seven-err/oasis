import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useViewHistory } from "@/hooks/useViewHistory";
import { ReceivableDetails } from "./ReceivableDetails";
import { ReceivableForm } from "./ReceivableForm";
import { ReceivableRegister } from "./ReceivableRegister";
import { ReceivableReports } from "./ReceivableReports";
import { receivableService } from "./store";
import type { ReceivableView, ReceivableViewModel } from "./types";

type Props = {
  notify: (message: string) => void;
  createSignal?: number;
  initialRecordId?: number;
  onRecordsChange?: (records: ReceivableViewModel[]) => void;
};

export function ReceivableMonitoring({
  notify,
  createSignal = 0,
  initialRecordId,
  onRecordsChange,
}: Props) {
  const [records, setRecords] = useState<ReceivableViewModel[]>(() =>
    receivableService.listViewModels(),
  );
  const { view, open: setView, back, replace } = useViewHistory<ReceivableView>(() =>
    initialRecordId === undefined ? { mode: "register" } : { mode: "details", id: initialRecordId },
    { mode: "register" },
  );

  const refresh = useCallback(() => {
    const next = receivableService.listViewModels();
    setRecords(next);
    onRecordsChange?.(next);
  }, [onRecordsChange]);

  useEffect(() => {
    if (createSignal > 0) setView({ mode: "create" });
  }, [createSignal, setView]);

  const selected =
    view.mode === "details" || view.mode === "edit"
      ? records.find((r) => r.id === view.id)
      : undefined;

  const renderView = (content?: ReactNode) => (
    <div className="w-full max-w-full overflow-x-hidden">
      <div hidden={view.mode !== "register"} className="record-view-enter">
        <ReceivableRegister
          records={records}
          onAdd={() => setView({ mode: "create" })}
          onView={(id) => setView({ mode: "details", id })}
          onEdit={(id) => setView({ mode: "edit", id })}
          onRecordCollection={(id) => setView({ mode: "details", id, focus: "collections" })}
          onScheduleFollowUp={(id) => setView({ mode: "details", id, focus: "followups" })}
          onViewAttachments={(id) => setView({ mode: "details", id, focus: "attachments" })}
          onOpenReports={() => setView({ mode: "reports" })}
          onChanged={refresh}
          notify={notify}
        />
      </div>
      {content && (
        <div key={`${view.mode}-${"id" in view ? view.id : ""}`} className="record-view-enter">
          {content}
        </div>
      )}
    </div>
  );

  if (view.mode === "create") {
    return renderView(
      <ReceivableForm
        mode="create"
        onCancel={back}
        onSaved={(record) => {
          refresh();
          notify("Receivable record created.");
          replace({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "edit" && selected) {
    return renderView(
      <ReceivableForm
        mode="edit"
        record={selected}
        onCancel={back}
        onSaved={(record) => {
          refresh();
          notify("Receivable record updated.");
          replace({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "details" && selected) {
    return renderView(
      <ReceivableDetails
        record={selected}
        focus={view.focus}
        onBack={back}
        onEdit={() => setView({ mode: "edit", id: selected.id })}
        onChanged={refresh}
        notify={notify}
      />
    );
  }

  if (view.mode === "reports") {
    return renderView(
      <ReceivableReports
        records={records}
        onBack={back}
        notify={notify}
      />
    );
  }

  return renderView();
}

export function getReceivableRecords(): ReceivableViewModel[] {
  return receivableService.listViewModels();
}
