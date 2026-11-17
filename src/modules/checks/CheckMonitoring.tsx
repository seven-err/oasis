import { useCallback, useEffect, useState } from "react";
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
  const [view, setView] = useState<CheckView>(() =>
    initialRecordId === undefined ? { mode: "register" } : { mode: "details", id: initialRecordId },
  );

  const refresh = useCallback(() => {
    const next = checkService.list();
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
      <CheckForm
        mode="create"
        onCancel={() => setView({ mode: "register" })}
        onSaved={(record) => {
          refresh();
          notify("Check record created.");
          setView({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "edit" && selected) {
    return (
      <CheckForm
        mode="edit"
        record={selected}
        onCancel={() => setView({ mode: "details", id: selected.id })}
        onSaved={(record) => {
          refresh();
          notify("Check record updated.");
          setView({ mode: "details", id: record.id });
        }}
      />
    );
  }

  if (view.mode === "details" && selected) {
    return (
      <CheckDetails
        record={selected}
        onBack={() => setView({ mode: "register" })}
        onEdit={() => setView({ mode: "edit", id: selected.id })}
        onChanged={refresh}
        notify={notify}
      />
    );
  }

  if (view.mode === "reports") {
    return (
      <CheckReports
        records={records}
        onBack={() => setView({ mode: "register" })}
        notify={notify}
      />
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden">
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
  );
}

/** Imperative helpers for parent shell integration */
export function getCheckRecords(): CheckRecord[] {
  return checkService.list();
}
