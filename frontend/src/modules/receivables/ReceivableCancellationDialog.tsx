import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { FormEvent } from "react";
import type { ReceivableViewModel } from "./types";
import { peso } from "./utils";

type Props = {
  record: ReceivableViewModel;
  onBack: () => void;
  onConfirm: (reason: string) => string | undefined;
};

export function ReceivableCancellationDialog({ record, onBack, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const errorId = useId();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    reasonRef.current?.focus();
    return () => dialog.close();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) {
      setReasonError("Enter a reason for cancellation.");
      reasonRef.current?.focus();
      return;
    }
    const error = onConfirm(reason);
    if (error) setFormError(error);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-[#d0e3ef] bg-white p-5 shadow-2xl backdrop:bg-black/45 sm:p-6"
      onCancel={(event) => {
        event.preventDefault();
        onBack();
      }}
    >
      <h2 id={titleId} className="text-lg font-bold">
        Cancel receivable
      </h2>
      <dl className="my-4 space-y-2 bg-[#e7f3fb] p-4 text-sm">
        <div>
          <dt className="field-label">Invoice number</dt>
          <dd className="wrap-break-word">{record.invoiceNumber}</dd>
        </div>
        <div>
          <dt className="field-label">Customer name</dt>
          <dd className="wrap-break-word">{record.customerName}</dd>
        </div>
        <div>
          <dt className="field-label">Total receivable amount</dt>
          <dd className="font-semibold">{peso.format(record.totalReceivableAmount)}</dd>
        </div>
      </dl>
      <form noValidate onSubmit={submit}>
        <label className="block">
          <span className="field-label">Reason for Cancellation *</span>
          <textarea
            ref={reasonRef}
            required
            rows={3}
            value={reason}
            aria-invalid={Boolean(reasonError)}
            aria-describedby={reasonError ? errorId : undefined}
            className="input mt-2 h-auto min-h-[88px] py-2.5"
            onChange={(event) => {
              setReason(event.target.value);
              if (event.target.value.trim()) setReasonError("");
              setFormError("");
            }}
          />
        </label>
        {reasonError && (
          <p id={errorId} role="alert" className="mt-2 text-xs text-red-700">
            {reasonError}
          </p>
        )}
        {formError && (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {formError}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="secondary-btn rounded-lg" onClick={onBack}>
            <ArrowLeft size={15} aria-hidden="true" /> Back
          </button>
          <button type="submit" className="primary-btn rounded-lg bg-red-700 hover:bg-red-800">
            Confirm Cancellation
          </button>
        </div>
      </form>
    </dialog>
  );
}
