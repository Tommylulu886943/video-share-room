# 部署到 Vercel + Turso

本專案的資料庫層使用 **libSQL**：本機開發走 SQLite 檔案，正式環境走 **Turso**（SQLite 相容、serverless 友善，Vercel 必須用這種）。切換完全由環境變數決定，程式不用改。

## 1. 建立 Turso 資料庫

```bash
# 安裝 Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash      # mac 亦可 brew install tursodatabase/tap/turso
turso auth signup                                    # 或 turso auth login

turso db create film-room
turso db show film-room --url                        # → libsql://film-room-xxxx.turso.io
turso db tokens create film-room                     # → 一長串 token
```

記下這兩個值：`TURSO_DATABASE_URL`（libsql://...）與 `TURSO_AUTH_TOKEN`。

> 不想用 CLI 也行：到 https://app.turso.tech 用網頁建立 database,一樣能拿到 URL 與 token。

## 2. 把資料表結構套到 Turso（免 Turso CLI）

repo 內附的 `npm run db:push:turso` 會用 libSQL 直接把 Prisma migration SQL 套到 `TURSO_DATABASE_URL`：

```bash
TURSO_DATABASE_URL="libsql://film-room-xxxx.turso.io" \
TURSO_AUTH_TOKEN="<token>" \
npm run db:push:turso
```

## 3. 建立第一個管理者（正式版 seed）

`npm run db:seed:prod` 只會建立 super admin、**不會清空任何資料**(可安全重跑)。真正的社團之後登入 `/admin` 用 UI 建立：

```bash
TURSO_DATABASE_URL="libsql://film-room-xxxx.turso.io" \
TURSO_AUTH_TOKEN="<token>" \
SEED_SUPERADMIN_USERNAME="superadmin" \
SEED_SUPERADMIN_EMAIL="you@example.com" \
SEED_SUPERADMIN_PASSWORD="<強密碼>" \
npm run db:seed:prod
```

> （`npm run db:seed` 是含「基隆劍道 / 橘郡羽球」示範資料的**開發用** seed,且會清空資料 —— 正式環境請用上面的 `db:seed:prod`。）

## 4. 在 Vercel 部署

1. push 到 GitHub（已完成）。
2. vercel.com → **New Project** → 匯入 `video-share-room`。框架會自動辨識為 Next.js。
3. 設定 **Environment Variables**（Production）：

| 變數 | 值 |
|---|---|
| `TURSO_DATABASE_URL` | libsql://film-room-xxxx.turso.io |
| `TURSO_AUTH_TOKEN` | （步驟 1 的 token） |
| `AUTH_SECRET` | `openssl rand -base64 48` 產生的隨機字串（**必填、≥32 字**，沒設正式環境會拒絕啟動） |
| `APP_URL` | https://你的網域.vercel.app（email 驗證連結會用，務必填正式網域） |
| `APP_NAME` | 場邊 Courtside |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | 從 https://resend.com/api-keys 建立 |
| `EMAIL_FROM` | 場邊 Courtside \<onboarding@resend.dev\>（測試用）或你在 Resend 驗證過網域的寄件地址 |
| `YOUTUBE_COOKIES` | （正式環境取得逐字稿，二擇一）YouTube 登入 cookie：**請用專用的分身 Google 帳號**（可能被 YouTube 限制）。值為 youtube.com 請求的 `cookie` 標頭（一行）或 cookies.txt；設為 Sensitive。被擋時改用登入的 TV client 重試；失效時頁面會顯示「cookie 可能已過期」 |
| `YOUTUBE_PROXY_URL` | （正式環境取得逐字稿需要）YouTube 會擋雲端主機 IP（顯示「要求驗證不是機器人」），需透過住宅代理連線，格式 `http://帳號:密碼@主機:埠` |
| `NVIDIA_API_KEY` 或 `ANTHROPIC_API_KEY` | （選填）逐字稿繁中翻譯用（其他選項見 `.env.example`）；未設定時仍可取得原文，翻譯狀態顯示「翻譯服務未設定」。NVIDIA 免費金鑰限開發評估用途、有速率限制，正式長期使用請改付費方案或自架 NIM |

4. Deploy。

## 重要注意事項

- **`prisma generate` 已自動執行**（`postinstall` 與 `build` 內），Vercel 不用額外設定。
- **Email 在 Vercel 一定要用 Resend**（`EMAIL_PROVIDER=resend` + `RESEND_API_KEY`）：`console` provider 會寫本機檔案，serverless 環境無持久檔案系統。沒設不會讓網站崩潰（寄信失敗會被吞掉），但**註冊驗證信與審核通知信會寄不出去** → 新會員無法完成 email 驗證。
  - 測試階段 `EMAIL_FROM` 可用 `onboarding@resend.dev`（限寄給你自己的 Resend 帳號 email）；要寄給任何人，需在 Resend 後台**驗證你的網域**並把 `EMAIL_FROM` 改成該網域的地址。
  - 程式走 Resend 的 HTTP API（非 SMTP），在 Vercel serverless 上最穩定。
- 之後 schema 有變動時：本機 `npm run db:migrate` 產生新的 migration，再帶 `TURSO_*` 跑 `npm run db:push:turso` 套到 Turso。
- `.env` 與 `dev.db` 不會進 git；秘密只放在本機 `.env` 與 Vercel 環境變數。
- **筆記**：`20261109000000_video_notes` migration 新增 `VideoNote` 表，同樣用 `npm run db:push:turso` 套到 Turso。
- **逐字稿**：新增的 `20261108000000_transcript_jobs` migration 需同樣用 `npm run db:push:turso` 套到 Turso（會移除舊的 `Transcript` 快取表）。背景處理在 API 回應後以 `after()` 執行，路由 `maxDuration` 為 300 秒。ASR（無字幕時的語音辨識）需要能執行 Python 的主機，Vercel serverless 上不提供；未設定時會如實回報「未設定語音辨識」。
