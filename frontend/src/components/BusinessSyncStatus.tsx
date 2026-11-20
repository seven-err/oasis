import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  businessSyncError,
  businessSyncStatus,
  discardBusinessDraft,
  downloadBusinessDraft,
  hasBusinessConflict,
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
    <div
      role="status"
      className="fixed bottom-2 left-2 z-[60] rounded border border-[#c5dced] bg-white px-3 py-1 text-[10px] text-[#5c7890]"
    >
      {status}
    </div>
  ) : null;
}
