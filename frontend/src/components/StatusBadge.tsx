const good = new Set(["Active", "Paid", "Collected", "Cleared", "Deposited", "Approved", "Complete", "Administrator"]);
const attention = new Set(["Pending", "Partial", "Partially Paid", "Partially Collected", "For Deposit", "For Clearing"]);
const alert = new Set(["Overdue", "Bounced", "Returned", "Voided", "Rejected", "Incomplete"]);

export function StatusBadge({ value }: { value: string }) {
  const tone = good.has(value) ? "status-good" : attention.has(value) ? "status-partial" : alert.has(value) ? "status-alert" : "status-neutral";
  return <span className={`status ${tone}`}>{value === "Bounced" ? "Returned" : value}</span>;
}
