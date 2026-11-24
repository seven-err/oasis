import { useEffect, useId, useState } from "react";
import { Trash2, X } from "lucide-react";
import { PAYMENT_METHODS } from "./constants";
import { payableService } from "./store";
import type { PayableFormValues, PayableItemValues, PayableRecord, ValidationResult } from "./types";
import { FieldLabel, FormInput, FormSelect, PanelTitle } from "./ui";
import { emptyFormValues, payableItemAmount, payableItemsTotal, paymentMethodLabel, paymentTermsLabel, peso, recordToFormValues } from "./utils";
import { useUnsavedForm } from "@/hooks/useUnsavedForm";
import { focusFirstError, updateVisibleErrors } from "@/components/formValidation";
import { validatePayablePayload } from "./validation";
import { waitForBusinessSave } from "@/businessStorage";

type Props = {
  mode: "create" | "edit";
  record?: PayableRecord;
  onCancel: () => void;
  onSaved: (record: PayableRecord) => void;
};

export function PayableForm({ mode, record, onCancel, onSaved }: Props) {
  const { markDirty, markSaved } = useUnsavedForm();
  const itemsErrorId = useId();
  const [values, setValues] = useState<PayableFormValues>(() =>
    record
      ? recordToFormValues(record, payableService.paymentsFor(record.id))
      : emptyFormValues(),
  );
  const [errors, setErrors] = useState<ValidationResult["errors"]>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setErrors((current) => Object.values(current).some(Boolean)
      ? updateVisibleErrors(current, validatePayablePayload(values, { existing: payableService.list(), editingId: record?.id }).errors)
      : current);
  }, [values, record]);

  const set =
    (key: keyof PayableFormValues) =>
    (value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    };

  const updateItem = (index: number, key: keyof PayableItemValues, value: string) => {
    markDirty();
    setValues((current) => ({
      ...current,
      items: current.items.map((item, position) => position === index ? { ...item, [key]: value } : item),
    }));
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setSaving(true);
    try {
      const result =
        mode === "edit" && record
          ? payableService.update(record.id, values)
          : payableService.create(values);

      if (!result.ok) {
        setErrors(result.errors);
        focusFirstError(form, result.errors);
        return;
      }
      await waitForBusinessSave();
      markSaved();
      onSaved(result.data);
    } catch (failure) {
      const errors = { form: failure instanceof Error ? failure.message : "The payable could not be saved. Please try again." };
      setErrors(errors);
      focusFirstError(form, errors);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <PanelTitle
        onBack={onCancel}
        backDisabled={saving}
        title={mode === "create" ? "Add payable" : "Edit payable"}
        subtitle="Amount paid and remaining balance are calculated from payment history."
      />
      <form onSubmit={onSubmit} onChangeCapture={markDirty} className="p-5 md:p-6" noValidate>
        {errors.form && (
          <div role="alert" tabIndex={-1} className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
            {errors.form}
          </div>
        )}

        <div className="space-y-6">
          <fieldset disabled={saving}>
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
              <FormInput
                label="Invoice date"
                name="invoiceDate"
                type="date"
                required
                value={values.invoiceDate}
                onChange={set("invoiceDate")}
                error={errors.invoiceDate}
              />
              {values.paymentStatus === "Unpaid" && (
                <>
                  <FormInput
                    label="Due date"
                    name="dueDate"
                    type="date"
                    required
                    value={values.dueDate}
                    onChange={set("dueDate")}
                    error={errors.dueDate}
                  />
                  <label className="block">
                    <FieldLabel>Payment terms</FieldLabel>
                    <input
                      name="paymentTerms"
                      className="input mt-2"
                      readOnly
                      value={paymentTermsLabel(values.invoiceDate, values.dueDate)}
                      placeholder="Calculated from invoice date to due date"
                    />
                  </label>
                </>
              )}
              <FormSelect
                label="Payment status"
                name="paymentStatus"
                required
                value={values.paymentStatus}
                onChange={set("paymentStatus")}
                error={errors.paymentStatus}
              >
                <option value="Unpaid">Unpaid</option>
                <option value="Paid">Paid</option>
              </FormSelect>
              <FormSelect
                label={values.paymentStatus === "Paid" ? "Payment method" : "Expected payment method"}
                required={values.paymentStatus === "Paid"}
                name="paymentMethod"
                value={values.paymentMethod}
                onChange={set("paymentMethod")}
                error={errors.paymentMethod}
              >
                <option value="">Not specified</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {paymentMethodLabel(m)}
                  </option>
                ))}
              </FormSelect>
              <FormInput
                label="Reference number (optional)"
                name="referenceNumber"
                value={values.referenceNumber}
                onChange={set("referenceNumber")}
                error={errors.referenceNumber}
                placeholder="Internal AP reference"
              />
              {values.paymentStatus === "Paid" && (
                  <p className="text-xs text-[#555] sm:col-span-2 lg:col-span-3">
                    Saving as Paid records a payment for the remaining balance using today’s date. Select the payment method above; the reference number is optional.
                  </p>
              )}
            </div>
          </fieldset>

          <fieldset disabled={saving}>
            <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">
              Payable items
            </legend>
            {(errors.items || errors.totalAmount) && (
              <p id={itemsErrorId} role="alert" tabIndex={-1} className="mb-3 text-xs text-red-700">
                {errors.items || errors.totalAmount}
              </p>
            )}
            <div className="overflow-x-auto rounded-lg border border-[#d0e3ef]">
              <table className="w-full min-w-[600px]">
                <caption className="sr-only">Payable items</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-1/2">Item Description</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Price</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {values.items.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <div className="relative">
                        <input
                          className="input pr-9" name="items" aria-label={`Item ${index + 1} description`}
                          required maxLength={255} value={item.description}
                          aria-invalid={Boolean(errors.items)} aria-describedby={errors.items ? itemsErrorId : undefined}
                          onChange={(event) => updateItem(index, "description", event.target.value)}
                        />
                          {item.description !== "" && (
                            <button type="button"
                              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-[#888] hover:bg-[#e7f3fb] hover:text-[#1f6ea6]"
                              aria-label={`Clear item ${index + 1} description`}
                              onClick={(event) => {
                                updateItem(index, "description", "");
                                event.currentTarget.parentElement?.querySelector("input")?.focus();
                              }}
                            ><X size={14} aria-hidden="true" /></button>
                          )}
                        </div>

                      </td>
                      <td>
                        <div className="relative">
                        <input className="input pr-9" name="items" type="number" min="0.01" step="0.01" required
                          aria-label={`Item ${index + 1} quantity`} value={item.quantity}
                          aria-invalid={Boolean(errors.items)} aria-describedby={errors.items ? itemsErrorId : undefined}
                          onChange={(event) => updateItem(index, "quantity", event.target.value)}
                        />
                          {item.quantity !== "" && (
                            <button type="button"
                              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-[#888] hover:bg-[#e7f3fb] hover:text-[#1f6ea6]"
                              aria-label={`Clear item ${index + 1} quantity`}
                              onClick={(event) => {
                                updateItem(index, "quantity", "");
                                event.currentTarget.parentElement?.querySelector("input")?.focus();
                              }}
                            ><X size={14} aria-hidden="true" /></button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="relative">
                        <input className="input pr-9" name="items" type="number" min="0" step="0.01" required
                          aria-label={`Item ${index + 1} price`} value={item.price}
                          aria-invalid={Boolean(errors.items)} aria-describedby={errors.items ? itemsErrorId : undefined}
                          onChange={(event) => updateItem(index, "price", event.target.value)}
                        />
                          {item.price !== "" && (
                            <button type="button"
                              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-[#888] hover:bg-[#e7f3fb] hover:text-[#1f6ea6]"
                              aria-label={`Clear item ${index + 1} price`}
                              onClick={(event) => {
                                updateItem(index, "price", "");
                                event.currentTarget.parentElement?.querySelector("input")?.focus();
                              }}
                            ><X size={14} aria-hidden="true" /></button>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center justify-between gap-3">
                        <output aria-label={`Item ${index + 1} amount`}>
                          {Number.isFinite(payableItemAmount(item)) ? peso.format(payableItemAmount(item)) : "—"}
                        </output>
                        {values.items.length > 1 && (
                          <button type="button" className="table-action shrink-0"
                            aria-label={`Remove item ${index + 1}`}
                            onClick={() => {
                              markDirty();
                              setValues((current) => ({ ...current, items: current.items.filter((_, position) => position !== index) }));
                            }}
                          ><Trash2 size={16} style={{ color: "#b91c1c" }} aria-hidden="true" /></button>
                        )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={3} className="text-right">Total amount</th>
                    <td className="whitespace-nowrap font-semibold">
                      {Number.isFinite(payableItemsTotal(values.items)) ? peso.format(payableItemsTotal(values.items)) : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <button type="button" className="secondary-btn mt-3" onClick={() => {
              markDirty();
              setValues((current) => ({ ...current, items: [...current.items, { description: "", quantity: "1", price: "" }] }));
            }}>Add item</button>
          </fieldset>

        </div>

        <div className="mt-7 flex justify-end gap-2 border-t border-[#e1eef6] pt-5">
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save payable"}
          </button>
        </div>
      </form>
    </section>
  );
}
