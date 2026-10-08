import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve("examples/demo-exam/problems");

// Deterministic LCG pseudo-random generator
function createRng(seed = 123456789) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// -------------------------------------------------------------
// Problem 1: aplusb (A + B Problem)
// -------------------------------------------------------------
async function genAPlusB() {
  const pDir = path.join(root, "aplusb");
  const testsDir = path.join(pDir, "tests");
  await ensureDir(testsDir);

  const statement = `# A + B Problem

## Description
Given two integers $A$ and $B$, compute their sum: $A + B$.

## Input
A single line containing two space-separated integers $A$ and $B$.

## Output
Output a single integer representing $A + B$.

## Constraints
- **Subtask 1 (20%):** $0 \\le A, B \\le 10$
- **Subtask 2 (20%):** $0 \\le A, B \\le 1,000$
- **Subtask 3 (20%):** $-10^5 \\le A, B \\le 10^5$
- **Subtask 4 (20%):** $-10^9 \\le A, B \\le 10^9$
- **Subtask 5 (20%):** $-10^{18} \\le A, B \\le 10^{18}$
`;

  const solution = `#include <stdio.h>

int main(void) {
    long long a, b;
    if (scanf("%lld %lld", &a, &b) == 2) {
        printf("%lld\\n", a + b);
    }
    return 0;
}
`;

  const tests = [
    // Subtask 1: 0..10
    "1 2\n", "0 0\n", "10 5\n", "7 8\n", "10 10\n",
    // Subtask 2: 0..1000
    "123 456\n", "999 1\n", "500 500\n", "42 987\n", "1000 1000\n",
    // Subtask 3: -10^5 .. 10^5
    "-50 50\n", "-12345 67890\n", "-99999 -1\n", "45678 -1234\n", "-100000 100000\n",
    // Subtask 4: -10^9 .. 10^9
    "1000000000 1000000000\n", "-1000000000 1000000000\n", "987654321 -123456789\n", "-500000000 -500000000\n", "123456789 987654321\n",
    // Subtask 5: -10^18 .. 10^18
    "1000000000000000000 1000000000000000000\n",
    "-1000000000000000000 1000000000000000000\n",
    "-500000000000000000 -500000000000000000\n",
    "123456789012345678 876543210987654321\n",
    "-999999999999999999 1\n",
  ];

  for (let i = 0; i < tests.length; i++) {
    const filename = `${String(i + 1).padStart(2, "0")}.in`;
    await fs.writeFile(path.join(testsDir, filename), tests[i], "utf8");
  }

  const problemJson = {
    title: "A + B Problem",
    order: 0,
    limits: {
      instructionBudget: 50000000,
      logicalTimeLimitMs: 2000,
      memoryMb: 128,
      outputLimitBytes: 10485760,
    },
    normalize: "trim",
    groups: [
      { name: "Subtask 1: Small numbers (0 to 10)", tests: ["01.in", "02.in", "03.in", "04.in", "05.in"] },
      { name: "Subtask 2: Numbers up to 1,000", tests: ["06.in", "07.in", "08.in", "09.in", "10.in"] },
      { name: "Subtask 3: Negative numbers (-10^5 to 10^5)", tests: ["11.in", "12.in", "13.in", "14.in", "15.in"] },
      { name: "Subtask 4: Large 32-bit range (up to 10^9)", tests: ["16.in", "17.in", "18.in", "19.in", "20.in"] },
      { name: "Subtask 5: 64-bit full range (up to 10^18)", tests: ["21.in", "22.in", "23.in", "24.in", "25.in"] },
    ],
    sampleCases: [
      { input: "1 2\n", output: "3\n", explanation: "1 + 2 = 3" },
      { input: "-50 50\n", output: "0\n", explanation: "-50 + 50 = 0" },
    ],
  };

  await fs.writeFile(path.join(pDir, "statement.md"), statement, "utf8");
  await fs.writeFile(path.join(pDir, "solution.c"), solution, "utf8");
  await fs.writeFile(path.join(pDir, "problem.json"), JSON.stringify(problemJson, null, 2), "utf8");
  console.log("✓ Generated Problem 1: aplusb (5 subtasks, 25 tests)");
}

