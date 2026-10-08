# Myriad

> Reimagining programming exams and real-time online judging.

公開的多考試 C 程式作答平台。學生在瀏覽器使用 WASM-OJ 編譯與執行，Worker 比對綁定學號、題目與測試的 checksum，保存即時判定。教師在自己的裝置建置題目、驗證標準解及複判，平台不執行教師或學生的程式。

## 作答與信任邊界

- `/exams` 列出尚未結束的已發布考試；每場考試、題目、測資、草稿及提交都有明確範圍。
- 學生可使用 NYCU 帳號登入，或填寫學號／名稱以訪客身分作答。NYCU 與訪客身分分別保存草稿、提交與教師報告；相同文字不會合併為同一人。NYCU 登入帳號可跨裝置查看自己的摘要，訪客摘要依自行填寫的識別查詢。
- 公開 API 不回傳程式碼、裝置關聯或原始遙測。個別、可撤銷的教師 token 僅能管理自己的考試。
- 教師可隨時以 CLI 重新上傳整包題目覆蓋目前版本，包含考試中；每題版本由本機依測資、預期輸出與限制產生，每筆提交記錄判題時的題目版本。考試資訊（標題、時間、說明、計分方式）可在教師工作台直接修改並立即生效。上傳內容含標準解（只供教師匯出，不提供給學生、伺服器也不執行），教師可隨時匯出整包題目，在本機修改後再上傳。
- 考試開始前不傳送正式題目、範例與測資，可執行獨立環境測試。唯一例外是教師預覽：同一瀏覽器登入教師工作台的考試擁有者，可於結束前以學生介面作答與判題；預覽提交另行標記，不列入學生紀錄、統計、匯出與複判，考試開始後清除考前的預覽提交。結束後學生只看到結束提示，伺服器拒絕題目、測資、提交摘要與新提交操作。
- 即時判定只驗證用戶端傳回的 checksum。教師可於考後本機複判並上傳內部報告；系統不提供成績發布或學生考後查詢；差異與同裝置多學號都是調查線索，不自動代表作弊。
- `device_id` 是瀏覽器儲存中的隨機識別，獨立於學號。清除儲存、不同瀏覽器或裝置會限制關聯分析；不使用硬體指紋。
- 草稿以登入方式、身分、考試及題目隔離保存在該瀏覽器。公開摘要無法還原跨裝置程式碼。

## 專案

| 路徑              | 用途                                                 |
| ----------------- | ---------------------------------------------------- |
| `apps/web`        | Svelte、CodeMirror，繁中深灰四區作答介面與教師工作台 |
| `apps/worker`     | Cloudflare Worker、D1 持久化、R2 不可變檔案          |
| `packages/shared` | 資料契約、checksum、評分及遙測格式                   |
| `packages/cli`    | 教師／agent 本機工作流 `myriad`                          |

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

### 教師本機執行環境

CLI 使用已釘選的 `@wasm-oj/server` 原生 runtime。需要 Rust/Cargo 及本機 C/C++ 建置工具；依目前安裝套件的來源建置：

```sh
cd packages/cli
node --input-type=module -e 'import {spawnSync} from "node:child_process"; import {dirname,join} from "node:path"; import {fileURLToPath} from "node:url"; const root=dirname(dirname(fileURLToPath(import.meta.resolve("@wasm-oj/server")))); const p=spawnSync("cargo",["build","--locked","--manifest-path",join(root,"crates/runtime-core/Cargo.toml"),"--release","--bins"],{stdio:"inherit"}); process.exit(p.status ?? 1);'
cd ../..
```

也可將 `MYRIAD_RUNTIME_DIRECTORY` 指向同版本的 `wasm-oj-compiler`、`wasm-oj-runner` 所在目錄。缺少 runtime 會直接報錯，不會改用另一套編譯器。

## 憑證與教師流程

管理員以 `MYRIAD_ADMIN_TOKEN` 或受保護的 `--token-file` 核發憑證；以下命令由 repo 根目錄執行。token 僅在核發時顯示一次，資料庫只存雜湊。

