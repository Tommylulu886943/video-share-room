# 不公開社團與成員自訂欄位

- 平台管理 → 建立社團：勾選「不公開社團」，新增最多 10 個文字欄位，逐一設定必填。管理者也需提供必填資料。
- 新社團沒有預設級數。既有社團經 migration 後保留「級數」及原資料。
- 不公開社團不出現在註冊／加入清單。非核可成員無法透過社團網址或 API 讀取社團，平台管理者保留管理權限。
- 社團管理 → 會員審核 → 邀請成員：指定已註冊帳號或 Email，填入成員名稱及欄位，產生邀請碼。管理者自行私下交付，系統不自動寄信。
- 受邀者以指定帳號登入，在「加入社團」貼上邀請碼並接受，才會成為核可成員。接受前不顯示社團資訊。
- 邀請碼 7 天到期、限用一次、綁定帳號；重新邀請使舊碼失效，也可在會員管理撤銷。發出邀請的人失去管理權後，該邀請也無法使用。

## 資料庫更新

部署程式前須套用 `prisma/migrations/20260908010000_private_clubs_member_fields/migration.sql`。
它新增 `Tenant.isPrivate`、`Tenant.memberFields`、`Membership.attributes` 與 `Invitation`，並保留既有社團的級數定義。
使用既有 migration 管理流程，勿直接重建資料庫。若使用 `scripts/apply-turso.ts`，請確認既有資料庫已有正確的 `_applied_migrations` 紀錄；該腳本的舊有 bootstrap 行為會把所有 migration 標為已套用，因此未追蹤的資料庫應先核對實際 schema 和歷史紀錄。

## 驗證

`npm run typecheck`、`npm run lint`、`npx tsx scripts/private-clubs.test.ts`。
整合測試在專案同層建立獨立暫存專案及 SQLite 資料庫，以 3219 port 啟動 Next.js，結束後停止測試伺服器，保留測試資料供查核。完全不使用正式資料庫或寄信服務。
