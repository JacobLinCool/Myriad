import type { MonitoredSubmission } from "@myriad/shared";
export type Metric = "instructionCost" | "memoryBytes" | "codeBytes";
export const metrics: { value: Metric; label: string }[] = [
  { value: "instructionCost", label: "Instruction cost（測資總和）" },
  { value: "memoryBytes", label: "Memory（尖峰 bytes）" },
  { value: "codeBytes", label: "程式碼（UTF-8 bytes）" },
];
export function statusLabel(
  s: Pick<MonitoredSubmission, "status" | "testsReported" | "passed" | "score">,
) {
  if (s.status === "running") return `執行中 · ${s.testsReported} 筆測資`;
  if (s.status === "expired") return "已逾時";
  if (s.status === "failed") return "已中止";
  return s.passed ? "已通過" : `未全通過 · ${(s.score * 100).toFixed(0)}%`;
}
export function selectedSubmission(
  rows: MonitoredSubmission[],
  policy: "best" | "last",
) {
  return rows
    .filter((s) => s.status === "complete")
    .sort(
      (a, b) =>
        (policy === "best" ? b.score - a.score : 0) || b.sequence - a.sequence,
    )[0];
}
/** Strict dominance, preserving all equal points; O(n log n). Inputs share a comparison cohort. */
export function paretoFrontier(
  rows: MonitoredSubmission[],
  x: Metric,
  y: Metric,
): Set<string> {
  const sorted = rows
    .filter(
      (s) =>
        s.passed && s.status === "complete" && s[x] !== null && s[y] !== null,
    )
    .sort((a, b) => a[x]! - b[x]! || a[y]! - b[y]!);
  const ids = new Set<string>();
  let bestY = Infinity;
  for (let i = 0; i < sorted.length;) {
    let end = i + 1;
    const first = sorted[i];
    while (end < sorted.length && sorted[end][x] === first[x]) end++;
    const minY = first[y]!;
    if (minY < bestY) {
      for (let j = i; j < end && sorted[j][y] === minY; j++)
        ids.add(sorted[j].id);
    }
    bestY = Math.min(bestY, minY);
    i = end;
  }
  return ids;
}
export function cohortKey(s: MonitoredSubmission) {
  return s.costProfile && s.costModel
    ? JSON.stringify([s.costProfile, s.costModel])
    : "";
}
