# 場邊 Chrome 插件

## 1.1.0：插件內直接匯入

更新後請在 `chrome://extensions` 重新載入插件，允許存取正式站。插件會載入已登入帳號可上傳的社團；選單每次預設空白，不使用之前的預設社團。選擇社團後點「匯入場邊」即可完成，成功訊息與查看連結直接顯示在插件內，不會自動開啟匯入頁。未登入時可點「登入場邊」，完成後重新開啟插件或點「重新載入社團」。

此版本新增正式站 host permission，透過登入 session 直接呼叫 API，不讀取 Cookie 值。後端需先部署 `/api/extension/tenants`。以下為 1.0 舊版跳頁流程記錄。

1. 正式站 `https://video-share-room.vercel.app/` 需部署包含 `/import` 的新版場邊網站。
2. Chrome 開啟 `chrome://extensions`，啟用「開發人員模式」。
3. 點「載入未封裝項目」，選擇本目錄 `extensions/courtside`（包含 manifest.json）。
4. 固定插件，開啟想匯入的網頁，點「匯入場邊」。插件固定連到正式站 `https://video-share-room.vercel.app/`，不需填寫網站網址。
5. 點「選擇社團並匯入」，在場邊選擇有上傳權限的社團。勾選「將此次選擇設為預設社團」並確認匯入；之後自動預選，也可每次切換。

未登入時在匯入頁登入，登入後保留原網址和標題。預設社團按場邊網站、使用者與瀏覽器分開儲存；撤銷權限後不會再預選失效的社團。切換社團而未勾選預設不會更動原預設。

支援任意 HTTP(S) 網頁：YouTube、Bilibili、Instagram 保留既有嵌入播放；其餘以外部連結保存，在場邊點「開啟原站」。此功能收藏連結，不下載影片，也不繞過原站登入或播放限制。匯入為全社團可見；可於管理介面調整分類與權限。

插件只使用 activeTab，讀取使用者點擊時的分頁網址與標題。內容經新分頁交給場邊的同源匯入表單；插件不讀取登入 cookie，也不需要所有網站的存取權。建立影片仍使用原有上傳 API 的即時權限檢查。不自動提交，避免開啟匯入頁就產生資料。

## 驗證

`npx tsx --test tests/import.test.ts`；`npm run typecheck`；`npm run lint`。

Chrome 手動驗收：YouTube 與一般網站各匯入一次；切換兩個社團；設定預設後關閉再開；登出後透過插件登入繼續；撤銷上傳權限後確認不能匯入；在 chrome:// 頁面確認提示可手動貼上網址。此目錄可直接載入，不需建置；尚未上架 Chrome Web Store。

API 參考：[Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)、[Manifest](https://developer.chrome.com/extensions/manifest)。
