import { useEffect, useMemo, useState } from "react";
import { PAYMENT_METHODS } from "./constants";
import { receivableService } from "./store";
import type {
  CustomerFormValues,
  ReceivableFormValues,
  ReceivableRecord,
  ValidationResult,
} from "./types";
import { FieldError, FormInput, FormSelect, FormTextarea, PanelTitle } from "./ui";
import { emptyFormValues, recordToFormValues } from "./utils";
import { useUnsavedForm } from "@/hooks/useUnsavedForm";
import { focusFirstError, updateVisibleErrors } from "@/components/formValidation";
import { validateCustomerPayload, validateReceivablePayload } from "./validation";

type Props = {
  mode: "create" | "edit";
  record?: Omit<ReceivableRecord, "collectionStatus">;
  onCancel: () => void;
  onSaved: (record: ReceivableRecord) => void;
};

const emptyCustomer = (): CustomerFormValues => ({
  clientId: "",
  customerName: "",
  contactNumber: "",
  emailAddress: "",
  billingAddress: "",
});

export function ReceivableForm({ mode, record, onCancel, onSaved }: Props) {
  const { markDirty, markSaved } = useUnsavedForm();
  const [customerTick, setCustomerTick] = useState(0);
  const customers = useMemo(
    () => receivableService.customers(true),
    [customerTick],
  );
  const [values, setValues] = useState<ReceivableFormValues>(() =>
    record
      ? recordToFormValues(record)
      : emptyFormValues({ paymentMethod: "" }),
  );
  const [errors, setErrors] = useState<ValidationResult["errors"]>({});
  const [saving, setSaving] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [customerValues, setCustomerValues] = useState<CustomerFormValues>(emptyCustomer);
  const [customerErrors, setCustomerErrors] = useState<ValidationResult["errors"]>({});

  useEffect(() => {
    setErrors((current) => Object.values(current).some(Boolean)
      ? updateVisibleErrors(current, validateReceivablePayload(values, { existing: receivableService.list(), customers, editingId: record?.id }).errors)
      : current);
  }, [values, customers, record]);
  useEffect(() => {
    setCustomerErrors((current) => Object.values(current).some(Boolean)
      ? updateVisibleErrors(current, validateCustomerPayload(customerValues, { existing: receivableService.customers(false) }).errors)
      : current);
  }, [customerValues]);

  const set =
    (key: keyof ReceivableFormValues) =>
    (value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    };

  const applyCustomer = (customerId: string) => {
    const customer = customers.find((c) => c.id === Number(customerId));
    setValues((prev) => ({
      ...prev,
      customerId,
      clientId: customer?.clientId ?? "",
      customerName: customer?.customerName ?? "",
      contactNumber: customer?.contactNumber ?? "",
      emailAddress: customer?.emailAddress ?? "",
      billingAddress: customer?.billingAddress ?? "",
    }));
  };

  const onCreateCustomer = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const result = receivableService.createCustomer(customerValues);
    if (!result.ok) {
      setCustomerErrors(result.errors);
      const form = e.currentTarget.closest("form");
      if (form) focusFirstError(form, Object.fromEntries(Object.entries(result.errors).map(([key, value]) => [`new${key[0].toUpperCase()}${key.slice(1)}`, value])));
      return;
    }
    setCustomerTick((n) => n + 1);
    setShowNewCustomer(false);
    setCustomerValues(emptyCustomer());
    setCustomerErrors({});
    applyCustomer(String(result.data.id));
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const result =
      mode === "edit" && record
        ? receivableService.update(record.id, values)
        : receivableService.create(values);

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
        title={mode === "create" ? "Add receivable" : "Edit receivable"}
        subtitle="Select an existing customer to populate contact details. Amount paid, remaining balance, days overdue, and collection status are calculated from collection history."
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
              Customer information
            </legend>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <FormSelect
                  label="Existing customer"
                  name="customerId"
                  required
                  value={values.customerId}
                  onChange={applyCustomer}
                  error={errors.customerId}
                >
                  <option value="">Select customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customerName}
                    </option>
                  ))}
                </FormSelect>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowNewCustomer((x) => !x)}
              >
                {showNewCustomer ? "Cancel new customer" : "Register customer"}
              </button>
            </div>

            {showNewCustomer && (
              <div className="mb-5 border border-[#d0e3ef] bg-[#f4f9fd] p-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">
                  Register new customer
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormInput
                    label="Client ID"
                    name="newClientId"
                    required
                    value={customerValues.clientId}
                    onChange={(v) => {
                      setCustomerValues((p) => ({ ...p, clientId: v }));
                    }}
                    error={customerErrors.clientId}
                  />
                  <FormInput
                    label="Customer name"
                    name="newCustomerName"
                    required
                    value={customerValues.customerName}
                    onChange={(v) => {
                      setCustomerValues((p) => ({ ...p, customerName: v }));
                    }}
                    error={customerErrors.customerName}
                  />
                  <FormInput
                    label="Contact number"
                    name="newContactNumber"
                    required
                    value={customerValues.contactNumber}
                    onChange={(v) => {
                      setCustomerValues((p) => ({ ...p, contactNumber: v }));
                    }}
                    error={customerErrors.contactNumber}
                  />
                  <FormInput
                    label="Email address"
                    name="newEmailAddress"
                    type="email"
                    required
                    value={customerValues.emailAddress}
                    onChange={(v) => {
                      setCustomerValues((p) => ({ ...p, emailAddress: v }));
                    }}
                    error={customerErrors.emailAddress}
                  />
                  <div className="sm:col-span-2">
                    <FormTextarea
                      label="Billing address"
                      name="newBillingAddress"
                      required
                      value={customerValues.billingAddress}
                      onChange={(v) => {
                        setCustomerValues((p) => ({ ...p, billingAddress: v }));
                      }}
                      error={customerErrors.billingAddress}
                    />
                  </div>
                </div>
                <FieldError message={customerErrors.form} />
                <div className="mt-4 flex justify-end">
                  <button type="button" className="primary-btn" onClick={onCreateCustomer}>
                    Save customer
                  </button>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2">
                <FormInput
                  label="Customer name"
                  name="customerName"
                  required
                  value={values.customerName}
                  onChange={set("customerName")}
                  error={errors.customerName}
                />
              </div>
              <FormInput
                label="Contact number"
                name="contactNumber"
                required
                value={values.contactNumber}
                onChange={set("contactNumber")}
                error={errors.contactNumber}
              />
              <FormInput
                label="Email address"
                name="emailAddress"
                type="email"
                required
                value={values.emailAddress}
                onChange={set("emailAddress")}
                error={errors.emailAddress}
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <FormTextarea
                  label="Billing address"
                  name="billingAddress"
                  required
                  value={values.billingAddress}
                  onChange={set("billingAddress")}
                  error={errors.billingAddress}
                />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[#777]">
              Invoice snapshots preserve these details for historical accuracy if the customer
              master record changes later.
            </p>
          </fieldset>

          <fieldset>
            <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">
              Invoice and transaction information
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormInput
                label="Invoice number"
                name="invoiceNumber"
                required
                value={values.invoiceNumber}
                onChange={set("invoiceNumber")}
                error={errors.invoiceNumber}
              />
              <FormInput
                label="Reference number"
                name="referenceNumber"
                required
                value={values.referenceNumber}
                onChange={set("referenceNumber")}
                error={errors.referenceNumber}
                placeholder="Internal AR reference"
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
                label="Total receivable amount"
                name="totalReceivableAmount"
                type="number"
                required
                value={values.totalReceivableAmount}
                onChange={set("totalReceivableAmount")}
                error={errors.totalReceivableAmount}
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
                label="Collection follow-up date"
                name="collectionFollowUpDate"
                type="date"
                value={values.collectionFollowUpDate}
                onChange={set("collectionFollowUpDate")}
                error={errors.collectionFollowUpDate}
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

          <p className="text-[11px] text-[#777]">
            Collection status, amount paid, remaining balance, and days overdue are calculated
            automatically and cannot be overwritten manually.
          </p>
        </div>

        <div className="mt-7 flex justify-end gap-2 border-t border-[#e1eef6] pt-5">
          <button className="primary-btn" disabled={saving}>
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save receivable"}
          </button>
        </div>
      </form>
    </section>
  );
}
