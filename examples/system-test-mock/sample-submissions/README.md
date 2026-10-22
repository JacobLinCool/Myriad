# 模擬考提交範例

每個題目有兩份完整 C 程式，請貼入對應的提交入口。

- `pass.c`：輸出與實作方式均符合要求，預期 100%。
- `semantic-fail.c`：輸出正確，但實作方式違反要求，預期 0%；保留 AC 測資結果與失敗原因。

這 12 份程式用於分別檢查功能測資與語意要求。每份程式預期通過對應的 18 筆功能測資；語意判定與原因文字需在自己的模型設定下驗證。執行步驟見 [模擬考說明](../README.md)。

| 提交入口                                                       | 符合要求                        | 違反要求                                          | 違反之處                                                        |
| -------------------------------------------------------------- | ------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| [1：三角形分類器](../problems/triangle/statement.md)           | [pass.c](triangle/pass.c)       | [semantic-fail.c](triangle/semantic-fail.c)       | main 自行分類，沒有呼叫 classify_triangle。                     |
| [1 Bonus：周長資訊](../problems/triangle-bonus/statement.md)   | [pass.c](triangle-bonus/pass.c) | [semantic-fail.c](triangle-bonus/semantic-fail.c) | triangle_perimeter 自行判斷有效性，沒有呼叫 classify_triangle。 |
| [2：二進位亮點](../problems/bits/statement.md)                 | [pass.c](bits/pass.c)           | [semantic-fail.c](bits/semantic-fail.c)           | 使用 % 與 / 計數，未使用要求的 & 與右移。                       |
| [2 Bonus：最高亮點位置](../problems/bits-bonus/statement.md)   | [pass.c](bits-bonus/pass.c)     | [semantic-fail.c](bits-bonus/semantic-fail.c)     | highest_bit 使用除法，沒有使用右移。                            |
| [3：數字縮合](../problems/digits/statement.md)                 | [pass.c](digits/pass.c)         | [semantic-fail.c](digits/semantic-fail.c)         | sum_digits 使用迴圈，沒有遞迴。                                 |
| [3 Bonus：縮合到一位數](../problems/digits-bonus/statement.md) | [pass.c](digits-bonus/pass.c)   | [semantic-fail.c](digits-bonus/semantic-fail.c)   | reduce_digits 使用數學公式，沒有呼叫 sum_digits 並遞迴。        |

採最佳提交計分：同一身分先提交通過版本，再提交失敗版本時，該題最佳成績仍為 100%。請查看本次提交結果或提交紀錄，確認失敗版本的 0 分與原因。

這些檔案僅供本機測試與複製，不會由題目建置流程放入學生頁面。
