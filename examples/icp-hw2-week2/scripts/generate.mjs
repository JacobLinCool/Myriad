// Generates the ICP Homework 2 (Week 2) problems: statements, reference
// solutions, subtasks and tests. Deterministic; rerun after editing, then
// `myriad build`. Usage: node scripts/generate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let seed = 20261006;
// High bits of the LCG; its low bits cycle with short periods.
const random = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor((seed / 2147483648) * n);
};
const between = (lo, hi) => lo + random(hi - lo + 1);
const pick = (items) => items[random(items.length)];
const shuffle = (items) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const limits = {
  instructionBudget: 50000000,
  logicalTimeLimitMs: 2000,
  memoryMb: 64,
  outputLimitBytes: 65536,
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

// 1. Odd or even until 0, rejecting negatives.
const lines = (values) => values.map((v) => `${v}\n`).join("");
const parity = (values) => lines([...values, 0]);
// Negatives use the same magnitude range as the positives.
const randomValues = (count, lo, hi, negatives = 0) =>
  Array.from({ length: count }, () => (random(100) < negatives ? -1 : 1) * between(lo, hi));
// Hand-picked values shuffled into a large random run.
const mixed = (picked, values) => parity(shuffle([...picked, ...values]));
const parityTests = problem(
  "parity",
  {
    title: "奇數或偶數",
    order: 0,
    sampleCases: [
      {
        input: "45\n-7\n12\n0\n",
        output: "45 is odd.\nNegative number is not allowed.\n12 is even.\nProgram terminated.\n",
      },
    ],
  },
  `# 奇數或偶數

使用 \`while\` 迴圈重複讀入整數，判斷每個正整數是奇數還是偶數：

- 讀到 \`0\` 時結束程式（使用 \`break\`），並輸出 \`Program terminated.\`。
- 讀到負整數時，輸出錯誤訊息，並使用 \`continue\` 略過這次輸入，繼續讀下一個。

## 輸入格式

若干行，每行一個整數，最後一行是 \`0\`。\`0\` 只會出現在最後一行。

## 輸出格式

依輸入順序，每個非零整數輸出一行：

- 正整數 $n$ 為奇數：\`n is odd.\`
- 正整數 $n$ 為偶數：\`n is even.\`
- 負整數：\`Negative number is not allowed.\`

最後輸出一行 \`Program terminated.\`。不需要輸出輸入提示文字。

## 子任務

每筆測資的整數個數（不含 \`0\`）介於 $400$ 與 $1000$ 之間。

| 子任務 | 限制 |
| --- | --- |
| 1 | 只有正整數，且 $1 \\le n \\le 1000$ |
| 2 | 可能出現負整數，$\\lvert n \\rvert \\le 10^6$ |
| 3 | 邊界：只有負數、只有偶數、只有奇數，或大量重複的小數值，$\\lvert n \\rvert \\le 10^6$ |
| 4 | 較大數值：$\\lvert n \\rvert \\le 2^{31} - 1$ |

每個子任務的測資全部正確才得到該子任務的分數，四個子任務等分。
`,
  `#include <stdio.h>

int main(void) {
    int n;
    while (scanf("%d", &n) == 1) {
        if (n == 0) break;
        if (n < 0) {
            printf("Negative number is not allowed.\\n");
            continue;
        }
        printf("%d is %s.\\n", n, n % 2 == 0 ? "even" : "odd");
    }
    printf("Program terminated.\\n");
    return 0;
}
`,
  [
    {
      name: "子任務 1：只有正整數",
      inputs: [
        mixed([45, 12, 1, 1000, 999], randomValues(395, 1, 1000)),
        parity(randomValues(600, 1, 1000)),
        parity(randomValues(1000, 1, 1000)),
        parity(randomValues(450, 1, 20)),
        parity(randomValues(800, 1, 1000)),
      ],
    },
    {
      name: "子任務 2：包含負整數",
      inputs: [
        mixed([45, -7, 12, -1, 1, -1000000], randomValues(494, 1, 1000000, 30)),
        parity(randomValues(700, 1, 1000000, 30)),
        parity(randomValues(1000, 1, 1000000, 50)),
        parity(randomValues(500, 1, 100, 70)),
        parity(randomValues(900, 1, 1000000, 10)),
      ],
    },
    {
      name: "子任務 3：邊界情況",
      inputs: [
        parity(randomValues(500, 1, 1000000, 100)),
        parity(randomValues(600, 1, 500000).map((v) => v * 2)),
        parity(randomValues(600, 0, 499999).map((v) => v * 2 + 1)),
        parity([...randomValues(300, 1, 1000000, 100), ...randomValues(300, 1, 1000000)]),
        mixed([1, 2, -1, -2, 1000000, -1000000], randomValues(694, 1, 2)),
      ],
    },
    {
      name: "子任務 4：較大數值",
      inputs: [
        mixed([2147483647, 2147483646, -2147483647, 1000000000, 1000000001], randomValues(995, 1, 2147483647, 20)),
        parity(randomValues(1000, 1000000, 2147483647, 10)),
        parity(randomValues(1000, 1, 2147483647)),
        parity(randomValues(800, 2000000000, 2147483647, 30)),
        parity(randomValues(1000, 1, 2147483647, 50)),
      ],
    },
  ],
);

// 2. Latest of several mm/dd/yy dates, skipping invalid months.
const daysIn = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const date = (m, d, y) => `${m}/${d}/${String(y).padStart(2, "0")}`;
const randomDate = (years = [0, 99]) => {
  const m = between(1, 12);
  return date(m, between(1, daysIn[m - 1]), between(...years));
};
const invalidDate = () =>
  date(pick([13, 14, 15, 20, 31, 99, 0]), between(1, 28), between(0, 99));
const dates = (values) => lines([...values, "0/0/0"]);
function randomDates(count, { invalid = 0, years } = {}) {
  const out = [randomDate(years)];
  while (out.length < count)
    out.push(random(100) < invalid ? invalidDate() : randomDate(years));
  // At least one valid date, not necessarily first.
  return dates(shuffle(out));
}
const mixedDates = (picked, count, options) =>
  dates(shuffle([...picked, ...randomDates(count, options).trim().split("\n").slice(0, -1)]));
const latestTests = problem(
  "latest",
  {
    title: "最晚的日期",
    order: 1,
    sampleCases: [
      {
        input: "3/6/08\n15/4/07\n6/3/09\n5/17/07\n0/0/0\n",
        output: "Invalid month! Please enter again.\n6/3/09 is the latest date\n",
      },
    ],
  },
  `# 最晚的日期

使用 \`while\` 迴圈讀入任意多個 \`mm/dd/yy\` 格式的日期，找出其中在日曆上最晚的一個：

- 讀到 \`0/0/0\` 表示沒有更多日期（使用 \`break\`）。保證在 \`0/0/0\` 之前至少有一個合法日期。
- 若月份不合法（小於 $1$ 或大於 $12$），輸出錯誤訊息，並使用 \`continue\` 忽略這個日期。先判斷是否為 \`0/0/0\`，再檢查月份。
- 最後輸出最晚的日期。

年份 \`yy\` 為兩位數，\`00\` 到 \`99\` 都視為同一個世紀，數字越大越晚。

## 輸入格式

若干行，每行一個日期 \`m/d/y\`，最後一行是 \`0/0/0\`。月與日不補零；年份為兩位數，必要時補零（例如 \`08\`）。合法月份的日期一定存在（不會有 2 月 30 日）。

## 輸出格式

每個月份不合法的日期，依輸入順序輸出一行：

\`\`\`
Invalid month! Please enter again.
\`\`\`

最後輸出一行：

\`\`\`
m/d/yy is the latest date
\`\`\`

月與日不補零，年份固定輸出兩位數（例如 \`printf("%d/%d/%02d", ...)\`）。不需要輸出輸入提示文字。

## 子任務

每筆測資的日期個數（不含 \`0/0/0\`）介於 $400$ 與 $1000$ 之間。

| 子任務 | 限制 |
| --- | --- |
| 1 | 所有月份都合法 |
| 2 | 所有月份都合法，大多數日期在同一年或同一個月 |
| 3 | 可能出現不合法的月份（例如 $0$ 或大於 $12$） |
| 4 | 綜合：日期個數可達 $1000$，可能有重複日期與不合法月份 |

每個子任務的測資全部正確才得到該子任務的分數，四個子任務等分。
`,
  `#include <stdio.h>

int main(void) {
    int m, d, y;
    int best_m = 0, best_d = 0, best_y = -1;
    while (scanf("%d/%d/%d", &m, &d, &y) == 3) {
        if (m == 0 && d == 0 && y == 0) break;
        if (m < 1 || m > 12) {
            printf("Invalid month! Please enter again.\\n");
            continue;
        }
        if (y > best_y || (y == best_y && (m > best_m || (m == best_m && d > best_d)))) {
            best_m = m;
            best_d = d;
            best_y = y;
        }
    }
    printf("%d/%d/%02d is the latest date\\n", best_m, best_d, best_y);
    return 0;
}
`,
  [
    {
      name: "子任務 1：月份都合法",
      inputs: [
        mixedDates(["3/6/08", "6/3/09", "5/17/07", "12/31/98", "1/1/99"], 395),
        randomDates(600),
        randomDates(1000),
        randomDates(450, { years: [0, 9] }),
        randomDates(800, { years: [50, 99] }),
      ],
    },
    {
      name: "子任務 2：相同年份或月份",
      inputs: [
        mixedDates(["3/6/08", "5/17/08", "4/30/08", "6/30/08", "6/12/08"], 495, { years: [8, 8] }),
        randomDates(700, { years: [20, 22] }),
        randomDates(1000, { years: [7, 7] }),
        dates(shuffle([...Array.from({ length: 500 }, () => date(12, between(1, 30), 45)), "12/31/45"])),
        dates(shuffle([...Array.from({ length: 600 }, () => date(between(1, 11), between(1, 28), 99)), "12/1/99"])),
      ],
    },
    {
      name: "子任務 3：不合法的月份",
      inputs: [
        mixedDates(["15/4/07", "13/1/99", "0/5/10", "0/1/0", "20/20/20"], 495, { invalid: 20 }),
        randomDates(700, { invalid: 40 }),
        randomDates(1000, { invalid: 25, years: [90, 99] }),
        dates(shuffle([...Array.from({ length: 500 }, invalidDate), "1/1/00"])),
        randomDates(800, { invalid: 60, years: [0, 3] }),
      ],
    },
    {
      name: "子任務 4：較多日期",
      inputs: [
        randomDates(1000, { invalid: 15 }),
        randomDates(1000, { invalid: 5, years: [40, 41] }),
        dates([...Array.from({ length: 999 }, () => "5/5/05")]),
        randomDates(1000, { invalid: 50 }),
        dates(shuffle(["12/31/99", ...Array.from({ length: 999 }, () => randomDate([0, 98]))])),
      ],
    },
  ],
);

console.log(JSON.stringify({ parity: parityTests, latest: latestTests }));
