# 部署至 Cloudflare

本文件適用於自己的 Cloudflare 帳戶與網域。本機開發見 [README](../README.md)；登入服務可選 [NYCU OAuth](nycu-oauth.md)、[Firebase Authentication 的 Google 登入](google-oauth.md) 或同時啟用。正式服務需要 Workers、D1、R2 以及設定完成的登入服務，選用 OpenAI 與 PostHog 則另需各自帳戶。

## 部署設定與資源

`apps/worker/wrangler.jsonc` 是本機預設，不含正式帳戶或網域。從根目錄建立自己的部署設定：

```sh
cp apps/worker/wrangler.production.example.jsonc apps/worker/wrangler.production.jsonc
```

`wrangler.production.jsonc` 被 Git 忽略。填入自己的 Worker 名稱、`account_id`、網域 `routes[].pattern` 與 `vars.APP_ORIGIN`。範本使用 Cloudflare custom domain，因此該網域必須位於可管理的 Cloudflare zone。`APP_ORIGIN` 使用完整 HTTPS origin，不含結尾斜線、路徑或 query。

先登入 Cloudflare，或在受保護的執行環境設定具所需權限的 `CLOUDFLARE_API_TOKEN`。在 `apps/worker` 建立資源：

```sh
cd apps/worker
pnpm exec wrangler login
pnpm exec wrangler d1 create myriad_d1 --config wrangler.production.jsonc
pnpm exec wrangler r2 bucket create myriad-bucket --config wrangler.production.jsonc
```

將建立結果填回設定：`d1_databases` 的 `database_name`／`database_id`，以及 `r2_buckets` 的 `bucket_name`。保留程式使用的 binding 名稱 `DB`、`BUCKET`、`ASSETS`。若資源已存在，直接填入現有資源資訊。

