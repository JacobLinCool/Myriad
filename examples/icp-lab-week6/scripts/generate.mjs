// Generates the ICP Week 6 Lab problems: statements, reference solutions,
// subtasks and tests. Deterministic; rerun after editing, then `myriad build`.
// Usage: node scripts/generate.mjs
//
// Test inputs reach the student's browser, so each test holds hundreds of
// cases. Each subtask targets one category of behavior and mixes it with the
// categories before it, so a program that only handles the new category (for
// example, always printing the error message) still fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let seed = 20261109;
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
const repeat = (count, make) => Array.from({ length: count }, make);
// T, then T cases in shuffled order.
const batch = (cases) => `${cases.length}\n${shuffle(cases).join("")}`;
// Mixes `count` cases drawn from weighted makers, e.g. [[3, a], [1, b]].
const mix = (count, weighted) => {
  const total = weighted.reduce((sum, [weight]) => sum + weight, 0);
  return repeat(count, () => {
    let roll = random(total);
    for (const [weight, make] of weighted) {
      if (roll < weight) return make();
      roll -= weight;
    }
  });
};
const gcdOf = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
const limits = {
  instructionBudget: 200000000,
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

// Values stay within 10^4 so a loop that tries every divisor also passes;
// the lab is about functions, not about Euclid's algorithm.
const MAX = 10000;
// Two coprime integers in [lo, hi], distinct and both at least 2.
function coprime(lo, hi) {
  for (;;) {
    const x = between(lo, hi),
      y = between(lo, hi);
    if (x !== y && gcdOf(x, y) === 1) return [x, y];
  }
}

// 1. GCD.
const gcdCase = ([a, b]) => `${a} ${b}\n`;
const gcdKinds = {
  // A common factor above 1, neither number dividing the other.
  normal: () => {
    for (;;) {
      const g = between(2, 200);
      const [x, y] = coprime(2, Math.floor(MAX / g));
      if (g * x <= MAX && g * y <= MAX) return [g * x, g * y];
    }
  },
  coprime: () =>
    pick([
      () => coprime(2, MAX),
      () => {
        const n = between(2, MAX - 1);
        return [n, n + 1];
      },
      () => coprime(2, 100),
    ])(),
  divisible: () =>
    pick([
      () => {
        const a = between(1, 1000);
        return shuffle([a, a * between(2, Math.floor(MAX / a))]);
      },
      () => {
        const a = between(1, MAX);
        return [a, a];
      },
      () => shuffle([1, between(1, MAX)]),
    ])(),
  zero: () => pick([() => [0, between(1, MAX)], () => [between(1, MAX), 0], () => [0, 0]])(),
};
const signed = ([a, b]) =>
  pick([
    () => [-a, b],
    () => [a, -b],
    () => [-a, -b],
  ])();
gcdKinds.negative = () => {
  for (;;) {
    const pair = signed(pick([gcdKinds.normal, gcdKinds.coprime, gcdKinds.divisible, gcdKinds.zero])());
    if (pair[0] < 0 || pair[1] < 0) return pair;
  }
};
const gcds = (count, weighted) => mix(count, weighted).map(gcdCase);
const gcdTests = problem(
  "gcd",
  {
    title: "最大公因數",
    semanticCheck: "檢查程式是否遵守以下題面實作要求：\n1. 定義名為 gcd 的函式，回傳 int，接收兩個 int 參數（相容於 int gcd(int a, int b)；參數名稱不限），實際負責計算並回傳最大公因數，可呼叫輔助函式。\n2. main 實際呼叫 gcd 處理輸入，並使用其回傳值產生各組答案；只有宣告、未使用函式、註解、或呼叫後丟棄結果而另算答案，不符合要求。\n3. 使用迴圈逐組處理輸入的 T 組整數。\n只檢查上述實作方式。gcd 可用迴圈、遞迴或其他合理演算法，不限制區域變數名稱、輔助函式或排版。數值正確性與輸出格式由測資判斷。",
    order: 0,
    sampleCases: [
      { input: "2\n12 18\n24 36\n", output: "GCD: 6\nGCD: 12\n" },
      { input: "3\n7 5\n0 9\n-8 12\n", output: "GCD: 1\nGCD: 9\nGCD: 4\n" },
    ],
  },
  `# 最大公因數

撰寫函式 \`gcd\` 計算兩個整數的最大公因數（GCD）並回傳結果，在 \`main\` 中呼叫它：

\`\`\`c
int gcd(int a, int b);
\`\`\`

結果一律為非負整數：

- 其中一個數為 $0$ 時，GCD 是另一個數的絕對值，例如 $\\gcd(0, 9) = 9$。
- 兩個數都是 $0$ 時，數學上沒有定義，本題規定輸出 $0$。
- 輸入可能是負數，GCD 與正負號無關，例如 $\\gcd(-8, 12) = 4$。

每筆測資包含多組整數，請用迴圈逐組計算。

## 輸入格式

第一行一個整數 $T$，表示有 $T$ 組整數（$1 \\le T \\le 1000$）。接下來 $T$ 行，每行兩個整數 $a$ 與 $b$，以空白分隔，$\\lvert a \\rvert, \\lvert b \\rvert \\le 10^4$。

## 輸出格式

每組整數輸出一行：

\`\`\`
GCD: g
\`\`\`

不需要輸出輸入提示文字。

## 子任務

每個子任務以一種情況為主，並混合前面子任務的一般情況。

| 子任務 | 主要情況 | 限制 |
| --- | --- | --- |
| 1 | 一般情況 | 兩個正整數有大於 $1$ 的公因數，且彼此不整除 |
| 2 | 互質 | 兩個正整數沒有大於 $1$ 的公因數，GCD 為 $1$ |
| 3 | 整除或相等 | 一個數是另一個數的倍數，或兩數相同，包含其中一數為 $1$ |
| 4 | 零 | 其中一個數為 $0$，或兩個數都是 $0$ |
| 5 | 負數 | 其中一個或兩個數為負，並混合以上所有情況 |

每個子任務的測資全部正確才得到該子任務的分數，五個子任務等分。
`,
  `#include <stdio.h>

int gcd(int a, int b) {
    if (a < 0) a = -a;
    if (b < 0) b = -b;
    while (b != 0) {
        int r = a % b;
        a = b;
        b = r;
    }
    return a;
}

int main(void) {
    int t, a, b;
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0 && scanf("%d %d", &a, &b) == 2)
        printf("GCD: %d\\n", gcd(a, b));
    return 0;
}
`,
  [
    {
      name: "子任務 1：一般情況",
      inputs: [
        batch([gcdCase([12, 18]), gcdCase([24, 36]), gcdCase([6, 10]), ...gcds(297, [[1, gcdKinds.normal]])]),
        batch(gcds(500, [[1, gcdKinds.normal]])),
        batch(gcds(800, [[1, gcdKinds.normal]])),
        batch(gcds(1000, [[1, gcdKinds.normal]])),
      ],
    },
    {
      name: "子任務 2：互質",
      inputs: [
        batch([gcdCase([7, 5]), gcdCase([8, 9]), gcdCase([9973, 9967]), ...gcds(397, [[3, gcdKinds.coprime], [2, gcdKinds.normal]])]),
        batch(gcds(600, [[3, gcdKinds.coprime], [2, gcdKinds.normal]])),
        batch(gcds(800, [[1, gcdKinds.coprime], [1, gcdKinds.normal]])),
        batch(gcds(1000, [[3, gcdKinds.coprime], [2, gcdKinds.normal]])),
      ],
    },
    {
      name: "子任務 3：整除或相等",
      inputs: [
        batch([gcdCase([5, 5]), gcdCase([1, 1]), gcdCase([3, 9999]), gcdCase([10000, 100]), gcdCase([1, 7]), ...gcds(395, [[3, gcdKinds.divisible], [1, gcdKinds.normal], [1, gcdKinds.coprime]])]),
        batch(gcds(600, [[3, gcdKinds.divisible], [1, gcdKinds.normal], [1, gcdKinds.coprime]])),
        batch(gcds(800, [[1, gcdKinds.divisible], [1, gcdKinds.normal], [1, gcdKinds.coprime]])),
        batch(gcds(1000, [[3, gcdKinds.divisible], [1, gcdKinds.normal], [1, gcdKinds.coprime]])),
      ],
    },
    {
      name: "子任務 4：零",
      inputs: [
        batch([gcdCase([0, 9]), gcdCase([9, 0]), gcdCase([0, 0]), gcdCase([0, 1]), gcdCase([10000, 0]), ...gcds(395, [[2, gcdKinds.zero], [1, gcdKinds.normal], [1, gcdKinds.coprime], [1, gcdKinds.divisible]])]),
        batch(gcds(600, [[2, gcdKinds.zero], [1, gcdKinds.normal], [1, gcdKinds.coprime], [1, gcdKinds.divisible]])),
        batch([...repeat(50, () => gcdCase([0, 0])), ...gcds(450, [[1, gcdKinds.normal], [1, gcdKinds.coprime]])]),
        batch(gcds(1000, [[2, gcdKinds.zero], [1, gcdKinds.normal], [1, gcdKinds.coprime], [1, gcdKinds.divisible]])),
      ],
    },
    {
      name: "子任務 5：負數",
      inputs: [
        batch([gcdCase([-8, 12]), gcdCase([8, -12]), gcdCase([-8, -12]), gcdCase([0, -5]), gcdCase([-5, 0]), gcdCase([-7, -7]), gcdCase([-1, 10000]), ...gcds(393, [[3, gcdKinds.negative], [1, gcdKinds.normal], [1, gcdKinds.zero]])]),
        batch(gcds(600, [[3, gcdKinds.negative], [1, gcdKinds.normal], [1, gcdKinds.coprime]])),
        batch(gcds(800, [[1, gcdKinds.negative]])),
        batch(gcds(1000, [[3, gcdKinds.negative], [1, gcdKinds.normal], [1, gcdKinds.coprime], [1, gcdKinds.divisible], [1, gcdKinds.zero]])),
      ],
    },
  ],
);

// 2. Reduce a fraction.
// The value is printed with %g (6 significant digits). Tests skip fractions
// whose 7th significant digit sits near a rounding boundary, so float and
// double solutions agree. |n|, |d| < 10^4 keeps %g out of exponent notation.
function fair(n, d) {
  const value = Math.abs(n / d);
  if (value === 0) return true;
  const scaled = value * 10 ** (5 - Math.floor(Math.log10(value)));
  const frac = scaled - Math.floor(scaled);
  return frac < 1e-6 || frac > 1 - 1e-6 || Math.abs(frac - 0.5) >= 0.1;
}
const FRACTION = 9999;
const fraction = ([n, d]) => {
  if (d !== 0 && !fair(n, d)) throw new Error(`Rounding-sensitive fraction: ${n}/${d}`);
  if (n === 0 && d < 0) throw new Error("0 over a negative denominator is excluded");
  return `${n}/${d}\n`;
};
const fairly = (make) => () => {
  for (;;) {
    const [n, d] = make();
    if (d === 0 || fair(n, d)) return [n, d];
  }
};
const reduceKinds = {
  // A common factor above 1; includes fractions that reduce to an integer.
  normal: fairly(() =>
    pick([
      () => {
        for (;;) {
          const g = between(2, 300);
          const [x, y] = coprime(1, Math.floor(FRACTION / g));
          if (g * x <= FRACTION && g * y <= FRACTION) return [g * x, g * y];
        }
      },
      () => {
        const d = between(2, 300);
        return [d * between(1, Math.floor(FRACTION / d)), d];
      },
    ])(),
  ),
  reduced: fairly(() =>
    pick([
      () => coprime(1, FRACTION),
      () => coprime(1, 50),
      () => [between(1, FRACTION), 1],
      () => [1, between(2, FRACTION)],
    ])(),
  ),
  zeroDenominator: () => [between(0, FRACTION), 0],
  zeroNumerator: () => [0, between(1, FRACTION)],
};
reduceKinds.negative = () => {
  const [n, d] = pick([reduceKinds.normal, reduceKinds.reduced, reduceKinds.zeroDenominator])();
  if (d === 0) return [-Math.max(n, 1), 0];
  return pick([
    () => [-n, d],
    () => [n, -d],
    () => [-n, -d],
  ])();
};
const fractions = (count, weighted) => mix(count, weighted).map(fraction);
const { normal, reduced, zeroDenominator, zeroNumerator, negative } = reduceKinds;
const reduceTests = problem(
  "reduce",
  {
    title: "分數約分",
    semanticCheck: "檢查程式是否遵守以下題面實作要求：\n1. 定義名為 reduce 的函式，回傳 void，依序接收兩個 int 與兩個 int 指標（相容於 void reduce(int numerator, int denominator, int *reduced_numerator, int *reduced_denominator)；參數名稱不限）。\n2. reduce 的實際約分流程使用 gcd 函式取得最大公因數（gcd 回傳 int 且接收兩個 int；可經由輔助函式呼叫），並透過兩個輸出指標寫回約分後的分子與分母。\n3. 程式實際呼叫 reduce 處理有效分數，使用指標寫回的結果產生輸出。只有宣告、未使用函式、假呼叫或以全域變數取代兩個指標寫回結果，不符合要求。分母為零可先攔截，不必呼叫 reduce。\n4. 使用迴圈逐一處理輸入的 T 個分數。\n只檢查上述實作方式。不限制 gcd 採迴圈、遞迴或其他合理演算法，不限制輔助函式、參數名稱或排版。數值正確性與輸出格式由測資判斷。",
    order: 1,
    sampleCases: [
      {
        input: "2\n6/12\n5/0\n",
        output: "In lowest terms: 1/2\nThe value is: 0.5\nDenominator cannot be zero.\n",
      },
      {
        input: "3\n-4/6\n0/7\n9/3\n",
        output:
          "In lowest terms: -2/3\nThe value is: -0.666667\nIn lowest terms: 0/1\nThe value is: 0\nIn lowest terms: 3/1\nThe value is: 3\n",
      },
    ],
  },
  `# 分數約分

讀入分數，約分成最簡分數。撰寫函式 \`reduce\`，利用第一題的 \`gcd\` 算出約分後的分子與分母，並透過指標存回結果：

\`\`\`c
void reduce(int numerator, int denominator, int *reduced_numerator, int *reduced_denominator);
\`\`\`

接著輸出約分後的分數與它的值。

- 分母為 $0$ 時不約分，只輸出錯誤訊息。
- 約分後分母一律為正，負號放在分子：$\\frac{6}{-12}$ 約成 \`-1/2\`，$\\frac{-6}{-12}$ 約成 \`1/2\`。
- 分子為 $0$ 時約成 \`0/1\`。

每筆測資包含多個分數，請用迴圈逐一處理。

## 輸入格式

第一行一個整數 $T$，表示有 $T$ 個分數（$1 \\le T \\le 1000$）。接下來 $T$ 行，每行一個分數 \`n/d\`（例如 \`6/12\`、\`-4/6\`、\`5/0\`），$\\lvert n \\rvert, \\lvert d \\rvert \\le 9999$。分子為 $0$ 時分母不會是負數。

## 輸出格式

分母為 $0$ 時輸出一行：

\`\`\`
Denominator cannot be zero.
\`\`\`

否則輸出兩行：

\`\`\`
In lowest terms: p/q
The value is: v
\`\`\`

其中 \`p/q\` 是約分後的分數，\`v\` 是分數的值，請用浮點數除法計算並以 \`printf("%g", ...)\` 輸出（最多 6 位有效數字，去掉多餘的 0，例如 \`0.5\`、\`-0.666667\`、\`3\`）。注意整數相除會捨去小數。不需要輸出輸入提示文字。

## 子任務

每個子任務以一種情況為主，並混合前面子任務的一般情況。

| 子任務 | 主要情況 | 限制 |
| --- | --- | --- |
| 1 | 一般約分 | 分子與分母為正，且有大於 $1$ 的公因數（包含約分後分母為 $1$） |
| 2 | 已是最簡分數 | 分子與分母為正且互質，包含分母為 $1$ |
| 3 | 分母為零 | 可能出現分母為 $0$ 的分數 |
| 4 | 分子為零 | 可能出現分子為 $0$ 的分數 |
| 5 | 負數 | 分子或分母為負，或兩者皆為負，並混合以上所有情況 |

每個子任務的測資全部正確才得到該子任務的分數，五個子任務等分。
`,
  `#include <stdio.h>

int gcd(int a, int b) {
    if (a < 0) a = -a;
    if (b < 0) b = -b;
    while (b != 0) {
        int r = a % b;
        a = b;
        b = r;
    }
    return a;
}

void reduce(int numerator, int denominator, int *reduced_numerator, int *reduced_denominator) {
    int g = gcd(numerator, denominator);
    *reduced_numerator = numerator / g;
    *reduced_denominator = denominator / g;
    if (*reduced_denominator < 0) {
        *reduced_numerator = -*reduced_numerator;
        *reduced_denominator = -*reduced_denominator;
    }
}

int main(void) {
    int t, n, d, rn, rd;
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0 && scanf("%d/%d", &n, &d) == 2) {
        if (d == 0) {
            printf("Denominator cannot be zero.\\n");
            continue;
        }
        reduce(n, d, &rn, &rd);
        printf("In lowest terms: %d/%d\\n", rn, rd);
        printf("The value is: %g\\n", (double)rn / rd);
    }
    return 0;
}
`,
  [
    {
      name: "子任務 1：一般約分",
      inputs: [
        batch([fraction([6, 12]), fraction([9, 3]), fraction([4, 6]), fraction([100, 25]), fraction([9998, 9999 - 1]), ...fractions(295, [[1, normal]])]),
        batch(fractions(500, [[1, normal]])),
        batch(fractions(800, [[1, normal]])),
        batch(fractions(1000, [[1, normal]])),
      ],
    },
    {
      name: "子任務 2：已是最簡分數",
      inputs: [
        batch([fraction([1, 2]), fraction([2, 3]), fraction([7, 1]), fraction([1, 9999]), fraction([9999, 1]), fraction([1, 1]), ...fractions(394, [[3, reduced], [2, normal]])]),
        batch(fractions(600, [[3, reduced], [2, normal]])),
        batch(fractions(800, [[1, reduced], [1, normal]])),
        batch(fractions(1000, [[3, reduced], [2, normal]])),
      ],
    },
    {
      name: "子任務 3：分母為零",
      inputs: [
        batch([fraction([5, 0]), fraction([0, 0]), fraction([1, 0]), fraction([9999, 0]), ...fractions(396, [[2, zeroDenominator], [1, normal], [1, reduced]])]),
        batch(fractions(600, [[2, zeroDenominator], [1, normal], [1, reduced]])),
        batch(fractions(800, [[1, zeroDenominator], [2, normal], [2, reduced]])),
        batch(fractions(1000, [[2, zeroDenominator], [1, normal], [1, reduced]])),
      ],
    },
    {
      name: "子任務 4：分子為零",
      inputs: [
        batch([fraction([0, 7]), fraction([0, 1]), fraction([0, 9999]), fraction([0, 0]), ...fractions(396, [[2, zeroNumerator], [1, normal], [1, reduced], [1, zeroDenominator]])]),
        batch(fractions(600, [[2, zeroNumerator], [1, normal], [1, reduced], [1, zeroDenominator]])),
        batch(fractions(800, [[1, zeroNumerator], [2, normal], [2, reduced]])),
        batch(fractions(1000, [[2, zeroNumerator], [1, normal], [1, reduced], [1, zeroDenominator]])),
      ],
    },
    {
      name: "子任務 5：負數",
      inputs: [
        batch([fraction([-4, 6]), fraction([4, -6]), fraction([-4, -6]), fraction([-6, 12]), fraction([6, -12]), fraction([-6, -12]), fraction([-5, 0]), fraction([-9, 3]), fraction([7, -1]), ...fractions(391, [[3, negative], [1, normal], [1, zeroNumerator]])]),
        batch(fractions(600, [[3, negative], [1, normal], [1, reduced]])),
        batch(fractions(800, [[1, negative]])),
        batch(fractions(1000, [[3, negative], [1, normal], [1, reduced], [1, zeroDenominator], [1, zeroNumerator]])),
      ],
    },
  ],
);

console.log(JSON.stringify({ gcd: gcdTests, reduce: reduceTests }));
