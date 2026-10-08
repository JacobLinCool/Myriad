// Generates the ICP Homework 4 (Week 3) problems: statements, reference
// solutions, subtasks and tests. Deterministic; rerun after editing, then
// `myriad build`. Usage: node scripts/generate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let seed = 20261013;
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
  outputLimitBytes: 1048576,
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

// 1. Parking lot: menu options as plain input, no menu or prompts printed.
// Commands are [option] or [option, carId]; a test never parks a car ID that
// is already parked, which the handout leaves undefined.
const program = (commands) => commands.map((c) => `${c.join(" ")}\n`).join("") + "0\n";
function randomCommandsRaw(
  count,
  { leave = 30, status = 5, invalid = 0, missing = 0, full = false, ids = [1, 99999] } = {},
  parked = new Set(),
) {
  const out = [];
  const fresh = () => {
    let id;
    do id = between(...ids);
    while (parked.has(id));
    return id;
  };
  const depart = () => {
    const id = pick([...parked]);
    parked.delete(id);
    return [2, id];
  };
  while (out.length < count) {
    const roll = random(100);
    if (roll < invalid) out.push([pick([4, 5, 9, -1, 10, 99, 123])]);
    else if (roll < invalid + status) out.push([3]);
    else if (roll < invalid + status + leave && (parked.size || missing)) {
      if (parked.size && random(100) >= missing) out.push(depart());
      else out.push([2, fresh()]);
    } else if (parked.size === 10 && !full) out.push(depart());
    else {
      const id = fresh();
      if (parked.size < 10) parked.add(id);
      out.push([1, id]);
    }
  }
  return out;
}
const randomCommands = (count, options) => program([...randomCommandsRaw(count, options), [3]]);
// Hand-picked commands first, then random ones that continue from the cars
// the prefix left parked.
function withPrefix(prefix, count, options) {
  const parked = new Set();
  for (const [option, id] of prefix) {
    if (option === 1 && parked.size < 10) parked.add(id);
    if (option === 2) parked.delete(id);
  }
  return program([...prefix, ...randomCommandsRaw(count, options, parked), [3]]);
}
const pick = (items) => items[random(items.length)];
const fill = (ids) => ids.map((id) => [1, id]);
const parkingTests = problem(
  "parking",
  {
    title: "停車場管理系統",
    order: 0,
    sampleCases: [
      {
        input: "1 2357\n1 8812\n5\n2 2357\n2 2357\n3\n0\n",
        output: `Car 2357 parked at space 1.
Ticket number: 101
Car 8812 parked at space 2.
Ticket number: 102
Invalid option ID. Please try again.
Car 2357 left space 1.
Parking fee: $60
Sorry, car ID 2357 was not found.
=== Parking Status ===
Space 1: Empty
Space 2: Car 8812
Space 3: Empty
Space 4: Empty
Space 5: Empty
Space 6: Empty
Space 7: Empty
Space 8: Empty
Space 9: Empty
Space 10: Empty

Available spaces: 9
Cars entered today: 2
Cars left today: 1
Total revenue: $60
======================
`,
      },
    ],
  },
  `# 停車場管理系統

實作一個簡單的停車場管理系統。停車場有 $10$ 個車位（編號 $1$ 到 $10$），每個車位停一輛車，車輛以整數 Car ID 識別。

原作業的選單與輸入提示在這裡省略：程式重複讀入選項編號，依選項執行對應操作，讀到 \`0\` 時結束。原作業要求的全域變數與區域變數兩個版本，這裡只需要繳交其中一種寫法，但仍建議把工作拆成函式（例如 \`park_car\`、\`remove_car\`、\`print_status\`、\`find_empty_space\`、\`find_car\`、\`next_ticket_number\`）。

| 選項 | 操作 |
| --- | --- |
| \`1\` | 車輛進場，後面接著讀入 Car ID |
| \`2\` | 車輛離場，後面接著讀入 Car ID |
| \`3\` | 顯示停車狀態 |
| \`0\` | 結束程式，不輸出任何內容 |

## 車輛進場（選項 1）

把車停到編號最小的空車位，並輸出：

\`\`\`
Car <id> parked at space <s>.
Ticket number: <t>
\`\`\`

停車券號碼從 $101$ 開始，每成功停入一輛車加 $1$。若所有車位都有車，只輸出 \`Sorry, the parking lot is full.\`，不發停車券、也不計入進場數。

## 車輛離場（選項 2）

找到這輛車並清空它的車位。每輛車離場時固定收費 $60$ 元：

\`\`\`
Car <id> left space <s>.
Parking fee: $60
\`\`\`

若找不到這個 Car ID，輸出 \`Sorry, car ID <id> was not found.\`。

## 顯示停車狀態（選項 3）

\`\`\`
=== Parking Status ===
Space 1: Empty
Space 2: Car 8812
...
Space 10: Empty

Available spaces: 9
Cars entered today: 2
Cars left today: 1
Total revenue: $60
======================
\`\`\`

依序列出 $10$ 個車位（空車位輸出 \`Empty\`，有車輸出 \`Car <id>\`），接著一個空行，再輸出剩餘車位數、今日進場數、今日離場數與總收入。

## 不合法的選項

選項不是 \`0\`、\`1\`、\`2\`、\`3\` 時，輸出 \`Invalid option ID. Please try again.\`，然後繼續讀下一個選項。

## 輸入格式

若干行，每行一個指令：選項 \`1\`、\`2\` 後面接一個空白與 Car ID，其他選項只有一個整數。最後一行是 \`0\`。

Car ID 為 $1$ 到 $99999$ 的整數。保證不會讓已經在停車場裡的 Car ID 再次進場（停車場已滿時也一樣）。每筆測資的指令數介於 $400$ 與 $2001$ 之間。

## 子任務

| 子任務 | 限制 |
| --- | --- |
| 1 | 停車場不會停滿，離場的車一定在停車場裡，沒有不合法的選項 |
| 2 | 停車場不會停滿，可能離場找不到的 Car ID，沒有不合法的選項 |
| 3 | 停車場可能停滿，沒有不合法的選項 |
| 4 | 綜合：可能出現不合法的選項 |

每個子任務的測資全部正確才得到該子任務的分數，四個子任務等分。
`,
  `#include <stdio.h>

#define SPACES 10
#define FEE 60

int spaces[SPACES];
int entered, left, revenue;

int next_ticket_number(void) {
    static int ticket = 101;
    return ticket++;
}

int find_empty_space(void) {
    for (int i = 0; i < SPACES; i++)
        if (spaces[i] == 0) return i;
    return -1;
}

int find_car(int car_id) {
    for (int i = 0; i < SPACES; i++)
        if (spaces[i] == car_id) return i;
    return -1;
}

void park_car(int car_id) {
    int space = find_empty_space();
    if (space < 0) {
        printf("Sorry, the parking lot is full.\\n");
        return;
    }
    spaces[space] = car_id;
    entered++;
    printf("Car %d parked at space %d.\\n", car_id, space + 1);
    printf("Ticket number: %d\\n", next_ticket_number());
}

void remove_car(int car_id) {
    int space = find_car(car_id);
    if (space < 0) {
        printf("Sorry, car ID %d was not found.\\n", car_id);
        return;
    }
    spaces[space] = 0;
    left++;
    revenue += FEE;
    printf("Car %d left space %d.\\n", car_id, space + 1);
    printf("Parking fee: $%d\\n", FEE);
}

void print_status(void) {
    int available = 0;
    printf("=== Parking Status ===\\n");
    for (int i = 0; i < SPACES; i++) {
        if (spaces[i] == 0) {
            printf("Space %d: Empty\\n", i + 1);
            available++;
        } else {
            printf("Space %d: Car %d\\n", i + 1, spaces[i]);
        }
    }
    printf("\\nAvailable spaces: %d\\n", available);
    printf("Cars entered today: %d\\n", entered);
    printf("Cars left today: %d\\n", left);
    printf("Total revenue: $%d\\n", revenue);
    printf("======================\\n");
}

int main(void) {
    int option, car_id;
    while (scanf("%d", &option) == 1 && option != 0) {
        if (option == 1 && scanf("%d", &car_id) == 1) park_car(car_id);
        else if (option == 2 && scanf("%d", &car_id) == 1) remove_car(car_id);
        else if (option == 3) print_status();
        else printf("Invalid option ID. Please try again.\\n");
    }
    return 0;
}
`,
  [
    {
      name: "子任務 1：一般進出場",
      inputs: [
        withPrefix([...fill([2357, 8812, 1001]), [3], [2, 8812], [1, 1], [1, 99999], [3]], 400),
        randomCommands(600),
        randomCommands(1000, { leave: 45, status: 10 }),
        randomCommands(500, { leave: 20, ids: [1, 20] }),
        randomCommands(800, { leave: 40, status: 2 }),
      ],
    },
    {
      name: "子任務 2：找不到的車",
      inputs: [
        withPrefix([[2, 1234], [1, 500], [2, 500], [2, 500], [1, 500], [3]], 500, { missing: 20 }),
        randomCommands(700, { leave: 40, missing: 20 }),
        randomCommands(1000, { leave: 50, missing: 40, ids: [1, 50] }),
        randomCommands(500, { leave: 35, missing: 10, status: 10 }),
        randomCommands(900, { leave: 45, missing: 30 }),
      ],
    },
    {
      name: "子任務 3：停車場停滿",
      inputs: [
        withPrefix([...fill([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), [1, 11], [2, 4], [1, 11], [1, 12], [3]], 500, { leave: 15, full: true }),
        randomCommands(700, { leave: 10, full: true }),
        randomCommands(1000, { leave: 30, missing: 10, full: true }),
        randomCommands(600, { leave: 5, status: 10, full: true, ids: [1, 99999] }),
        randomCommands(900, { leave: 20, missing: 20, full: true }),
      ],
    },
    {
      name: "子任務 4：綜合",
      inputs: [
        withPrefix([[5], [4], [-1], [1, 2357], [3]], 1500, { leave: 30, invalid: 10, missing: 10, full: true }),
        randomCommands(2000, { leave: 35, invalid: 5, missing: 10, full: true }),
        randomCommands(2000, { leave: 20, invalid: 2, full: true }),
        randomCommands(1500, { leave: 48, invalid: 5, missing: 5, full: true, ids: [1, 30] }),
        randomCommands(1800, { leave: 25, status: 10, invalid: 20, missing: 15, full: true }),
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
  anagramStatement(`

延續上週的作業，這次請用函式寫得更模組化，實作下面兩個函式：

\`\`\`c
void read_word(int counts[26]);
bool equal_array(int counts1[26], int counts2[26]);
\`\`\`

\`main\` 呼叫 \`read_word\` 兩次，每次讀入一個單字並用其中的字母更新 \`counts\` 陣列；接著把兩個陣列傳給 \`equal_array\`，兩個陣列完全相同時回傳 \`true\`（是變位字），否則回傳 \`false\`。`),
  anagramSolution,
  anagramGroups(),
);

console.log(JSON.stringify({ parking: parkingTests, anagram: anagramTests }));
