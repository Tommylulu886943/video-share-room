# 場邊 Courtside

多運動社團（劍道、羽球…）的影片平台，具備**會員審核**、**分類／標籤**、**分級觀看權限**與**多租戶資料隔離**。實作自產品規格書 v0.2（FR-1～FR-5、D1～D11）。

## 技術架構

| 層 | 採用 |
|---|---|
| 框架 | Next.js 16（App Router，全端） + React 19 + TypeScript |
| 樣式 | Tailwind CSS v4（mobile-first），每個社團套用自己的品牌主色 `--brand` |
| 資料庫 | SQLite + Prisma 7（`@prisma/adapter-better-sqlite3`） |
| 認證 | 自建 session：`jose` 簽發 JWT，存於 httpOnly cookie；`bcryptjs` 雜湊密碼 |
| 郵件 | `nodemailer`；開發預設 `console` provider（信件輸出到主控台與 `./.mail/`），可切換 SMTP |
| 驗證 | `zod` |

## 快速開始

Chrome 快速匯入插件已放在 [`extensions/courtside`](extensions/courtside/README.md)：可帶入目前頁面的網址與標題，選擇社團並記住預設 tenant。YouTube、Bilibili、Instagram 使用既有播放器，其他 HTTP(S) 網頁儲存為原站連結。

```bash
npm install
npx prisma migrate dev      # 建立 SQLite 結構（或 npm run db:migrate）
npm run db:seed             # 匯入種子資料（兩個社團 + 範例）
npm run dev                 # http://localhost:3000
```

> 環境變數見 `.env`。`EMAIL_PROVIDER=console`（預設）時，所有寄出的信會印在主控台並寫入 `./.mail/*.html`，方便在沒有 SMTP 的情況下測試驗證信、審核通知信。要真的寄信改成 `EMAIL_PROVIDER=smtp` 並填 `SMTP_*`。

## 種子帳號（密碼皆為 `password123`，除另註明）

| 帳號 | 角色 |
|---|---|
| `superadmin` / `superadmin123` | Super Admin（平台管理，可建立社團、指派管理者） |
| `kendo_admin` | 基隆劍道 管理者 |
| `badminton_admin` | 橘郡羽球 管理者 |
| `kendo_taro` | 基隆劍道 成員（**在受限影片授權名單內**） |
| `kendo_hana` | 基隆劍道 成員（**不在授權名單，看不到該受限影片**） |
| `multi` | 同時是兩個社團的成員 → 左上角會出現**社團切換器** |

種子也建立了待審申請（讓管理者後台有東西可審）、兩層分類、標籤，以及公開＋受限的範例影片。

## 需求對應

- **FR-1 註冊與審核**：`/register` 送出 → 寄 email 驗證信（`src/lib/tokens.ts`）→ 點連結 `/verify-email` 才轉為 `PENDING` 並通知該社團管理者（D3 每社團一位）→ 管理者於 `/t/[slug]/admin/members` 核可／拒絕，結果以 email 通知（D1）；被拒可重新申請（D2）。未驗證者不進入待審佇列（狀態 `PENDING_VERIFICATION`）。
- **FR-2 分類與標籤**：分類兩層階層（D5，`src/lib/categories.ts`），標籤只有管理者可建立（D4）；看板可依分類／標籤／關鍵字篩選（`src/app/t/[slug]/page.tsx` + `BoardFilters`）。
- **FR-3 受限影片**：方式 A 指定名單（D6）。後端 `viewableVideoWhere`／`canViewVideo`（`src/lib/access.ts`）確保未授權成員在看板、搜尋、直接網址都**看不到也拿不到**（直接開網址回 404）。影片來源為 YouTube 不公開連結（D11）。**只有管理者可上傳**（D10）。
- **FR-4 多租戶**：每個請求由 `resolveTenantContext` 在伺服器端強制隔離（`src/lib/tenant.ts`）；每社團獨立品牌（D8）；左上角切換器僅在使用者有多個社團時顯示（D9，`TenantSwitcher`）；一個帳號可跨社團（D7）。Super Admin 於 `/admin` 建立社團與指派管理者。
- **FR-5 跨裝置**：mobile-first 版面，影片牆 1→2→3 欄自適應，後台表格在桌機可橫向捲動。

## 逐字稿與繁中翻譯（YouTube 影片）

播放頁右側的逐字稿面板可按需「取得逐字稿並翻譯」，結果存回該筆平台影片，重新整理後仍可讀取。不會自動對既有收藏批次處理。

