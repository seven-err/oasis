import { ATTACHMENT_ACCEPT, ATTACHMENT_FORMATS } from "@/components/attachmentFileTypes";
import {
  Archive,
  Banknote,
  History,
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrintReport } from "@/components/usePrintReport";
import { confirmLeavingUnsavedForm, useUnsavedForm } from "@/hooks/useUnsavedForm";
import { focusFirstError, updateVisibleErrors } from "@/components/formValidation";
import { checkService } from "@/modules/checks/store";
import { validateCollectionPayload, validateFollowUpPayload } from "./validation";
import { ArchiveConfirmationDialog } from "@/components/ArchiveConfirmationDialog";
import { ATTACHMENT_KINDS, PAYMENT_METHODS } from "./constants";
import { receivableService } from "./store";
import type {
  AttachmentKind,
  CollectionFormValues,
  FollowUpFormValues,
  ReceivableView,
  ReceivableCollection,
  ReceivableViewModel,
  ValidationResult,
} from "./types";
import {
  DetailGrid,
  FormInput,
  FormSelect,
  FormTextarea,
  MoneySummaryStrip,
  PanelTitle,
  SectionCard,
  StatusBadge,
} from "./ui";
import {
  formatDate,
  formatDateTime,
  methodNeedsBank,
  methodNeedsCheck,
  peso,
  todayIsoDate,
} from "./utils";

