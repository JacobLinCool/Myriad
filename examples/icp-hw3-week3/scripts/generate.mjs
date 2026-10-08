// Generates the ICP Homework 3 (Week 3) problems: statements, reference
// solutions, subtasks and tests. Deterministic; rerun after editing, then
// `myriad build`. Usage: node scripts/generate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let seed = 20261012;
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
// T, then T cases in shuffled order; hand-picked cases hide among random ones.
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

// 1. Bubble sort of eight integers.
const eight = (values) => `${values.join(" ")}\n`;
const values8 = (lo, hi) => repeat(8, () => between(lo, hi));
const distinct8 = (lo, hi) => {
  const set = new Set();
  while (set.size < 8) set.add(between(lo, hi));
  return shuffle([...set]);
};
const randomEight = (lo, hi) => eight(values8(lo, hi));
const distinctEight = (lo, hi) => eight(distinct8(lo, hi));
const sortTests = problem(
  "bubble",
  {
    title: "氣泡排序",
    order: 0,
    sampleCases: [
      {
        input: "2\n5 3 8 1 9 2 7 4\n10 -3 7 7 0 25 -3 1\n",
        output: "1 2 3 4 5 7 8 9\n-3 -3 0 1 7 7 10 25\n",
      },
    ],
  },
  `# 氣泡排序

氣泡排序（Bubble Sort）重複比較相鄰的兩個元素，順序錯誤就交換。重複整輪掃描直到不再需要交換，數列就排好了。

請實作氣泡排序：讀入 $8$ 個整數，由小到大排序後輸出。每筆測資包含多組數列，請逐組排序。

\`\`\`
func bubblesort( var a as array )
    for i from 1 to N
        for j from 0 to N - 2
            if a[j] > a[j + 1]
                swap( a[j], a[j + 1] )
end func
\`\`\`

## 輸入格式

第一行一個整數 $T$，表示有 $T$ 組數列（$1 \\le T \\le 1000$）。接下來 $T$ 行，每行 $8$ 個整數，以空白分隔。

## 輸出格式

每組數列輸出一行：排序後的 $8$ 個整數，以一個空白分隔。不需要輸出輸入提示文字。

## 子任務

| 子任務 | 限制 |
| --- | --- |
| 1 | $8$ 個整數互不相同，$1 \\le a_i \\le 100$ |
| 2 | 可能有重複的整數，$0 \\le a_i \\le 100$ |
| 3 | 可能有負整數，$\\lvert a_i \\rvert \\le 10^6$ |
| 4 | 綜合：包含已排序、完全反序、全部相同的數列，$\\lvert a_i \\rvert \\le 2^{31} - 1$ |

每個子任務的測資全部正確才得到該子任務的分數，四個子任務等分。
`,
  `#include <stdio.h>

#define N 8

void bubble_sort(int a[N]) {
    for (int i = 1; i <= N; i++)
        for (int j = 0; j <= N - 2; j++)
            if (a[j] > a[j + 1]) {
                int t = a[j];
                a[j] = a[j + 1];
                a[j + 1] = t;
            }
}

int main(void) {
    int t, a[N];
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0) {
        for (int i = 0; i < N; i++)
            if (scanf("%d", &a[i]) != 1) return 0;
        bubble_sort(a);
        for (int i = 0; i < N; i++)
            printf(i ? " %d" : "%d", a[i]);
        printf("\\n");
    }
    return 0;
}
`,
  [
    {
      name: "子任務 1：互不相同",
      inputs: [
        batch([eight([5, 3, 8, 1, 9, 2, 7, 4]), eight([8, 7, 6, 5, 4, 3, 2, 1]), ...repeat(398, () => distinctEight(1, 100))]),
        batch(repeat(700, () => distinctEight(1, 100))),
        batch(repeat(1000, () => distinctEight(1, 100))),
        batch(repeat(500, () => distinctEight(1, 12))),
        batch(repeat(850, () => distinctEight(90, 100))),
      ],
    },
    {
      name: "子任務 2：可能重複",
      inputs: [
        batch([eight([3, 1, 3, 1, 3, 1, 3, 1]), eight([42, 42, 42, 7, 42, 42, 42, 42]), ...repeat(498, () => randomEight(0, 10))]),
        batch(repeat(700, () => randomEight(0, 3))),
        batch(repeat(1000, () => randomEight(0, 100))),
        batch(repeat(600, () => randomEight(0, 1))),
        batch(repeat(900, () => randomEight(0, 20))),
      ],
    },
    {
      name: "子任務 3：負整數",
      inputs: [
        batch([eight([10, -3, 7, 7, 0, 25, -3, 1]), eight([-1, -2, -3, -4, -5, -6, -7, -8]), ...repeat(398, () => randomEight(-1000000, 1000000))]),
        batch(repeat(700, () => randomEight(-10, 10))),
        batch(repeat(1000, () => randomEight(-1000000, 1000000))),
        batch(repeat(600, () => randomEight(-1000000, -1))),
        batch(repeat(900, () => distinctEight(-1000000, 1000000))),
      ],
    },
    {
      name: "子任務 4：綜合",
      inputs: [
        batch([
          eight([2147483647, -2147483647, 0, 2147483646, -2147483646, 1, -1, 2147483647]),
          ...repeat(150, () => eight(values8(-1000, 1000).sort((a, b) => a - b))),
          ...repeat(150, () => eight(values8(-1000, 1000).sort((a, b) => b - a))),
          ...repeat(150, () => eight(Array(8).fill(between(-2147483647, 2147483647)))),
          ...repeat(149, () => randomEight(-2147483647, 2147483647)),
        ]),
        batch(repeat(1000, () => randomEight(-2147483647, 2147483647))),
        batch(repeat(800, () => {
          // Sorted except for one adjacent swap.
          const values = distinct8(-1000000, 1000000).sort((a, b) => a - b);
          const i = random(7);
          [values[i], values[i + 1]] = [values[i + 1], values[i]];
          return eight(values);
        })),
        batch(repeat(1000, () => randomEight(-5, 5))),
        batch(repeat(700, () => randomEight(2000000000, 2147483647))),
      ],
    },
  ],
);