// -------------------------------------------------------------
// Problem 2: prefix_sum (Prefix Sum Queries)
// -------------------------------------------------------------
async function genPrefixSum() {
  const pDir = path.join(root, "prefix_sum");
  const testsDir = path.join(pDir, "tests");
  await ensureDir(testsDir);

  const statement = `# Prefix Sum Queries

## Description
Given an array of $N$ integers $A_1, A_2, \\dots, A_N$ and $Q$ range sum queries, for each query $(L, R)$, calculate:
$$ \\sum_{i=L}^{R} A_i $$

## Input
The first line contains two integers $N$ and $Q$.
The second line contains $N$ space-separated integers $A_1, A_2, \\dots, A_N$.
The next $Q$ lines each contain two 1-indexed integers $L$ and $R$ ($1 \\le L \\le R \\le N$).

## Output
For each query, output the range sum on a new line.

## Constraints
- **Subtask 1 (20%):** $N, Q \\le 10$, $0 \\le A_i \\le 100$
- **Subtask 2 (20%):** $N, Q \\le 100$, $-1,000 \\le A_i \\le 1,000$
- **Subtask 3 (20%):** $N, Q \\le 1,000$, all $A_i \\ge 0$
- **Subtask 4 (20%):** $N, Q \\le 5,000$, $-10^9 \\le A_i \\le 10^9$
- **Subtask 5 (20%):** $N, Q \\le 10,000$, full 64-bit sum
`;

  const solution = `#include <stdio.h>

static long long pref[100005];

int main(void) {
    int n, q;
    if (scanf("%d %d", &n, &q) != 2) return 0;
    pref[0] = 0;
    for (int i = 1; i <= n; i++) {
        long long val;
        scanf("%lld", &val);
        pref[i] = pref[i - 1] + val;
    }
    for (int j = 0; j < q; j++) {
        int l, r;
        scanf("%d %d", &l, &r);
        printf("%lld\\n", pref[r] - pref[l - 1]);
    }
    return 0;
}
`;

  const rng = createRng(42);
  const tests = [];

  // Helper to generate a testcase
  function makeTest(n, q, minVal, maxVal) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const v = Math.floor(rng() * (maxVal - minVal + 1)) + minVal;
      arr.push(v);
    }
    const queries = [];
    for (let i = 0; i < q; i++) {
      let l = Math.floor(rng() * n) + 1;
      let r = Math.floor(rng() * n) + 1;
      if (l > r) [l, r] = [r, l];
      queries.push(`${l} ${r}`);
    }
    return `${n} ${q}\n${arr.join(" ")}\n${queries.join("\n")}\n`;
  }

  // Subtask 1: N, Q <= 10
  tests.push("5 3\n1 2 3 4 5\n1 3\n2 5\n1 5\n");
  for (let i = 0; i < 4; i++) tests.push(makeTest(8, 6, 0, 100));

  // Subtask 2: N, Q <= 100
  for (let i = 0; i < 5; i++) tests.push(makeTest(50, 40, -1000, 1000));

  // Subtask 3: N, Q <= 1000 (A_i >= 0)
  for (let i = 0; i < 5; i++) tests.push(makeTest(500, 300, 0, 1000000));

  // Subtask 4: N, Q <= 5000 (-10^9 to 10^9)
  for (let i = 0; i < 5; i++) tests.push(makeTest(2000, 1000, -1000000000, 1000000000));

  // Subtask 5: N, Q <= 10000
  for (let i = 0; i < 5; i++) tests.push(makeTest(5000, 2500, -1000000000, 1000000000));

  for (let i = 0; i < tests.length; i++) {
    const filename = `${String(i + 1).padStart(2, "0")}.in`;
    await fs.writeFile(path.join(testsDir, filename), tests[i], "utf8");
  }

  const problemJson = {
    title: "Prefix Sum Queries",
    order: 1,
    limits: {
      instructionBudget: 50000000,
      logicalTimeLimitMs: 2000,
      memoryMb: 128,
      outputLimitBytes: 10485760,
    },
    normalize: "trim",
    groups: [
      { name: "Subtask 1: Small queries (N, Q <= 10)", tests: ["01.in", "02.in", "03.in", "04.in", "05.in"] },
      { name: "Subtask 2: Numbers up to 100 (N, Q <= 100)", tests: ["06.in", "07.in", "08.in", "09.in", "10.in"] },
      { name: "Subtask 3: Non-negative array (N, Q <= 1,000)", tests: ["11.in", "12.in", "13.in", "14.in", "15.in"] },
      { name: "Subtask 4: Large numbers (N, Q <= 5,000)", tests: ["16.in", "17.in", "18.in", "19.in", "20.in"] },
      { name: "Subtask 5: Full scale queries (N, Q <= 10,000)", tests: ["21.in", "22.in", "23.in", "24.in", "25.in"] },
    ],
    sampleCases: [
      {
        input: "5 3\n1 2 3 4 5\n1 3\n2 5\n1 5\n",
        output: "6\n14\n15\n",
        explanation: "Sum from index 1 to 3 is 1 + 2 + 3 = 6.",
      },
    ],
  };

  await fs.writeFile(path.join(pDir, "statement.md"), statement, "utf8");
  await fs.writeFile(path.join(pDir, "solution.c"), solution, "utf8");
  await fs.writeFile(path.join(pDir, "problem.json"), JSON.stringify(problemJson, null, 2), "utf8");
  console.log("✓ Generated Problem 2: prefix_sum (5 subtasks, 25 tests)");
}

