// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import JudgePanel from "../src/lib/student/JudgePanel.svelte";
afterEach(cleanup);
const base = {
  busy: false,
  diagnostics: "",
  engine: { state: "ready" as const },
  error: "",
  history: [],
  historyBusy: false,
  input: "",
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
      last: { score: 0.75 } as never,
      verdicts: [{ index: 0, status: "AC" }],
    },
  });
  expect(screen.getByText("已保存 · 75%").classList).toContain(
    "visually-hidden",
  );
});
