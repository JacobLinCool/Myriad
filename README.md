# Myriad

> Reimagining programming exams and real-time online judging.

公開的多考試 C 程式作答平台。學生在瀏覽器使用 WASM-OJ 編譯與執行，Worker 比對綁定學號、題目與測試的 checksum，保存即時判定。管理者在自己的裝置建置題目、驗證標準解及複判，平台不執行管理者或學生的程式。

## 作答與信任邊界

- `/exams` 列出尚未結束的已發布考試；每場考試、題目、測資、草稿及提交都有明確範圍。
- 學生可使用 NYCU 帳號登入，或填寫學號／名稱以訪客身分作答。NYCU 與訪客身分分別保存草稿、提交與管理者報告；相同文字不會合併為同一人。NYCU 登入帳號可跨裝置查看自己的摘要，訪客摘要依自行填寫的識別查詢。
- 公開 API 不回傳程式碼、裝置關聯或原始遙測。登入身分以服務與帳號識別；考試 owner 及受邀的共同管理者只能管理該考試。建立新考試另需平台管理員授予許可。
- 管理者可隨時以 CLI 重新上傳整包題目覆蓋目前版本，包含考試中；每題版本由本機依測資、預期輸出與限制產生，每筆提交記錄判題時的題目版本。考試資訊（標題、時間、說明、計分方式）可在管理工作台直接修改並立即生效。上傳內容含標準解（只供管理者匯出，不提供給學生、伺服器也不執行），管理者可隨時匯出整包題目，在本機修改後再上傳。
- 考試開始前不傳送正式題目、範例與測資，可執行獨立環境測試。唯一例外是管理者預覽：同一瀏覽器登入管理工作台的考試擁有者或共同管理者，可於結束前以學生介面作答與判題；預覽提交另行標記，不列入學生紀錄、統計、匯出與複判，考試開始後清除考前的預覽提交。結束後學生只看到結束提示，伺服器拒絕題目、測資、提交摘要與新提交操作。
- 即時判定只驗證用戶端傳回的 checksum。管理者可於考後本機複判並上傳內部報告；系統不提供成績發布或學生考後查詢；差異與同裝置多學號都是調查線索，不自動代表作弊。
- `device_id` 是瀏覽器儲存中的隨機識別，獨立於學號。清除儲存、不同瀏覽器或裝置會限制關聯分析；不使用硬體指紋。
- 草稿以登入方式、身分、考試及題目隔離保存在該瀏覽器。公開摘要無法還原跨裝置程式碼。

## 專案

| 路徑              | 用途                                                 |
| ----------------- | ---------------------------------------------------- |
| `apps/web`        | Svelte、CodeMirror，繁中深灰四區作答介面與管理工作台 |
| `apps/worker`     | Cloudflare Worker、D1 持久化、R2 不可變檔案          |
| `packages/shared` | 資料契約、checksum、評分及遙測格式                   |
| `packages/cli`    | 管理者／agent 本機工作流 `myriad`                          |

桌機為圖示導覽、題目列表、敘述／編輯器及判題面板。1100px 以下使用抽屜與可切換結果，650px 以下使用題目／程式／結果分頁。分隔線可用方向鍵調整；編輯器的 Tab 可移動焦點。

## 安裝與本機啟動

使用 Node.js 24、pnpm 12。瀏覽器需支援 WebAssembly、Worker、SharedArrayBuffer 與跨來源隔離；本機使用 localhost，正式環境使用 HTTPS。

```sh
pnpm install
pnpm build
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

將 `.dev.vars` 中的 `ADMIN_TOKEN` 與 `ATTEMPT_SECRET` 換成兩個不同的高熵隨機值，後者至少 32 字元。它們不可提交至版本控制。`ATTEMPT_SECRET` 應在考試期間保持穩定，否則既有提交寫入憑證會失效。

```sh
pnpm --filter=@myriad/worker exec wrangler d1 migrations apply myriad_d1 --local
pnpm dev:worker
```

Wrangler 同時提供 API 與 `apps/web/dist`。`pnpm dev:worker` 使用 `.dev.vars` 中 `APP_ORIGIN` 的連接埠（未設定時為 8787），NYCU 登入只在這個網址可用；以下命令以 `http://localhost:8787` 為例，請換成實際網址。修改前端後重新執行 `pnpm --filter=@myriad/web build`，再重新整理頁面。另可啟動 `pnpm dev:web` 使用 Vite 開發伺服器。

### 管理者本機執行環境

CLI 使用已釘選的 `@wasm-oj/server` 原生 runtime。需要 Rust/Cargo 及本機 C/C++ 建置工具；依目前安裝套件的來源建置：

