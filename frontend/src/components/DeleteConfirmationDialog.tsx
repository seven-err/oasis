import { useEffect, useId, useRef, useState } from "react";

export function DeleteConfirmationDialog({ recordLabel, onCancel, onConfirm, action = "delete" }: {
  recordLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  action?: "delete" | "archive";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
      dialog?.close();
    };
  }, []);

  const finish = (action: () => void) => {
    if (closeTimer.current !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      action();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setClosing(false);
      action();
    }, 180);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-closing={closing}
      className="delete-confirmation m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-[#d0e3ef] bg-white p-5 shadow-2xl sm:p-6"
      onCancel={(event) => {
        event.preventDefault();
        finish(onCancel);
      }}
    >
      <h2 id={titleId} className="text-lg font-bold">{action === "archive" ? "Confirm archive" : "Confirm deletion"}</h2>
      <div id={descriptionId} className="mt-3 text-sm">
        <p>Are you sure you want to {action} <strong className="wrap-break-word">{recordLabel}</strong>?</p>
        <p className="mt-2 text-[#555]">{action === "archive"
          ? "This record will move to Archive Records, where you can review and restore it. Related history and attachments will be retained."
          : "This record will move to Deleted Records and can be restored for 30 days. After that, it will be permanently deleted during automatic cleanup. Related history and attachments will be retained."}</p>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button ref={cancelRef} type="button" className="secondary-btn rounded-lg" disabled={closing} onClick={() => finish(onCancel)}>Cancel</button>
        <button type="button" className={action === "archive" ? "primary-btn rounded-lg" : "primary-btn rounded-lg bg-red-700 hover:bg-red-800"} disabled={closing} onClick={() => finish(onConfirm)}>Confirm</button>
      </div>
    </dialog>
  );
}