// -------------------------------------------------------------
// Problem 3: max_subarray (Maximum Subarray Sum)
// -------------------------------------------------------------
async function genMaxSubarray() {
  const pDir = path.join(root, "max_subarray");
  const testsDir = path.join(pDir, "tests");
  await ensureDir(testsDir);

  const statement = `# Maximum Subarray Sum

## Description
Given an array of $N$ integers $A_1, A_2, \\dots, A_N$, find the contiguous non-empty subarray which has the largest sum:
$$ \\max_{1 \\le i \\le j \\le N} \\sum_{k=i}^{j} A_k $$

## Input
The first line contains a single integer $N$ ($1 \\le N \\le 100,000$).
The second line contains $N$ space-separated integers $A_1, A_2, \\dots, A_N$ ($-10^9 \\le A_i \\le 10^9$).

## Output
Output a single integer representing the maximum contiguous subarray sum.

## Constraints
- **Subtask 1 (20%):** $N \\le 20$, all $A_i \\ge 0$
- **Subtask 2 (20%):** $N \\le 50$, with negative values
- **Subtask 3 (20%):** $N \\le 1,000$, $-10^4 \\le A_i \\le 10^4$
- **Subtask 4 (20%):** $N \\le 10,000$, all negative numbers
- **Subtask 5 (20%):** $N \\le 50,000$, full 64-bit range
`;

  const solution = `#include <stdio.h>

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    long long max_so_far = -1000000000000000000LL;
    long long curr_max = -1000000000000000000LL;
    for (int i = 0; i < n; i++) {
        long long val;
        scanf("%lld", &val);
        if (i == 0) {
            curr_max = val;
            max_so_far = val;
        } else {
            curr_max = (val > curr_max + val) ? val : (curr_max + val);
            if (curr_max > max_so_far) {
                max_so_far = curr_max;
            }
        }
    }
    printf("%lld\\n", max_so_far);
    return 0;
}
`;

  const rng = createRng(99);
  const tests = [];

  function makeArray(n, minVal, maxVal) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push(Math.floor(rng() * (maxVal - minVal + 1)) + minVal);
    }
    return `${n}\n${arr.join(" ")}\n`;
  }

  // Subtask 1: N <= 20, all >= 0
  tests.push("8\n-2 1 -3 4 -1 2 1 -5 4\n");
  for (let i = 0; i < 4; i++) tests.push(makeArray(15, 1, 100));

  // Subtask 2: N <= 50, mixed
  for (let i = 0; i < 5; i++) tests.push(makeArray(40, -100, 100));

  // Subtask 3: N <= 1000
  for (let i = 0; i < 5; i++) tests.push(makeArray(800, -10000, 10000));

  // Subtask 4: All negative numbers
  for (let i = 0; i < 5; i++) tests.push(makeArray(3000, -1000000, -1));

  // Subtask 5: N <= 50,000, large range
  for (let i = 0; i < 5; i++) tests.push(makeArray(10000, -1000000000, 1000000000));

  for (let i = 0; i < tests.length; i++) {
    const filename = `${String(i + 1).padStart(2, "0")}.in`;
    await fs.writeFile(path.join(testsDir, filename), tests[i], "utf8");
  }

  const problemJson = {
    title: "Maximum Subarray Sum",
    order: 2,
    limits: {
      instructionBudget: 50000000,
      logicalTimeLimitMs: 2000,
      memoryMb: 128,
      outputLimitBytes: 10485760,
    },
    normalize: "trim",
    groups: [
      { name: "Subtask 1: Non-negative values (N <= 20)", tests: ["01.in", "02.in", "03.in", "04.in", "05.in"] },
      { name: "Subtask 2: Small mixed arrays (N <= 50)", tests: ["06.in", "07.in", "08.in", "09.in", "10.in"] },
      { name: "Subtask 3: Moderate sized (N <= 1,000)", tests: ["11.in", "12.in", "13.in", "14.in", "15.in"] },
      { name: "Subtask 4: All negative numbers (N <= 10,000)", tests: ["16.in", "17.in", "18.in", "19.in", "20.in"] },
      { name: "Subtask 5: Full scale arrays (N <= 50,000)", tests: ["21.in", "22.in", "23.in", "24.in", "25.in"] },
    ],
    sampleCases: [
      {
        input: "8\n-2 1 -3 4 -1 2 1 -5 4\n",
        output: "6\n",
        explanation: "The contiguous subarray [4, -1, 2, 1] has the largest sum = 6.",
      },
      {
        input: "5\n-1 -2 -3 -4 -5\n",
        output: "-1\n",
        explanation: "Single element [-1] has maximum sum -1.",
      },
    ],
  };

  await fs.writeFile(path.join(pDir, "statement.md"), statement, "utf8");
  await fs.writeFile(path.join(pDir, "solution.c"), solution, "utf8");
  await fs.writeFile(path.join(pDir, "problem.json"), JSON.stringify(problemJson, null, 2), "utf8");
  console.log("✓ Generated Problem 3: max_subarray (5 subtasks, 25 tests)");
}

