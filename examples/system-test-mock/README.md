# 系統測試模擬考題

三題各有基本版與 Bonus，共六個獨立提交入口。用於驗證起始程式碼、語意檢查與提交結果。

每入口有 18 筆測資，共 108 筆；`tests/*.out` 是獨立計算的答案，供發布前交叉驗證使用。平台 build 會以 `solution.c` 產生正式答案摘要。

採最佳提交、各入口等權計分；Bonus 為獨立題目，不是額外分數。每題測資為單一群組，全部通過且符合實作要求時該入口才取得 100%。

建置與發布：

```sh
node packages/cli/bin/myriad.js build examples/system-test-mock
node packages/cli/bin/myriad.js deploy examples/system-test-mock --remote https://judge.nycu.ai
```

發布需在環境提供 MYRIAD_TEACHER_TOKEN。請勿將憑證寫進題目資料夾。

## 已發布版本

作答網址：https://judge.nycu.ai/exams/system-test-mock

開放至 2026-10-19 03:20（Asia/Taipei），擁有者為 NYCU 314551005。

## 驗證

- 六份參考解答在 Wasm 引擎通過全部 108 筆測資，輸出與獨立答案一致。
- 六份參考解答通過真實 semantic check；六份輸出正確但違反實作方式的程式均被拒絕。
- Production 完成六次成功提交與一次語意不合格提交，已重新讀取保存結果確認。
- 測試紀錄的訪客名稱為 `SYSTEM-SMOKE-PASS` 與 `SYSTEM-SMOKE-SEMANTIC-FAIL`。
