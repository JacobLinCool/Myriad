# NYCU OAuth 登入

NYCU OAuth 是可獨立啟用的登入服務；也可選用 [Google 登入](google-oauth.md)。學生可用啟用服務的帳號登入，或以自行填寫識別的訪客身分作答；管理者以經驗證的帳號取得獲授予的權限。此文件描述自己的 NYCU 應用程式設定，Cloudflare 資源與 secrets 的完整部署流程見 [部署指南](deployment.md)。

## 註冊應用程式

依 [NYCU OAuth 官方文件](https://id.nycu.edu.tw/docs/) 註冊應用程式，取得自己的 client ID 與 client secret：

| 欄位                     | 值                                                                         |
| ------------------------ | -------------------------------------------------------------------------- |
| Client name              | 自己的服務名稱，例如 Myriad                                                |
| Client type              | `Public`                                                                   |
| Authorization grant type | `Authorization code`                                                       |
| Redirect URIs            | `https://judge.example.com/api/auth/nycu/callback`，將網域換成實際部署網址 |

本機測試需另加入實際 callback，例如 `http://localhost:8787/api/auth/nycu/callback`。每個允許的網址都必須登錄；localhost 是否可註冊依校方規則而定。

Myriad 請求 `profile` scope，以回傳的 `username` 作為 NYCU 帳號識別，不從姓名、email 或顯示文字推測權限。要求其他校務資料需另外申請 scope 並修改對應程式。

## 設定 Worker

本機使用被 Git 忽略的 `apps/worker/.dev.vars`：

```dotenv
APP_ORIGIN=http://localhost:8787
NYCU_CLIENT_ID=your-client-id
NYCU_CLIENT_SECRET=your-client-secret
ADMIN_IDENTITIES=[{"provider":"nycu","subject":"your-username"}]
```

保留同一檔案中已設定的 `ADMIN_TOKEN` 和 `ATTEMPT_SECRET`。正式環境將 `APP_ORIGIN`、`NYCU_CLIENT_ID` 和 `ADMIN_IDENTITIES` 放入自己的 production 設定，將 `NYCU_CLIENT_SECRET` 設為 Worker secret：

```sh
pnpm --filter=@myriad/worker exec wrangler secret put NYCU_CLIENT_SECRET --config wrangler.production.jsonc
```

NYCU 登入需要同時設定 `APP_ORIGIN`、`NYCU_CLIENT_ID` 和 `NYCU_CLIENT_SECRET`。僅使用 NYCU 的部署將 `FIREBASE_PROJECT_ID` 和 `FIREBASE_API_KEY` 留空即可，不需建立 Firebase 專案。

`APP_ORIGIN` 必須是單一 origin：無路徑、結尾斜線或 query。正式環境使用 HTTPS；本機僅接受 `localhost` 或 `127.0.0.1` 的 HTTP origin。瀏覽器實際使用的主機與連接埠必須一致，不能混用這兩個主機名稱。

`pnpm dev:worker` 依 `.dev.vars` 中 `APP_ORIGIN` 的連接埠啟動，預設為 8787。`pnpm dev:web` 提供另一個 Vite origin 並代理 API；完整登入與 cookie 寫入流程應在 Worker origin 驗收。從其他 origin 啟動登入時，應用程式會提示正確的網址。

## 平台管理員與出題者

`ADMIN_IDENTITIES` 是由部署者設定的 `(provider, subject)` 清單，比對經驗證的 OAuth 帳號。NYCU profile 不包含 Myriad 管理角色。未設定清單時，不會有 OAuth 平台管理員，獨立的 `ADMIN_TOKEN` 仍可用於授予建立許可及上傳工具鏈。

平台管理員登入 `/teacher`，在「帳號與權限」授予自己或其他帳號建立考試許可。具有建立許可的帳號才能建立新考試並成為 owner；owner 可以邀請共同管理者。受邀者不需要建立許可，也只能管理獲邀的考試。

出題者登入後可建立可撤銷的個人 CLI 憑證，CLI 使用 `MYRIAD_TEACHER_TOKEN` 或 `--token-file`。不要將平台 `ADMIN_TOKEN` 配發給一般出題者。更多權限與 CLI 操作見 [管理者手冊](agent-workflow.md)。

## Session 與驗收

- 授權使用一次性 state 與 S256 PKCE，callback 消耗有效 state 後才建立 session。
- NYCU session 使用 24 小時 HttpOnly cookie，資料庫保存 session 雜湊。校方 access token 僅用於當次讀取帳號。
- 訪客、NYCU 與 Google 身分使用不同 participant ID，草稿、提交、摘要、冷卻和成績不因相同顯示文字而合併。
- 同一個 NYCU session 可用於學生及管理介面，管理權限由每次請求另外檢查；cookie 管理寫入需符合 Origin 檢查。
- 異常、取消或逾期登入會返回應用程式並顯示錯誤，使用者可重新登入或改用訪客作答。

自動測試使用本機 Worker／D1 和隔離的 OAuth 回應，涵蓋 state、callback 重放、取消、逾期、跨站登出與身分隔離。正式驗收需由持有 NYCU 帳號的人完成真實登入，確認返回原頁面、帳號識別、重新整理後保留 session、訪客切換、考試提交及管理權限。
