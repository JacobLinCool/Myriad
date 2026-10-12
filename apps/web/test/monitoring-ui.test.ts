// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import SubmissionsTab from "../src/lib/teacher/SubmissionsTab.svelte";
import StudentsTab from "../src/lib/teacher/StudentsTab.svelte";
import type {
  ExamDetail,
  ProblemSubmissions,
  StudentPage,
} from "../src/lib/teacher/data";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});
// Tabs only read the refresh counter from the teacher session.
const session = { refreshKey: 0 } as any;
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
const problem: ProblemSubmissions = {
  updatedAt: 1,
  version: "v",
  currentVersion: "v",
  versions: [{ version: "v", submissions: 2 }],
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
it("loads one problem's submissions and safely switches source selection while requests overlap", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  let resolveFirst!: (r: Response) => void;
  const fetch = vi.fn((url: string) =>
    url.includes("/problems/")
      ? Promise.resolve(Response.json(problem))
      : url.endsWith("s1")
        ? new Promise<Response>((r) => (resolveFirst = r))
        : Promise.resolve(Response.json({ code: "second source" })),
  );
  vi.stubGlobal("fetch", fetch);
  render(SubmissionsTab, { props: { session, detail } });
  await fireEvent.click(
    await screen.findByRole("button", { name: "#1 · Student" }),
  );
  expect(fetch.mock.calls[0][0]).toBe(
    "/api/teacher/exams/e/problems/p/submissions?version=v",
  );
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
  expect(screen.getByText("沒有符合篩選的提交。")).toBeTruthy();
});
it("opens a linked problem and submission from the address", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  history.replaceState(
    null,
    "",
    "/teacher/exams/e/submissions?problem=p&submission=s2",
  );
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      Response.json(
        url.includes("/problems/") ? problem : { code: "linked source" },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(SubmissionsTab, { props: { session, detail } });
  await waitFor(() => expect(screen.getByText("linked source")).toBeTruthy());
  expect(fetch.mock.calls.map(([url]) => url)).toContain(
    "/api/teacher/exams/e/submissions/s2",
  );
});
const students: StudentPage = {
  updatedAt: 1,
  total: 1,
  offset: 0,
  pageSize: 50,
  students: [
    {
      participantId: "guest:Student",
      studentId: "Student",
      identityKind: "guest",
      cells: {
        p: {
          attempts: 2,
          latest: {
            id: "s2",
            status: "complete",
            score: 1,
            passed: true,
            testsReported: 1,
          },
          selected: { score: 1, passed: true },
        },
      },
    },
  ],
};
it("shows unsubmitted problems, links cells to their source and searches on the server", async () => {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      Response.json(
        url.includes("q=missing")
          ? { ...students, total: 0, students: [] }
          : students,
      ),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const navigate = vi.fn();
  render(StudentsTab, { props: { session, detail, navigate } });
  const cell = await screen.findByRole("link", { name: /已通過/ });
  expect(cell.getAttribute("href")).toBe(
    "/teacher/exams/e/submissions?problem=p&submission=s2",
  );
  expect(screen.getByText("2 次 · 採計 100% · 通過")).toBeTruthy();
  expect(screen.getByText("未繳交")).toBeTruthy();
  await fireEvent.click(cell);
  expect(navigate).toHaveBeenCalledWith(
    "/teacher/exams/e/submissions?problem=p&submission=s2",
  );
  await fireEvent.input(screen.getByLabelText("搜尋學號"), {
    target: { value: "missing" },
  });
  await waitFor(() =>
    expect(screen.getByText("沒有符合的學生。")).toBeTruthy(),
  );
  expect(fetch.mock.calls.at(-1)![0]).toBe(
    "/api/teacher/exams/e/students?q=missing&offset=0",
  );
});
