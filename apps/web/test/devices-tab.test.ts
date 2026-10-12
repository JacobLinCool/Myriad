// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import DevicesTab from "../src/lib/teacher/DevicesTab.svelte";
import type { DeviceLinks, ExamDetail } from "../src/lib/teacher/data";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const links: DeviceLinks = {
  updatedAt: 1,
  devices: [],
  identities: [
    {
      studentId: "110550001",
      identityKind: "nycu",
      deviceId: "device-a",
      submissions: 2,
      firstSeenAt: 1,
      lastSeenAt: 2,
      ips: "203.0.113.1,203.0.113.2",
      userAgents: 2,
      userAgent: "Firefox/140",
    },
    {
      studentId: "110550001",
      identityKind: "nycu",
      deviceId: "device-b",
      submissions: 1,
      firstSeenAt: 3,
      lastSeenAt: 3,
      ips: null,
      userAgents: 0,
      userAgent: null,
    },
  ],
};
it("loads device links and performance separately, keeping identities out of recordings", async () => {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      Response.json(
        url.endsWith("/devices") ? links : { updatedAt: 1, timings: [] },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(DevicesTab, {
    props: {
      session: { refreshKey: 0 } as any,
      detail: { id: "e" } as ExamDetail,
    },
  });
  const table = (await screen.findByText("device-b")).closest("table")!;
  expect(table.closest(".ph-no-capture")).not.toBeNull();
  expect(table.textContent).toContain("203.0.113.1,203.0.113.2");
  expect(table.textContent).toContain("Firefox/140（另有 1 種瀏覽器）");
  expect(table.textContent).toContain("—");
  await waitFor(() =>
    expect(
      screen.getByText("學生開始操作後，效能統計會顯示在這裡。"),
    ).toBeTruthy(),
  );
  expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual([
    "/api/teacher/exams/e/devices",
    "/api/teacher/exams/e/performance",
  ]);
});
