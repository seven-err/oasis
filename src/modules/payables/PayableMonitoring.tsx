import { useCallback, useEffect, useState } from "react";
import { PayableDetails } from "./PayableDetails";
import { PayableForm } from "./PayableForm";
import { PayableRegister } from "./PayableRegister";
import { PayableReports } from "./PayableReports";
import { payableService } from "./store";
import type { PayableView, PayableViewModel } from "./types";

type Props = {
  notify: (message: string) => void;
  createSignal?: number;
  onRecordsChange?: (records: PayableViewModel[]) => void;
};

export function PayableMonitoring({
  notify,
  createSignal = 0,
  onRecordsChange,
}: Props) {
  const [records, setRecords] = useState<PayableViewModel[]>(() =>
    payableService.listViewModels(),
  );
  const [view, setView] = useState<PayableView>({ mode: "register" });

  const refresh = useCallback(() => {
    const next = payableService.listViewModels();
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
      <PayableForm
        mode="create"
        onCancel={() => setView({ mode: "register" })}
        onSaved={(record) => {
          refresh();
          notify("Payable record created.");
          setView({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "edit" && selected) {
    return (
      <PayableForm
        mode="edit"
        record={selected}
        onCancel={() => setView({ mode: "details", id: selected.id })}
        onSaved={(record) => {
          refresh();
          notify("Payable record updated.");
          setView({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "details" && selected) {
    return (
      <PayableDetails
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
      <PayableReports
        records={records}
        onBack={() => setView({ mode: "register" })}
        notify={notify}
      />
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <PayableRegister
        records={records}
        onAdd={() => setView({ mode: "create" })}
        onView={(id) => setView({ mode: "details", id })}
        onEdit={(id) => setView({ mode: "edit", id })}
        onRecordPayment={(id) => setView({ mode: "details", id, focus: "payments" })}
        onApprove={(id) => setView({ mode: "details", id, focus: "approve" })}
        onOpenReports={() => setView({ mode: "reports" })}
        onChanged={refresh}
        notify={notify}
      />
    </div>
  );
}

export function getPayableRecords(): PayableViewModel[] {
  return payableService.listViewModels();
}
