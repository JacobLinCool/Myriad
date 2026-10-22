// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import type { AuthProvider } from "@myriad/shared";
import IdentityDialog from "../src/lib/student/IdentityDialog.svelte";
import Teacher from "../src/lib/teacher/Teacher.svelte";
import { loginFailure, loginUrl } from "../src/lib/auth";

const providerCases: { name: string; providers: AuthProvider[] }[] = [
  { name: "NYCU only", providers: ["nycu"] },
  { name: "Google only", providers: ["google"] },
  { name: "both providers", providers: ["nycu", "google"] },
  { name: "guest only", providers: [] },
];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/exams");
});
it.each(providerCases)(
  "shows enabled student sign-in options: $name",
  async ({ providers }) => {
    const login = vi.fn();
    render(IdentityDialog, {
      session: {
        showIdentity: true,
        studentInput: "",
        student: "",
        studentLabel: "",
        identityKind: "guest",
        providers,
        authBusy: false,
        busy: false,
        useGuest: vi.fn(),
        login,
        error: "",
      },
    });
    for (const [provider, label] of [
      ["nycu", "NYCU"],
      ["google", "Google"],
    ] as const) {
      const button = screen.queryByRole("button", {
        name: `使用 ${label} 帳號登入`,
      });
      if (providers.includes(provider)) {
        expect(button).not.toBeNull();
        await fireEvent.click(button!);
        expect(login).toHaveBeenCalledWith(provider);
      } else expect(button).toBeNull();
    }
    expect(
      screen.getByRole("button", { name: "以訪客身分作答" }),
    ).not.toBeNull();
  },
);
it.each(providerCases)(
  "shows enabled teacher sign-in options: $name",
  async ({ providers }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              providers,
              account: null,
              canCreateExams: false,
              isAdmin: false,
            }),
            { status: 200 },
          ),
      ),
    );
    render(Teacher, {
      path: "/teacher",
      navigate: vi.fn(),
      onIdentityChange: vi.fn().mockResolvedValue(undefined),
    });
    await screen.findByLabelText("個人 API 憑證");
    for (const [provider, label] of [
      ["nycu", "NYCU"],
      ["google", "Google"],
    ] as const) {
      const link = screen.queryByRole("link", {
        name: `使用 ${label} 帳號登入`,
      });
      expect(link?.getAttribute("href") ?? null).toBe(
        providers.includes(provider) ? loginUrl(provider, "/teacher") : null,
      );
    }
  },
);
it("shows the Google display name with the immutable account subject", async () => {
  render(IdentityDialog, {
    session: {
      showIdentity: true,
      studentInput: "visitor",
      student: "google-stable-subject",
      studentLabel: "Student Name",
      identityKind: "google",
      providers: ["google"],
      authBusy: false,
      busy: false,
      useGuest: vi.fn(),
      login: vi.fn(),
      error: "",
    },
  });
  await waitFor(() =>
    expect(screen.getByText("Google · Student Name")).not.toBeNull(),
  );
  expect(screen.getByText("google-stable-subject")).not.toBeNull();
  expect((screen.getByLabelText("學號或名稱") as HTMLInputElement).value).toBe(
    "visitor",
  );
});
it("attributes callback failures to the provider and validates untrusted parameters", () => {
  expect(
    loginFailure(
      new URLSearchParams("auth_error=cancelled&auth_provider=google"),
    ),
  ).toMatchObject({
    provider: "google",
    reason: "cancelled",
    message: "已取消 Google 登入，請重新登入。",
  });
  const invalid = loginFailure(
    new URLSearchParams(
      "auth_error=origin&auth_provider=unknown&expected=javascript:alert(1)",
    ),
  );
  expect(invalid?.provider).toBeUndefined();
  expect(invalid?.message).toContain("本站正式網址");
  expect(invalid?.message).not.toContain("NYCU");
  expect(loginFailure(new URLSearchParams())).toBeNull();
});

it("refreshes the shared student identity after a Google teacher logs out", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (path: string) =>
        new Response(
          JSON.stringify(
            path === "/api/teacher/access"
              ? {
                  providers: ["google"],
                  account: {
                    id: "google:123",
                    provider: "google",
                    subject: "123",
                    name: "Teacher",
                    analyticsId: "google-analytics",
                  },
                  canCreateExams: false,
                  isAdmin: false,
                }
              : [],
          ),
          { status: 200 },
        ),
    ),
  );
  const onIdentityChange = vi.fn().mockResolvedValue(undefined);
  render(Teacher, { path: "/teacher", navigate: vi.fn(), onIdentityChange });
  await fireEvent.click(await screen.findByRole("button", { name: "登出" }));
  await waitFor(() => expect(onIdentityChange).toHaveBeenCalledOnce());
  expect(
    screen.getByRole("link", { name: "使用 Google 帳號登入" }),
  ).not.toBeNull();
});
