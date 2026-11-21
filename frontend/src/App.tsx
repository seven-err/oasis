import { PasswordInput } from "./components/PasswordInput";
import { apiRequest, canAccessPage, getSession, initialPage, logout, pagePaths, setSession } from "./auth";
import { loadActivityLogs, type ActivityLog } from "./activityLogs";
import { readBusinessJson, writeBusinessJson } from "./businessStorage";
import { BusinessSyncStatus } from "./components/BusinessSyncStatus";
import { StatusBadge as Status } from "./components/StatusBadge";
import { UserManagement } from "./components/UserManagement";
import { DateInput, RequirementStatusSelect } from "@/components/FormPopovers";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowUpDown,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Wallet,
  Download,
  FileCheck2,
  House,
  FileText,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  UserRound,
  UserCheck,
  WalletCards,
  X,
} from "lucide-react";
import oasisLogo from "./assets/report-logo-transparent.png";
import {
  getOfficeNotifications,
  NotificationInbox,
  type OfficeNotification,
} from "@/components/NotificationInbox";
import { todayIsoDate } from "@/modules/payables/utils";
import { CURRENT_USER } from "@/modules/checks/constants";
import { SummaryStatCards } from "@/components/SummaryStatCards";
import { ActiveFilters } from "@/components/ActiveFilters";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { deletionDaysLeft, isDeletionExpired } from "@/components/deletedRecordRetention";
import { usePrintReport } from "@/components/usePrintReport";
import { HeaderBackButton, HeaderBackProvider, useHeaderBack } from "@/components/HeaderBack";
import { useViewHistory } from "@/hooks/useViewHistory";
import { confirmLeavingUnsavedForm, useUnsavedForm } from "@/hooks/useUnsavedForm";
import { fieldError, focusFirstError } from "@/components/formValidation";
import { recordRowClick } from "@/components/recordRowClick";
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
  | "profile"
  | "password"
  | "settings";

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
  deletedAt?: string | null;
  employmentStatus?: (typeof employmentStatuses)[number] | "Cash Advances";
  hasCashAdvances?: boolean;
  cashAdvanceAmount?: number;
  requirements?: string[];
  laboratoryRequirements?: string[];
  requirementAttachments?: Partial<Record<string, File>>;
  requirementStatus?: "Complete" | "Incomplete";
  requirementFollowUpDate?: string;
} & Partial<Record<EmployeeField, string>>;

function hasAllEmployeeRequirements(employee?: Pick<Employee, "requirements" | "laboratoryRequirements">) {
  return employeeRequirements.every((item) => employee?.requirements?.includes(item)) &&
    laboratoryRequirements.every((item) => employee?.laboratoryRequirements?.includes(item));
}

function getRequirementStatus(employee: Employee): "Complete" | "Incomplete" {
  return employee.requirementStatus === "Complete" && hasAllEmployeeRequirements(employee)
    ? "Complete"
    : "Incomplete";
}

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
    "Full Name": employee.name,
    Department: employee.department,
    Position: employee.position,
    "Date Hired": employee.dateHired,
    "Email Address": employee.email,
    "Employment Status": getEmploymentStatus(employee) ?? "",
    "Cash Advances": hasEmployeeCashAdvances(employee) ? "Yes" : "No",
    "Cash Advance Amount (PHP)": employee.cashAdvanceAmount ?? "",
    "Requirement Status": getRequirementStatus(employee),
  }));
}

// People listed under two departments on the org chart are merged into one record.
const initialEmployees: Employee[] = (
  [
    ["Cadorna, Ronnie", "Administration", "Administrative Manager"],
    ["Zamora, Theodore M.", "Drug Test / Laboratory", "Head of Laboratory / Pathologist"],
    ["Tahadlangit, Mariane Sarah L.", "Drug Test / Laboratory", "Head of Drug Analyst / Chief Medical Technologist"],
    ["Tinambunan, Cheerden Lhy T.", "Drug Test / Laboratory", "Drug Analyst / Medical Technologist"],
    ["Fernan, Wilmer J.", "Drug Test / Administration", "Authorized Specimen Collector / Purchasing Officer"],
    ["Lepon, Lea", "Drug Test", "Authorized Specimen Collector / Biometric Technician"],
    ["Montana, Vanessa M.", "Drug Test / Laboratory", "Authorized Specimen Collector / Laboratory Aide"],
    ["Cadorna, Maria Asuncion H.", "Administration", "HR / Marketing"],
    ["Lepon, Richard M.", "Administration", "Head Accounting Officer"],
    ["Nene, Genevieve", "Administration", "Receptionist"],
    ["Moya, Clinton A.", "Administration", "Receptionist"],
    ["Atibay, Cristopher P.", "Administration", "Cashier"],
    ["Japal, Dennis", "Administration", "Information / Maintenance Personnel"],
    ["Malait, Lester", "Administration", "Information / Maintenance Personnel"],
    ["Espino, Gaudencio", "Radiology", "Radiologist"],
    ["Abancio, Cely Ann", "Radiology", "Sonologist - Ultrasound"],
    ["Moraga, Rhea C.", "Radiology", "Chief Radiologic Technologist"],
    ["Branzuela, Junrey L.", "Radiology", "Radiologic Aide"],
    ["Albano, Lucille G.", "Clinic Doctors", "OB-GYNE"],
    ["Albano, Samuel P.", "Clinic Doctors", "Ophthalmologist"],
    ["Aranas-Del Rosario, Norina", "Clinic Doctors", "OB-GYNE"],
    ["Destura, Kenneth Joel", "Clinic Doctors", "Pediatrician"],
    ["Florita, Charmaine Gee", "Clinic Doctors", "Family Medicine"],
    ["Hernandez, Daniel Philip", "Clinic Doctors", "IM / Cardiologist"],
    ["Medina, Daniel", "Clinic Doctors", "General Physician"],
    ["Rivera, Caryll Ann P.", "Clinic Doctors", "General Physician"],
    ["Venturillo, Myla", "Clinic Doctors", "Optometrist"],
  ] as const
).map(([name, department, position], i) => {
  const [surname, given] = name.split(", ");
  return {
    id: i + 1,
    number: `EMP-${String(i + 1).padStart(5, "0")}`,
    name,
    initials: (given[0] + surname[0]).toUpperCase(),
    department,
    position,
    dateHired: "",
    email: "",
    status: "Active",
  };
});

// Bump the version whenever initialEmployees changes, or browsers keep their saved old list.
const EMPLOYEE_STORAGE_KEY = "oasis.employees.v2";

export function loadEmployeeRecords(): { employees: Employee[]; deletedEmployees: Employee[] } {
  try {
    const saved = readBusinessJson<{ employees: Employee[]; deletedEmployees: Employee[] } | null>(EMPLOYEE_STORAGE_KEY, null);
    if (saved && Array.isArray(saved.employees) && Array.isArray(saved.deletedEmployees)) {
      return {
        employees: saved.employees,
        deletedEmployees: saved.deletedEmployees.map((record: Employee) => ({
          ...record,
          deletedAt: record.deletedAt && Number.isFinite(Date.parse(record.deletedAt))
            ? record.deletedAt : new Date().toISOString(),
        })),
      };
    }
  } catch {
    // Use the initial directory when storage is unavailable or invalid.
  }
  return { employees: initialEmployees, deletedEmployees: [] };
}

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});
const formatDate = (value: string) =>
  !value ? "—" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
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
  settings: {
    eyebrow: "Administration",
    title: "System Settings",
    description: "Manage role permissions and module access.",
  },
  password: {
    eyebrow: "Account",
    title: "Change Password",
    description: "Update your password to keep your account secure.",
  },
};

