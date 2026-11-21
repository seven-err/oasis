import { checkStatusLabel } from "./utils";
import { ATTACHMENT_ACCEPT, ATTACHMENT_FORMATS } from "@/components/attachmentFileTypes";
import { ArchiveConfirmationDialog } from "@/components/ArchiveConfirmationDialog";
import {
  Archive,
  Download,
  FileText,
  History,
  Paperclip,
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePrintReport } from "@/components/usePrintReport";
import { checkService } from "./store";
import type { CheckAttachment, CheckRecord } from "./types";
import {
  AccountNumberDisplay,
  DetailGrid,
  PanelTitle,
  SectionCard,
  StatusBadge,
} from "./ui";
import { formatBytes, formatDate, formatDateTime, maskAccountNumber, peso } from "./utils";

type Props = {
  record: CheckRecord;
  onBack: () => void;
  onEdit: () => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

export function CheckDetails({ record, onBack, onEdit, onChanged, notify }: Props) {
  const { printReport, printSheet } = usePrintReport();
  const user = checkService.getUser();
  const [archiving, setArchiving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [attachments, setAttachments] = useState(() => checkService.attachmentsFor(record.id));
  useEffect(() => setAttachments(checkService.attachmentsFor(record.id)), [record]);
  const activity = useMemo(() => checkService.activityFor(record.id), [record]);

  const refreshAttachments = () => setAttachments(checkService.attachmentsFor(record.id));

  const onRevealToggle = () => {
    if (!user.permissions.viewAccountNumber) return;
    if (!revealed) checkService.logAccountReveal(record.id);
    setRevealed((x) => !x);
  };

  const onArchive = () => {
    if (!user.permissions.archiveChecks) {
      notify("You are not authorized to archive checks.");
      return;
    }
    try {
      const result = checkService.archive(record.id);
      if (!result.ok) {
        notify(result.errors.form ?? "Unable to archive.");
        return;
      }
      setArchiving(false);
      notify("Check archived.");
      onChanged();
    } catch {
      notify("Unable to save the archive. Please try again.");
    }
  };

  const onRestore = () => {
    const result = checkService.restore(record.id);
    if (!result.ok) {
      notify(result.errors.form ?? "Unable to restore.");
      return;
    }
    notify("Check restored.");
    onChanged();
  };

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      let result;
      try { result = await checkService.addAttachment(record.id, file); }
      catch { notify("Attachment could not be uploaded. Please try again."); return; }
      if (!result.ok) {
        notify(result.errors.attachments ?? "Upload failed.");
        return;
      }
    }
    refreshAttachments();
    notify("Attachment uploaded.");
    onChanged();
  };

  const onDeleteAttachment = (attachment: CheckAttachment) => {
    if (!window.confirm(`Remove attachment "${attachment.fileName}"?`)) return;
    const result = checkService.removeAttachment(attachment.id);
    if (!result.ok) {
      notify(result.errors.attachments ?? "Unable to remove attachment.");
      return;
    }
    refreshAttachments();
    notify("Attachment removed.");
    onChanged();
  };

  const previewOrDownload = (attachment: CheckAttachment) => {
    if (!attachment.previewDataUrl) {
      notify("Preview unavailable for this stored attachment. Re-upload to enable local preview.");
      return;
    }
    const link = document.createElement("a");
    link.href = attachment.previewDataUrl;
    link.download = attachment.fileName;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
  };

  const printRecord = () => {
    const details = {
      "Check number": record.checkNumber,
      "Check type": record.checkType,
      "Check date": formatDate(record.checkDate),
      "Date received / issued": formatDate(record.dateReceivedIssued),
      Purpose: record.purpose,
      "Reference number": record.referenceNumber,
      "Payee name": record.payeeName,
      "Drawer name": record.drawerName,
      "Bank name": record.bankName,
      Branch: record.branch,
      "Account number": user.permissions.viewAccountNumber && revealed
        ? record.accountNumber : maskAccountNumber(record.accountNumber),
      "Check amount": peso.format(record.checkAmount),
      "Due date": formatDate(record.dueDate),
      "Deposit date": formatDate(record.depositDate),
      "Clearing date": formatDate(record.clearingDate),
      "Check status": checkStatusLabel(record.checkStatus),
      "Prepared by": record.preparedByName,
      Created: formatDateTime(record.createdAt),
      "Last updated": formatDateTime(record.updatedAt),
      "Archive status": record.archivedAt ? `Archived ${formatDateTime(record.archivedAt)}` : "Active",
    };
    const rows: Record<string, unknown>[] = Object.entries(details).map(([Field, Value]) => ({ Field, Value }));
    rows.push(...(attachments.length ? attachments.map((a) => ({
      Field: `Attachment · ${a.fileName}`,
      Value: `${formatBytes(a.sizeBytes)} · ${formatDateTime(a.uploadedAt)} · ${a.uploadedByName}`,
    })) : [{ Field: "Attachments", Value: "No attachments on file." }]));
    rows.push(...(activity.length ? activity.map((item) => ({
      Field: `Activity · ${formatDateTime(item.performedAt)}`,
      Value: `${item.summary} · ${item.performedByName}${item.previousStatus && item.newStatus ? ` · ${item.previousStatus} → ${item.newStatus}` : ""}`,
    })) : [{ Field: "Check history", Value: "No history recorded yet." }]));
    void printReport("Check record", rows, 1, record.payeeName);
  };

  return (
    <div className="space-y-5">
      {archiving && (
        <ArchiveConfirmationDialog
          recordLabel={`Check ${record.checkNumber} - ${record.payeeName}`}
          onCancel={() => setArchiving(false)}
          onConfirm={onArchive}
        />
      )}
      <section className="panel">
        <PanelTitle
          onBack={onBack}
          title={record.checkNumber}
          subtitle={`${record.checkType} · ${record.payeeName}`}
          action={
            <div className="flex flex-wrap gap-2">
              {user.permissions.editChecks && !record.archivedAt && (
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
              <FileText size={20} className="text-white" />
            </span>
            <div>
              <StatusBadge value={record.checkStatus} />
              <strong className="mt-2 block text-lg tracking-[-.02em]">
                {peso.format(record.checkAmount)}
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
              user.permissions.archiveChecks && (
                <button onClick={() => setArchiving(true)} className="secondary-btn text-red-700">
                  <Archive size={15} /> Archive
                </button>
              )
            )}
          </div>
        </div>
      </section>

      <SectionCard title="1. Check information">
        <DetailGrid
          items={[
            { label: "Check number", value: record.checkNumber },
            { label: "Check type", value: record.checkType },
            { label: "Check date", value: formatDate(record.checkDate) },
            {
              label: "Date received / issued",
              value: formatDate(record.dateReceivedIssued),
            },
            { label: "Purpose", value: record.purpose },
            { label: "Reference number", value: record.referenceNumber },
          ]}
        />
      </SectionCard>

      <SectionCard title="2. Parties and bank information">
        <DetailGrid
          items={[
            { label: "Payee name", value: record.payeeName },
            { label: "Drawer name", value: record.drawerName },
            { label: "Bank name", value: record.bankName },
            { label: "Branch", value: record.branch },
            {
              label: "Account number",
              value: (
                <AccountNumberDisplay
                  accountNumber={record.accountNumber}
                  canReveal={user.permissions.viewAccountNumber}
                  revealed={revealed}
                  onToggle={onRevealToggle}
                />
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="3. Financial information">
        <DetailGrid
          items={[
            { label: "Check amount", value: peso.format(record.checkAmount) },
            { label: "Purpose", value: record.purpose },
            { label: "Reference number", value: record.referenceNumber },
          ]}
        />
      </SectionCard>

      <SectionCard title="4. Status">
        <DetailGrid
          items={[
            { label: "Check status", value: <StatusBadge value={record.checkStatus} /> },
          ]}
        />
      </SectionCard>

      <SectionCard title="5. Attachments">
        {user.permissions.manageAttachments && (
          <label className="mb-4 block">
            <span className="secondary-btn inline-flex cursor-pointer">
              <Paperclip size={15} /> Upload attachment
            </span>
            <input
              type="file"
              className="sr-only"
              accept={ATTACHMENT_ACCEPT}
              multiple
              onChange={(e) => {
                void onUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <p className="mb-3 text-xs text-[#777]">{ATTACHMENT_FORMATS} · Max 5 MB each</p>
        {attachments.length === 0 ? (
          <p className="text-xs text-[#888]">No attachments on file.</p>
        ) : (
          <ul className="divide-y divide-[#e1eef6] border border-[#d0e3ef]">
            {attachments.map((att) => (
              <li key={att.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <span className="grid size-10 place-items-center bg-[#e7f3fb] text-[#1f6ea6] rounded-lg">
                  <Paperclip size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-xs">{att.fileName}</strong>
                  <span className="mt-1 block text-[10px] text-[#888]">
                    {formatBytes(att.sizeBytes)} · Uploaded {formatDateTime(att.uploadedAt)} by{" "}
                    {att.uploadedByName}
                  </span>
                  <span className="mt-1 block text-[10px] text-[#999]">
                    Private storage key · not publicly accessible
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    className="secondary-btn"
                    onClick={() => previewOrDownload(att)}
                    title="Preview / download"
                  >
                    <Download size={14} />
                  </button>
                  {user.permissions.manageAttachments && (
                    <button
                      className="table-action text-red-700"
                      onClick={() => onDeleteAttachment(att)}
                      aria-label={`Delete ${att.fileName}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="6. Preparation and audit information">
        <DetailGrid
          items={[
            { label: "Prepared by", value: record.preparedByName },
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
          title="Check history"
          subtitle="Status changes, updates, and attachment activity (account numbers excluded)"
          action={<History size={16} className="text-[#1f6ea6]" />}
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
                    {item.previousStatus && item.newStatus
                      ? ` · ${item.previousStatus} → ${item.newStatus}`
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
