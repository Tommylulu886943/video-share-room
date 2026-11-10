// Browser-side helper for calling our JSON API ({ ok, data, error } envelope).

async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error || `請求失敗 (${res.status})`);
  }
  return body.data as T;
}

export const apiPost = <T = unknown>(url: string, data?: unknown) =>
  apiFetch<T>(url, { method: "POST", body: JSON.stringify(data ?? {}) });

export const apiPatch = <T = unknown>(url: string, data?: unknown) =>
  apiFetch<T>(url, { method: "PATCH", body: JSON.stringify(data ?? {}) });

export const apiDelete = <T = unknown>(url: string, data?: unknown) =>
  apiFetch<T>(url, { method: "DELETE", body: JSON.stringify(data ?? {}) });
