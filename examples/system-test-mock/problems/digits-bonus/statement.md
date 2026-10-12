# 3 Bonus：數字縮合・縮合到一位數

計算非負整數所有十進位數字的總和。例如 5072 的數字總和是 14。

## 輸入格式
一個整數 `n`，範圍為 0 至 1,000,000,000。

## 輸出格式
第一行輸出各位數字的總和。輸入 0 時輸出 0。

第二行輸出反覆計算數字總和後得到的一位數。例如 5072 → 14 → 5。

## 實作要求
必須定義 int sum_digits(unsigned int n)，main 必須實際呼叫並輸出回傳值。sum_digits 必須透過對尚未處理的高位數字呼叫自身，以遞迴計算十進位數字總和。不得用迴圈、字串轉換或委派給使用迴圈的輔助函式處理數字。遞迴必須實際參與回傳結果，不能是未使用或無作用的程式碼。
另須定義 int reduce_digits(unsigned int n)，n<10 時回傳 n，否則呼叫 sum_digits，再將其結果交給 reduce_digits 自身遞迴；main 必須呼叫並在第二行輸出結果。不得用迴圈或數學捷徑直接計算最後答案。

```c
int sum_digits(unsigned int n);
int reduce_digits(unsigned int n);
```

請勿輸出提示文字。
