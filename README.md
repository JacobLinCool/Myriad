# Myriad

> Reimagining programming exams and real-time online judging.

Myriad 是可自行部署的 C 程式設計考試平台。學生在瀏覽器使用 WASM-OJ 編譯與執行程式，Cloudflare Worker 保存提交並比對輸出 checksum；管理者在本機出題、驗證標準解及考後複判。伺服器不編譯或執行學生程式。

前端使用 Svelte 5 與 CodeMirror，介面為繁體中文。後端使用 Cloudflare Workers、D1 與 R2。CLI、前後端和資料契約都在此 monorepo，採用 [MIT 授權](LICENSE)。依賴與隨附工具鏈的授權見 [第三方聲明](THIRD_PARTY_NOTICES.md)。

## 適用範圍

- 支援多場考試、測試群組計分、起始程式碼、管理者預覽與逐考試的共同管理權限。
- 學生可使用部署者啟用的 NYCU 或 Google 登入，也可自行填寫識別作為訪客。訪客身分未經驗證，知道同一識別的人可查看該訪客在開放期間的提交摘要；摘要不含程式碼。
- 即時判定依賴用戶端回報，checksum 不能證明程式確實執行。需要可信成績時，由管理者下載提交，在本機重新執行並檢查差異。
- 開放期間的測資會傳至學生瀏覽器，不能作為機密測資。截止後 API 拒絕新存取，但無法收回已下載的資料。
- 可選用 OpenAI 檢查指定的實作要求；啟用的題目會將學生程式傳給 OpenAI。模型判斷仍需管理者審視。

完整資料流、保存資料與信任邊界見 [架構說明](docs/architecture.md) 和 [安全政策](SECURITY.md)。

## 安裝與本機啟動

使用 **Node.js 24.18.0 以上的 24.x** 與 **pnpm 12.4.2**。瀏覽器需支援 WebAssembly、Web Worker、SharedArrayBuffer 與跨來源隔離；本機使用 `localhost`，正式環境使用 HTTPS。

在 repository 根目錄執行：

```sh
pnpm install --frozen-lockfile
pnpm build
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

編輯 `.dev.vars`，將 `ADMIN_TOKEN` 和 `ATTEMPT_SECRET` 設為兩個不同的高熵隨機值；後者至少 32 字元。可執行下列命令兩次，各產生一個值：

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

保留 `APP_ORIGIN=http://localhost:8787`，未使用的 OAuth 憑證、OpenAI 金鑰與 PostHog key 先留空，再初始化本機資料庫並啟動：

```sh
pnpm --filter=@myriad/worker exec wrangler d1 migrations apply DB --local
pnpm dev:worker
```

