// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { tick } from "svelte";
import Select from "../src/lib/ui/Select.svelte";
import SplitPane from "../src/lib/ui/SplitPane.svelte";
import Controls from "./fixtures/Controls.svelte";
afterEach(cleanup);
const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Bravo" },
];
it("select supports keyboard navigation, selection, dismissal and repeated-letter search", async () => {
  const user = userEvent.setup(),
    change = vi.fn();
  render(Select, { label: "考試", options, value: "a", onchange: change });
  const trigger = screen.getByRole("combobox", { name: "考試" });
  trigger.focus();
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(change).toHaveBeenCalledWith("b");
  expect(document.activeElement).toBe(trigger);
  expect(screen.queryByRole("listbox")).toBeNull();
  await user.keyboard("bb{Enter}");
  expect(change).toHaveBeenLastCalledWith("c");
  await user.click(trigger);
  await user.keyboard("{Escape}");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await user.click(trigger);
  await user.keyboard("{Tab}");
  expect(screen.queryByRole("listbox")).toBeNull();
});
it("select reconciles changed options and disabled state while open", async () => {
  const user = userEvent.setup(),
    change = vi.fn();
  const view = render(Select, {
    label: "考試",
    options,
    value: "b",
    onchange: change,
  });
  const trigger = screen.getByRole("combobox");
  await user.click(trigger);
  await view.rerender({ options: [options[0]], value: "a" });
  await tick();
  const active = trigger.getAttribute("aria-activedescendant");
  expect(active && document.getElementById(active)?.textContent).toContain(
    "Alpha",
  );
  await view.rerender({ disabled: true });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(trigger.hasAttribute("disabled")).toBe(true);
});
it("select popup stays within the viewport and closes on outside click", async () => {
  const user = userEvent.setup();
  render(Select, { label: "考試", options, onchange: vi.fn() });
  const trigger = screen.getByRole("combobox");
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
    left: 950,
    right: 1150,
    top: 730,
    bottom: 770,
    width: 200,
    height: 40,
    x: 950,
    y: 730,
    toJSON() {},
  });
  await user.click(trigger);
  const popup = screen.getByRole("listbox");
  expect(
    parseFloat(popup.style.left) + parseFloat(popup.style.width),
  ).toBeLessThanOrEqual(window.innerWidth - 8);
  expect(parseFloat(popup.style.top)).toBeLessThan(730);
  await user.click(document.body);
  expect(screen.queryByRole("listbox")).toBeNull();
});
it("tabs expose selected panel and support roving keyboard focus", async () => {
  const user = userEvent.setup();
  render(Controls);
  const first = screen.getByRole("tab", { name: "第一頁" });
  first.focus();
  await user.keyboard("{ArrowRight}");
  expect(
    screen.getByRole("tab", { name: "第二頁" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.getByRole("tabpanel").textContent).toContain("第二頁內容");
  expect(first.tabIndex).toBe(-1);
  await user.keyboard("{Home}");
  expect(document.activeElement).toBe(first);
});
it("dialog restores focus and disclosure exposes content using native button keys", async () => {
  const user = userEvent.setup();
  render(Controls);
  const trigger = screen.getByRole("button", { name: "開啟設定" });
  await user.click(trigger);
  expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "完成" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  const disclosure = screen.getByRole("button", { name: "詳細資料" });
  expect(screen.queryByRole("region", { name: "詳細資料" })).toBeNull();
  disclosure.focus();
  await user.keyboard("{Enter}");
  expect(
    screen.getByRole("region", { name: "詳細資料" }).textContent,
  ).toContain("報告內容");
  await user.click(trigger);
  await fireEvent(screen.getByRole("dialog"), new Event("cancel"));
  await tick();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("splitter clamps pointer values and stops updating after cancellation", async () => {
  const change = vi.fn();
  const { container } = render(SplitPane, {
    label: "調整高度",
    value: 40,
    onchange: change,
  });
  const slider = screen.getByRole("slider");
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    top: 100,
    height: 400,
    left: 0,
    right: 400,
    bottom: 500,
    width: 400,
    x: 0,
    y: 100,
    toJSON() {},
  });
  function pointer(type: string, y: number) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, clientY: y });
    return fireEvent(slider, event);
  }
  await pointer("pointerdown", 200);
  await pointer("pointermove", 600);
  expect(change).toHaveBeenLastCalledWith(75);
  await pointer("pointercancel", 600);
  await pointer("pointermove", 100);
  expect(change).toHaveBeenCalledTimes(1);
  await fireEvent.input(slider, { target: { value: "30" } });
  expect(change).toHaveBeenLastCalledWith(30);
});
it("exam settings form sends only changed fields and keeps untouched times exact", async () => {
  const { default: ExamDetail } =
    await import("../src/lib/teacher/ExamDetail.svelte");
  const user = userEvent.setup(),
    onsave = vi.fn(async () => true);
  const startsAt = new Date(2026, 9, 8, 9, 30, 13).getTime();
  render(ExamDetail, {
    detail: {
      id: "e",
      title: "考試",
      startsAt,
      endsAt: startsAt + 3600000,
      rules: "舊說明",
      policy: "best",
      status: "upcoming",
      revision: "a".repeat(64),
      publishedAt: startsAt - 1000,
      problems: [],
    },
    saving: false,
    onsave,
  });
  await user.click(screen.getByRole("button", { name: "編輯考試資訊" }));
  await user.clear(screen.getByLabelText("考試說明"));
  await user.type(screen.getByLabelText("考試說明"), "新說明");
  await user.click(screen.getByRole("button", { name: "儲存" }));
  expect(onsave).toHaveBeenCalledWith({ rules: "新說明" });
});
