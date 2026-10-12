# 教師與 Agent 本機操作手冊

所有題目建置、標準解執行及考後複判都在教師裝置進行。遠端只保存上傳的 bundle、目前生效的版本、學生的 checksum claims 與教師內部複判報告，不替教師做版本控制。

## 完整週期

1. 全域管理員依 `(provider, subject)` 授予建立考試許可（`permissions grant`）。助教登入 `/teacher` 建立個人 CLI 憑證。
2. 教師與 agent 在本機出題：`init` → 編輯 → `build` → `test`。
3. `deploy` 上傳整包並立即生效。之後任何時候（包含考試中）都可以修改後重新 `deploy`，以覆蓋方式取代目前版本。
4. 在 `/teacher` 檢視考試資訊、狀態與每題版本；開啟「以學生視角預覽」實際作答與判題。
5. 考試資訊（標題、開始／結束時間、考試說明、計分方式）可在 `/teacher` 直接修改並立即生效，例如考試中延長時間。題目內容只能在本機修改後上傳；本機沒有題目目錄時，先 `export` 從網站還原，修改後再 `build`、`deploy`。
6. 考試中在 `/teacher` 查看提交統計。
7. 考後 `pull` 下載全部提交，`verify` 在本機複判，必要時 `results upload` 上傳內部報告。

學生端：考前只看得到考試說明；開放期間看得到題目並提交；結束後只看到結束提示，題目與測資不再提供。

## 命令契約

從 repository 根目錄執行 `node packages/cli/bin/myriad.js`。每個命令支援 `--json --non-interactive`，沒有互動提問。成功輸出 `{ "ok": true, "data": ... }`；錯誤輸出 `{ "ok": false, "error": { "message": ... } }` 至 stderr，exit code 為 1。`test` 有未通過的測試時 exit code 為 1，仍輸出逐筆測試資料。參數解析錯誤另含 `error.code`；`--help` 是一般說明文字。

- 教師：設定 `MYRIAD_TEACHER_TOKEN`，或每次提供 `--token-file /secure/path/token`。
- 管理員命令：設定 `MYRIAD_ADMIN_TOKEN`，或提供管理員憑證檔。
- 遠端命令必須明確提供 `--remote https://your-judge.example`。
- 憑證不放在網址或題目 bundle。agent 日誌不得輸出環境變數或憑證檔內容。

## 建立、設計與驗證

```sh
node packages/cli/bin/myriad.js --json init ./midterm
```

產生結構：

```text
midterm/
  exam.json
  problems/aplusb/
    problem.json
    statement.md
    solution.c
    tests/01.in
```

`exam.json`：`id`、`title`、`startsAt`、`endsAt`（Unix 毫秒）、`rules`、`policy`（`best`／`last`） 與獨立隨機 `salt`（至少 16 字元）。ID 使用英數、連字號、底線，最長 64 字元。`init` 預設一天後開始，編輯後確認時區與起訖時間。

每題 `problem.json` 包含 `title`、`order`、`normalize`、`limits`、`groups`、`sampleCases`。題目 ID 為資料夾名稱。`groups[].tests` 明確列出 `tests/` 中的檔名，不猜測其他檔案；每組通過其全部測試才得該組分數。敘述支援 Markdown 與數學式。`solution.c` 為教師標準解。

```sh
node packages/cli/bin/myriad.js --json build ./midterm
node packages/cli/bin/myriad.js --json test ./midterm aplusb ./midterm/problems/aplusb/solution.c
```

`build` 執行全部標準解測試與範例，失敗立即退出。成功產生 `.myriad/bundle.json`，包含設定、敘述、完整輸入、測試索引、expected digests、固定工具鏈與本機驗證報告，以 canonical JSON SHA-256 作為 revision（代表「這一次上傳」）。歷史 bundle 保存在 `.myriad/bundles/<revision>.json`；失敗的重建不留下可直接部署的 current bundle。

`build` 另為每題計算 `version`：工具鏈、限制、輸出比對方式、子任務分組，以及每筆測資輸入與預期輸出摘要的 SHA-256。題敘、標題與範例不影響版本，所以修正錯字不會打斷學生；測資、預期輸出、限制或分組改變才會產生新版本。每筆提交記錄判題時使用的題目版本。

`test` 使用 bundle 的完整內容驗證指定解答。來源檔變動不會改變既有 bundle；需要更新發布內容時重新 build。建議保留整個 `.myriad/bundles`，考後必須使用實際已發布版本複判。

