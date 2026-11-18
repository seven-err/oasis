import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowUpDown,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Wallet,
  Download,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  UserRound,
  UserCheck,
  WalletCards,
  X,
} from "lucide-react";
import oasisLogo from "../Oasis-Logo.png";
import {
  getOfficeNotifications,
  NotificationInbox,
  type OfficeNotification,
} from "@/components/NotificationInbox";
import { todayIsoDate } from "@/modules/payables/utils";
import { CURRENT_USER } from "@/modules/checks/constants";
import { SummaryStatCards } from "@/components/SummaryStatCards";
import { HeaderBackButton, HeaderBackProvider, useHeaderBack } from "@/components/HeaderBack";
import { useViewHistory } from "@/hooks/useViewHistory";
import {
  CheckMonitoring,
  checkService,
  getCheckRecords,
  type CheckRecord,
} from "@/modules/checks";
import {
  PayableMonitoring,
  payableService,
  getPayableRecords,
  summarizePayables,
  type PayableViewModel,
} from "@/modules/payables";
import {
  ReceivableMonitoring,
  receivableService,
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
  | "archives"
  | "deleted"
  | "profile";

type ArchiveModule = "Checks" | "Payables" | "Receivables" | "Employees";

const employmentStatuses = [
  "Probationary",
  "Resigned",
  "Regular",
  "Terminated",
  "Contractual",
] as const;
const employeeRequirements = [
  "SSS",
  "PhilHealth",
  "PAG-IBIG",
  "TIN",
  "Bank Details",
  "Medical Cert",
  "PSA",
  "NBI",
  "Barangay Clearance",
];
const laboratoryRequirements = ["X-RAY", "CBC", "Drug Test"];
const employeeFieldGroups = [
  {
    title: "Personal information",
    fields: [
      { name: "dateOfBirth", label: "Date of Birth", type: "date" },
      { name: "sex", label: "Sex", options: ["Female", "Male", "Prefer not to say"] },
      { name: "contactNumber", label: "Contact Number", type: "tel" },
      { name: "civilStatus", label: "Civil Status", options: ["Single", "Married", "Separated", "Divorced", "Widowed"] },
      { name: "address", label: "Complete Address", type: "textarea" },
    ],
  },
  {
    title: "Government and bank details",
    fields: [
      { name: "sssNumber", label: "SSS Number" },
      { name: "philHealthNumber", label: "PhilHealth Number" },
      { name: "pagIbigNumber", label: "PAG-IBIG MID Number" },
      { name: "tinNumber", label: "TIN Number" },
      { name: "bankName", label: "Bank Name" },
      { name: "bankAccountNumber", label: "Bank Account Number" },
    ],
  },
  {
    title: "Contract details",
    fields: [
      { name: "contractStart", label: "Start of Contract", type: "date" },
      { name: "contractEnd", label: "End of Contract", type: "date" },
      { name: "yearsOfService", label: "Years of Service", type: "number" },
    ],
  },
] as const;
type EmployeeField = (typeof employeeFieldGroups)[number]["fields"][number]["name"];
type EmployeeView = { mode: "create" } | { mode: "details" | "edit"; id: number };

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
  archived?: boolean;
  employmentStatus?: (typeof employmentStatuses)[number] | "Cash Advances";
  hasCashAdvances?: boolean;
  cashAdvanceAmount?: number;
  requirements?: string[];
  laboratoryRequirements?: string[];
  requirementAttachments?: Partial<Record<string, File>>;
  requirementStatus?: "Complete" | "Incomplete";
  requirementFollowUpDate?: string;
} & Partial<Record<EmployeeField, string>>;

function nextEmployeeNumber(employees: Employee[]): string {
  const highest = employees.reduce(
    (max, employee) => Math.max(max, Number(employee.number.replace(/^EMP-/, "")) || 0),
    0,
  );
  return `EMP-${String(highest + 1).padStart(5, "0")}`;
}

function getEmploymentStatus(employee?: Employee) {
  const status = employee?.employmentStatus;
  return status === "Cash Advances" ? undefined : status;
}

function hasEmployeeCashAdvances(employee?: Employee) {
  return employee?.hasCashAdvances ?? (employee?.employmentStatus === "Cash Advances");
}

function displayEmployeeCashAdvances(employee: Employee) {
  if (!hasEmployeeCashAdvances(employee)) return "No";
  return employee.cashAdvanceAmount === undefined
    ? "Amount not recorded"
    : peso.format(employee.cashAdvanceAmount);
}

const contactCountryCode = "+63";
const contactSubscriberLength = 10;
const contactSubscriberPattern = `9[0-9]{${contactSubscriberLength - 1}}`;
const contactSubscriberRegex = new RegExp(`^${contactSubscriberPattern}$`);

function getContactDigits(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith(contactCountryCode)) {
    return trimmed.slice(contactCountryCode.length).replace(/\D/g, "");
  }
  return trimmed.replace(/\D/g, "").replace(/^0/, "");
}

