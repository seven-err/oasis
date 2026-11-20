import { useEffect, useMemo, useState } from "react";
import { PAYMENT_METHODS } from "./constants";
import { payableService } from "./store";
import type { PayableFormValues, PayableRecord, ValidationResult } from "./types";
import { FieldError, FormInput, FormSelect, FormTextarea, PanelTitle } from "./ui";
import { emptyFormValues, recordToFormValues } from "./utils";
import { useUnsavedForm } from "@/hooks/useUnsavedForm";
import { focusFirstError, updateVisibleErrors } from "@/components/formValidation";
import { validatePayablePayload } from "./validation";

type Props = {
  mode: "create" | "edit";
  record?: PayableRecord;
  onCancel: () => void;
  onSaved: (record: PayableRecord) => void;
};

export function PayableForm({ mode, record, onCancel, onSaved }: Props) {
  const { markDirty, markSaved } = useUnsavedForm();
  const categories = useMemo(() => payableService.categories(true), []);
  const [values, setValues] = useState<PayableFormValues>(() =>
    record
      ? recordToFormValues(record)
      : emptyFormValues({
          categoryId: categories[0] ? String(categories[0].id) : "",
          paymentMethod: "",
        }),
  );
  const [errors, setErrors] = useState<ValidationResult["errors"]>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setErrors((current) => Object.values(current).some(Boolean)
      ? updateVisibleErrors(current, validatePayablePayload(values, { existing: payableService.list(), categories, editingId: record?.id }).errors)
      : current);
  }, [values, categories, record]);

  const set =
    (key: keyof PayableFormValues) =>
    (value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const result =
      mode === "edit" && record
        ? payableService.update(record.id, values)
        : payableService.create(values);

    if (!result.ok) {
      setErrors(result.errors);
      focusFirstError(e.currentTarget, result.errors);
      setSaving(false);
      return;
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
        title={mode === "create" ? "Add payable" : "Edit payable"}
        subtitle="New payables default to Pending approval. Amount paid and remaining balance are calculated from payment history."
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
              Payable information
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-2">
                <FormInput
                  label="Payee name"
                  name="payeeName"
                  required
                  value={values.payeeName}
                  onChange={set("payeeName")}
                  error={errors.payeeName}
                />
              </div>
              <FormInput
                label="Invoice number"
                name="invoiceNumber"
                required
                value={values.invoiceNumber}
                onChange={set("invoiceNumber")}
                error={errors.invoiceNumber}
              />
              <FormSelect
                label="Category"
                name="categoryId"
                required
                value={values.categoryId}
                onChange={set("categoryId")}
                error={errors.categoryId}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </FormSelect>
              <FormInput
                label="Invoice date"
                name="invoiceDate"
                type="date"
                required
                value={values.invoiceDate}
                onChange={set("invoiceDate")}
                error={errors.invoiceDate}
              />
              <FormInput
                label="Due date"
                name="dueDate"
                type="date"
                required
                value={values.dueDate}
                onChange={set("dueDate")}
                error={errors.dueDate}
              />
              <FormInput
                label="Total amount"
                name="totalAmount"
                type="number"
                required
                value={values.totalAmount}
                onChange={set("totalAmount")}
                error={errors.totalAmount}
              />
              <FormSelect
                label="Expected payment method"
                name="paymentMethod"
                value={values.paymentMethod}
                onChange={set("paymentMethod")}
                error={errors.paymentMethod}
              >
                <option value="">Not specified</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </FormSelect>
              <FormInput
                label="Reference number"
                name="referenceNumber"
                value={values.referenceNumber}
                onChange={set("referenceNumber")}
                error={errors.referenceNumber}
                placeholder="Internal AP reference"
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <FormTextarea
                  label="Description"
                  name="description"
                  required
                  value={values.description}
                  onChange={set("description")}
                  error={errors.description}
                />
              </div>
            </div>
          </fieldset>

          {mode === "create" && (
            <p className="text-[11px] text-[#777]">
              Approval status will be set to <strong>Pending</strong>. Payment status is derived
              automatically after payments are recorded.
            </p>
          )}
          {mode === "edit" && record && (
            <div className="rounded-lg border border-[#d0e3ef] bg-[#f4f9fd] p-4 text-[11px] text-[#666]">
              <p>
                Approval status: <strong>{record.approvalStatus}</strong> (managed separately —
                use Approve / Reject on the detail view).
              </p>
              <FieldError message={errors.form} />
            </div>
          )}
        </div>

        <div className="mt-7 flex justify-end gap-2 border-t border-[#e1eef6] pt-5">
          <button className="primary-btn" disabled={saving}>
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save payable"}
          </button>
        </div>
      </form>
    </section>
  );
}