## 發布與重試

```sh
node packages/cli/bin/myriad.js --json toolchain push --remote https://your-judge.example
node packages/cli/bin/myriad.js --json deploy ./midterm --remote https://your-judge.example
node packages/cli/bin/myriad.js --json status --exam midterm --remote https://your-judge.example
```

`deploy` 僅讀取並驗證 bundle，不重新讀取來源測資；先 staging，再以回傳的 `currentRevision` 作為預期版本原子更新；別人已先發布時回傳 409，重新檢視後再發布。失敗不影響目前版本。相同 bundle 重試可重用已保存的內容；中斷時安全重傳同版本。工具鏈相同內容可重送，同一路徑不同內容會拒絕覆寫。建立新考試需有建立許可；既有考試只允許 owner 與受邀共同管理者操作。只有 owner 能增刪共同管理者。共用工具鏈僅限全域管理員上傳。

`deploy` 隨時可執行，包含考試進行中，以覆蓋方式取代目前版本。回傳：

- `url`、`previewUrl`、`revision`。
- `problems`：每題 `version` 與 `change`（`added`／`changed`／`unchanged`），`removedProblems` 為被移除的題目。
- `overwroteSiteSettings`：被本機 `exam.json` 覆蓋的網站設定（例如教師在網站上延長的結束時間）。若不打算覆蓋，先把網站上的值寫回 `exam.json` 再重新 build、deploy，並告知教師。

考試中替換題目時：

- 版本未變的題目不受影響。
- 版本改變的題目，學生頁面會在背景自動更新；以舊版本送出的新提交會被要求確認新題目後再提交，草稿保留。
- 已經開始判題的提交用它開始時的版本完成；已完成的提交保留原本的判定，不會自動重判。

`status` 輸出考試資訊、狀態、最後上傳時間、每題版本與統計，可用來確認上傳結果。

## 匯出後修改再上傳

```sh
node packages/cli/bin/myriad.js --json export ./midterm --exam midterm --remote https://your-judge.example
```

`export` 從網站還原可直接編輯的題目目錄：

- `exam.json`：套用網站上目前的考試設定，所以下次 deploy 不會改回網站上的修改。
- 每題的 `problem.json`、`statement.md`、`solution.c` 與 `tests/`。
- `.myriad/bundles/`：歷次上傳，換一台電腦也能考後複判。

教師也可以在 `/teacher` 按「匯出題目包」下載同一份檔案，再用 `export ./midterm --file <下載的檔案>` 展開。

目錄已有考試時需加 `--force`，會取代 `exam.json` 與 `problems/`。回傳：

- `settingsFromSite`：取自網站、與上傳時不同的欄位。
- `missingSolutions`：缺少標準解的題目。

`build` 會把各題 `solution.c` 一併放進 bundle，伺服器只保存、不執行，也不會提供給學生。較早的上傳沒有標準解，匯出後需補上 `solution.c` 才能重新 build。

重新 build 匯出的目錄，題目版本與網站上相同（測資、預期輸出與限制都相同）；revision 會改變，因為每次 build 都記錄完成時間。

## 網站上的考試資訊

`/teacher` 選擇考試後顯示考試資訊與題目表（含版本短碼），題目內容唯讀。「編輯考試資訊」可修改標題、開始／結束時間、考試說明與計分方式，儲存後立即對學生生效，學生頁面最多一分鐘內自動更新。下一次 `deploy` 會以本機 `exam.json` 覆蓋這些欄位，並在 `overwroteSiteSettings` 列出。

## 考中監看

瀏覽器 `/teacher` 登入後選擇考試，可查看提交／學號統計、下載／編譯／執行效能、錯誤比例、原始遙測匯出、提交快照匯出及同裝置多學號。統計中的學號均為自行填寫；不得把關聯或差異自動當成作弊結論。

## 考後本機複判與內部檢視

保留 `.myriad/bundles/`：考試中若曾多次 deploy，不同提交會對應不同的上傳。`pull` 回傳 `revisions` 與 `missingBundles`；`verify` 依每筆提交的 revision 使用當時的 bundle（測資、預期輸出與 salt），缺少任何一份會列出 revision 並停止。

```sh
node packages/cli/bin/myriad.js --json pull ./midterm --remote https://your-judge.example
node packages/cli/bin/myriad.js --json verify ./midterm
node packages/cli/bin/myriad.js --json results upload ./midterm --remote https://your-judge.example
```

