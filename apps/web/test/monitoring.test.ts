import { expect, it } from "vitest";
import type { MonitoredSubmission } from "@myriad/shared";
import {
  paretoFrontier,
  selectedSubmission,
} from "../src/lib/teacher/monitoring";
function row(
  id: string,
  x: number | null,
  y: number | null,
  extra: Partial<MonitoredSubmission> = {},
): MonitoredSubmission {
  return {
    id,
    sequence: Number(id) || 1,
    participantId: "p",
    studentId: "s",
    identityKind: "guest",
    problemId: "p",
    problemVersion: "v",
    status: "complete",
    createdAt: 1,
    score: 1,
    passed: true,
    testsReported: 2,
    codeBytes: 100,
    instructionCost: x,
    memoryBytes: y,
    costProfile: "p",
    costModel: "m",
    ...extra,
  };
}
it("retains equal frontier points, handles zero, and excludes strict dominance and incomplete/failed runs", () => {
  const rows = [
    row("a", 0, 10),
    row("b", 0, 10),
    row("c", 0, 11),
    row("d", 5, 5),
    row("e", 10, 0),
    row("f", 6, 6),
    row("g", null, 0),
    row("h", 0, 0, { passed: false }),
    row("i", 0, 0, { status: "running" }),
  ];
  expect([...paretoFrontier(rows, "instructionCost", "memoryBytes")]).toEqual([
    "a",
    "b",
    "d",
    "e",
  ]);
  expect([...paretoFrontier(rows, "memoryBytes", "instructionCost")]).toEqual([
    "e",
    "d",
    "a",
    "b",
  ]);
});
it("best and last select completed work with deterministic sequence ties", () => {
  const rows = [
    row("1", 1, 1),
    row("2", 1, 1),
    row("3", 1, 1, { score: 0.5, passed: false }),
    row("4", 0, 0, { status: "running" }),
  ];
  expect(selectedSubmission(rows, "best")?.id).toBe("2");
  expect(selectedSubmission(rows, "last")?.id).toBe("3");
  expect(selectedSubmission([], "last")).toBeUndefined();
});
