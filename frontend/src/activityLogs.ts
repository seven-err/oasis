import { apiRequest } from "./auth";

export type ActivityLog = {
  id: number;
  action: string;
  description: string;
  user: { name: string } | null;
  created_at: string;
};

export async function loadActivityLogs(all = false): Promise<ActivityLog[]> {
  const logs: ActivityLog[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const result = await apiRequest<{ data: ActivityLog[]; last_page: number }>(`/activity-logs?page=${page}`);
    logs.push(...result.data);
    lastPage = result.last_page;
    page += 1;
  } while (all && page <= lastPage);
  return logs;
}
