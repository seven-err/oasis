import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useViewHistory } from "@/hooks/useViewHistory";
import { useBusinessRefresh } from "@/hooks/useBusinessRefresh";
import { PayableDetails } from "./PayableDetails";
import { PayableForm } from "./PayableForm";
import { PayableRegister } from "./PayableRegister";
import { PayableReports } from "./PayableReports";
import { payableService } from "./store";
import type { PayableView, PayableViewModel } from "./types";

type Props = {
  notify: (message: string) => void;
  createSignal?: number;
  initialRecordId?: number;
  onRecordsChange?: (records: PayableViewModel[]) => void;
};

export function PayableMonitoring({
  notify,
  createSignal = 0,
  initialRecordId,
  onRecordsChange,
}: Props) {
  const [records, setRecords] = useState<PayableViewModel[]>(() =>
    payableService.listViewModels(),
  );
  const { view, open: setView, back, replace } = useViewHistory<PayableView>(() =>
    initialRecordId === undefined ? { mode: "register" } : { mode: "details", id: initialRecordId },
    { mode: "register" },
  );

  const refresh = useCallback(() => {
    const next = payableService.listViewModels();
    setRecords(next);
    onRecordsChange?.(next);
  }, [onRecordsChange]);
  useBusinessRefresh("payables", refresh);

  useEffect(() => {
    if (createSignal > 0) setView({ mode: "create" });
  }, [createSignal, setView]);

  const selected =
    view.mode === "details" || view.mode === "edit"
      ? records.find((r) => r.id === view.id)
      : undefined;

  const renderView = (content?: ReactNode) => (
    <div className="w-full max-w-full overflow-x-clip">
      <div hidden={view.mode !== "register"} className="record-view-enter">
        <PayableRegister
          records={records}
          onAdd={() => setView({ mode: "create" })}
          onView={(id) => setView({ mode: "details", id })}
          onEdit={(id) => setView({ mode: "edit", id })}
          onRecordPayment={(id) => setView({ mode: "details", id, focus: "payments" })}
          onPaymentHistory={(id) => setView({ mode: "details", id, focus: "payment-history" })}
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
      <PayableForm
        mode="create"
        onCancel={back}
        onSaved={(record) => {
          refresh();
          notify("Payable record created.");
          replace({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "edit" && selected) {
    return renderView(
      <PayableForm
        mode="edit"
        record={selected}
        onCancel={back}
        onSaved={(record) => {
          refresh();
          notify("Payable record updated.");
          replace({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "details" && selected) {
    return renderView(
      <PayableDetails
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
      <PayableReports
        records={records}
        onBack={back}
        notify={notify}
      />
    );
  }

  return renderView();
}

export function getPayableRecords(): PayableViewModel[] {
  return payableService.listViewModels();
}
