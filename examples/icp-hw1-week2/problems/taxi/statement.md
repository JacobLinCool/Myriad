# 計程車費分攤

輸入起跳價（base fare）、每公里費用（cost per km）、行駛距離（公里）與乘客人數，計算總車資與每位乘客應付的金額：

$$\text{total} = \text{base\_fare} + \text{cost\_per\_km} \times \text{distance}$$

$$\text{per\_person} = \frac{\text{total}}{\text{passengers}}$$

總車資為整數；每人金額可能不是整數，請以浮點數計算並四捨五入到小數點後兩位。每筆測資包含多趟車程，請用迴圈逐趟計算。

## 輸入格式

第一行一個整數 $T$，表示有 $T$ 趟車程（$1 \le T \le 1000$）。接下來 $T$ 行，每行四個整數：$\text{base\_fare}$、$\text{cost\_per\_km}$、$\text{distance}$、$\text{passengers}$，以空白分隔。

## 輸出格式

每趟車程輸出一行：

```
Total Fare = NT$T, Each Passenger Pays = NT$P
```

其中 $T$ 為總車資（整數），$P$ 為每人金額，固定輸出小數點後兩位（例如 `printf("%.2f", ...)`）。

## 子任務

所有車程皆滿足 $0 \le \text{base\_fare} \le 1000$、$0 \le \text{cost\_per\_km} \le 100$、$0 \le \text{distance} \le 100$、$1 \le \text{passengers} \le 10$，且總車資不超過 $10000$。

| 子任務 | 限制 |
| --- | --- |
| 1 | 總車資可以被乘客人數整除 |
| 2 | 總車資不一定能被乘客人數整除 |
| 3 | 邊界：每趟都是只有 1 位乘客，或距離、每公里費用、起跳價為 0 |
| 4 | 較大數值：總車資介於 $5000$ 與 $10000$ 之間 |

每個子任務的測資全部正確才得到該子任務的分數，四個子任務等分。
