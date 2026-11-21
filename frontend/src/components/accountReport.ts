export type AccountReportEntry = {
  name: string;
  email: string;
  role: string;
  status: string;
  last_login_at: string | null;
};

export function accountReportRows(accounts: AccountReportEntry[]) {
  const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
  return accounts.map((account) => ({
    Name: account.name,
    Email: account.email,
    Role: account.role,
    Status: account.status,
    "Last login (Philippine time)": account.last_login_at ? date.format(new Date(account.last_login_at)) : "Never",
  }));
}

export function safeAccountCsvRows(rows: ReturnType<typeof accountReportRows>) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key, /^[\t\r\n]|^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value,
  ])));
}
