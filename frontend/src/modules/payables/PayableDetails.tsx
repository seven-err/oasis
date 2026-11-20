import { ArchiveConfirmationDialog } from "@/components/ArchiveConfirmationDialog";
import {
  Archive,
  Banknote,
  History,
  Pencil,
  Printer,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrintReport } from "@/components/usePrintReport";
import { PAYMENT_METHODS } from "./constants";
import { payableService } from "./store";
import type {
  PayableView,
  PaymentFormValues,
  PayablePayment,
  PayableViewModel,
  ValidationResult,
} from "./types";
import {
  DetailGrid,
  FormInput,
  FormSelect,
  MoneySummaryStrip,
  PanelTitle,
  SectionCard,
  StatusBadge,
} from "./ui";
import { formatDate, formatDateTime, peso, todayIsoDate } from "./utils";

type Props = {
  record: PayableViewModel;
  focus?: Extract<PayableView, { mode: "details" }>["focus"];
  onBack: () => void;
  onEdit: () => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

const emptyPayment = (): PaymentFormValues => ({
  paymentDate: todayIsoDate(),
  amountPaid: "",
  paymentMethod: "",
  referenceNumber: "",
  checkId: "",
  remarks: "",
});

export function PayableDetails({
  record,
  focus,
  onBack,
  onEdit,
  onChanged,
  notify,
}: Props) {
  const paymentHistoryRef = useRef<HTMLElement>(null);
  const paymentFormRef = useRef<HTMLElement>(null);
  const { printReport, printSheet } = usePrintReport();
  const user = payableService.getUser();
  const [archiving, setArchiving] = useState(false);
  const [payments, setPayments] = useState(() => payableService.paymentsFor(record.id));
  useEffect(() => setPayments(payableService.paymentsFor(record.id)), [record]);
  const activity = useMemo(
    () => payableService.activityFor(record.id),
    [record, payments],
  );
  const linkableChecks = useMemo(() => payableService.linkableChecks(), [payments]);

  const [showPaymentForm, setShowPaymentForm] = useState(focus === "payments");
  const [paymentValues, setPaymentValues] = useState<PaymentFormValues>(emptyPayment);
  const [paymentErrors, setPaymentErrors] = useState<ValidationResult["errors"]>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (focus === "payments") setShowPaymentForm(true);
  }, [focus]);

  useEffect(() => {
    const target = focus === "payment-history"
      ? paymentHistoryRef
      : focus === "payments" && showPaymentForm
        ? paymentFormRef
        : null;
    if (!target) return;
    // Run after the view history hook resets the page scroll position.
    const frame = requestAnimationFrame(() => {
      target.current?.focus({ preventScroll: true });
      target.current?.scrollIntoView({ behavior: "instant", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus, record.id, showPaymentForm]);

  const refreshPayments = () => setPayments(payableService.paymentsFor(record.id));

  const setPay =
    (key: keyof PaymentFormValues) =>
    (value: string) => {
      setPaymentValues((prev) => ({ ...prev, [key]: value }));
      setPaymentErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
    };

  const onArchive = () => {
    if (!user.permissions.archivePayables) {
      notify("You are not authorized to archive payables.");
      return;
    }
    try {
      const result = payableService.archive(record.id);
      if (!result.ok) {
        notify(result.errors.form ?? "Unable to archive.");
        return;
      }
      setArchiving(false);
      notify("Payable archived.");
      onChanged();
    } catch {
      notify("Unable to save the archive. Please try again.");
    }
  };

  const onRestore = () => {
    const result = payableService.restore(record.id);
    if (!result.ok) {
      notify(result.errors.form ?? "Unable to restore.");
      return;
    }
    notify("Payable restored.");
    onChanged();
  };

  const onRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result = payableService.recordPayment(record.id, paymentValues);
    if (!result.ok) {
      setPaymentErrors(result.errors);
      setSaving(false);
      return;
    }
    setSaving(false);
    setPaymentValues(emptyPayment());
    setShowPaymentForm(false);
    refreshPayments();
    notify("Payment recorded.");
    onChanged();
  };

  const onReverse = (payment: PayablePayment) => {
    if (!user.permissions.reversePayments) {
      notify("You are not authorized to reverse payments.");
      return;
    }
    if (
      !window.confirm(
        `Reverse payment ${peso.format(payment.amountPaid)}? The original record will be retained for audit.`,
      )
    ) {
      return;
    }
    const result = payableService.reversePayment(payment.id);
    if (!result.ok) {
      notify(result.errors.form ?? "Unable to reverse payment.");
      return;
    }
    refreshPayments();
    notify("Payment reversed.");
    onChanged();
  };

  const canRecordPayment =
    user.permissions.recordPayments &&
    !record.archivedAt &&
    record.remainingBalance > 0;

  const printRecord = () => {
    const details = {
      "Payee name": record.payeeName,
      "Invoice number": record.invoiceNumber,
      Category: record.categoryName,
      Description: record.description,
      "Invoice date": formatDate(record.invoiceDate),
      "Due date": formatDate(record.dueDate),
      "Expected payment method": record.paymentMethod,
      "Reference number": record.referenceNumber,
      "Total amount": peso.format(record.totalAmount),
      "Amount paid": peso.format(record.amountPaid),
      "Remaining balance": peso.format(record.remainingBalance),
      "Payment status": record.paymentStatus,
      "Latest payment method": record.displayPaymentMethod,
      "Latest payment reference": record.displayReferenceNumber,
      "Created by": record.createdByName,
      Created: formatDateTime(record.createdAt),
      "Last updated": formatDateTime(record.updatedAt),
      "Archive status": record.archivedAt ? `Archived ${formatDateTime(record.archivedAt)}` : "Active",
    };
    const rows: Record<string, unknown>[] = Object.entries(details).map(([Field, Value]) => ({ Field, Value }));
    rows.push(...(payments.length ? payments.map((p) => ({
      Field: `Payment · ${formatDate(p.paymentDate)}`,
      Value: `${peso.format(p.amountPaid)} · ${p.paymentMethod} · Reference: ${p.referenceNumber || "—"} · Check: ${p.checkNumber || "—"} · Recorded by: ${p.recordedByName} · ${p.isReversal ? "Reversal" : p.reversedAt ? "Reversed" : "Valid"}`,
    })) : [{ Field: "Payment history", Value: "No payments recorded yet." }]));
    rows.push(...(activity.length ? activity.map((item) => ({
      Field: `Activity · ${formatDateTime(item.performedAt)}`,
      Value: `${item.summary} · ${item.performedByName}${item.previousApprovalStatus && item.newApprovalStatus ? ` · ${item.previousApprovalStatus} → ${item.newApprovalStatus}` : ""}`,
    })) : [{ Field: "Activity history", Value: "No history recorded yet." }]));
    void printReport("Payable record", rows, 1, record.payeeName);
  };

  return (
    <div className="space-y-5">
      {archiving && (
        <ArchiveConfirmationDialog
          recordLabel={`Payable ${record.invoiceNumber} - ${record.payeeName}`}
          onCancel={() => setArchiving(false)}
          onConfirm={onArchive}
        />
      )}
      <section className="panel">
        <PanelTitle
          onBack={onBack}
          title={record.invoiceNumber}
          subtitle={`${record.payeeName} · ${record.categoryName}`}
          action={
            <div className="flex flex-wrap gap-2">
              {user.permissions.editPayables && !record.archivedAt && (
                <button onClick={onEdit} className="primary-btn">
                  <Pencil size={15} /> Edit
                </button>
              )}
            </div>
          }
        />
        <div className="flex flex-col gap-4 border-b border-[#d0e3ef] bg-[#e7f3fb] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center bg-[#1f6ea6] text-white rounded-lg">
              <Banknote size={20} />
            </span>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <StatusBadge value={record.paymentStatus} />
              </div>
              <strong className="block text-lg tracking-[-.02em]">
                {peso.format(record.remainingBalance)} remaining
              </strong>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={printRecord} className="secondary-btn">
              <Printer size={15} /> Print
            </button>
            {record.archivedAt ? (
              <button onClick={onRestore} className="secondary-btn">
                <RotateCcw size={15} /> Restore
              </button>
            ) : (
              user.permissions.archivePayables && (
                <button onClick={() => setArchiving(true)} className="secondary-btn text-red-700">
                  <Archive size={15} /> Archive
                </button>
              )
            )}
          </div>
        </div>
        <div className="p-5">
          <MoneySummaryStrip
            total={peso.format(record.totalAmount)}
            paid={peso.format(record.amountPaid)}
            remaining={peso.format(record.remainingBalance)}
          />
        </div>
      </section>

      {showPaymentForm && canRecordPayment && (
        <section
          ref={paymentFormRef}
          tabIndex={-1}
          aria-label="Record payment"
          className={`panel scroll-mt-24 outline-none ${
            focus === "payments" ? "section-highlight bg-[#f0f8ff]" : ""
          }`}
        >
          <PanelTitle
            title="Record payment"
            subtitle={`Remaining balance ${peso.format(record.remainingBalance)}. Overpayments are not allowed.`}
          />
          <form onSubmit={onRecordPayment} className="space-y-4 p-5" noValidate>
            {paymentErrors.form && (
              <div className="border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                {paymentErrors.form}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormInput
                label="Payment date"
                name="paymentDate"
                type="date"
                required
                value={paymentValues.paymentDate}
                onChange={setPay("paymentDate")}
                error={paymentErrors.paymentDate}
              />
              <FormInput
                label="Amount paid"
                name="amountPaid"
                type="number"
                required
                value={paymentValues.amountPaid}
                onChange={setPay("amountPaid")}
                error={paymentErrors.amountPaid}
                max={record.remainingBalance}
              />
              <FormSelect
                label="Payment method"
                name="paymentMethod"
                required
                value={paymentValues.paymentMethod}
                onChange={setPay("paymentMethod")}
                error={paymentErrors.paymentMethod}
              >
                <option value="">Select method</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </FormSelect>
              <FormInput
                label="Reference number"
                name="referenceNumber"
                required
                value={paymentValues.referenceNumber}
                onChange={setPay("referenceNumber")}
                error={paymentErrors.referenceNumber}
              />
              {paymentValues.paymentMethod === "Check" && (
                <FormSelect
                  label="Linked check"
                  name="checkId"
                  required
                  value={paymentValues.checkId}
                  onChange={setPay("checkId")}
                  error={paymentErrors.checkId}
                >
                  <option value="">Select existing check</option>
                  {linkableChecks.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.checkNumber} · {c.payeeName} · {peso.format(c.checkAmount)}
                    </option>
                  ))}
                </FormSelect>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e1eef6] pt-4">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowPaymentForm(false)}
              >
                Cancel
              </button>
              <button className="primary-btn" disabled={saving}>
                {saving ? "Saving…" : "Save payment"}
              </button>
            </div>
          </form>
        </section>
      )}

      <SectionCard title="1. Payable information">
        <DetailGrid
          items={[
            { label: "Payee name", value: record.payeeName },
            { label: "Invoice number", value: record.invoiceNumber },
            { label: "Category", value: record.categoryName },
            { label: "Description", value: record.description },
            { label: "Invoice date", value: formatDate(record.invoiceDate) },
            { label: "Due date", value: formatDate(record.dueDate) },
            {
              label: "Expected payment method",
              value: record.paymentMethod ?? "—",
            },
            { label: "Reference number", value: record.referenceNumber || "—" },
          ]}
        />
      </SectionCard>

      <SectionCard title="2. Financial summary (derived)">
        <DetailGrid
          items={[
            { label: "Total amount", value: peso.format(record.totalAmount) },
            { label: "Amount paid", value: peso.format(record.amountPaid) },
            {
              label: "Remaining balance",
              value: peso.format(record.remainingBalance),
            },
            {
              label: "Payment status",
              value: <StatusBadge value={record.paymentStatus} />,
            },
            {
              label: "Latest payment method",
              value: record.displayPaymentMethod ?? "—",
            },
            {
              label: "Latest payment reference",
              value: record.displayReferenceNumber || "—",
            },
          ]}
        />
      </SectionCard>

      <section
        ref={paymentHistoryRef}
        tabIndex={-1}
        aria-label="Payment history"
        className={`panel scroll-mt-24 outline-none ${
          focus === "payment-history" ? "section-highlight bg-[#f0f8ff]" : ""
        }`}
      >
        <PanelTitle
          title="Payment history"
          subtitle="Valid payments contribute to Amount Paid. Reversals are retained for audit."
          action={<History size={16} className="text-[#1f6ea6]" />}
        />
        {payments.length === 0 ? (
          <p className="px-5 py-8 text-xs text-[#888]">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="hidden md:table-cell">Recorded by</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const isDead = Boolean(p.reversedAt) || p.isReversal;
                  return (
                    <tr key={p.id} className={isDead ? "opacity-60" : ""}>
                      <td>{formatDate(p.paymentDate)}</td>
                      <td className="font-semibold">{peso.format(p.amountPaid)}</td>
                      <td>
                        {p.paymentMethod}
                        {p.checkNumber ? (
                          <span className="mt-1 block text-[10px] text-[#888]">
                            Check {p.checkNumber}
                          </span>
                        ) : null}
                      </td>
                      <td className="overflow-hidden text-ellipsis">{p.referenceNumber}</td>
                      <td className="hidden md:table-cell">{p.recordedByName}</td>
                      <td>
                        {p.isReversal
                          ? "Reversal"
                          : p.reversedAt
                            ? "Reversed"
                            : "Valid"}
                      </td>
                      <td>
                        {!p.isReversal &&
                          !p.reversedAt &&
                          user.permissions.reversePayments &&
                          !record.archivedAt && (
                            <button
                              className="table-action text-red-700"
                              title="Reverse payment"
                              onClick={() => onReverse(p)}
                            >
                              <Undo2 size={15} />
                            </button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SectionCard title="3. Audit information">
        <DetailGrid
          items={[
            { label: "Created by", value: record.createdByName },
            { label: "Created", value: formatDateTime(record.createdAt) },
            { label: "Last updated", value: formatDateTime(record.updatedAt) },
            {
              label: "Archive status",
              value: record.archivedAt
                ? `Archived ${formatDateTime(record.archivedAt)}`
                : "Active",
            },
          ]}
        />
      </SectionCard>

      <section className="panel">
        <PanelTitle
          title="Activity history"
          subtitle="Create, edit, payment, and archive events"
        />
        {activity.length === 0 ? (
          <p className="px-5 py-8 text-xs text-[#888]">No history recorded yet.</p>
        ) : (
          <div className="divide-y divide-[#e1eef6] px-5">
            {activity.map((item) => (
              <div key={item.id} className="flex gap-3 py-4">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#1f6ea6]" />
                <div className="min-w-0 flex-1">
                  <strong className="block text-xs">{item.summary}</strong>
                  <span className="mt-1 block text-[11px] text-[#777]">
                    {item.performedByName}
                    {item.previousApprovalStatus && item.newApprovalStatus
                      ? ` · ${item.previousApprovalStatus} → ${item.newApprovalStatus}`
                      : ""}
                  </span>
                </div>
                <time className="shrink-0 text-[10px] text-[#999]">
                  {formatDateTime(item.performedAt)}
                </time>
              </div>
            ))}
          </div>
        )}
      </section>
      {printSheet}
    </div>
  );
}
