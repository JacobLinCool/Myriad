import { afterEach, expect, it, vi } from "vitest";
import { getDeviceId } from "../src/lib/device";

afterEach(() => vi.unstubAllGlobals());

function browserStorage() {
  const data = new Map<string, string>();
  let queue = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request(_: string, callback: () => string) {
        const result = queue.then(callback);
        queue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  return data;
}

it("keeps the same identity across concurrent requests and student switches", async () => {
  const data = browserStorage();
  const ids = await Promise.all([getDeviceId(), getDeviceId()]);
  expect(ids[0]).toBe(ids[1]);
  data.set("myriad_student_id", "another-student");
  expect(await getDeviceId()).toBe(ids[0]);
});

it("fails explicitly on corrupt or unavailable storage", async () => {
  const data = browserStorage();
  data.set("myriad_device_id", "invalid");
  await expect(getDeviceId()).rejects.toThrow();
  data.clear();
  localStorage.setItem = () => {
    throw new Error("Storage blocked");
  };
  await expect(getDeviceId()).rejects.toThrow("Storage blocked");
});