function employeeDirectoryRows(employees: Employee[]) {
  return employees.map((employee) => ({
    "ID No.": employee.number,
    "Full Name": employee.name,
    Department: employee.department,
    Position: employee.position,
    "Date Hired": employee.dateHired,
    "Email Address": employee.email,
    "Employment Status": getEmploymentStatus(employee) ?? "",
    "Cash Advances": hasEmployeeCashAdvances(employee) ? "Yes" : "No",
    "Cash Advance Amount (PHP)": employee.cashAdvanceAmount ?? "",
    "Requirement Status": employee.requirementStatus ?? "Incomplete",
  }));
}

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
    title: "Home",
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
  archives: {
    eyebrow: "Management",
    title: "Archive Records",
    description: "Review archived checks, payables, receivables, and employees.",
  },
  deleted: {
    eyebrow: "Management",
    title: "Deleted Records",
    description: "Review records deleted from the archive.",
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
      { page: "dashboard" as Page, label: "Home", icon: LayoutDashboard },
      { page: "employees" as Page, label: "Employee Alphalist", icon: Users },
      { page: "checks" as Page, label: "Check Monitoring", icon: FileCheck2 },
      { page: "payables" as Page, label: "Payable Monitoring", icon: WalletCards },
      { page: "receivables" as Page, label: "Receivable Monitoring", icon: CircleDollarSign },
    ],
  },
  {
    section: "Management",
    items: [
      { page: "archives" as Page, label: "Archive Records", icon: Archive },
      { page: "deleted" as Page, label: "Deleted Records", icon: Trash2 },
      { page: "users" as Page, label: "User Management", icon: ShieldCheck },
      { page: "activity" as Page, label: "Activity Logs", icon: Activity },
    ],
  },
];

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const compactMenu = !sidebarHovered && !sidebarOpen && !profileOpen;
  const sidebarNavRef = useRef<HTMLElement>(null);
  const [selectionTop, setSelectionTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const navigation = sidebarNavRef.current;
    if (!navigation) return;
    const updateSelection = () => {
      const selected = navigation.querySelector<HTMLButtonElement>('[aria-current="page"]');
      setSelectionTop(selected ? selected.offsetTop : null);
    };
    updateSelection();
    const observer = new ResizeObserver(updateSelection);
    observer.observe(navigation);
    return () => observer.disconnect();
  }, [page]);
  const [checks, setChecks] = useState<CheckRecord[]>(() => getCheckRecords());
  const [payables, setPayables] = useState<PayableViewModel[]>(() => getPayableRecords());
  const [receivables, setReceivables] = useState<ReceivableViewModel[]>(() =>
    getReceivableRecords(),
  );
  const [employees, setEmployees] = useState(initialEmployees);
  const [deletedEmployees, setDeletedEmployees] = useState<Employee[]>([]);
  const [checkCreateSignal, setCheckCreateSignal] = useState(0);
  const [payableCreateSignal, setPayableCreateSignal] = useState(0);
  const [receivableCreateSignal, setReceivableCreateSignal] = useState(0);
  const {
    view: employeeView,
    open: setEmployeeView,
    back: backEmployeeView,
    replace: replaceEmployeeView,
    reset: resetEmployeeView,
  } = useViewHistory<EmployeeView | null>(() => null, null);
  const [toast, setToast] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<{ module: ArchiveModule; id: number } | null>(null);
  const deletionDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (pendingDeletion) deletionDialogRef.current?.showModal();
    else deletionDialogRef.current?.close();
  }, [pendingDeletion]);

  useEffect(() => {
    if (!profileOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        profileButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen]);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationDate, setNotificationDate] = useState(() => todayIsoDate());
  const [notificationTarget, setNotificationTarget] = useState<{
    item: OfficeNotification;
    visit: number;
  } | null>(null);

  useEffect(() => {
    const refreshDate = () => setNotificationDate(todayIsoDate());
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
    };
  }, []);

  const go = (next: Page, notification?: OfficeNotification) => {
    setPage(next);
    setNotificationTarget((previous) =>
      notification ? { item: notification, visit: (previous?.visit ?? 0) + 1 } : null,
    );
    if (next !== page || notification) {
      setCheckCreateSignal(0);
      setPayableCreateSignal(0);
      setReceivableCreateSignal(0);
    }
    setNotificationsOpen(false);
    if (notification?.page === "employees") {
      setEmployeeView({ mode: "details", id: notification.recordId });
    } else if (next !== "employees") {
      resetEmployeeView(null);
    }
    setSidebarOpen(false);
    setProfileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const confirmPermanentDeletion = () => {
    if (!pendingDeletion) return;
    const { module, id } = pendingDeletion;
    try {
      if (module === "Employees") {
        setDeletedEmployees((list) => list.filter((record) => record.id !== id));
      } else {
        const services = { Checks: checkService, Payables: payableService, Receivables: receivableService };
        const result = services[module].deletePermanently(id);
        if (!result.ok) {
          notify(result.errors.form || "Unable to delete record.");
          return;
        }
        setChecks(getCheckRecords());
        setPayables(getPayableRecords());
        setReceivables(getReceivableRecords());
      }
      setPendingDeletion(null);
      notify("Record permanently deleted.");
    } catch {
      notify("Unable to delete record. Please try again.");
    }
  };

  const openEmployeeView = (view: EmployeeView | null) => {
    if (view === null) resetEmployeeView(null);
    else setEmployeeView(view);
  };

  const deleteEmployee = (id: number) => {
    if (!window.confirm("Delete this employee record? This action cannot be undone.")) return;
    setEmployees((list) => list.filter((employee) => employee.id !== id));
    notify("Employee record deleted.");
    openEmployeeView(null);
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
    if (page === "employees") openEmployeeView({ mode: "create" });
  };

  return (
    <HeaderBackProvider>
    <div className="min-h-screen bg-[#f3f8fc] text-[#111]">
      {sidebarOpen && (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        data-compact={compactMenu}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setSidebarHovered(true);
        }}
        onPointerLeave={() => setSidebarHovered(false)}
        className={`oasis-sidebar fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-[#c5dced] bg-[#d7eef9] text-[#16344d] ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} ${compactMenu ? "lg:w-[70px]" : "lg:w-[264px]"} w-[276px] lg:translate-x-0`}
      >
        <div className={`flex h-[76px] shrink-0 items-center border-b border-[#c5dced] pl-[9px] pr-3 ${compactMenu ? "lg:pr-1" : ""}`}>
          <button
            aria-label="OASIS home"
            onClick={() => go("dashboard")}
            className="flex min-w-0 items-center overflow-hidden"
          >
            <img
              src={oasisLogo}
              alt=""
              className="size-14 shrink-0 object-contain"
            />
            <span aria-hidden="true" className="sidebar-brand grid shrink-0 grid-rows-[1fr_auto_1fr] self-stretch whitespace-nowrap text-left">
              <svg
                aria-hidden="true"
                className="row-start-2 h-[13px] w-auto justify-self-start text-[#ed0000]"
                viewBox="0 0 354 64"
              >
                <g fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round">
                  <path d="M6 56 40 10 Q46 2 52 10 L86 56" />
                  <path d="M201 10 H128 A12 12 0 0 0 128 34 H191 A11 11 0 0 1 191 56 H112" />
                  <path d="M229 10 V56" />
                  <path d="M344 10 H271 A12 12 0 0 0 271 34 H334 A11 11 0 0 1 334 56 H255" />
                </g>
                <circle cx="46" cy="48" r="8" fill="currentColor" />
              </svg>
              <span className="row-start-3 pt-1 text-[9px] leading-[11px] tracking-[.04em] text-[#5c7890]">
                Diagnostic & Laboratory Center
              </span>
            </span>
          </button>
          <button
            className="ml-auto shrink-0 text-[#5c7890] hover:text-[#16344d] lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>
        <nav ref={sidebarNavRef} className="relative isolate flex-1 overflow-x-hidden overflow-y-auto px-3 py-7">
          {selectionTop !== null && (
            <div
              aria-hidden="true"
              className="sidebar-selection pointer-events-none absolute inset-x-3 top-0 h-11 border-l-2 border-[#1f6ea6] bg-[#4da3d9]"
              style={{ transform: `translateY(${selectionTop}px)` }}
            />
          )}
          {nav.map((group) => (
            <div key={group.section} className="mb-8">
                <p aria-hidden={compactMenu} className="sidebar-copy mb-2 whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-[#6a8aa0]">
                  {group.section}
                </p>
              <div className="space-y-1">
                {group.items.map(({ page: itemPage, label, icon: Icon }) => (
                  <button
                    key={itemPage}
                    onClick={() => go(itemPage)}
                    title={compactMenu ? label : undefined}
                    aria-label={label}
                    aria-current={page === itemPage ? "page" : undefined}
                    className={`sidebar-nav-item relative group flex h-11 w-full items-center gap-3 border-l-2 border-transparent px-3 text-left text-[13px] font-medium ${page === itemPage ? "text-white" : "text-[#3d5e78] hover:bg-white/70 hover:text-[#16344d]"}`}
                  >
                    <Icon className="shrink-0" size={18} strokeWidth={1.8} />
                    <span aria-hidden={compactMenu} className="sidebar-copy shrink-0 whitespace-nowrap">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div ref={profileMenuRef} className="relative border-t border-[#c5dced] p-3">
          {profileOpen && (
            <div id="sidebar-account-menu" aria-label="Account" className="absolute inset-x-3 bottom-full mb-2 rounded-xl border border-[#d0e3ef] bg-white p-1 text-[#16344d] shadow-xl">
              <button
                onClick={() => go("profile")}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs hover:bg-[#e7f3fb]"
              >
                <UserRound size={15} /> My profile
              </button>
              <button
                onClick={() => go("users")}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs hover:bg-[#e7f3fb]"
              >
                <Settings size={15} /> Administration
              </button>
              <button
                onClick={() => {
                  setProfileOpen(false);
                  notify("Prototype session remains active.");
                }}
                className="flex w-full items-center gap-2 border-t border-[#e1eef6] px-3 py-2.5 text-xs text-red-700 hover:bg-red-50"
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          )}
          <button
            ref={profileButtonRef}
            onClick={() => {
              setNotificationsOpen(false);
              setProfileOpen((open) => !open);
            }}
            aria-label="Account options for Miguel Alvarina"
            aria-expanded={profileOpen}
            aria-controls="sidebar-account-menu"
            className="flex w-full items-center gap-3 py-2 pl-[5px] pr-2 text-left hover:bg-white/70"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1f6ea6] text-xs font-bold text-white">
              MA
            </span>
              <span aria-hidden={compactMenu} className="sidebar-copy min-w-0 flex-1 whitespace-nowrap">
                <strong className="block truncate text-xs">Miguel Alvarina</strong>
                <span className="text-[10px] text-[#5c7890]">Administrator</span>
              </span>
          </button>
        </div>
      </aside>

      <div
        className={`oasis-content min-h-screen min-w-0 ${compactMenu ? "lg:pl-[70px]" : "lg:pl-[264px]"}`}
      >
        <header className="sticky top-0 z-20 flex h-[76px] items-center border-b border-[#d0e3ef]/80 bg-white/70 px-5 shadow-sm backdrop-blur-lg backdrop-saturate-150 md:px-8">
          <button
            className="mr-4 lg:hidden"
            onClick={() => {
              setNotificationsOpen(false);
              setSidebarOpen(true);
            }}
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          {page === "dashboard" ? (
            <div className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[#16344d]">
              <ChevronRight aria-hidden="true" size={16} />
              <span>{pageMeta[page].title}</span>
            </div>
          ) : (
            <HeaderBackButton fallback={() => go("dashboard")} />
          )}
          <div className="ml-auto flex items-center gap-1">
            <NotificationInbox
              key={CURRENT_USER.id}
              userId={CURRENT_USER.id}
              items={getOfficeNotifications(checks, payables, receivables, employees, notificationDate)}
              open={notificationsOpen && !profileOpen}
              onOpenChange={(open) => {
                if (open) {
                  setNotificationDate(todayIsoDate());
                  setProfileOpen(false);
                }
                setNotificationsOpen(open);
              }}
              onSelect={(item) => go(item.page, item)}
            />
            {page !== "profile" && (
              <button
                aria-label="My profile"
                className="flex h-10 items-center gap-2 px-2 hover:bg-[#e7f3fb]"
                onClick={() => go("profile")}
              >
                <span className="grid size-7 place-items-center rounded-full bg-[#1f6ea6] text-[10px] font-bold text-white">
                  MA
                </span>
              </button>
            )}
          </div>
        </header>

        <main key={page} className="page-view-enter mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6 sm:px-5 sm:py-8 md:px-8 lg:px-10 lg:py-10">
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
              key={notificationTarget?.visit ?? 0}
              initialRecordId={notificationTarget?.item.recordId}
              notify={notify}
              createSignal={checkCreateSignal}
              onRecordsChange={setChecks}
            />
          )}
          {page === "payables" && (
            <PayableMonitoring
              key={notificationTarget?.visit ?? 0}
              initialRecordId={notificationTarget?.item.recordId}
              notify={notify}
              createSignal={payableCreateSignal}
              onRecordsChange={setPayables}
            />
          )}
          {page === "receivables" && (
            <ReceivableMonitoring
              key={notificationTarget?.visit ?? 0}
              initialRecordId={notificationTarget?.item.recordId}
              notify={notify}
              createSignal={receivableCreateSignal}
              onRecordsChange={setReceivables}
            />
          )}
          {page === "employees" && (
            <>
              <div hidden={employeeView !== null}>
                <EmployeeRegister
                  data={employees}
                  onAdd={() => openEmployeeView({ mode: "create" })}
                  onView={(id) => openEmployeeView({ mode: "details", id })}
                  onEdit={(id) => openEmployeeView({ mode: "edit", id })}
                />
              </div>
              {employeeView && (
                <EmployeeRecordPanel
                  key={employeeView.mode === "create" ? "create" : `${employeeView.mode}:${employeeView.id}`}
                  view={employeeView}
                  employees={employees}
                  close={backEmployeeView}
                  onDelete={deleteEmployee}
                  saveEmployee={(record) => {
                    if (employeeView.mode === "edit") {
                      const { id } = employeeView;
                      setEmployees((list) =>
                        list
                          .map((employee) => employee.id === id ? { ...employee, ...record } : employee)
                          .sort((a, b) => a.name.localeCompare(b.name)),
                      );
                      notify("Employee record updated.");
                      replaceEmployeeView({ mode: "details", id });
                      return;
                    }

                    setEmployees((list) =>
                      [
                        ...list,
                        {
                          ...record,
                          id: list.reduce((max, employee) => Math.max(max, employee.id), 0) + 1,
                          number: nextEmployeeNumber(list),
                        },
                      ].sort((a, b) => a.name.localeCompare(b.name)),
                    );
                    notify("Employee record created.");
                    backEmployeeView();
                  }}
                />
              )}
            </>
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
          {page === "archives" && (
            <ArchivedRecords
              checks={checks}
              payables={payables}
              receivables={receivables}
              employees={employees}
              onDelete={(module, id) => {
                try {
                  if (module === "Employees") {
                    const employee = employees.find((record) => record.id === id && record.archived);
                    if (!employee) return;
                    setDeletedEmployees((list) => [...list, employee]);
                    setEmployees((list) => list.filter((record) => record.id !== id));
                  } else {
                    const services = { Checks: checkService, Payables: payableService, Receivables: receivableService };
                    const result = services[module].deleteArchived(id);
                    if (!result.ok) {
                      notify(result.errors.form || "Unable to delete record.");
                      return;
                    }
                    setChecks(getCheckRecords());
                    setPayables(getPayableRecords());
                    setReceivables(getReceivableRecords());
                  }
                  notify("Record moved to Deleted Records.");
                } catch {
                  notify("Unable to delete record. Please try again.");
                }
              }}
              onRestore={(module, id) => {
                try {
                  if (module === "Employees") {
                    setEmployees((list) => list.map((record) => record.id === id ? { ...record, archived: false } : record));
                  } else {
                    const services = { Checks: checkService, Payables: payableService, Receivables: receivableService };
                    const result = services[module].restore(id);
                    if (!result.ok) {
                      notify(result.errors.form || "Unable to restore record.");
                      return false;
                    }
                    setChecks(getCheckRecords());
                    setPayables(getPayableRecords());
                    setReceivables(getReceivableRecords());
                  }
                  notify("Record restored.");
                  return true;
                } catch {
                  notify("Unable to restore record. Please try again.");
                  return false;
                }
              }}
            />
          )}
          {page === "deleted" && (
            <ArchivedRecords
              key="deleted-records"
              checks={checkService.listDeleted()}
              payables={[]}
              receivables={[]}
              employees={deletedEmployees}
              deletedFinancialRecords={[
                ...payableService.listDeleted().map((record) => ({ key: `payable-${record.id}`, id: record.id, module: "Payables" as const, reference: record.invoiceNumber, name: record.payeeName })),
                ...receivableService.listDeleted().map((record) => ({ key: `receivable-${record.id}`, id: record.id, module: "Receivables" as const, reference: record.invoiceNumber, name: record.customerName })),
              ]}
              deleted
              onRestore={(module, id) => {
                try {
                  if (module === "Employees") {
                    const record = deletedEmployees.find((employee) => employee.id === id);
                    if (!record) return false;
                    setEmployees((list) => [...list, record]);
                    setDeletedEmployees((list) => list.filter((employee) => employee.id !== id));
                  } else {
                    const services = { Checks: checkService, Payables: payableService, Receivables: receivableService };
                    const result = services[module].restoreDeleted(id);
                    if (!result.ok) {
                      notify(result.errors.form || "Unable to restore record.");
                      return false;
                    }
                    setChecks(getCheckRecords());
                    setPayables(getPayableRecords());
                    setReceivables(getReceivableRecords());
                  }
                  notify("Record restored to Archive Records.");
                  return true;
                } catch {
                  notify("Unable to restore record. Please try again.");
                  return false;
                }
              }}
              onDelete={(module, id) => setPendingDeletion({ module, id })}
            />
          )}
          {page === "activity" && <ActivityLogs />}
          {page === "profile" && <Profile notify={notify} />}
        </main>
        <footer className="mx-5 flex flex-col gap-2 border-t border-[#d0e3ef] py-6 text-[11px] text-[#808080] sm:flex-row sm:items-center sm:justify-between md:mx-8 lg:mx-10">
          <span>OASIS Office Management System · Independent prototype</span>
          <span>Authorized access only</span>
        </footer>
      </div>

      <dialog
        ref={deletionDialogRef}
        aria-labelledby="permanent-delete-title"
        aria-describedby="permanent-delete-description"
        onCancel={() => setPendingDeletion(null)}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-[#d0e3ef] bg-white p-6 text-[#16344d] shadow-2xl backdrop:bg-black/40"
      >
        <h2 id="permanent-delete-title" className="text-lg font-semibold">Confirm deletion</h2>
        <p id="permanent-delete-description" className="mt-3 text-sm text-[#737373]">
          Are you sure you want to permanently delete this record? This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" autoFocus className="secondary-btn" onClick={() => setPendingDeletion(null)}>Cancel</button>
          <button type="button" className="flex items-center gap-2 rounded bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800" onClick={confirmPermanentDeletion}>
            <Trash2 size={14} aria-hidden="true" /> Delete permanently
          </button>
        </div>
      </dialog>
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
    </HeaderBackProvider>
  );
}

const officeHour = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  hourCycle: "h23",
});

function ArchivedRecords({ checks, payables, receivables, employees, onRestore, onDelete, deleted = false, deletedFinancialRecords = [] }: {
  checks: CheckRecord[];
  payables: PayableViewModel[];
  receivables: ReceivableViewModel[];
  employees: Employee[];
  onRestore?: (module: ArchiveModule, id: number) => boolean;
  onDelete?: (module: ArchiveModule, id: number) => void;
  deleted?: boolean;
  deletedFinancialRecords?: { key: string; id: number; module: ArchiveModule; reference: string; name: string }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const records = [
    ...deletedFinancialRecords,
    ...checks.filter((record) => record.archivedAt).map((record) => ({
      key: `check-${record.id}`, id: record.id, module: "Checks" as const, reference: record.checkNumber, name: record.payeeName,
    })),
    ...payables.filter((record) => record.archivedAt).map((record) => ({
      key: `payable-${record.id}`, id: record.id, module: "Payables" as const, reference: record.invoiceNumber, name: record.payeeName,
    })),
    ...receivables.filter((record) => record.archivedAt).map((record) => ({
      key: `receivable-${record.id}`, id: record.id, module: "Receivables" as const, reference: record.invoiceNumber, name: record.customerName,
    })),
    ...employees.filter((record) => record.archived).map((record) => ({
      key: `employee-${record.id}`, id: record.id, module: "Employees" as const, reference: record.number, name: record.name,
    })),
  ];
  const selectedRecords = records.filter((record) => selected.includes(record.key));
  const allSelected = records.length > 0 && selectedRecords.length === records.length;
  const restoreRecords = (targets: typeof records) => {
    const restoredKeys = new Set(
      targets.filter((record) => onRestore?.(record.module, record.id)).map((record) => record.key),
    );
    setSelected((keys) => keys.filter((key) => !restoredKeys.has(key)));
  };
  return (
    <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 border-b border-[#d0e3ef] p-4">
          <button type="button" className="secondary-btn" disabled={!records.length} onClick={() => setSelected(allSelected ? [] : records.map((record) => record.key))}>
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <span className="text-xs text-[#737373]">{selectedRecords.length} selected</span>
          {selectedRecords.length > 0 && (
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" className="secondary-btn" onClick={() => restoreRecords(selectedRecords)}>
                <RotateCcw size={15} aria-hidden="true" /> Restore selected
              </button>
              <button type="button" className="secondary-btn" onClick={() => restoreRecords(records)}>
                <RotateCcw size={15} aria-hidden="true" /> Restore all
              </button>
            </div>
          )}
        </div>
      {records.length ? (
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Module</th><th>Reference</th><th>Name</th><th className="w-16"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.key}
                  aria-selected={selected.includes(record.key)}
                  tabIndex={0}
                  className={`cursor-pointer ${selected.includes(record.key) ? "bg-[#d7eef9] hover:bg-[#d7eef9]" : ""}`}
                  onClick={() => setSelected((keys) => keys.includes(record.key) ? keys.filter((key) => key !== record.key) : [...keys, record.key])}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      setSelected((keys) => keys.includes(record.key) ? keys.filter((key) => key !== record.key) : [...keys, record.key]);
                    }
                  }}
                >
                  <td>{record.module}</td><td>{record.reference}</td><td>{record.name}</td>
                  <td className="w-16 text-right" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      aria-label={`Actions for ${record.module} ${record.reference}`}
                      popoverTarget={`archive-actions-${record.key}`}
                      className="ml-auto grid size-8 place-items-center rounded hover:bg-[#e7f3fb]"
                      onClick={(event) => {
                        const menu = document.getElementById(`archive-actions-${record.key}`);
                        if (!menu) return;
                        const { top, bottom, right } = event.currentTarget.getBoundingClientRect();
                        const fitsBelow = bottom + 96 <= window.innerHeight;
                        menu.style.right = `${Math.max(8, window.innerWidth - right)}px`;
                        menu.style.top = fitsBelow ? `${bottom + 4}px` : "auto";
                        menu.style.bottom = fitsBelow ? "auto" : `${window.innerHeight - top + 4}px`;
                      }}
                    ><MoreHorizontal size={17} aria-hidden="true" /></button>
                    <div id={`archive-actions-${record.key}`} popover="auto" className="fixed inset-auto m-0 w-44 rounded border border-[#d0e3ef] bg-white p-1 shadow-xl">
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]" onClick={(event) => {
                        event.currentTarget.parentElement?.hidePopover();
                        if (onRestore?.(record.module, record.id)) {
                          setSelected((keys) => keys.filter((key) => key !== record.key));
                        }
                      }}><RotateCcw size={14} aria-hidden="true" /> Restore</button>
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-700 hover:bg-red-50" onClick={(event) => {
                        event.currentTarget.parentElement?.hidePopover();
                        onDelete?.(record.module, record.id);
                      }}><Trash2 size={14} aria-hidden="true" /> Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p-6 text-sm text-[#737373]">{deleted ? "No deleted records." : "No archived records."}</p>}
    </section>
  );
}

function getDashboardGreeting() {
  const hour = Number(officeHour.format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardGreeting() {
  const [greeting, setGreeting] = useState(getDashboardGreeting);

  useEffect(() => {
    const timer = window.setInterval(() => setGreeting(getDashboardGreeting()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      {greeting}, {CURRENT_USER.name.split(" ")[0]}
    </>
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
          {page === "dashboard" ? <DashboardGreeting /> : meta.title}
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
            icon: Wallet,
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
  sortDirection,
  onToggleSort,
}: {
  query: string;
  setQuery: (x: string) => void;
  status: string;
  setStatus: (x: string) => void;
  statuses: string[];
  placeholder: string;
  exportData: () => void;
  sortDirection: "asc" | "desc";
  onToggleSort: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#d0e3ef] p-4 md:flex-row md:items-center">
      <label className="relative min-w-0 flex-1 md:max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input pl-10 pr-10"
          placeholder={placeholder}
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-[#777] hover:bg-[#e7f3fb] hover:text-[#222] focus-visible:outline-2 focus-visible:outline-[#1f6ea6]"
            onClick={(e) => {
              setQuery("");
              e.currentTarget.parentElement?.querySelector("input")?.focus();
            }}
          >
            <X size={16} />
          </button>
        )}
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
      <button
        type="button"
        onClick={onToggleSort}
        className="secondary-btn"
        aria-label="Sort employees by surname alphabetically"
      >
        <ArrowUpDown size={15} /> {sortDirection === "asc" ? "A-Z" : "Z-A"}
      </button>
    </div>
  );
}

function EmployeeRegister({
  data,
  onAdd,
  onView,
  onEdit,
}: {
  data: Employee[];
  onAdd: () => void;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const filtered = data.filter(
    (x) =>
      `${x.number} ${x.name} ${x.department}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === "All statuses" || getEmploymentStatus(x) === status),
  ).sort((a, b) =>
    sortDirection === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
  );
  const summaryStatuses = [
    { label: "Regular", icon: UserCheck },
    { label: "Probationary", icon: Clock3 },
    { label: "Contractual", icon: Users },
  ] as const;
  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden">
      <SummaryStatCards
        items={[
          {
            label: "Total Employees",
            value: data.length,
            icon: Wallet,
            onClick: () => setStatus("All statuses"),
          },
          ...summaryStatuses.map(({ label, icon }) => ({
            label,
            value: data.filter((employee) => getEmploymentStatus(employee) === label).length,
            icon,
            onClick: () => setStatus(label),
          })),
        ]}
      />
      <section className="panel max-w-full overflow-hidden">
      <PanelTitle
        title="Employee directory"
        subtitle={`${filtered.length} of ${data.length} employees · ${sortDirection === "asc" ? "A–Z" : "Z–A"} by surname`}
      />
      <RegisterTools
        query={query}
        setQuery={setQuery}
        status={status}
        setStatus={setStatus}
        statuses={[...employmentStatuses]}
        placeholder="Search employee no., name, or department…"
        exportData={() => exportCsv("employee-alphalist.csv", employeeDirectoryRows(filtered))}
        sortDirection={sortDirection}
        onToggleSort={() => setSortDirection((direction) => direction === "asc" ? "desc" : "asc")}
      />
      {filtered.length ? (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Full Name</th>
                <th>ID No.</th>
                <th>Department</th>
                <th>Position</th>
                <th>Date hired</th>
                <th>Employment Status</th>
                <th>Cash Advances</th>
                <th>Requirement Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x) => {
                const employmentStatus = getEmploymentStatus(x);
                return (
                  <tr key={x.id} className="cursor-pointer" onClick={() => onView(x.id)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e7f3fb] text-[10px] font-bold">
                          {x.initials}
                        </span>
                        <span>
                          <button type="button" className="block text-left text-xs font-bold hover:underline">
                            {x.name}
                          </button>
                          <span className="mt-1 block text-[10px] text-[#888]">{x.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="font-medium text-[#1f6ea6]">{x.number}</td>
                    <td>{x.department}</td>
                    <td>{x.position}</td>
                    <td>{formatDate(x.dateHired)}</td>
                    <td>
                      {employmentStatus ? <Status value={employmentStatus} /> : "—"}
                    </td>
                    <td>{displayEmployeeCashAdvances(x)}</td>
                    <td>
                      <Status value={x.requirementStatus ?? "Incomplete"} />
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <EmployeeActions employee={x} onEdit={() => onEdit(x.id)} />
                    </td>
                  </tr>
                );
              })}
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

function EmployeeActions({ employee, onEdit }: { employee: Employee; onEdit: () => void }) {
  const menuId = `employee-actions-${employee.id}`;

  return (
    <>
      <button
        type="button"
        aria-label={`Actions for ${employee.name}`}
        popoverTarget={menuId}
        className="table-action"
        onClick={(event) => {
          const menu = document.getElementById(menuId);
          if (!menu) return;
          const { top, bottom, right } = event.currentTarget.getBoundingClientRect();
          const fitsBelow = bottom + 52 <= window.innerHeight;
          menu.style.right = `${Math.max(8, window.innerWidth - right)}px`;
          menu.style.top = fitsBelow ? `${bottom + 4}px` : "auto";
          menu.style.bottom = fitsBelow ? "auto" : `${window.innerHeight - top + 4}px`;
        }}
      >
        <MoreHorizontal size={17} aria-hidden="true" />
      </button>
      <div id={menuId} popover="auto" className="fixed inset-auto m-0 w-36 border border-[#d0e3ef] bg-white p-1 shadow-xl">
        <button type="button" onClick={onEdit} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]">
          <Pencil size={14} aria-hidden="true" /> Edit
        </button>
      </div>
    </>
  );
}

function EmployeeRecordPanel({
  view,
  employees,
  close,
  onDelete,
  saveEmployee,
}: {
  view: EmployeeView;
  employees: Employee[];
  close: () => void;
  onDelete: (id: number) => void;
  saveEmployee: (record: Omit<Employee, "id" | "number">) => void;
}) {
  const record = view.mode === "create" ? undefined : employees.find((employee) => employee.id === view.id);
  const [contactDigits, setContactDigits] = useState(() => getContactDigits(record?.contactNumber ?? ""));
  if (view.mode !== "create" && !record) return null;

  if (view.mode === "details") {
    return record ? (
      <section className="panel">
        <PanelTitle
          title={record.name}
          subtitle={record.number}
          onBack={close}
        />
        <EmployeeDetails record={record} onDelete={() => onDelete(record.id)} close={close} />
      </section>
    ) : null;
  }

  const currentEmploymentStatus = getEmploymentStatus(record);
  const requiresEmploymentStatus = !record || Boolean(currentEmploymentStatus);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = (name: string) => String(fd.get(name) ?? "").trim();
    const fullName = text("party");
    const pieces = fullName.split(/\s+/);
    const employmentStatus = employmentStatuses.find((status) => status === text("employmentStatus"));
    if (!fullName || (requiresEmploymentStatus && !employmentStatus)) return;
    const enteredAmount = text("cashAdvanceAmount");
    const cashAdvanceAmount = enteredAmount ? Number(enteredAmount) : undefined;
    if (cashAdvanceAmount !== undefined && (!Number.isFinite(cashAdvanceAmount) || cashAdvanceAmount <= 0)) return;
    if (contactDigits && !contactSubscriberRegex.test(contactDigits)) return;
    const status =
      record && currentEmploymentStatus === employmentStatus
        ? record.status
        : employmentStatus === "Resigned" || employmentStatus === "Terminated"
          ? "Inactive"
          : "Active";
    const personalAndContractFields = Object.fromEntries(
      employeeFieldGroups.flatMap(({ fields }) =>
        fields.map(({ name }) => [name, text(name)]),
      ),
    );
    const requirements = employeeRequirements.filter((item) => fd.getAll("requirements").includes(item));
    const checkedLabRequirements = laboratoryRequirements.filter((item) =>
      fd.getAll("laboratoryRequirements").includes(item),
    );
    const requirementAttachments: Partial<Record<string, File>> = {};
    for (const item of [...requirements, ...checkedLabRequirements]) {
      const file = fd.get(`attachment:${item}`);
      const attachment = file instanceof File && file.name ? file : record?.requirementAttachments?.[item];
      if (attachment) requirementAttachments[item] = attachment;
    }

    saveEmployee({
      ...personalAndContractFields,
      contactNumber: contactDigits ? contactCountryCode + contactDigits : "",
      hasCashAdvances: cashAdvanceAmount !== undefined,
      cashAdvanceAmount,
      name: fullName,
      initials: record?.name === fullName ? record.initials : pieces
        .map((x) => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      department: text("department"),
      position: text("position"),
      dateHired: text("date"),
      email: text("email"),
      employmentStatus,
      status,
      requirements,
      laboratoryRequirements: checkedLabRequirements,
      requirementAttachments,
      requirementStatus: text("requirementStatus") === "Complete" ? "Complete" : "Incomplete",
      requirementFollowUpDate: text("requirementFollowUpDate") || undefined,
    });
  };
  return (
    <section className="panel">
      <PanelTitle
        title={record ? "Edit employee" : "Add employee"}
        subtitle="Employee information and requirements"
        onBack={close}
      />
      <form onSubmit={onSubmit} className="p-5 md:p-6">
        <div className="space-y-6">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">Employee information</legend>
            <label className="block">
              <span className="field-label">ID No.</span>
              <input readOnly value={record?.number ?? nextEmployeeNumber(employees)} className="input mt-2 bg-gray-50" />
            </label>
            <FormField label="Full Name (Surname, First name)" name="party" defaultValue={record?.name} required />
            <FormField label="Email Address" name="email" defaultValue={record?.email} type="email" required />
            <FormField label="Date Hired" name="date" defaultValue={record?.dateHired} type="date" required />
            <FormField label="Department" name="department" defaultValue={record?.department} required />
            <FormField label="Position" name="position" defaultValue={record?.position} required />
            <label className="block">
              <span className="field-label">
                Employment Status {requiresEmploymentStatus && <span className="text-red-700">*</span>}
              </span>
              <select
                name="employmentStatus"
                required={requiresEmploymentStatus}
                defaultValue={currentEmploymentStatus ?? ""}
                className="input select-input mt-2"
              >
                <option value="" disabled={requiresEmploymentStatus}>Select employment status</option>
                {employmentStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <FormField
              label="Cash Advance Amount (PHP)"
              name="cashAdvanceAmount"
              type="number"
              min={0.01}
              defaultValue={record?.cashAdvanceAmount}
            />
          </fieldset>
          {employeeFieldGroups.map(({ title, fields }) => (
            <fieldset key={title} className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">{title}</legend>
              {fields.map((field) => {
                const { name, label } = field;
                if (name === "contactNumber") {
                  return (
                    <label key={name} className="block">
                      <span className="field-label">{label}</span>
                      <div className="relative mt-2">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-[#526a7c]">{contactCountryCode}</span>
                        <input
                          type="tel"
                          name={name}
                          inputMode="numeric"
                          autoComplete="tel-national"
                          pattern={contactSubscriberPattern}
                          title="Enter 10 digits starting with 9."
                          value={contactDigits}
                          onChange={(event) => {
                            const digits = getContactDigits(event.currentTarget.value);
                            if (digits === "" || digits.startsWith("9")) {
                              setContactDigits(digits.slice(0, contactSubscriberLength));
                            }
                          }}
                          className="input pl-11"
                        />
                      </div>
                    </label>
                  );
                }
                if ("options" in field) {
                  return (
                    <label key={name} className="block">
                      <span className="field-label">{label}</span>
                      <select name={name} defaultValue={record?.[name]} className="input select-input mt-2">
                        <option value="">Select {label.toLowerCase()}</option>
                        {field.options.map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </label>
                  );
                }
                if ("type" in field && field.type === "textarea") {
                  return (
                    <label key={name} className="block sm:col-span-2">
                      <span className="field-label">{label}</span>
                      <textarea name={name} defaultValue={record?.[name]} rows={3} className="input mt-2 h-auto py-2" />
                    </label>
                  );
                }
                return (
                  <FormField
                    key={name}
                    label={label}
                    name={name}
                    defaultValue={record?.[name]}
                    type={"type" in field ? field.type : undefined}
                    min={name === "yearsOfService" ? 0 : undefined}
                  />
                );
              })}
            </fieldset>
          ))}
          <EmployeeRequirementChecklist title="Requirements" name="requirements" items={employeeRequirements} initialChecked={record?.requirements} />
          <EmployeeRequirementChecklist title="Laboratory Requirements" name="laboratoryRequirements" items={laboratoryRequirements} initialChecked={record?.laboratoryRequirements} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Requirement Status</span>
              <select name="requirementStatus" className="input select-input mt-2" defaultValue={record?.requirementStatus ?? "Incomplete"}>
                <option>Incomplete</option>
                <option>Complete</option>
              </select>
            </label>
            <FormField
              label="Requirements follow-up date"
              name="requirementFollowUpDate"
              type="date"
              defaultValue={record?.requirementFollowUpDate}
            />
          </div>
        </div>
        <div className="mt-7 flex justify-end gap-2 border-t border-[#e1eef6] pt-5">
          <button className="primary-btn">{record ? "Save changes" : "Save record"}</button>
        </div>
      </form>
    </section>
  );
}

function EmployeeRequirementChecklist({
  title,
  name,
  items,
  initialChecked = [],
}: {
  title: string;
  name: string;
  items: string[];
  initialChecked?: string[];
}) {
  const [checked, setChecked] = useState(initialChecked);
  return (
    <fieldset className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">{title}</legend>
      {items.map((item) => (
        <div key={item} className="min-w-0 border border-[#d0e3ef] p-3">
          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              name={name}
              value={item}
              checked={checked.includes(item)}
              onChange={(event) => {
                const isChecked = event.currentTarget.checked;
                setChecked((items) => isChecked ? [...items, item] : items.filter((entry) => entry !== item));
              }}
              className="size-4 shrink-0 accent-[#1f6ea6]"
            />
            {item}
          </label>
          {checked.includes(item) && (
            <label className="mt-3 block">
              <span className="field-label">{item} attachment</span>
              <input
                type="file"
                name={`attachment:${item}`}
                className="input mt-2 h-auto w-full py-2 file:mr-2 file:bg-[#e7f3fb] file:px-2 file:py-1 file:font-medium file:text-[#1f6ea6]"
              />
            </label>
          )}
        </div>
      ))}
    </fieldset>
  );
}

function EmployeeDetails({
  record,
  onDelete,
  close,
}: {
  record: Employee;
  onDelete: () => void;
  close: () => void;
}) {
  const fields = [
    ["ID No.", record.number],
    ["Full Name", record.name],
    ["Department", record.department],
    ["Position", record.position],
    ["Date hired", formatDate(record.dateHired)],
    ["Email address", record.email],
    ["Employment Status", getEmploymentStatus(record)],
    ["Cash Advances", displayEmployeeCashAdvances(record)],
    ...employeeFieldGroups.flatMap(({ fields }) =>
      fields.map((field) => {
        const value = record[field.name];
        return [field.label, value && "type" in field && field.type === "date" ? formatDate(value) : value];
      }),
    ),
    ["Requirement Status", record.requirementStatus ?? "Incomplete"],
    ["Requirements follow-up date", record.requirementFollowUpDate && formatDate(record.requirementFollowUpDate)],
    ...(record.archived ? [["Directory Status", "Archived"]] : []),
  ];
  return (
    <div className="p-5 md:p-6">
      <dl className="grid gap-px bg-[#d0e3ef] sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="bg-white p-4">
            <dt className="field-label">{label}</dt>
            <dd className="mt-1.5 wrap-break-word whitespace-pre-wrap text-sm font-medium">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      {[
        { title: "Requirements", items: record.requirements },
        { title: "Laboratory Requirements", items: record.laboratoryRequirements },
      ].map(({ title, items }) => (
        <section key={title} className="mt-5 border border-[#d0e3ef]">
          <h3 className="border-b border-[#d0e3ef] bg-[#e7f3fb] px-4 py-3 text-xs font-bold uppercase tracking-[.1em]">{title}</h3>
          {items?.length ? (
            <ul className="divide-y divide-[#e1eef6]">
              {items.map((item) => {
                const file = record.requirementAttachments?.[item];
                return (
                  <li key={item} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="font-medium">{item}</span>
                    {file ? (
                      <button
                        type="button"
                        className="secondary-btn max-w-full"
                        title={file.name}
                        onClick={() => {
                          const url = URL.createObjectURL(file);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = file.name;
                          link.click();
                          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        <Download size={15} className="shrink-0" />
                        <span className="truncate">{file.name}</span>
                      </button>
                    ) : <span className="text-[11px] text-[#777]">No attachment</span>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="px-4 py-3 text-[11px] text-[#777]">No requirements checked.</p>}
        </section>
      ))}
      <div className="mt-7 flex flex-wrap justify-between gap-2 border-t border-[#e1eef6] pt-5">
        <button onClick={onDelete} className="secondary-btn text-red-700">
          Delete record
        </button>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="secondary-btn">
            <Printer size={15} /> Print
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
      exportRows: employeeDirectoryRows(employees),
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
      "Alpha List",
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
  onBack,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  onBack?: () => void;
}) {
  useHeaderBack(onBack);
  return (
    <div className="flex min-h-[76px] flex-col gap-3 border-b border-[#d0e3ef] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-sm font-bold tracking-[-.01em]">{title}</h2>
        <p className="mt-1 text-[11px] text-[#888]">{subtitle}</p>
      </div>
      {action && (
        <div className="flex items-start justify-end gap-2">
          {action}
        </div>
      )}
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
  min,
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
        min={min}
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
