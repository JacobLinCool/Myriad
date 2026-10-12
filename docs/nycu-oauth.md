# NYCU 登入與部署

學生在「作答身分」選擇「使用 NYCU 帳號登入」，完成校方授權後回到原本考試頁面；也可填寫學號或名稱，選擇「以訪客身分作答」。切換時保存目前草稿，再載入新身分的草稿。

## 校方應用程式設定

依 [NYCU OAuth 官方文件](https://id.nycu.edu.tw/docs/) 填寫：

| 欄位                     | 值                                                          |
| ------------------------ | ----------------------------------------------------------- |
| Name                     | Myriad                                                      |
| Client type              | Public                                                      |
| Authorization grant type | Authorization code                                          |
| Redirect uris            | `https://judge.nycu.ai/api/auth/nycu/callback`              |
| 名稱（中文）             | Myriad 程式設計考試平台                                     |
| 名稱（英文）             | Myriad                                                      |
| 描述（中文）             | 重新想像程式設計考試與即時線上判題。                        |
| 描述（英文）             | Reimagining programming exams and real-time online judging. |

Client id、Client secret 使用校方核發的值。應用程式請求 `profile` scope，以校方回傳的 `username` 作為 NYCU 身分；此欄位代表校方帳號。若需姓名或其他校務資料，須另申請對應 scope。

本機測試時，將實際 callback 另外加入 Redirect uris，每個網址一行，例如 `http://localhost:8791/api/auth/nycu/callback`。校方是否允許 localhost 由其註冊規則決定；正式環境使用上表 HTTPS 網址。

## Cloudflare 設定

`apps/worker/wrangler.jsonc` 已設定 `judge.nycu.ai` custom domain、`APP_ORIGIN` 與 client ID。部署帳戶須管理 `nycu.ai` zone；D1 的 `database_id` 須換成實際資源 ID，並確認 R2 bucket 已建立。

在 Worker 目錄執行，依提示輸入憑證：

```sh
cd apps/worker
pnpm exec wrangler secret put NYCU_CLIENT_SECRET
pnpm exec wrangler secret put ADMIN_TOKEN
pnpm exec wrangler secret put ATTEMPT_SECRET
pnpm exec wrangler d1 migrations apply myriad_d1 --remote
cd ../..
pnpm build
pnpm test
pnpm --filter=@myriad/worker exec wrangler deploy
```

既有環境沿用既有 `ADMIN_TOKEN`、`ATTEMPT_SECRET`，新增 OAuth secret 即可。`ATTEMPT_SECRET` 至少 32 字元，考試期間保持穩定。新建環境依管理者操作手冊設定 `ADMIN_IDENTITIES`、授予建立考試許可，並由登入者建立個人 CLI 憑證；平台管理員上傳工具鏈，考試擁有者上傳已驗證的考試 bundle。

Wrangler 本機使用 `local` 環境，讓請求保留本機網址。`pnpm dev:worker` 讀取 `.dev.vars` 的 `APP_ORIGIN`，自動以相同連接埠啟動；`pnpm dev:web` 的 API proxy 也指向這個網址。改用其他連接埠時只需修改 `APP_ORIGIN`，並把對應 callback 加入校方 Redirect uris。從其他網址（例如 `127.0.0.1` 或另一個連接埠）按下 NYCU 登入，會回到原頁面並提示應使用的網址，不會開始授權流程。

本機使用被 Git 忽略的 `apps/worker/.dev.vars`：`APP_ORIGIN` 填實際本機 origin，另填 `NYCU_CLIENT_ID`、`NYCU_CLIENT_SECRET`。secret 只由 Worker 讀取。正式環境的 OAuth secret 使用 Wrangler secret 保存。

## 身分與驗收

- NYCU session 使用 24 小時 HttpOnly cookie；資料庫保存 session 雜湊。校方 access token 僅用於登入當次讀取帳號。
- Authorization code 流程使用一次性 state 與 S256 PKCE；callback 消耗 state 後才建立 session。異常或取消時回到原考試頁面，提供重新登入與訪客作答。
- 訪客與 NYCU 使用分開的 participant ID。即使顯示文字相同，提交冷卻、摘要、草稿、編輯器復原紀錄及管理端分數皆分開。管理者可看到登入方式與裝置關聯。
- `0006_student_auth.sql` 將既有自行填寫身分標記為訪客，並保留提交。
- 同一個 NYCU session 可進入管理工作台；是否可建立考試、管理特定考試或授予建立考試許可，由各自的權限判定。個人 CLI token 沿用相同帳號權限。

自動測試使用真實本機 Worker／D1 與隔離的校方 OAuth 回應，涵蓋 state、回呼重放、取消、逾期、跨站登出與身分隔離。正式上線驗收需由持有 NYCU 帳號的人完成一次校方登入，確認帳號顯示、返回原題目、重新整理保留身分、訪客切換及考試提交。


## 平台管理員

在 Worker 設定 `ADMIN_IDENTITIES` 為 JSON 字串，例如 `[{"provider":"nycu","subject":"admin-username"}]`（本機放 `.dev.vars`，正式環境使用 Worker 變數或 secret）。此設定比對驗證完成的 OAuth 帳號，並非從 NYCU profile 推測管理角色。未設定時不會有 OAuth 平台管理員，平台 `ADMIN_TOKEN` 仍可用於初始化。不要將 `ADMIN_TOKEN` 配發給助教。

平台管理員從管理工作台（`/teacher`）使用 NYCU 登入，授予其他帳號建立考試的許可。受邀的共同管理者即使沒有建立許可，仍能管理獲邀的考試。OAuth 返回網址允許 `/teacher` 與既有考試頁面；API 對 cookie 認證的寫入檢查同源 Origin。
