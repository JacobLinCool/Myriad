# 身高換算

讀入一個人的身高，以英尺（feet）與英吋（inches）表示，換算成公分並四捨五入到小數點後一位。

請使用前置處理指令（`#define`）定義每英尺的英吋數與每英吋的公分數：

- 1 英尺 = 12 英吋
- 1 英吋 = 2.54 公分

$$\text{cm} = (\text{feet} \times 12 + \text{inches}) \times 2.54$$

每筆測資包含多組身高，請用迴圈逐組換算。

## 輸入格式

第一行一個整數 $T$，表示有 $T$ 組身高（$1 \le T \le 1000$）。接下來 $T$ 行，每行兩個整數 $\text{feet}$ 與 $\text{inches}$，以空白分隔。

## 輸出格式

每組身高輸出一行：

```
Height in centimeters = X cm
```

其中 $X$ 為換算結果，四捨五入到小數點後一位（例如 `printf("%.1f", ...)`）。

## 子任務

| 子任務 | 限制 |
| --- | --- |
| 1 | 常見身高：$4 \le \text{feet} \le 6$，$0 \le \text{inches} \le 11$ |
| 2 | 英尺或英吋可能為 0：$0 \le \text{feet} \le 7$，$0 \le \text{inches} \le 11$ |
| 3 | 英吋可能超過 11：$0 \le \text{feet} \le 7$，$0 \le \text{inches} \le 100$ |
| 4 | 較大數值：$0 \le \text{feet} \le 1000$，$0 \le \text{inches} \le 1000$ |

每個子任務的測資全部正確才得到該子任務的分數，四個子任務等分。
