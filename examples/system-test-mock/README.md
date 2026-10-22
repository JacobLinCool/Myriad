# 系統測試模擬考題

三題各有基本版與 Bonus，共六個獨立提交入口，用於驗證起始程式碼、語意檢查與提交結果。每個入口有 18 筆測資，共 108 筆；`tests/*.out` 是供發布前交叉比對的答案檔，平台 `build` 會執行 `solution.c` 產生正式答案摘要。

採最佳提交、各入口等權計分；Bonus 為獨立題目，不是額外分數。每題測資為單一群組，全部通過且符合實作要求時該入口才取得 100%。

## 本機使用

先完成根目錄 [README](../../README.md) 的 runtime、管理者憑證與工具鏈設定。這組題目帶有 `semanticCheck`，Worker 需設定 `OPENAI_API_KEY`，提交時會呼叫外部模型。

將範例複製到 repository 外，編輯 `exam.json` 的考試 ID、開始與結束時間，並以新的隨機值取代範例 salt。從 repository 根目錄執行：

```sh
cp -R examples/system-test-mock ../my-system-test
node packages/cli/bin/myriad.js --json build ../my-system-test
node packages/cli/bin/myriad.js --json deploy ../my-system-test --remote http://localhost:8787
```

發布使用 `MYRIAD_TEACHER_TOKEN` 或 `--token-file`。使用管理工作台的學生預覽檢查，或在設定的開放時間作答；正式部署請將 `--remote` 換成自己的網址。

## 驗證方式

[提交範例](sample-submissions/README.md) 為每題提供符合要求與刻意違反實作要求的兩份程式。先以 CLI `test` 檢查功能測資，再以瀏覽器提交確認語意判定與保存結果：

```sh
node packages/cli/bin/myriad.js --json test ../my-system-test triangle ../my-system-test/sample-submissions/triangle/pass.c
node packages/cli/bin/myriad.js --json test ../my-system-test triangle ../my-system-test/sample-submissions/triangle/semantic-fail.c
```

兩份程式都應通過功能測資，違反實作要求的版本預期在伺服器語意檢查後得零分。CLI `test` 不呼叫 OpenAI，不能用它驗證語意判定；模型及其原因可能隨設定不同，需在自己的部署重新檢查。
