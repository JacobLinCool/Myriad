// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import SubmissionMonitor from "../src/lib/teacher/SubmissionMonitor.svelte";
import type { Analysis, ExamDetail } from "../src/lib/teacher/data";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const detail: ExamDetail = {
  ownerId: "owner",
  canManageMembers: true,
  id: "e",
  title: "Exam",
  startsAt: 1,
  endsAt: 2,
  rules: "",
  policy: "best",
  status: "ended",
  revision: "r",
  publishedAt: 1,
  problems: [
    {
      id: "p",
      title: "Problem",
      version: "v",
      order: 0,
      testCount: 1,
      groups: 1,
    },
    {
      id: "q",
      title: "Other",
      version: "qv",
      order: 1,
      testCount: 1,
      groups: 1,
    },
  ],
};
const analysis: Analysis = {
  updatedAt: 1,
  totals: { attempts: 2, students: 1, completed: 2 },
  devices: [],
  timings: [],
  submissions: [1, 2].map((i) => ({
    id: `s${i}`,
    sequence: i,
    studentId: "Student",
    participantId: "guest:Student",
    identityKind: "guest",
    problemId: "p",
    problemVersion: "v",
    status: "complete",
    score: 1,
    passed: true,
    createdAt: 1,
    testsReported: 1,
    codeBytes: 100,
    instructionCost: i,
    memoryBytes: 100 / i,
    costProfile: "profile",
    costModel: "model",
  })),
};
it("shows unsubmitted problems and safely switches source selection while requests overlap", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  let resolveFirst!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("s1")
        ? new Promise<Response>((r) => (resolveFirst = r))
        : Promise.resolve(Response.json({ code: "second source" })),
    ),
  );
  render(SubmissionMonitor, { props: { detail, analysis } });
  expect(screen.getByText("未繳交")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "#1 · Student" }));
  await fireEvent.click(screen.getByRole("button", { name: "#2 · Student" }));
  await waitFor(() => expect(screen.getByText("second source")).toBeTruthy());
  expect(document.activeElement?.textContent).toContain("#2");
  await fireEvent.click(screen.getByRole("button", { name: "關閉程式碼" }));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "#2 · Student" }),
  );
  resolveFirst(Response.json({ code: "stale source" }));
  await Promise.resolve();
  expect(screen.queryByText("stale source")).toBeNull();
  await fireEvent.input(screen.getByLabelText("搜尋學號"), {
    target: { value: "missing" },
  });
  expect(screen.getByText("沒有符合的學生。")).toBeTruthy();
  expect(screen.getByText("沒有符合篩選的提交。")).toBeTruthy();
});