```sh
cd packages/cli
node --input-type=module -e 'import {spawnSync} from "node:child_process"; import {dirname,join} from "node:path"; import {fileURLToPath} from "node:url"; const root=dirname(dirname(fileURLToPath(import.meta.resolve("@wasm-oj/server")))); const p=spawnSync("cargo",["build","--locked","--manifest-path",join(root,"crates/runtime-core/Cargo.toml"),"--release","--bins"],{stdio:"inherit"}); process.exit(p.status ?? 1);'
cd ../..
```

也可將 `MYRIAD_RUNTIME_DIRECTORY` 指向同版本的 `wasm-oj-compiler`、`wasm-oj-runner` 所在目錄。缺少 runtime 會直接報錯，不會改用另一套編譯器。

## 憑證與管理流程

權限以考試／作業為單位，沒有課程層級：

| 身分／許可 | 可執行操作 |
| --- | --- |
| 平台管理員 | 授予／撤銷建立考試許可，管理共用工具鏈 |
| 有建立許可的帳號 | 建立考試，成為該考試的 owner |
| 考試 owner | 管理、發布、檢視考試，以及邀請／移除共同管理者 |
| 考試共同管理者 | 管理、發布、預覽及檢視指定考試，不可轉授權限 |

`accounts` 以 `(provider, subject)` 唯一識別帳號；`exam_creation_grants` 保存建立許可，`exam_catalog.owner_id` 保存 owner，`exam_collaborators` 保存逐考試的共同管理資格。撤銷建立許可不會移除既有考試權限。邀請可在對方首次登入前建立，登入後以相同服務與帳號取得權限。

目前實作 NYCU OAuth。平台管理員由 Worker 的 `ADMIN_IDENTITIES` JSON 設定，例如 `[{"provider":"nycu","subject":"your-username"}]`；身分必須來自驗證成功的登入流程，NYCU `profile` 不提供平台管理員角色。其他登入服務需新增自己的驗證 session adapter，不能直接相信用戶端宣告的服務或角色。平台部署用 `ADMIN_TOKEN` 可供管理 CLI 與工具鏈上傳，請勿交給助教。

平台管理員登入管理工作台後，可在「帳號與權限」的「建立考試許可」授權；CLI 使用 `MYRIAD_ADMIN_TOKEN` 或 `--token-file`：

```sh
node packages/cli/bin/myriad.js --json permissions grant --provider nycu --subject TA_USERNAME --remote http://localhost:8787
node packages/cli/bin/myriad.js --json permissions list --remote http://localhost:8787
node packages/cli/bin/myriad.js --json permissions revoke ACCOUNT_ID --remote http://localhost:8787
```

助教使用 NYCU 登入 `/teacher`，在「個人 CLI 憑證」建立可撤銷的 token。token 只顯示一次，資料庫只存雜湊；CLI 使用 `MYRIAD_TEACHER_TOKEN` 或 `--token-file`，憑證不會增加帳號權限。考試 owner 選擇考試後，在「考試權限 · 共同管理者」以登入服務及帳號邀請協作者。

完整操作見 [管理者與 Agent 操作手冊](docs/agent-workflow.md)。工具鏈由平台管理員上傳一次：

```sh
node packages/cli/bin/myriad.js --json toolchain push --remote http://localhost:8787
```

助教的建置與發布流程：

```sh
node packages/cli/bin/myriad.js --json init ./my-exam
node packages/cli/bin/myriad.js --json build ./my-exam
node packages/cli/bin/myriad.js --json test ./my-exam aplusb ./my-exam/problems/aplusb/solution.c
node packages/cli/bin/myriad.js --json deploy ./my-exam --remote http://localhost:8787
node packages/cli/bin/myriad.js --json members invite --exam my-exam --provider nycu --subject OTHER_TA --remote http://localhost:8787
```

`deploy` 先 staging 再發布，也可分開使用 `stage` 和 `publish`。發布必須攜帶 staging 回傳的 `currentRevision` 作為 `expectedRevision`；如果另一位共同管理者已先發布，回傳 409，需重新檢視目前版本。首次發布的 CLI `--expected-revision` 使用 `none`。考試 ID 是全站唯一且穩定的識別，建議包含學期與作業／考試名稱；權限仍逐考試檢查。

## 提交、遙測與管理者複判

提交先原子預留作答身分的冷卻時間並持久化程式快照，再透過只屬於該次 attempt 的寫入憑證傳送 claims。相同 operation ID 重試不新增紀錄；相同 claim 重送不重複計分，衝突內容拒絕。WebSocket 中斷先讀取 attempt 狀態，依缺少的測試續傳。畫面收到保存完成才顯示成功。

