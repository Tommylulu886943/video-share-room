/* global chrome */
import { webUrl } from "./urls.mjs";
import { request, createVideo } from "./api.mjs";

const url = document.querySelector("#url");
const title = document.querySelector("#title");
const status = document.querySelector("#status");
const button = document.querySelector("#submit");
const tenant = document.querySelector("#tenant");
const reload = document.querySelector("#reload");
const login = document.querySelector("#login");
const result = document.querySelector("#result");
let busy = false;
let completed = false;

async function loadTenants() {
  reload.disabled = true;
  button.disabled = true;
  tenant.disabled = true;
  tenant.replaceChildren(new Option("請選擇社團", ""));
  status.textContent = "正在載入社團…";
  login.hidden = true;
  try {
    const { tenants } = await request("/api/extension/tenants");
    for (const item of tenants) tenant.add(new Option(item.name, item.slug));
    tenant.value = "";
    tenant.disabled = !tenants.length;
    status.textContent = tenants.length ? "" : "目前沒有可匯入的社團，請聯絡管理者開啟上傳權限。";
  } catch (error) {
    status.textContent = error.message || "無法連線，請重新載入社團。";
    login.hidden = error.status !== 401;
  } finally { reload.disabled = false; }
}
tenant.addEventListener("change", () => { button.disabled = busy || completed || !tenant.value; });
reload.addEventListener("click", loadTenants);

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    title.value = (tab?.title || "").slice(0, 140);
    try { url.value = webUrl(tab?.url || "").href; }
    catch { status.textContent = "此分頁無法直接匯入，請貼上 HTTP(S) 網址。"; }
  } catch { status.textContent = "無法讀取分頁，請手動填寫網址與標題。"; }
  await loadTenants();
}

document.querySelector("#import-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || completed || !tenant.value) return;
  busy = true;
  button.disabled = true;
  reload.disabled = true;
  tenant.disabled = true;
  button.textContent = "匯入中…";
  status.textContent = "";
  try {
    const video = await createVideo(tenant.value, webUrl(url.value).href, title.value.trim());
    completed = true;
    status.textContent = "匯入成功！";
    result.href = `https://video-share-room.vercel.app/t/${encodeURIComponent(tenant.value)}/video/${encodeURIComponent(video.id)}`;
    result.hidden = false;
    title.disabled = true;
    url.disabled = true;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "匯入失敗，請重試。";
    login.hidden = error.status !== 401;
  } finally {
    busy = false;
    button.textContent = completed ? "已匯入" : "匯入場邊";
    button.disabled = completed || !tenant.value;
    tenant.disabled = completed;
    reload.disabled = completed;
  }
});

initialize();
