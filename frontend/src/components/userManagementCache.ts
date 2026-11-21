import { getSession } from "../auth.ts";

export type Role = { id: number; name: string; slug: string };
export type User = {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role: Role | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  last_login_at: string | null;
};
export type UserList = {
  data: User[];
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
};

// Keep only the most recently visited list; never persist account data to browser storage.
let cached: {
  endpoint: string;
  session: ReturnType<typeof getSession>;
  list: UserList;
} | null = null;

export function getCachedUserList(endpoint: string): UserList | null {
  if (!cached || cached.session !== getSession() || !getSession()) {
    cached = null;
    return null;
  }
  return cached.endpoint === endpoint ? cached.list : null;
}

export function cacheUserList(endpoint: string, list: UserList) {
  cached = { endpoint, list, session: getSession() };
}

export function clearUserListCache() {
  cached = null;
}
