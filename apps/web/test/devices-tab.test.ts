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
      deviceId: "a1234567-1234-4123-8123-123456789abc",
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
      deviceId: "b1234567-1234-4123-8123-123456789abc",
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
  const table = (await screen.findByText("b1234567")).closest("table")!;
  expect(table.closest(".ph-no-capture")).not.toBeNull();
  expect(screen.getByText("203.0.113.1")).toBeTruthy();
  expect(screen.getByText("203.0.113.2")).toBeTruthy();
  const device = screen.getByText("b1234567").closest("details")!;
  expect(device.open).toBe(false);
  expect(device.textContent).toContain("b1234567-1234-4123-8123-123456789abc");
  expect(table.textContent).toContain("Firefox/140");
  expect(table.textContent).toContain("共 2 種 User-Agent，顯示其中一種");
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