type Props = {
  record: ReceivableViewModel;
  focus?: Extract<ReceivableView, { mode: "details" }>["focus"];
  onBack: () => void;
  onEdit: () => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

const emptyCollection = (): CollectionFormValues => ({
  collectionDate: todayIsoDate(),
  amountCollected: "",
  paymentMethod: "",
  paymentReferenceNumber: "",
  bankName: "",
  checkNumber: "",
  checkId: "",
  remarks: "",
});

const emptyFollowUp = (): FollowUpFormValues => ({
  followUpDate: todayIsoDate(),
  followUpNotes: "",
  followUpResult: "",
  nextFollowUpDate: "",
});

export function ReceivableDetails({
  record,
  focus,
  onBack,
  onEdit,
  onChanged,
  notify,
}: Props) {
  const printedRecordRef = useRef<number | null>(null);
  const collectionHistoryRef = useRef<HTMLElement>(null);
  const collectionFormRef = useRef<HTMLElement>(null);
  const followUpFormRef = useRef<HTMLElement>(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);
  const { printReport, printSheet } = usePrintReport({ emphasizeSubtitle: true });
  const user = receivableService.getUser();
  const [archiving, setArchiving] = useState(false);
  const [collections, setCollections] = useState(() =>
    receivableService.collectionsFor(record.id),
  );
  const [followUps, setFollowUps] = useState(() =>
    receivableService.followUpsFor(record.id),
  );
  const [attachments, setAttachments] = useState(() =>
    receivableService.attachmentsFor(record.id),
  );
  useEffect(() => {
    setCollections(receivableService.collectionsFor(record.id));
    setFollowUps(receivableService.followUpsFor(record.id));
    setAttachments(receivableService.attachmentsFor(record.id));
  }, [record]);
  const activity = useMemo(
    () => receivableService.activityFor(record.id),
    [record, collections, followUps, attachments],
  );
  const linkableChecks = useMemo(
    () => receivableService.linkableChecks(),
    [collections],
  );

  const [showCollectionForm, setShowCollectionForm] = useState(focus === "collections");
  const [showFollowUpForm, setShowFollowUpForm] = useState(focus === "followups");
  const collectionDraft = useUnsavedForm(showCollectionForm);
  const followUpDraft = useUnsavedForm(showFollowUpForm);
  const [showAttachmentForm, setShowAttachmentForm] = useState(false);
  const [collectionValues, setCollectionValues] =
    useState<CollectionFormValues>(emptyCollection);
  const [collectionErrors, setCollectionErrors] = useState<ValidationResult["errors"]>({});
  const [followUpValues, setFollowUpValues] = useState<FollowUpFormValues>(emptyFollowUp);
  const [followUpErrors, setFollowUpErrors] = useState<ValidationResult["errors"]>({});
  const [attachmentKind, setAttachmentKind] = useState<AttachmentKind>("invoice_copy");
  const [attachmentError, setAttachmentError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const receivable = receivableService.get(record.id);
    if (!receivable) return;
    setCollectionErrors((current) => Object.values(current).some(Boolean)
      ? updateVisibleErrors(current, validateCollectionPayload(collectionValues, { receivable, collections, checkExists: (id) => checkService.list().some((check) => check.id === id && !check.archivedAt) }).errors)
      : current);
  }, [collectionValues, record, collections]);
  useEffect(() => {
    setFollowUpErrors((current) => Object.values(current).some(Boolean)
      ? updateVisibleErrors(current, validateFollowUpPayload(followUpValues).errors)
      : current);
  }, [followUpValues]);

  useEffect(() => {
    if (focus === "collections") setShowCollectionForm(true);
    if (focus === "followups") setShowFollowUpForm(true);
  }, [focus]);

  useEffect(() => {
    const target = focus === "collection-history"
      ? collectionHistoryRef
      : focus === "collections" && showCollectionForm
        ? collectionFormRef
        : focus === "followups" && showFollowUpForm
          ? followUpFormRef
          : focus === "attachments"
            ? attachmentsRef
            : null;
    if (!target) return;
    // Run after the view history hook resets the page scroll position.
    const frame = requestAnimationFrame(() => {
      target.current?.focus({ preventScroll: true });
      target.current?.scrollIntoView({ behavior: "instant", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus, record.id, showCollectionForm, showFollowUpForm]);

  const refreshRelated = () => {
    setCollections(receivableService.collectionsFor(record.id));
    setFollowUps(receivableService.followUpsFor(record.id));
    setAttachments(receivableService.attachmentsFor(record.id));
  };

  const setCol =
    (key: keyof CollectionFormValues) =>
    (value: string) => {
      setCollectionValues((prev) => ({ ...prev, [key]: value }));
    };

  const setFu =
    (key: keyof FollowUpFormValues) =>
    (value: string) => {
      setFollowUpValues((prev) => ({ ...prev, [key]: value }));
    };

  const onArchive = () => {
    if (!user.permissions.archiveReceivables) {
      notify("You are not authorized to archive receivables.");
      return;
    }
    try {
      const result = receivableService.archive(record.id);
      if (!result.ok) {
        notify(result.errors.form ?? "Unable to archive.");
        return;
      }
      setArchiving(false);
      notify("Receivable archived.");
      onChanged();
    } catch {
      notify("Unable to save the archive. Please try again.");
    }
  };

  const onRestore = () => {
    const result = receivableService.restore(record.id);
    if (!result.ok) {
      notify(result.errors.form ?? "Unable to restore.");
      return;
    }
    notify("Receivable restored.");
    onChanged();
  };

  const onRecordCollection = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const result = receivableService.recordCollection(record.id, collectionValues);
    if (!result.ok) {
      setCollectionErrors(result.errors);
      focusFirstError(e.currentTarget, result.errors);
      setSaving(false);
      return;
    }
    setSaving(false);
    collectionDraft.markSaved();
    setCollectionValues(emptyCollection());
    setShowCollectionForm(false);
    refreshRelated();
    notify("Collection recorded.");
    onChanged();
  };

  const onReverse = (collection: ReceivableCollection) => {
    if (!user.permissions.reverseCollections) {
      notify("You are not authorized to reverse collections.");
      return;
    }
    if (
      !window.confirm(
        `Reverse collection ${peso.format(collection.amountCollected)}? The original record will be retained for audit.`,
      )
    ) {
      return;
    }
    const remarks = window.prompt("Optional reversal remarks:", "") ?? undefined;
    const result = receivableService.reverseCollection(collection.id, remarks || undefined);
    if (!result.ok) {
      notify(result.errors.form ?? "Unable to reverse collection.");
      return;
    }
    refreshRelated();
    notify("Collection reversed.");
    onChanged();
  };

  const onRecordFollowUp = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const result = receivableService.recordFollowUp(record.id, followUpValues);
    if (!result.ok) {
      setFollowUpErrors(result.errors);
      focusFirstError(e.currentTarget, result.errors);
      setSaving(false);
      return;
    }
    setSaving(false);
    followUpDraft.markSaved();
    setFollowUpValues(emptyFollowUp());
    setShowFollowUpForm(false);
    refreshRelated();
    notify("Follow-up recorded.");
    onChanged();
  };

  const onUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAttachmentError("");
    setSaving(true);
    const result = await receivableService.uploadAttachment(record.id, file, attachmentKind);
    setSaving(false);
    if (!result.ok) {
      setAttachmentError(result.errors.file ?? result.errors.form ?? "Upload failed.");
      input.focus();
      return;
    }
    refreshRelated();
    notify("Attachment uploaded.");
    onChanged();
  };

  const onDeleteAttachment = (id: string, fileName: string) => {
    if (!window.confirm(`Delete attachment ${fileName}?`)) return;
    const result = receivableService.deleteAttachment(id);
    if (!result.ok) {
      notify(result.errors.form ?? "Unable to delete attachment.");
      return;
    }
    refreshRelated();
    notify("Attachment deleted.");
    onChanged();
  };

  const isCancelled = record.collectionStatus === "Cancelled";
  const canRecordCollection =
    user.permissions.recordCollections &&
    !record.archivedAt &&
    !isCancelled &&
    record.remainingBalance > 0;

  const canFollowUp = user.permissions.manageFollowUps && !record.archivedAt;
  const canAttach = user.permissions.manageAttachments && !record.archivedAt;

  const printRecord = () => {
    const details = {
      "Customer name": record.customerName,
      "Client ID": record.clientId,
      "Contact number": record.contactNumber,
      "Email address": record.emailAddress,
      "Billing address": record.billingAddress,
      "Invoice number": record.invoiceNumber,
      "Reference number": record.referenceNumber,
      "Transaction date": formatDate(record.transactionDate),
      "Invoice date": formatDate(record.invoiceDate),
      "Due date": formatDate(record.dueDate),
      Description: record.description,
      Remarks: record.remarks,
      "Total receivable amount": peso.format(record.totalReceivableAmount),
      "Amount paid": peso.format(record.amountPaid),
      "Remaining balance": peso.format(record.remainingBalance),
      "Expected payment method": record.paymentMethod,
      "Latest payment method": record.displayPaymentMethod,
      "Latest payment reference": record.displayPaymentReference,
      "Bank name": record.displayBankName,
      "Check number": record.displayCheckNumber,
      "Collection status": record.collectionStatus,
      "Days overdue": record.daysOverdue,
      "Collection follow-up date": record.collectionFollowUpDate ? formatDate(record.collectionFollowUpDate) : null,
      "Prepared by": record.preparedByName,
      Created: formatDateTime(record.createdAt),
      "Last updated": formatDateTime(record.updatedAt),
      ...(record.cancellationReason ? { "Reason for cancellation": record.cancellationReason } : {}),
      "Archive status": record.archivedAt ? `Archived ${formatDateTime(record.archivedAt)}` : "Active",
    };
    const rows: Record<string, unknown>[] = Object.entries(details).map(([Field, Value]) => ({ Field, Value }));
    rows.push(...(collections.length ? collections.map((c) => ({
      Field: `Collection · ${formatDate(c.collectionDate)}`,
      Value: `${peso.format(c.amountCollected)} · ${c.paymentMethod} · Reference: ${c.paymentReferenceNumber || "—"} · Bank: ${c.bankName || "—"} · Check: ${c.checkNumber || "—"} · Recorded by: ${c.recordedByName} · ${c.isReversal ? "Reversal" : c.reversedAt ? "Reversed" : "Valid"}`,
    })) : [{ Field: "Collection history", Value: "No collections recorded yet." }]));
    rows.push(...(followUps.length ? followUps.map((f) => ({
      Field: `Follow-up · ${formatDate(f.followUpDate)}`,
      Value: `${f.followUpNotes} · Result: ${f.followUpResult || "—"} · Next: ${f.nextFollowUpDate ? formatDate(f.nextFollowUpDate) : "—"} · ${f.followedUpByName} · ${formatDateTime(f.createdAt)}`,
    })) : [{ Field: "Follow-up history", Value: "No follow-ups recorded yet." }]));
    rows.push(...(attachments.length ? attachments.map((a) => ({
      Field: `Attachment · ${a.fileName}`,
      Value: `${ATTACHMENT_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind} · ${(a.sizeBytes / 1024).toFixed(1)} KB · ${a.uploadedByName} · ${formatDateTime(a.uploadedAt)}`,
    })) : [{ Field: "Attachments", Value: "No attachments uploaded yet." }]));
    rows.push(...(activity.length ? activity.map((item) => ({
      Field: `Activity · ${formatDateTime(item.performedAt)}`,
      Value: `${item.summary} · ${item.performedByName}`,
    })) : [{ Field: "Activity history", Value: "No history recorded yet." }]));
    void printReport("Receivable record", rows, 1, record.customerName);
  };

  useEffect(() => {
    if (focus !== "print" || printedRecordRef.current === record.id) return;
    // Leave the render/effect commit before the shared printer flushes its sheet.
    const frame = requestAnimationFrame(() => {
      printedRecordRef.current = record.id;
      printRecord();
    });
    return () => {
      cancelAnimationFrame(frame);
      printedRecordRef.current = null;
    };
  }, [focus, record.id]);

  return (
    <div className="space-y-5">
      {archiving && (
        <ArchiveConfirmationDialog
          recordLabel={`${record.invoiceNumber} — ${record.customerName}`}
          onCancel={() => setArchiving(false)}
          onConfirm={onArchive}
        />
      )}
      <section className="panel">
        <PanelTitle
          onBack={onBack}
          title={record.invoiceNumber}
          subtitle={`${record.customerName} · ${record.clientId}`}
          action={
            <div className="flex flex-wrap gap-2">
              {user.permissions.editReceivables && !record.archivedAt && !isCancelled && (
                <button onClick={() => { if (confirmLeavingUnsavedForm()) onEdit(); }} className="primary-btn">
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
                <StatusBadge value={record.collectionStatus} />
                {record.daysOverdue > 0 && (
                  <span className="status status-alert">{record.daysOverdue} days overdue</span>
                )}
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
              user.permissions.archiveReceivables && (
                <button onClick={() => setArchiving(true)} className="secondary-btn text-red-700">
                  <Archive size={15} /> Archive
                </button>
              )
            )}
          </div>
        </div>
        <div className="p-5">
          <MoneySummaryStrip
            total={peso.format(record.totalReceivableAmount)}
            paid={peso.format(record.amountPaid)}
            remaining={peso.format(record.remainingBalance)}
          />
        </div>
      </section>

      {showCollectionForm && canRecordCollection && (
        <section
          ref={collectionFormRef}
          tabIndex={-1}
          aria-label="Record collection"
          className={`panel scroll-mt-24 outline-none ${
            focus === "collections" ? "section-highlight bg-[#f0f8ff]" : ""
          }`}
        >
          <PanelTitle
            title="Record collection"
            subtitle={`Remaining balance ${peso.format(record.remainingBalance)}. Overcollections are not allowed.`}
          />
          <form onSubmit={onRecordCollection} onChangeCapture={collectionDraft.markDirty} className="space-y-4 p-5" noValidate>
            {collectionErrors.form && (
              <div role="alert" tabIndex={-1} className="border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                {collectionErrors.form}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormInput
                label="Collection date"
                name="collectionDate"
                type="date"
                required
                value={collectionValues.collectionDate}
                onChange={setCol("collectionDate")}
                error={collectionErrors.collectionDate}
              />
              <FormInput
                label="Amount collected"
                name="amountCollected"
                type="number"
                required
                value={collectionValues.amountCollected}
                onChange={setCol("amountCollected")}
                error={collectionErrors.amountCollected}
                max={record.remainingBalance}
              />
              <FormSelect
                label="Payment method"
                name="paymentMethod"
                required
                value={collectionValues.paymentMethod}
                onChange={setCol("paymentMethod")}
                error={collectionErrors.paymentMethod}
              >
                <option value="">Select method</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </FormSelect>
              <FormInput
                label="Payment reference number"
                name="paymentReferenceNumber"
                required
                value={collectionValues.paymentReferenceNumber}
                onChange={setCol("paymentReferenceNumber")}
                error={collectionErrors.paymentReferenceNumber}
              />
              {methodNeedsBank(collectionValues.paymentMethod) && (
                <FormInput
                  label="Bank name"
                  name="bankName"
                  required
                  value={collectionValues.bankName}
                  onChange={setCol("bankName")}
                  error={collectionErrors.bankName}
                />
              )}
              {methodNeedsCheck(collectionValues.paymentMethod) && (
                <>
                  <FormInput
                    label="Check number"
                    name="checkNumber"
                    value={collectionValues.checkNumber}
                    onChange={setCol("checkNumber")}
                    error={collectionErrors.checkNumber}
                    placeholder="Optional if linking a check"
                  />
                  <FormSelect
                    label="Linked Check Monitoring record"
                    name="checkId"
                    value={collectionValues.checkId}
                    onChange={setCol("checkId")}
                    error={collectionErrors.checkId}
                  >
                    <option value="">No linked check</option>
                    {linkableChecks.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.checkNumber} · {c.drawerName} · {c.bankName} ·{" "}
                        {peso.format(c.checkAmount)}
                      </option>
                    ))}
                  </FormSelect>
                  <p className="sm:col-span-2 lg:col-span-3 text-[11px] text-[#777]">
                    Check collections do not auto-create Check Monitoring records. Link an
                    existing received check or register a new check in Check Monitoring.
                  </p>
                </>
              )}
              <div className="sm:col-span-2 lg:col-span-3">
                <FormTextarea
                  label="Remarks"
                  name="remarks"
                  value={collectionValues.remarks}
                  onChange={setCol("remarks")}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e1eef6] pt-4">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => { if (collectionDraft.confirmDiscard()) { setCollectionValues(emptyCollection()); setCollectionErrors({}); setShowCollectionForm(false); } }}
              >
                Cancel
              </button>
              <button className="primary-btn" disabled={saving}>
                {saving ? "Saving…" : "Save collection"}
              </button>
            </div>
          </form>
        </section>
      )}

      {showFollowUpForm && canFollowUp && (
        <section
          ref={followUpFormRef}
          tabIndex={-1}
          aria-label="Schedule follow-up"
          className={`panel scroll-mt-24 outline-none ${
            focus === "followups" ? "section-highlight bg-[#f0f8ff]" : ""
          }`}
        >
          <PanelTitle
            title="Record collection follow-up"
            subtitle="Previous follow-up notes are preserved as history."
          />
          <form onSubmit={onRecordFollowUp} onChangeCapture={followUpDraft.markDirty} className="space-y-4 p-5" noValidate>
            {followUpErrors.form && (
              <div role="alert" tabIndex={-1} className="border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                {followUpErrors.form}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput
                label="Follow-up date"
                name="followUpDate"
                type="date"
                required
                value={followUpValues.followUpDate}
                onChange={setFu("followUpDate")}
                error={followUpErrors.followUpDate}
              />
              <FormInput
                label="Next follow-up date"
                name="nextFollowUpDate"
                type="date"
                value={followUpValues.nextFollowUpDate}
                onChange={setFu("nextFollowUpDate")}
                error={followUpErrors.nextFollowUpDate}
              />
              <div className="sm:col-span-2">
                <FormTextarea
                  label="Follow-up notes"
                  name="followUpNotes"
                  required
                  value={followUpValues.followUpNotes}
                  onChange={setFu("followUpNotes")}
                  error={followUpErrors.followUpNotes}
                />
              </div>
              <div className="sm:col-span-2">
                <FormInput
                  label="Follow-up result"
                  name="followUpResult"
                  value={followUpValues.followUpResult}
                  onChange={setFu("followUpResult")}
                  error={followUpErrors.followUpResult}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e1eef6] pt-4">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => { if (followUpDraft.confirmDiscard()) { setFollowUpValues(emptyFollowUp()); setFollowUpErrors({}); setShowFollowUpForm(false); } }}
              >
                Cancel
              </button>
              <button className="primary-btn" disabled={saving}>
                {saving ? "Saving…" : "Save follow-up"}
              </button>
            </div>
          </form>
        </section>
      )}



      <SectionCard title="1. Customer information">
        <DetailGrid
          items={[
            { label: "Customer name", value: record.customerName },
            { label: "Client ID", value: record.clientId },
            { label: "Contact number", value: record.contactNumber },
            { label: "Email address", value: record.emailAddress },
            { label: "Billing address", value: record.billingAddress },
          ]}
        />
      </SectionCard>

      <SectionCard title="2. Invoice and transaction information">
        <DetailGrid
          items={[
            { label: "Invoice number", value: record.invoiceNumber },
            { label: "Reference number", value: record.referenceNumber },
            { label: "Transaction date", value: formatDate(record.transactionDate) },
            { label: "Invoice date", value: formatDate(record.invoiceDate) },
            { label: "Due date", value: formatDate(record.dueDate) },
            { label: "Description", value: record.description },
            { label: "Remarks", value: record.remarks ?? "—" },
          ]}
        />
      </SectionCard>

      <SectionCard title="3. Receivable amount and balance (derived)">
        <DetailGrid
          items={[
            {
              label: "Total receivable amount",
              value: peso.format(record.totalReceivableAmount),
            },
            { label: "Amount paid", value: peso.format(record.amountPaid) },
            {
              label: "Remaining balance",
              value: peso.format(record.remainingBalance),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="4. Collection information">
        <DetailGrid
          items={[
            {
              label: "Expected payment method",
              value: record.paymentMethod ?? "—",
            },
            {
              label: "Latest payment method",
              value: record.displayPaymentMethod ?? "—",
            },
            {
              label: "Latest payment reference",
              value: record.displayPaymentReference || "—",
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="5. Payment references and bank information">
        <DetailGrid
          items={[
            { label: "Bank name", value: record.displayBankName ?? "—" },
            { label: "Check number", value: record.displayCheckNumber ?? "—" },
          ]}
        />
      </SectionCard>

      <SectionCard title="6. Collection status and overdue information">
        <DetailGrid
          items={[
            {
              label: "Collection status",
              value: <StatusBadge value={record.collectionStatus} />,
            },
            { label: "Days overdue", value: String(record.daysOverdue) },
            {
              label: "Collection follow-up date",
              value: formatDate(record.collectionFollowUpDate),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="7. Collection follow-up history">
        <p className="mb-4 text-[11px] text-[#888]">
          Follow-up notes are append-only and never overwritten.
        </p>
        {followUps.length === 0 ? (
          <p className="bg-white p-4 text-xs text-[#888]">No follow-ups recorded yet.</p>
        ) : (
          <div className="divide-y divide-[#e1eef6] bg-white px-4">
            {followUps.map((f) => (
              <div key={f.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong className="text-xs">{formatDate(f.followUpDate)}</strong>
                  <span className="text-[10px] text-[#999]">
                    {f.followedUpByName} · {formatDateTime(f.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#444]">{f.followUpNotes}</p>
                {f.followUpResult && (
                  <p className="mt-2 text-[11px] text-[#1f6ea6]">
                    Result: {f.followUpResult}
                  </p>
                )}
                {f.nextFollowUpDate && (
                  <p className="mt-1 text-[11px] text-[#777]">
                    Next follow-up: {formatDate(f.nextFollowUpDate)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div
        ref={attachmentsRef}
        tabIndex={-1}
        aria-label="Attachments"
        className={`scroll-mt-24 outline-none ${
          focus === "attachments"
            ? "section-highlight"
            : ""
        }`}
      >
        <SectionCard
          title="8. Attachments"
          action={canAttach ? (
            <button
              type="button"
              className="primary-btn"
              aria-expanded={showAttachmentForm}
              aria-controls="receivable-attachment-upload"
              onClick={() => setShowAttachmentForm((open) => !open)}
            >
              <Upload size={15} /> Upload attachment
            </button>
          ) : undefined}
        >
          {showAttachmentForm && canAttach && (
            <div id="receivable-attachment-upload" className="mb-5 border-b border-[#d0e3ef] pb-5">
              <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">
                Upload attachment
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormSelect
                  label="Document type"
                  name="attachmentKind"
                  value={attachmentKind}
                  onChange={(v) => setAttachmentKind(v as AttachmentKind)}
                >
                  {ATTACHMENT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </FormSelect>
                <label className="block">
                  <span className="field-label">File (PDF / image, max 5 MB)</span>
                  <input
                    type="file"
                    aria-invalid={attachmentError ? true : undefined}
                    aria-describedby={attachmentError ? "receivable-attachment-error" : undefined}
                    accept={ATTACHMENT_ACCEPT}
                    className="input mt-2"
                    onChange={onUploadAttachment}
                    disabled={saving}
                  />
                  {attachmentError && (
                    <p id="receivable-attachment-error" className="mt-1.5 text-[11px] text-red-700">{attachmentError}</p>
                  )}
                </label>
              </div>
              <p className="mt-3 text-[11px] text-[#777]">
                {ATTACHMENT_FORMATS} · Max 5 MB each. Attachments are stored privately and are only available to authorized users.
              </p>
            </div>
          )}
          <p className="mb-4 text-[11px] text-[#888]">
            Authorized preview and download only — no public URLs
          </p>
          {attachments.length === 0 ? (
            <p className="bg-white p-4 text-xs text-[#888]">No attachments uploaded yet.</p>
          ) : (
            <div className="divide-y divide-[#e1eef6] bg-white">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <strong className="block truncate text-xs">{a.fileName}</strong>
                    <span className="mt-1 block text-[10px] text-[#888]">
                      {ATTACHMENT_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind} ·{" "}
                      {(a.sizeBytes / 1024).toFixed(1)} KB · {a.uploadedByName} ·{" "}
                      {formatDateTime(a.uploadedAt)}
                    </span>
                    <span className="mt-1 block truncate text-[10px] text-[#aaa]">
                      {a.storageKey}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {a.previewDataUrl && (
                      <a
                        href={a.previewDataUrl}
                        download={a.fileName}
                        className="secondary-btn"
                      >
                        <Upload size={14} className="rotate-180" /> Download
                      </a>
                    )}
                    {user.permissions.manageAttachments && !record.archivedAt && (
                      <button
                        className="table-action text-red-700"
                        onClick={() => onDeleteAttachment(a.id, a.fileName)}
                        title="Delete attachment"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <section
        ref={collectionHistoryRef}
        tabIndex={-1}
        aria-label="Collection history"
        className={`panel scroll-mt-24 outline-none ${
          focus === "collection-history" ? "section-highlight bg-[#f0f8ff]" : ""
        }`}
      >
        <PanelTitle
          title="Collection history"
          subtitle="Valid collections contribute to Amount Paid. Reversals are retained for audit."
          action={<History size={16} className="text-[#1f6ea6]" />}
        />
        {collections.length === 0 ? (
          <p className="px-5 py-8 text-xs text-[#888]">No collections recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="hidden md:table-cell">Bank / Check</th>
                  <th className="hidden lg:table-cell">Recorded by</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {collections.map((c) => {
                  const isDead = Boolean(c.reversedAt) || c.isReversal;
                  return (
                    <tr key={c.id} className={isDead ? "opacity-60" : ""}>
                      <td>{formatDate(c.collectionDate)}</td>
                      <td className="font-semibold">{peso.format(c.amountCollected)}</td>
                      <td>{c.paymentMethod}</td>
                      <td className="overflow-hidden text-ellipsis">
                        {c.paymentReferenceNumber}
                      </td>
                      <td className="hidden md:table-cell">
                        {c.bankName || c.checkNumber
                          ? [c.bankName, c.checkNumber].filter(Boolean).join(" · ")
                          : "—"}
                      </td>
                      <td className="hidden lg:table-cell">{c.recordedByName}</td>
                      <td>
                        {c.isReversal
                          ? "Reversal"
                          : c.reversedAt
                            ? "Reversed"
                            : "Valid"}
                      </td>
                      <td>
                        {!c.isReversal &&
                          !c.reversedAt &&
                          user.permissions.reverseCollections &&
                          !isCancelled &&
                          !record.archivedAt && (
                            <button
                              className="table-action text-red-700"
                              title="Reverse collection"
                              onClick={() => onReverse(c)}
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

      <SectionCard title="9. Preparation and audit information">
        <DetailGrid
          items={[
            { label: "Prepared by", value: record.preparedByName },
            { label: "Created", value: formatDateTime(record.createdAt) },
            { label: "Last updated", value: formatDateTime(record.updatedAt) },
            ...(record.cancellationReason
              ? [{ label: "Reason for Cancellation", value: record.cancellationReason }]
              : []),
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
          subtitle="Create, edit, collection, follow-up, attachment, and archive events"
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
