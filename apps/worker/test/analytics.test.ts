import { afterEach, expect, it, vi } from "vitest";
import app, { type Env } from "../src/index";
import { analyticsId } from "../src/analytics";
const env = {
  POSTHOG_KEY: "phc_test",
  POSTHOG_HOST: "https://us.i.posthog.com",
  ATTEMPT_SECRET: "x".repeat(32),
} as Env;
afterEach(() => vi.unstubAllGlobals());
it("does not proxy requests when analytics is disabled", async () => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await app.request(
    "/ingest/i/v0/e/",
    {},
    {
      ...env,
      POSTHOG_KEY: undefined,
    },
  );
  expect(response.status).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});
it("proxies PostHog through this origin without our cookies", async () => {
  const upstream = vi.fn(
    async (_url: URL, _init?: RequestInit) =>
      new Response("ok", { headers: { "set-cookie": "ph=1" } }),
  );
  vi.stubGlobal("fetch", upstream);
  const capture = await app.request(
    "/ingest/i/v0/e/?ip=0",
    {
      method: "POST",
      body: "{}",
      headers: {
        cookie: "myriad_student=secret",
        authorization: "Bearer private-token",
        "CF-Connecting-IP": "1.2.3.4",
      },
    },
    env,
  );
  const asset = await app.request("/ingest/static/recorder.js", {}, env);
  expect(capture.headers.get("set-cookie")).toBeNull();
  expect(asset.status).toBe(200);
  const [[captureUrl, captureInit], [assetUrl]] = upstream.mock.calls;
  expect(String(captureUrl)).toBe("https://us.i.posthog.com/i/v0/e/?ip=0");
  const headers = new Headers(captureInit!.headers);
  expect(headers.get("cookie")).toBeNull();
  expect(headers.get("authorization")).toBeNull();
  expect(headers.get("x-forwarded-for")).toBe("1.2.3.4");
  expect(String(assetUrl)).toBe(
    "https://us-assets.i.posthog.com/static/recorder.js",
  );
});
it("keeps network-path references on the configured analytics host", async () => {
  const upstream = vi.fn(async (_url: URL) => new Response("ok"));
  vi.stubGlobal("fetch", upstream);
  const response = await app.request(
    "/ingest//other.example/path?test=1",
    {},
    env,
  );
  expect(response.status).toBe(200);
  expect(String(upstream.mock.calls[0][0])).toBe(
    "https://us.i.posthog.com//other.example/path?test=1",
  );
});
it("derives stable pseudonyms that do not reveal the subject", async () => {
  const id = await analyticsId(env, "nycu", "110550001");
  expect(id).toMatch(/^u_[0-9a-f]{32}$/);
  expect(id).not.toContain("110550001");
  expect(await analyticsId(env, "nycu", "110550001")).toBe(id);
  expect(await analyticsId(env, "guest", "110550001")).not.toBe(id);
  expect(
    await analyticsId(
      { ...env, ATTEMPT_SECRET: "y".repeat(32) },
      "nycu",
      "110550001",
    ),
  ).not.toBe(id);
});
