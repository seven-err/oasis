export type AuthSession = {
  csrfToken: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: "super-admin" | "hr" | "finance";
    roleName: string;
    mustChangePassword: boolean;
    permissions: string[];
  };
};

let session: AuthSession | null = null;

export const pagePaths: Record<string, string> = {
  dashboard: "/dashboard",
  employees: "/hr/alphalist",
  checks: "/checks",
  payables: "/payables",
  receivables: "/receivables",
  users: "/team",
  activity: "/activity",
  profile: "/profile",
  archives: "/archives",
  deleted: "/deleted",
  reports: "/reports",
};

export function setSession(value: AuthSession | null) {
  session = value;
}

export function getSession() {
  return session;
}

export function canAccessPage(page: string) {
  if (!session || session.user.mustChangePassword) return false;
  const permission = { employees: "hr", profile: "account", archives: "users", deleted: "users", reports: "users" }[page] ?? page;
  return session.user.permissions.includes(permission);
}

export function initialPage(pathname: string) {
  if (/^\/users(?:\/(?:create|\d+(?:\/edit)?))?\/?$/.test(pathname)) return 'users';
  return Object.entries(pagePaths).find(([, path]) => path === pathname)?.[0] ?? "dashboard";
}

export function moduleUser<T extends string>(page: string, permissions: T[]) {
  const user = session?.user;
  return {
    id: user?.id ?? 0,
    name: user?.name ?? "",
    email: user?.email ?? "",
    role: user?.roleName ?? "",
    permissions: Object.fromEntries(permissions.map((permission) => [permission, canAccessPage(page)])) as Record<T, boolean>,
  };
}

export async function readSession(): Promise<AuthSession | null> {
  let response: Response;
  try {
    response = await fetch("/auth/session", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new Error("Cannot connect to the sign-in service. Check that the server and database are running, then try again.");
  }
  if (response.status === 401) return null;
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Cannot connect to the sign-in service. Please try again.");
  return response.json();
}

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), "X-CSRF-TOKEN": session?.csrfToken ?? "", ...options.headers },
  });
  if (response.status === 401 || response.status === 419) {
    if (!url.startsWith("/business-")) window.location.assign("/login");
    throw new Error("Please sign in again.");
  }
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.errors ? Object.values(data.errors).flat().join(" ") : data.message ?? "The request could not be completed."), { errors: data.errors });
  return data;
}

export async function logout() {
  const { waitForBusinessSave } = await import("./businessStorage");
  await waitForBusinessSave();
  await apiRequest("/logout", { method: "POST" });
  setSession(null);
  window.location.assign("/login");
}
