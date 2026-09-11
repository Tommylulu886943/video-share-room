const origin = "https://video-share-room.vercel.app";

export async function request(path, options = {}) {
  const response = await fetch(origin + path, { ...options, credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    const error = new Error(response.status === 401
      ? "請先登入場邊，再重新載入社團。如果已登入，請確認 Chrome 允許插件存取場邊網站與登入 Cookie。"
      : body?.error || `無法完成請求（${response.status}），請稍後重試。`);
    error.status = response.status;
    throw error;
  }
  return body.data;
}

export function createVideo(slug, url, title) {
  if (!slug) throw new Error("請先選擇社團");
  return request(`/api/t/${encodeURIComponent(slug)}/videos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ youtube: url, title, visibility: "PUBLIC" }),
  });
}
