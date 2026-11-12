export class ApiError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(String(body.error ?? `HTTP ${status}`));
  }
}

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

export interface Me { username: string; totp: boolean }
export interface DeviceInfo {
  id: string; name: string; description: string; icon: string;
  url: string | null; lan: string; wol: boolean;
}
export interface LinkItem {
  name: string; url: string; description?: string; icon?: string; status?: string;
}
export interface Dashboard {
  title: string;
  devices: DeviceInfo[];
  links: { group: string; items: LinkItem[] }[];
}
export type StatusMap = Record<string, { up: boolean; ms: number | null }>;

export function navigate(to: string) {
  history.pushState(null, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
}
