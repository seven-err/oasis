import { checkStatusLabel, checkTypeLabel } from "./utils";
import { ATTACHMENT_ACCEPT, ATTACHMENT_FORMATS } from "@/components/attachmentFileTypes";
import { useEffect, useMemo, useState } from "react";
import { CHECK_TYPES } from "./constants";
import { allowedStatusesForType, defaultStatusForType } from "./statusTransitions";
import { checkService } from "./store";
import { validateAttachmentFile, validateCheckPayload } from "./validation";
import type { CheckFormValues, CheckRecord, ValidationResult } from "./types";
import { FieldError, FieldLabel, FormInput, FormSelect, PanelTitle } from "./ui";
import { emptyFormValues, recordToFormValues } from "./utils";
import { useUnsavedForm } from "@/hooks/useUnsavedForm";
import { focusFirstError, updateVisibleErrors } from "@/components/formValidation";

type Props = {
  mode: "create" | "edit";
  record?: CheckRecord;
  onCancel: () => void;
  onSaved: (record: CheckRecord) => void;
};

export function CheckForm({ mode, record, onCancel, onSaved }: Props) {
  const { markDirty, markSaved } = useUnsavedForm();
  const user = checkService.getUser();
  const [values, setValues] = useState<CheckFormValues>(() =>
    record
      ? recordToFormValues(record)
      : emptyFormValues({
          checkType: "Received Check",
          checkStatus: defaultStatusForType("Received Check"),
          drawerName: "",
          payeeName: "OASIS Company",
        }),
  );
  const [errors, setErrors] = useState<ValidationResult["errors"]>({});
  const [attachmentError, setAttachmentError] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const statuses = useMemo(
    () => (values.checkType ? allowedStatusesForType(values.checkType) : []),
    [values.checkType],
  );

  useEffect(() => {
    if (!values.checkType) return;
    if (values.checkStatus && !statuses.includes(values.checkStatus)) {
      setValues((v) => ({ ...v, checkStatus: defaultStatusForType(values.checkType as never) }));
    }
  }, [values.checkType, values.checkStatus, statuses]);

  useEffect(() => {
    setErrors((current) => Object.values(current).some(Boolean)
      ? updateVisibleErrors(current, validateCheckPayload(values, { existing: checkService.list(), editingId: record?.id, previousStatus: record?.checkStatus }).errors)
      : current);
  }, [values, record]);

  const set =
    (key: keyof CheckFormValues) =>
    (value: string) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        if (key === "checkType" && value) {
          next.checkStatus = defaultStatusForType(value as never);
          if (value === "Received Check") {
            next.payeeName = next.payeeName || "OASIS Company";
          } else if (value === "Issued Check") {
            next.drawerName = next.drawerName || "OASIS Company";
          }
        }
        return next;
      });
    };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (user.permissions.manageAttachments) {
      const invalidFile = pendingFiles.find((file) => validateAttachmentFile(file));
      if (invalidFile) {
        setAttachmentError(`${invalidFile.name}: ${validateAttachmentFile(invalidFile)}`);
        focusFirstError(e.currentTarget, { attachments: true });
        return;
      }
    }
    setSaving(true);
    setAttachmentError("");
    const result =
      mode === "edit" && record
        ? checkService.update(record.id, values)
        : checkService.create(values);

    if (!result.ok) {
      setErrors(result.errors);
      focusFirstError(e.currentTarget, result.errors);
      setSaving(false);
      return;
    }

    if (pendingFiles.length && user.permissions.manageAttachments) {
      for (const file of pendingFiles) {
        const att = await checkService.addAttachment(result.data.id, file);
        if (!att.ok) {
          setAttachmentError(att.errors.attachments ?? "Attachment upload failed.");
          setSaving(false);
          markSaved();
          onSaved(result.data);
          return;
        }
      }
    }

    setSaving(false);
    markSaved();
    onSaved(result.data);
  };

  return (
    <section className="panel">
      <PanelTitle
        onBack={onCancel}
        backDisabled={saving}
        title={mode === "create" ? "Add cheque" : "Edit cheque"}
        subtitle="All required fields must be completed. Prepared By is set to the authenticated user."
      />
      <form onSubmit={onSubmit} onChangeCapture={markDirty} className="p-5 md:p-6" noValidate>
        {errors.form && (
          <div role="alert" tabIndex={-1} className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
            {errors.form}
          </div>
        )}

        <div className="space-y-6">
          <fieldset>
            <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">
              Cheque information
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormInput
                label="Cheque number"
                name="checkNumber"
                required
                value={values.checkNumber}
                onChange={set("checkNumber")}
                error={errors.checkNumber}
              />
              <FormSelect
                label="Cheque type"
                name="checkType"
                required
                value={values.checkType}
                onChange={set("checkType")}
                error={errors.checkType}
              >
                <option value="">Select type</option>
                {CHECK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {checkTypeLabel(t)}
                  </option>
                ))}
              </FormSelect>
              <FormSelect
                label="Cheque status"
                name="checkStatus"
                required
                value={values.checkStatus}
                onChange={set("checkStatus")}
                error={errors.checkStatus}
              >
                <option value="">Select status</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {checkStatusLabel(s)}
                  </option>
                ))}
              </FormSelect>
              <FormInput
                label="Cheque date"
                name="checkDate"
                type="date"
                required
                value={values.checkDate}
                onChange={set("checkDate")}
                error={errors.checkDate}
              />
              <FormInput
                label="Date received / issued"
                name="dateReceivedIssued"
                type="date"
                required
                value={values.dateReceivedIssued}
                onChange={set("dateReceivedIssued")}
                error={errors.dateReceivedIssued}
              />
              <FormInput
                label="Reference number"
                name="referenceNumber"
                value={values.referenceNumber}
                onChange={set("referenceNumber")}
                error={errors.referenceNumber}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">
              Parties and bank information
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormInput
                label="Payee name"
                name="payeeName"
                required
                value={values.payeeName}
                onChange={set("payeeName")}
                error={errors.payeeName}
              />
              <FormInput
                label="Drawer name"
                name="drawerName"
                required
                value={values.drawerName}
                onChange={set("drawerName")}
                error={errors.drawerName}
              />
              <FormInput
                label="Bank name"
                name="bankName"
                required
                value={values.bankName}
                onChange={set("bankName")}
                error={errors.bankName}
              />
              <FormInput
                label="Branch"
                name="branch"
                required
                value={values.branch}
                onChange={set("branch")}
                error={errors.branch}
              />
              <FormInput
                label="Account number"
                name="accountNumber"
                required
                value={values.accountNumber}
                onChange={set("accountNumber")}
                error={errors.accountNumber}
                autoComplete="off"
                placeholder="Sensitive — stored securely"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">
              Financial information
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput
                label="Cheque amount (PHP)"
                name="checkAmount"
                type="number"
                required
                value={values.checkAmount}
                onChange={set("checkAmount")}
                error={errors.checkAmount}
              />
              <FormInput
                label="Purpose"
                name="purpose"
                required
                value={values.purpose}
                onChange={set("purpose")}
                error={errors.purpose}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">
              Attachments
            </legend>
            <label className="block">
              <FieldLabel>Upload scanned cheques or supporting documents</FieldLabel>
              <input
                type="file"
                name="attachments"
                aria-invalid={attachmentError || errors.attachments ? true : undefined}
                aria-describedby={attachmentError || errors.attachments ? "check-attachments-error" : undefined}
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="input mt-2 h-auto py-2 file:mr-3 file:border-0 file:bg-[#e7f3fb] file:px-3 file:py-1.5 file:text-[11px] file:font-semibold"
                disabled={!user.permissions.manageAttachments}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setPendingFiles(files);
                  setAttachmentError("");
                }}
              />
              <p className="mt-2 text-[11px] text-[#888]">
                {ATTACHMENT_FORMATS} · Max 5 MB each · Stored privately (not public URLs)
              </p>
              <FieldError id="check-attachments-error" message={attachmentError || errors.attachments} />
              {pendingFiles.length > 0 && (
                <ul className="mt-3 space-y-1 text-[11px] text-[#555]">
                  {pendingFiles.map((f) => (
                    <li key={f.name}>
                      {f.name} · {(f.size / 1024).toFixed(1)} KB
                    </li>
                  ))}
                </ul>
              )}
            </label>
          </fieldset>

          <fieldset>
            <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">
              Preparation and audit
            </legend>
            <div className="grid gap-px overflow-hidden rounded-lg bg-[#d0e3ef] sm:grid-cols-2">
              <div className="bg-[#e7f3fb] p-4">
                <span className="field-label">Prepared by</span>
                <strong className="mt-1 block text-sm">
                  {record?.preparedByName ?? user.name}
                </strong>
                <span className="mt-1 block text-[10px] text-[#888]">
                  Authenticated OASIS user (read-only)
                </span>
              </div>
              <div className="bg-[#e7f3fb] p-4">
                <span className="field-label">Mode</span>
                <strong className="mt-1 block text-sm">
                  {mode === "create" ? "New registration" : "Update existing record"}
                </strong>
              </div>
            </div>
          </fieldset>
        </div>

        <div className="mt-8 flex flex-wrap justify-end gap-2 border-t border-[#e1eef6] pt-5">
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save cheque"}
          </button>
        </div>
      </form>
    </section>
  );
}