const nav = [
  {
    section: "Workspace",
    items: [
      { page: "dashboard" as Page, label: "Home", icon: House },
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
  const isHr = getSession()?.user.role === "hr";
  const landingPage = isHr && canAccessPage("employees") ? "employees" : "dashboard";
  const resolvePage = (requested: Page) =>
    requested !== "dashboard" && canAccessPage(requested) ? requested : landingPage;
  const [page, setPage] = useState<Page>(() => {
    const requested = (window.__OASIS_PAGE__ ?? initialPage(window.location.pathname)) as Page;
    return resolvePage(requested);
  });
  const initials = CURRENT_USER.name.split(" ").filter(Boolean).map((name) => name[0]).slice(0, 2).join("");
  const visibleNav = nav.map((group) => ({ ...group, items: group.items.filter((item) => (!isHr || item.page === "employees") && canAccessPage(item.page)) })).filter((group) => group.items.length);
  useEffect(() => {
    const onPopState = () => {
      const requested = initialPage(window.location.pathname) as Page;
      setPage(resolvePage(requested));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
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
  const [checks, setChecks] = useState<CheckRecord[]>(() => canAccessPage("checks") ? getCheckRecords() : []);
  const [payables, setPayables] = useState<PayableViewModel[]>(() => canAccessPage("payables") ? getPayableRecords() : []);
  const [receivables, setReceivables] = useState<ReceivableViewModel[]>(() =>
    canAccessPage("receivables") ? getReceivableRecords() : [],
  );
  const [employees, setEmployees] = useState(() => canAccessPage("employees") ? loadEmployeeRecords().employees : []);
  const [deletedEmployees, setDeletedEmployees] = useState(() => canAccessPage("employees") ? loadEmployeeRecords().deletedEmployees : []);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [, setRetentionVersion] = useState(0);
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
  useEffect(() => {
    const refresh = () => {
      if (canAccessPage("checks")) setChecks(getCheckRecords());
      if (canAccessPage("payables")) setPayables(getPayableRecords());
      if (canAccessPage("receivables")) setReceivables(getReceivableRecords());
      if (canAccessPage("employees")) {
        const directory = loadEmployeeRecords();
        setEmployees(directory.employees);
        setDeletedEmployees(directory.deletedEmployees);
      }
    };
    window.addEventListener("oasis:business-updated", refresh);
    return () => window.removeEventListener("oasis:business-updated", refresh);
  }, []);
  useEffect(() => {
    if (!canAccessPage("employees")) return;
    try {
      writeBusinessJson(EMPLOYEE_STORAGE_KEY, { employees, deletedEmployees });
    } catch {
      setToast("Employee changes have not been saved. Keep this page open and retry.");
    }
  }, [employees, deletedEmployees]);
  const [pendingDeletion, setPendingDeletion] = useState<{ module: ArchiveModule; id: number }[] | null>(null);
  const deletionDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const cleanUp = () => {
      const now = Date.now();
      try {
        if (canAccessPage("checks")) checkService.purgeExpiredDeleted(now);
        if (canAccessPage("payables")) payableService.purgeExpiredDeleted(now);
        if (canAccessPage("receivables")) receivableService.purgeExpiredDeleted(now);
        setRetentionVersion((version) => version + 1);
        if (canAccessPage("employees")) setDeletedEmployees((records) => {
          const retained = records.filter((record) => !isDeletionExpired(record.deletedAt, now));
          return retained.length === records.length ? records : retained;
        });
      } catch {
        setToast("Automatic cleanup could not be saved. Please retry by reopening the app.");
      }
    };
    cleanUp();
    const timer = window.setInterval(cleanUp, 60_000);
    window.addEventListener("focus", cleanUp);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", cleanUp);
    };
  }, []);

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
    if (next === "dashboard") next = landingPage;
    if (!canAccessPage(next)) {
      setToast("You do not have access to this area.");
      return;
    }
    if ((next !== page || notification) && !confirmLeavingUnsavedForm()) return;
    if (next !== page) window.history.pushState({ ...window.history.state, oasisPage: next }, "", pagePaths[next]);
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
    const failed: typeof pendingDeletion = [];
    for (const target of pendingDeletion) {
      const { module, id } = target;
      try {
        if (module === "Employees") {
          setDeletedEmployees((list) => list.filter((record) => record.id !== id));
        } else {
          const services = { Checks: checkService, Payables: payableService, Receivables: receivableService };
          const result = services[module].deletePermanently(id);
          if (!result.ok) failed.push(target);
        }
      } catch {
        failed.push(target);
      }
    }
    setRetentionVersion((version) => version + 1);
    setPendingDeletion(failed.length ? failed : null);
    notify(failed.length ? `${failed.length} record(s) could not be deleted. Please try again.` : "Records permanently deleted.");
  };

  const openEmployeeView = (view: EmployeeView | null) => {
    if (view === null) resetEmployeeView(null);
    else setEmployeeView(view);
  };

  const deleteEmployee = (id: number) => {
    const record = employees.find((employee) => employee.id === id);
    if (record) setEmployeeToDelete(record);
  };

  const confirmEmployeeDeletion = () => {
    if (!employeeToDelete) return;
    const record = employees.find((employee) => employee.id === employeeToDelete.id);
    if (!record) {
      setEmployeeToDelete(null);
      notify("Employee record not found.");
      return;
    }
    setDeletedEmployees((list) => [...list.filter((employee) => employee.id !== record.id), { ...record, deletedAt: new Date().toISOString() }]);
    setEmployees((list) => list.filter((employee) => employee.id !== record.id));
    setEmployeeToDelete(null);
    notify("Employee moved to Deleted Records.");
    openEmployeeView(null);
  };

  const requestAdd = () => {
    if (!confirmLeavingUnsavedForm()) return;
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
      <BusinessSyncStatus />
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
        className={`oasis-sidebar fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-[#c5dced] bg-[#d7eef9] text-[#16344d] ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} ${compactMenu ? "lg:w-[70px]" : "lg:w-[248px]"} w-[248px] lg:translate-x-0`}
      >
        <div className={`flex h-[76px] shrink-0 items-center border-b border-[#c5dced] pl-[9px] pr-3 ${compactMenu ? "lg:pr-1" : ""}`}>
          <button
            aria-label="OASIS home"
            onClick={() => go("dashboard")}
            className="flex min-w-0 items-center overflow-hidden"
          >
            <span data-sidebar-logo className={`block shrink-0 overflow-hidden lg:-ml-2 ${compactMenu ? "w-56 lg:w-[60px]" : "w-56"}`}>
              <img
                data-loading-logo-target
                src={oasisLogo}
                alt=""
                width={2172}
                height={724}
                className="block h-auto w-56 max-w-none"
              />
            </span>          </button>
          <button
            className="ml-auto shrink-0 text-[#5c7890] hover:text-[#16344d] lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>
        <nav ref={sidebarNavRef} className="relative isolate min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4">
          {selectionTop !== null && (
            <div
              aria-hidden="true"
              className="sidebar-selection pointer-events-none absolute inset-x-3 top-0 h-11 rounded-lg border-l-2 border-[#1f6ea6] bg-[#4da3d9]"
              style={{ transform: `translateY(${selectionTop}px)` }}
            />
          )}
          {visibleNav.map((group) => (
            <div key={group.section} className="mb-5 last:mb-0">
                <p aria-hidden={compactMenu} className="sidebar-copy mb-2 whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-black">
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
                    className={`sidebar-nav-item relative group flex h-11 w-full items-center gap-3 border-l-2 border-transparent px-3 text-left text-[13px] font-medium ${page === itemPage ? "text-white" : "text-black hover:bg-white/70"}`}
                  >
                    <Icon className="shrink-0" size={18} strokeWidth={1.8} />
                    <span aria-hidden={compactMenu} className="sidebar-copy shrink-0 whitespace-nowrap">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div ref={profileMenuRef} className="relative shrink-0 border-t border-[#c5dced] p-3">
          {profileOpen && (
            <div id="sidebar-account-menu" aria-label="Account" className="absolute inset-x-3 bottom-full mb-2 rounded-xl border border-[#d0e3ef] bg-white p-1 text-[#16344d] shadow-xl">
              <button
                onClick={() => go("profile")}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs hover:bg-[#e7f3fb]"
              >
                <UserRound size={15} /> My profile
              </button>
              <button
                onClick={() => {
                  if (!confirmLeavingUnsavedForm()) return;
                  setProfileOpen(false);
                  void logout().catch((error) => notify(error.message));
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
            aria-label={`Account options for ${CURRENT_USER.name}`}
            aria-expanded={profileOpen}
            aria-controls="sidebar-account-menu"
            className="flex w-full items-center gap-3 py-2 pl-[5px] pr-2 text-left hover:bg-white/70"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1f6ea6] text-xs font-bold text-white">
              {initials}
            </span>
              <span aria-hidden={compactMenu} className="sidebar-copy min-w-0 flex-1 whitespace-nowrap">
                <strong className="block truncate text-xs">{CURRENT_USER.name}</strong>
                <span className="text-[10px] text-[#5c7890]">{CURRENT_USER.role}</span>
              </span>
          </button>
        </div>
      </aside>

      <div
        className={`oasis-content min-h-screen min-w-0 ${compactMenu ? "lg:pl-[70px]" : "lg:pl-[248px]"}`}
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
            <HeaderBackButton
              fallback={() => go("dashboard")}
              currentPage={isHr && page === "employees" ? pageMeta.employees.title : undefined}
            />
          )}
          <div className="ml-auto flex items-center gap-1">
            <NotificationInbox
              key={CURRENT_USER.id}
              userId={CURRENT_USER.id}
              items={getOfficeNotifications(checks, payables, receivables, employees, notificationDate).filter((item) => canAccessPage(item.page))}
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
                  {initials}
                </span>
              </button>
            )}
          </div>
        </header>

        <main key={page} className="page-view-enter mx-auto w-full max-w-[1600px] overflow-x-clip px-4 py-6 sm:px-5 sm:py-8 md:px-8 lg:px-10 lg:py-10">
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
                  onDelete={deleteEmployee}
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
                    setDeletedEmployees((list) => [...list, { ...employee, deletedAt: new Date().toISOString() }]);
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
                ...payableService.listDeleted().map((record) => ({ key: `payable-${record.id}`, id: record.id, module: "Payables" as const, reference: record.invoiceNumber, name: record.payeeName, deletedAt: record.deletedAt, details: { ...record } })),
                ...receivableService.listDeleted().map((record) => ({ key: `receivable-${record.id}`, id: record.id, module: "Receivables" as const, reference: record.invoiceNumber, name: record.customerName, deletedAt: record.deletedAt, details: { ...record } })),
              ]}
              deleted
              onRestore={(module, id) => {
                try {
                  if (module === "Employees") {
                    const record = deletedEmployees.find((employee) => employee.id === id);
                    if (!record) return false;
                    setEmployees((list) => [...list, { ...record, deletedAt: null }]);
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
                  notify("Record restored.");
                  return true;
                } catch {
                  notify("Unable to restore record. Please try again.");
                  return false;
                }
              }}
              onDelete={(module, id) => setPendingDeletion([{ module, id }])}
              onDeleteSelected={(records) => setPendingDeletion(records)}
            />
          )}
          {page === "activity" && <ActivityLogs />}
          {page === "profile" && <Profile notify={notify} />}
          {page === "password" && <ChangePassword />}
          {page === "settings" && <SystemSettings onClose={() => go("profile")} />}
        </main>
      </div>

      {employeeToDelete && (
        <DeleteConfirmationDialog
          recordLabel={`Employee ${employeeToDelete.number} — ${employeeToDelete.name}`}
          onCancel={() => setEmployeeToDelete(null)}
          onConfirm={confirmEmployeeDeletion}
        />
      )}
      <dialog
        ref={deletionDialogRef}
        aria-labelledby="permanent-delete-title"
        aria-describedby="permanent-delete-description"
        onCancel={() => setPendingDeletion(null)}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-[#d0e3ef] bg-white p-6 text-[#16344d] shadow-2xl backdrop:bg-black/40"
      >
        <h2 id="permanent-delete-title" className="text-lg font-semibold">Confirm deletion</h2>
        <p id="permanent-delete-description" className="mt-3 text-sm text-[#737373]">
          Are you sure you want to permanently delete {pendingDeletion?.length === 1 ? "this record" : `these ${pendingDeletion?.length ?? 0} records`}? This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" autoFocus className="secondary-btn rounded-lg" onClick={() => setPendingDeletion(null)}>Cancel</button>
          <button type="button" className="flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800" onClick={confirmPermanentDeletion}>
            Confirm
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

export function ArchivedRecords({ checks, payables, receivables, employees, onRestore, onDelete, onDeleteSelected, deleted = false, deletedFinancialRecords = [] }: {
  checks: CheckRecord[];
  payables: PayableViewModel[];
  receivables: ReceivableViewModel[];
  employees: Employee[];
  onRestore?: (module: ArchiveModule, id: number) => boolean;
  onDelete?: (module: ArchiveModule, id: number) => void;
  onDeleteSelected?: (records: { module: ArchiveModule; id: number }[]) => void;
  deleted?: boolean;
  deletedFinancialRecords?: { key: string; id: number; module: ArchiveModule; reference: string; name: string; deletedAt?: string | null; details?: Record<string, unknown> }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const reviewDialogRef = useRef<HTMLDialogElement>(null);
  const records = [
    ...deletedFinancialRecords,
    ...checks.filter((record) => deleted ? record.deletedAt : record.archivedAt).map((record) => ({
      key: `check-${record.id}`, id: record.id, module: "Checks" as const, reference: record.checkNumber, name: record.payeeName, deletedAt: record.deletedAt, details: { ...record },
    })),
    ...payables.filter((record) => deleted ? record.deletedAt : record.archivedAt).map((record) => ({
      key: `payable-${record.id}`, id: record.id, module: "Payables" as const, reference: record.invoiceNumber, name: record.payeeName, deletedAt: record.deletedAt, details: { ...record },
    })),
    ...receivables.filter((record) => deleted ? record.deletedAt : record.archivedAt).map((record) => ({
      key: `receivable-${record.id}`, id: record.id, module: "Receivables" as const, reference: record.invoiceNumber, name: record.customerName, deletedAt: record.deletedAt, details: { ...record },
    })),
    ...employees.filter((record) => deleted || record.archived).map((record) => ({
      key: `employee-${record.id}`, id: record.id, module: "Employees" as const, reference: record.number, name: record.name, deletedAt: record.deletedAt, details: { ...record },
    })),
  ];
  const reviewRecord = records.find((record) => record.key === reviewKey);
  useEffect(() => {
    if (reviewRecord) reviewDialogRef.current?.showModal();
    else reviewDialogRef.current?.close();
  }, [reviewRecord?.key]);
  const activateRecord = (record: typeof records[number]) => {
    if (selectionMode) {
      setSelected((keys) => keys.includes(record.key) ? keys.filter((key) => key !== record.key) : [...keys, record.key]);
    } else {
      setReviewKey(record.key);
    }
  };
  const selectedRecords = records.filter((record) => selected.includes(record.key));
  const allSelected = records.length > 0 && selectedRecords.length === records.length;
  const restoreRecords = (targets: typeof records) => {
    const restoredKeys = new Set(
      targets.filter((record) => onRestore?.(record.module, record.id)).map((record) => record.key),
    );
    setSelected((keys) => keys.filter((key) => !restoredKeys.has(key)));
  };
  return (
    <section className="space-y-4">

      {records.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" className="secondary-btn" aria-pressed={selectionMode} onClick={() => {
            setSelectionMode((active) => !active);
            setSelected([]);
          }}>
            {selectionMode ? "Cancel selection" : "Select"}
          </button>
          {selectionMode && (
            <>
              <button type="button" className="secondary-btn" onClick={() => setSelected(allSelected ? [] : records.map((record) => record.key))}>
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <span className="text-xs text-[#737373]">{selectedRecords.length} selected</span>
            </>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="secondary-btn disabled:cursor-not-allowed disabled:opacity-50" disabled={selectedRecords.length === 0} onClick={() => restoreRecords(selectedRecords)}>
              <RotateCcw size={15} aria-hidden="true" /> Restore
            </button>
            <button type="button" className="secondary-btn text-red-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={selectedRecords.length === 0} onClick={() => {
              if (onDeleteSelected) onDeleteSelected(selectedRecords);
              else selectedRecords.forEach((record) => onDelete?.(record.module, record.id));
            }}>
              <Trash2 size={15} aria-hidden="true" /> Delete
            </button>
          </div>
        </div>
      )}
      {records.length ? (
        <div className="panel overflow-x-auto">
          <table>
            <thead><tr><th>Module</th><th>Reference</th><th>Name</th>{deleted && <th>Days left</th>}<th className="w-16"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {records.map((record) => {
                const daysLeft = deletionDaysLeft(record.deletedAt);
                return (
                <tr
                  key={record.key}
                  aria-selected={selectionMode ? selected.includes(record.key) : undefined}
                  tabIndex={0}
                  className={`cursor-pointer ${selected.includes(record.key) ? "bg-[#d7eef9] hover:bg-[#d7eef9]" : ""}`}
                  onClick={recordRowClick(() => activateRecord(record))}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      activateRecord(record);
                    }
                  }}
                >
                  <td>{record.module}</td><td>{record.reference}</td><td>{record.name}</td>
                  {deleted && (
                    <td className={daysLeft !== null && daysLeft <= 7 ? "font-semibold text-red-700" : "text-[#555]"}>
                      {daysLeft === null ? "Date unavailable" : daysLeft === 0 ? "Pending cleanup" : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}
                    </td>
                  )}
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
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="panel p-6 text-sm text-[#737373]">{deleted ? "No deleted records." : "No archived records."}</p>}
      {deleted && (
        <p className="py-3 text-xs text-[#555]">
          Records are permanently deleted after 30 days in Deleted Records and cannot be restored afterward.
          Automatic cleanup runs while this app is open or when it is reopened.
        </p>
      )}
      <dialog
        ref={reviewDialogRef}
        aria-labelledby="record-review-title"
        onCancel={() => setReviewKey(null)}
        className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-[#d0e3ef] bg-white p-6 text-[#16344d] shadow-2xl backdrop:bg-black/40"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="record-review-title" className="text-lg font-semibold">{reviewRecord?.reference || "Record review"}</h2>
            <p className="mt-1 text-sm text-[#737373]">{reviewRecord?.module} · {reviewRecord?.name}</p>
          </div>
          <button type="button" aria-label="Close record review" className="grid size-8 shrink-0 place-items-center rounded hover:bg-[#e7f3fb]" onClick={() => setReviewKey(null)}><X size={18} /></button>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {Object.entries(reviewRecord?.details ?? {}).filter(([key, value]) =>
            value != null && value !== "" && !key.endsWith("Id") && key !== "id" && key !== "initials"
          ).map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs capitalize text-[#737373]">{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                {key === "accountNumber" ? `•••• ${String(value).slice(-4)}`
                  : Array.isArray(value) ? value.join(", ") || "None"
                  : typeof value === "boolean" ? value ? "Yes" : "No"
                  : value && typeof value === "object" ? Object.values(value).map((item) => item instanceof File ? item.name : String(item)).join(", ") || "None"
                  : String(value)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-[#d0e3ef] pt-4">
          <button type="button" className="secondary-btn" onClick={() => setReviewKey(null)}>Close</button>
          <button type="button" className="secondary-btn" onClick={() => {
            if (reviewRecord && onRestore?.(reviewRecord.module, reviewRecord.id)) setReviewKey(null);
          }}><RotateCcw size={15} aria-hidden="true" /> Restore</button>
          <button type="button" className="secondary-btn text-red-700" onClick={() => {
            if (!reviewRecord) return;
            setReviewKey(null);
            reviewDialogRef.current?.close();
            onDelete?.(reviewRecord.module, reviewRecord.id);
          }}><Trash2 size={15} aria-hidden="true" /> Delete</button>
        </div>
      </dialog>
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

export function Dashboard({
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
            permission: "checks",
            label: "Total Checks",
            value: checks.filter((x) => !x.archivedAt).length,
            icon: Wallet,
            onClick: () => go("checks"),
          },
          {
            permission: "payables",
            label: "Outstanding Payables",
            value: peso.format(payableSummary.totalRemainingBalance),
            icon: WalletCards,
            onClick: () => go("payables"),
          },
          {
            permission: "receivables",
            label: "Outstanding Receivables",
            value: peso.format(receivableSummary.totalOutstandingBalance),
            icon: CircleDollarSign,
            onClick: () => go("receivables"),
          },
          {
            permission: "employees",
            label: "Active Employees",
            value: employees.filter((x) => x.status === "Active").length,
            icon: Users,
            onClick: () => go("employees"),
          },
        ].filter((item) => canAccessPage(item.permission))}
      />

      <div className="mt-7 grid gap-7 xl:grid-cols-[1.55fr_1fr]">
        {(canAccessPage("payables") || canAccessPage("receivables")) && <section className="panel">
          <PanelTitle
            title="Recent payables and receivables"
            subtitle="Three most recently added records in each list"
          />
          <div className="grid gap-px bg-[#d7e8f3] md:grid-cols-2">
            {canAccessPage("payables") && <PayableDueList
              title="Payables"
              records={payables
                .filter((x) => !x.archivedAt)
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id)
                .slice(0, 3)}
              onOpen={() => go("payables")}
            />}
            {canAccessPage("receivables") && <ReceivableDueList
              title="Receivables"
              records={receivables
                .filter((x) => !x.archivedAt)
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id)
                .slice(0, 3)}
              onOpen={() => go("receivables")}
            />}
          </div>
        </section>}
        {canAccessPage("activity") && <section className="panel">
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
        </section>}
      </div>

      {canAccessPage("checks") && <section className="panel mt-7">
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
      </section>}
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
            <span className="grid size-9 place-items-center bg-[#e7f3fb] rounded-lg">
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
            <span className="grid size-9 place-items-center bg-[#e7f3fb] rounded-lg">
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
  onPrint,
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
  onPrint: () => void;
  sortDirection: "asc" | "desc";
  onToggleSort: () => void;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [showReports, setShowReports] = useState(false);
  return (
    <div className="space-y-3">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className="relative min-w-0 flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input pl-10 pr-10"
          aria-label="Search employees"
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="secondary-btn w-full sm:w-auto" aria-expanded={showFilters} aria-controls="employee-filter-panel" onClick={() => setShowFilters((visible) => !visible)}>
          <SlidersHorizontal size={15} /> {showFilters ? "Hide filters" : "More filters"}
        </button>
      <button
        type="button"
        onClick={onToggleSort}
        className="secondary-btn w-full sm:w-auto"
        aria-label="Sort employees by surname alphabetically"
      >
        <ArrowUpDown size={15} /> {sortDirection === "asc" ? "A-Z" : "Z-A"}
      </button>
        <button type="button" className="secondary-btn w-full sm:w-auto" aria-expanded={showReports} aria-controls="employee-report-panel" onClick={() => setShowReports((visible) => !visible)}>
          <FileText size={15} /> Reports
        </button>
      </div>
    </div>
    {showFilters && (
      <div id="employee-filter-panel" className="grid gap-3 rounded-lg border border-[#d0e3ef] bg-[#f4f9fd] p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="field-label">Employment status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="input mt-2">
            <option>All statuses</option>
            {statuses.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
      </div>
    )}
    {showReports && (
      <div id="employee-report-panel" className="flex flex-wrap gap-2 rounded-lg border border-[#d0e3ef] bg-[#f4f9fd] p-4">
        <button type="button" onClick={onPrint} className="secondary-btn"><Printer size={15} /> Print</button>
        <button type="button" onClick={exportData} className="secondary-btn"><Download size={15} /> Export</button>
      </div>
    )}
    </div>
  );
}

export function EmployeeRegister({
  data,
  onAdd,
  onView,
  onEdit,
  onDelete,
}: {
  data: Employee[];
  onAdd: () => void;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const { printReport, printSheet } = usePrintReport();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filtered = data.filter(
    (x) =>
      `${x.number} ${x.name} ${x.department}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === "All statuses" || getEmploymentStatus(x) === status),
  ).sort((a, b) =>
    sortDirection === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const summaryStatuses = [
    { label: "Regular", icon: UserCheck },
    { label: "Probationary", icon: Clock3 },
    { label: "Contractual", icon: Users },
  ] as const;
  return (
    <div className="w-full max-w-full space-y-5 overflow-x-clip">
      <SummaryStatCards
        items={[
          {
            label: "Total Employees",
            value: data.length,
            icon: Wallet,
            onClick: () => {
              setStatus("All statuses");
              setPage(1);
            },
          },
          ...summaryStatuses.map(({ label, icon }) => ({
            label,
            value: data.filter((employee) => getEmploymentStatus(employee) === label).length,
            icon,
            onClick: () => {
              setStatus(label);
              setPage(1);
            },
          })),
        ]}
      />
      <section className="max-w-full space-y-4">
      <RegisterTools
        query={query}
        setQuery={(value) => {
          setQuery(value);
          setPage(1);
        }}
        status={status}
        setStatus={(value) => {
          setStatus(value);
          setPage(1);
        }}
        statuses={[...employmentStatuses]}
        placeholder="Search employee no., name, or department…"
        exportData={() => exportCsv("employee-alphalist.csv", employeeDirectoryRows(filtered))}
        onPrint={() => { void printReport("Employee alphalist", employeeDirectoryRows(filtered)); }}
        sortDirection={sortDirection}
        onToggleSort={() => {
          setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
          setPage(1);
        }}
      />
        <ActiveFilters
          filters={{ search: query, status }}
          defaults={{ search: "", status: "All statuses" }}
          matched={filtered.length}
          total={data.length}
          onRemove={(key) => key === "search" ? setQuery("") : setStatus("All statuses")}
          onClear={() => { setQuery(""); setStatus("All statuses"); }}
        />
      <div className="panel max-w-full overflow-hidden">
      {filtered.length ? (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Full Name</th>
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
              {pageRows.map((x) => {
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
                    <td>{x.department}</td>
                    <td>{x.position}</td>
                    <td>{formatDate(x.dateHired)}</td>
                    <td>
                      {employmentStatus ?? "—"}
                    </td>
                    <td>{displayEmployeeCashAdvances(x)}</td>
                    <td>
                      <Status value={getRequirementStatus(x)} />
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <EmployeeActions employee={x} onEdit={() => onEdit(x.id)} onDelete={() => onDelete(x.id)} />
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
      <Pagination page={currentPage} pageSize={pageSize} count={filtered.length} onPageChange={setPage} />
      </div>
    </section>
    {printSheet}
    </div>
  );
}

function EmployeeActions({ employee, onEdit, onDelete }: { employee: Employee; onEdit: () => void; onDelete: () => void }) {
  const menuId = `employee-actions-${employee.id}`;
  const menuRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        aria-label={`Actions for ${employee.name}`}
        aria-haspopup="dialog"
        aria-controls={menuId}
        className="table-action"
        onClick={(event) => {
          const menu = menuRef.current;
          if (!menu) return;
          menu.showPopover();
          const { top, bottom, right } = event.currentTarget.getBoundingClientRect();
          const fitsBelow = bottom + menu.offsetHeight + 4 <= window.innerHeight;
          menu.style.right = `${Math.max(8, window.innerWidth - right)}px`;
          menu.style.top = fitsBelow ? `${bottom + 4}px` : "auto";
          menu.style.bottom = fitsBelow ? "auto" : `${window.innerHeight - top + 4}px`;
        }}
      >
        <MoreHorizontal size={17} aria-hidden="true" />
      </button>
      <dialog ref={menuRef} id={menuId} popover="manual" aria-label={`Actions for ${employee.name}`} onCancel={(event) => event.preventDefault()} className="fixed inset-auto m-0 w-36 max-h-[calc(100dvh-1rem)] overflow-y-auto border border-[#d0e3ef] bg-white p-1 shadow-xl backdrop:bg-transparent backdrop:touch-none">
        <button type="button" onClick={() => { menuRef.current?.hidePopover(); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#e7f3fb]">
          <Pencil size={14} aria-hidden="true" /> Edit
        </button>
        <button
          type="button"
          onClick={() => {
            menuRef.current?.hidePopover();
            onDelete();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-700 hover:bg-red-50"
        >
          <Trash2 size={14} aria-hidden="true" /> Delete
        </button>
        <button type="button" onClick={() => menuRef.current?.hidePopover()} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#888] hover:bg-[#e7f3fb]">
          <X size={14} aria-hidden="true" /> Close
        </button>
      </dialog>
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
  const { markDirty, markSaved } = useUnsavedForm(view.mode !== "details");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const record = view.mode === "create" ? undefined : employees.find((employee) => employee.id === view.id);
  const [contactDigits, setContactDigits] = useState(() => getContactDigits(record?.contactNumber ?? ""));
  const [checkedRequirements, setCheckedRequirements] = useState(record?.requirements ?? []);
  const [checkedLabRequirements, setCheckedLabRequirements] = useState(record?.laboratoryRequirements ?? []);
  const [requirementStatus, setRequirementStatus] = useState<"Complete" | "Incomplete">(
    record ? getRequirementStatus(record) : "Incomplete",
  );
  const allRequirementsChecked = hasAllEmployeeRequirements({
    requirements: checkedRequirements,
    laboratoryRequirements: checkedLabRequirements,
  });
  if (view.mode !== "create" && !record) return null;

  if (view.mode === "details") {
    return record ? (
      <section className="panel">
        <PanelTitle
          title={record.name}
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
    const enteredAmount = text("cashAdvanceAmount");
    const cashAdvanceAmount = enteredAmount ? Number(enteredAmount) : undefined;
    const nextErrors: Record<string, string> = {};
    for (const field of e.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[name], select[name], textarea[name]")) {
      const error = fieldError(field);
      if (error) nextErrors[field.name] = error;
    }
    if (!fullName) nextErrors.party = "Enter the employee's full name.";
    if (requiresEmploymentStatus && !employmentStatus) nextErrors.employmentStatus = "Select an employment status.";
    if (cashAdvanceAmount !== undefined && (!Number.isFinite(cashAdvanceAmount) || cashAdvanceAmount <= 0)) nextErrors.cashAdvanceAmount = "Enter an amount greater than zero.";
    if (contactDigits && !contactSubscriberRegex.test(contactDigits)) nextErrors.contactNumber = "Enter 10 digits starting with 9.";
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      focusFirstError(e.currentTarget, nextErrors);
      return;
    }
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

    markSaved();
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
      requirementStatus: text("requirementStatus") === "Complete" && hasAllEmployeeRequirements({ requirements, laboratoryRequirements: checkedLabRequirements }) ? "Complete" : "Incomplete",
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
      <form onSubmit={onSubmit} onChangeCapture={(event) => {
        markDirty();
        const field = event.nativeEvent.target;
        if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
        if (fieldErrors[field.name]) setFieldErrors((current) => ({ ...current, [field.name]: fieldError(field) }));
      }} className="p-5 md:p-6" noValidate>
        <div className="space-y-6">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">Employee information</legend>
            <FormField label="Full Name (Surname, First name)" name="party" defaultValue={record?.name} required error={fieldErrors.party} />
            <FormField label="Email Address" name="email" defaultValue={record?.email} type="email" required error={fieldErrors.email} />
            <FormField label="Date Hired" name="date" defaultValue={record?.dateHired} type="date" required error={fieldErrors.date} />
            <FormField label="Department" name="department" defaultValue={record?.department} required error={fieldErrors.department} />
            <FormField label="Position" name="position" defaultValue={record?.position} required error={fieldErrors.position} />
            <label className="block">
              <span className="field-label">
                Employment Status {requiresEmploymentStatus && <span className="text-red-700">*</span>}
              </span>
              <select
                name="employmentStatus"
                required={requiresEmploymentStatus}
                aria-invalid={fieldErrors.employmentStatus ? true : undefined}
                aria-describedby={fieldErrors.employmentStatus ? "employmentStatus-error" : undefined}
                defaultValue={currentEmploymentStatus ?? ""}
                className="input select-input mt-2"
              >
                <option value="" disabled={requiresEmploymentStatus}>Select employment status</option>
                {employmentStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
              {fieldErrors.employmentStatus && <p id="employmentStatus-error" className="mt-1.5 text-[11px] text-red-700">{fieldErrors.employmentStatus}</p>}
            </label>
            <FormField
              label="Cash Advance Amount (PHP)"
              name="cashAdvanceAmount"
              type="number"
              min={0.01}
              defaultValue={record?.cashAdvanceAmount}
              error={fieldErrors.cashAdvanceAmount}
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
                          aria-invalid={fieldErrors.contactNumber ? true : undefined}
                          aria-describedby={fieldErrors.contactNumber ? "contactNumber-error" : undefined}
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
                      {fieldErrors.contactNumber && <p id="contactNumber-error" className="mt-1.5 text-[11px] text-red-700">{fieldErrors.contactNumber}</p>}
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
                    error={fieldErrors[name]}
                  />
                );
              })}
            </fieldset>
          ))}
          <EmployeeRequirementChecklist
            title="Requirements"
            name="requirements"
            items={employeeRequirements}
            checked={checkedRequirements}
            onChange={(checked) => {
              setCheckedRequirements(checked);
              if (!hasAllEmployeeRequirements({ requirements: checked, laboratoryRequirements: checkedLabRequirements })) setRequirementStatus("Incomplete");
            }}
          />
          <EmployeeRequirementChecklist
            title="Laboratory Requirements"
            name="laboratoryRequirements"
            items={laboratoryRequirements}
            checked={checkedLabRequirements}
            onChange={(checked) => {
              setCheckedLabRequirements(checked);
              if (!hasAllEmployeeRequirements({ requirements: checkedRequirements, laboratoryRequirements: checked })) setRequirementStatus("Incomplete");
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Requirement Status</span>
              <RequirementStatusSelect
                value={allRequirementsChecked ? requirementStatus : "Incomplete"}
                allowComplete={allRequirementsChecked}
                onChange={(value) => { if (value !== requirementStatus) markDirty(); setRequirementStatus(value === "Complete" && allRequirementsChecked ? "Complete" : "Incomplete"); }}
              />
              {!allRequirementsChecked && (
                <p className="mt-2 text-[11px] text-[#777]">Check every requirement and laboratory requirement before selecting Complete.</p>
              )}
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
          <button className="primary-btn">{record ? "Save changes" : "Save employee"}</button>
        </div>
      </form>
    </section>
  );
}

function EmployeeRequirementChecklist({
  title,
  name,
  items,
  checked,
  onChange,
}: {
  title: string;
  name: string;
  items: string[];
  checked: string[];
  onChange: (checked: string[]) => void;
}) {
  return (
    <fieldset className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="mb-4 text-[10px] font-bold uppercase tracking-[.14em] text-[#1f6ea6]">{title}</legend>
      {items.map((item) => (
        <div key={item} className="min-w-0 rounded-lg border border-[#d0e3ef] p-3">
          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              name={name}
              value={item}
              checked={checked.includes(item)}
              onChange={(event) => {
                const isChecked = event.currentTarget.checked;
                onChange(isChecked ? [...checked, item] : checked.filter((entry) => entry !== item));
              }}
              className="requirement-checkbox size-4 shrink-0"
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
  const { printReport, printSheet } = usePrintReport();
  const fields = [
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
    ["Requirement Status", getRequirementStatus(record)],
    ["Requirements follow-up date", record.requirementFollowUpDate && formatDate(record.requirementFollowUpDate)],
    ...(record.archived ? [["Directory Status", "Archived"]] : []),
  ];
  return (
    <div className="p-5 md:p-6">
      <dl className="grid gap-px overflow-hidden rounded-lg bg-[#d0e3ef] sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="bg-white p-4">
            <dt className="field-label">{label}</dt>
            <dd className="mt-1.5 wrap-break-word whitespace-pre-wrap text-sm font-medium">{label === "Requirement Status" ? <Status value={getRequirementStatus(record)} /> : value || "—"}</dd>
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
          <button
            onClick={() => {
              const rows = fields.map(([Field, value]) => ({ Field, Value: value || "—" }));
              for (const [title, items, checked] of [
                ["Requirement", employeeRequirements, record.requirements ?? []],
                ["Laboratory requirement", laboratoryRequirements, record.laboratoryRequirements ?? []],
              ] as const) {
                for (const item of items) {
                  const attachment = record.requirementAttachments?.[item];
                  rows.push({
                    Field: `${title}: ${item}`,
                    Value: checked.includes(item)
                      ? `Checked${attachment ? ` · ${attachment.name}` : " · No attachment"}`
                      : "Not checked",
                  });
                }
              }
              void printReport("Employee record", rows, 1, record.name);
            }}
            className="secondary-btn"
          >
            <Printer size={15} /> Print
          </button>
        </div>
      </div>
      {printSheet}
    </div>
  );
}

function Reports({ checks, payables, receivables, employees, notify }: any) {
  const { printReport, printSheet } = usePrintReport();
  const activeChecks = (checks as CheckRecord[]).filter((x) => !x.archivedAt);
  const payableRows = (payables as PayableViewModel[]).filter(
    (x) => !x.archivedAt && x.remainingBalance > 0,
  );
  const reports = [
    {
      title: "Check records",
      detail: "Open Check Monitoring for full reports, filters, and masked exports",
      Icon: FileCheck2,
      data: activeChecks,
      exportRows: activeChecks.map((x) => ({
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
    <>
    <div className="grid gap-5 md:grid-cols-2">
      {reports.map(({ title, detail, Icon, data, exportRows }) => (
        <section key={title} className="panel p-6">
          <div className="flex items-start gap-4">
            <span className="grid size-11 place-items-center bg-[#e7f3fb] text-[#1f6ea6] rounded-lg">
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
            <button onClick={() => printReport(title, exportRows)} className="secondary-btn flex-1">
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
    {printSheet}
    </>
  );
}


function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showingAll, setShowingAll] = useState(false);
  useEffect(() => {
    void loadActivityLogs().then(setLogs).catch((error) => setError(error.message)).finally(() => setLoading(false));
  }, []);
  return (
    <section className="panel">
      {error && <p role="alert" className="p-5 text-red-700">{error}</p>}
      <div className="overflow-x-auto"><table><thead><tr><th>Action</th><th>Description</th><th>Performed by</th><th>Date &amp; time</th></tr></thead>
        <tbody>{logs.map((log) => <tr key={log.id}><td className="font-semibold">{log.action}</td><td>{log.description}</td><td>{log.user?.name ?? "System"}</td><td>{new Date(log.created_at).toLocaleString()}</td></tr>)}</tbody>
      </table></div>
      {!showingAll && <button type="button" className="text-link m-5" disabled={loading} onClick={async () => {
        setLoading(true);
        setError("");
        try {
          setLogs(await loadActivityLogs(true));
          setShowingAll(true);
        } catch (error) {
          setError(error instanceof Error ? error.message : "Unable to load activity logs.");
        } finally {
          setLoading(false);
        }
      }}>{loading ? "Loading activity…" : "View all activity"}</button>}
    </section>
  );
}

function ChangePassword({ onClose }: { onClose?: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  return (
    <section className="panel max-w-2xl">
      <PanelTitle title="Password security" subtitle="Use at least 12 characters, with uppercase and lowercase letters, a number, and a symbol." />
      <form className="grid gap-5 p-6" onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = new FormData(form);
        setSaving(true);
        setError("");
        setSuccess("");
        try {
          const result = await apiRequest<{ message: string; csrfToken: string }>("/change-password", { method: "PUT", body: JSON.stringify(Object.fromEntries(fields)) });
          setSession({ ...getSession()!, csrfToken: result.csrfToken });
          form.reset();
          setSuccess(result.message);
        } catch (error) {
          setError(error instanceof Error ? error.message : "Unable to change your password.");
        } finally {
          setSaving(false);
        }
      }}>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="text-sm text-green-700">{success}</p>}
        <label className="block">
          <span className="field-label">Current password <span className="text-red-700">*</span></span>
          <PasswordInput className="mt-2" name="current_password" autoComplete="current-password" required />
        </label>
        <label className="block">
          <span className="field-label">New password <span className="text-red-700">*</span></span>
          <PasswordInput className="mt-2" name="password" autoComplete="new-password" minLength={12} maxLength={1024} required />
        </label>
        <label className="block">
          <span className="field-label">Confirm new password <span className="text-red-700">*</span></span>
          <PasswordInput className="mt-2" name="password_confirmation" autoComplete="new-password" minLength={12} maxLength={1024} required />
        </label>
        <div className="flex flex-wrap justify-end gap-3 border-t border-[#e1eef6] pt-5">
          {onClose
            ? <button className="secondary-btn" type="button" disabled={saving} onClick={onClose}>Close</button>
            : <a className="secondary-btn" href="/profile">Back to profile</a>}
          <button className="primary-btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Save new password"}</button>
        </div>
      </form>
    </section>
  );
}

type SettingsRole = {
  id: number;
  name: string;
  permissions: string[];
  availablePermissions: { slug: string; name: string }[];
};

function SystemSettings({ onClose }: { onClose: () => void }) {
  const [roles, setRoles] = useState<SettingsRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    void apiRequest<{ roles: SettingsRole[] }>("/settings")
      .then((result) => setRoles(result.roles))
      .catch((error) => setError(error instanceof Error ? error.message : "Unable to load settings."))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="panel">
      <PanelTitle title="System settings" subtitle="Manage role permissions" />
      <div className="grid gap-5 p-6">
        <p className="text-xs text-[#777]">Choose module access for each role. HR can be granted selected monitoring modules. Finance access is limited to financial monitoring. Dashboard and personal account access are always retained. Super Admin access is fixed.</p>
        {loading && <p role="status" className="text-sm">Loading settings…</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="text-sm text-green-700">{success}</p>}
        {roles.map((role) => (
          <form key={role.id} className="grid gap-4 rounded-lg border border-[#e1eef6] p-5" onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const fields = new FormData(form);
            setSaving(true);
            setError("");
            setSuccess("");
            try {
              const result = await apiRequest<{ message: string }>(`/settings/roles/${role.id}`, {
                method: "PUT",
                body: JSON.stringify({ current_password: fields.get("current_password"), permissions: fields.getAll("permissions") }),
              });
              const password = form.elements.namedItem("current_password") as HTMLInputElement;
              password.value = "";
              setSuccess(result.message);
            } catch (error) {
              setError(error instanceof Error ? error.message : "Unable to save permissions.");
            } finally {
              setSaving(false);
            }
          }}>
            <h3 className="text-sm font-bold">{role.name}</h3>
            {role.availablePermissions.map((permission) => (
              <label key={permission.slug} className="flex min-h-9 items-center gap-3 text-sm">
                <input type="checkbox" name="permissions" value={permission.slug} defaultChecked={role.permissions.includes(permission.slug)} />
                {permission.name}
              </label>
            ))}
            <label className="block">
              <span className="field-label">Confirm your administrator password <span className="text-red-700">*</span></span>
              <PasswordInput className="mt-2" name="current_password" autoComplete="current-password" required />
            </label>
            <div className="flex justify-end">
              <button className="primary-btn" type="submit" disabled={saving}>Save {role.name} permissions</button>
            </div>
          </form>
        ))}
        <div className="flex justify-end border-t border-[#e1eef6] pt-5">
          <button className="secondary-btn" type="button" disabled={saving} onClick={onClose}>Close</button>
        </div>
      </div>
    </section>
  );
}

function Profile({ notify }: { notify: (s: string) => void }) {
  const user = getSession()!.user;
  const [accountView, setAccountView] = useState<"profile" | "password" | "settings">("profile");
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
      <section className="panel overflow-hidden">
        <div className="p-6 text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-[#1f6ea6] text-xl font-bold text-white">
            {user.name.split(" ").filter(Boolean).map((name) => name[0]).slice(0, 2).join("")}
          </span>
          <h2 className="mt-4 break-words font-bold">{user.name}</h2>
          <p className="mt-1 text-xs text-[#777]">{user.roleName}</p>
        </div>
        <nav aria-label="Account actions" className="border-t border-[#e1eef6] p-3">
          <button type="button" aria-expanded={accountView === "password"} aria-controls="profile-password" className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs font-semibold text-black hover:bg-[#f3f8fc] focus-visible:outline-2 focus-visible:outline-[#1f6ea6]" onClick={() => setAccountView("password")}>
            <ShieldCheck size={18} aria-hidden="true" />
            <span className="flex-1">Change password</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          {canAccessPage("settings") && (
            <button type="button" aria-expanded={accountView === "settings"} aria-controls="profile-settings" className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs font-semibold text-black hover:bg-[#f3f8fc] focus-visible:outline-2 focus-visible:outline-[#1f6ea6]" onClick={() => setAccountView("settings")}>
              <SlidersHorizontal size={18} aria-hidden="true" />
              <span className="flex-1">System settings</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}
        </nav>
      </section>
      <div className="grid gap-6">
        <div id="profile-password" hidden={accountView !== "password"}>
          {accountView === "password" && <ChangePassword onClose={() => setAccountView("profile")} />}
        </div>
        <div id="profile-settings" hidden={accountView !== "settings"}>
          {accountView === "settings" && canAccessPage("settings") && <SystemSettings onClose={() => setAccountView("profile")} />}
        </div>
        <div hidden={accountView !== "profile"}>
          <section className="panel">
            <PanelTitle title="Profile information" subtitle="Your account and contact details" />
            <form className="grid gap-4 p-6 sm:grid-cols-2" onSubmit={async (event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              try {
                await apiRequest("/account", { method: "PUT", body: JSON.stringify(Object.fromEntries(fields)) });
                window.location.reload();
              } catch (error) {
                notify(error instanceof Error ? error.message : "Unable to save your account.");
              }
            }}>
              <FormField label="Full name" name="name" defaultValue={user.name} required />
              <FormField label="Email address" name="email" type="email" defaultValue={user.email} required />
              <FormField label="Confirm your password" name="current_password" type="password" required />
              <div className="sm:col-span-2 flex justify-end border-t border-[#e1eef6] pt-5"><button className="primary-btn">Save changes</button></div>
            </form>
          </section>
        </div>
      </div>
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
  subtitle?: string;
  action?: React.ReactNode;
  onBack?: () => void;
}) {
  useHeaderBack(onBack);
  return (
    <div className="flex min-h-[76px] flex-col gap-3 border-b border-[#d0e3ef] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-sm font-bold tracking-[-.01em]">{title}</h2>
        {subtitle && <p className="mt-1 text-[11px] text-[#888]">{subtitle}</p>}
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
  error,
}: any) {
  const Input = type === "date" ? DateInput : type === "password" ? PasswordInput : "input";
  return (
    <label className="block">
      <span className="field-label">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </span>
      <Input
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        type={type}
        required={required}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        min={min}
        max={max}
        step={type === "number" ? "0.01" : undefined}
        defaultValue={defaultValue}
        className={type === "password" ? "mt-2" : "input mt-2"}
      />
      {error && <p id={`${name}-error`} className="mt-1.5 text-[11px] text-red-700">{error}</p>}
    </label>
  );
}

function Empty({ title, action }: { title: string; action: () => void }) {
  return (
    <div className="flex flex-col items-center px-5 py-20 text-center">
      <Search size={24} aria-hidden="true" />
      <h3 className="mt-2 text-sm font-bold">{title}</h3>
      <p className="mt-1 text-xs text-[#888]">Adjust the filters or create a new record.</p>
      <button onClick={action} className="primary-btn mt-5">
        <Plus size={15} /> Add record
      </button>
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  count,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const start = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, count);
  return (
    <div className="flex items-center justify-between border-t border-[#d0e3ef] px-5 py-4 text-[11px] text-[#777]">
      <span>
        Showing {start}–{end} of {count}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={page <= 1}
          className="table-action disabled:opacity-30"
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="grid size-8 place-items-center rounded-lg bg-[#1f6ea6] text-white">{page}</span>
        <button
          type="button"
          disabled={page >= pages}
          className="table-action disabled:opacity-30"
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
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
