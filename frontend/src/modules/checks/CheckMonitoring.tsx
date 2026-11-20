import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useViewHistory } from "@/hooks/useViewHistory";
import { useBusinessRefresh } from "@/hooks/useBusinessRefresh";
import { CheckDetails } from "./CheckDetails";
import { CheckForm } from "./CheckForm";
import { CheckRegister } from "./CheckRegister";
import { CheckReports } from "./CheckReports";
import { checkService } from "./store";
import type { CheckRecord, CheckView } from "./types";

type Props = {
  notify: (message: string) => void;
  /** Increment to open the create form from the shell header */
  createSignal?: number;
  initialRecordId?: number;
  /** Optional: expose records to parent dashboard */
  onRecordsChange?: (records: CheckRecord[]) => void;
};

export function CheckMonitoring({ notify, createSignal = 0, initialRecordId, onRecordsChange }: Props) {
  const [records, setRecords] = useState<CheckRecord[]>(() => checkService.list());
  const { view, open: setView, back, replace } = useViewHistory<CheckView>(() =>
    initialRecordId === undefined ? { mode: "register" } : { mode: "details", id: initialRecordId },
    { mode: "register" },
  );

  const refresh = useCallback(() => {
    const next = checkService.list();
    setRecords(next);
    onRecordsChange?.(next);
  }, [onRecordsChange]);
  useBusinessRefresh("checks", refresh);

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
        <CheckRegister
          records={records}
          onAdd={() => setView({ mode: "create" })}
          onView={(id) => setView({ mode: "details", id })}
          onEdit={(id) => setView({ mode: "edit", id })}
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
      <CheckForm
        mode="create"
        onCancel={back}
        onSaved={(record) => {
          refresh();
          notify("Check record created.");
          replace({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "edit" && selected) {
    return renderView(
      <CheckForm
        mode="edit"
        record={selected}
        onCancel={back}
        onSaved={(record) => {
          refresh();
          notify("Check record updated.");
          replace({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "details" && selected) {
    return renderView(
      <CheckDetails
        record={selected}
        onBack={back}
        onEdit={() => setView({ mode: "edit", id: selected.id })}
        onChanged={refresh}
        notify={notify}
      />
    );
  }

  if (view.mode === "reports") {
    return renderView(
      <CheckReports
        records={records}
        onBack={back}
        notify={notify}
      />
    );
  }

  return renderView();
}

/** Imperative helpers for parent shell integration */
export function getCheckRecords(): CheckRecord[] {
  return checkService.list();
}