效能紀錄含下載、初始化、編譯、執行、提交耗時與失敗狀態，以 operation ID 串接；提交事件另含 attempt ID。有限佇列採去重及退避上傳，失敗不阻止作答；頁面突然關閉可能遺失尚未送出的紀錄。管理工作台提供樣本數、平均／最大耗時、失敗比例及裝置多學號資料。這些數據由用戶端回報，不能單獨用來證明身分或作答真實性。

考試結束後，管理者執行 `pull → verify → results upload`。政策在考試設定固定為 `best` 或 `last`，預設 `best`。每題得分比例等權平均後換算百分制；未提交的題目為 0。沒有提交的考試也可上傳空報告。報告和分數僅供該考試管理者檢視，不向學生發布。

## 測試與部署

```sh
pnpm build
pnpm test
pnpm --filter=@myriad/web exec svelte-check --tsconfig ./tsconfig.json
pnpm --filter=@myriad/worker exec wrangler deploy --dry-run
```

Worker 測試會啟動真正的本機 workerd／D1／R2，需要建立本機 socket 的權限；不是以 mock DB 代替交易測試。CLI 測試檢查不可變快照、驗證失敗與報告流程；完整原生 runtime／瀏覽器驗收需依操作手冊搭配本機預覽。

NYCU 登入與正式網域設定見 [登入與部署](docs/nycu-oauth.md)。

正式部署前設定 `apps/worker/wrangler.jsonc` 中實際 D1 ID、R2 bucket，設定 `ADMIN_TOKEN` 與 `ATTEMPT_SECRET` Worker secrets，套用遠端 migrations，再一起部署前後端。工具鏈另以上述平台管理員命令上傳。`pnpm build` 與測試不會部署。

### 既有資料遷移

`0009_exam_permissions.sql` 要求既有環境先建立 `migration_teacher_identities(teacher_id, account_id, provider, subject)` 對照表，以經確認的 OAuth 身分指定每筆舊助教的目標帳號（`account_id` 為保留的舊助教 ID）。缺少對照時遷移會失敗，不會自動建立 local 身分。多筆舊憑證可對應同一帳號，撤銷狀態保持不變；考試 ownership、有效憑證、提交與報告均保留。既有 NYCU session 使用同一個 provider/subject 帳號，不重複建立。遷移完成後移除對照表與舊管理資料表。執行前備份並於副本演練，切換期間使用 `apps/worker/scripts/maintenance.ts` 暫停請求；前後端與 CLI 需一起升級。

既有 owner 可使用原本憑證登入，再邀請 NYCU 帳號共同管理；系統不依顯示名稱自動合併不同登入服務的帳號。套用 migration 後設定 `ADMIN_IDENTITIES`，由指定的 OAuth 平台管理員管理新的建立許可。

### 題目起始程式碼與實作要求

每題的 `problem.json` 可加入兩個選用欄位；兩者都隨 bundle 上傳、匯出：

```json
{
  "template": "#include <stdio.h>\n\nint solve(int *values, int n) {\n    // 完成實作\n}\n",
  "semanticCheck": "必須以指標走訪陣列，不能使用陣列下標。"
}
```

`template` 是起始 C 程式碼，只用於沒有既有草稿的題目；省略時使用通用模板，空字串代表空白編輯器。修改模板不改變判題版本。`semanticCheck` 最多 2,000 個 Unicode 字元，修改條件會改變題目版本。

有設定 `semanticCheck` 的提交，在建立提交後立即由 Worker 使用 OpenAI Responses API 的 `gpt-5.6-luna`、`reasoning.effort=low` 檢查原始碼，與瀏覽器執行測資並行；兩邊結果均保存後才結算，語意未通過仍繼續收完測資。只傳管理者設定的條件與程式碼前 20,000 個 Unicode 字元，不傳學生識別資訊或測資；`store=false`。超長程式碼會標示截斷。未通過時保留測資結果與一句原因，該次得分為零；服務失敗不視為學生不符合要求，可在提交有效期間透過「查詢並繼續提交」重試。模型判斷是自動檢查，管理者可查看原始碼與原因。

正式環境先套用 `0010_semantic_checks.sql`，再設定 `OPENAI_API_KEY` secret；未設定金鑰時禁止發布帶有語意要求的題目。可用 `OPENAI_SEMANTIC_MODEL` 指定模型，預設保持上述模型。檢查結果以提交為單位保存，並以資料庫 lease 避免同時續傳重複呼叫。管理者本機複判重新執行測資，保留原有 server 語意判定；報告上傳時 server 仍強制套用未通過零分規則。
