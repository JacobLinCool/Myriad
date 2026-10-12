// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import PermissionEditor from "../src/lib/teacher/PermissionEditor.svelte";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("validates provider identities and submits an exam-scoped invitation", async () => {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify([]), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(PermissionEditor, { scope: "exam", examId: "exam-one" });
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  const provider = screen.getByLabelText("登入服務") as HTMLInputElement;
  const subject = screen.getByLabelText("帳號識別") as HTMLInputElement;
  await fireEvent.input(subject, { target: { value: "assistant" } });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "邀請共同管理", hidden: true })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(provider.checkValidity()).toBe(true);
  for (const value of ["Invalid", "bad provider", "a".repeat(65)]) {
    await fireEvent.input(provider, { target: { value } });
    expect(provider.checkValidity()).toBe(false);
  }
  await fireEvent.input(provider, { target: { value: "nycu" } });
  expect(provider.checkValidity()).toBe(true);
  await fireEvent.submit(provider.form!);
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/teacher/exams/exam-one/members",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ provider: "nycu", subject: "assistant" }),
      }),
    ),
  );
});
