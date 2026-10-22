import { describe, it, expect } from "vitest";
import { computeGroupVerdicts, selectBestSubmission } from "../src/scoring.js";
import type { TestGroup, TestVerdict } from "../src/schema.js";

describe("computeGroupVerdicts", () => {
  const groups: TestGroup[] = [
    { name: "subtask-1-small", tests: [0, 1] },
    { name: "subtask-2-large", tests: [2, 3, 4] },
  ];

  it("passes group only when all tests in that group are AC", () => {
    const verdicts: TestVerdict[] = [
      { index: 0, status: "AC" },
      { index: 1, status: "AC" },
      { index: 2, status: "AC" },
      { index: 3, status: "WA" },
      { index: 4, status: "AC" },
    ];

    const result = computeGroupVerdicts(groups, verdicts);
    expect(result.groupsPassed).toBe(1);
    expect(result.groupsTotal).toBe(2);
    expect(result.score).toBe(0.5);
    expect(result.groups[0].passed).toBe(true);
    expect(result.groups[1].passed).toBe(false);
  });

  it("gives full score when all groups pass", () => {
    const verdicts: TestVerdict[] = [
      { index: 0, status: "AC" },
      { index: 1, status: "AC" },
      { index: 2, status: "AC" },
      { index: 3, status: "AC" },
      { index: 4, status: "AC" },
    ];

    const result = computeGroupVerdicts(groups, verdicts);
    expect(result.groupsPassed).toBe(2);
    expect(result.groupsTotal).toBe(2);
    expect(result.score).toBe(1.0);
  });
});

describe("selectBestSubmission", () => {
  it("selects submission with highest groupsPassed, breaking ties with earlier submission", () => {
    const subs = [
      {
        id: "sub-1",
        problemId: "p1",
        studentId: "s1",
        groupsPassed: 1,
        groupsTotal: 3,
        createdAt: 100,
      },
      {
        id: "sub-2",
        problemId: "p1",
        studentId: "s1",
        groupsPassed: 3,
        groupsTotal: 3,
        createdAt: 200,
      },
      {
        id: "sub-3",
        problemId: "p1",
        studentId: "s1",
        groupsPassed: 3,
        groupsTotal: 3,
        createdAt: 300,
      },
      {
        id: "sub-4",
        problemId: "p1",
        studentId: "s1",
        groupsPassed: 2,
        groupsTotal: 3,
        createdAt: 400,
      },
    ];

    const best = selectBestSubmission(subs);
    expect(best?.id).toBe("sub-2");
  });
});