- **原文**（`src/lib/transcript.ts`）：依指定語言，或 YouTube 標示為 *original* 的音軌語言判定原文（AI 配音音軌的自動字幕不會被當成原文）；同語言內人工字幕優先、其次自動字幕；無法判定時請使用者選擇。確認沒有合適字幕時才走 ASR（`scripts/asr/transcribe.py`，yt-dlp + faster-whisper，需設定 `TRANSCRIPT_ASR_COMMAND`）。無字幕／缺指定語言／來源受限／音訊取得失敗／ASR 失敗分別回報。
- **翻譯**（`src/lib/transcript-translate.ts`）：分批逐段翻譯，模型只回傳 `{id, text}`；段落 ID 缺漏、重複或多出都會重試／拆批，最終仍不一致就標示失敗，不會冒充完整翻譯。時間一律取自原文。Provider 可選：NVIDIA NIM（`NVIDIA_API_KEY`，免費開發者金鑰，有速率限制、限開發評估用途）、Claude（`ANTHROPIC_API_KEY`）、或任何 OpenAI 相容端點（`TRANSCRIPT_TRANSLATE_PROVIDER=openai` + `TRANSCRIPT_TRANSLATE_BASE_URL`）。詳見 `.env.example`。
- **資料**：`VideoTranscript`（每次內容不同就新增 `version`，內容相同則沿用）、`VideoTranscriptTranslation`（綁定某一版原文）、`TranscriptJob`（狀態、錯誤、去重、租約）。成功內容與工作狀態分開：更新失敗仍顯示上一份成功結果。
- **背景工作**（`src/lib/transcript-jobs.ts`）：API 以 Next `after()` 在回應後執行（`maxDuration = 300`）；同影片＋來源＋語言（翻譯為同原文版本＋目標語言）只會有一個進行中的工作；租約＋心跳避免舊工作覆寫，逾時的工作會在查詢狀態時接續（最多 3 次），翻譯已完成的批次會保留續做。寫回前再次確認影片仍存在、來源未更換、沒有更新的結果。
- **正式環境連線**：YouTube 會擋雲端主機（Vercel 等）IP，回應「Sign in to confirm you're not a bot」，此時回報 `youtube_blocked`（與影片本身受限的 `source_restricted` 分開）。兩種解法（`src/lib/youtube-fetch.ts`）：`YOUTUBE_COOKIES`（分身帳號的登入 cookie；被擋時改以登入的 TV client 重試，網頁版 client 的字幕需要 PO token 所以不用；失效回報 `youtube_auth_failed`；`npx tsx scripts/youtube-cookie-check.ts` 可實測），或 `YOUTUBE_PROXY_URL`（住宅代理，所有 YouTube 請求改走代理）。
- **權限**：沿用 `viewableVideoWhere`；同一個 YouTube 影片在不同社團各自保存。任何能看影片的成員可觸發；強制重新取得／重新翻譯限可上傳成員與管理者。
- **實測**：`npx tsx scripts/transcript-live-check.ts "<YouTube 網址>"` 會用暫存資料庫跑真實 YouTube（與已設定的 LLM／ASR）並列出 `t=` 附近的段落。

### 時間戳筆記

播放頁的「筆記」區（寬螢幕在影片左側、中等寬度在影片下方、手機版在逐字稿下方）讓成員針對某個時間點記下 **心得／要點／關注點**，每則顯示作者與時間；逐字稿每行可點「＋」直接記在該段，有筆記的行會標出數量，點時間戳可跳轉播放。

- **資料**：`VideoNote`（`videoId`、`authorId`、`kind`、`startMs`、`body`）。以原文時間軸的整數毫秒定位，不綁段落 ID，所以重新取得逐字稿後筆記仍落在同一時間點的段落。作者帳號刪除時筆記保留（顯示「已刪除的使用者」），影片刪除時一併刪除。
- **權限**（`src/lib/video-notes-store.ts`）：能看影片的成員都能看到全部筆記並新增；只有作者能編輯；作者或社團管理者能刪除。API：`GET/POST /api/t/[slug]/videos/[id]/notes`、`PATCH/DELETE …/notes/[noteId]`。

## 權限模型（伺服器端強制）

`src/lib/api.ts` 的 `requireTenantContext(slug, { admin })` 與頁面端 `pageTenantContext` 是單一事實來源：Guest／Pending 無法檢視內容；Member 可看公開＋被授權的受限影片；Tenant Admin 可管理單一社團；Super Admin 跨社團。所有帶 id 的路由都會檢查該資源屬於 URL 中的社團，避免跨租戶 IDOR。

## 專案結構

```
prisma/schema.prisma      資料模型（Tenant/User/Membership/Video/VideoAccess/Category/Tag/Token）
prisma/seed.ts            種子資料
src/lib/                  auth, session, tenant, access, api, validation, videos, members, tokens, ...
src/app/api/              JSON API（auth、t/[slug]/*、admin/tenants）
src/app/t/[slug]/         社團外殼、看板、播放頁、admin/*
src/app/{login,register,verify-email,join,pending}  公開頁
src/app/admin/            Super Admin 平台管理
src/components/           UI 元件
```

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` / `npm start` | 正式建置／啟動 |
| `npm run typecheck` | TypeScript 檢查 |
| `npm run db:seed` | 重新匯入種子（會清空既有資料） |
| `npm run db:reset` | 重置資料庫並套用 migration |
| `npm run db:studio` | Prisma Studio 檢視資料 |

## 尚未涵蓋（規格非目標／後續）

影片剪輯／直播、金流、社交功能皆為本期非目標。受限影片採 YouTube 不公開（D11，弱鎖定：連結被轉傳仍可看），若需「真正鎖定」需改私有代管 + 簽章網址。
