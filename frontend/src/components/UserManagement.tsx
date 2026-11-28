import { PasswordInput } from "./PasswordInput";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpDown, Download, FileText, Plus, Printer, Search, SlidersHorizontal, X } from "lucide-react";
import { apiRequest, getSession } from "../auth";
import { PaginationBar } from "./ModuleUi";
import { ActiveFilters } from "./ActiveFilters";
import { recordRowClick } from "./recordRowClick";
import { useHeaderBack } from "./HeaderBack";
import { confirmLeavingUnsavedForm, useUnsavedForm } from "@/hooks/useUnsavedForm";
import { fieldError, focusFirstError } from "./formValidation";
import { accountReportRows, safeAccountCsvRows, type AccountReportEntry } from "./accountReport";
import { usePrintReport } from "./usePrintReport";
import { downloadCsv } from "@/modules/checks/utils";
import { StatusBadge } from "./StatusBadge";
import {
  cacheUserList,
  clearUserListCache,
  getCachedUserList,
  type Role,
  type User,
  type UserList,
} from "./userManagementCache";

type Credentials = { user: User; temporaryPassword: string };
type ValidationErrors = Record<string, string[]>;

const date = (value: string | null) => (value ? new Date(value).toLocaleString() : "Never");

export function UserManagement({ notify }: { notify: (message: string) => void }) {
  const [path, setPath] = useState(() => window.location.pathname + window.location.search);
  const url = new URL(path, window.location.origin);
  const [search, setSearch] = useState(() => url.searchParams.get("search") ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const sort = url.searchParams.get("sort") === "desc" ? "desc" : "asc";
  const match = url.pathname.match(/^\/users\/(\d+)(\/edit)?\/?$/);
  const creating = url.pathname === "/users/create";
  const editing = Boolean(match?.[2]);
  const form = creating || editing;
  const details = Boolean(match && !editing);
  const { markDirty, markSaved } = useUnsavedForm(form || details);
  const [reportFilters, setReportFilters] = useState<string | null>(null);
  const [reportAccounts, setReportAccounts] = useState<AccountReportEntry[] | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportAttempt, setReportAttempt] = useState(0);
  const { printReport, printSheet } = usePrintReport();
  const [list, setList] = useState<UserList | null>(() =>
    !form && !details ? getCachedUserList("/users" + url.search) : null,
  );
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [loading, setLoading] = useState(!list);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<ValidationErrors>({});

  function navigate(next: string) {
    if (!confirmLeavingUnsavedForm()) return;
    window.history.pushState({}, "", next);
    setCredentials(null);
    setSearch(new URL(next, window.location.origin).searchParams.get("search") ?? "");
    setPath(next);
    window.scrollTo({ top: 0 });
  }
  function setListFilter(key: "role" | "status", value: string) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    if (search) url.searchParams.set("search", search); else url.searchParams.delete("search");
    url.searchParams.delete("page");
    navigate(url.pathname + url.search);
  }
  useHeaderBack(reportFilters !== null ? () => setReportFilters(null) : form || details || credentials ? () => navigate("/users") : undefined, saving);

  useEffect(() => {
    if (reportFilters === null) return;
    let active = true;
    setReportAccounts(null);
    setReportError("");
    void apiRequest<{ data: AccountReportEntry[] }>(`/users/report?${reportFilters}`)
      .then((result) => { if (active) setReportAccounts(result.data); })
      .catch((failure: Error) => { if (active) setReportError(failure.message); });
    return () => { active = false; };
  }, [reportFilters, reportAttempt]);

  useEffect(() => {
    const back = () => {
      setCredentials(null);
      setSearch(new URLSearchParams(window.location.search).get("search") ?? "");
      setPath(window.location.pathname + window.location.search);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  useEffect(() => {
    if (form || details || credentials || search === (url.searchParams.get("search") ?? "")) return;
    const timer = window.setTimeout(() => {
      if (search) url.searchParams.set("search", search);
      else url.searchParams.delete("search");
      url.searchParams.delete("page");
      const next = url.pathname + url.search;
      window.history.replaceState({}, "", next);
      setPath(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, path, form, details, credentials]);

  useEffect(() => {
    let active = true;
    const endpoint = form || details ? url.pathname : "/users" + url.search;
    const cachedList = !form && !details ? getCachedUserList(endpoint) : null;
    setLoading(!cachedList);
    setError("");
    setErrors({});
    setUser(null);
    if (cachedList) {
      setList(cachedList);
    }
    void apiRequest<UserList & { user?: User; roles?: Role[] }>(endpoint)
      .then((result) => {
        if (!active) return;
        if (!form && !details && result.data) cacheUserList(endpoint, result);
        setList(result.data ? result : null);
        setUser(result.user ?? null);
        setRoles(result.roles ?? []);
      })
      .catch((failure: Error) => {
        if (active) {
          clearUserListCache();
          setList(null);
          setError(failure.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function save(event: FormEvent<HTMLFormElement>, reset = false) {
    event.preventDefault();
    if (saving) return;
    const formElement = event.currentTarget;
    const validation: ValidationErrors = {};
    for (const field of formElement.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[name], select[name], textarea[name]")) {
      const message = fieldError(field);
      if (message) validation[field.name] = [message];
    }
    const fields = new FormData(formElement);
    const confirmation = reset ? "RESET" : editing && user?.is_active && fields.get("is_active") === "0" ? "DEACTIVATE" : "";
    if (confirmation && fields.get("confirmation") !== confirmation) validation.confirmation = [`Type ${confirmation} exactly to confirm.`];
    if (Object.keys(validation).length) {
      setErrors(validation);
      setError("Please correct the highlighted fields and try again.");
      focusFirstError(formElement, validation);
      return;
    }
    const payload = Object.fromEntries(fields);
    setSaving(true);
    setError("");
    setErrors({});
    try {
      const endpoint = reset
        ? `/users/${user!.id}/reset-password`
        : creating
          ? "/users"
          : `/users/${user!.id}`;
      const result = await apiRequest<Credentials>(endpoint, {
        method: editing && !reset ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      markSaved();
      clearUserListCache();
      if (result.temporaryPassword) {
        setCredentials(result);
      } else {
        navigate(`/users/${user!.id}`);
        notify("Account updated.");
      }
    } catch (failure) {
      const problem = failure as Error & { errors?: ValidationErrors };
      setError(problem.message);
      setErrors(problem.errors ?? {});
      if (problem.errors) focusFirstError(formElement, problem.errors);
    } finally {
      setSaving(false);
    }
  }

  function updateField(event: React.FormEvent<HTMLFormElement>) {
    markDirty();
    const field = event.nativeEvent.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
    const name = field.name;
    if (errors[name]) {
      const confirmation = details ? "RESET" : editing && user?.is_active && new FormData(event.currentTarget).get("is_active") === "0" ? "DEACTIVATE" : "";
      const message = name === "confirmation" && confirmation && field.value !== confirmation ? `Type ${confirmation} exactly to confirm.` : fieldError(field);
      setErrors((current) => { const next = { ...current }; if (message) next[name] = [message]; else delete next[name]; return next; });
      setError("");
    }
    if (name === "is_active" && errors.confirmation) {
      const value = new FormData(event.currentTarget).get("confirmation");
      setErrors((current) => {
        const next = { ...current };
        if (user?.is_active && field.value === "0" && value !== "DEACTIVATE") next.confirmation = ["Type DEACTIVATE exactly to confirm."];
        else delete next.confirmation;
        return next;
      });
    }
  }

  const heading = credentials
    ? "Temporary credentials"
    : creating
      ? "Create account"
      : editing
        ? "Edit account"
        : "Account details";
  return (
    <section className="space-y-4" aria-busy={loading || saving || (reportFilters !== null && !reportAccounts && !reportError)}>
      {printSheet}
      {error && reportFilters === null && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {reportFilters !== null ? (
        <>
          <section className="panel p-5 sm:p-6">
            <h2 className="text-base font-semibold">Account report</h2>
            <p className="mt-2 text-sm text-[#5c7890]">All accounts matching the current search, role, and status filters. Passwords are excluded.</p>
            {(() => {
              const filters = new URLSearchParams(reportFilters);
              const roles: Record<string, string> = { "super-admin": "Super Admin", hr: "HR", finance: "Finance" };
              return <p className="mt-2 break-words text-xs text-[#5c7890]">Search: {filters.get("search") || "All"} · Role: {roles[filters.get("role") ?? ""] ?? "All"} · Status: {filters.get("status") === "active" ? "Active" : filters.get("status") === "inactive" ? "Inactive" : "All"}</p>;
            })()}
            {reportError ? <p role="alert" className="mt-4 text-sm text-red-700">Could not load the report: {reportError} <button type="button" className="text-link underline" onClick={() => setReportAttempt((attempt) => attempt + 1)}>Try again</button></p>
              : reportAccounts === null ? <p role="status" className="mt-4 text-sm text-[#777]">Loading account report…</p>
              : <p className="mt-4 text-sm text-[#777]">{reportAccounts.length} matching accounts</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="secondary-btn" disabled={!reportAccounts?.length} onClick={() => { if (reportAccounts) printReport("Account report", accountReportRows(reportAccounts)); }}><Printer size={15} aria-hidden="true" /> Print</button>
              <button type="button" className="primary-btn" disabled={!reportAccounts?.length} onClick={() => { if (reportAccounts) downloadCsv("oasis-account-report.csv", safeAccountCsvRows(accountReportRows(reportAccounts))); }}><Download size={15} aria-hidden="true" /> Export CSV</button>
            </div>
          </section>
          {reportAccounts && (reportAccounts.length ? (
            <>
              <ul className="space-y-3 md:hidden" aria-label="Account report">
                {accountReportRows(reportAccounts).map((row, index) => <li key={index} className="panel p-4 text-sm">
                  <p className="break-words font-semibold">{row.Name}</p><p className="mt-1 break-all text-xs text-[#5c7890]">{row.Email}</p>
                  <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
                    <dt className="text-[#777]">Role</dt><dd className="break-words">{row.Role}</dd>
                    <dt className="text-[#777]">Status</dt><dd><StatusBadge value={row.Status} /></dd>
                    <dt className="text-[#777]">Last login (Philippine time)</dt><dd>{row["Last login (Philippine time)"]}</dd>
                  </dl>
                </li>)}
              </ul>
              <div className="panel hidden overflow-x-auto md:block"><table>
                <caption className="sr-only">Account report; last login in Philippine time</caption>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login (Philippine time)</th></tr></thead>
                <tbody>{accountReportRows(reportAccounts).map((row, index) => <tr key={index}><td>{row.Name}</td><td>{row.Email}</td><td>{row.Role}</td><td><StatusBadge value={row.Status} /></td><td>{row["Last login (Philippine time)"]}</td></tr>)}</tbody>
              </table></div>
            </>
          ) : <p className="panel p-5 text-sm">No accounts match these filters. Go back and adjust them to create a report.</p>)}
        </>
      ) : credentials ? (
        <div className="panel mx-auto w-full max-w-2xl p-5 sm:p-6">
          <h2 className="text-base font-semibold">{heading}</h2>
          <p className="my-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            These credentials are shown only once. Save the temporary password and deliver it
            privately to the user. A password change is required at next login.
          </p>
          <dl className="space-y-3 text-sm">
            <dt className="text-[#777]">Email address</dt>
            <dd className="break-all">{credentials.user.email}</dd>
            <dt className="text-[#777]">Temporary password</dt>
            <dd>
              <code className="select-all break-all">{credentials.temporaryPassword}</code>
            </dd>
          </dl>
          {!credentials.user.is_active && (
            <p className="mt-4 text-sm text-amber-800">
              This account is inactive. Activate it before signing in.
            </p>
          )}
          <button
            className="primary-btn mt-6"
            onClick={() => navigate(`/users/${credentials.user.id}`)}
          >
            Done
          </button>
        </div>
      ) : loading && (form || details || !list) ? (
        form || details ? (
          <p role="status" className="p-5 text-sm text-[#777]">Loading account…</p>
        ) : (
          <UserListSkeleton />
        )
      ) : form && (creating || user) ? (
        <div className="panel mx-auto w-full max-w-2xl p-5 sm:p-8">
          <h2 className="mb-6 text-center text-lg font-semibold">{heading}</h2>
          <form key={path} className="space-y-5" onSubmit={save} onChangeCapture={updateField} noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <UserField
                name="name"
                label="Full name"
                value={user?.name}
                autoComplete="name"
                maxLength={255}
                errors={errors}
              />
              <UserField
                name="email"
                label="Email address"
                type="email"
                value={user?.email}
                autoComplete="email"
                maxLength={255}
                errors={errors}
              />
              <label className="block">
                <span className="field-label">Role</span>
                <select
                  className="input mt-2"
                  name="role_id"
                  required
                  disabled={user?.id === getSession()?.user.id}
                  defaultValue={user?.role_id ?? roles.find((role) => role.slug === "hr")?.id}
                  aria-invalid={Boolean(errors.role_id)}
                  aria-describedby="role-error"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {user && user.id === getSession()?.user.id && (
                  <>
                    <input type="hidden" name="role_id" value={user.role_id} />
                    <small className="mt-1 block text-[#777]">
                      You cannot change your own role.
                    </small>
                  </>
                )}
                <span id="role-error" className="mt-1 block text-xs text-red-700">
                  {errors.role_id?.join(" ")}
                </span>
              </label>
              <label className="block">
                <span className="field-label">Account status</span>
                <select
                  className="input mt-2"
                  name="is_active"
                  required
                  defaultValue={user?.is_active === false ? "0" : "1"}
                  aria-invalid={Boolean(errors.is_active)}
                  aria-describedby="status-error"
                >
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
                <span id="status-error" className="mt-1 block text-xs text-red-700">
                  {errors.is_active?.join(" ")}
                </span>
              </label>
            </div>
            {user?.is_active && (
              <UserField
                name="confirmation"
                label="Deactivation confirmation"
                required={false}
                hint="If deactivating this account, type DEACTIVATE. Otherwise leave blank."
                errors={errors}
              />
            )}
            <UserField
              name="current_password"
              label="Confirm your administrator password"
              type="password"
              autoComplete="current-password"
              errors={errors}
            />
            {creating && (
              <p className="text-sm text-[#777]">
                A temporary password will be generated and shown once after creation.
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-3 border-t border-[#e1eef6] pt-5">
              <button className="primary-btn" disabled={saving}>
                {saving ? "Saving…" : creating ? "Create account" : "Save account"}
              </button>
              <button
                type="button"
                className="secondary-btn"
                disabled={saving}
                onClick={() => navigate(user ? `/users/${user.id}` : "/users")}
              >
                Cancel
              </button>
              <button className="primary-btn" disabled={saving}>
                {saving ? "Saving…" : creating ? "Create account" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      ) : details && user ? (
        <>
          <div className="grid items-start gap-5 xl:grid-cols-[1.35fr_1fr]">
            <section className="panel p-5 sm:p-6" aria-labelledby="account-name">
              <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-[#e1eef6] pb-5">
                <div className="min-w-0">
                  <h2 id="account-name" className="break-words text-base font-semibold">
                    {user.name}
                  </h2>
                  <p className="mt-1 text-xs text-[#777]">
                    {user.role?.name ?? "Unassigned"} account
                  </p>
                </div>
                <StatusBadge value={user.is_active ? "Active" : "Inactive"} />
              </header>
              <dl className="grid grid-cols-1 gap-x-5 gap-y-3 text-sm sm:grid-cols-[1fr_1.3fr]">
                <dt className="text-[#777]">User ID</dt>
                <dd>{user.id}</dd>
                <dt className="text-[#777]">Email</dt>
                <dd className="break-all">{user.email}</dd>
                <dt className="text-[#777]">Role</dt>
                <dd>{user.role?.name ?? "Unassigned"}</dd>
                <dt className="text-[#777]">Created at</dt>
                <dd>{date(user.created_at)}</dd>
                <dt className="text-[#777]">Last login</dt>
                <dd>{date(user.last_login_at)}</dd>
                <dt className="text-[#777]">Password change required</dt>
                <dd>{user.must_change_password ? "Yes — at next login" : "No"}</dd>
              </dl>
              <footer className="mt-5 border-t border-[#e1eef6] pt-5">
                <button className="primary-btn" onClick={() => navigate(`/users/${user.id}/edit`)}>
                  Edit account
                </button>
              </footer>
            </section>
            <section
              className="panel border-t-2 border-t-red-700 p-5 sm:p-6"
              aria-labelledby="reset-heading"
            >
              <h2 id="reset-heading" className="text-base font-semibold">
                Reset password
              </h2>
              <p className="mb-5 mt-2 text-sm leading-relaxed text-[#777]">
                This replaces the current password, signs out existing sessions, and requires a
                password change on the next login.
              </p>
              <form className="space-y-5" onChangeCapture={updateField} onSubmit={(event) => void save(event, true)} noValidate>
                <UserField name="confirmation" label="Type RESET to confirm" errors={errors} />
                <UserField
                  name="current_password"
                  label="Confirm your administrator password"
                  type="password"
                  autoComplete="current-password"
                  errors={errors}
                />
                <button className="primary-btn bg-red-700 hover:bg-red-800" disabled={saving}>
                  {saving ? "Resetting…" : "Reset password"}
                </button>
              </form>
            </section>
          </div>
        </>
      ) : !form && !details && list ? (
        <>
          <div className="flex justify-end">
            <button className="primary-btn" onClick={() => navigate("/users/create")}>
              <Plus size={15} /> Add user
            </button>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
            <input
              className="input pl-10 pr-10"
              aria-label="Search users by name or email"
              placeholder="Search name or email…"
              value={search}
              maxLength={255}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button type="button" aria-label="Clear search"
                className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-[#777] hover:bg-[#e7f3fb] hover:text-[#222] focus-visible:outline-2 focus-visible:outline-[#1f6ea6]"
                onClick={(event) => { setSearch(""); event.currentTarget.parentElement?.querySelector("input")?.focus(); }}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="secondary-btn w-full sm:w-auto" aria-expanded={showFilters} aria-controls="user-filter-panel" onClick={() => setShowFilters((visible) => !visible)}>
              <SlidersHorizontal size={15} aria-hidden="true" /> {showFilters ? "Hide filters" : "More filters"}
            </button>
            <button type="button" className="secondary-btn w-full sm:w-auto" aria-label="Sort users by name alphabetically" onClick={() => {
              url.searchParams.set("sort", sort === "asc" ? "desc" : "asc");
              if (search) url.searchParams.set("search", search); else url.searchParams.delete("search");
              url.searchParams.delete("page");
              navigate(url.pathname + url.search);
            }}>
              <ArrowUpDown size={15} aria-hidden="true" /> {sort === "asc" ? "A-Z" : "Z-A"}
            </button>
            <button type="button" className="secondary-btn w-full sm:w-auto" onClick={() => {
              const filters = new URLSearchParams(url.search);
              if (search) filters.set("search", search); else filters.delete("search");
              filters.delete("page");
              setReportFilters(filters.toString());
            }}><FileText size={15} aria-hidden="true" /> Reports</button>
          </div>
          </div>
          <ActiveFilters
            filters={{ search, role: url.searchParams.get("role") ?? "", status: url.searchParams.get("status") ?? "" }}
            defaults={{ search: "", role: "", status: "" }} matched={list.total} total={list.total}
            valueLabels={{ role: { "super-admin": "Super Admin", hr: "HR", finance: "Finance" }, status: { active: "Active", inactive: "Inactive" } }}
            onRemove={(key) => {
              if (key === "search") setSearch("");
              else {
                url.searchParams.delete(key);
                url.searchParams.delete("page");
                if (search) url.searchParams.set("search", search); else url.searchParams.delete("search");
                navigate(url.pathname + url.search);
              }
            }}
            onClear={() => { setSearch(""); navigate("/users"); }}
          />
          {showFilters && (
          <div
            id="user-filter-panel"
            className="grid gap-3 rounded-lg border border-[#d0e3ef] bg-[#f4f9fd] p-4 md:grid-cols-2"
          >
            <label>
              <span className="field-label">Role</span>
              <select
                className="input mt-2"
                name="role"
                value={url.searchParams.get("role") ?? ""}
                onChange={(event) => setListFilter("role", event.target.value)}
              >
                <option value="">All roles</option>
                <option value="super-admin">Super Admin</option>
                <option value="hr">HR</option>
                <option value="finance">Finance</option>
              </select>
            </label>
            <label>
              <span className="field-label">Account status</span>
              <select
                className="input mt-2"
                name="status"
                value={url.searchParams.get("status") ?? ""}
                onChange={(event) => setListFilter("status", event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          )}
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table>
                <caption className="sr-only">User accounts</caption>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last login</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((account) => (
                    <tr
                      key={account.id}
                      className="cursor-pointer"
                      onClick={recordRowClick(() => navigate(`/users/${account.id}`))}
                    >
                      <td className="font-semibold">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          aria-label={`Open account for ${account.name}`}
                          onClick={() => navigate(`/users/${account.id}`)}
                        >
                          {account.name}
                        </button>
                      </td>
                      <td>{account.email}</td>
                      <td>{account.role?.name ?? "Unassigned"}</td>
                      <td>{account.is_active ? "Active" : "Inactive"}</td>
                      <td>{date(account.last_login_at)}</td>
                    </tr>
                  ))}
                  {!list.data.length && (
                    <tr>
                      <td colSpan={5}>No accounts match these filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={list.current_page}
              pageSize={list.per_page}
              total={list.total}
              onPageChange={(page) => {
                url.searchParams.set("page", String(page));
                navigate("/users" + url.search);
              }}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

function UserListSkeleton() {
  return (
    <div role="status" aria-label="Loading accounts" className="space-y-4">
      <span className="sr-only">Loading accounts…</span>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-36 rounded bg-[#dcebf5]" />
          <div className="h-11 w-28 rounded-lg bg-[#dcebf5]" />
        </div>
        <div className="flex gap-3">
          <div className="h-11 min-w-0 flex-1 rounded-lg border border-[#d0e3ef] bg-white" />
          <div className="hidden h-11 w-32 rounded-lg bg-[#dcebf5] sm:block" />
          <div className="hidden h-11 w-20 rounded-lg bg-[#dcebf5] sm:block" />
        </div>
        <div className="space-y-3 md:hidden">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="panel space-y-4 p-4">
              <div className="h-4 w-32 max-w-full rounded bg-[#dcebf5]" />
              <div className="h-3 w-48 max-w-full rounded bg-[#e7f3fb]" />
              <div className="h-3 w-36 max-w-full rounded bg-[#e7f3fb]" />
              <div className="h-10 w-full rounded-lg bg-[#e7f3fb]" />
            </div>
          ))}
        </div>
        <div className="panel hidden overflow-hidden md:block">
          <div className="grid grid-cols-6 gap-4 border-b border-[#d0e3ef] bg-[#f4f9fd] px-5 py-4">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-3 w-16 max-w-full rounded bg-[#dcebf5]" />)}
          </div>
          {Array.from({ length: 3 }, (_, row) => (
            <div key={row} className="grid grid-cols-6 gap-4 border-b border-[#e1eef6] px-5 py-7 last:border-0">
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-3 w-24 max-w-full rounded bg-[#e7f3fb]" />)}
            </div>
          ))}
        </div>
        <div className="ml-auto h-11 w-56 max-w-full rounded-lg bg-[#dcebf5]" />
      </div>
    </div>
  );
}

function UserField({
  name,
  label,
  type = "text",
  value,
  required = true,
  autoComplete = "off",
  hint,
  maxLength,
  errors,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string;
  required?: boolean;
  autoComplete?: string;
  hint?: string;
  maxLength?: number;
  errors: ValidationErrors;
}) {
  const Input = type === "password" ? PasswordInput : "input";
  return (
    <div>
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <div className="relative mt-2">
        <Input
          className={type === "password" ? "" : "input"}
          id={name}
          name={name}
          type={type}
          defaultValue={value ?? ""}
          required={required}
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={`${name}-help ${name}-error`}
        />
      </div>
      <small id={`${name}-help`} className="mt-1 block text-[#777]">
        {hint}
      </small>
      <small id={`${name}-error`} className="mt-1 block text-red-700">
        {errors[name]?.join(" ")}
      </small>
    </div>
  );
}
