# 透過 Firebase Authentication 使用 Google 登入

Google 登入是可選的服務，學生與管理者都能使用。Myriad 透過 Firebase Authentication 的 REST 授權流程登入，由 Worker 驗證 Firebase ID token，再建立本站 session。未設定 Firebase 時不顯示 Google 登入；現有 NYCU 部署不需新增設定。

## 設定 Firebase 與 Google

1. 在 [Firebase Console](https://console.firebase.google.com/) 建立或選擇專案，在 **Authentication → Sign-in method** 啟用 **Google**，設定支援聯絡方式。取得專案 ID 與 Web API key，供下方 Worker 設定使用。
2. 在 **Authentication → Settings → Authorized domains** 加入 Myriad 的主機名稱，例如 `judge.example.com`。本機測試另加 `localhost`；新專案不會預設允許它。正式與測試環境使用不同專案。[Firebase 設定說明](https://firebase.google.com/docs/auth/faq-and-troubleshooting)
3. 在 Google provider 的設定中確認使用的 Web OAuth client，前往同一專案的 [Google Cloud Console](https://console.cloud.google.com/) 編輯該 client 的 **Authorized redirect URIs**，加入完整 Myriad callback，例如 `https://judge.example.com/api/auth/google/callback`；測試專案則加入 `http://localhost:8787/api/auth/google/callback`。Firebase provider 保存的 client ID 與 secret 必須對應這個 Web client。

Myriad 將自己的 callback 作為 REST `createAuthUri` 的 `continueUri`，讓 Google 直接回到 Worker，再由 Worker 呼叫 `signInWithIdp` 完成登入。因此必須登錄上述 Myriad callback；Firebase JS SDK 使用的 `/__/auth/handler` 不會替代它。此流程不需 Firebase Hosting、瀏覽器 SDK 或登入代理。[Firebase REST 授權契約](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/createAuthUri)、[Google redirect URI 規則](https://developers.google.com/identity/protocols/oauth2/web-server)

Google OAuth consent screen 的 **Audience** 應符合使用對象：公開服務使用 External；Internal 限該組織帳號。對外服務需完成自己的網站、隱私政策與聯絡資料，發布應用程式並完成 Google 要求的驗證。只有基本身分 scopes 時，Google Testing 有 test-user 例外，不能當成本站帳號白名單；Workspace 管理政策仍可能禁止登入。[Google audience 規則](https://support.google.com/cloud/answer/15549945?hl=en)

Firebase 可能保存 Google profile、email 與登入紀錄。Myriad 不要求額外 Google API scopes，也不將 email 當成權限識別；部署者仍需在隱私說明中交代 Firebase 的資料處理。

## 設定 Worker

本機編輯被 Git 忽略的 `apps/worker/.dev.vars`：

```dotenv
APP_ORIGIN=http://localhost:8787
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_API_KEY=your-firebase-web-api-key
```

保留已有的 `ADMIN_TOKEN`、`ATTEMPT_SECRET` 及需要的 NYCU 設定。`APP_ORIGIN` 與兩個 Firebase 設定都非空時，介面顯示 Google 登入，不需另外的 feature flag。成功登入還需要正確的 `APP_ORIGIN`：它必須是單一 origin，不能帶路徑、結尾斜線或 query；正式環境使用 HTTPS，本機只允許 `localhost` 或 `127.0.0.1` 的 HTTP origin。

正式環境在自己的 `apps/worker/wrangler.production.jsonc` 設定 `vars.FIREBASE_PROJECT_ID` 和 `vars.FIREBASE_API_KEY`。API key 用來識別 Firebase 專案，不是 Google client secret 或 service-account private key；請使用允許伺服器呼叫 Identity Toolkit API 的 key，瀏覽器 HTTP referrer 限制不適用於這個 Worker 流程。Google OAuth client secret 由 Firebase provider 管理，不需要放進 Worker。[Firebase API key 管理](https://firebase.google.com/docs/projects/api-keys)

升級至此版本時，先備份並套用 `0014_auth_providers.sql`，再同步更新 Worker 與前端，流程見 [部署指南](deployment.md)。完成版本升級後，登入選項從 Worker 取得，不需為啟用 Google 再次建置前端，也不需修改 CSP 或跨來源隔離標頭。

本機從 `APP_ORIGIN` 的 Worker 網址驗收，預設為 `http://localhost:8787`。Vite 的 `http://localhost:5173` 是不同 origin，不可拿來代替已註冊的 callback。此整合使用正式 Firebase REST endpoints，沒有 Authentication Emulator 切換模式；本機驗收請使用獨立的 Firebase 測試專案。

## 平台管理員與出題者

Google 登入只驗證帳號，不會自動授予建立考試或管理權限。Myriad 帳號鍵是 `(provider, subject)`：provider 為 `google`，subject 取自已驗證 Firebase ID token 的 `firebase.identities["google.com"]`，即 Google 的固定帳號識別。**Firebase Console 顯示的 UID，以及 Firebase token 的 `sub`，是另一個識別，不可填入 Myriad 的 Google 權限設定。** [Firebase 身分欄位說明](https://firebase.google.com/docs/reference/rules/rules.firestore.Request#auth)

先使用 Google 登入，再從管理工作台「帳號與權限」取得自己的帳號識別。同一瀏覽器開啟 `/api/auth/session` 也可查看：`account.kind` 為 `google`，`account.label` 就是 subject；`account.displayName` 只是顯示名稱。部署者用 subject 設定 `ADMIN_IDENTITIES`，例如：

```dotenv
ADMIN_IDENTITIES=[{"provider":"google","subject":"123456789012345678901"}]
```

上例是示意 ID，必須換成自己的值。可在同一清單加入 NYCU 管理員。更新 Worker 設定後，平台管理員登入 `/teacher` 的「帳號與權限」，授予自己或其他出題者建立考試許可；平台管理員身分本身不等於建立許可。

CLI 的授權與邀請命令使用 `--provider google --subject GOOGLE_SUB`。出題者可在工作台建立個人 CLI 憑證，流程與 NYCU 相同，見 [管理者手冊](agent-workflow.md#建立許可與考試協作)。email、姓名與 Firebase UID 都不能代替 Google subject；Myriad 不因同名或相同 email 連結 NYCU、Google 或訪客帳號。

## Session、停用與驗收

登入使用完整頁面重新導向。Worker 將一次性的登入 cookie 與 Firebase 回傳的 provider state、session ID 及 context 綁定，callback 再透過 [`signInWithIdp`](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signInWithIdp) 完成登入。Worker 驗證 Firebase token 簽章、專案 issuer／audience、有效期、驗證時間及 Google provider 身分後，建立 Myriad session。[Firebase token 驗證契約](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

Myriad 保存 Google subject、顯示名稱與 session 資料，不保存 Firebase／Google token 或 email。本站 session 使用 24 小時 HttpOnly cookie，資料庫保存 session 雜湊；顯示名稱不影響帳號識別或既有權限。Firebase 專案中的使用者資料由部署者另外管理。

停用時，清空 Worker 的 `FIREBASE_PROJECT_ID` 或 `FIREBASE_API_KEY` 後更新部署；登入按鈕隱藏，新的 Google 登入請求被拒絕。已簽發的 Myriad session 仍可使用至登出或 24 小時到期，既有個人 CLI 憑證及帳號權限也不會因此撤銷。在 Firebase 停用或刪除使用者、撤銷 token，都不會自動清除本站已簽發的 session 或 CLI 憑證；撤銷 Myriad 權限或 CLI 憑證需另行操作。

自動測試以隔離的 Firebase REST 回應和簽章金鑰驗證協定與身分隔離，不代表已驗收自己的 Firebase 或 Google Cloud 設定。正式開放前，以實際 Google 帳號確認：

1. Google 按鈕只在設定完整時出現；僅 NYCU 的部署維持原有登入選項。
2. 登入及取消授權都返回正確 origin 與原頁面，重新整理後 session 保留，登出後清除；Firebase Authentication 中可看到對應的測試使用者。
3. 帳號資訊顯示正確 Google subject；姓名相同的 Google、NYCU 與訪客不共用草稿、提交或權限。
4. Google 平台管理員可以授予建立許可，出題者可建立 CLI 憑證、發布測試考試及邀請共同管理者；一般登入者沒有這些權限。
5. 停用 Google 後不再接受新的 Google 登入，其他已啟用服務仍能使用。
