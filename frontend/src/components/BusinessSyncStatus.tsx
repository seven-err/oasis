import { useEffect, useRef, useSyncExternalStore } from "react";
import { CheckCircle2, CloudOff, LoaderCircle } from "lucide-react";
import {
  businessSyncError,
  businessSyncStatus,
  discardBusinessDraft,
  downloadBusinessDraft,
  hasBusinessConflict,
  refreshBusinessStorage,
  retryBusinessSave,
  subscribeBusinessSync,
} from "../businessStorage";

export function BusinessSyncStatus() {
  const status = useSyncExternalStore(subscribeBusinessSync, businessSyncStatus, () => "");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (businessSyncError() && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [status]);
  if (businessSyncError())
    return (
      <dialog
        ref={dialog}
        onCancel={(event) => event.preventDefault()}
        role="alertdialog"
        aria-labelledby="sync-error-title"
        className="m-auto w-[calc(100%_-_32px)] max-w-lg rounded-xl border border-[#c5dced] bg-white p-6 text-[#16344d] shadow-xl backdrop:bg-[#16344d]/40"
      >
        <h2 id="sync-error-title" className="text-lg font-semibold">
          Your changes have not been saved
        </h2>
        <p className="my-4 text-sm">{businessSyncError()}</p>
        <div className="flex flex-wrap gap-3">
          <button className="primary-btn" onClick={downloadBusinessDraft}>
            Download unsaved copy
          </button>
          {!hasBusinessConflict() && (
            <button className="secondary-btn" onClick={() => void retryBusinessSave()}>
              Retry save
            </button>
          )}
          {businessSyncError().includes("Please sign in again") && (
            <a className="secondary-btn" href="/login">
              Sign in again
            </a>
          )}
          <button className="secondary-btn" onClick={discardBusinessDraft}>
            Discard unsaved changes and reload
          </button>
        </div>
      </dialog>
    );
  return status ? (
    <div className={`fixed bottom-4 right-4 z-[60] flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-md ${status === "Connection issue" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-[#c5dced] bg-white text-[#16344d]"}`}>
      <span role="status" className="flex items-center gap-2">
        {status === "All changes saved" ? <CheckCircle2 size={17} aria-hidden="true" className="text-green-700" /> : status === "Connection issue" ? <CloudOff size={17} aria-hidden="true" /> : <LoaderCircle size={17} aria-hidden="true" className="motion-safe:animate-spin" />}
        {status === "Connection issue" ? "Connection issue — shared records may not sync" : status === "All changes saved" ? "Shared records saved" : status === "Saving changes…" ? "Saving shared records…" : status}
      </span>
      {status === "Connection issue" && (
        <button type="button" className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => void refreshBusinessStorage(true)}>
          Retry connection
        </button>
      )}
    </div>
  ) : null;
}
