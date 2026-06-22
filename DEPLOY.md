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

## 2. 把資料表結構套到 Turso

Prisma 的初始 migration SQL 已在 repo 裡，直接灌進 Turso：

```bash
turso db shell film-room < prisma/migrations/20260621073736_init/migration.sql
```

## 3. 建立第一個管理者（seed）

`npm run db:seed` 會在 `TURSO_*` 有設時直接寫進 Turso。**注意：seed 會清空既有資料**，正式上線只需跑一次來建立 super admin：

```bash
TURSO_DATABASE_URL="libsql://film-room-xxxx.turso.io" \
TURSO_AUTH_TOKEN="<token>" \
SEED_SUPERADMIN_USERNAME="superadmin" \
SEED_SUPERADMIN_EMAIL="you@example.com" \
SEED_SUPERADMIN_PASSWORD="<強密碼>" \
npm run db:seed
```

> 預設 seed 還會建立「基隆劍道 / 橘郡羽球」等示範資料。正式環境若不要這些，請先精簡 `prisma/seed.ts`（只留 super admin），或 seed 後登入 `/admin` 自行刪改、用 UI 建立真正的社團。

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
| `APP_NAME` | Film Room 影片室 |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | 從 https://resend.com/api-keys 建立 |
| `EMAIL_FROM` | Film Room \<onboarding@resend.dev\>（測試用）或你在 Resend 驗證過網域的寄件地址 |

4. Deploy。

## 重要注意事項

- **`prisma generate` 已自動執行**（`postinstall` 與 `build` 內），Vercel 不用額外設定。
- **Email 在 Vercel 一定要用 Resend**（`EMAIL_PROVIDER=resend` + `RESEND_API_KEY`）：`console` provider 會寫本機檔案，serverless 環境無持久檔案系統。沒設不會讓網站崩潰（寄信失敗會被吞掉），但**註冊驗證信與審核通知信會寄不出去** → 新會員無法完成 email 驗證。
  - 測試階段 `EMAIL_FROM` 可用 `onboarding@resend.dev`（限寄給你自己的 Resend 帳號 email）；要寄給任何人，需在 Resend 後台**驗證你的網域**並把 `EMAIL_FROM` 改成該網域的地址。
  - 程式走 Resend 的 HTTP API（非 SMTP），在 Vercel serverless 上最穩定。
- 之後 schema 有變動時：本機 `npm run db:migrate` 產生新的 migration，再 `turso db shell film-room < <新的 migration.sql>` 套到 Turso。
- `.env` 與 `dev.db` 不會進 git；秘密只放在本機 `.env` 與 Vercel 環境變數。