// -------------------------------------------------------------
// Problem 4: parentheses (Bracket Matching)
// -------------------------------------------------------------
async function genParentheses() {
  const pDir = path.join(root, "parentheses");
  const testsDir = path.join(pDir, "tests");
  await ensureDir(testsDir);

  const statement = `# Valid Parentheses

## Description
Given a bracket sequence containing characters \`(\`, \`)\`, \`[\`, \`]\`, \`{\`, and \`}\`, determine if the input string is valid.

A bracket string is valid if:
1. Open brackets are closed by the same type of brackets.
2. Open brackets are closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.

## Input
A single line containing the string $S$ ($1 \\le |S| \\le 100,000$).

## Output
Output \`YES\` if the sequence is valid, or \`NO\` otherwise.

## Constraints
- **Subtask 1 (20%):** Only \`(\` and \`)\`, length $\\le 10$
- **Subtask 2 (20%):** Only \`(\` and \`)\`, length $\\le 1,000$
- **Subtask 3 (20%):** All bracket types, length $\\le 50$
- **Subtask 4 (20%):** All bracket types, length $\\le 2,000$
- **Subtask 5 (20%):** Deep nesting & length up to $50,000$
`;

  const solution = `#include <stdio.h>
#include <string.h>

static char stack[100005];

int main(void) {
    static char s[100005];
    if (scanf("%100004s", s) != 1) {
        printf("YES\\n");
        return 0;
    }
    int top = 0;
    int len = strlen(s);
    for (int i = 0; i < len; i++) {
        char c = s[i];
        if (c == '(' || c == '[' || c == '{') {
            stack[top++] = c;
        } else {
            if (top == 0) {
                printf("NO\\n");
                return 0;
            }
            char open = stack[--top];
            if ((c == ')' && open != '(') ||
                (c == ']' && open != '[') ||
                (c == '}' && open != '{')) {
                printf("NO\\n");
                return 0;
            }
        }
    }
    if (top == 0) {
        printf("YES\\n");
    } else {
        printf("NO\\n");
    }
    return 0;
}
`;

  const rng = createRng(777);
  const tests = [];

  function makeBracketString(len, types = ["()", "[]", "{}"]) {
    // Generate valid or invalid bracket sequences
    const pairs = types.map((t) => [t[0], t[1]]);
    const isBalanced = rng() > 0.4;
    if (isBalanced) {
      // Build a balanced sequence
      let s = "";
      while (s.length < len) {
        const p = pairs[Math.floor(rng() * pairs.length)];
        s = p[0] + s + p[1];
      }
      return s + "\n";
    } else {
      // Build random brackets
      const chars = types.join("").split("");
      let s = "";
      for (let i = 0; i < len; i++) {
        s += chars[Math.floor(rng() * chars.length)];
      }
      return s + "\n";
    }
  }

  // Subtask 1: Only () len <= 10
  tests.push("(()())\n");
  tests.push("(((\n");
  tests.push("()()\n");
  tests.push(")()(\n");
  tests.push("((()))\n");

  // Subtask 2: Only () len <= 1000
  for (let i = 0; i < 5; i++) tests.push(makeBracketString(200, ["()"]));

  // Subtask 3: All types len <= 50
  tests.push("{[()]}\n");
  tests.push("{[(])}\n");
  tests.push("[{()}]()\n");
  tests.push("((((}}}}\n");
  tests.push("{[()]}{()}[[]]\n");

  // Subtask 4: All types len <= 2000
  for (let i = 0; i < 5; i++) tests.push(makeBracketString(1200));

  // Subtask 5: Deep nesting up to 50000
  for (let i = 0; i < 5; i++) tests.push(makeBracketString(10000));

  for (let i = 0; i < tests.length; i++) {
    const filename = `${String(i + 1).padStart(2, "0")}.in`;
    await fs.writeFile(path.join(testsDir, filename), tests[i], "utf8");
  }

  const problemJson = {
    title: "Valid Parentheses",
    order: 3,
    limits: {
      instructionBudget: 50000000,
      logicalTimeLimitMs: 2000,
      memoryMb: 128,
      outputLimitBytes: 10485760,
    },
    normalize: "trim",
    groups: [
      { name: "Subtask 1: Simple parentheses (length <= 10)", tests: ["01.in", "02.in", "03.in", "04.in", "05.in"] },
      { name: "Subtask 2: Longer parentheses (length <= 1,000)", tests: ["06.in", "07.in", "08.in", "09.in", "10.in"] },
      { name: "Subtask 3: Mixed brackets (length <= 50)", tests: ["11.in", "12.in", "13.in", "14.in", "15.in"] },
      { name: "Subtask 4: Mixed brackets (length <= 2,000)", tests: ["16.in", "17.in", "18.in", "19.in", "20.in"] },
      { name: "Subtask 5: Deep nesting (length <= 50,000)", tests: ["21.in", "22.in", "23.in", "24.in", "25.in"] },
    ],
    sampleCases: [
      { input: "()[]{}\n", output: "YES\n", explanation: "All open brackets close in order." },
      { input: "(]\n", output: "NO\n", explanation: "Square bracket does not match parenthesis." },
      { input: "([)]\n", output: "NO\n", explanation: "Brackets close out of order." },
    ],
  };

  await fs.writeFile(path.join(pDir, "statement.md"), statement, "utf8");
  await fs.writeFile(path.join(pDir, "solution.c"), solution, "utf8");
  await fs.writeFile(path.join(pDir, "problem.json"), JSON.stringify(problemJson, null, 2), "utf8");
  console.log("✓ Generated Problem 4: parentheses (5 subtasks, 25 tests)");
}

async function main() {
  await genAPlusB();
  await genPrefixSum();
  await genMaxSubarray();
  await genParentheses();
  console.log("\n🎉 All 4 problems generated: 5 subtasks each, 25 test cases each (100 test cases total)!");
}

main().catch(console.error);