在 `vars` 設定需要的登入服務：NYCU 使用 `NYCU_CLIENT_ID` 並搭配下方的 secret；Google 使用 `FIREBASE_PROJECT_ID` 和 `FIREBASE_API_KEY`。也設定平台管理員 `ADMIN_IDENTITIES`，例如 `[{"provider":"nycu","subject":"your-username"}]` 的 JSON 字串。Google 帳號使用 `provider: "google"` 和 Myriad 顯示的 Google subject，不使用 Firebase UID，取得方式見 [Google 登入設定](google-oauth.md#平台管理員與出題者)。登入服務的設定及 `APP_ORIGIN` 都非空時才顯示對應選項，實際登入時會驗證 origin；將 Firebase 設定留空可維持既有 NYCU 部署。

先在對應登入服務註冊完整 callback：NYCU 為 `APP_ORIGIN` 加上 `/api/auth/nycu/callback`，Google 為 `APP_ORIGIN` 加上 `/api/auth/google/callback`，後者登錄在 Firebase Google provider 使用的 Web OAuth client。Firebase 也需啟用 Google provider 並允許本站網域。完成版本升級與服務設定後，啟用方式只依 Worker 設定，不需重新建置前端。

## Secrets

仍在 `apps/worker` 執行下列命令，依提示輸入秘密值：

```sh
pnpm exec wrangler secret put ADMIN_TOKEN --config wrangler.production.jsonc
pnpm exec wrangler secret put ATTEMPT_SECRET --config wrangler.production.jsonc
```

若使用 NYCU，再設定校方 client secret：

```sh
pnpm exec wrangler secret put NYCU_CLIENT_SECRET --config wrangler.production.jsonc
```

Google OAuth client secret 由 Firebase provider 管理，Worker 不需要它。`FIREBASE_API_KEY` 是 Firebase 專案識別 key，可放在自己的 production `vars`；它不是 service-account private key。

`ADMIN_TOKEN` 與 `ATTEMPT_SECRET` 使用不同的高熵隨機值，後者至少 32 字元。`ATTEMPT_SECRET` 在考試期間保持穩定；變更會使既有 attempt 寫入憑證失效。`.dev.vars` 只供本機使用，不會替代正式 Worker secrets。Secret 命令也必須指定 production 設定，避免操作錯誤的 Worker。

| 設定                                       | 用途                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| `APP_ORIGIN`                               | 使用者與 OAuth callback 的同一個正式 HTTPS origin        |
| `ADMIN_IDENTITIES`                         | 可授予建立考試許可的已驗證 OAuth 帳號清單；預設 `[]`     |
| `ADMIN_TOKEN`                              | 平台服務憑證，供建立許可與工具鏈管理，不配發給一般出題者 |
| `ATTEMPT_SECRET`                           | 簽發 attempt 寫入憑證，亦用於分析識別的化名              |
| `NYCU_CLIENT_ID` / `NYCU_CLIENT_SECRET`    | 選用的校方登入應用程式設定                               |
| `FIREBASE_PROJECT_ID` / `FIREBASE_API_KEY` | 選用的 Firebase Authentication Google 登入設定           |
| `OPENAI_API_KEY` / `OPENAI_SEMANTIC_MODEL` | 選用的程式實作要求檢查                                   |
| `POSTHOG_KEY` / `POSTHOG_HOST`             | 選用的 Worker 分析事件及瀏覽器分析代理                   |

## 建置、遷移與部署

首次建立空資料庫時可依序套用所有 migrations。升級有既有資料的部署時，先閱讀下方的遷移注意事項並備份資料。

```sh
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
cd ../..
pnpm check
pnpm --filter=@myriad/worker exec wrangler deploy --dry-run --config wrangler.production.jsonc
pnpm --filter=@myriad/worker deploy
```

最後一個命令明確使用 `wrangler.production.jsonc`，將 Worker 與 `apps/web/dist` 一起部署。`--dry-run` 不驗證雲端資源、權限、外部模型或實際 OAuth 登入。

上線後檢查 `/api/health`、首頁及 `crossOriginIsolated`，再完成下列驗收：

1. 用實際帳號逐一驗收已啟用的登入服務，確認 callback 返回同一正式 origin，未啟用的服務不顯示登入按鈕。
2. 平台管理員授予出題者建立考試許可；出題者建立個人 CLI 憑證。
3. 以平台憑證上傳工具鏈，再以出題者憑證發布含合成資料的測試考試。
4. 確認考前限制、管理者預覽、一般學生編譯與提交、斷線續傳及截止後限制。
5. 下載提交，以本機 runtime 複判並上傳報告，確認一般學生無法存取管理資料。

工具鏈與考試發布命令見 [操作手冊](agent-workflow.md)。測試考試的識別與資料應與正式考試分開。

## 選用服務

### OpenAI 實作要求檢查

只有題目設定 `semanticCheck` 時才使用此服務。加入金鑰：

```sh
pnpm --filter=@myriad/worker exec wrangler secret put OPENAI_API_KEY --config wrangler.production.jsonc
```

可在 production 設定的 `vars.OPENAI_SEMANTIC_MODEL` 指定支援此程式 Responses API 請求格式的模型；未設定時使用 [`semantic.ts`](../apps/worker/src/semantic.ts) 的預設值。請以自己的 API 帳戶確認模型可用性、額度與實際判定，repository 測試不會呼叫真實模型。未設定金鑰時，伺服器拒絕發布帶有語意要求的題目。

程式會傳送實作要求與學生程式前 20,000 個 Unicode 字元，不另附身分或測資，請求使用 `store=false`。先向參與者說明資料流；程式內容本身仍可能包含個人資料。模型失敗可重試，語意未通過則使該次得分為零，保留測資結果及原因供管理者檢視。

### PostHog

分析預設停用。要啟用瀏覽器及 Worker 分析：

1. 複製 `apps/web/.env.example` 為被忽略的 `apps/web/.env`，設定自己的 `VITE_POSTHOG_KEY`。這是會編入瀏覽器 bundle 的 project key，不能放 personal API key。
2. 在 Worker 設定相同專案的 `POSTHOG_KEY` 和 ingestion host `POSTHOG_HOST`。預設 host 為 `https://us.i.posthog.com`；使用其他區域時明確設定對應網址。
3. 重新建置前端並部署，檢查實際事件與 PostHog 的錄影、autocapture 及資料保留設定。

瀏覽器使用同源 `/ingest` 代理；未設定 Worker `POSTHOG_KEY` 時代理不提供服務。瀏覽器與 Worker 的 key 都清空，並重新建置部署，才能停止兩邊的產品分析。這不會刪除已保存的資料，也不會關閉 Myriad 內建的 D1 遙測。資料內容和身分化名邊界見 [架構說明](architecture.md)。

## 匯出與既有資料

管理者日常應使用 CLI `pull` 和管理工作台的匯出功能。需要基礎設施層級分析時，可從 repository 根目錄執行：

```sh
pnpm --filter=@myriad/worker export-data --from "2026-01-01T00:00:00+08:00" --to "2026-01-02T00:00:00+08:00" --exam my-exam --skip posthog
```

改為自己的時間範圍與考試 ID。匯出程式預設讀取 `apps/worker/wrangler.production.jsonc`，可用 `--config` 指定其他檔案；Cloudflare 讀取需要環境中的 `CLOUDFLARE_API_TOKEN`。若不略過 PostHog，另需 `POSTHOG_PERSONAL_API_KEY` 和 `POSTHOG_PROJECT_ID`，此程式的 `POSTHOG_HOST` 指 PostHog API host（預設 `https://us.posthog.com`），與 Worker ingestion host 不同。

預設輸出至被 Git 忽略的 `exports/`。內容可能包含真實身分、IP、原始碼與分析事件，應存放於受保護的位置。這是分析匯出，不是完整備份／還原工具；備份需同時涵蓋 D1、R2 和所需的部署設定。

若從 `0009_exam_permissions.sql` 之前的部署升級，先建立 `migration_teacher_identities(teacher_id, account_id, provider, subject)` 對照表，以人工確認的 OAuth 身分指定舊管理者的目標帳號；`account_id` 必須為保留的舊管理者 ID。缺少對照會使遷移失敗。空資料庫沒有舊管理者，不需對照資料。

此遷移保留 ownership、有效憑證、提交與報告，移除舊管理資料表；不依顯示名稱合併帳號。在資料副本演練後，才對正式環境執行。涉及不相容 schema 的切換需暫停請求，可使用 [`maintenance.ts`](../apps/worker/scripts/maintenance.ts) 作為暫時入口，再同時更新 Worker、前端與 CLI。已套用的 migrations 是資料歷史的一部分，不應修改或刪除。

`0014_auth_providers.sql` 將登入 session 改為關聯帳號，並允許 Google 提交身分。即使維持僅 NYCU 的部署，升級程式時仍需套用此遷移。既有 NYCU session、帳號識別及提交保留；進行中的 OAuth 登入 state 會清除，使用者需重新開始登入。這次 schema 切換也需暫停請求、備份資料並同步更新程式，不能讓舊 Worker 繼續操作新 schema。