`pull` 以穩定序號游標與固定 snapshot 下載完整已完成提交，保存 `.myriad/submissions.json`。正式複判應在考試結束後 pull，避免仍在進行中的提交使報告過期。

`verify` 本機重新編譯並執行每份程式，檢查程式 SHA-256、題目版本與當時的輸入，產生 `report/full.json`（每筆附 `problemVersion`）。包含逐筆 verdict 及與即時判定的差異分類。空提交不啟動執行器也可產生空報告。

`results upload` 在考試結束後上傳報告。系統檢查計分方式（以網站目前設定為準）、完整 snapshot、每份程式雜湊、題目版本及該版本的測試索引；缺漏、重複或過期報告被拒絕。回傳報告 revision、各學號成績及差異數。報告只供該考試教師檢視。

在教師工作台檢視複判分數與差異。`best` 選每題最高分，`last` 選每題最後建立的已完成提交；各題等權平均為百分制。差異分類不會另外扣分。

本系統沒有成績發布命令或學生端成績頁。學生介面只用於考前準備及考試作答；截止時顯示結束提示，停止題目、測資與提交查詢。教師仍可匯出提交、分析及複判資料。

## 考前以學生視角預覽

考試開始前，在同一瀏覽器登入 `/teacher`，選擇考試後按「以學生視角預覽」，或開啟 deploy 回傳的 `previewUrl`。預覽不受開始時間限制：可閱讀題目、使用範例、本機執行，並正式提交判題以確認子任務配分。頁面上方持續顯示預覽提示，「結束預覽」回到一般學生視角。

伺服器只在請求帶有 `preview=1` 且附上該考試擁有者的教師 session 時開放；其他人帶此參數會被拒絕。預覽提交標記為 preview，不出現在學生提交紀錄、教師統計、`pull`、匯出及複判 snapshot，也不送出瀏覽器遙測。考試開始後，考前建立的預覽提交會被清除。

## 一次完整本機驗收

1. 使用獨立本機 D1/R2 目錄，套用所有 migrations，啟動 `wrangler dev --local --persist-to <directory>`。
2. 核發測試教師、上傳工具鏈，建立兩場含同題目 ID 的考試並發布。CLI 從 repository 根目錄執行，才能重用 `.wasm-oj-cache`；冷快取首次編譯可能超過 60 秒逾時。
3. 開始前檢查題目不可讀及獨立環境測試，並以教師預覽完成執行與提交；確認教師統計不含預覽提交。開始後以無教師登入的瀏覽器執行、提交。
4. 切換學號與考試，刷新深連結及上一頁，確認草稿、提交與結果隔離；驗證桌機及手機分頁。
5. 考試結束後執行 pull、verify、upload，在教師工作台檢視內部報告，確認學生 API 無法讀取報告或考後提交摘要。
6. `pnpm test` 補充驗證斷線續傳、重送／衝突 claim、並行冷卻、截止邊界、教師撤銷與空報告。

本機測試調整時鐘或直接更新隔離 fixture 的截止時間只用於加速測試，不是產品 API，也不可用於正式考試修改。


## 建立許可與考試協作

全域管理員由 `ADMIN_IDENTITIES` 指定經驗證登入服務的帳號，目前支援 NYCU OAuth；部署用 `ADMIN_TOKEN` 是獨立的平台服務憑證。助教不需要取得全域憑證。管理員可在 `/teacher` 的全域管理區或以 `permissions grant --provider nycu --subject USERNAME` 授予建立許可，`permissions revoke ACCOUNT_ID` 撤銷。撤銷只阻止建立新考試，既有 owner／共同管理資格保留。

owner 在考試權限區加入共同管理者，或使用 `members invite --exam EXAM_ID --provider nycu --subject USERNAME`。共同管理者能修改、發布、預覽、匯出與複判該考試，但無法邀請其他人，也不因此取得建立新考試的許可。`members list --exam EXAM_ID` 列出成員，`members remove ACCOUNT_ID --exam EXAM_ID` 移除；既有 session 與 API 憑證下一次請求即受新權限限制。

需要分開檢查與釋出時，先 `stage DIR`，檢查其 `revision` 與 `currentRevision`，再 `publish --exam EXAM_ID --revision REVISION --expected-revision CURRENT_REVISION`；首次發布以 `none` 代表尚無目前版本。這些命令皆需 `--remote` 與個人憑證。`deploy` 是相同兩步的組合操作。所有資料的更新由使用者主動操作，教師介面不做自動輪詢。
