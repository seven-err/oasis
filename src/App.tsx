import { useState } from "react";
import {
  Activity,
  AlertCircle,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Download,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Printer,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserMinus,
  Users,
  UserRound,
  UserCheck,
  WalletCards,
  X,
} from "lucide-react";
import { SummaryStatCards } from "@/components/SummaryStatCards";
import {
  CheckMonitoring,
  getCheckRecords,
  type CheckRecord,
} from "@/modules/checks";
import {
  PayableMonitoring,
  getPayableRecords,
  summarizePayables,
  type PayableViewModel,
} from "@/modules/payables";
import {
  ReceivableMonitoring,
  getReceivableRecords,
  summarizeReceivables,
  type ReceivableViewModel,
} from "@/modules/receivables";

type Page =
  | "dashboard"
  | "checks"
  | "payables"
  | "receivables"
  | "employees"
  | "reports"
  | "users"
  | "activity"
  | "profile";

type Employee = {
  id: number;
  number: string;
  name: string;
  initials: string;
  department: string;
  position: string;
  dateHired: string;
  email: string;
  status: "Active" | "On Leave" | "Inactive";
};

const initialEmployees: Employee[] = [
  {
    id: 1,
    number: "EMP-00142",
    name: "Alvarina, Miguel",
    initials: "MA",
    department: "Finance",
    position: "Finance Administrator",
    dateHired: "2019-06-17",
    email: "m.alvarina@oasis.org",
    status: "Active",
  },
  {
    id: 2,
    number: "EMP-00118",
    name: "Bautista, Leon Miguel",
    initials: "LB",
    department: "Operations",
    position: "Operations Supervisor",
    dateHired: "2018-01-22",
    email: "l.bautista@oasis.org",
    status: "Active",
  },
  {
    id: 3,
    number: "EMP-00167",
    name: "Cruz, Angela Marie",
    initials: "AC",
    department: "Human Resources",
    position: "HR Specialist",
    dateHired: "2021-09-06",
    email: "a.cruz@oasis.org",
    status: "On Leave",
  },
  {
    id: 4,
    number: "EMP-00094",
    name: "Dela Rosa, Nathaniel",
    initials: "ND",
    department: "Administration",
    position: "Administrative Officer",
    dateHired: "2016-11-14",
    email: "n.delarosa@oasis.org",
    status: "Active",
  },
  {
    id: 5,
    number: "EMP-00153",
    name: "Evangelista, Sofia",
    initials: "SE",
    department: "Information Technology",
    position: "Systems Analyst",
    dateHired: "2020-07-13",
    email: "s.evangelista@oasis.org",
    status: "Active",
  },
];

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${value}T00:00:00`),
  );

const pageMeta: Record<Page, { eyebrow: string; title: string; description: string }> = {
  dashboard: {
    eyebrow: "Overview",
    title: "Good morning, Miguel",
    description: "Here is what needs your attention today.",
  },
  checks: {
    eyebrow: "Financial Operations",
    title: "Check Monitoring",
    description:
      "Record, organize, track, and monitor checks received and issued by OASIS Company.",
  },
  payables: {
    eyebrow: "Financial Operations",
    title: "Payable Monitoring",
    description:
      "Record, monitor, approve, and track company expenses and outstanding obligations.",
  },
  receivables: {
    eyebrow: "Financial Operations",
    title: "Receivable Monitoring",
    description:
      "Record, monitor, manage, and collect payments owed to OASIS by customers.",
  },
  employees: {
    eyebrow: "Human Resources",
    title: "Employee Alphalist",
    description: "Maintain the official alphabetical employee directory.",
  },
  reports: {
    eyebrow: "Insights",
    title: "Reports & Exports",
    description: "Generate authorized, print-ready operational reports.",
  },
  users: {
    eyebrow: "Administration",
    title: "User Management",
    description: "Manage application roles and module access.",
  },
  activity: {
    eyebrow: "Security",
    title: "Activity Logs",
    description: "Review important actions across the organization.",
  },
  profile: {
    eyebrow: "Account",
    title: "My Profile",
    description: "Manage your personal information and security preferences.",
  },
};

const nav = [
  {
    section: "Workspace",
    items: [
      { page: "dashboard" as Page, label: "Dashboard", icon: LayoutDashboard },
      { page: "checks" as Page, label: "Check Monitoring", icon: FileCheck2 },
      { page: "payables" as Page, label: "Payable Monitoring", icon: WalletCards },
      { page: "receivables" as Page, label: "Receivable Monitoring", icon: CircleDollarSign },
      { page: "employees" as Page, label: "HR · Alpha List", icon: Users },
    ],
  },
  {
    section: "Management",
    items: [
      { page: "reports" as Page, label: "Reports", icon: FileText },
      { page: "users" as Page, label: "User Management", icon: ShieldCheck },
      { page: "activity" as Page, label: "Activity Logs", icon: Activity },
    ],
  },
];

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [checks, setChecks] = useState<CheckRecord[]>(() => getCheckRecords());
  const [payables, setPayables] = useState<PayableViewModel[]>(() => getPayableRecords());
  const [receivables, setReceivables] = useState<ReceivableViewModel[]>(() =>
    getReceivableRecords(),
  );
  const [employees, setEmployees] = useState(initialEmployees);
  const [checkCreateSignal, setCheckCreateSignal] = useState(0);
  const [payableCreateSignal, setPayableCreateSignal] = useState(0);
  const [receivableCreateSignal, setReceivableCreateSignal] = useState(0);
  const [modal, setModal] = useState<{
    type: "add" | "view" | "transaction";
    module: Page;
    id?: number;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  const go = (next: Page) => {
    setPage(next);
    setSidebarOpen(false);
    setProfileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const archiveRecord = (module: Page, id: number) => {
    if (!window.confirm("Archive this record? Its history will remain available.")) return;
    if (module === "employees")
      setEmployees((list) => list.map((x) => (x.id === id ? { ...x, status: "Inactive" } : x)));
    notify("Record archived successfully.");
    setModal(null);
  };

  const requestAdd = () => {
    if (page === "checks") {
      setCheckCreateSignal((n) => n + 1);
      return;
    }
    if (page === "payables") {
      setPayableCreateSignal((n) => n + 1);
      return;
    }
    if (page === "receivables") {
      setReceivableCreateSignal((n) => n + 1);
      return;
    }
    setModal({ type: "add", module: page });
  };

  return (
    <div className="min-h-screen bg-[#f3f8fc] text-[#111]">
      {sidebarOpen && (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[#c5dced] bg-[#d7eef9] text-[#16344d] transition-all duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} ${sidebarCompact ? "lg:w-[84px]" : "lg:w-[264px]"} w-[276px] lg:translate-x-0`}
      >
        <div className="flex h-[76px] items-center border-b border-[#c5dced] px-5">
          <button
            onClick={() => go("dashboard")}
            className="flex min-w-0 items-center gap-3 text-left"
          >
            <span className="grid size-9 shrink-0 place-items-center bg-[#1f6ea6] text-white">
              <Building2 size={19} strokeWidth={2} />
            </span>
            {!sidebarCompact && (
              <span className="min-w-0">
                <strong className="block truncate text-[13px] tracking-[.14em]">OASIS</strong>
                <span className="block text-[10px] tracking-[.12em] text-[#5c7890]">
                  OFFICE SYSTEM
                </span>
              </span>
            )}
          </button>
          <button
            className="ml-auto text-[#5c7890] hover:text-[#16344d] lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-7">
          {nav.map((group) => (
            <div key={group.section} className="mb-8">
              {!sidebarCompact && (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-[#6a8aa0]">
                  {group.section}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map(({ page: itemPage, label, icon: Icon }) => (
                  <button
                    key={itemPage}
                    onClick={() => go(itemPage)}
                    title={sidebarCompact ? label : undefined}
                    className={`group flex h-11 w-full items-center gap-3 border-l-2 px-3 text-left text-[13px] font-medium transition ${page === itemPage ? "border-[#1f6ea6] bg-[#4da3d9] text-white" : "border-transparent text-[#3d5e78] hover:bg-white/70 hover:text-[#16344d]"}`}
                  >
                    <Icon className="shrink-0" size={18} strokeWidth={1.8} />
                    {!sidebarCompact && <span>{label}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-[#c5dced] p-3">
          <button
            onClick={() => setSidebarCompact((x) => !x)}
            className="mb-2 hidden h-10 w-full items-center gap-3 px-3 text-[12px] text-[#5c7890] hover:text-[#16344d] lg:flex"
          >
            <PanelLeftClose size={17} className={sidebarCompact ? "rotate-180" : ""} />{" "}
            {!sidebarCompact && "Collapse menu"}
          </button>
          <button
            onClick={() => go("profile")}
            className="flex w-full items-center gap-3 p-2 text-left hover:bg-white/70"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1f6ea6] text-xs font-bold text-white">
              MA
            </span>
            {!sidebarCompact && (
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs">Miguel Alvarina</strong>
                <span className="text-[10px] text-[#5c7890]">Administrator</span>
              </span>
            )}
            {!sidebarCompact && <MoreHorizontal size={16} className="text-[#5c7890]" />}
          </button>
        </div>
      </aside>

      <div
        className={`min-h-screen transition-all duration-300 ${sidebarCompact ? "lg:pl-[84px]" : "lg:pl-[264px]"}`}
      >
        <header className="sticky top-0 z-20 flex h-[76px] items-center border-b border-[#d0e3ef] bg-white/95 px-5 backdrop-blur md:px-8">
          <button
            className="mr-4 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          <div className="hidden items-center gap-2 text-xs text-[#808080] sm:flex">
            <span>Office Management</span>
            <ChevronRight size={13} />
            <span className="font-medium text-black">{pageMeta[page].title}</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              className="relative grid size-10 place-items-center hover:bg-[#e7f3fb]"
              aria-label="Notifications"
              onClick={() => notify("You have 3 items requiring attention.")}
            >
              <Bell size={18} />
              <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-[#1f6ea6]" />
            </button>
            <div className="relative">
              <button
                className="flex h-10 items-center gap-2 px-2 hover:bg-[#e7f3fb]"
                onClick={() => setProfileOpen((x) => !x)}
              >
                <span className="grid size-7 place-items-center rounded-full bg-[#1f6ea6] text-[10px] font-bold text-white">
                  MA
                </span>
                <ChevronDown size={14} className="hidden sm:block" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-12 w-52 border border-[#d0e3ef] bg-white p-1 shadow-xl">
                  <button
                    onClick={() => go("profile")}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-xs hover:bg-[#e7f3fb]"
                  >
                    <UserRound size={15} /> My profile
                  </button>
                  <button
                    onClick={() => go("users")}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-xs hover:bg-[#e7f3fb]"
                  >
                    <Settings size={15} /> Administration
                  </button>
                  <button
                    onClick={() => notify("Prototype session remains active.")}
                    className="flex w-full items-center gap-2 border-t border-[#e1eef6] px-3 py-2.5 text-xs text-red-700 hover:bg-red-50"
                  >
                    <LogOut size={15} /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6 sm:px-5 sm:py-8 md:px-8 lg:px-10 lg:py-10">
          <PageHeading page={page} onAdd={requestAdd} />
          {page === "dashboard" && (
            <Dashboard
              checks={checks}
              payables={payables}
              receivables={receivables}
              employees={employees}
              go={go}
            />
          )}
          {page === "checks" && (
            <CheckMonitoring
              notify={notify}
              createSignal={checkCreateSignal}
              onRecordsChange={setChecks}
            />
          )}
          {page === "payables" && (
            <PayableMonitoring
              notify={notify}
              createSignal={payableCreateSignal}
              onRecordsChange={setPayables}
            />
          )}
          {page === "receivables" && (
            <ReceivableMonitoring
              notify={notify}
              createSignal={receivableCreateSignal}
              onRecordsChange={setReceivables}
            />
          )}
          {page === "employees" && (
            <EmployeeRegister
              data={employees}
              onAdd={() => setModal({ type: "add", module: "employees" })}
              onView={(id) => setModal({ type: "view", module: "employees", id })}
            />
          )}
          {page === "reports" && (
            <Reports
              checks={checks}
              payables={payables}
              receivables={receivables}
              employees={employees}
              notify={notify}
            />
          )}
          {page === "users" && <UserManagement notify={notify} />}
          {page === "activity" && <ActivityLogs />}
          {page === "profile" && <Profile notify={notify} />}
        </main>
        <footer className="mx-5 flex flex-col gap-2 border-t border-[#d0e3ef] py-6 text-[11px] text-[#808080] sm:flex-row sm:items-center sm:justify-between md:mx-8 lg:mx-10">
          <span>OASIS Office Management System · Independent prototype</span>
          <span>Authorized access only</span>
        </footer>
      </div>

      {modal && modal.module === "employees" && (
        <RecordModal
          modal={modal}
          employees={employees}
          close={() => setModal(null)}
          archive={archiveRecord}
          saveEmployee={(record: Omit<Employee, "id">) => {
            setEmployees((x) =>
              [...x, { ...record, id: Date.now() }].sort((a, b) => a.name.localeCompare(b.name)),
            );
            notify("Employee record created.");
            setModal(null);
          }}
        />
      )}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[70] flex max-w-sm items-center gap-3 bg-[#1f6ea6] px-5 py-4 text-sm text-white shadow-2xl"
        >
          <span className="grid size-6 place-items-center rounded-full bg-[#1f6ea6]">
            <Check size={14} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}

function PageHeading({ page, onAdd }: { page: Page; onAdd: () => void }) {
  const meta = pageMeta[page];
  const addLabels: Partial<Record<Page, string>> = {
    checks: "Add check",
    payables: "Add payable",
    receivables: "Add receivable",
    employees: "Add employee",
  };
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#1f6ea6]">
          {meta.eyebrow}
        </p>
        <h1 className="text-3xl font-bold tracking-[-.035em] text-black md:text-[38px]">
          {meta.title}
        </h1>
        <p className="mt-2 text-sm text-[#737373]">{meta.description}</p>
      </div>
      {addLabels[page] && (
        <button onClick={onAdd} className="primary-btn">
          <Plus size={17} /> {addLabels[page]}
        </button>
      )}
    </div>
  );
}

function Dashboard({
  checks,
  payables,
  receivables,
  employees,
  go,
}: {
  checks: CheckRecord[];
  payables: PayableViewModel[];
  receivables: ReceivableViewModel[];
  employees: Employee[];
  go: (p: Page) => void;
}) {
  const payableSummary = summarizePayables(payables);
  const receivableSummary = summarizeReceivables(receivables);
  return (
    <>
      <SummaryStatCards
        items={[
          {
            label: "Total Checks",
            value: checks.filter((x) => !x.archivedAt).length,
            icon: Copy,
            onClick: () => go("checks"),
          },
          {
            label: "Outstanding Payables",
            value: peso.format(payableSummary.totalRemainingBalance),
            icon: WalletCards,
            onClick: () => go("payables"),
          },
          {
            label: "Outstanding Receivables",
            value: peso.format(receivableSummary.totalOutstandingBalance),
            icon: CircleDollarSign,
            onClick: () => go("receivables"),
          },
          {
            label: "Active Employees",
            value: employees.filter((x) => x.status === "Active").length,
            icon: Users,
            onClick: () => go("employees"),
          },
        ]}
      />

      <div className="mt-7 grid gap-7 xl:grid-cols-[1.55fr_1fr]">
        <section className="panel">
          <PanelTitle
            title="Financial attention"
            subtitle="Items requiring review"
            action={
              <button onClick={() => go("reports")} className="text-link">
                View reports <ChevronRight size={13} />
              </button>
            }
          />
          <div className="grid gap-px bg-[#d7e8f3] md:grid-cols-2">
            <PayableDueList
              title="Payables"
              records={payables
                .filter(
                  (x) =>
                    !x.archivedAt &&
                    x.approvalStatus === "Approved" &&
                    (x.paymentStatus === "Overdue" ||
                      x.paymentStatus === "Unpaid" ||
                      x.paymentStatus === "Partial"),
                )
                .slice(0, 3)}
              onOpen={() => go("payables")}
            />
            <ReceivableDueList
              title="Receivables"
              records={receivables
                .filter(
                  (x) =>
                    !x.archivedAt &&
                    (x.collectionStatus === "Overdue" ||
                      x.collectionStatus === "Unpaid" ||
                      x.collectionStatus === "Partial"),
                )
                .slice(0, 3)}
              onOpen={() => go("receivables")}
            />
          </div>
        </section>
        <section className="panel">
          <PanelTitle
            title="Recent activity"
            subtitle="Across authorized modules"
            action={
              <button onClick={() => go("activity")} className="text-link">
                View all <ChevronRight size={13} />
              </button>
            }
          />
          <div className="divide-y divide-[#e1eef6] px-5">
            {[
              ["Payment recorded", "AP-2025-0318 · Miguel Alvarina", "12 min"],
              ["Check status updated", "CHK-240117 marked Cleared", "1 hr"],
              ["Employee updated", "EMP-00167 · Angela Cruz", "3 hrs"],
              ["Collection recorded", "AR-2025-0186 · PHP 65,000", "Yesterday"],
            ].map(([title, detail, time], i) => (
              <div key={title} className="flex gap-3 py-4">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${i === 0 ? "bg-[#1f6ea6]" : "bg-[#7eb6d9]"}`}
                />
                <div className="min-w-0 flex-1">
                  <strong className="block text-xs">{title}</strong>
                  <span className="mt-1 block truncate text-[11px] text-[#777]">{detail}</span>
                </div>
                <time className="text-[10px] text-[#999]">{time}</time>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel mt-7">
        <PanelTitle
          title="Recent check records"
          subtitle="Latest official check activity"
          action={
            <button onClick={() => go("checks")} className="text-link">
              Open register <ChevronRight size={13} />
            </button>
          }
        />
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Check no.</th>
                <th>Payee</th>
                <th>Bank</th>
                <th>Check date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {checks
                .filter((x) => !x.archivedAt)
                .slice(0, 4)
                .map((x) => (
                  <tr key={x.id}>
                    <td className="font-semibold">{x.checkNumber}</td>
                    <td>
                      <strong className="block text-xs">{x.payeeName}</strong>
                      <span className="mt-1 block text-[10px] text-[#888]">{x.checkType}</span>
                    </td>
                    <td className="text-[#777]">{x.bankName}</td>
                    <td>{formatDate(x.checkDate)}</td>
                    <td className="font-medium">{peso.format(x.checkAmount)}</td>
                    <td>
                      <Status value={x.checkStatus} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ReceivableDueList({
  title,
  records,
  onOpen,
}: {
  title: string;
  records: ReceivableViewModel[];
  onOpen: () => void;
}) {
  return (
    <div className="bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-[.1em]">{title}</h3>
        <span className="text-[10px] text-[#999]">{records.length} items</span>
      </div>
      <div className="divide-y divide-[#e1eef6]">
        {records.map((x) => (
          <button
            onClick={onOpen}
            key={x.id}
            className="flex w-full items-center gap-3 py-4 text-left hover:opacity-70"
          >
            <span className="grid size-9 place-items-center bg-[#e7f3fb]">
              <CalendarDays size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs">{x.customerName}</strong>
              <span className="mt-1 block text-[10px] text-[#777]">
                Due {formatDate(x.dueDate)}
              </span>
            </span>
            <span className="text-right">
              <strong className="mb-1 block text-xs">{peso.format(x.remainingBalance)}</strong>
              <Status value={x.collectionStatus} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PayableDueList({
  title,
  records,
  onOpen,
}: {
  title: string;
  records: PayableViewModel[];
  onOpen: () => void;
}) {
  return (
    <div className="bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-[.1em]">{title}</h3>
        <span className="text-[10px] text-[#999]">{records.length} items</span>
      </div>
      <div className="divide-y divide-[#e1eef6]">
        {records.map((x) => (
          <button
            onClick={onOpen}
            key={x.id}
            className="flex w-full items-center gap-3 py-4 text-left hover:opacity-70"
          >
            <span className="grid size-9 place-items-center bg-[#e7f3fb]">
              <CalendarDays size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs">{x.payeeName}</strong>
              <span className="mt-1 block text-[10px] text-[#777]">
                Due {formatDate(x.dueDate)}
              </span>
            </span>
            <span className="text-right">
              <strong className="mb-1 block text-xs">{peso.format(x.remainingBalance)}</strong>
              <Status value={x.paymentStatus} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RegisterTools({
  query,
  setQuery,
  status,
  setStatus,
  statuses,
  placeholder,
  exportData,
}: {
  query: string;
  setQuery: (x: string) => void;
  status: string;
  setStatus: (x: string) => void;
  statuses: string[];
  placeholder: string;
  exportData: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#d0e3ef] p-4 md:flex-row md:items-center">
      <label className="relative min-w-0 flex-1 md:max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input pl-10"
          placeholder={placeholder}
        />
      </label>
      <label className="relative">
        <SlidersHorizontal
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input min-w-40 appearance-none pl-9 pr-8"
        >
          <option>All statuses</option>
          {statuses.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
        />
      </label>
      <button onClick={() => window.print()} className="secondary-btn">
        <Printer size={15} /> Print
      </button>
      <button onClick={exportData} className="secondary-btn">
        <Download size={15} /> Export
      </button>
    </div>
  );
}

function EmployeeRegister({
  data,
  onAdd,
  onView,
}: {
  data: Employee[];
  onAdd: () => void;
  onView: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const filtered = data.filter(
    (x) =>
      `${x.number} ${x.name} ${x.department}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === "All statuses" || x.status === status),
  );
  const active = data.filter((x) => x.status === "Active").length;
  const onLeave = data.filter((x) => x.status === "On Leave").length;
  const inactive = data.filter((x) => x.status === "Inactive").length;
  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden">
      <SummaryStatCards
        items={[
          {
            label: "Total Employees",
            value: data.length,
            icon: Copy,
            onClick: () => setStatus("All statuses"),
          },
          {
            label: "Active",
            value: active,
            icon: UserCheck,
            onClick: () => setStatus("Active"),
          },
          {
            label: "On Leave",
            value: onLeave,
            icon: Clock3,
            onClick: () => setStatus("On Leave"),
          },
          {
            label: "Inactive",
            value: inactive,
            icon: UserMinus,
            onClick: () => setStatus("Inactive"),
          },
        ]}
      />
      <section className="panel max-w-full overflow-hidden">
      <PanelTitle
        title="Employee directory"
        subtitle={`${filtered.length} of ${data.length} employees · A–Z by surname`}
      />
      <RegisterTools
        query={query}
        setQuery={setQuery}
        status={status}
        setStatus={setStatus}
        statuses={["Active", "On Leave", "Inactive"]}
        placeholder="Search employee no., name, or department…"
        exportData={() => exportCsv("employee-alphalist.csv", filtered)}
      />
      {filtered.length ? (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Employee no.</th>
                <th>Department</th>
                <th>Position</th>
                <th>Date hired</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x) => (
                <tr key={x.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e7f3fb] text-[10px] font-bold">
                        {x.initials}
                      </span>
                      <span>
                        <strong className="block text-xs">{x.name}</strong>
                        <span className="mt-1 block text-[10px] text-[#888]">{x.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className="font-medium text-[#1f6ea6]">{x.number}</td>
                  <td>{x.department}</td>
                  <td>{x.position}</td>
                  <td>{formatDate(x.dateHired)}</td>
                  <td>
                    <Status value={x.status} />
                  </td>
                  <td>
                    <button onClick={() => onView(x.id)} className="table-action">
                      <MoreHorizontal size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No employees found" action={onAdd} />
      )}
      <Pagination count={filtered.length} />
    </section>
    </div>
  );
}

function RecordModal({
  modal,
  employees,
  close,
  archive,
  saveEmployee,
}: {
  modal: { type: "add" | "view" | "transaction"; module: Page; id?: number };
  employees: Employee[];
  close: () => void;
  archive: (module: Page, id: number) => void;
  saveEmployee: (record: Omit<Employee, "id">) => void;
}) {
  const record = employees.find((x) => x.id === modal.id);
  const title = modal.type === "add" ? "Add employee" : "Employee details";
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fullName = String(fd.get("party"));
    const pieces = fullName.split(" ");
    saveEmployee({
      number: String(fd.get("reference")),
      name: fullName,
      initials: pieces
        .map((x) => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      department: String(fd.get("department")),
      position: String(fd.get("position")),
      dateHired: String(fd.get("date")),
      email: String(fd.get("email")),
      status: "Active",
    });
  };
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[95vh] w-full overflow-y-auto bg-white sm:max-w-xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#d0e3ef] bg-white px-6 py-5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#1f6ea6]">
              {pageMeta.employees.eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-[-.025em]">{title}</h2>
          </div>
          <button onClick={close} className="table-action">
            <X size={19} />
          </button>
        </div>
        {modal.type === "view" && record ? (
          <DetailView
            module="employees"
            record={record}
            archive={() => archive("employees", modal.id!)}
            close={close}
          />
        ) : (
          <form onSubmit={onSubmit} className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Employee number" name="reference" required />
              <div className="sm:col-span-2">
                <FormField label="Full name (Surname, First name)" name="party" required />
              </div>
              <FormField label="Department" name="department" required />
              <FormField label="Position" name="position" required />
              <FormField label="Date hired" name="date" type="date" required />
              <FormField label="Email address" name="email" type="email" required />
            </div>
            <div className="mt-7 flex justify-end gap-2 border-t border-[#e1eef6] pt-5">
              <button type="button" onClick={close} className="secondary-btn">
                Cancel
              </button>
              <button className="primary-btn">Save record</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function DetailView({
  record,
  archive,
  close,
}: {
  module: "employees";
  record: Employee;
  archive: () => void;
  close: () => void;
}) {
  const fields = [
    ["Employee number", record.number],
    ["Department", record.department],
    ["Position", record.position],
    ["Date hired", formatDate(record.dateHired)],
    ["Email address", record.email],
    ["Status", record.status],
  ];
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-4 bg-[#e7f3fb] p-5">
        <span className="grid size-12 place-items-center bg-[#1f6ea6] text-white">
          <UserRound size={21} />
        </span>
        <div>
          <span className="text-[10px] uppercase tracking-[.12em] text-[#777]">
            Official record
          </span>
          <h3 className="mt-1 font-bold">{record.name}</h3>
        </div>
      </div>
      <dl className="grid gap-px bg-[#d0e3ef] sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="bg-white p-4">
            <dt className="field-label">{label}</dt>
            <dd className="mt-1.5 text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-7 flex flex-wrap justify-between gap-2 border-t border-[#e1eef6] pt-5">
        <button onClick={archive} className="secondary-btn text-red-700">
          Archive record
        </button>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="secondary-btn">
            <Printer size={15} /> Print
          </button>
          <button onClick={close} className="primary-btn">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Reports({ checks, payables, receivables, employees, notify }: any) {
  const activeChecks = (checks as CheckRecord[]).filter((x) => !x.archivedAt);
  const payableRows = (payables as PayableViewModel[]).filter(
    (x) => !x.archivedAt && x.approvalStatus === "Approved" && x.remainingBalance > 0,
  );
  const reports = [
    {
      title: "Check register",
      detail: "Open Check Monitoring for full reports, filters, and masked exports",
      Icon: FileCheck2,
      data: activeChecks,
      exportRows: activeChecks.map((x) => ({
        CheckNumber: x.checkNumber,
        CheckType: x.checkType,
        Payee: x.payeeName,
        Drawer: x.drawerName,
        Bank: x.bankName,
        Amount: x.checkAmount,
        Status: x.checkStatus,
        PreparedBy: x.preparedByName,
      })),
    },
    {
      title: "Outstanding payables",
      detail: "Open Payable Monitoring for full reports, approval, and payment history",
      Icon: WalletCards,
      data: payableRows,
      exportRows: payableRows.map((x) => ({
        Payee: x.payeeName,
        Invoice: x.invoiceNumber,
        DueDate: x.dueDate,
        Total: x.totalAmount,
        Paid: x.amountPaid,
        Remaining: x.remainingBalance,
        PaymentStatus: x.paymentStatus,
        ApprovalStatus: x.approvalStatus,
      })),
    },
    {
      title: "Outstanding receivables",
      detail: "Open Receivable Monitoring for full reports, collections, and follow-ups",
      Icon: CircleDollarSign,
      data: (receivables as ReceivableViewModel[]).filter(
        (x) => !x.archivedAt && x.remainingBalance > 0,
      ),
      exportRows: (receivables as ReceivableViewModel[])
        .filter((x) => !x.archivedAt && x.remainingBalance > 0)
        .map((x) => ({
          Customer: x.customerName,
          Invoice: x.invoiceNumber,
          DueDate: x.dueDate,
          Total: x.totalReceivableAmount,
          Collected: x.amountPaid,
          Remaining: x.remainingBalance,
          Status: x.collectionStatus,
          DaysOverdue: x.daysOverdue,
        })),
    },
    {
      title: "Employee alphalist",
      detail: "Authorized employee directory by department",
      Icon: Users,
      data: employees,
      exportRows: null,
    },
  ];
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {reports.map(({ title, detail, Icon, data, exportRows }) => (
        <section key={title} className="panel p-6">
          <div className="flex items-start gap-4">
            <span className="grid size-11 place-items-center bg-[#e7f3fb] text-[#1f6ea6]">
              <Icon size={20} />
            </span>
            <div className="flex-1">
              <h2 className="font-bold">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-[#777]">{detail}</p>
            </div>
          </div>
          <div className="my-6 grid grid-cols-2 gap-4 border-y border-[#d7e8f3] py-4">
            <div>
              <span className="field-label">Records</span>
              <strong className="mt-1 block text-xl">{data.length}</strong>
            </div>
            <div>
              <span className="field-label">Format</span>
              <strong className="mt-1 block text-sm">CSV / Print</strong>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="secondary-btn flex-1">
              <Printer size={15} /> Print
            </button>
            <button
              onClick={() =>
                exportCsv(
                  `${String(title).toLowerCase().split(" ").join("-")}.csv`,
                  exportRows ?? data,
                  notify,
                )
              }
              className="primary-btn flex-1"
            >
              <Download size={15} /> Export CSV
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

function UserManagement({ notify }: { notify: (s: string) => void }) {
  const users = [
    ["Miguel Alvarina", "m.alvarina@oasis.org", "Administrator", "Active"],
    ["Leon Bautista", "l.bautista@oasis.org", "Staff · Operations", "Active"],
    ["Angela Cruz", "a.cruz@oasis.org", "Staff · HR", "Active"],
    ["Nathaniel Dela Rosa", "n.delarosa@oasis.org", "Viewer", "Active"],
  ];
  return (
    <section className="panel">
      <PanelTitle
        title="Authorized users"
        subtitle="Role and permission assignments"
        action={
          <button
            onClick={() => notify("User invitation workflow opened in prototype mode.")}
            className="primary-btn"
          >
            <Plus size={15} /> Invite user
          </button>
        }
      />
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last active</th>
            </tr>
          </thead>
          <tbody>
            {users.map((x, i) => (
              <tr key={x[1]}>
                <td className="font-semibold">{x[0]}</td>
                <td>{x[1]}</td>
                <td>{x[2]}</td>
                <td>
                  <Status value={x[3]} />
                </td>
                <td className="text-[#777]">{i === 0 ? "Now" : `${i + 1} hours ago`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActivityLogs() {
  const logs = [
    [
      "Payment recorded",
      "Payable Monitoring",
      "AP-2025-0318",
      "Miguel Alvarina",
      "Mar 21, 2025 · 9:48 AM",
    ],
    [
      "Status changed to Cleared",
      "Check Monitoring",
      "CHK-240117",
      "Miguel Alvarina",
      "Mar 21, 2025 · 8:35 AM",
    ],
    [
      "Employee profile updated",
      "HR · Alpha List",
      "EMP-00167",
      "Angela Cruz",
      "Mar 20, 2025 · 4:12 PM",
    ],
    [
      "Collection recorded",
      "Receivable Monitoring",
      "AR-2025-0186",
      "Leon Bautista",
      "Mar 20, 2025 · 2:05 PM",
    ],
    [
      "Payable created",
      "Payable Monitoring",
      "AP-2025-0318",
      "Miguel Alvarina",
      "Mar 20, 2025 · 10:22 AM",
    ],
  ];
  return (
    <section className="panel">
      <PanelTitle title="Audit trail" subtitle="Non-sensitive activity summaries" />
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Module</th>
              <th>Record</th>
              <th>Performed by</th>
              <th>Date & time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((x) => (
              <tr key={`${x[0]}${x[2]}`}>
                <td className="font-semibold">{x[0]}</td>
                <td>{x[1]}</td>
                <td className="text-[#1f6ea6]">{x[2]}</td>
                <td>{x[3]}</td>
                <td className="text-[#777]">{x[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Profile({ notify }: { notify: (s: string) => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <section className="panel p-7 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-[#1f6ea6] text-xl font-bold text-white">
          MA
        </span>
        <h2 className="mt-4 font-bold">Miguel Alvarina</h2>
        <p className="mt-1 text-xs text-[#777]">Finance Administrator</p>
        <Status value="Administrator" />
        <div className="mt-6 border-t border-[#e1eef6] pt-5 text-left">
          <span className="field-label">Account access</span>
          <p className="mt-2 text-xs leading-5 text-[#666]">
            Full authorized access to all four modules, reports, and administrative settings.
          </p>
        </div>
      </section>
      <section className="panel">
        <PanelTitle title="Profile information" subtitle="Your account and contact details" />
        <form
          className="grid gap-4 p-6 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            notify("Profile changes saved.");
          }}
        >
          <FormField label="First name" name="first" defaultValue="Miguel" />
          <FormField label="Last name" name="last" defaultValue="Alvarina" />
          <FormField
            label="Email address"
            name="email"
            type="email"
            defaultValue="m.alvarina@oasis.org"
          />
          <FormField label="Contact number" name="phone" defaultValue="+63 917 555 0142" />
          <div className="sm:col-span-2 flex justify-end border-t border-[#e1eef6] pt-5">
            <button className="primary-btn">Save changes</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PanelTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[76px] flex-col gap-3 border-b border-[#d0e3ef] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-bold tracking-[-.01em]">{title}</h2>
        <p className="mt-1 text-[11px] text-[#888]">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function FormField({
  label,
  name,
  type = "text",
  required,
  value,
  onChange,
  max,
  defaultValue,
}: any) {
  return (
    <label className="block">
      <span className="field-label">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        max={max}
        step={type === "number" ? "0.01" : undefined}
        defaultValue={defaultValue}
        className="input mt-2"
      />
    </label>
  );
}

function Status({ value }: { value: string }) {
  const tone = [
    "Paid",
    "Collected",
    "Cleared",
    "Active",
    "Administrator",
    "Deposited",
    "Approved",
  ].includes(value)
    ? "status-good"
    : ["Overdue", "Cancelled", "Voided", "Bounced", "Inactive", "Rejected"].includes(value)
      ? "status-alert"
      : ["Partial", "Partially Collected", "Partially Paid", "For Deposit", "For Clearing"].includes(
            value,
          )
        ? "status-partial"
        : "status-neutral";
  return <span className={`status ${tone}`}>{value}</span>;
}

function Empty({ title, action }: { title: string; action: () => void }) {
  return (
    <div className="grid place-items-center px-5 py-20 text-center">
      <span className="grid size-12 place-items-center bg-[#e7f3fb]">
        <Search size={20} />
      </span>
      <h3 className="mt-4 text-sm font-bold">{title}</h3>
      <p className="mt-1 text-xs text-[#888]">Adjust the filters or create a new record.</p>
      <button onClick={action} className="primary-btn mt-5">
        <Plus size={15} /> Add record
      </button>
    </div>
  );
}

function Pagination({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between border-t border-[#d0e3ef] px-5 py-4 text-[11px] text-[#777]">
      <span>
        Showing {count ? 1 : 0}–{count} of {count}
      </span>
      <div className="flex gap-1">
        <button disabled className="table-action disabled:opacity-30">
          <ChevronLeft size={15} />
        </button>
        <button className="grid size-8 place-items-center bg-[#1f6ea6] text-white">1</button>
        <button disabled className="table-action disabled:opacity-30">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function exportCsv(filename: string, rows: object[], notify?: (s: string) => void) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(","),
    ...rows.map((row: any) =>
      keys.map((key) => `"${String(row[key] ?? "").split('"').join('""')}"`).join(","),
    ),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  notify?.("Authorized export generated.");
}

export default App;
