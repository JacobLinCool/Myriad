// Generates the ICP Homework 1 (Week 2) problems: statements, reference
// solutions, subtasks and tests. Deterministic; rerun after editing, then
// `myriad build`. Usage: node scripts/generate.mjs
//
// Test inputs reach the student's browser, so each test holds hundreds of
// cases with the hand-picked edge values shuffled in; reading inputs gives
// away little within an exam.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let seed = 20261005;
// High bits of the LCG; its low bits cycle with short periods.
const random = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor((seed / 2147483648) * n);
};
const between = (lo, hi) => lo + random(hi - lo + 1);
const shuffle = (items) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const repeat = (count, make) => Array.from({ length: count }, make);
// T, then T cases in shuffled order.
const batch = (cases) => `${cases.length}\n${shuffle(cases).join("")}`;
const limits = {
  instructionBudget: 50000000,
  logicalTimeLimitMs: 2000,
  memoryMb: 64,
  outputLimitBytes: 262144,
};

function problem(id, meta, statement, solution, groups) {
  const dir = path.join(root, "problems", id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
  let n = 0;
  const written = groups.map((group) => ({
    name: group.name,
    tests: group.inputs.map((input) => {
      const file = `${String(++n).padStart(2, "0")}.in`;
      fs.writeFileSync(path.join(dir, "tests", file), input);
      return file;
    }),
  }));
  fs.writeFileSync(
    path.join(dir, "problem.json"),
    JSON.stringify({ ...meta, normalize: "trim", limits, groups: written }, null, 2) + "\n",
  );
  fs.writeFileSync(path.join(dir, "statement.md"), statement);
  fs.writeFileSync(path.join(dir, "solution.c"), solution);
  return n;
}

// 1. Height: feet and inches to centimeters. 2.54 × an integer never ends in
// 5 at the hundredths, so one-decimal rounding is never at a tie.
const height = (feet, inches) => `${feet} ${inches}\n`;
const heights = (count, feet, inches) =>
  repeat(count, () => height(between(...feet), between(...inches)));
const heightTests = problem(
  "height",
  {
    title: "身高換算",
    order: 0,
    sampleCases: [
      {
        input: "2\n5 7\n6 0\n",
        output: "Height in centimeters = 170.2 cm\nHeight in centimeters = 182.9 cm\n",
      },
    ],
  },
  `# 身高換算

讀入一個人的身高，以英尺（feet）與英吋（inches）表示，換算成公分並四捨五入到小數點後一位。

請使用前置處理指令（\`#define\`）定義每英尺的英吋數與每英吋的公分數：

- 1 英尺 = 12 英吋
- 1 英吋 = 2.54 公分

$$\\text{cm} = (\\text{feet} \\times 12 + \\text{inches}) \\times 2.54$$

每筆測資包含多組身高，請用迴圈逐組換算。

## 輸入格式

第一行一個整數 $T$，表示有 $T$ 組身高（$1 \\le T \\le 1000$）。接下來 $T$ 行，每行兩個整數 $\\text{feet}$ 與 $\\text{inches}$，以空白分隔。

## 輸出格式

每組身高輸出一行：

\`\`\`
Height in centimeters = X cm
\`\`\`

其中 $X$ 為換算結果，四捨五入到小數點後一位（例如 \`printf("%.1f", ...)\`）。

## 子任務

| 子任務 | 限制 |
| --- | --- |
| 1 | 常見身高：$4 \\le \\text{feet} \\le 6$，$0 \\le \\text{inches} \\le 11$ |
| 2 | 英尺或英吋可能為 0：$0 \\le \\text{feet} \\le 7$，$0 \\le \\text{inches} \\le 11$ |
| 3 | 英吋可能超過 11：$0 \\le \\text{feet} \\le 7$，$0 \\le \\text{inches} \\le 100$ |
| 4 | 較大數值：$0 \\le \\text{feet} \\le 1000$，$0 \\le \\text{inches} \\le 1000$ |

每個子任務的測資全部正確才得到該子任務的分數，四個子任務等分。
`,
  `#include <stdio.h>

#define INCHES_PER_FOOT 12
#define CM_PER_INCH 2.54

int main(void) {
    int t, feet, inches;
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0 && scanf("%d %d", &feet, &inches) == 2) {
        double cm = (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH;
        printf("Height in centimeters = %.1f cm\\n", cm);
    }
    return 0;
}
`,
  [
    {
      name: "子任務 1：常見身高",
      inputs: [
        batch([height(5, 7), height(4, 11), height(6, 3), ...heights(297, [4, 6], [0, 11])]),
        batch(heights(600, [4, 6], [0, 11])),
        batch([height(4, 0), height(6, 11), ...heights(998, [4, 6], [0, 11])]),
        batch(heights(450, [4, 6], [0, 11])),
        batch(heights(800, [4, 6], [0, 11])),
      ],
    },
    {
      name: "子任務 2：英尺或英吋為 0",
      inputs: [
        batch([height(0, 0), height(6, 0), height(0, 11), ...heights(397, [0, 7], [0, 11])]),
        batch([height(1, 0), height(0, 1), height(7, 0), ...heights(597, [0, 7], [0, 11])]),
        batch([...heights(150, [0, 0], [0, 11]), ...heights(150, [0, 7], [0, 0]), ...heights(300, [0, 7], [0, 11])]),
        batch(heights(900, [0, 7], [0, 11])),
        batch([height(0, 0), ...heights(699, [0, 7], [0, 11])]),
      ],
    },
    {
      name: "子任務 3：英吋可能超過 11",
      inputs: [
        batch([height(0, 67), height(5, 12), height(0, 100), ...heights(497, [0, 7], [0, 100])]),
        batch(heights(800, [0, 7], [12, 100])),
        batch([height(7, 100), height(0, 12), ...heights(698, [0, 7], [0, 100])]),
        batch(heights(1000, [0, 7], [0, 100])),
        batch([...heights(300, [0, 0], [12, 100]), ...heights(300, [0, 7], [0, 100])]),
        batch(heights(550, [0, 7], [50, 100])),
      ],
    },
    {
      name: "子任務 4：較大數值",
      inputs: [
        batch([height(1000, 1000), height(1000, 0), height(0, 1000), ...heights(597, [0, 1000], [0, 1000])]),
        batch(heights(1000, [100, 1000], [0, 1000])),
        batch([...heights(200, [900, 1000], [900, 1000]), ...heights(500, [0, 1000], [0, 1000])]),
        batch(heights(800, [0, 1000], [0, 1000])),
        batch([height(999, 999), ...heights(899, [0, 1000], [0, 100])]),
        batch(heights(1000, [0, 1000], [0, 1000])),
      ],
    },
  ],
);

// 2. Taxi fare: total and per-passenger share.
// Shares are printed to two decimals; tests avoid values whose third decimal sits
// near a rounding boundary, so float and double solutions agree.
function fair(base, cost, distance, passengers) {
  const total = base + cost * distance;
  const cents = (total * 100) / passengers;
  return Math.abs(cents - Math.floor(cents) - 0.5) >= 0.1;
}
const taxi = (base, cost, distance, passengers) => {
  if (!fair(base, cost, distance, passengers))
    throw new Error(`Rounding-sensitive taxi test: ${[base, cost, distance, passengers]}`);
  return `${base} ${cost} ${distance} ${passengers}\n`;
};
function taxis(count, ranges, accept = () => true) {
  const out = [];
  while (out.length < count) {
    const values = ranges.map((r) => between(...r));
    const total = values[0] + values[1] * values[2];
    if (total <= 10000 && fair(...values) && accept(total, values[3], values)) out.push(taxi(...values));
  }
  return out;
}
const everyday = [[50, 200], [10, 40], [1, 40], [1, 10]];
const divisible = (t, p) => t % p === 0;
const edge = (total, passengers, [base, cost, distance]) =>
  passengers === 1 || base === 0 || cost === 0 || distance === 0;
const taxiTests = problem(
  "taxi",
  {
    title: "計程車費分攤",
    order: 1,
    sampleCases: [
      {
        input: "2\n80 25 10 3\n85 20 7 4\n",
        output:
          "Total Fare = NT$330, Each Passenger Pays = NT$110.00\nTotal Fare = NT$225, Each Passenger Pays = NT$56.25\n",
      },
    ],
  },
  `# 計程車費分攤

輸入起跳價（base fare）、每公里費用（cost per km）、行駛距離（公里）與乘客人數，計算總車資與每位乘客應付的金額：

$$\\text{total} = \\text{base\\_fare} + \\text{cost\\_per\\_km} \\times \\text{distance}$$

$$\\text{per\\_person} = \\frac{\\text{total}}{\\text{passengers}}$$

總車資為整數；每人金額可能不是整數，請以浮點數計算並四捨五入到小數點後兩位。每筆測資包含多趟車程，請用迴圈逐趟計算。

## 輸入格式

第一行一個整數 $T$，表示有 $T$ 趟車程（$1 \\le T \\le 1000$）。接下來 $T$ 行，每行四個整數：$\\text{base\\_fare}$、$\\text{cost\\_per\\_km}$、$\\text{distance}$、$\\text{passengers}$，以空白分隔。

## 輸出格式

每趟車程輸出一行：

\`\`\`
Total Fare = NT$T, Each Passenger Pays = NT$P
\`\`\`

其中 $T$ 為總車資（整數），$P$ 為每人金額，固定輸出小數點後兩位（例如 \`printf("%.2f", ...)\`）。

## 子任務

所有車程皆滿足 $0 \\le \\text{base\\_fare} \\le 1000$、$0 \\le \\text{cost\\_per\\_km} \\le 100$、$0 \\le \\text{distance} \\le 100$、$1 \\le \\text{passengers} \\le 10$，且總車資不超過 $10000$。

| 子任務 | 限制 |
| --- | --- |
| 1 | 總車資可以被乘客人數整除 |
| 2 | 總車資不一定能被乘客人數整除 |
| 3 | 邊界：每趟都是只有 1 位乘客，或距離、每公里費用、起跳價為 0 |
| 4 | 較大數值：總車資介於 $5000$ 與 $10000$ 之間 |

每個子任務的測資全部正確才得到該子任務的分數，四個子任務等分。
`,
  `#include <stdio.h>

int main(void) {
    int t, base_fare, cost_per_km, distance, passengers;
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0 && scanf("%d %d %d %d", &base_fare, &cost_per_km, &distance, &passengers) == 4) {
        int total = base_fare + cost_per_km * distance;
        double per_person = (double)total / passengers;
        printf("Total Fare = NT$%d, Each Passenger Pays = NT$%.2f\\n", total, per_person);
    }
    return 0;
}
`,
  [
    {
      name: "子任務 1：可以整除",
      inputs: [
        batch([taxi(80, 25, 10, 3), taxi(70, 20, 5, 2), taxi(100, 30, 10, 4), ...taxis(397, everyday, divisible)]),
        batch(taxis(700, everyday, divisible)),
        batch(taxis(1000, [[0, 1000], [0, 100], [0, 100], [1, 10]], divisible)),
        batch(taxis(550, [[50, 200], [10, 40], [1, 40], [2, 10]], divisible)),
        batch(taxis(850, everyday, divisible)),
      ],
    },
    {
      name: "子任務 2：不能整除",
      inputs: [
        batch([taxi(85, 20, 7, 4), taxi(80, 25, 11, 3), taxi(70, 15, 9, 6), taxi(100, 30, 8, 7), ...taxis(496, everyday)]),
        batch(taxis(800, everyday, (t, p) => t % p !== 0)),
        batch(taxis(1000, [[0, 1000], [0, 100], [0, 100], [1, 10]])),
        batch(taxis(600, [[50, 200], [10, 40], [1, 40], [3, 9]], (t, p) => t % p !== 0)),
        batch(taxis(900, everyday)),
        batch(taxis(750, [[0, 300], [0, 60], [0, 60], [1, 10]])),
      ],
    },
    {
      name: "子任務 3：邊界情況",
      inputs: [
        batch([
          taxi(85, 20, 3, 1), taxi(80, 25, 0, 4), taxi(70, 0, 15, 2), taxi(0, 25, 10, 3),
          taxi(0, 0, 0, 5), taxi(1000, 0, 0, 1),
          ...taxis(394, [[0, 1000], [0, 100], [0, 100], [1, 10]], edge),
        ]),
        batch(taxis(800, [[0, 1000], [0, 100], [0, 100], [1, 1]])),
        batch([...taxis(300, [[0, 0], [0, 100], [0, 100], [1, 10]]), ...taxis(300, [[0, 1000], [0, 0], [0, 100], [1, 10]])]),
        batch([...taxis(400, [[0, 1000], [0, 100], [0, 0], [1, 10]]), ...taxis(300, [[0, 1000], [0, 100], [0, 100], [1, 10]], edge)]),
        batch(taxis(1000, [[0, 1000], [0, 100], [0, 100], [1, 10]], edge)),
      ],
    },
    {
      name: "子任務 4：較大數值",
      inputs: [
        batch([taxi(1000, 90, 100, 10), taxi(900, 91, 99, 7), ...taxis(498, [[200, 1000], [50, 100], [50, 100], [1, 10]], (t) => t >= 5000)]),
        batch(taxis(800, [[0, 1000], [40, 100], [50, 100], [1, 10]], (t) => t >= 5000)),
        batch(taxis(1000, [[500, 1000], [60, 100], [60, 100], [1, 10]], (t) => t >= 5000)),
        batch(taxis(650, [[0, 1000], [50, 100], [50, 100], [2, 10]], (t, p) => t >= 5000 && t % p !== 0)),
        batch(taxis(900, [[0, 1000], [45, 100], [45, 100], [1, 10]], (t) => t >= 5000)),
      ],
    },
  ],
);

console.log(JSON.stringify({ height: heightTests, taxi: taxiTests }));
