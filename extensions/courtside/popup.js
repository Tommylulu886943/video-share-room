/* global chrome */
import { importUrl, webUrl } from "./urls.mjs";

const url = document.querySelector("#url");
const title = document.querySelector("#title");
const status = document.querySelector("#status");
const button = document.querySelector("#submit");

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    title.value = (tab?.title || "").slice(0, 140);
    try { url.value = webUrl(tab?.url || "").href; }
    catch { status.textContent = "此分頁無法直接匯入，請貼上 HTTP(S) 網址。"; }
  } catch { status.textContent = "無法讀取分頁，請手動填寫網址與標題。"; }
  finally { button.disabled = false; }
}

document.querySelector("#import-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = "";
  try {
    const target = importUrl(url.value, title.value);
    await chrome.tabs.create({ url: target });
    window.close();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "開啟匯入頁失敗，請重試。";
    button.disabled = false;
  }
});

initialize();
