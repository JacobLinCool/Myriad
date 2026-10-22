// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import type { AttemptSummary } from "@myriad/shared";
import confetti from "canvas-confetti";
import { prefersReducedMotion } from "svelte/motion";
import JudgePanel from "../src/lib/student/JudgePanel.svelte";
vi.mock("canvas-confetti", () => ({
  default: Object.assign(vi.fn(), { reset: vi.fn() }),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const base = {
  busy: false,
  diagnostics: "",
  engine: { state: "ready" as const },
  error: "",
  history: [],
  historyBusy: false,
  input: "",
  judgeError: "",
  last: null,
  loadHistory: vi.fn(async () => {}),
  output: "",
  panel: "judge" as const,
  panelOpen: true,
  pending: false,
  problem: { id: "p", title: "p", testCount: 4 } as never,
  progress: "",
  submit: vi.fn(async () => {}),
  verdicts: [] as { index: number; status: string }[],
};
it("judge progress sweeps while compiling, then counts received verdicts", () => {
  const view = render(JudgePanel, {
    session: { ...base, activity: "submit", progress: "正在編譯…" },
  });
  expect(
    screen.getByRole("progressbar", { name: "判題進度" }).classList,
  ).toContain("indeterminate");
  view.rerender({
    session: {
      ...base,
      activity: "submit",
      verdicts: [
        { index: 0, status: "AC" },
        { index: 1, status: "WA" },
      ],
    },
  });
  const bar = screen.getByRole("progressbar", { name: "判題進度" });
  expect(bar.classList).not.toContain("indeterminate");
  expect(bar.getAttribute("aria-valuenow")).toBe("2");
  expect(bar.style.getPropertyValue("--progress").trim()).toBe("0.5");
});
it("the saved score is exposed at its final value while the visual count runs", () => {
  render(JudgePanel, {
    session: {
      ...base,
      activity: null,
      last: { score: 0.75, verdicts: [] } as never,
      verdicts: [{ index: 0, status: "AC" }],
    },
  });
  expect(screen.getByText("已保存 · 75%").classList).toContain(
    "visually-hidden",
  );
});
it("shows saved resource measurements below the score", () => {
  const verdicts = Array.from({ length: 8 }, (_, index) => ({
    index,
    status: "AC" as const,
    metrics: {
      inputBytes: 2 ** (index + 1),
      instructionCost: 2 ** (index + 1),
      memoryBytes: 65536,
      costProfile: "same",
      costModel: "weighted",
    },
  }));
  render(JudgePanel, {
    session: {
      ...base,
      activity: null,
      last: { score: 1, verdicts } as never,
      verdicts,
    },
  });
  expect(screen.getByRole("region", { name: "執行資源" })).toBeTruthy();
  expect(screen.getByText("510")).toBeTruthy();
  expect(screen.getByText("64 KiB")).toBeTruthy();
});
it("shows semantic rejection without hiding the test results", () => {
  render(JudgePanel, {
    session: {
      ...base,
      activity: null,
      last: {
        score: 0,
        testScore: 1,
        verdicts: [{ index: 0, status: "AC" }],
        semanticCheck: {
          passed: false,
          reason: "未使用指標。",
          truncated: true,
        },
      } as never,
      verdicts: [{ index: 0, status: "AC" }],
    },
  });
  expect(screen.getByText("實作要求 · 未通過")).toBeTruthy();
  expect(screen.getByText("未使用指標。")).toBeTruthy();
  expect(screen.getByText("AC")).toBeTruthy();
  expect(screen.getByText(/測資得分 100%/)).toBeTruthy();
  expect(screen.getByText("僅檢查程式碼前 20,000 個字元。")).toBeTruthy();
});

const complete: AttemptSummary = {
  id: "attempt-1",
  examId: "exam",
  revision: "revision",
  problemId: "p",
  problemVersion: "version",
  studentId: "student",
  identityKind: "guest",
  participantId: "participant",
  status: "complete",
  createdAt: 0,
  verdicts: [{ index: 0, status: "AC" }],
  groupsPassed: 1,
  groupsTotal: 1,
  score: 1,
};
const semanticCheck = {
  passed: true,
  reason: "",
  model: "semantic-model",
  effort: "low" as const,
  checkedAt: 0,
  reviewedCharacters: 100,
  truncated: false,
};

it("waits for the final semantic score before celebrating from both screen edges", async () => {
  const pending = {
    ...base,
    activity: "submit" as const,
    pending: true,
    verdicts: Array.from({ length: 4 }, (_, index) => ({
      index,
      status: "AC",
    })),
    progress: "測資已保存，正在檢查實作要求…",
  };
  const view = render(JudgePanel, { session: pending });
  expect(confetti).not.toHaveBeenCalled();

  await view.rerender({
    session: {
      ...pending,
      pending: false,
      last: { ...complete, testScore: 1, semanticCheck },
    },
  });
  expect(confetti).toHaveBeenCalledTimes(2);
  expect(confetti).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      angle: 60,
      origin: { x: 0, y: 0.65 },
      disableForReducedMotion: true,
    }),
  );
  expect(confetti).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ angle: 120, origin: { x: 1, y: 0.65 } }),
  );
  view.unmount();
  expect(confetti.reset).toHaveBeenCalledOnce();
});

it.each([
  {
    ...complete,
    score: 0,
    testScore: 1,
    semanticCheck: { ...semanticCheck, passed: false },
  },
  { ...complete, score: 0.75 },
  { ...complete, score: 0.9999 },
  { ...complete, status: "running" as const },
  { ...complete, status: "failed" as const },
  { ...complete, status: "expired" as const },
])(
  "does not celebrate a $status result with final score $score",
  async (last) => {
    const view = render(JudgePanel, { session: { ...base, activity: null } });
    await view.rerender({ session: { ...base, activity: null, last } });
    expect(confetti).not.toHaveBeenCalled();
  },
);

it("celebrates each new perfect submission once, including problems without semantic checks", async () => {
  const saved = { ...base, activity: null, last: complete };
  const view = render(JudgePanel, { session: { ...base, activity: null } });
  await view.rerender({ session: saved });
  expect(confetti).toHaveBeenCalledTimes(2);
  await view.rerender({ session: { ...saved, panel: "history" } });
  await view.rerender({ session: saved });
  expect(confetti).toHaveBeenCalledTimes(2);

  await view.rerender({ session: { ...saved, last: null } });
  await view.rerender({ session: saved });
  expect(confetti).toHaveBeenCalledTimes(2);
  await view.rerender({
    session: { ...saved, last: { ...complete, id: "attempt-2" } },
  });
  expect(confetti).toHaveBeenCalledTimes(4);
});

it("does not replay a saved result when the panel remounts", () => {
  render(JudgePanel, { session: { ...base, activity: null, last: complete } });
  expect(confetti).not.toHaveBeenCalled();
});

it("respects reduced motion without replaying when that preference changes", async () => {
  const preference = vi
    .spyOn(prefersReducedMotion, "current", "get")
    .mockReturnValue(true);
  const view = render(JudgePanel, { session: { ...base, activity: null } });
  const saved = { ...base, activity: null, last: complete };
  await view.rerender({ session: saved });
  expect(confetti).not.toHaveBeenCalled();
  preference.mockReturnValue(false);
  await view.rerender({ session: { ...saved } });
  expect(confetti).not.toHaveBeenCalled();
});
