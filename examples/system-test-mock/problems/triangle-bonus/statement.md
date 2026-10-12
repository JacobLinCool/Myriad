# 1 Bonus：三角形分類器・周長資訊

讀入三個邊長，判斷能否組成三角形以及類型。

## 輸入格式
一行三個整數 `a b c`，各介於 1 至 1,000。

## 輸出格式
第一行輸出以下其中一個字串：
- `INVALID`：不能組成三角形（任兩邊和必須嚴格大於第三邊）。
- `EQUILATERAL`：三邊相等。
- `ISOSCELES`：恰有兩邊相等。
- `SCALENE`：三邊皆不相等。

第二行輸出周長；無法組成三角形時輸出 0。

## 實作要求
必須定義 int classify_triangle(int a,int b,int c)，在此函式內判斷三角形有效性及類型，回傳 0=無效、3=等邊、2=恰兩邊相等、1=三邊皆異。main 必須實際呼叫此函式並使用回傳值決定輸出；不得只宣告函式卻將分類工作全部放在 main。
另須定義 int triangle_perimeter(int a,int b,int c)，其內必須實際呼叫 classify_triangle 判斷有效性，再回傳周長或 0；main 必須呼叫並在第二行輸出結果。

```c
int classify_triangle(int a, int b, int c);
int triangle_perimeter(int a, int b, int c);
```

請勿輸出提示文字。
