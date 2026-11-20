import { useEffect, useState, type FormEvent } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { apiRequest, getSession } from "../auth";
import { PaginationBar } from "../modules/checks/ui";
import { recordRowClick } from "./recordRowClick";
import { useHeaderBack } from "./HeaderBack";
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
  const match = url.pathname.match(/^\/users\/(\d+)(\/edit)?\/?$/);
  const creating = url.pathname === "/users/create";
  const editing = Boolean(match?.[2]);
  const form = creating || editing;
  const details = Boolean(match && !editing);
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
    window.history.pushState({}, "", next);
    setCredentials(null);
    setPath(next);
    window.scrollTo({ top: 0 });
  }
  useHeaderBack(form || details || credentials ? () => navigate("/users") : undefined, saving);

  useEffect(() => {
    const back = () => {
      setCredentials(null);
      setPath(window.location.pathname + window.location.search);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

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
    const payload = Object.fromEntries(new FormData(event.currentTarget));
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
    } finally {
      setSaving(false);
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
    <section className="space-y-4" aria-busy={loading || saving}>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {credentials ? (
        <div className="panel max-w-2xl p-5 sm:p-6">
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
      ) : loading ? (
        <p role="status" className="p-5 text-sm text-[#777]">
          Loading accounts…
        </p>
      ) : form && (creating || user) ? (
        <div className="panel max-w-2xl p-5 sm:p-6">
          <h2 className="mb-5 text-base font-semibold">{heading}</h2>
          <form key={path} className="space-y-5" onSubmit={save}>
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
                  <small className="mt-1 block text-[#777]">You cannot change your own role.</small>
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
            <div className="flex flex-wrap gap-3 border-t border-[#e1eef6] pt-5">
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
            </div>
          </form>
        </div>
      ) : details && user ? (
        <>
          <button className="text-link" onClick={() => navigate("/users")}>
            ← Back to accounts
          </button>
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
                <span
                  className={`rounded-full px-3 py-1 text-xs ${user.is_active ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-600"}`}
                >
                  {user.is_active ? "Active" : "Inactive"}
                </span>
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
              <form className="space-y-5" onSubmit={(event) => void save(event, true)}>
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
          <form
            key={path}
            className="panel grid items-end gap-4 p-5 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const query = new URLSearchParams(
                Array.from(new FormData(event.currentTarget), ([name, value]) => [
                  name,
                  String(value),
                ]),
              );
              navigate("/users?" + query.toString());
            }}
          >
            <label>
              <span className="field-label">Search name or email</span>
              <input
                className="input mt-2"
                name="search"
                defaultValue={url.searchParams.get("search") ?? ""}
                maxLength={255}
              />
            </label>
            <label>
              <span className="field-label">Role</span>
              <select
                className="input mt-2"
                name="role"
                defaultValue={url.searchParams.get("role") ?? ""}
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
                defaultValue={url.searchParams.get("status") ?? ""}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <button className="secondary-btn">
              <SlidersHorizontal size={15} aria-hidden="true" /> Filter
            </button>
          </form>
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
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <div className="relative mt-2">
        <input
          className={`input ${type === "password" ? "pr-16" : ""}`}
          id={name}
          name={name}
          type={visible ? "text" : type}
          defaultValue={value ?? ""}
          required={required}
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={`${name}-help ${name}-error`}
        />
        {type === "password" && (
          <button
            type="button"
            className="absolute inset-y-0 right-3 text-xs text-[#1f6ea6]"
            onClick={() => setVisible(!visible)}
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={visible}
            aria-controls={name}
          >
            {visible ? "Hide" : "Show"}
          </button>
        )}
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