開啟 [localhost:8787](http://localhost:8787)。Wrangler 同時提供 API 與建置後的前端，首次啟動的考試列表是空的。本機 D1/R2 資料保存在被 Git 忽略的 `.wrangler/` 中；這些命令不會建立雲端資源。

修改前端後，重新執行 `pnpm --filter=@myriad/web build` 並整理頁面。需要即時更新時，保留 Worker 執行，再於另一個終端啟動 `pnpm dev:web`，開啟 [localhost:5173](http://localhost:5173)。OAuth 與 cookie 管理操作請使用 `APP_ORIGIN` 的 Worker 網址驗收；Vite 代理不會把兩個網址變成同一來源。

NYCU 與 Google 登入可獨立啟用。NYCU 使用 `NYCU_CLIENT_ID`、`NYCU_CLIENT_SECRET`；Google 使用 Firebase Authentication，設定 `FIREBASE_PROJECT_ID`、`FIREBASE_API_KEY` 即可。兩者共用 `APP_ORIGIN`，未設定的服務不會出現登入按鈕。現有 NYCU 部署可將 Firebase 設定留空。

未設定 OAuth 仍可啟動網站與執行自動測試；要從新環境建立並發布考試，先完成 [NYCU 登入設定](docs/nycu-oauth.md) 或 [Google 登入設定](docs/google-oauth.md)，再取得建立考試許可及個人 CLI 憑證。

## 建立第一場考試

CLI 的 `build`、`test` 與 `verify` 使用釘選版本的 WASM-OJ 原生 runtime，需要 Rust/Cargo 和本機 C/C++ 建置工具。先建置 runtime：

```sh
pnpm --filter=@myriad/cli runtime:build
```

建置使用依賴套件指定的 Rust toolchain。也可設定 `MYRIAD_RUNTIME_DIRECTORY`，指向同版本 `wasm-oj-compiler` 與 `wasm-oj-runner` 所在目錄。缺少 runtime 會直接報錯。前端建置與一般單元測試不需要這兩個執行檔。

1. 在 `.dev.vars` 的 `ADMIN_IDENTITIES` 填入自己的已驗證帳號，例如 `[{"provider":"nycu","subject":"your-username"}]`；Google 使用 `provider: "google"` 和 Myriad 帳號資訊顯示的 Google subject，不是 email 或 Firebase UID。重新啟動 Worker。
2. 使用已設定的登入服務登入 `/teacher`，在「帳號與權限」授予自己或出題者建立考試許可。平台管理員身分本身不等於建立考試許可。
3. 出題者在同一頁建立個人 CLI 憑證，存入 `MYRIAD_TEACHER_TOKEN` 或透過 `--token-file` 指定受保護的憑證檔。
4. 平台管理員以 `MYRIAD_ADMIN_TOKEN`（對應 Worker 的 `ADMIN_TOKEN`）上傳共用工具鏈：

```sh
node packages/cli/bin/myriad.js --json toolchain push --remote http://localhost:8787
```

接著從 repository 根目錄執行出題流程；範例將題目放在 repository 外，避免將正式考題加入公開程式庫：

```sh
node packages/cli/bin/myriad.js --json init ../my-exam
node packages/cli/bin/myriad.js --json build ../my-exam
node packages/cli/bin/myriad.js --json test ../my-exam aplusb ../my-exam/problems/aplusb/solution.c
node packages/cli/bin/myriad.js --json deploy ../my-exam --remote http://localhost:8787
```

`init` 預設一天後開始。發布前編輯 `exam.json` 的時間、標題與說明；修改後重新 `build`。管理工作台可在考前使用「以學生視角預覽」，預覽提交不列入學生紀錄與複判。

每次 `deploy` 取代目前考試版本，包含在網站修改過的時間與說明。考試中也可重新發布；提交保留開始判題時的版本。完整命令、協作權限、匯出與考後 `pull → verify → results upload` 流程見 [管理者與 Agent 操作手冊](docs/agent-workflow.md)。

## 開發與驗證

```sh
pnpm check
pnpm --filter=@myriad/worker exec wrangler deploy --dry-run
```

`pnpm check` 執行建置、型別檢查、測試和 repository 稽核。Worker 測試使用本機 workerd、D1 與 R2，需要允許建立本機 socket。CLI 測試不等同完整原生 runtime 驗收；正式上線前還要執行操作手冊中的瀏覽器與本機複判流程。`--dry-run` 只檢查 Worker 打包，不會部署或證明正式資源及 OAuth 可用。

| 路徑                                 | 用途                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| [`apps/web`](apps/web)               | Svelte 作答介面與管理工作台；[前端架構](apps/web/ARCHITECTURE.md) |
| [`apps/worker`](apps/worker)         | API、身分與權限、D1 migrations、R2 存取                           |
| [`packages/shared`](packages/shared) | 資料契約、checksum、評分與遙測格式                                |
| [`packages/cli`](packages/cli)       | 題目建置、發布、匯出與本機複判                                    |
| [`examples`](examples)               | 公開題目範例；使用前更新考試時間與識別                            |
| [`docs`](docs)                       | 部署、架構及管理者操作文件                                        |

正式部署使用自己的 Cloudflare、OAuth 與選用服務設定，步驟見 [部署指南](docs/deployment.md)。貢獻流程見 [CONTRIBUTING.md](CONTRIBUTING.md)，弱點回報見 [SECURITY.md](SECURITY.md)。