```sh
node packages/cli/bin/myriad.js --json teachers create --name '教師姓名' --remote http://localhost:8787
node packages/cli/bin/myriad.js --json teachers revoke TEACHER_ID --remote http://localhost:8787
```

教師使用 `MYRIAD_TEACHER_TOKEN` 或 `--token-file`；瀏覽器 `/teacher` 以 token 換取 8 小時 HttpOnly session，不把 token 存入網址或 localStorage。撤銷 token 同時使其 session 失效。

完整操作與資料格式見 [教師與 Agent 操作手冊](docs/agent-workflow.md)。工具鏈需由教師上傳一次，供瀏覽器下載：

```sh
node packages/cli/bin/myriad.js --json toolchain push --remote http://localhost:8787
node packages/cli/bin/myriad.js --json init ./my-exam
node packages/cli/bin/myriad.js --json build ./my-exam
node packages/cli/bin/myriad.js --json test ./my-exam aplusb ./my-exam/problems/aplusb/solution.c
node packages/cli/bin/myriad.js --json deploy ./my-exam --remote http://localhost:8787
node packages/cli/bin/myriad.js --json status --exam my-exam --remote http://localhost:8787
```

## 提交、遙測與教師複判

提交先原子預留作答身分的冷卻時間並持久化程式快照，再透過只屬於該次 attempt 的寫入憑證傳送 claims。相同 operation ID 重試不新增紀錄；相同 claim 重送不重複計分，衝突內容拒絕。WebSocket 中斷先讀取 attempt 狀態，依缺少的測試續傳。畫面收到保存完成才顯示成功。

效能紀錄含下載、初始化、編譯、執行、提交耗時與失敗狀態，以 operation ID 串接；提交事件另含 attempt ID。有限佇列採去重及退避上傳，失敗不阻止作答；頁面突然關閉可能遺失尚未送出的紀錄。教師工作台提供樣本數、平均／最大耗時、失敗比例及裝置多學號資料。這些數據由用戶端回報，不能單獨用來證明身分或作答真實性。

考試結束後，教師執行 `pull → verify → results upload`。政策在考試設定固定為 `best` 或 `last`，預設 `best`。每題得分比例等權平均後換算百分制；未提交的題目為 0。沒有提交的考試也可上傳空報告。報告和分數僅供該考試教師檢視，不向學生發布。

## 測試與部署

```sh
pnpm build
pnpm test
pnpm --filter=@myriad/web exec svelte-check --tsconfig ./tsconfig.json
pnpm --filter=@myriad/worker exec wrangler deploy --dry-run
```

Worker 測試會啟動真正的本機 workerd／D1／R2，需要建立本機 socket 的權限；不是以 mock DB 代替交易測試。CLI 測試檢查不可變快照、驗證失敗與報告流程；完整原生 runtime／瀏覽器驗收需依操作手冊搭配本機預覽。

NYCU 登入與正式網域設定見 [登入與部署](docs/nycu-oauth.md)。

正式部署前設定 `apps/worker/wrangler.jsonc` 中實際 D1 ID、R2 bucket，設定 `ADMIN_TOKEN` 與 `ATTEMPT_SECRET` Worker secrets，套用遠端 migrations，再一起部署前後端。工具鏈另以上述教師命令上傳。`pnpm build` 與測試不會部署。

### 舊資料遷移

`0004_journeys.sql` 新建資料表，保留舊考試、提交、裝置與遙測，不推造 ownership 或發布版本。舊考試不出現在公開列表。

1. 管理員 `legacy list` 找到尚未指定 ownership 的舊考試。
2. `legacy assign EXAM_ID --teacher TEACHER_ID` 指定教師。
3. 教師 `legacy export EXAM_ID` 匯出原始舊提交。
4. 教師以該 ID 的本機已驗證 bundle 重新發布，設定新的未來開始時間。

舊提交保留為匯出資料，不納入新版本複判報告。新舊 API 不維持相容端點，升級必須協調一次完成。