// 2. Anagram check for two words, letters compared case-insensitively.
const letters = "abcdefghijklmnopqrstuvwxyz";
const word = (length, alphabet = letters) =>
  Array.from({ length }, () => alphabet[random(alphabet.length)]).join("");
const pair = (a, b) => `${a}\n${b}\n`;
const scramble = (w) => shuffle([...w]).join("");
const mixCase = (w) => [...w].map((c) => (random(2) ? c.toUpperCase() : c)).join("");
// Same length, one letter changed: the case that a length check alone misses.
const nearMiss = (w) => {
  const chars = [...scramble(w)];
  const i = random(chars.length);
  chars[i] = letters[(letters.indexOf(chars[i].toLowerCase()) + 1 + random(25)) % 26];
  return chars.join("");
};
const anagramStatement = (functions) => `# 變位字

判斷兩個單字是否為變位字（anagram），也就是由相同的字母以不同順序組成。每筆測資包含多組單字，請逐組判斷。${functions}

## 輸入格式

第一行一個整數 $T$，表示有 $T$ 組單字（$1 \\le T \\le 500$）。接下來 $2T$ 行，每組兩行，每行一個單字。單字只包含英文字母，長度介於 $1$ 與 $100$ 之間。比較時不分大小寫（\`A\` 與 \`a\` 視為相同字母）。

## 輸出格式

每組單字輸出一行。若兩個單字是變位字，輸出：

\`\`\`
The words are anagrams.
\`\`\`

否則輸出：

\`\`\`
The words are not anagrams.
\`\`\`

完全相同的兩個單字也算變位字。不需要輸出輸入提示文字。

## 子任務

| 子任務 | 限制 |
| --- | --- |
| 1 | 只有小寫字母，兩個單字長度相同 |
| 2 | 只有小寫字母，兩個單字長度可能不同 |
| 3 | 大小寫混合 |
| 4 | 綜合：大小寫混合，長度可達 $100$，可能有大量重複字母 |

每個子任務的測資全部正確才得到該子任務的分數，四個子任務等分。
`;
const anagramSolution = `#include <ctype.h>
#include <stdio.h>
#include <stdbool.h>

void read_word(int counts[26]) {
    int ch;
    while ((ch = getchar()) != EOF && isspace(ch)) {}
    while (ch != EOF && !isspace(ch)) {
        if (isalpha(ch)) counts[tolower(ch) - 'a']++;
        ch = getchar();
    }
}

bool equal_array(int counts1[26], int counts2[26]) {
    for (int i = 0; i < 26; i++)
        if (counts1[i] != counts2[i]) return false;
    return true;
}

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0) {
        int first[26] = {0}, second[26] = {0};
        read_word(first);
        read_word(second);
        printf(equal_array(first, second) ? "The words are anagrams.\\n" : "The words are not anagrams.\\n");
    }
    return 0;
}
`;
function anagramGroups() {
  const yes = (w) => pair(w, scramble(w));
  const no = (w) => pair(w, nearMiss(w));
  // Half anagrams, half same-length near misses, so guessing one answer fails.
  const lowerPairs = (count, length, alphabet) =>
    repeat(count, () => {
      const w = word(between(...length), alphabet);
      return random(2) ? yes(w) : no(w);
    });
  const mixedPairs = (count, length, alphabet) =>
    repeat(count, () => {
      const w = word(between(...length), alphabet);
      const other = random(2) ? scramble(w) : nearMiss(w);
      return pair(mixCase(w), mixCase(other));
    });
  const unequalPairs = (count, length) =>
    repeat(count, () => {
      const w = word(between(...length));
      // A scrambled copy with letters added or removed.
      const other = random(2) ? scramble(w) + word(between(1, 3)) : scramble(w).slice(0, -1) || "z";
      return random(3) ? pair(w, other) : yes(w);
    });
  return [
    {
      name: "子任務 1：小寫、長度相同",
      inputs: [
        batch([pair("smartest", "mattress"), pair("listen", "silent"), pair("abc", "abd"), pair("aab", "abb"), pair("a", "a"), ...lowerPairs(295, [1, 20])]),
        batch(lowerPairs(400, [5, 30])),
        batch(lowerPairs(500, [1, 8], "abc")),
        batch(lowerPairs(450, [10, 50])),
        batch(lowerPairs(500, [2, 15], "ab")),
      ],
    },
    {
      name: "子任務 2：長度可能不同",
      inputs: [
        batch([pair("dumbest", "stumble"), pair("abc", "abcc"), pair("aabb", "ab"), pair("a", "ab"), ...unequalPairs(296, [2, 20])]),
        batch(unequalPairs(400, [5, 40])),
        batch([...unequalPairs(250, [1, 30]), ...lowerPairs(250, [1, 30])]),
        batch(unequalPairs(500, [2, 10])),
        batch([...unequalPairs(200, [20, 60]), ...lowerPairs(200, [20, 60], "abcd")]),
      ],
    },
    {
      name: "子任務 3：大小寫混合",
      inputs: [
        batch([pair("Listen", "Silent"), pair("Dormitory", "DirtyRoom"), pair("ABC", "cba"), pair("Apple", "Paple"), pair("Hello", "World"), ...mixedPairs(295, [1, 20])]),
        batch(mixedPairs(400, [5, 30])),
        batch(mixedPairs(500, [1, 10], "ab")),
        batch(repeat(450, () => {
          const w = word(between(3, 25));
          return random(2) ? pair(w.toUpperCase(), scramble(w)) : pair(w, nearMiss(w).toUpperCase());
        })),
        batch(mixedPairs(500, [10, 40], "abcxyz")),
      ],
    },
    {
      name: "子任務 4：綜合",
      inputs: [
        batch([pair("a".repeat(100), "a".repeat(100)), pair("a".repeat(100), "a".repeat(99) + "b"), pair("ab".repeat(50), "ba".repeat(50)), ...mixedPairs(297, [50, 100])]),
        batch(mixedPairs(500, [90, 100], "ab")),
        batch([...mixedPairs(200, [1, 100]), ...unequalPairs(150, [50, 97]), ...lowerPairs(150, [80, 100], "xyz")]),
        batch(mixedPairs(500, [1, 100])),
        batch(mixedPairs(450, [100, 100])),
      ],
    },
  ];
}
const anagramMeta = (order) => ({
  title: "變位字",
  order,
  sampleCases: [
    {
      input: "2\nsmartest\nmattress\ndumbest\nstumble\n",
      output: "The words are anagrams.\nThe words are not anagrams.\n",
    },
  ],
});

const anagramTests = problem(
  "anagram",
  anagramMeta(1),
  anagramStatement(""),
  anagramSolution,
  anagramGroups(),
);

console.log(JSON.stringify({ bubble: sortTests, anagram: anagramTests }));
